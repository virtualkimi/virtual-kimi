import KimiDatabase from "./kimi-database.js";
import KimiLLMManager from "./kimi-llm-manager.js";
import KimiEmotionSystem from "./kimi-emotion-system.js";
import KimiMemorySystem from "./kimi-memory-system.js";
import KimiMemory from "./kimi-memory.js";

document.addEventListener("DOMContentLoaded", async function () {
    const DEFAULT_SYSTEM_PROMPT = window.DEFAULT_SYSTEM_PROMPT;

    let kimiDB = null;
    let kimiLLM = null;
    let isSystemReady = false;

    // Global debug flag for sync/log verbosity (default: false)
    if (typeof window.KIMI_DEBUG_SYNC === "undefined") {
        window.KIMI_DEBUG_SYNC = false;
    }

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
        kimiLLM = new KimiLLMManager(kimiDB);
        window.kimiLLM = kimiLLM;
        await kimiLLM.init();

        // Initialize unified emotion system
        window.kimiEmotionSystem = new KimiEmotionSystem(kimiDB);

        // Initialize the new memory system
        window.kimiMemorySystem = new KimiMemorySystem(kimiDB);
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
        // API config UI will be initialized after ApiUi is defined
        if (window.refreshAllSliders) {
            try {
                await window.refreshAllSliders();
            } catch {}
        }
    } catch (error) {
        console.error("Initialization error:", error);
    }
    // Centralized helpers for API config UI
    const ApiUi = {
        presenceDot: () => document.getElementById("api-key-presence"),
        presenceDotTest: () => document.getElementById("api-key-presence-test"),
        apiKeyInput: () => document.getElementById("provider-api-key"),
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
            // Resolve base URL preference: prefer provider-specific stored key for modifiable
            let baseUrl;
            const shared = window.KimiProviderPlaceholders || {};
            if (provider === "openai-compatible" || provider === "ollama") {
                const key = `llmBaseUrl_${provider}`;
                const defaultForProvider = provider === "openai-compatible" ? "" : shared[provider];
                baseUrl = await window.kimiDB.getPreference(key, defaultForProvider);
            } else {
                baseUrl = shared[provider] || shared.openai;
            }
            const modelId = await window.kimiDB.getPreference(
                "llmModelId",
                window.kimiLLM ? window.kimiLLM.currentModel : "model-id"
            );
            const providerSelect = ApiUi.providerSelect();
            if (providerSelect) providerSelect.value = provider;
            const baseUrlInput = ApiUi.baseUrlInput();
            const modelIdInput = ApiUi.modelIdInput();
            const apiKeyInput = ApiUi.apiKeyInput();

            // Set base URL based on modifiability
            if (baseUrlInput) {
                const isModifiable = isUrlModifiable(provider);
                baseUrlInput.value = baseUrl || "";
                baseUrlInput.disabled = !isModifiable;
                baseUrlInput.style.opacity = isModifiable ? "1" : "0.6";
            }
            // Only prefill model for OpenRouter, others should show placeholder only
            if (modelIdInput) {
                if (provider === "openrouter") {
                    if (!modelIdInput.value) modelIdInput.value = modelId;
                } else {
                    modelIdInput.value = "";
                }
            }
            // Load the provider-specific key
            const keyPref = window.KimiProviderUtils
                ? window.KimiProviderUtils.getKeyPrefForProvider(provider)
                : "providerApiKey";
            const storedKey = await window.kimiDB.getPreference(keyPref, "");
            if (apiKeyInput) apiKeyInput.value = storedKey || "";
            ApiUi.setPresence(storedKey ? "#4caf50" : "#9e9e9e");
            ApiUi.setTestPresence("#9e9e9e");
            const savedBadge = ApiUi.savedBadge();
            if (savedBadge) {
                // Show only if provider requires a key and key exists
                if (provider !== "ollama" && storedKey) {
                    savedBadge.style.display = "inline";
                } else {
                    savedBadge.style.display = "none";
                }
            }
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
    // Hydrate API config UI from DB after ApiUi is defined and function declared
    initializeApiConfigUI();

    // Listen for model changes and update the UI only for OpenRouter
    window.addEventListener("llmModelChanged", function (event) {
        const modelIdInput = ApiUi.modelIdInput();
        const providerSelect = ApiUi.providerSelect();

        // Only update the field if current provider is OpenRouter
        if (modelIdInput && event.detail && event.detail.id && providerSelect && providerSelect.value === "openrouter") {
            modelIdInput.value = event.detail.id;
        }
    });

    // Helper function to check if URL is modifiable for current provider
    function isUrlModifiable(provider) {
        return provider === "openai-compatible" || provider === "ollama";
    }

    const providerSelectEl = document.getElementById("llm-provider");
    if (providerSelectEl) {
        providerSelectEl.addEventListener("change", async function (e) {
            const provider = e.target.value;
            const baseUrlInput = ApiUi.baseUrlInput();
            const modelIdInput = ApiUi.modelIdInput();
            const apiKeyInput = ApiUi.apiKeyInput();

            const shared = window.KimiProviderPlaceholders || {};
            const p = {
                url: shared[provider] || "",
                keyPh: provider === "ollama" ? "" : "your-key",
                model: provider === "openrouter" && window.kimiLLM ? window.kimiLLM.currentModel : "model-id"
            };
            if (baseUrlInput) {
                // Set placeholder: for openai-compatible we want an empty placeholder
                baseUrlInput.placeholder = provider === "openai-compatible" ? "" : p.url;
                // Only allow URL modification for custom and ollama providers
                const isModifiable = isUrlModifiable(provider);

                if (isModifiable) {
                    // For custom and ollama: load saved URL or use sensible default per provider
                    const defaultForProvider = provider === "openai-compatible" ? "" : p.url;
                    const key = `llmBaseUrl_${provider}`;
                    const savedUrl = await window.kimiDB.getPreference(key, defaultForProvider);
                    baseUrlInput.value = savedUrl || "";
                    baseUrlInput.disabled = false;
                    baseUrlInput.style.opacity = "1";
                } else {
                    // For other providers: fixed URL, not modifiable
                    baseUrlInput.value = p.url;
                    baseUrlInput.disabled = true;
                    baseUrlInput.style.opacity = "0.6";
                }
            }
            if (apiKeyInput) {
                apiKeyInput.placeholder = p.keyPh;
                // Masquer/désactiver le champ pour Ollama/local
                if (provider === "ollama") {
                    apiKeyInput.value = "";
                    apiKeyInput.disabled = true;
                    apiKeyInput.style.display = "none";
                } else {
                    apiKeyInput.disabled = false;
                    apiKeyInput.style.display = "";
                }
            }
            if (modelIdInput) {
                modelIdInput.placeholder = p.model;
                // Only populate the field for OpenRouter since those are the models we have in the list
                // For other providers, user must manually enter the provider-specific model ID
                modelIdInput.value = provider === "openrouter" && window.kimiLLM ? window.kimiLLM.currentModel : "";
            }
            if (window.kimiDB) {
                await window.kimiDB.setPreference("llmProvider", provider);

                const apiKeyLabel = document.getElementById("api-key-label");
                // Load provider-specific key into the input for clarity
                const keyPref = window.KimiProviderUtils
                    ? window.KimiProviderUtils.getKeyPrefForProvider(provider)
                    : "providerApiKey";
                const storedKey = await window.kimiDB.getPreference(keyPref, "");
                if (apiKeyInput && provider !== "ollama") apiKeyInput.value = storedKey || "";
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
                    apiKeyLabel.textContent = window.KimiProviderUtils
                        ? window.KimiProviderUtils.getLabelForProvider(provider)
                        : "API Key";
                }
                const savedBadge = ApiUi.savedBadge();
                if (savedBadge) {
                    if (provider !== "ollama" && storedKey) {
                        savedBadge.style.display = "inline";
                    } else {
                        savedBadge.style.display = "none";
                    }
                }
                ApiUi.clearStatus();

                // Save URL after all UI updates are complete
                const isModifiableFinal = isUrlModifiable(provider);
                // Only persist provider-specific llmBaseUrl when the provider allows modification.
                if (isModifiableFinal && baseUrlInput) {
                    const key = `llmBaseUrl_${provider}`;
                    await window.kimiDB.setPreference(key, baseUrlInput.value || "");
                }
            }
        });

        // Listen for model ID changes and update the current model
        const modelIdInput = ApiUi.modelIdInput();
        if (modelIdInput) {
            modelIdInput.addEventListener("blur", async function (e) {
                const newModelId = e.target.value.trim();
                if (newModelId && window.kimiLLM && newModelId !== window.kimiLLM.currentModel) {
                    try {
                        await window.kimiLLM.setCurrentModel(newModelId);
                    } catch (error) {
                        console.warn("Failed to set model:", error.message);
                        // Reset to current model if setting failed
                        e.target.value = window.kimiLLM.currentModel || "";
                    }
                }
            });
        }

        // Listen for Base URL changes and save for modifiable providers
        const baseUrlInput = ApiUi.baseUrlInput();
        if (baseUrlInput) {
            baseUrlInput.addEventListener("blur", async function (e) {
                const providerSelect = ApiUi.providerSelect();
                const provider = providerSelect ? providerSelect.value : "openrouter";
                const isModifiable = isUrlModifiable(provider);

                if (isModifiable && window.kimiDB) {
                    const newUrl = e.target.value.trim();
                    try {
                        const key = `llmBaseUrl_${provider}`;
                        // Allow empty string to be saved for openai-compatible (user may clear it)
                        await window.kimiDB.setPreference(key, newUrl || "");
                    } catch (error) {
                        console.warn("Failed to save base URL:", error.message);
                    }
                }
            });
        }
    }

    // Loading screen management
    const hideLoadingScreen = () => {
        const loadingScreen = document.getElementById("loading-screen");
        if (loadingScreen) {
            loadingScreen.style.opacity = "0";
            setTimeout(() => {
                loadingScreen.style.display = "none";
            }, 500);
        }
    };

    // Hide loading screen when resources are loaded
    if (document.readyState === "complete") {
        setTimeout(hideLoadingScreen, 1000);
    } else {
        window.addEventListener("load", () => {
            setTimeout(hideLoadingScreen, 1000);
        });
    }

    // Use centralized video utilities
    let video1 = window.KimiVideoManager.getVideoElement("#video1");
    let video2 = window.KimiVideoManager.getVideoElement("#video2");
    if (!video1 || !video2) {
        const videoContainer = document.querySelector(".video-container");
        if (videoContainer) {
            video1 = window.KimiVideoManager.createVideoElement("video1", "bg-video active");
            video2 = window.KimiVideoManager.createVideoElement("video2", "bg-video");
            videoContainer.appendChild(video1);
            videoContainer.appendChild(video2);
        }
    }
    let activeVideo = video1;
    let inactiveVideo = video2;
    kimiVideo = new window.KimiVideoManager(video1, video2);
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
                // Character save should not toggle the API key saved indicator.
                const promptInput = window.KimiDOMUtils.get(`#prompt-${charKey}`);
                const prompt = promptInput ? promptInput.value : "";

                await window.kimiDB.setSelectedCharacter(charKey);
                await window.kimiDB.setSystemPromptForCharacter(charKey, prompt);
                // Ensure memory system uses the correct character
                if (window.kimiMemorySystem) {
                    window.kimiMemorySystem.selectedCharacter = charKey;
                }
                if (window.kimiVideo && window.kimiVideo.setCharacter) {
                    window.kimiVideo.setCharacter(charKey);
                    if (window.kimiVideo.switchToContext) {
                        window.kimiVideo.switchToContext("neutral");
                    }
                }
                if (window.voiceManager && window.voiceManager.updateSelectedCharacter) {
                    await window.voiceManager.updateSelectedCharacter();
                }

                await window.loadCharacterSection();
                if (settingsPanel && scrollTop !== null) {
                    requestAnimationFrame(() => {
                        settingsPanel.scrollTop = scrollTop;
                    });
                }
                // Refresh memory tab after character selection
                if (window.kimiMemoryUI && typeof window.kimiMemoryUI.updateMemoryStats === "function") {
                    await window.kimiMemoryUI.updateMemoryStats();
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
        (function (el) {
            if (!el) return;
            const pad =
                (p => (p ? parseFloat(p) : 0))(getComputedStyle(el).paddingTop) +
                (p => (p ? parseFloat(p) : 0))(getComputedStyle(el).paddingBottom);
            const lh = parseFloat(getComputedStyle(el).lineHeight) || 18,
                max = lh * 4 + pad;
            const a = () => {
                el.style.height = "auto";
                el.style.height = Math.min(el.scrollHeight, max) + "px";
            };
            el.addEventListener("input", a);
            el.addEventListener("focus", a);
            setTimeout(a, 0);
        })(chatInput);
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
            if (tabName === "personality") {
                await window.loadCharacterSection();
            }
        }
    });

    window.kimiUIEventManager = new window.KimiUIEventManager();
    window.kimiUIEventManager.addEvent(window, "resize", window.updateTabsScrollIndicator);

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
                    const keyPref = window.KimiProviderUtils
                        ? window.KimiProviderUtils.getKeyPrefForProvider(provider)
                        : "providerApiKey";
                    await window.kimiDB.setPreference(keyPref, apiKey);
                }
                await window.kimiDB.setPreference("llmProvider", provider);
                if (baseUrl) {
                    // Save under provider-specific key to avoid cross-provider contamination
                    const key = `llmBaseUrl_${provider}`;
                    await window.kimiDB.setPreference(key, baseUrl);
                }
                if (modelId) await window.kimiDB.setPreference("llmModelId", modelId);
            }
            statusSpan.textContent = "Testing in progress...";
            statusSpan.style.color = "#ffa726";

            try {
                if (window.kimiLLM) {
                    // Test API minimal et centralisé pour tous les providers
                    const result = await window.kimiLLM.testApiKeyMinimal(modelId);
                    if (result.success) {
                        statusSpan.textContent = "Connection successful!";
                        statusSpan.style.color = "#4caf50";
                        // Only show saved badge if an actual non-empty API key is stored and provider requires one
                        const savedBadge = ApiUi.savedBadge();
                        if (savedBadge) {
                            const apiKeyInputEl = ApiUi.apiKeyInput();
                            const hasKey = apiKeyInputEl && apiKeyInputEl.value.trim().length > 0;
                            if (provider !== "ollama" && hasKey) {
                                savedBadge.textContent =
                                    (window.kimiI18nManager && window.kimiI18nManager.t("saved_short")) || "Saved";
                                savedBadge.style.display = "inline";
                            } else {
                                savedBadge.style.display = "none";
                            }
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
                const keyPref = window.KimiProviderUtils
                    ? window.KimiProviderUtils.getKeyPrefForProvider(provider)
                    : "providerApiKey";
                const value = input.value.trim();
                // Update Test button state immediately
                const validNow = !!(window.KIMI_VALIDATORS && window.KIMI_VALIDATORS.validateApiKey(value));
                ApiUi.setTestEnabled(provider === "ollama" ? true : validNow);
                if (window.kimiDB) {
                    try {
                        await window.kimiDB.setPreference(keyPref, value);
                        const savedBadge = ApiUi.savedBadge();
                        if (savedBadge) {
                            if (value) {
                                savedBadge.textContent =
                                    (window.kimiI18nManager && window.kimiI18nManager.t("saved_short")) || "Saved";
                                savedBadge.style.display = "inline";
                            } else {
                                savedBadge.style.display = "none";
                            }
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
        // SIMPLE FIX: Initialize _kimiEventCleanup to prevent undefined error
        if (!window._kimiEventCleanup) {
            window._kimiEventCleanup = [];
        }

        // Helper function to safely add event listeners
        function safeAddEventListener(element, event, handler, identifier) {
            if (element && !element[identifier]) {
                element.addEventListener(event, handler);
                element[identifier] = true;

                // Simple cleanup system
                const cleanupFn = () => {
                    element.removeEventListener(event, handler);
                    element[identifier] = false;
                };

                // Store cleanup function in the simple array
                window._kimiEventCleanup.push(cleanupFn);
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
        // Note: Language selector event listener is now handled by VoiceManager.setupLanguageSelector()
        // This prevents duplicate event listeners and ensures proper coordination between voice and i18n systems

        window.kimiUIStateManager = new window.KimiUIStateManager();
    }

    function setupMessageHandling() {
        // Chat event handlers are already attached in the main script
        // No need to reattach them here to avoid duplicates
    }

    // ==== BATCHED EVENT AGGREGATOR (personality + preferences) ====
    const batchedUpdates = {
        personality: null,
        preferences: new Set()
    };
    let batchTimer = null;

    function scheduleFlush() {
        if (batchTimer) return;
        batchTimer = setTimeout(flushBatchedUpdates, 100); // 100ms coalescing window
    }

    async function flushBatchedUpdates() {
        const personalityPayload = batchedUpdates.personality;
        const prefKeys = Array.from(batchedUpdates.preferences);
        batchedUpdates.personality = null;
        batchedUpdates.preferences.clear();
        batchTimer = null;

        // Apply personality update once (last-wins)
        if (personalityPayload) {
            const { character, traits } = personalityPayload;
            const defaults = (window.getTraitDefaults && window.getTraitDefaults()) || {
                affection: 55, // Lowered to match emotion system defaults
                romance: 50,
                empathy: 75,
                playfulness: 55,
                humor: 60,
                intelligence: 70
            };

            // Prefer persisted DB traits over defaults to avoid temporary inconsistencies.
            let dbTraits = null;
            try {
                if (window.kimiDB && typeof window.kimiDB.getAllPersonalityTraits === "function") {
                    dbTraits = await window.kimiDB.getAllPersonalityTraits(character || null);
                }
            } catch (e) {
                dbTraits = null;
            }

            const baseline = { ...defaults, ...(dbTraits || {}) };
            const safeTraits = {};
            for (const key of Object.keys(defaults)) {
                // If incoming payload provides the key, use it; otherwise use baseline (DB -> defaults)
                let raw = Object.prototype.hasOwnProperty.call(traits || {}, key) ? traits[key] : baseline[key];
                let v = Number(raw);
                if (!isFinite(v) || isNaN(v)) v = Number(baseline[key]);
                v = Math.max(0, Math.min(100, v));
                safeTraits[key] = v;
            }
            if (window.KIMI_DEBUG_SYNC) {
                console.log(`🧠 (Batched) Personality updated for ${character}:`, safeTraits);
            }
            // Centralize side-effects elsewhere; aggregator remains a coalesced logger only.
        }

        // Preference keys batch (currently UI refresh for sliders already handled elsewhere)
        if (prefKeys.length > 0) {
            // Potential future hook: log or perform aggregated operations
            // console.log("⚙️ Batched preference keys:", prefKeys);
        }
    }

    // Also listen to the DB-wrapped event name to preserve batched logging
    window.addEventListener("personality:updated", event => {
        batchedUpdates.personality = event.detail; // last event wins
        scheduleFlush();
    });
    window.addEventListener("preferenceUpdated", event => {
        if (event.detail?.key) batchedUpdates.preferences.add(event.detail.key);
        scheduleFlush();
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

    // Refresh sliders when character or language preference changes
    window.addEventListener("preferenceUpdated", evt => {
        const k = evt.detail?.key;
        if (!k) return;
        if (k === "selectedCharacter" || k === "selectedLanguage") {
            if (window.refreshAllSliders) {
                setTimeout(() => window.refreshAllSliders(), 50);
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

    // Personality sync: global event and wrappers
    (function setupPersonalitySync() {
        // Guard to avoid multiple initializations
        if (window._kimiPersonalitySyncReady) return;
        window._kimiPersonalitySyncReady = true;

        const dispatchUpdated = async (partialTraits, characterHint = null) => {
            try {
                const character = characterHint || (window.kimiDB && (await window.kimiDB.getSelectedCharacter())) || null;
                window.dispatchEvent(
                    new CustomEvent("personality:updated", {
                        detail: { character, traits: { ...partialTraits } }
                    })
                );
            } catch (e) {}
        };

        const tryWrapDB = () => {
            const db = window.kimiDB;
            if (!db) return false;

            const wrapOnce = (obj, methodName, buildTraitsFromArgs) => {
                if (!obj || typeof obj[methodName] !== "function") return;
                if (obj[methodName]._kimiWrapped) return;
                const original = obj[methodName].bind(obj);
                obj[methodName] = async function (...args) {
                    const res = await original(...args);
                    try {
                        const { traits, character } = await buildTraitsFromArgs(args, res);
                        if (traits && Object.keys(traits).length > 0) {
                            await dispatchUpdated(traits, character);
                        }
                    } catch (e) {}
                    return res;
                };
                obj[methodName]._kimiWrapped = true;
            };

            // setPersonalityTrait(trait, value, character?)
            wrapOnce(db, "setPersonalityTrait", async args => {
                const [trait, value, character] = args;
                return { traits: { [String(trait)]: Number(value) }, character: character || null };
            });

            // setPersonalityBatch(traitsObj, character?)
            wrapOnce(db, "setPersonalityBatch", async args => {
                const [traitsObj, character] = args;
                const traits = {};
                if (traitsObj && typeof traitsObj === "object") {
                    for (const [k, v] of Object.entries(traitsObj)) {
                        traits[String(k)] = Number(v);
                    }
                }
                return { traits, character: character || null };
            });

            // savePersonality(personalityObj, character?)
            wrapOnce(db, "savePersonality", async args => {
                const [personalityObj, character] = args;
                const traits = {};
                if (personalityObj && typeof personalityObj === "object") {
                    for (const [k, v] of Object.entries(personalityObj)) {
                        traits[String(k)] = Number(v);
                    }
                }
                return { traits, character: character || null };
            });

            return true;
        };

        // Try immediately and then retry a few times if DB not yet ready
        if (!tryWrapDB()) {
            let attempts = 0;
            const maxAttempts = 20;
            const interval = setInterval(() => {
                attempts++;
                if (tryWrapDB() || attempts >= maxAttempts) {
                    clearInterval(interval);
                }
            }, 250);
        }

        // Central listener: debounce UI/video sync to avoid thrashing
        let syncTimer = null;
        let lastTraits = {};
        window.addEventListener("personality:updated", async e => {
            try {
                if (e && e.detail && e.detail.traits) {
                    // Merge incremental updates
                    lastTraits = { ...lastTraits, ...e.detail.traits };
                }
            } catch {}

            if (syncTimer) clearTimeout(syncTimer);
            syncTimer = setTimeout(async () => {
                try {
                    const db = window.kimiDB;
                    const character = (e && e.detail && e.detail.character) || (db && (await db.getSelectedCharacter())) || null;
                    let traits = lastTraits;
                    if (!traits || Object.keys(traits).length === 0) {
                        // Fallback: fetch all traits if partial not provided
                        traits = db && (await db.getAllPersonalityTraits(character));
                    }

                    // 1) Update UI sliders if available
                    if (typeof window.updateSlider === "function" && traits) {
                        for (const [trait, value] of Object.entries(traits)) {
                            const id = `trait-${trait}`;
                            if (document.getElementById(id)) {
                                try {
                                    window.updateSlider(id, value);
                                } catch {}
                            }
                        }
                    }
                    if (typeof window.syncPersonalityTraits === "function") {
                        try {
                            await window.syncPersonalityTraits(character);
                        } catch {}
                    }

                    // 2) Update memory cache affection bar if available
                    if (window.kimiMemory && typeof window.kimiMemory.updateAffectionTrait === "function") {
                        try {
                            await window.kimiMemory.updateAffectionTrait();
                        } catch {}
                    }

                    // 3) Update video mood by personality
                    if (window.kimiVideo && typeof window.kimiVideo.setMoodByPersonality === "function") {
                        const allTraits =
                            traits && Object.keys(traits).length > 0
                                ? { ...traits }
                                : (db && (await db.getAllPersonalityTraits(character))) || {};
                        try {
                            window.kimiVideo.setMoodByPersonality(allTraits);
                        } catch {}
                        // 3b) Update voice modulation based on personality
                        try {
                            if (window.voiceManager && typeof window.voiceManager.updatePersonalityModulation === "function") {
                                window.voiceManager.updatePersonalityModulation(allTraits);
                            }
                        } catch {}
                    }

                    // 4) Ensure current video context is valid (lightweight guard)
                    let beforeInfo = null;
                    try {
                        if (window.kimiVideo && typeof window.kimiVideo.getCurrentVideoInfo === "function") {
                            beforeInfo = window.kimiVideo.getCurrentVideoInfo();
                        }
                    } catch {}

                    if (typeof window.ensureVideoContextConsistency === "function") {
                        try {
                            await window.ensureVideoContextConsistency();
                        } catch {}
                    }

                    try {
                        if (
                            window.KIMI_DEBUG_SYNC &&
                            window.kimiVideo &&
                            typeof window.kimiVideo.getCurrentVideoInfo === "function"
                        ) {
                            const afterInfo = window.kimiVideo.getCurrentVideoInfo();
                            if (
                                beforeInfo &&
                                afterInfo &&
                                (beforeInfo.context !== afterInfo.context ||
                                    beforeInfo.emotion !== afterInfo.emotion ||
                                    beforeInfo.category !== afterInfo.category)
                            ) {
                                console.log("🔧 SyncGuard: corrected video context", { from: beforeInfo, to: afterInfo });
                            }
                        }
                    } catch {}
                } catch {
                } finally {
                    lastTraits = {};
                }
            }, 120); // small debounce
        });
    })();
});
