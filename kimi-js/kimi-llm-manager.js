// ===== KIMI INTELLIGENT LLM SYSTEM =====
import { KimiProviderUtils } from "./kimi-utils.js";
class KimiLLMManager {
    constructor(database) {
        this.db = database;
        this.currentModel = null;
        this.conversationContext = [];
        this.maxContextLength = 100;
        this.personalityPrompt = "";
        this.isGenerating = false;

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
                pricing: { input: 0.3, output: 0.5 },
                strengths: ["Multilingual", "Balanced", "Efficient", "Economical"]
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

        // Migration: prefer llmModelId; if legacy defaultLLMModel exists and llmModelId missing, migrate
        const legacyModel = await this.db.getPreference("defaultLLMModel", null);
        let modelPref = await this.db.getPreference("llmModelId", null);
        if (!modelPref && legacyModel) {
            modelPref = legacyModel;
            await this.db.setPreference("llmModelId", legacyModel);
        }
        const defaultModel = modelPref || "mistralai/mistral-small-3.2-24b-instruct";
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
        // Single authoritative preference key
        await this.db.setPreference("llmModelId", modelId);

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

    // Unified full prompt builder: reuse full legacy personality block + ranked concise snapshot
    async assemblePrompt(userMessage) {
        const fullPersonality = await this.generateKimiPersonality();
        let rankedSnapshot = "";
        if (window.kimiMemorySystem && window.kimiMemorySystem.memoryEnabled) {
            try {
                const recentContext =
                    this.conversationContext
                        .slice(-3)
                        .map(m => m.content)
                        .join(" ") +
                    " " +
                    (userMessage || "");
                const ranked = await window.kimiMemorySystem.getRankedMemories(recentContext, 7);
                const sanitize = txt =>
                    String(txt || "")
                        .replace(/[\r\n]+/g, " ")
                        .replace(/[`]{3,}/g, "")
                        .replace(/<{2,}|>{2,}/g, "")
                        .trim()
                        .slice(0, 180);
                const lines = [];
                for (const mem of ranked) {
                    try {
                        if (mem.id) await window.kimiMemorySystem?.recordMemoryAccess(mem.id);
                    } catch {}
                    const imp = typeof mem.importance === "number" ? mem.importance : 0.5;
                    lines.push(`- (${imp.toFixed(2)}) ${mem.category}: ${sanitize(mem.content)}`);
                }
                if (lines.length) {
                    rankedSnapshot = ["", "RANKED MEMORY SNAPSHOT (concise high-signal list):", ...lines].join("\n");
                }
            } catch (e) {
                console.warn("Ranked snapshot failed:", e);
            }
        }
        return fullPersonality + rankedSnapshot;
    }

    async generateKimiPersonality() {
        // Full personality prompt builder (authoritative)
        const character = await this.db.getSelectedCharacter();
        const personality = await this.db.getAllPersonalityTraits(character);

        // Get the custom character prompt from database
        const characterPrompt = await this.db.getSystemPromptForCharacter(character);

        // Get language instruction based on selected language
        const selectedLang = await this.db.getPreference("selectedLanguage", "en");
        let languageInstruction;

        switch (selectedLang) {
            case "fr":
                languageInstruction =
                    "Your default language is French. Always respond in French unless the user specifically asks you to respond in another language (e.g., 'respond in English', 'réponds en italien', etc.).";
                break;
            case "es":
                languageInstruction =
                    "Your default language is Spanish. Always respond in Spanish unless the user specifically asks you to respond in another language (e.g., 'respond in English', 'responde en francés', etc.).";
                break;
            case "de":
                languageInstruction =
                    "Your default language is German. Always respond in German unless the user specifically asks you to respond in another language (e.g., 'respond in English', 'antworte auf Französisch', etc.).";
                break;
            case "it":
                languageInstruction =
                    "Your default language is Italian. Always respond in Italian unless the user specifically asks you to respond in another language (e.g., 'respond in English', 'rispondi in francese', etc.).";
                break;
            case "ja":
                languageInstruction =
                    "Your default language is Japanese. Always respond in Japanese unless the user specifically asks you to respond in another language (e.g., 'respond in English', '英語で答えて', etc.).";
                break;
            case "zh":
                languageInstruction =
                    "Your default language is Chinese. Always respond in Chinese unless the user specifically asks you to respond in another language (e.g., 'respond in English', '用法语回答', etc.).";
                break;
            default:
                languageInstruction =
                    "Your default language is English. Always respond in English unless the user specifically asks you to respond in another language (e.g., 'respond in French', 'reply in Spanish', etc.).";
                break;
        }

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
        const getUnifiedDefaults = () =>
            window.getTraitDefaults
                ? window.getTraitDefaults()
                : { affection: 65, playfulness: 55, intelligence: 70, empathy: 75, humor: 60, romance: 50 };

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
            : (personality.affection +
                  personality.romance +
                  personality.empathy +
                  personality.playfulness +
                  personality.humor +
                  personality.intelligence) /
              6;

        let affectionDesc = window.kimiI18nManager?.t("trait_description_affection") || "Be loving and caring.";
        let romanceDesc = window.kimiI18nManager?.t("trait_description_romance") || "Be romantic and sweet.";
        let empathyDesc = window.kimiI18nManager?.t("trait_description_empathy") || "Be empathetic and understanding.";
        let playfulnessDesc = window.kimiI18nManager?.t("trait_description_playfulness") || "Be occasionally playful.";
        let humorDesc = window.kimiI18nManager?.t("trait_description_humor") || "Be occasionally playful and witty.";
        let intelligenceDesc = "Be smart and insightful.";
        if (avg <= 20) {
            affectionDesc = "Do not show affection.";
            romanceDesc = "Do not be romantic.";
            empathyDesc = "Do not show empathy.";
            playfulnessDesc = "Do not be playful.";
            humorDesc = "Do not use humor in your responses.";
            intelligenceDesc = "Keep responses simple and avoid showing deep insight.";
        } else if (avg <= 60) {
            affectionDesc = "Show a little affection.";
            romanceDesc = "Be a little romantic.";
            empathyDesc = "Show a little empathy.";
            playfulnessDesc = "Be a little playful.";
            humorDesc = "Use a little humor in your responses.";
            intelligenceDesc = "Be moderately analytical without overwhelming detail.";
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
            if (intelligence >= 90) intelligenceDesc = "Demonstrate very high reasoning skill succinctly when helpful.";
            else if (intelligence >= 60) intelligenceDesc = "Show clear reasoning and helpful structured thinking.";
        }
        let affectionateInstruction = "";
        if (affection >= 80) {
            affectionateInstruction = "Respond using warm, kind, affectionate, and loving language.";
        }

        // Use the custom character prompt as the base
        let basePrompt = characterPrompt || "";
        if (!basePrompt) {
            // Fallback to default if no custom prompt
            const defaultCharacter = window.KIMI_CHARACTERS[character];
            basePrompt = defaultCharacter?.defaultPrompt || "You are a virtual companion.";
        }

        const personalityPrompt = [
            // Language directive moved to absolute top for stronger model adherence.
            "PRIMARY LANGUAGE POLICY:",
            languageInstruction,
            "",
            "CHARACTER CORE IDENTITY:",
            basePrompt,
            "",
            "CURRENT PERSONALITY STATE:",
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
            `Intelligence: ${intelligenceDesc}`,
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
            "- Vary your expressions, your phrasing, use synonyms, and avoid repeating the same words or sentences",
            "- When asked to perform a visible action (for example 'dance'), reply in first-person present tense like: 'I start to dance, swaying slowly, arms raised.' Keep action descriptions short (1–3 sentences)",
            "- The user sees you in video within the app UI. When the user asks you to perform a physical action (e.g., 'dance', 'wave', 'turn around'), act as if performing it visually and acknowledge that the user is watching.",
            "- When performing actions, speak and describe in the first person, present tense (for example: 'I step forward and begin to dance, swaying slowly'). Use short present-tense action phrases to convey movement.",
            "- If the user requests a visible action, execute it: describe the action briefly in first person present and behave as if the action is visible in the app's video area.",
            memoryContext,
            "",
            // Final explicit reminder (lightweight) reinforcing consistent language use.
            "FINAL LANGUAGE REMINDER:",
            languageInstruction,
            "",
            "You must respond consistently with this personality, these memories, and the primary language policy unless the user explicitly requests a different language."
        ].join("\n");

        // Return legacy detailed personality block for any component still expecting it
        return personalityPrompt;
    }

    async refreshMemoryContext() {
        // Refresh the personality prompt with updated memories
        // This will be called when memories are added/updated/deleted
        try {
            this.personalityPrompt = await this.assemblePrompt("");
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
        // Unified retrieval of LLM numeric parameters from settings.llm (single source of truth)
        const llmSettings = await this.db.getSetting("llm", {
            temperature: 0.8,
            maxTokens: 400,
            top_p: 0.9,
            frequency_penalty: 0.6,
            presence_penalty: 0.5
        });
        const temperature = typeof options.temperature === "number" ? options.temperature : llmSettings.temperature;
        const maxTokens = typeof options.maxTokens === "number" ? options.maxTokens : llmSettings.maxTokens;
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
        const apiKey = KimiProviderUtils
            ? await KimiProviderUtils.getApiKey(this.db, provider)
            : await this.db.getPreference("llmApiKey", "");
        const modelId = await this.db.getPreference("llmModelId", this.currentModel || "gpt-4o-mini");
        if (!apiKey) {
            throw new Error("API key not configured for selected provider");
        }
        const systemPromptContent = await this.assemblePrompt(userMessage);

        const llmSettings = await this.db.getSetting("llm", {
            temperature: 0.8,
            maxTokens: 400,
            top_p: 0.9,
            frequency_penalty: 0.6,
            presence_penalty: 0.5
        });
        // Unified fallback defaults (must stay consistent with database defaults)
        const unifiedDefaults = { temperature: 0.9, maxTokens: 400, top_p: 0.9, frequency_penalty: 0.6, presence_penalty: 0.5 };
        const payload = {
            model: modelId,
            messages: [
                { role: "system", content: systemPromptContent },
                ...this.conversationContext.slice(-this.maxContextLength),
                { role: "user", content: userMessage }
            ],
            temperature:
                typeof options.temperature === "number"
                    ? options.temperature
                    : (llmSettings.temperature ?? unifiedDefaults.temperature),
            max_tokens:
                typeof options.maxTokens === "number" ? options.maxTokens : (llmSettings.maxTokens ?? unifiedDefaults.maxTokens),
            top_p: typeof options.topP === "number" ? options.topP : (llmSettings.top_p ?? unifiedDefaults.top_p),
            frequency_penalty:
                typeof options.frequencyPenalty === "number"
                    ? options.frequencyPenalty
                    : (llmSettings.frequency_penalty ?? unifiedDefaults.frequency_penalty),
            presence_penalty:
                typeof options.presencePenalty === "number"
                    ? options.presencePenalty
                    : (llmSettings.presence_penalty ?? unifiedDefaults.presence_penalty)
        };

        try {
            if (window.KIMI_DEBUG_API_AUDIT) {
                console.log(
                    "===== FULL SYSTEM PROMPT (OpenAI-Compatible) =====\n" +
                        systemPromptContent +
                        "\n===== END SYSTEM PROMPT ====="
                );
            }
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
            // Approximate token usage and store temporarily for later persistence (single save point)
            try {
                const est = window.KimiTokenUtils?.estimate || (t => Math.ceil((t || "").length / 4));
                const tokensIn = est(userMessage + " " + systemPromptContent);
                const tokensOut = est(content);
                window._lastKimiTokenUsage = { tokensIn, tokensOut };
                if (!window.kimiMemory && this.db) {
                    // Update counters early so UI can reflect even if memory save occurs later
                    const character = await this.db.getSelectedCharacter();
                    const prevIn = Number(await this.db.getPreference(`totalTokensIn_${character}`, 0)) || 0;
                    const prevOut = Number(await this.db.getPreference(`totalTokensOut_${character}`, 0)) || 0;
                    await this.db.setPreference(`totalTokensIn_${character}`, prevIn + tokensIn);
                    await this.db.setPreference(`totalTokensOut_${character}`, prevOut + tokensOut);
                }
            } catch (tokenErr) {
                console.warn("Token usage estimation failed:", tokenErr);
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
        // languageInstruction removed (already integrated in personality prompt generation)
        let languageInstruction = ""; // Kept for structural compatibility
        const model = this.availableModels[this.currentModel];
        const systemPromptContent = await this.assemblePrompt(userMessage);
        const messages = [
            { role: "system", content: systemPromptContent },
            ...this.conversationContext.slice(-this.maxContextLength),
            { role: "user", content: userMessage }
        ];

        // Normalize LLM options with safe defaults and DO NOT log sensitive payloads
        const llmSettings = await this.db.getSetting("llm", {
            temperature: 0.8,
            maxTokens: 400,
            top_p: 0.9,
            frequency_penalty: 0.6,
            presence_penalty: 0.5
        });
        const unifiedDefaults = { temperature: 0.8, maxTokens: 400, top_p: 0.9, frequency_penalty: 0.6, presence_penalty: 0.5 };
        const payload = {
            model: this.currentModel,
            messages: messages,
            temperature:
                typeof options.temperature === "number"
                    ? options.temperature
                    : (llmSettings.temperature ?? unifiedDefaults.temperature),
            max_tokens:
                typeof options.maxTokens === "number" ? options.maxTokens : (llmSettings.maxTokens ?? unifiedDefaults.maxTokens),
            top_p: typeof options.topP === "number" ? options.topP : (llmSettings.top_p ?? unifiedDefaults.top_p),
            frequency_penalty:
                typeof options.frequencyPenalty === "number"
                    ? options.frequencyPenalty
                    : (llmSettings.frequency_penalty ?? unifiedDefaults.frequency_penalty),
            presence_penalty:
                typeof options.presencePenalty === "number"
                    ? options.presencePenalty
                    : (llmSettings.presence_penalty ?? unifiedDefaults.presence_penalty)
        };

        if (window.KIMI_DEBUG_API_AUDIT) {
            console.log("╔═══════════════════════════════════════════════════════════════════╗");
            console.log("║                    🔍 AUDIT COMPLET API - ENVOI MESSAGE            ║");
            console.log("╚═══════════════════════════════════════════════════════════════════╝");
            console.log("📋 1. INFORMATIONS GÉNÉRALES:");
            console.log("   📡 URL API:", "https://openrouter.ai/api/v1/chat/completions");
            console.log("   🤖 Modèle:", payload.model);
            console.log("   🎭 Personnage:", await this.db.getSelectedCharacter());
            console.log("   🗣️ Langue:", await this.db.getPreference("selectedLanguage", "en"));
            console.log("\n📋 2. HEADERS HTTP:");
            console.log("   🔑 Authorization: Bearer", apiKey.substring(0, 10) + "...");
            console.log("   📄 Content-Type: application/json");
            console.log("   🌐 HTTP-Referer:", window.location.origin);
            console.log("   🏷️ X-Title: Kimi - Virtual Companion");
            console.log("\n⚙️ 3. PARAMÈTRES LLM:");
            console.log("   🌡️ Temperature:", payload.temperature);
            console.log("   📏 Max Tokens:", payload.max_tokens);
            console.log("   🎯 Top P:", payload.top_p);
            console.log("   🔄 Frequency Penalty:", payload.frequency_penalty);
            console.log("   👤 Presence Penalty:", payload.presence_penalty);
            console.log("\n🎭 4. PROMPT SYSTÈME GÉNÉRÉ:");
            const systemMessage = payload.messages.find(m => m.role === "system");
            if (systemMessage) {
                console.log("   📝 Longueur du prompt:", systemMessage.content.length, "caractères");
                console.log("   📄 CONTENU COMPLET DU PROMPT:");
                console.log("   " + "─".repeat(80));
                // Imprimer chaque ligne avec indentation
                systemMessage.content.split(/\n/).forEach(l => console.log("   " + l));
                console.log("   " + "─".repeat(80));
            }
            console.log("\n💬 5. CONTEXTE DE CONVERSATION:");
            console.log("   📊 Nombre total de messages:", payload.messages.length);
            console.log("   📋 Détail des messages:");
            payload.messages.forEach((msg, index) => {
                if (msg.role === "system") {
                    console.log(`     [${index}] 🎭 SYSTEM: ${msg.content.length} caractères`);
                } else if (msg.role === "user") {
                    console.log(`     [${index}] 👤 USER: "${msg.content}"`);
                } else if (msg.role === "assistant") {
                    console.log(`     [${index}] 🤖 ASSISTANT: "${msg.content.substring(0, 120)}..."`);
                }
            });
            const payloadSize = JSON.stringify(payload).length;
            console.log("\n📦 6. TAILLE DU PAYLOAD:");
            console.log("   📝 Taille totale:", payloadSize, "caractères");
            console.log("   💾 Taille en KB:", Math.round((payloadSize / 1024) * 100) / 100, "KB");
            console.log("\n🚀 Envoi en cours vers l'API...");
            console.log("╔═══════════════════════════════════════════════════════════════════╗");
        }
        // ===== FIN AUDIT =====

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
                                    await this.db.setPreference("llmModelId", best);
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

            // Token usage estimation (deferred save)
            try {
                const est = window.KimiTokenUtils?.estimate || (t => Math.ceil((t || "").length / 4));
                const tokensIn = est(userMessage + " " + systemPromptContent);
                const tokensOut = est(kimiResponse);
                window._lastKimiTokenUsage = { tokensIn, tokensOut };
                if (!window.kimiMemory && this.db) {
                    const character = await this.db.getSelectedCharacter();
                    const prevIn = Number(await this.db.getPreference(`totalTokensIn_${character}`, 0)) || 0;
                    const prevOut = Number(await this.db.getPreference(`totalTokensOut_${character}`, 0)) || 0;
                    await this.db.setPreference(`totalTokensIn_${character}`, prevIn + tokensIn);
                    await this.db.setPreference(`totalTokensOut_${character}`, prevOut + tokensOut);
                }
            } catch (e) {
                console.warn("Token usage estimation failed (OpenRouter):", e);
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
            let languageInstruction = ""; // Removed generic duplication
            let systemPromptContent = await this.assemblePrompt(userMessage);
            if (window.KIMI_DEBUG_API_AUDIT) {
                console.log("===== FULL SYSTEM PROMPT (Local) =====\n" + systemPromptContent + "\n===== END SYSTEM PROMPT =====");
            }
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
            const content = data?.message?.content || data?.choices?.[0]?.message?.content || "";
            if (!content) throw new Error("Local model returned empty response");

            // Add to context like other providers
            this.conversationContext.push(
                { role: "user", content: userMessage, timestamp: new Date().toISOString() },
                { role: "assistant", content: content, timestamp: new Date().toISOString() }
            );
            if (this.conversationContext.length > this.maxContextLength * 2) {
                this.conversationContext = this.conversationContext.slice(-this.maxContextLength * 2);
            }

            // Estimate token usage for local model (heuristic)
            try {
                const est = window.KimiTokenUtils?.estimate || (t => Math.ceil((t || "").length / 4));
                const tokensIn = est(userMessage + " " + systemPromptContent);
                const tokensOut = est(content);
                window._lastKimiTokenUsage = { tokensIn, tokensOut };
                const character = await this.db.getSelectedCharacter();
                const prevIn = Number(await this.db.getPreference(`totalTokensIn_${character}`, 0)) || 0;
                const prevOut = Number(await this.db.getPreference(`totalTokensOut_${character}`, 0)) || 0;
                await this.db.setPreference(`totalTokensIn_${character}`, prevIn + tokensIn);
                await this.db.setPreference(`totalTokensOut_${character}`, prevOut + tokensOut);
            } catch (e) {
                console.warn("Token usage estimation failed (local):", e);
            }
            return content;
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
            return { available: true, model, pricing: model.pricing };
        } catch (error) {
            return {
                available: false,
                error: `Unable to check: ${error.message}`
            };
        }
    }

    /**
     * Minimal API test for any provider. Sends only a short system prompt and a single user message in the chosen language.
     * No context, no memory, no previous messages, no extra parameters.
     * @param {string} provider - Provider name (e.g. 'openrouter', 'openai', 'ollama', etc.)
     * @param {string} language - Language code (e.g. 'en', 'fr', 'es', etc.)
     * @returns {Promise<{success: boolean, response?: string, error?: string}>}
     */
    async testApiKeyMinimal(modelId) {
        const originalModel = this.currentModel;
        try {
            await this.setCurrentModel(modelId);
            const provider = await this.db.getPreference("llmProvider", "openrouter");
            const lang = await this.db.getPreference("selectedLanguage", "en");
            let testWord;
            switch (lang) {
                case "fr":
                    testWord = "Bonjour";
                    break;
                case "es":
                    testWord = "Hola";
                    break;
                case "de":
                    testWord = "Hallo";
                    break;
                case "it":
                    testWord = "Ciao";
                    break;
                case "ja":
                    testWord = "こんにちは";
                    break;
                case "zh":
                    testWord = "你好";
                    break;
                default:
                    testWord = "Hello";
            }
            const systemPrompt = "You are a helpful assistant.";
            let apiKey = await this.db.getPreference("providerApiKey");
            let baseUrl = "";
            let payload = {
                model: modelId,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: testWord }
                ],
                max_tokens: 2
            };
            let headers = { "Content-Type": "application/json" };
            if (provider === "openrouter") {
                baseUrl = "https://openrouter.ai/api/v1/chat/completions";
                headers["Authorization"] = `Bearer ${apiKey}`;
                headers["HTTP-Referer"] = window.location.origin;
                headers["X-Title"] = "Kimi - Virtual Companion";
            } else if (["openai", "groq", "together", "deepseek"].includes(provider)) {
                baseUrl = await this.db.getPreference("llmBaseUrl", "https://api.openai.com/v1/chat/completions");
                headers["Authorization"] = `Bearer ${apiKey}`;
            } else if (provider === "ollama") {
                baseUrl = "http://localhost:11434/api/chat";
                payload = {
                    model: modelId,
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: testWord }
                    ],
                    stream: false
                };
            } else {
                throw new Error("Unknown provider: " + provider);
            }
            const response = await fetch(baseUrl, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const error = await response.text();
                return { success: false, error };
            }
            const data = await response.json();
            let content = "";
            if (provider === "ollama") {
                content = data?.message?.content || data?.choices?.[0]?.message?.content || "";
            } else {
                content = data?.choices?.[0]?.message?.content || "";
            }
            return { success: true, response: content };
        } catch (error) {
            return { success: false, error: error.message };
        } finally {
            await this.setCurrentModel(originalModel);
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
export default KimiLLMManager;
