document.addEventListener("DOMContentLoaded", async function () {
    const DEFAULT_SYSTEM_PROMPT = window.DEFAULT_SYSTEM_PROMPT;

    let kimiDB = null;
    let kimiLLM = null;
    let isSystemReady = false;

    const kimiInit = new KimiInitManager();
    let kimiVideo = null;

    // Error manager is already initialized in kimi-error-manager.js

    try {
        kimiDB = new KimiDatabase();
        await kimiDB.init();

        // Expose globally as soon as available
        window.kimiDB = kimiDB;

        const selectedCharacter = await kimiDB.getPreference("selectedCharacter", "kimi");
        const favorabilityLabel = window.KimiDOMUtils.get("#favorability-label");
        if (favorabilityLabel && window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[selectedCharacter]) {
            favorabilityLabel.setAttribute("data-i18n", "affection_level_of");
            favorabilityLabel.setAttribute(
                "data-i18n-params",
                JSON.stringify({ name: window.KIMI_CHARACTERS[selectedCharacter].name })
            );
            favorabilityLabel.textContent = `💖 Affection level of ${window.KIMI_CHARACTERS[selectedCharacter].name}`;
        }
        const chatHeaderName = window.KimiDOMUtils.get(".chat-header span[data-i18n]");
        if (chatHeaderName && window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[selectedCharacter]) {
            chatHeaderName.setAttribute("data-i18n", `chat_with_${selectedCharacter}`);
        }
        const systemPromptInput = window.KimiDOMUtils.get("#system-prompt");
        if (systemPromptInput && kimiDB.getSystemPromptForCharacter) {
            const prompt = await kimiDB.getSystemPromptForCharacter(selectedCharacter);
            systemPromptInput.value = prompt;
            if (kimiLLM && kimiLLM.setSystemPrompt) kimiLLM.setSystemPrompt(prompt);
        }
        kimiLLM = new KimiLLMManager(kimiDB);
        window.kimiLLM = kimiLLM;
        await kimiLLM.init();

        // Initialize unified emotion system
        window.kimiEmotionSystem = new window.KimiEmotionSystem(kimiDB);

        // Initialize the new memory system
        window.kimiMemorySystem = new window.KimiMemorySystem(kimiDB);
        await window.kimiMemorySystem.init();

        // Initialize legacy memory for favorability
        const kimiMemory = new KimiMemory(kimiDB);
        await kimiMemory.init();
        window.kimiMemory = kimiMemory;

        // Expose globally (already set before init)

        // Load available models now that LLM is ready
        if (window.loadAvailableModels) {
            setTimeout(() => window.loadAvailableModels(), 500);
        }

        isSystemReady = true;
        window.isSystemReady = true;
        // Hydrate API config UI from DB after systems ready
        initializeApiConfigUI();
    } catch (error) {
        console.error("Initialization error:", error);
    }
    // Centralized helpers for API config UI
    const ApiUi = {
        presenceDot: () => document.getElementById("api-key-presence"),
        presenceDotTest: () => document.getElementById("api-key-presence-test"),
        apiKeyInput: () => document.getElementById("openrouter-api-key"),
        toggleBtn: () => document.getElementById("toggle-api-key"),
        providerSelect: () => document.getElementById("llm-provider"),
        baseUrlInput: () => document.getElementById("llm-base-url"),
        modelIdInput: () => document.getElementById("llm-model-id"),
        savedBadge: () => document.getElementById("api-key-saved"),
        statusSpan: () => document.getElementById("api-status"),
        testBtn: () => document.getElementById("test-api"),
        // Saved key indicator (left dot)
        setPresence(color) {
            const dot = this.presenceDot();
            if (dot) dot.style.backgroundColor = color;
        },
        // Test result indicator (right dot)
        setTestPresence(color) {
            const dot2 = this.presenceDotTest();
            if (dot2) dot2.style.backgroundColor = color;
        },
        clearStatus() {
            const s = this.statusSpan();
            if (s) {
                s.textContent = "";
                s.style.color = "";
            }
        },
        setTestEnabled(enabled) {
            const b = this.testBtn();
            if (b) b.disabled = !enabled;
        }
    };

    // Initial presence state based on current input value
    {
        const currentVal = (ApiUi.apiKeyInput() || {}).value || "";
        const colorInit = currentVal && currentVal.length > 0 ? "#4caf50" : "#9e9e9e";
        ApiUi.setPresence(colorInit);
        // On load, test status is unknown
        ApiUi.setTestPresence("#9e9e9e");
    }

    // Initialize API config UI from saved preferences
    async function initializeApiConfigUI() {
        try {
            if (!window.kimiDB) return;
            const provider = await window.kimiDB.getPreference("llmProvider", "openrouter");
            const baseUrl = await window.kimiDB.getPreference(
                "llmBaseUrl",
                provider === "openrouter"
                    ? "https://openrouter.ai/api/v1/chat/completions"
                    : "https://api.openai.com/v1/chat/completions"
            );
            const modelId = await window.kimiDB.getPreference(
                "llmModelId",
                window.kimiLLM ? window.kimiLLM.currentModel : "model-id"
            );
            const providerSelect = ApiUi.providerSelect();
            if (providerSelect) providerSelect.value = provider;
            const baseUrlInput = ApiUi.baseUrlInput();
            const modelIdInput = ApiUi.modelIdInput();
            const apiKeyInput = ApiUi.apiKeyInput();
            if (baseUrlInput) baseUrlInput.value = baseUrl || "";
            // Only prefill model for OpenRouter, others should show placeholder only
            if (modelIdInput) {
                if (provider === "openrouter") {
                    if (!modelIdInput.value) modelIdInput.value = modelId;
                } else {
                    modelIdInput.value = "";
                }
            }
            // Load the provider-specific key
            const keyPrefMap = {
                openrouter: "openrouterApiKey",
                openai: "apiKey_openai",
                groq: "apiKey_groq",
                together: "apiKey_together",
                deepseek: "apiKey_deepseek",
                "openai-compatible": "apiKey_custom"
            };
            const keyPref = keyPrefMap[provider] || "llmApiKey";
            const storedKey = await window.kimiDB.getPreference(keyPref, "");
            if (apiKeyInput) apiKeyInput.value = storedKey || "";
            ApiUi.setPresence(storedKey ? "#4caf50" : "#9e9e9e");
            ApiUi.setTestPresence("#9e9e9e");
            const savedBadge = ApiUi.savedBadge();
            if (savedBadge) savedBadge.style.display = storedKey ? "inline" : "none";
            ApiUi.clearStatus();
            // Enable/disable Test button according to validation (Ollama does not require API key)
            const valid = !!(window.KIMI_VALIDATORS && window.KIMI_VALIDATORS.validateApiKey(storedKey || ""));
            ApiUi.setTestEnabled(provider === "ollama" ? true : valid);
            // Update dynamic label and placeholders using change handler logic
            if (providerSelect && typeof providerSelect.dispatchEvent === "function") {
                const ev = new Event("change");
                providerSelect.dispatchEvent(ev);
            }
        } catch (e) {
            console.warn("Failed to initialize API config UI:", e);
        }
    }

    const providerSelectEl = document.getElementById("llm-provider");
    if (providerSelectEl) {
        providerSelectEl.addEventListener("change", async () => {
            const provider = providerSelectEl.value;
            const baseUrlInput = ApiUi.baseUrlInput();
            const apiKeyInput = ApiUi.apiKeyInput();
            const modelIdInput = ApiUi.modelIdInput();
            const placeholders = {
                openrouter: {
                    url: "https://openrouter.ai/api/v1/chat/completions",
                    keyPh: "sk-or-v1-...",
                    model: window.kimiLLM ? window.kimiLLM.currentModel : "model-id"
                },
                openai: {
                    url: "https://api.openai.com/v1/chat/completions",
                    keyPh: "sk-...",
                    model: "gpt-4o-mini"
                },
                groq: {
                    url: "https://api.groq.com/openai/v1/chat/completions",
                    keyPh: "gsk_...",
                    model: "llama-3.1-8b-instant"
                },
                together: {
                    url: "https://api.together.xyz/v1/chat/completions",
                    keyPh: "together_...",
                    model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"
                },
                deepseek: {
                    url: "https://api.deepseek.com/chat/completions",
                    keyPh: "sk-...",
                    model: "deepseek-chat"
                },
                "openai-compatible": {
                    url: "https://your-endpoint/v1/chat/completions",
                    keyPh: "your-key",
                    model: "model-id"
                },
                ollama: {
                    url: "http://localhost:11434/api/chat",
                    keyPh: "",
                    model: "llama3"
                }
            };
            const p = placeholders[provider] || placeholders.openai;
            if (baseUrlInput) {
                baseUrlInput.placeholder = p.url;
                baseUrlInput.value = provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : p.url;
            }
            if (apiKeyInput) apiKeyInput.placeholder = p.keyPh;
            if (modelIdInput) {
                modelIdInput.placeholder = p.model;
                // Value only for OpenRouter; others cleared to encourage provider-specific model naming
                modelIdInput.value = provider === "openrouter" && window.kimiLLM ? window.kimiLLM.currentModel : "";
            }
            if (window.kimiDB) {
                await window.kimiDB.setPreference("llmProvider", provider);
                await window.kimiDB.setPreference(
                    "llmBaseUrl",
                    provider === "openrouter" ? "https://openrouter.ai/api/v1/chat/completions" : p.url
                );
                const apiKeyLabel = document.getElementById("api-key-label");
                // Load provider-specific key into the input for clarity
                const keyPrefMap = {
                    openrouter: "openrouterApiKey",
                    openai: "apiKey_openai",
                    groq: "apiKey_groq",
                    together: "apiKey_together",
                    deepseek: "apiKey_deepseek",
                    "openai-compatible": "apiKey_custom"
                };
                const keyPref = keyPrefMap[provider] || "llmApiKey";
                const storedKey = await window.kimiDB.getPreference(keyPref, "");
                if (apiKeyInput) apiKeyInput.value = storedKey || "";
                const color = provider === "ollama" ? "#9e9e9e" : storedKey && storedKey.length > 0 ? "#4caf50" : "#9e9e9e";
                ApiUi.setPresence(color);
                // Changing provider invalidates previous test state
                ApiUi.setTestPresence("#9e9e9e");
                ApiUi.setTestEnabled(
                    provider === "ollama"
                        ? true
                        : !!(window.KIMI_VALIDATORS && window.KIMI_VALIDATORS.validateApiKey(storedKey || ""))
                );

                // Dynamic label per provider
                if (apiKeyLabel) {
                    const labelByProvider = {
                        openrouter: "OpenRouter API Key",
                        openai: "OpenAI API Key",
                        groq: "Groq API Key",
                        together: "Together API Key",
                        deepseek: "DeepSeek API Key",
                        "openai-compatible": "API Key",
                        ollama: "API Key"
                    };
                    apiKeyLabel.textContent = labelByProvider[provider] || "API Key";
                }
                const savedBadge = ApiUi.savedBadge();
                if (savedBadge) savedBadge.style.display = "none";
                ApiUi.clearStatus();
            }
        });
    }

    const loadingScreen = document.getElementById("loading-screen");
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = "0";
            setTimeout(() => {
                loadingScreen.style.display = "none";
            }, 500);
        }, 1500);
    }

    let video1 = window.KimiDOMUtils.get("#video1");
    let video2 = window.KimiDOMUtils.get("#video2");

    if (!video1 || !video2) {
        console.error("Video elements not found! Creating them...");
        const videoContainer = document.querySelector(".video-container");
        if (videoContainer) {
            video1 = document.createElement("video");
            video1.id = "video1";
            video1.className = "bg-video active";
            video1.autoplay = true;
            video1.muted = true;
            video1.playsinline = true;
            video1.preload = "auto";
            video1.innerHTML =
                '<source src="" type="video/mp4" /><span data-i18n="video_not_supported">Your browser does not support the video tag.</span>';

            video2 = document.createElement("video");
            video2.id = "video2";
            video2.className = "bg-video";
            video2.autoplay = true;
            video2.muted = true;
            video2.playsinline = true;
            video2.preload = "auto";
            video2.innerHTML =
                '<source src="" type="video/mp4" /><span data-i18n="video_not_supported">Your browser does not support the video tag.</span>';

            videoContainer.appendChild(video1);
            videoContainer.appendChild(video2);
        }
    }

    let activeVideo = video1;
    let inactiveVideo = video2;

    kimiVideo = new KimiVideoManager(video1, video2);
    await kimiVideo.init(kimiDB);
    window.kimiVideo = kimiVideo;

    if (video1 && video2 && kimiDB && kimiDB.getSelectedCharacter) {
        try {
            const selectedCharacter = await kimiDB.getSelectedCharacter();
            if (selectedCharacter && window.KIMI_CHARACTERS) {
                kimiVideo.setCharacter(selectedCharacter);
                const folder = window.KIMI_CHARACTERS[selectedCharacter].videoFolder;
                const neutralVideo = `${folder}neutral/neutral-gentle-breathing.mp4`;
                const video1Source = video1.querySelector("source");
                if (video1Source) {
                    video1Source.setAttribute("src", neutralVideo);
                    video1.load();
                }
            }
            if (kimiVideo && kimiVideo.switchToContext) {
                kimiVideo.switchToContext("neutral");
            }
        } catch (e) {
            console.warn("Error loading initial video:", e);
        }
    }

    async function attachCharacterSection() {
        let saveCharacterBtn = window.KimiDOMUtils.get("#save-character-btn");
        if (saveCharacterBtn) {
            saveCharacterBtn.addEventListener("click", async e => {
                const settingsPanel = window.KimiDOMUtils.get(".settings-panel");
                let scrollTop = settingsPanel ? settingsPanel.scrollTop : null;
                const characterGrid = window.KimiDOMUtils.get("#character-grid");
                const selectedCard = characterGrid ? characterGrid.querySelector(".character-card.selected") : null;
                if (!selectedCard) return;
                const charKey = selectedCard.dataset.character;
                const savedBadge = document.getElementById("api-key-saved");
                if (savedBadge) {
                    savedBadge.textContent = (window.kimiI18nManager && window.kimiI18nManager.t("saved_short")) || "Saved";
                    savedBadge.style.display = "inline";
                }
                const promptInput = window.KimiDOMUtils.get(`#prompt-${charKey}`);
                const prompt = promptInput ? promptInput.value : "";

                await window.kimiDB.setSelectedCharacter(charKey);
                await window.kimiDB.setSystemPromptForCharacter(charKey, prompt);
                if (window.kimiVideo && window.kimiVideo.setCharacter) {
                    window.kimiVideo.setCharacter(charKey);
                    if (window.kimiVideo.switchToContext) {
                        window.kimiVideo.switchToContext("neutral");
                    }
                }
                if (window.voiceManager && window.voiceManager.updateSelectedCharacter) {
                    await window.voiceManager.updateSelectedCharacter();
                }
                if (window.kimiLLM && window.kimiLLM.setSystemPrompt) {
                    // Only manage system prompt here. API key editing is handled globally to avoid duplicates.

                    // Clear API status when Base URL or Model ID change
                    const baseUrlInputEl = ApiUi.baseUrlInput();
                    if (baseUrlInputEl) {
                        baseUrlInputEl.addEventListener("input", () => {
                            ApiUi.clearStatus();
                        });
                    }
                    const modelIdInputEl = ApiUi.modelIdInput();
                    if (modelIdInputEl) {
                        modelIdInputEl.addEventListener("input", () => {
                            ApiUi.clearStatus();
                        });
                    }
                    window.kimiLLM.setSystemPrompt(prompt);
                }
                const systemPromptInput = window.KimiDOMUtils.get("#system-prompt");
                if (systemPromptInput) systemPromptInput.value = prompt;
                await window.loadCharacterSection();
                if (settingsPanel && scrollTop !== null) {
                    requestAnimationFrame(() => {
                        settingsPanel.scrollTop = scrollTop;
                    });
                }
                saveCharacterBtn.setAttribute("data-i18n", "saved");
                saveCharacterBtn.classList.add("success");
                saveCharacterBtn.disabled = true;

                setTimeout(() => {
                    saveCharacterBtn.setAttribute("data-i18n", "save");
                    saveCharacterBtn.classList.remove("success");
                    saveCharacterBtn.disabled = false;
                }, 1500);
            });
        }
        let settingsButton2 = window.KimiDOMUtils.get("#settings-button");
        if (settingsButton2) {
            settingsButton2.addEventListener("click", window.loadCharacterSection);
        }
    }
    await attachCharacterSection();

    const chatContainer = document.getElementById("chat-container");
    const chatButton = document.getElementById("chat-button");
    const chatToggle = document.getElementById("chat-toggle");
    const chatMessages = document.getElementById("chat-messages");
    const chatInput = document.getElementById("chat-input");
    const sendButton = document.getElementById("send-button");
    const chatDelete = document.getElementById("chat-delete");
    const waitingIndicator = document.getElementById("waiting-indicator");

    if (!chatContainer || !chatButton || !chatMessages) {
        console.error("Critical chat elements missing from DOM");
        return;
    }

    window.kimiOverlayManager = new window.KimiOverlayManager();

    chatButton.addEventListener("click", () => {
        window.kimiOverlayManager.toggle("chat-container");
        if (window.kimiOverlayManager.isOpen("chat-container")) {
            window.loadChatHistory();
        }
    });

    if (chatToggle) {
        chatToggle.addEventListener("click", () => {
            window.kimiOverlayManager.close("chat-container");
        });
    }

    // Setup chat input and send button event listeners
    if (sendButton) {
        sendButton.addEventListener("click", () => {
            if (typeof window.sendMessage === "function") {
                window.sendMessage();
            } else {
                console.error("sendMessage function not available");
            }
        });
        console.log("Send button event listener attached");
    } else {
        console.error("Send button not found");
    }

    if (chatInput) {
        chatInput.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (typeof window.sendMessage === "function") {
                    window.sendMessage();
                } else {
                    console.error("sendMessage function not available");
                }
            }
        });
        console.log("Chat input event listener attached");
    } else {
        console.error("Chat input not found");
    }

    const settingsOverlay = document.getElementById("settings-overlay");
    const settingsButton = document.getElementById("settings-button");
    const settingsClose = document.getElementById("settings-close");

    const helpOverlay = document.getElementById("help-overlay");
    const helpButton = document.getElementById("help-button");
    const helpClose = document.getElementById("help-close");

    if (!settingsButton || !helpButton) {
        console.error("Critical UI buttons missing from DOM");
        return;
    }

    helpButton.addEventListener("click", () => {
        window.kimiOverlayManager.open("help-overlay");
    });

    if (helpClose) {
        helpClose.addEventListener("click", () => {
            window.kimiOverlayManager.close("help-overlay");
        });
    }

    settingsButton.addEventListener("click", () => {
        window.kimiOverlayManager.open("settings-overlay");

        // Prevent multiple settings loading
        if (!window._settingsLoading) {
            window._settingsLoading = true;
            window.loadSettingsData();

            setTimeout(() => {
                window.updateTabsScrollIndicator();
                if (window.initializeAllSliders) window.initializeAllSliders();
                if (window.syncLLMMaxTokensSlider) window.syncLLMMaxTokensSlider();
                if (window.syncLLMTemperatureSlider) window.syncLLMTemperatureSlider();
                if (window.setupSettingsListeners) window.setupSettingsListeners(window.kimiDB, window.kimiMemory);
                if (window.syncPersonalityTraits) window.syncPersonalityTraits();
                if (window.ensureVideoContextConsistency) window.ensureVideoContextConsistency();

                // Only retry loading models if not already done
                if (window.loadAvailableModels && !loadAvailableModels._loading) {
                    setTimeout(() => window.loadAvailableModels(), 100);
                }

                window._settingsLoading = false;
            }, 200);
        }
    });

    if (settingsClose) {
        settingsClose.addEventListener("click", () => {
            window.kimiOverlayManager.close("settings-overlay");
        });
    }

    // Initialisation unifiée de la gestion des tabs
    window.kimiTabManager = new window.KimiTabManager({
        onTabChange: async tabName => {
            if (tabName === "llm" || tabName === "api") {
                if (window.kimiDB) {
                    const selectedCharacter = await window.kimiDB.getSelectedCharacter();
                    const prompt = await window.kimiDB.getSystemPromptForCharacter(selectedCharacter);
                    const systemPromptInput = document.getElementById("system-prompt");
                    if (systemPromptInput) systemPromptInput.value = prompt;
                }
            }
            if (tabName === "personality") {
                await window.loadCharacterSection();
            }
        }
    });

    window.kimiUIEventManager = new window.KimiUIEventManager();
    window.kimiUIEventManager.addEvent(window, "resize", window.updateTabsScrollIndicator);

    const saveSystemPromptButton = document.getElementById("save-system-prompt");
    if (saveSystemPromptButton) {
        saveSystemPromptButton.addEventListener("click", async () => {
            const selectedCharacter = await window.kimiDB.getPreference("selectedCharacter", "kimi");
            const systemPromptInput = document.getElementById("system-prompt");
            if (systemPromptInput && window.kimiDB.setSystemPromptForCharacter) {
                await window.kimiDB.setSystemPromptForCharacter(selectedCharacter, systemPromptInput.value);
                if (window.kimiLLM && window.kimiLLM.setSystemPrompt) window.kimiLLM.setSystemPrompt(systemPromptInput.value);
                const originalText = saveSystemPromptButton.textContent;
                saveSystemPromptButton.textContent = "Saved!";
                saveSystemPromptButton.classList.add("success");
                saveSystemPromptButton.disabled = true;
                setTimeout(() => {
                    saveSystemPromptButton.setAttribute("data-i18n", "save");
                    applyTranslations();
                    // Re-enable the button after the success feedback
                    saveSystemPromptButton.disabled = false;
                    saveSystemPromptButton.classList.remove("success");
                    // Ensure text reflects i18n "save" state
                    // (applyTranslations above will set the text from locale)
                }, 1500);
            }
        });
    }
    const resetSystemPromptButton = document.getElementById("reset-system-prompt");
    const systemPromptInput = document.getElementById("system-prompt");
    if (resetSystemPromptButton) {
        resetSystemPromptButton.addEventListener("click", async () => {
            const selectedCharacter = await window.kimiDB.getPreference("selectedCharacter", "kimi");
            if (systemPromptInput && window.kimiDB && window.kimiLLM) {
                await window.kimiDB.setSystemPromptForCharacter(selectedCharacter, DEFAULT_SYSTEM_PROMPT);
                systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
                window.kimiLLM.setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
                resetSystemPromptButton.textContent = "Reset!";
                resetSystemPromptButton.classList.add("animated");
                resetSystemPromptButton.setAttribute("data-i18n", "reset_done");
                applyTranslations();
                setTimeout(() => {
                    resetSystemPromptButton.setAttribute("data-i18n", "reset_to_default");
                    applyTranslations();
                }, 1500);

                // After a reset, allow saving again
                if (saveSystemPromptButton) {
                    saveSystemPromptButton.disabled = false;
                    saveSystemPromptButton.classList.remove("success");
                    saveSystemPromptButton.setAttribute("data-i18n", "save");
                    applyTranslations();
                }
            }
        });
    }

    // Enable the Save button whenever the prompt content changes
    if (systemPromptInput && saveSystemPromptButton) {
        systemPromptInput.addEventListener("input", () => {
            if (saveSystemPromptButton.disabled) {
                saveSystemPromptButton.disabled = false;
            }
            saveSystemPromptButton.classList.remove("success");
            saveSystemPromptButton.setAttribute("data-i18n", "save");
            applyTranslations();
        });
    }

    window.kimiFormManager = new window.KimiFormManager({ db: window.kimiDB, memory: window.kimiMemory });

    const testVoiceButton = document.getElementById("test-voice");
    if (testVoiceButton) {
        testVoiceButton.addEventListener("click", () => {
            if (voiceManager) {
                const rate = parseFloat(document.getElementById("voice-rate").value);
                const pitch = parseFloat(document.getElementById("voice-pitch").value);
                const volume = parseFloat(document.getElementById("voice-volume").value);

                if (window.kimiMemory.preferences) {
                    window.kimiMemory.preferences.voiceRate = rate;
                    window.kimiMemory.preferences.voicePitch = pitch;
                    window.kimiMemory.preferences.voiceVolume = volume;
                }

                const testMessage =
                    window.kimiI18nManager?.t("voice_test_message") ||
                    "Hello my love! Here is my new voice configured with all the settings! Do you like it?";
                voiceManager.speak(testMessage, {
                    rate,
                    pitch,
                    volume
                });
            } else {
                console.warn("Voice manager not initialized");
            }
        });
    }

    const testApiButton = document.getElementById("test-api");
    if (testApiButton) {
        testApiButton.addEventListener("click", async () => {
            const statusSpan = ApiUi.statusSpan();
            const apiKeyInput = ApiUi.apiKeyInput();
            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
            const providerSelect = ApiUi.providerSelect();
            const baseUrlInput = ApiUi.baseUrlInput();
            const modelIdInput = ApiUi.modelIdInput();
            const provider = providerSelect ? providerSelect.value : "openrouter";
            const baseUrl = baseUrlInput ? baseUrlInput.value.trim() : "";
            const modelId = modelIdInput ? modelIdInput.value.trim() : "";

            if (!statusSpan) return;

            if (provider !== "ollama" && !apiKey) {
                statusSpan.textContent = window.kimiI18nManager?.t("api_key_missing") || "API key missing";
                statusSpan.style.color = "#ff6b6b";
                return;
            }

            // Validate API key format before saving/testing
            if (provider !== "ollama") {
                const isValid = (window.KIMI_VALIDATORS && window.KIMI_VALIDATORS.validateApiKey(apiKey)) || false;
                if (!isValid) {
                    statusSpan.textContent =
                        window.kimiI18nManager?.t("api_key_invalid_format") ||
                        "Invalid API key format (must start with sk-or-v1-)";
                    statusSpan.style.color = "#ff6b6b";
                    return;
                }
            }

            if (window.kimiDB) {
                // Save API key under provider-specific preference key (skip for Ollama)
                if (provider !== "ollama") {
                    const keyPrefMap = {
                        openrouter: "openrouterApiKey",
                        openai: "apiKey_openai",
                        groq: "apiKey_groq",
                        together: "apiKey_together",
                        deepseek: "apiKey_deepseek",
                        "openai-compatible": "apiKey_custom"
                    };
                    const keyPref = keyPrefMap[provider] || "llmApiKey";
                    await window.kimiDB.setPreference(keyPref, apiKey);
                }
                await window.kimiDB.setPreference("llmProvider", provider);
                if (baseUrl) await window.kimiDB.setPreference("llmBaseUrl", baseUrl);
                if (modelId) await window.kimiDB.setPreference("llmModelId", modelId);
            }

            statusSpan.textContent = "Testing in progress...";
            statusSpan.style.color = "#ffa726";

            try {
                if (window.kimiLLM) {
                    let result;
                    if (provider === "openrouter") {
                        result = await window.kimiLLM.testModel(window.kimiLLM.currentModel, "Bonjour");
                    } else if (provider === "ollama") {
                        const response = await window.kimiLLM.chatWithLocal("Bonjour", { maxTokens: 2 });
                        result = { success: true, response };
                    } else {
                        const response = await window.kimiLLM.chatWithOpenAICompatible("Bonjour", { maxTokens: 2 });
                        result = { success: true, response };
                    }
                    if (result.success) {
                        statusSpan.textContent = "Connection successful!";
                        statusSpan.style.color = "#4caf50";
                        const savedBadge = ApiUi.savedBadge();
                        if (savedBadge) {
                            savedBadge.textContent =
                                (window.kimiI18nManager && window.kimiI18nManager.t("saved_short")) || "Saved";
                            savedBadge.style.display = "inline";
                        }

                        if (result.response) {
                            setTimeout(() => {
                                statusSpan.textContent = `Test response: \"${result.response.substring(0, 50)}...\"`;
                            }, 1000);
                        }
                        // Mark test success explicitly
                        ApiUi.setTestPresence("#4caf50");
                    } else {
                        statusSpan.textContent = `${result.error}`;
                        statusSpan.style.color = "#ff6b6b";
                        ApiUi.setTestPresence("#9e9e9e");
                        if (result.error.includes("similaires disponibles")) {
                            setTimeout(() => {}, 1000);
                        }
                    }
                } else {
                    statusSpan.textContent = "LLM manager not initialized";
                    statusSpan.style.color = "#ff6b6b";
                    ApiUi.setTestPresence("#9e9e9e");
                }
            } catch (error) {
                console.error("Error while testing API:", error);
                statusSpan.textContent = `Error: ${error.message}`;
                statusSpan.style.color = "#ff6b6b";
                ApiUi.setTestPresence("#9e9e9e");

                if (error.message.includes("non disponible")) {
                    setTimeout(() => {}, 1000);
                }
            }
        });
    }

    // Global, single handler for API key input to save and update presence in real-time
    (function setupApiKeyInputHandler() {
        const input = ApiUi.apiKeyInput();
        if (!input) return;
        let t;
        input.addEventListener("input", () => {
            clearTimeout(t);
            t = setTimeout(async () => {
                const providerEl = ApiUi.providerSelect();
                const provider = providerEl ? providerEl.value : "openrouter";
                const keyPrefMap = {
                    openrouter: "openrouterApiKey",
                    openai: "apiKey_openai",
                    groq: "apiKey_groq",
                    together: "apiKey_together",
                    deepseek: "apiKey_deepseek",
                    "openai-compatible": "apiKey_custom"
                };
                const keyPref = keyPrefMap[provider] || "llmApiKey";
                const value = input.value.trim();
                // Update Test button state immediately
                const validNow = !!(window.KIMI_VALIDATORS && window.KIMI_VALIDATORS.validateApiKey(value));
                ApiUi.setTestEnabled(provider === "ollama" ? true : validNow);
                if (window.kimiDB) {
                    try {
                        await window.kimiDB.setPreference(keyPref, value);
                        const savedBadge = ApiUi.savedBadge();
                        if (savedBadge) {
                            savedBadge.textContent =
                                (window.kimiI18nManager && window.kimiI18nManager.t("saved_short")) || "Saved";
                            savedBadge.style.display = value ? "inline" : "none";
                        }
                        ApiUi.setPresence(value ? "#4caf50" : "#9e9e9e");
                        // Any key change invalidates previous test state
                        ApiUi.setTestPresence("#9e9e9e");
                        ApiUi.clearStatus();
                    } catch (e) {
                        // Validation error from DB
                        const s = ApiUi.statusSpan();
                        if (s) {
                            s.textContent = e?.message || "Invalid API key";
                            s.style.color = "#ff6b6b";
                        }
                        ApiUi.setTestEnabled(false);
                        ApiUi.setTestPresence("#9e9e9e");
                    }
                }
            }, window.KIMI_SECURITY_CONFIG?.DEBOUNCE_DELAY || 300);
        });
    })();

    // Toggle show/hide for API key
    (function setupToggleEye() {
        const btn = ApiUi.toggleBtn();
        const input = ApiUi.apiKeyInput();
        if (!btn || !input) return;
        btn.addEventListener("click", () => {
            const showing = input.type === "text";
            input.type = showing ? "password" : "text";
            btn.setAttribute("aria-pressed", String(!showing));
            const icon = btn.querySelector("i");
            if (icon) {
                icon.classList.toggle("fa-eye");
                icon.classList.toggle("fa-eye-slash");
            }
            btn.setAttribute("aria-label", showing ? "Show API key" : "Hide API key");
        });
    })();

    kimiInit.register(
        "appearanceManager",
        async () => {
            const manager = new KimiAppearanceManager(window.kimiDB);
            await manager.init();
            window.kimiAppearanceManager = manager;
            return manager;
        },
        [],
        500
    );

    kimiInit.register(
        "dataManager",
        async () => {
            const manager = new KimiDataManager(window.kimiDB);
            await manager.init();
            window.kimiDataManager = manager;
            return manager;
        },
        [],
        600
    );

    kimiInit.register(
        "voiceManager",
        async () => {
            if (window.KimiVoiceManager) {
                const manager = new KimiVoiceManager(window.kimiDB, window.kimiMemory);
                const success = await manager.init();
                if (success) {
                    manager.setOnSpeechAnalysis(window.analyzeAndReact);
                    return manager;
                }
            }
            return null;
        },
        [],
        1000
    );

    try {
        await kimiInit.initializeAll();
        window.voiceManager = kimiInit.getInstance("voiceManager");
        window.kimiMemory.updateFavorabilityBar();
    } catch (error) {
        console.error("Initialization error:", error);
    }

    // Setup unified event handlers to prevent duplicates
    setupUnifiedEventHandlers();

    // Initialize language and UI
    await initializeLanguageAndUI();

    // Setup message handling
    setupMessageHandling();

    // Function definitions
    function setupUnifiedEventHandlers() {
        // Cleanup existing event handlers
        if (window._kimiEventCleanup && Array.isArray(window._kimiEventCleanup)) {
            window._kimiEventCleanup.forEach(cleanup => {
                if (typeof cleanup === "function") cleanup();
            });
        }
        window._kimiEventCleanup = [];

        // Helper function to safely add event listeners
        function safeAddEventListener(element, event, handler, identifier) {
            if (element && !element[identifier]) {
                element.addEventListener(event, handler);
                element[identifier] = true;
                window._kimiEventCleanup.push(() => {
                    element.removeEventListener(event, handler);
                    element[identifier] = false;
                });
            }
        }

        // Chat event handlers
        const chatDelete = document.getElementById("chat-delete");
        if (chatDelete) {
            const handler = async () => {
                if (confirm("Do you really want to delete all chat messages? This cannot be undone.")) {
                    const chatMessages = document.getElementById("chat-messages");
                    if (chatMessages) {
                        chatMessages.textContent = "";
                    }
                    if (window.kimiDB && window.kimiDB.db) {
                        try {
                            await window.kimiDB.db.conversations.clear();
                        } catch (error) {
                            console.error("Error deleting conversations:", error);
                        }
                    }
                }
            };
            safeAddEventListener(chatDelete, "click", handler, "_kimiChatDeleteHandlerAttached");
        }
    }

    async function initializeLanguageAndUI() {
        // Language initialization
        window.kimiI18nManager = new window.KimiI18nManager();
        const lang = await kimiDB.getPreference("selectedLanguage", "en");
        await window.kimiI18nManager.setLanguage(lang);
        const langSelect = document.getElementById("language-selection");
        if (langSelect) {
            langSelect.value = lang;
            langSelect.addEventListener("change", async function (e) {
                const selectedLang = e.target.value;
                await kimiDB.setPreference("selectedLanguage", selectedLang);
                await window.kimiI18nManager.setLanguage(selectedLang);

                if (window.voiceManager && window.voiceManager.handleLanguageChange) {
                    await window.voiceManager.handleLanguageChange({ target: { value: selectedLang } });
                }

                if (window.kimiLLM && window.kimiLLM.setSystemPrompt && kimiDB) {
                    const selectedCharacter = await kimiDB.getPreference("selectedCharacter", "kimi");
                    let prompt = await kimiDB.getSystemPromptForCharacter(selectedCharacter);
                    let langInstruction;

                    switch (selectedLang) {
                        case "fr":
                            langInstruction = "Always reply exclusively in French. Do not mix languages.";
                            break;
                        case "es":
                            langInstruction = "Always reply exclusively in Spanish. Do not mix languages.";
                            break;
                        case "de":
                            langInstruction = "Always reply exclusively in German. Do not mix languages.";
                            break;
                        case "it":
                            langInstruction = "Always reply exclusively in Italian. Do not mix languages.";
                            break;
                        case "ja":
                            langInstruction = "Always reply exclusively in Japanese. Do not mix languages.";
                            break;
                        case "zh":
                            langInstruction = "Always reply exclusively in Chinese. Do not mix languages.";
                            break;
                        default:
                            langInstruction = "Always reply exclusively in English. Do not mix languages.";
                            break;
                    }

                    if (prompt) {
                        prompt = langInstruction + "\n" + prompt;
                    } else {
                        prompt = langInstruction;
                    }
                    window.kimiLLM.setSystemPrompt(prompt);
                    const systemPromptInput = document.getElementById("system-prompt");
                    if (systemPromptInput) systemPromptInput.value = prompt;
                }
            });
        }

        window.kimiUIStateManager = new window.KimiUIStateManager();
    }

    function setupMessageHandling() {
        // Chat event handlers are already attached in the main script
        // No need to reattach them here to avoid duplicates
    }

    // Add personality change listener
    window.addEventListener("personalityUpdated", async event => {
        const { character, traits } = event.detail;
        console.log(`🧠 Personality updated for ${character}:`, traits);

        // Update video context based on new traits
        if (window.kimiVideo && window.kimiVideo.setMoodByPersonality) {
            window.kimiVideo.setMoodByPersonality(traits);
        }

        // Update voice modulation if available
        if (window.voiceManager && window.voiceManager.updatePersonalityModulation) {
            window.voiceManager.updatePersonalityModulation(traits);
        }

        // Update UI elements that depend on personality
        // Favorability bar will be updated by KimiMemory system
    });

    // Add global keyboard event listener for microphone toggle (F8)
    let f8KeyPressed = false;

    document.addEventListener("keydown", function (event) {
        // Check if F8 key is pressed and no input field is focused
        if (event.key === "F8" && !f8KeyPressed) {
            f8KeyPressed = true;
            const activeElement = document.activeElement;
            const isInputFocused =
                activeElement &&
                (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || activeElement.isContentEditable);

            // Only trigger if no input field is focused
            if (!isInputFocused && window.voiceManager && window.voiceManager.toggleMicrophone) {
                event.preventDefault();
                window.voiceManager.toggleMicrophone();
            }
        }
    });

    document.addEventListener("keyup", function (event) {
        if (event.key === "F8") {
            f8KeyPressed = false;
        }
    });

    // Monitor for consistency and errors
    setInterval(async () => {
        if (window.ensureVideoContextConsistency) {
            await window.ensureVideoContextConsistency();
        }
    }, 30000); // Check every 30 seconds
});
