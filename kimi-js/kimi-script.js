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

        // Expose globally
        window.kimiLLM = kimiLLM;

        // Load available models now that LLM is ready
        if (window.loadAvailableModels) {
            setTimeout(() => window.loadAvailableModels(), 500);
        }

        isSystemReady = true;
        window.isSystemReady = true;
    } catch (error) {
        console.error("Initialization error:", error);
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
            }
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
            const statusSpan = document.getElementById("api-status");
            const apiKeyInput = document.getElementById("openrouter-api-key");
            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";

            if (!statusSpan) return;

            if (!apiKey) {
                statusSpan.textContent = window.kimiI18nManager?.t("api_key_missing") || "API key missing";
                statusSpan.style.color = "#ff6b6b";
                return;
            }

            if (!apiKey.startsWith("sk-or-v1-")) {
                statusSpan.textContent =
                    window.kimiI18nManager?.t("api_key_invalid_format") || "Invalid API key format (must start with sk-or-v1-)";
                statusSpan.style.color = "#ff6b6b";
                return;
            }

            if (window.kimiDB) {
                await window.kimiDB.setPreference("openrouterApiKey", apiKey);
            }

            statusSpan.textContent = "Testing in progress...";
            statusSpan.style.color = "#ffa726";

            try {
                if (window.kimiLLM) {
                    const result = await window.kimiLLM.testModel(window.kimiLLM.currentModel, "Bonjour");
                    if (result.success) {
                        statusSpan.textContent = "Connection successful!";
                        statusSpan.style.color = "#4caf50";

                        if (result.response) {
                            setTimeout(() => {
                                statusSpan.textContent = `Test response: \"${result.response.substring(0, 50)}...\"`;
                            }, 1000);
                        }
                    } else {
                        statusSpan.textContent = `${result.error}`;
                        statusSpan.style.color = "#ff6b6b";

                        if (result.error.includes("similaires disponibles")) {
                            setTimeout(() => {}, 1000);
                        }
                    }
                } else {
                    statusSpan.textContent = "LLM manager not initialized";
                    statusSpan.style.color = "#ff6b6b";
                }
            } catch (error) {
                console.error("Error while testing API:", error);
                statusSpan.textContent = `Error: ${error.message}`;
                statusSpan.style.color = "#ff6b6b";

                if (error.message.includes("non disponible")) {
                    setTimeout(() => {}, 1000);
                }
            }
        });
    }

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
                if (window.kimiLLM && window.kimiLLM.setSystemPrompt && kimiDB) {
                    const selectedCharacter = await kimiDB.getPreference("selectedCharacter", "kimi");
                    let prompt = await kimiDB.getSystemPromptForCharacter(selectedCharacter);
                    let langInstruction =
                        "Always reply exclusively in " +
                        (selectedLang === "fr" ? "French" : "English") +
                        ". Do not mix languages.";
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
