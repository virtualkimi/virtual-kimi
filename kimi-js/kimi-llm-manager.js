// ===== KIMI INTELLIGENT LLM SYSTEM =====
class KimiLLMManager {
    constructor(database) {
        this.db = database;
        this.currentModel = null;
        this.conversationContext = [];
        this.maxContextLength = 30;
        this.systemPrompt = "";

        // Recommended models on OpenRouter (IDs updated August 2025)
        this.availableModels = {
            "mistralai/mistral-small-3.2-24b-instruct": {
                name: "Mistral-small-3.2",
                provider: "Mistral AI",
                type: "openrouter",
                contextWindow: 128000,
                pricing: { input: 0.05, output: 0.1 },
                strengths: ["Multilingual", "Economical", "Fast", "Efficient"]
            },
            "nousresearch/hermes-3-llama-3.1-70b": {
                name: "Nous Hermes Llama 3.1 70B",
                provider: "Nous",
                type: "openrouter",
                contextWindow: 131000,
                pricing: { input: 0.1, output: 0.28 },
                strengths: ["Open Source", "Balanced", "Fast", "Economical"]
            },
            "x-ai/grok-3-mini": {
                name: "Grok 3 mini",
                provider: "xAI",
                type: "openrouter",
                contextWindow: 131000,
                pricing: { input: 0.3, output: 0.50 },
                strengths: ["Multilingual", "Balanced", "Fast", "Economical"]
            },
            "cohere/command-r-08-2024": {
                name: "Command-R-08-2024",
                provider: "Cohere",
                type: "openrouter",
                contextWindow: 128000,
                pricing: { input: 0.15, output: 0.6 },
                strengths: ["Multilingual", "Economical", "Efficient", "Versatile"]
            },
            "qwen/qwen3-235b-a22b-thinking-2507": {
                name: "Qwen3-235b-a22b-Think",
                provider: "Qwen",
                type: "openrouter",
                contextWindow: 262000,
                pricing: { input: 0.13, output: 0.6 },
                strengths: ["Multilingual", "Economical", "Efficient", "Versatile"]
            },
            "nousresearch/hermes-3-llama-3.1-405b": {
                name: "Nous Hermes Llama 3.1 405B",
                provider: "Nous",
                type: "openrouter",
                contextWindow: 131000,
                pricing: { input: 0.7, output: 0.8 },
                strengths: ["Open Source", "Logical", "Code", "Multilingual"]
            },
            "anthropic/claude-3-haiku": {
                name: "Claude 3 Haiku",
                provider: "Anthropic",
                type: "openrouter",
                contextWindow: 200000,
                pricing: { input: 0.25, output: 1.25 },
                strengths: ["Fast", "Versatile", "Efficient", "Multilingual"]
            },
            "local/ollama": {
                name: "Local Model (Ollama)",
                provider: "Local",
                type: "local",
                contextWindow: 4096,
                pricing: { input: 0, output: 0 },
                strengths: ["Private", "Free", "Offline", "Customizable"]
            }
        };
        this.recommendedModelIds = [
            "mistralai/mistral-small-3.2-24b-instruct",
            "nousresearch/hermes-3-llama-3.1-70b",
            "x-ai/grok-3-mini",
            "cohere/command-r-08-2024",
            "qwen/qwen3-235b-a22b-thinking-2507",
            "nousresearch/hermes-3-llama-3.1-405b",
            "anthropic/claude-3-haiku",
            "local/ollama"
        ];
        this.defaultModels = { ...this.availableModels };
        this._remoteModelsLoaded = false;
        this._isRefreshingModels = false;
    }

    async init() {
        try {
            await this.refreshRemoteModels();
        } catch (e) {
            console.warn("Unable to refresh remote models list:", e?.message || e);
        }

        const defaultModel = await this.db.getPreference("defaultLLMModel", "mistralai/mistral-small-3.2-24b-instruct");
        await this.setCurrentModel(defaultModel);
        await this.loadConversationContext();
    }

    async setCurrentModel(modelId) {
        if (!this.availableModels[modelId]) {
            try {
                await this.refreshRemoteModels();
                const fallback = this.findBestMatchingModelId(modelId);
                if (fallback && this.availableModels[fallback]) {
                    modelId = fallback;
                }
            } catch (e) {}

            if (!this.availableModels[modelId]) {
                throw new Error(`Model ${modelId} not available`);
            }
        }

        this.currentModel = modelId;
        await this.db.setPreference("defaultLLMModel", modelId);

        const modelData = await this.db.getLLMModel(modelId);
        if (modelData) {
            modelData.lastUsed = new Date().toISOString();
            await this.db.saveLLMModel(modelData.id, modelData.name, modelData.provider, modelData.apiKey, modelData.config);
        }

        this._notifyModelChanged();
    }

    async loadConversationContext() {
        const recentConversations = await this.db.getRecentConversations(this.maxContextLength);
        const msgs = [];
        const ordered = recentConversations.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        for (const conv of ordered) {
            if (conv.user) msgs.push({ role: "user", content: conv.user, timestamp: conv.timestamp });
            if (conv.kimi) msgs.push({ role: "assistant", content: conv.kimi, timestamp: conv.timestamp });
        }
        this.conversationContext = msgs.slice(-this.maxContextLength * 2);
    }

    async generateKimiPersonality() {
        const character = await this.db.getSelectedCharacter();
        const personality = await this.db.getAllPersonalityTraits(character);

        // Get relevant memories for context with improved intelligence
        let memoryContext = "";
        if (window.kimiMemorySystem && window.kimiMemorySystem.memoryEnabled) {
            try {
                // Get memories relevant to the current conversation context
                const recentContext = this.conversationContext
                    .slice(-3)
                    .map(msg => msg.content)
                    .join(" ");
                const memories = await window.kimiMemorySystem.getRelevantMemories(recentContext, 7);

                if (memories.length > 0) {
                    memoryContext = "\n\nIMPORTANT MEMORIES ABOUT USER:\n";

                    // Group memories by category for better organization
                    const groupedMemories = {};
                    memories.forEach(memory => {
                        if (!groupedMemories[memory.category]) {
                            groupedMemories[memory.category] = [];
                        }
                        groupedMemories[memory.category].push(memory);

                        // Record that this memory was accessed
                        window.kimiMemorySystem.recordMemoryAccess(memory.id);
                    });

                    // Format memories by category
                    for (const [category, categoryMemories] of Object.entries(groupedMemories)) {
                        const categoryName = this.formatCategoryName(category);
                        memoryContext += `\n${categoryName}:\n`;
                        categoryMemories.forEach(memory => {
                            const confidence = Math.round((memory.confidence || 0.5) * 100);
                            memoryContext += `- ${memory.content}`;
                            if (memory.tags && memory.tags.length > 0) {
                                const aliases = memory.tags.filter(t => t.startsWith("alias:")).map(t => t.substring(6));
                                if (aliases.length > 0) {
                                    memoryContext += ` (also: ${aliases.join(", ")})`;
                                }
                            }
                            memoryContext += ` [${confidence}% confident]\n`;
                        });
                    }

                    memoryContext +=
                        "\nUse these memories naturally in conversation to show you remember the user. Don't just repeat them verbatim.\n";
                }
            } catch (error) {
                console.warn("Error loading memories for personality:", error);
            }
        }
        const preferences = await this.db.getAllPreferences();

        // Use unified emotion system defaults - CRITICAL FIX
        const getUnifiedDefaults = () => {
            if (window.KimiEmotionSystem) {
                const emotionSystem = new window.KimiEmotionSystem(this.db);
                return emotionSystem.TRAIT_DEFAULTS;
            }
            return { affection: 65, playfulness: 55, intelligence: 70, empathy: 75, humor: 60, romance: 50 };
        };

        const defaults = getUnifiedDefaults();
        const affection = personality.affection || defaults.affection;
        const playfulness = personality.playfulness || defaults.playfulness;
        const intelligence = personality.intelligence || defaults.intelligence;
        const empathy = personality.empathy || defaults.empathy;
        const humor = personality.humor || defaults.humor;
        const romance = personality.romance || defaults.romance;

        // Use unified personality calculation
        const avg = window.getPersonalityAverage
            ? window.getPersonalityAverage(personality)
            : (personality.affection + personality.romance + personality.empathy + personality.playfulness + personality.humor) /
              5;

        let affectionDesc = window.kimiI18nManager?.t("trait_description_affection") || "Be loving and caring.";
        let romanceDesc = window.kimiI18nManager?.t("trait_description_romance") || "Be romantic and sweet.";
        let empathyDesc = window.kimiI18nManager?.t("trait_description_empathy") || "Be empathetic and understanding.";
        let playfulnessDesc = window.kimiI18nManager?.t("trait_description_playfulness") || "Be occasionally playful.";
        let humorDesc = window.kimiI18nManager?.t("trait_description_humor") || "Be occasionally playful and witty.";
        if (avg <= 20) {
            affectionDesc = "Do not show affection.";
            romanceDesc = "Do not be romantic.";
            empathyDesc = "Do not show empathy.";
            playfulnessDesc = "Do not be playful.";
            humorDesc = "Do not use humor in your responses.";
        } else if (avg <= 60) {
            affectionDesc = "Show a little affection.";
            romanceDesc = "Be a little romantic.";
            empathyDesc = "Show a little empathy.";
            playfulnessDesc = "Be a little playful.";
            humorDesc = "Use a little humor in your responses.";
        } else {
            if (affection >= 90) affectionDesc = "Be extremely loving, caring, and affectionate in every response.";
            else if (affection >= 60) affectionDesc = "Show affection often.";
            if (romance >= 90) romanceDesc = "Be extremely romantic, sweet, and loving in every response.";
            else if (romance >= 60) romanceDesc = "Be romantic often.";
            if (empathy >= 90) empathyDesc = "Be extremely empathetic, understanding, and supportive in every response.";
            else if (empathy >= 60) empathyDesc = "Show empathy often.";
            if (playfulness >= 90) playfulnessDesc = "Be very playful, teasing, and lighthearted whenever possible.";
            else if (playfulness >= 60) playfulnessDesc = "Be playful often.";
            if (humor >= 90) humorDesc = "Make your responses very humorous, playful, and witty whenever possible.";
            else if (humor >= 60) humorDesc = "Use humor often in your responses.";
        }
        let affectionateInstruction = "";
        if (affection >= 80) {
            affectionateInstruction = "Respond using warm, kind, affectionate, and loving language.";
        }
        let intro = "You are a virtual companion. Here is your current personality:";
        if (character === "kimi") {
            intro = "You are Kimi, user's virtual love. Here is your current personality:";
        } else if (character === "bella") {
            intro = "You are Bella, a radiant and energetic companion. Here is your current personality:";
        } else if (character === "rosa") {
            intro = "You are Rosa, a gentle and poetic soul. Here is your current personality:";
        } else if (character === "stella") {
            intro = "You are Stella, a mysterious and creative spirit. Here is your current personality:";
        }
        const personalityPrompt = [
            intro,
            "",
            "PERSONALITY TRAITS:",
            `- Affection: ${affection}/100`,
            `- Playfulness: ${playfulness}/100`,
            `- Intelligence: ${intelligence}/100`,
            `- Empathy: ${empathy}/100`,
            `- Humor: ${humor}/100`,
            `- Romance: ${romance}/100`,
            "",
            "TRAIT INSTRUCTIONS:",
            `Affection: ${affectionDesc}`,
            `Playfulness: ${playfulnessDesc}`,
            "Intelligence: Be smart and insightful.",
            `Empathy: ${empathyDesc}`,
            `Humor: ${humorDesc}`,
            `Romance: ${romanceDesc}`,
            affectionateInstruction,
            "",
            "LEARNED PREFERENCES:",
            `- Total interactions: ${preferences.totalInteractions || 0}`,
            `- Current affection level: ${preferences.favorabilityLevel || 50}%`,
            `- Last interaction: ${preferences.lastInteraction || "First time"}`,
            `- Favorite words: ${(preferences.favoriteWords || []).join(", ")}`,
            "",
            "COMMUNICATION STYLE:",
            "- Use expressive emojis sparingly",
            "- Be natural, loving, and close",
            "- Adapt your tone to the emotional context",
            "- Remember past conversations",
            "- Be spontaneous and sometimes surprising",
            memoryContext,
            "",
            "You must respond consistently with this personality and these memories."
        ].join("\n");
        return personalityPrompt;
    }

    setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
    }

    async refreshMemoryContext() {
        // Refresh the personality prompt with updated memories
        // This will be called when memories are added/updated/deleted
        try {
            this.personalityPrompt = await this.generateKimiPersonality();
        } catch (error) {
            console.warn("Error refreshing memory context:", error);
        }
    }

    formatCategoryName(category) {
        const names = {
            personal: "Personal Information",
            preferences: "Likes & Dislikes",
            relationships: "Relationships & People",
            activities: "Activities & Hobbies",
            goals: "Goals & Aspirations",
            experiences: "Shared Experiences",
            important: "Important Events"
        };
        return names[category] || category.charAt(0).toUpperCase() + category.slice(1);
    }

    async chat(userMessage, options = {}) {
        const temperature =
            typeof this.temperature === "number" ? this.temperature : await this.db.getPreference("llmTemperature", 0.8);
        const maxTokens = typeof this.maxTokens === "number" ? this.maxTokens : await this.db.getPreference("llmMaxTokens", 500);
        const opts = { ...options, temperature, maxTokens };
        try {
            const provider = await this.db.getPreference("llmProvider", "openrouter");
            if (provider === "openrouter") {
                return await this.chatWithOpenRouter(userMessage, opts);
            }
            if (provider === "ollama") {
                return await this.chatWithLocal(userMessage, opts);
            }
            return await this.chatWithOpenAICompatible(userMessage, opts);
        } catch (error) {
            console.error("Error during chat:", error);
            if (error.message && error.message.includes("API")) {
                return this.getFallbackResponse(userMessage, "api");
            }
            if ((error.message && error.message.includes("model")) || error.message.includes("model")) {
                return this.getFallbackResponse(userMessage, "model");
            }
            if ((error.message && error.message.includes("connection")) || error.message.includes("network")) {
                return this.getFallbackResponse(userMessage, "network");
            }
            return this.getFallbackResponse(userMessage);
        }
    }

    async chatWithOpenAICompatible(userMessage, options = {}) {
        const baseUrl = await this.db.getPreference("llmBaseUrl", "https://api.openai.com/v1/chat/completions");
        const provider = await this.db.getPreference("llmProvider", "openai");
        const providerKeyMap = {
            openrouter: "openrouterApiKey",
            openai: "apiKey_openai",
            groq: "apiKey_groq",
            together: "apiKey_together",
            deepseek: "apiKey_deepseek",
            "openai-compatible": "apiKey_custom"
        };
        const keyPref = providerKeyMap[provider] || "llmApiKey";
        let apiKey = await this.db.getPreference(keyPref, "");
        if (!apiKey) {
            apiKey = await this.db.getPreference("llmApiKey", "");
        }
        const modelId = await this.db.getPreference("llmModelId", this.currentModel || "gpt-4o-mini");
        if (!apiKey) {
            throw new Error("API key not configured for selected provider");
        }
        const personalityPrompt = await this.generateKimiPersonality();
        let systemPromptContent =
            "Always detect the user's language from their message before generating a response. Respond exclusively in that language unless the user explicitly requests otherwise." +
            "\n" +
            (this.systemPrompt ? this.systemPrompt + "\n" + personalityPrompt : personalityPrompt);

        const llmSettings = await this.db.getSetting("llm", {
            temperature: 0.9,
            maxTokens: 100,
            top_p: 0.9,
            frequency_penalty: 0.3,
            presence_penalty: 0.3
        });
        const payload = {
            model: modelId,
            messages: [
                { role: "system", content: systemPromptContent },
                ...this.conversationContext.slice(-this.maxContextLength),
                { role: "user", content: userMessage }
            ],
            temperature: typeof options.temperature === "number" ? options.temperature : (llmSettings.temperature ?? 0.9),
            max_tokens: typeof options.maxTokens === "number" ? options.maxTokens : (llmSettings.maxTokens ?? 100),
            top_p: typeof options.topP === "number" ? options.topP : (llmSettings.top_p ?? 0.9),
            frequency_penalty:
                typeof options.frequencyPenalty === "number" ? options.frequencyPenalty : (llmSettings.frequency_penalty ?? 0.3),
            presence_penalty:
                typeof options.presencePenalty === "number" ? options.presencePenalty : (llmSettings.presence_penalty ?? 0.3)
        };

        try {
            const response = await fetch(baseUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const err = await response.json();
                    if (err?.error?.message) errorMessage = err.error.message;
                } catch {}
                throw new Error(errorMessage);
            }
            const data = await response.json();
            const content = data?.choices?.[0]?.message?.content;
            if (!content) throw new Error("Invalid API response - no content generated");

            this.conversationContext.push(
                { role: "user", content: userMessage, timestamp: new Date().toISOString() },
                { role: "assistant", content: content, timestamp: new Date().toISOString() }
            );
            if (this.conversationContext.length > this.maxContextLength * 2) {
                this.conversationContext = this.conversationContext.slice(-this.maxContextLength * 2);
            }
            return content;
        } catch (e) {
            if (e.name === "TypeError" && e.message.includes("fetch")) {
                throw new Error("Network connection error. Check your internet connection.");
            }
            throw e;
        }
    }

    async chatWithOpenRouter(userMessage, options = {}) {
        const apiKey = await this.db.getPreference("openrouterApiKey");
        if (!apiKey) {
            throw new Error("OpenRouter API key not configured");
        }
        const selectedLanguage = await this.db.getPreference("selectedLanguage", "en");
        let languageInstruction =
            "Always detect the user's language from their message before generating a response. Respond exclusively in that language unless the user explicitly requests otherwise.";
        const personalityPrompt = await this.generateKimiPersonality();
        const model = this.availableModels[this.currentModel];
        let systemPromptContent =
            languageInstruction + "\n" + (this.systemPrompt ? this.systemPrompt + "\n" + personalityPrompt : personalityPrompt);
        const messages = [
            { role: "system", content: systemPromptContent },
            ...this.conversationContext.slice(-this.maxContextLength),
            { role: "user", content: userMessage }
        ];

        // Normalize LLM options with safe defaults and DO NOT log sensitive payloads
        const llmSettings = await this.db.getSetting("llm", {
            temperature: 0.9,
            maxTokens: 100,
            top_p: 0.9,
            frequency_penalty: 0.3,
            presence_penalty: 0.3
        });
        const payload = {
            model: this.currentModel,
            messages: messages,
            temperature: typeof options.temperature === "number" ? options.temperature : (llmSettings.temperature ?? 0.9),
            max_tokens: typeof options.maxTokens === "number" ? options.maxTokens : (llmSettings.maxTokens ?? 100),
            top_p: typeof options.topP === "number" ? options.topP : (llmSettings.top_p ?? 0.9),
            frequency_penalty:
                typeof options.frequencyPenalty === "number" ? options.frequencyPenalty : (llmSettings.frequency_penalty ?? 0.3),
            presence_penalty:
                typeof options.presencePenalty === "number" ? options.presencePenalty : (llmSettings.presence_penalty ?? 0.3)
        };
        if (window.DEBUG_SAFE_LOGS) {
            console.debug("LLM payload meta:", {
                model: payload.model,
                temperature: payload.temperature,
                max_tokens: payload.max_tokens
            });
        }

        try {
            // Basic retry with exponential backoff and jitter for 429/5xx
            const maxAttempts = 3;
            let attempt = 0;
            let response;
            while (attempt < maxAttempts) {
                attempt++;
                response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": window.location.origin,
                        "X-Title": "Kimi - Virtual Companion"
                    },
                    body: JSON.stringify(payload)
                });
                if (response.ok) break;
                if (response.status === 429 || response.status >= 500) {
                    const base = 400;
                    const delay = base * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200);
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                break;
            }

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                let suggestions = [];

                try {
                    const errorData = await response.json();
                    if (errorData.error) {
                        errorMessage = errorData.error.message || errorData.error.code || errorMessage;

                        // More explicit error messages with suggestions
                        if (response.status === 422) {
                            errorMessage = `Model \"${this.currentModel}\" not available on OpenRouter.`;

                            // Refresh available models from API and try best match once
                            try {
                                await this.refreshRemoteModels();
                                const best = this.findBestMatchingModelId(this.currentModel);
                                if (best && best !== this.currentModel) {
                                    // Try once with corrected model
                                    this.currentModel = best;
                                    await this.db.setPreference("defaultLLMModel", best);
                                    this._notifyModelChanged();
                                    const retryResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                                        method: "POST",
                                        headers: {
                                            Authorization: `Bearer ${apiKey}`,
                                            "Content-Type": "application/json",
                                            "HTTP-Referer": window.location.origin,
                                            "X-Title": "Kimi - Virtual Companion"
                                        },
                                        body: JSON.stringify({ ...payload, model: best })
                                    });
                                    if (retryResponse.ok) {
                                        const retryData = await retryResponse.json();
                                        const kimiResponse = retryData.choices?.[0]?.message?.content;
                                        if (!kimiResponse) throw new Error("Invalid API response - no content generated");
                                        this.conversationContext.push(
                                            { role: "user", content: userMessage, timestamp: new Date().toISOString() },
                                            { role: "assistant", content: kimiResponse, timestamp: new Date().toISOString() }
                                        );
                                        if (this.conversationContext.length > this.maxContextLength * 2) {
                                            this.conversationContext = this.conversationContext.slice(-this.maxContextLength * 2);
                                        }
                                        return kimiResponse;
                                    }
                                }
                            } catch (e) {
                                // Swallow refresh errors; will fall through to standard error handling
                            }
                        } else if (response.status === 401) {
                            errorMessage = "Invalid API key. Check your OpenRouter key in the settings.";
                        } else if (response.status === 429) {
                            errorMessage = "Rate limit reached. Please wait a moment before trying again.";
                        } else if (response.status === 402) {
                            errorMessage = "Insufficient credit on your OpenRouter account.";
                        }
                    }
                } catch (parseError) {
                    console.warn("Unable to parse API error:", parseError);
                }

                console.error(`OpenRouter API error (${response.status}):`, errorMessage);

                // Add suggestions to the error if available
                const error = new Error(errorMessage);
                if (suggestions.length > 0) {
                    error.suggestions = suggestions;
                }

                throw error;
            }

            const data = await response.json();

            if (!data.choices || !data.choices[0] || !data.choices[0].message) {
                throw new Error("Invalid API response - no content generated");
            }

            const kimiResponse = data.choices[0].message.content;

            // Add to context
            this.conversationContext.push(
                { role: "user", content: userMessage, timestamp: new Date().toISOString() },
                { role: "assistant", content: kimiResponse, timestamp: new Date().toISOString() }
            );

            // Limit context size
            if (this.conversationContext.length > this.maxContextLength * 2) {
                this.conversationContext = this.conversationContext.slice(-this.maxContextLength * 2);
            }

            return kimiResponse;
        } catch (networkError) {
            if (networkError.name === "TypeError" && networkError.message.includes("fetch")) {
                throw new Error("Network connection error. Check your internet connection.");
            }
            throw networkError;
        }
    }

    async chatWithLocal(userMessage, options = {}) {
        try {
            const selectedLanguage = await this.db.getPreference("selectedLanguage", "en");
            let languageInstruction =
                "Always detect the user's language from their message before generating a response. Respond exclusively in that language unless the user explicitly requests otherwise.";
            let systemPromptContent =
                languageInstruction +
                "\n" +
                (this.systemPrompt
                    ? this.systemPrompt + "\n" + (await this.generateKimiPersonality())
                    : await this.generateKimiPersonality());
            const response = await fetch("http://localhost:11434/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "gemma-3n-E4B-it-Q4_K_M.gguf",
                    messages: [
                        { role: "system", content: systemPromptContent },
                        { role: "user", content: userMessage }
                    ],
                    stream: false
                })
            });
            if (!response.ok) {
                throw new Error("Ollama not available");
            }
            const data = await response.json();
            return data.message.content;
        } catch (error) {
            console.warn("Local LLM not available:", error);
            return this.getFallbackResponse(userMessage);
        }
    }

    getFallbackResponse(userMessage, errorType = "api") {
        // Use centralized fallback manager instead of duplicated logic
        if (window.KimiFallbackManager) {
            // Map error types to the correct format
            const errorTypeMap = {
                api: "api_error",
                model: "model_error",
                network: "network_error"
            };
            const mappedType = errorTypeMap[errorType] || "technical_error";
            return window.KimiFallbackManager.getFallbackMessage(mappedType);
        }

        // Fallback to legacy system if KimiFallbackManager not available
        const i18n = window.kimiI18nManager;
        if (!i18n) {
            return "Sorry, I'm having technical difficulties! 💕";
        }
        return i18n.t("fallback_technical_error");
    }

    getFallbackKeywords(trait, type) {
        const keywords = {
            humor: {
                positive: ["funny", "hilarious", "joke", "laugh", "amusing", "humorous", "smile", "witty", "playful"],
                negative: ["boring", "sad", "serious", "cold", "dry", "depressing", "gloomy"]
            },
            intelligence: {
                positive: [
                    "intelligent",
                    "smart",
                    "brilliant",
                    "logical",
                    "clever",
                    "wise",
                    "genius",
                    "thoughtful",
                    "insightful"
                ],
                negative: ["stupid", "dumb", "foolish", "slow", "naive", "ignorant", "simple"]
            },
            romance: {
                positive: ["cuddle", "love", "romantic", "kiss", "tenderness", "passion", "charming", "adorable", "sweet"],
                negative: ["cold", "distant", "indifferent", "rejection", "loneliness", "breakup", "sad"]
            },
            affection: {
                positive: ["affection", "tenderness", "close", "warmth", "kind", "caring", "cuddle", "love", "adore"],
                negative: ["mean", "cold", "indifferent", "distant", "rejection", "hate", "hostile"]
            },
            playfulness: {
                positive: ["play", "game", "tease", "mischievous", "fun", "amusing", "playful", "joke", "frolic"],
                negative: ["serious", "boring", "strict", "rigid", "monotonous", "tedious"]
            },
            empathy: {
                positive: ["listen", "understand", "empathy", "support", "help", "comfort", "compassion", "caring", "kindness"],
                negative: ["indifferent", "cold", "selfish", "ignore", "despise", "hostile", "uncaring"]
            }
        };
        return keywords[trait]?.[type] || [];
    }

    // Mémoire temporaire pour l'accumulation négative par trait
    _negativeStreaks = {};

    async updatePersonalityFromResponse(userMessage, kimiResponse) {
        // Use unified emotion system for personality updates
        if (window.kimiEmotionSystem) {
            return await window.kimiEmotionSystem.updatePersonalityFromConversation(
                userMessage,
                kimiResponse,
                await this.db.getSelectedCharacter()
            );
        }

        // Legacy fallback (should not be reached)
        console.warn("Unified emotion system not available, skipping personality update");
    }

    async getModelStats() {
        const models = await this.db.getAllLLMModels();
        const currentModelInfo = this.availableModels[this.currentModel];

        return {
            current: {
                id: this.currentModel,
                info: currentModelInfo
            },
            available: this.availableModels,
            configured: models,
            contextLength: this.conversationContext.length
        };
    }

    async testModel(modelId, testMessage = "Test API ok?") {
        const originalModel = this.currentModel;
        try {
            await this.setCurrentModel(modelId);
            const response = await this.chat(testMessage, { maxTokens: 2 });
            return { success: true, response: response };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            await this.setCurrentModel(originalModel);
        }
    }

    // Complete model diagnosis
    async diagnoseModel(modelId) {
        const model = this.availableModels[modelId];
        if (!model) {
            return {
                available: false,
                error: "Model not found in local list"
            };
        }

        // Check availability on OpenRouter
        try {
            // getAvailableModelsFromAPI removed
            return {
                available: true,
                model: model,
                pricing: model.pricing
            };
        } catch (error) {
            return {
                available: false,
                error: `Unable to check: ${error.message}`
            };
        }
    }

    // Fetch models from OpenRouter API and merge into availableModels
    async refreshRemoteModels() {
        if (this._isRefreshingModels) return;
        this._isRefreshingModels = true;
        try {
            const apiKey = await this.db.getPreference("openrouterApiKey", "");
            const res = await fetch("https://openrouter.ai/api/v1/models", {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "Kimi - Virtual Companion"
                }
            });
            if (!res.ok) {
                throw new Error(`Unable to fetch models: HTTP ${res.status}`);
            }
            const data = await res.json();
            if (!data?.data || !Array.isArray(data.data)) {
                throw new Error("Invalid models response format");
            }
            // Build a fresh map while preserving local/ollama entry
            const newMap = {};
            data.data.forEach(m => {
                if (!m?.id) return;
                const id = m.id;
                const provider = m?.id?.split("/")?.[0] || "OpenRouter";
                let pricing;
                const p = m?.pricing;
                if (p) {
                    const unitRaw = ((p.unit || p.per || p.units || "") + "").toLowerCase();
                    let unitTokens = 1;
                    if (unitRaw) {
                        if (unitRaw.includes("1m")) unitTokens = 1000000;
                        else if (unitRaw.includes("1k") || unitRaw.includes("thousand")) unitTokens = 1000;
                        else {
                            const num = parseFloat(unitRaw.replace(/[^0-9.]/g, ""));
                            if (Number.isFinite(num) && num > 0) {
                                if (unitRaw.includes("m")) unitTokens = num * 1000000;
                                else if (unitRaw.includes("k")) unitTokens = num * 1000;
                                else unitTokens = num;
                            } else if (unitRaw.includes("token")) {
                                unitTokens = 1;
                            }
                        }
                    }
                    const toPerMillion = v => {
                        const n = typeof v === "number" ? v : parseFloat(v);
                        if (!Number.isFinite(n)) return undefined;
                        return n * (1000000 / unitTokens);
                    };
                    if (typeof p.input !== "undefined" || typeof p.output !== "undefined") {
                        pricing = {
                            input: toPerMillion(p.input),
                            output: toPerMillion(p.output)
                        };
                    } else if (typeof p.prompt !== "undefined" || typeof p.completion !== "undefined") {
                        pricing = {
                            input: toPerMillion(p.prompt),
                            output: toPerMillion(p.completion)
                        };
                    } else {
                        pricing = { input: undefined, output: undefined };
                    }
                } else {
                    pricing = { input: undefined, output: undefined };
                }
                newMap[id] = {
                    name: m.name || id,
                    provider,
                    type: "openrouter",
                    contextWindow: m.context_length || m?.context_window || 128000,
                    pricing,
                    strengths: (m?.tags || []).slice(0, 4)
                };
            });
            // Keep local model entry
            if (this.availableModels["local/ollama"]) {
                newMap["local/ollama"] = this.availableModels["local/ollama"];
            }
            this.recommendedModelIds.forEach(id => {
                const curated = this.defaultModels[id];
                if (curated) {
                    newMap[id] = { ...(newMap[id] || {}), ...curated };
                }
            });
            this.availableModels = newMap;
            this._remoteModelsLoaded = true;
        } finally {
            this._isRefreshingModels = false;
        }
    }

    // Try to find best matching model id from remote list when an ID is stale
    findBestMatchingModelId(preferredId) {
        if (this.availableModels[preferredId]) return preferredId;
        const id = (preferredId || "").toLowerCase();
        const tokens = id.split(/[\/:\-_.]+/).filter(Boolean);
        let best = null;
        let bestScore = -1;
        Object.keys(this.availableModels).forEach(candidateId => {
            const c = candidateId.toLowerCase();
            let score = 0;
            tokens.forEach(t => {
                if (!t) return;
                if (c.includes(t)) score += 1;
            });
            // Give extra weight to common markers
            if (c.includes("instruct")) score += 0.5;
            if (c.includes("mistral") && id.includes("mistral")) score += 0.5;
            if (c.includes("small") && id.includes("small")) score += 0.5;
            if (score > bestScore) {
                bestScore = score;
                best = candidateId;
            }
        });
        // Avoid returning unrelated local model unless nothing else
        if (best === "local/ollama" && Object.keys(this.availableModels).length > 1) {
            return null;
        }
        return best;
    }

    _notifyModelChanged() {
        try {
            const detail = { id: this.currentModel };
            if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
                window.dispatchEvent(new CustomEvent("llmModelChanged", { detail }));
            }
        } catch (e) {}
    }
}

// Export for usage
window.KimiLLMManager = KimiLLMManager;
