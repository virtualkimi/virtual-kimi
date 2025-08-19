// ===== KIMI MODULE SYSTEM =====
// This file contains the remaining utility classes and functions

// Note: KimiMemory and KimiAppearanceManager have been moved to separate files
// This file now contains the remaining utility classes and functions

class KimiDataManager extends KimiBaseManager {
    constructor(database) {
        super();
        this.db = database;
    }

    async init() {
        this.setupDataControls();
        await this.updateStorageInfo();
    }

    setupDataControls() {
        const exportButton = document.getElementById("export-data");
        if (exportButton) {
            exportButton.addEventListener("click", () => this.exportAllData());
        }

        const importButton = document.getElementById("import-data");
        const importFile = document.getElementById("import-file");
        if (importButton && importFile) {
            importButton.addEventListener("click", () => importFile.click());
            importFile.addEventListener("change", e => this.importData(e));
        }

        const cleanButton = document.getElementById("clean-old-data");
        if (cleanButton) {
            cleanButton.addEventListener("click", async () => {
                if (!this.db) return;

                const confirmClean = confirm(
                    "Delete all conversation messages?\n\n" +
                        "This will remove all chat history but keep your preferences and settings.\n\n" +
                        "This action cannot be undone."
                );

                if (!confirmClean) {
                    return;
                }

                try {
                    // Clear all conversations directly
                    await this.db.db.conversations.clear();

                    // Clear chat UI
                    const chatMessages = document.getElementById("chat-messages");
                    if (chatMessages) {
                        chatMessages.textContent = "";
                    }

                    // Reload chat history
                    if (typeof window.loadChatHistory === "function") {
                        window.loadChatHistory();
                    }

                    await this.updateStorageInfo();
                    alert("All conversation messages have been deleted successfully!");
                } catch (error) {
                    console.error("Error cleaning conversations:", error);
                    alert("Error while cleaning conversations. Please try again.");
                }
            });
        }

        const resetButton = document.getElementById("reset-all-data");
        if (resetButton) {
            resetButton.addEventListener("click", () => this.resetAllData());
        }
    }

    async exportAllData() {
        if (!this.db) {
            console.error("Database not available");
            return;
        }

        try {
            const conversations = await this.db.getAllConversations();
            const preferences = await this.db.getAllPreferences();
            const personalityTraits = await this.db.getAllPersonalityTraits();
            const models = await this.db.getAllLLMModels();

            const exportData = {
                version: "1.0",
                exportDate: new Date().toISOString(),
                conversations: conversations,
                preferences: preferences,
                personalityTraits: personalityTraits,
                models: models,
                metadata: {
                    totalConversations: conversations.length,
                    totalPreferences: Object.keys(preferences).length,
                    totalTraits: Object.keys(personalityTraits).length,
                    totalModels: models.length
                }
            };

            const dataStr = JSON.stringify(exportData, null, 2);
            const dataBlob = new Blob([dataStr], { type: "application/json" });

            const url = URL.createObjectURL(dataBlob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `kimi-backup-${new Date().toISOString().split("T")[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Error during export:", error);
        }
    }

    async cleanOldData() {
        if (!this.db) {
            console.error("Database not available");
            return;
        }

        const confirmClean = confirm("Do you want to delete ALL conversations?\n\nThis action is irreversible!");
        if (!confirmClean) {
            return;
        }

        try {
            // Centralized: use kimi-database.js cleanOldConversations for all deletion logic
            await this.db.cleanOldConversations();

            if (typeof window.loadChatHistory === "function") {
                window.loadChatHistory();
            }
            const chatMessages = document.getElementById("chat-messages");
            if (chatMessages) {
                chatMessages.textContent = "";
            }

            await this.updateStorageInfo();
        } catch (error) {
            console.error("Error during cleaning:", error);
        }
    }

    async resetAllData() {
        if (!this.db) {
            console.error("Database not available");
            return;
        }

        const confirmReset = confirm(
            "WARNING!\n\n" +
                "Do you REALLY want to delete ALL data?\n\n" +
                "• All conversations\n" +
                "• All preferences\n" +
                "• All configured models\n" +
                "• All personality traits\n\n" +
                "This action is IRREVERSIBLE!"
        );

        if (!confirmReset) {
            return;
        }

        try {
            if (this.db.db) {
                this.db.db.close();
            }

            const deleteRequest = indexedDB.deleteDatabase(this.db.dbName);

            deleteRequest.onsuccess = () => {
                setTimeout(() => {
                    alert("The page will reload to complete the reset.");
                    location.reload();
                }, 500);
            };

            deleteRequest.onerror = () => {
                alert("Error while deleting the database. Please try again.");
            };
        } catch (error) {
            console.error("Error during reset:", error);
            alert("Error during reset. Please try again.");
        }
    }

    async updateStorageInfo() {
        if (!this.db) return;

        try {
            // Add a small delay to ensure database operations are complete
            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = await this.db.getStorageStats();

            const dbSizeEl = document.getElementById("db-size");
            const storageUsedEl = document.getElementById("storage-used");

            if (dbSizeEl) {
                dbSizeEl.textContent = this.formatFileSize(stats.totalSize || 0);
            }

            if (storageUsedEl) {
                const estimate = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;

                if (estimate) {
                    storageUsedEl.textContent = this.formatFileSize(estimate.usage || 0);
                } else {
                    storageUsedEl.textContent = "N/A";
                }
            }
        } catch (error) {
            console.error("Error while calculating storage:", error);

            const dbSizeEl = document.getElementById("db-size");
            const storageUsedEl = document.getElementById("storage-used");

            if (dbSizeEl) dbSizeEl.textContent = "Error";
            if (storageUsedEl) storageUsedEl.textContent = "Error";
        }
    }
}

// Fonctions utilitaires et logique (référencent window.*)

function updateFavorabilityLabel(characterKey) {
    const favorabilityLabel = document.getElementById("favorability-label");
    if (favorabilityLabel && window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[characterKey]) {
        favorabilityLabel.setAttribute("data-i18n", "affection_level_of");
        favorabilityLabel.setAttribute("data-i18n-params", JSON.stringify({ name: window.KIMI_CHARACTERS[characterKey].name }));
        favorabilityLabel.textContent = `💖 Affection level of ${window.KIMI_CHARACTERS[characterKey].name}`;
        applyTranslations();
    }
}

async function loadCharacterSection() {
    const kimiDB = window.kimiDB;
    if (!kimiDB) return;
    const characterGrid = document.getElementById("character-grid");
    if (!characterGrid) return;
    while (characterGrid.firstChild) {
        characterGrid.removeChild(characterGrid.firstChild);
    }
    const selectedCharacter = await kimiDB.getSelectedCharacter();
    for (const [key, info] of Object.entries(window.KIMI_CHARACTERS)) {
        const card = document.createElement("div");
        card.className = `character-card${key === selectedCharacter ? " selected" : ""}`;
        card.dataset.character = key;

        // Create character card elements safely
        const img = document.createElement("img");
        img.src = info.image;
        img.alt = info.name;

        const infoDiv = document.createElement("div");
        infoDiv.className = "character-info";

        const nameDiv = document.createElement("div");
        nameDiv.className = "character-name";
        nameDiv.textContent = info.name;

        const detailsDiv = document.createElement("div");
        detailsDiv.className = "character-details";

        const ageDiv = document.createElement("div");
        ageDiv.className = "character-age";
        ageDiv.setAttribute("data-i18n", "character_age");
        ageDiv.setAttribute("data-i18n-params", JSON.stringify({ age: info.age }));

        const birthplaceDiv = document.createElement("div");
        birthplaceDiv.className = "character-birthplace";
        birthplaceDiv.setAttribute("data-i18n", "character_birthplace");
        birthplaceDiv.setAttribute("data-i18n-params", JSON.stringify({ birthplace: info.birthplace }));

        const summaryDiv = document.createElement("div");
        summaryDiv.className = "character-summary";
        summaryDiv.setAttribute("data-i18n", `character_summary_${key}`);

        detailsDiv.appendChild(ageDiv);
        detailsDiv.appendChild(birthplaceDiv);
        detailsDiv.appendChild(summaryDiv);

        infoDiv.appendChild(nameDiv);
        infoDiv.appendChild(detailsDiv);

        const promptLabel = document.createElement("div");
        promptLabel.className = "character-prompt-label";
        promptLabel.setAttribute("data-i18n", "system_prompt");
        promptLabel.textContent = "System Prompt";

        const promptInput = document.createElement("textarea");
        promptInput.className = "character-prompt-input";
        promptInput.id = `prompt-${key}`;
        promptInput.rows = 6;

        // Create buttons container
        const buttonsContainer = document.createElement("div");
        buttonsContainer.className = "character-prompt-buttons";

        // Save button
        const saveButton = document.createElement("button");
        saveButton.className = "kimi-button character-save-btn";
        saveButton.id = `save-${key}`;
        saveButton.setAttribute("data-i18n", "save");
        saveButton.textContent = "Save";

        // Reset button
        const resetButton = document.createElement("button");
        resetButton.className = "kimi-button character-reset-btn";
        resetButton.id = `reset-${key}`;
        resetButton.setAttribute("data-i18n", "reset_to_default");
        resetButton.textContent = "Reset to Default";

        buttonsContainer.appendChild(saveButton);
        buttonsContainer.appendChild(resetButton);

        card.appendChild(img);
        card.appendChild(infoDiv);
        card.appendChild(promptLabel);
        card.appendChild(promptInput);
        card.appendChild(buttonsContainer);
        characterGrid.appendChild(card);
    }
    applyTranslations();

    // Initialize prompt values and button event listeners
    for (const key of Object.keys(window.KIMI_CHARACTERS)) {
        const promptInput = document.getElementById(`prompt-${key}`);
        const saveButton = document.getElementById(`save-${key}`);
        const resetButton = document.getElementById(`reset-${key}`);

        if (promptInput) {
            const prompt = await kimiDB.getSystemPromptForCharacter(key);
            promptInput.value = prompt;
            promptInput.disabled = key !== selectedCharacter;
        }

        // Save button event listener
        if (saveButton) {
            saveButton.addEventListener("click", async () => {
                if (promptInput) {
                    await kimiDB.setSystemPromptForCharacter(key, promptInput.value);

                    // Visual feedback
                    const originalText = saveButton.textContent;
                    saveButton.textContent = "Saved!";
                    saveButton.classList.add("success");
                    saveButton.disabled = true;

                    setTimeout(() => {
                        saveButton.setAttribute("data-i18n", "save");
                        applyTranslations();
                        saveButton.classList.remove("success");
                        saveButton.disabled = false;
                    }, 1500);

                    // Refresh personality if this is the selected character
                    if (key === selectedCharacter && window.kimiLLM && window.kimiLLM.refreshMemoryContext) {
                        await window.kimiLLM.refreshMemoryContext();
                    }
                }
            });
        }

        // Reset button event listener
        if (resetButton) {
            resetButton.addEventListener("click", async () => {
                const defaultPrompt = window.KIMI_CHARACTERS[key]?.defaultPrompt || "";
                if (promptInput) {
                    promptInput.value = defaultPrompt;
                    await kimiDB.setSystemPromptForCharacter(key, defaultPrompt);

                    // Visual feedback
                    const originalText = resetButton.textContent;
                    resetButton.textContent = "Reset!";
                    resetButton.classList.add("animated");
                    resetButton.setAttribute("data-i18n", "reset_done");
                    applyTranslations();

                    setTimeout(() => {
                        resetButton.setAttribute("data-i18n", "reset_to_default");
                        applyTranslations();
                        resetButton.classList.remove("animated");
                    }, 1500);

                    // Refresh personality if this is the selected character
                    if (key === selectedCharacter && window.kimiLLM && window.kimiLLM.refreshMemoryContext) {
                        await window.kimiLLM.refreshMemoryContext();
                    }
                }
            });
        }
    }
    characterGrid.querySelectorAll(".character-card").forEach(card => {
        card.addEventListener("click", async () => {
            characterGrid.querySelectorAll(".character-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            const charKey = card.dataset.character;
            for (const key of Object.keys(window.KIMI_CHARACTERS)) {
                const promptInput = document.getElementById(`prompt-${key}`);
                const saveButton = document.getElementById(`save-${key}`);
                const resetButton = document.getElementById(`reset-${key}`);

                if (promptInput) promptInput.disabled = key !== charKey;
                if (saveButton) saveButton.disabled = key !== charKey;
                if (resetButton) resetButton.disabled = key !== charKey;
            }
            updateFavorabilityLabel(charKey);
            const chatHeaderName = document.querySelector(".chat-header span[data-i18n]");
            if (chatHeaderName) {
                const info = window.KIMI_CHARACTERS[charKey] || window.KIMI_CHARACTERS.kimi;
                chatHeaderName.setAttribute("data-i18n", `chat_with_${charKey}`);
                applyTranslations();
            }

            // Update personality trait sliders with selected character's traits
            await updatePersonalitySliders(charKey);
        });
    });

    // Initialize personality sliders with current selected character's traits
    await updatePersonalitySliders(selectedCharacter);
}

async function getBasicResponse(reaction) {
    // Use centralized fallback manager instead of duplicated logic
    if (window.KimiFallbackManager) {
        return await window.KimiFallbackManager.getEmotionalResponse(reaction);
    }

    // Fallback to legacy system if KimiFallbackManager not available
    const i18n = window.kimiI18nManager;
    return i18n ? i18n.t("fallback_technical_error") : "Sorry, I'm having technical difficulties! 💕";
}

// Déporté vers KimiEmotionSystem: utiliser window.updatePersonalityTraitsFromEmotion

async function analyzeAndReact(text, useAdvancedLLM = true) {
    const kimiDB = window.kimiDB;
    const kimiLLM = window.kimiLLM;
    const kimiVideo = window.kimiVideo;
    const kimiMemory = window.kimiMemory;
    const isSystemReady = window.isSystemReady;

    try {
        // Validate and sanitize input
        if (!text || typeof text !== "string") {
            throw new Error("Invalid input text");
        }

        const sanitizedText = window.KimiSecurityUtils?.sanitizeInput(text) || text.trim();
        if (!sanitizedText) {
            throw new Error("Empty input after sanitization");
        }

        const lowerText = sanitizedText.toLowerCase();
        let reaction = window.kimiAnalyzeEmotion(sanitizedText, "auto");
        let emotionIntensity = 0;
        let response;

        const selectedCharacter = await kimiDB.getSelectedCharacter();
        const traits = await kimiDB.getAllPersonalityTraits(selectedCharacter);
        const avg = window.getPersonalityAverage ? window.getPersonalityAverage(traits) : 50;
        const affection = typeof traits.affection === "number" ? traits.affection : 80;
        const characterTraits = window.KIMI_CHARACTERS[selectedCharacter]?.traits || "";

        // Always reflect user's input phase with a listening video (voice or chat)
        if (kimiVideo && typeof kimiVideo.startListening === "function") {
            kimiVideo.startListening();
        }

        if (typeof window.updatePersonalityTraitsFromEmotion === "function") {
            await window.updatePersonalityTraitsFromEmotion(reaction, sanitizedText);
        }

        if (useAdvancedLLM && isSystemReady && kimiLLM) {
            try {
                const providerPref = kimiDB ? await kimiDB.getPreference("llmProvider", "openrouter") : "openrouter";
                const apiKey =
                    kimiDB && window.KimiProviderUtils ? await window.KimiProviderUtils.getApiKey(kimiDB, providerPref) : null;

                if (apiKey && apiKey.trim() !== "") {
                    try {
                        if (window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent("chat:typing:start"));
                        }
                    } catch (e) {}
                    response = await kimiLLM.chat(sanitizedText);
                    try {
                        if (window.dispatchEvent) {
                            window.dispatchEvent(new CustomEvent("chat:typing:stop"));
                        }
                    } catch (e) {}

                    const updatedTraits = await kimiDB.getAllPersonalityTraits(selectedCharacter);
                    // If user explicitly requested dancing, show dancing during Kimi's response
                    const lang = await kimiDB.getPreference("selectedLanguage", "en");
                    const keywords =
                        (window.KIMI_CONTEXT_KEYWORDS &&
                            (window.KIMI_CONTEXT_KEYWORDS[lang] || window.KIMI_CONTEXT_KEYWORDS.en)) ||
                        {};
                    const dancingWords = keywords.dancing || ["dance", "dancing"];
                    const userAskedDance = dancingWords.some(w => sanitizedText.toLowerCase().includes(w.toLowerCase()));

                    if (userAskedDance) {
                        kimiVideo.switchToContext("dancing", "dancing", null, updatedTraits, updatedTraits.affection);
                    } else {
                        kimiVideo.analyzeAndSelectVideo(
                            sanitizedText,
                            response,
                            { reaction: reaction, intensity: emotionIntensity },
                            updatedTraits,
                            updatedTraits.affection
                        );
                    }

                    if (kimiLLM.updatePersonalityFromResponse) {
                        await kimiLLM.updatePersonalityFromResponse(sanitizedText, response);
                        const selectedCharacter2 = await kimiDB.getSelectedCharacter();
                        const traits2 = await kimiDB.getAllPersonalityTraits(selectedCharacter2);
                        if (kimiVideo && kimiVideo.setMoodByPersonality) {
                            kimiVideo.setMoodByPersonality(traits2);
                        }
                    }
                } else {
                    // No API key configured - use centralized fallback
                    response = window.KimiFallbackManager
                        ? window.KimiFallbackManager.getFallbackMessage("api_missing")
                        : "To chat with me, add your API key in settings! 💕";
                    const updatedTraits = await kimiDB.getAllPersonalityTraits(selectedCharacter);
                    kimiVideo.respondWithEmotion("neutral", updatedTraits, updatedTraits.affection);
                }
            } catch (error) {
                console.warn("LLM not available:", error.message);
                try {
                    if (window.dispatchEvent) {
                        window.dispatchEvent(new CustomEvent("chat:typing:stop"));
                    }
                } catch (e) {}
                // Still show API key message if no key is configured
                const providerPref2 = kimiDB ? await kimiDB.getPreference("llmProvider", "openrouter") : "openrouter";
                const apiKey =
                    kimiDB && window.KimiProviderUtils ? await window.KimiProviderUtils.getApiKey(kimiDB, providerPref2) : null;
                if (!apiKey || apiKey.trim() === "") {
                    response = window.KimiFallbackManager
                        ? window.KimiFallbackManager.getFallbackMessage("api_missing")
                        : "To chat with me, add your API key in settings! 💕";
                } else {
                    response = await getBasicResponse(reaction);
                }
                const updatedTraits = await kimiDB.getAllPersonalityTraits(selectedCharacter);
                const lang = await kimiDB.getPreference("selectedLanguage", "en");
                const keywords =
                    (window.KIMI_CONTEXT_KEYWORDS && (window.KIMI_CONTEXT_KEYWORDS[lang] || window.KIMI_CONTEXT_KEYWORDS.en)) ||
                    {};
                const dancingWords = keywords.dancing || ["dance", "dancing"];
                const userAskedDance = dancingWords.some(w => sanitizedText.toLowerCase().includes(w.toLowerCase()));
                if (userAskedDance) {
                    kimiVideo.switchToContext("dancing", "dancing", null, updatedTraits, updatedTraits.affection);
                } else {
                    kimiVideo.respondWithEmotion("neutral", updatedTraits, updatedTraits.affection);
                }
            }
        } else {
            // System not ready - check if it's because of missing API key
            const providerPref3 = kimiDB ? await kimiDB.getPreference("llmProvider", "openrouter") : "openrouter";
            const apiKey =
                kimiDB && window.KimiProviderUtils ? await window.KimiProviderUtils.getApiKey(kimiDB, providerPref3) : null;
            if (!apiKey || apiKey.trim() === "") {
                response = window.KimiFallbackManager
                    ? window.KimiFallbackManager.getFallbackMessage("api_missing")
                    : "To chat with me, add your API key in settings! 💕";
            } else {
                response = await getBasicResponse(reaction);
            }
            const updatedTraits = await kimiDB.getAllPersonalityTraits(selectedCharacter);
            const lang = await kimiDB.getPreference("selectedLanguage", "en");
            const keywords =
                (window.KIMI_CONTEXT_KEYWORDS && (window.KIMI_CONTEXT_KEYWORDS[lang] || window.KIMI_CONTEXT_KEYWORDS.en)) || {};
            const dancingWords = keywords.dancing || ["dance", "dancing"];
            const userAskedDance = dancingWords.some(w => sanitizedText.toLowerCase().includes(w.toLowerCase()));
            if (userAskedDance) {
                kimiVideo.switchToContext("dancing", "dancing", null, updatedTraits, updatedTraits.affection);
            } else {
                kimiVideo.respondWithEmotion("neutral", updatedTraits, updatedTraits.affection);
            }
        }

        // Use token usage collected by LLM manager if available
        let tokenInfo = null;
        if (window._lastKimiTokenUsage) {
            tokenInfo = window._lastKimiTokenUsage;
            window._lastKimiTokenUsage = null; // consume once
        } else if (window.KimiTokenUtils) {
            // Fallback approximate (no system prompt included)
            try {
                const est = window.KimiTokenUtils.estimate;
                tokenInfo = { tokensIn: est(sanitizedText), tokensOut: est(response) };
            } catch {}
        }
        await kimiMemory.saveConversation(sanitizedText, response, tokenInfo);
        if (typeof updateStats === "function") {
            updateStats();
        }

        // Extract memories automatically from conversation if system is enabled
        if (window.kimiMemorySystem && window.kimiMemorySystem.memoryEnabled) {
            try {
                const extractedMemories = await window.kimiMemorySystem.extractMemoryFromText(sanitizedText, response);
                if (extractedMemories && extractedMemories.length > 0) {
                    // Update memory stats in UI
                    if (window.kimiMemoryUI && window.kimiMemoryUI.isInitialized) {
                        await window.kimiMemoryUI.updateMemoryStats();
                        // Show subtle notification for extracted memories
                        window.kimiMemoryUI.showFeedback(
                            `💭 ${extractedMemories.length} new ${extractedMemories.length === 1 ? "memory" : "memories"} learned`,
                            "info"
                        );
                    }
                }
            } catch (error) {
                console.warn("Memory extraction error:", error);
            }
        }

        return response;
    } catch (error) {
        console.error("Error in analyzeAndReact:", error);

        // Use centralized fallback response
        const fallbackResponse = window.KimiFallbackManager
            ? window.KimiFallbackManager.getFallbackMessage("technical_error")
            : "I'm sorry, I encountered an issue processing your message. Please try again.";

        try {
            // Attempt to save the error for debugging while still providing user feedback
            if (kimiMemory && kimiMemory.saveConversation) {
                await kimiMemory.saveConversation(text || "Error", fallbackResponse);
            }
        } catch (saveError) {
            console.error("Failed to save error conversation:", saveError);
        }

        return fallbackResponse;
    }
}

function addMessageToChat(sender, text, conversationId = null) {
    const chatMessages = document.getElementById("chat-messages");
    if (!text) return;
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${sender}`;

    const time = new Date().toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
    });

    const messageTimeDiv = document.createElement("div");
    messageTimeDiv.className = "message-time";
    messageTimeDiv.style.display = "flex";
    messageTimeDiv.style.justifyContent = "space-between";
    messageTimeDiv.style.alignItems = "center";

    const timeSpan = document.createElement("span");
    timeSpan.textContent = time;
    timeSpan.style.flex = "1";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-message-btn";
    const icon = document.createElement("i");
    icon.className = "fas fa-trash";
    deleteBtn.appendChild(icon);
    deleteBtn.style.background = "none";
    deleteBtn.style.border = "none";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.style.color = "#aaa";
    deleteBtn.style.fontSize = "1em";
    deleteBtn.style.marginLeft = "8px";
    deleteBtn.setAttribute("aria-label", "Delete message");
    deleteBtn.addEventListener("click", async function (e) {
        e.stopPropagation();
        messageDiv.remove();
        if (conversationId && window.kimiDB && window.kimiDB.deleteSingleMessage) {
            await window.kimiDB.deleteSingleMessage(conversationId, sender);
        }
    });

    messageTimeDiv.appendChild(timeSpan);
    messageTimeDiv.appendChild(deleteBtn);

    const textDiv = document.createElement("div");
    textDiv.textContent = text;

    messageDiv.appendChild(textDiv);
    messageDiv.appendChild(messageTimeDiv);

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadChatHistory() {
    const kimiDB = window.kimiDB;
    const kimiMemory = window.kimiMemory;
    const chatMessages = document.getElementById("chat-messages");

    while (chatMessages.firstChild) {
        chatMessages.removeChild(chatMessages.firstChild);
    }

    if (kimiDB) {
        try {
            const recent = await kimiDB.getRecentConversations(10);

            if (recent.length === 0) {
                const greeting = kimiMemory.getGreeting();
                addMessageToChat("kimi", greeting);
            } else {
                recent.forEach(conv => {
                    addMessageToChat("user", conv.user, conv.id);
                    addMessageToChat("kimi", conv.kimi, conv.id);
                });
            }
        } catch (error) {
            console.error("Error while loading history:", error);
            const greeting = kimiMemory.getGreeting();
            addMessageToChat("kimi", greeting);
        }
    } else {
        const greeting = kimiMemory.getGreeting();
        addMessageToChat("kimi", greeting);
    }
}

async function loadSettingsData() {
    const kimiDB = window.kimiDB;
    const kimiLLM = window.kimiLLM;
    if (!kimiDB) return;
    try {
        // Batch load preferences for better performance
        const preferenceKeys = [
            "voiceRate",
            "voicePitch",
            "voiceVolume",
            "selectedLanguage",
            "providerApiKey",
            "llmProvider",
            "llmBaseUrl",
            "llmModelId",
            "selectedCharacter",
            "llmTemperature",
            "llmMaxTokens",
            "llmTopP",
            "llmFrequencyPenalty",
            "llmPresencePenalty"
        ];
        const preferences = await kimiDB.getPreferencesBatch(preferenceKeys);

        // Set default values for missing preferences
        const voiceRate = preferences.voiceRate !== undefined ? preferences.voiceRate : 1.1;
        const voicePitch = preferences.voicePitch !== undefined ? preferences.voicePitch : 1.1;
        const voiceVolume = preferences.voiceVolume !== undefined ? preferences.voiceVolume : 0.8;
        const selectedLanguage = preferences.selectedLanguage || "en";
        const apiKey = preferences.providerApiKey || "";
        const provider = preferences.llmProvider || "openrouter";
        const baseUrl = preferences.llmBaseUrl || "https://openrouter.ai/api/v1/chat/completions";
        const modelId = preferences.llmModelId || (window.kimiLLM ? window.kimiLLM.currentModel : "");
        const selectedCharacter = preferences.selectedCharacter || "kimi";
        const llmTemperature = preferences.llmTemperature !== undefined ? preferences.llmTemperature : 0.8;
        const llmMaxTokens = preferences.llmMaxTokens !== undefined ? preferences.llmMaxTokens : 400;
        const llmTopP = preferences.llmTopP !== undefined ? preferences.llmTopP : 0.9;
        const llmFrequencyPenalty = preferences.llmFrequencyPenalty !== undefined ? preferences.llmFrequencyPenalty : 0.6;
        const llmPresencePenalty = preferences.llmPresencePenalty !== undefined ? preferences.llmPresencePenalty : 0.5;

        // Update UI with voice settings
        const languageSelect = document.getElementById("language-selection");
        if (languageSelect) languageSelect.value = selectedLanguage;
        updateSlider("voice-rate", voiceRate);
        updateSlider("voice-pitch", voicePitch);
        updateSlider("voice-volume", voiceVolume);

        // Update LLM settings
        updateSlider("llm-temperature", llmTemperature);
        updateSlider("llm-max-tokens", llmMaxTokens);
        updateSlider("llm-top-p", llmTopP);
        updateSlider("llm-frequency-penalty", llmFrequencyPenalty);
        updateSlider("llm-presence-penalty", llmPresencePenalty);

        // Batch load personality traits
        const traitNames = ["affection", "playfulness", "intelligence", "empathy", "humor", "romance"];
        const personality = await kimiDB.getPersonalityTraitsBatch(traitNames, selectedCharacter);
        const defaults = [65, 55, 70, 75, 60, 50];

        traitNames.forEach((trait, index) => {
            const value = typeof personality[trait] === "number" ? personality[trait] : defaults[index];
            updateSlider(`trait-${trait}`, value);

            // Update memory cache for affection
            if (trait === "affection" && window.kimiMemory) {
                window.kimiMemory.affectionTrait = value;
            }
        });

        // Sync personality traits to ensure consistency
        await syncPersonalityTraits(selectedCharacter);

        await updateStats();

        // Update API key input
        const apiKeyInput = document.getElementById("openrouter-api-key");
        if (apiKeyInput) {
            const keyPref = window.KimiProviderUtils ? window.KimiProviderUtils.getKeyPrefForProvider(provider) : null;
            const providerKey = keyPref && preferences[keyPref] ? preferences[keyPref] : genericKey;
            apiKeyInput.value = providerKey || "";
        }
        const providerSelect = document.getElementById("llm-provider");
        if (providerSelect) providerSelect.value = provider;
        const baseUrlInput = document.getElementById("llm-base-url");
        if (baseUrlInput) baseUrlInput.value = baseUrl;
        const modelIdInput = document.getElementById("llm-model-id");
        if (modelIdInput) {
            if (provider === "openrouter") {
                modelIdInput.value = modelId;
            } else {
                modelIdInput.value = ""; // only placeholder for non-OpenRouter providers
            }
        }
        // For non-OpenRouter providers we keep placeholder per provider; the value is already set above.
        const apiKeyLabel = document.getElementById("api-key-label");
        if (apiKeyLabel) {
            apiKeyLabel.textContent = window.KimiProviderUtils
                ? window.KimiProviderUtils.getLabelForProvider(provider)
                : "API Key";
        }

        loadAvailableModels();
    } catch (error) {
        console.error("Error while loading settings:", error);
    }
}

function updateSlider(id, value) {
    const slider = document.getElementById(id);
    const valueSpan = document.getElementById(`${id}-value`);
    if (slider && valueSpan) {
        slider.value = value;
        valueSpan.textContent = value;
    }
}

async function updatePersonalitySliders(characterKey) {
    const kimiDB = window.kimiDB;
    if (!kimiDB) return;

    try {
        // Get current traits from database for this character
        const savedTraits = await kimiDB.getAllPersonalityTraits(characterKey);

        // Get default traits from KIMI_CHARACTERS constants
        const characterDefaults = window.KIMI_CHARACTERS[characterKey]?.traits || {};

        // Use saved traits if they exist, otherwise fall back to character defaults
        const traits = {
            affection: savedTraits.affection ?? characterDefaults.affection ?? 50,
            playfulness: savedTraits.playfulness ?? characterDefaults.playfulness ?? 50,
            intelligence: savedTraits.intelligence ?? characterDefaults.intelligence ?? 50,
            empathy: savedTraits.empathy ?? characterDefaults.empathy ?? 50,
            humor: savedTraits.humor ?? characterDefaults.humor ?? 50,
            romance: savedTraits.romance ?? characterDefaults.romance ?? 50
        };

        // Check if sliders exist before updating them
        const sliderUpdates = [
            { id: "trait-affection", value: traits.affection },
            { id: "trait-playfulness", value: traits.playfulness },
            { id: "trait-intelligence", value: traits.intelligence },
            { id: "trait-empathy", value: traits.empathy },
            { id: "trait-humor", value: traits.humor },
            { id: "trait-romance", value: traits.romance }
        ];

        for (const update of sliderUpdates) {
            const slider = document.getElementById(update.id);
            if (slider) {
                updateSlider(update.id, update.value);
            }
        }
    } catch (error) {
        console.error("Error updating personality sliders:", error);
    }
}

async function updateStats() {
    const kimiDB = window.kimiDB;
    if (!kimiDB) return;
    const character = await kimiDB.getSelectedCharacter();
    // Retrieve token usage (fallback to 0)
    const tokensIn = await kimiDB.getPreference(`totalTokensIn_${character}`, 0);
    const tokensOut = await kimiDB.getPreference(`totalTokensOut_${character}`, 0);
    const charDefAff = (window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[character]?.traits?.affection) || null;
    const genericAff = (window.getTraitDefaults && window.getTraitDefaults().affection) || 65;
    const defaultAff = typeof charDefAff === "number" ? charDefAff : genericAff;
    const affectionTrait = await kimiDB.getPersonalityTrait("affection", defaultAff, character);
    const conversations = await kimiDB.getAllConversations(character);
    let firstInteraction = await kimiDB.getPreference(`firstInteraction_${character}`);
    if (!firstInteraction && conversations.length > 0) {
        firstInteraction = conversations[0].timestamp;
        await kimiDB.setPreference(`firstInteraction_${character}`, firstInteraction);
    }
    const tokensEl = document.getElementById("tokens-usage");
    const favorabilityEl = document.getElementById("current-favorability");
    const conversationsEl = document.getElementById("conversations-count");
    const daysEl = document.getElementById("days-together");
    if (tokensEl) tokensEl.textContent = `${tokensIn} / ${tokensOut}`;
    if (favorabilityEl) {
        const v = Number(affectionTrait) || 0;
        favorabilityEl.textContent = `${Math.max(0, Math.min(100, v)).toFixed(2)}%`;
    }
    if (conversationsEl) conversationsEl.textContent = conversations.length;
    if (firstInteraction && daysEl) {
        const days = Math.floor((new Date() - new Date(firstInteraction)) / (1000 * 60 * 60 * 24));
        daysEl.textContent = days;
    }
}

function initializeAllSliders() {
    const sliders = [
        "voice-rate",
        "voice-pitch",
        "voice-volume",
        "trait-affection",
        "trait-playfulness",
        "trait-intelligence",
        "trait-empathy",
        "trait-humor",
        "trait-romance",
        "llm-temperature",
        "llm-max-tokens",
        "llm-top-p",
        "llm-frequency-penalty",
        "llm-presence-penalty",
        "interface-opacity"
    ];

    sliders.forEach(sliderId => {
        const slider = document.getElementById(sliderId);
        const valueSpan = document.getElementById(`${sliderId}-value`);
        if (slider && valueSpan) {
            valueSpan.textContent = slider.value;
        }
    });
}

async function syncLLMMaxTokensSlider() {
    const kimiDB = window.kimiDB;
    const llmMaxTokensSlider = document.getElementById("llm-max-tokens");
    const llmMaxTokensValue = document.getElementById("llm-max-tokens-value");
    if (llmMaxTokensSlider && llmMaxTokensValue && kimiDB) {
        const saved = await kimiDB.getPreference("llmMaxTokens", 400);
        llmMaxTokensSlider.value = saved;
        llmMaxTokensValue.textContent = saved;
    }
}

async function syncLLMTemperatureSlider() {
    const kimiDB = window.kimiDB;
    const llmTemperatureSlider = document.getElementById("llm-temperature");
    const llmTemperatureValue = document.getElementById("llm-temperature-value");
    if (llmTemperatureSlider && llmTemperatureValue && kimiDB) {
        const saved = await kimiDB.getPreference("llmTemperature", 0.8);
        llmTemperatureSlider.value = saved;
        llmTemperatureValue.textContent = saved;
    }
}

function updateTabsScrollIndicator() {
    const tabsContainer = document.querySelector(".settings-tabs");
    if (!tabsContainer) return;

    const isOverflowing = tabsContainer.scrollWidth > tabsContainer.clientWidth;

    if (isOverflowing) {
        tabsContainer.classList.remove("no-overflow");
    } else {
        tabsContainer.classList.add("no-overflow");
    }
}

async function loadAvailableModels() {
    // Prevent multiple simultaneous calls
    if (loadAvailableModels._loading) {
        return;
    }
    loadAvailableModels._loading = true;

    const kimiLLM = window.kimiLLM;
    if (!kimiLLM) {
        console.warn("❌ KimiLLM not yet initialized for loadAvailableModels");
        loadAvailableModels._loading = false;
        return;
    }

    const modelsContainer = document.getElementById("models-container");
    if (!modelsContainer) {
        console.warn("❌ Models container not found");
        loadAvailableModels._loading = false;
        return;
    }

    try {
        const stats = await kimiLLM.getModelStats();

        const signature = JSON.stringify(Object.keys(stats.available || {}).sort());

        if (loadAvailableModels._rendered && loadAvailableModels._signature === signature) {
            const currentId = stats.current && stats.current.id;
            const cards = modelsContainer.querySelectorAll(".model-card");
            cards.forEach(card => {
                if (card.dataset.modelId === currentId) {
                    card.classList.add("selected");
                } else {
                    card.classList.remove("selected");
                }
            });
            loadAvailableModels._loading = false;
            return;
        }

        while (modelsContainer.firstChild) {
            modelsContainer.removeChild(modelsContainer.firstChild);
        }

        // Check if we have available models
        if (!stats.available || Object.keys(stats.available).length === 0) {
            console.warn("⚠️ No models available in stats");
            const noModelsDiv = document.createElement("div");
            noModelsDiv.className = "no-models-message";
            noModelsDiv.innerHTML = `
                    <p>⚠️ No models available. Please check your API key.</p>
                `;
            modelsContainer.appendChild(noModelsDiv);
            loadAvailableModels._loading = false;
            return;
        }

        // Only log once when models are loaded, not repeated calls
        if (!loadAvailableModels._lastLoadTime || Date.now() - loadAvailableModels._lastLoadTime > 5000) {
            console.log(`✅ Loaded ${Object.keys(stats.available).length} LLM models`);
            loadAvailableModels._lastLoadTime = Date.now();
        }
        const createCard = (id, model) => {
            const modelDiv = document.createElement("div");
            modelDiv.className = `model-card ${id === stats.current.id ? "selected" : ""}`;
            modelDiv.dataset.modelId = id;
            const searchable = [model.name || "", model.provider || "", id, (model.strengths || []).join(" ")]
                .join(" ")
                .toLowerCase();
            modelDiv.dataset.search = searchable;

            // Create model card elements safely
            const modelHeader = document.createElement("div");
            modelHeader.className = "model-header";

            const modelName = document.createElement("div");
            modelName.className = "model-name";
            modelName.textContent = model.name;

            const modelProvider = document.createElement("div");
            modelProvider.className = "model-provider";
            modelProvider.textContent = model.provider;

            modelHeader.appendChild(modelName);
            modelHeader.appendChild(modelProvider);

            const modelDescription = document.createElement("div");
            modelDescription.className = "model-description";
            const rawIn = model.pricing && typeof model.pricing.input !== "undefined" ? model.pricing.input : "N/A";
            const rawOut = model.pricing && typeof model.pricing.output !== "undefined" ? model.pricing.output : "N/A";
            const inNum = typeof rawIn === "number" ? rawIn : typeof rawIn === "string" ? Number(rawIn) : NaN;
            const outNum = typeof rawOut === "number" ? rawOut : typeof rawOut === "string" ? Number(rawOut) : NaN;
            const inIsNum = Number.isFinite(inNum);
            const outIsNum = Number.isFinite(outNum);
            const bothNA = !inIsNum && !outIsNum;
            const bothZero = inIsNum && outIsNum && inNum === 0 && outNum === 0;
            const isFreeName =
                /free/i.test(model.name || "") ||
                /free/i.test(id || "") ||
                (Array.isArray(model.strengths) && model.strengths.some(s => /free/i.test(s)));
            const fmt = n => {
                if (!Number.isFinite(n)) return "N/A";
                const roundedInt = Math.round(n);
                if (Math.abs(n - roundedInt) < 1e-6) return `${roundedInt}$`;
                return `${n.toFixed(2)}$`;
            };
            let inStr = inIsNum ? (inNum === 0 ? "Free" : fmt(inNum)) : "N/A";
            let outStr = outIsNum ? (outNum === 0 ? "Free" : fmt(outNum)) : "N/A";
            let priceText;
            if (bothZero || isFreeName) {
                priceText = "Price: Free";
            } else if (bothNA) {
                priceText = "Price: N/A";
            } else {
                priceText = `Price: ${inStr} per 1M input tokens, ${outStr} per 1M output tokens`;
            }
            modelDescription.textContent = `Context: ${model.contextWindow.toLocaleString()} tokens | ${priceText}`;

            const modelStrengths = document.createElement("div");
            modelStrengths.className = "model-strengths";
            if (priceText === "Price: Free") {
                const badge = document.createElement("span");
                badge.className = "strength-tag";
                badge.textContent = "Free";
                modelStrengths.appendChild(badge);
            }
            model.strengths.forEach(strength => {
                const strengthTag = document.createElement("span");
                strengthTag.className = "strength-tag";
                strengthTag.textContent = strength;
                modelStrengths.appendChild(strengthTag);
            });

            modelDiv.appendChild(modelHeader);
            modelDiv.appendChild(modelDescription);
            modelDiv.appendChild(modelStrengths);

            modelDiv.addEventListener("click", async () => {
                try {
                    await kimiLLM.setCurrentModel(id);
                    document.querySelectorAll(".model-card").forEach(card => card.classList.remove("selected"));
                    modelDiv.classList.add("selected");
                    console.log(`🤖 Model switched to: ${model.name}`);

                    // Show brief feedback to user
                    const feedback = document.createElement("div");
                    feedback.textContent = `Model changed to ${model.name}`;
                    feedback.style.cssText = `
                            position: fixed; top: 20px; right: 20px; z-index: 10000;
                            background: #27ae60; color: white; padding: 12px 20px;
                            border-radius: 6px; font-size: 14px; font-weight: 500;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                        `;
                    document.body.appendChild(feedback);
                    setTimeout(() => feedback.remove(), 3000);
                } catch (error) {
                    console.error("Error while changing model:", error);
                    // Show error feedback
                    const errorFeedback = document.createElement("div");
                    errorFeedback.textContent = `Error changing model: ${error.message}`;
                    errorFeedback.style.cssText = `
                            position: fixed; top: 20px; right: 20px; z-index: 10000;
                            background: #e74c3c; color: white; padding: 12px 20px;
                            border-radius: 6px; font-size: 14px; font-weight: 500;
                            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                        `;
                    document.body.appendChild(errorFeedback);
                    setTimeout(() => errorFeedback.remove(), 5000);
                }
            });

            return modelDiv;
        };

        const recommendedIds =
            window.kimiLLM && Array.isArray(window.kimiLLM.recommendedModelIds) ? window.kimiLLM.recommendedModelIds : [];

        const recommendedEntries = recommendedIds.map(id => [id, stats.available[id]]).filter(([, model]) => !!model);

        const otherEntries = Object.entries(stats.available)
            .filter(([id]) => !recommendedIds.includes(id))
            .sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));

        const searchWrap = document.createElement("div");
        searchWrap.className = "models-search-container";
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "kimi-input";
        searchInput.id = "models-search";
        searchInput.placeholder = "Filter models...";
        searchWrap.appendChild(searchInput);
        modelsContainer.appendChild(searchWrap);
        if (typeof loadAvailableModels._searchValue === "string") {
            searchInput.value = loadAvailableModels._searchValue;
        }

        if (recommendedEntries.length > 0) {
            const recSection = document.createElement("div");
            recSection.className = "models-section recommended-models";
            const title = document.createElement("div");
            title.className = "models-section-title";
            title.textContent = "Recommended Openrouter models";
            recSection.appendChild(title);
            const list = document.createElement("div");
            list.className = "models-list";
            recommendedEntries.forEach(([id, model]) => {
                list.appendChild(createCard(id, model));
            });
            recSection.appendChild(list);
            modelsContainer.appendChild(recSection);
        }

        if (otherEntries.length > 0) {
            const allSection = document.createElement("div");
            allSection.className = "models-section all-models";
            const header = document.createElement("div");
            header.className = "models-section-title";
            const toggleBtn = document.createElement("button");
            toggleBtn.type = "button";
            toggleBtn.className = "kimi-button";
            toggleBtn.style.marginLeft = "8px";
            toggleBtn.textContent = loadAvailableModels._allCollapsed === false ? "Hide" : "Show";
            const label = document.createElement("span");
            label.textContent = "All Openrouter models";
            header.appendChild(label);
            header.appendChild(toggleBtn);
            const refreshBtn = document.createElement("button");
            refreshBtn.type = "button";
            refreshBtn.className = "kimi-button";
            refreshBtn.style.marginLeft = "8px";
            refreshBtn.textContent = "Refresh";
            refreshBtn.addEventListener("click", async () => {
                try {
                    refreshBtn.disabled = true;
                    const oldText = refreshBtn.textContent;
                    refreshBtn.textContent = "Refreshing...";
                    if (window.kimiLLM && window.kimiLLM.refreshRemoteModels) {
                        await window.kimiLLM.refreshRemoteModels();
                    }
                    loadAvailableModels._signature = null;
                    loadAvailableModels._rendered = false;
                    const savedSearch = searchInput.value;
                    loadAvailableModels._searchValue = savedSearch;
                    await loadAvailableModels();
                } catch (e) {
                    console.error("Error refreshing models:", e);
                } finally {
                    refreshBtn.disabled = false;
                    refreshBtn.textContent = "Refresh";
                }
            });
            header.appendChild(refreshBtn);
            const list = document.createElement("div");
            list.className = "models-list";
            otherEntries.forEach(([id, model]) => {
                list.appendChild(createCard(id, model));
            });
            const collapsed = loadAvailableModels._allCollapsed !== false;
            list.style.display = collapsed ? "none" : "block";
            toggleBtn.addEventListener("click", () => {
                const nowCollapsed = list.style.display !== "none";
                list.style.display = nowCollapsed ? "none" : "block";
                loadAvailableModels._allCollapsed = nowCollapsed;
                toggleBtn.textContent = nowCollapsed ? "Show" : "Hide";
            });
            allSection.appendChild(header);
            allSection.appendChild(list);
            modelsContainer.appendChild(allSection);
        }

        const applyFilter = term => {
            const q = (term || "").toLowerCase().trim();
            const cards = modelsContainer.querySelectorAll(".model-card");
            cards.forEach(card => {
                const hay = card.dataset.search || "";
                card.style.display = q && !hay.includes(q) ? "none" : "";
            });
        };
        searchInput.addEventListener("input", e => {
            loadAvailableModels._searchValue = e.target.value;
            applyFilter(e.target.value);
        });
        if (searchInput.value) {
            applyFilter(searchInput.value);
        }

        loadAvailableModels._rendered = true;
        loadAvailableModels._signature = signature;
    } catch (error) {
        console.error("Error loading available models:", error);
        const errorDiv = document.createElement("div");
        errorDiv.className = "models-error-message";
        errorDiv.innerHTML = `
                <p>❌ Error loading models: ${error.message}</p>
            `;
        modelsContainer.appendChild(errorDiv);
    } finally {
        loadAvailableModels._loading = false;
    }
}

// Debug function for testing models loading
window.debugLoadModels = async function () {
    console.log("🔧 Manual debug of loadAvailableModels");
    console.log("🔧 window.kimiLLM:", window.kimiLLM);
    console.log("🔧 Models container:", document.getElementById("models-container"));

    if (window.kimiLLM) {
        try {
            const stats = await window.kimiLLM.getModelStats();
            console.log("🔧 Model stats:", stats);
        } catch (error) {
            console.error("🔧 Error getting model stats:", error);
        }
    }

    if (window.loadAvailableModels) {
        await window.loadAvailableModels();
    }
};

async function sendMessage() {
    const chatInput = document.getElementById("chat-input");
    const waitingIndicator = document.getElementById("waiting-indicator");
    let message = chatInput.value;

    // Enhanced input validation using our new validation utils
    const validation = window.KimiValidationUtils?.validateMessage(message);
    if (!validation || !validation.valid) {
        // Show error to user
        if (validation?.error) {
            addMessageToChat("system", `❌ ${validation.error}`);
        }
        // Use sanitized version if available
        if (validation?.sanitized) {
            chatInput.value = validation.sanitized;
        }
        return;
    }

    message = validation.sanitized || message.trim();
    if (!message) return;

    addMessageToChat("user", message);
    chatInput.value = "";
    if (waitingIndicator) waitingIndicator.style.display = "inline-block";

    try {
        const response = await analyzeAndReact(message);
        let finalResponse = response;
        // Si la réponse du LLM est vide, nulle ou trop courte, utilise le fallback émotionnel
        if (!finalResponse || typeof finalResponse !== "string" || finalResponse.trim().length < 2) {
            finalResponse = window.getLocalizedEmotionalResponse
                ? window.getLocalizedEmotionalResponse("neutral")
                : "I'm here for you!";
        }
        setTimeout(() => {
            addMessageToChat("kimi", finalResponse);
            if (window.voiceManager && !message.startsWith("Vous:")) {
                window.voiceManager.speak(finalResponse);
            }
            if (waitingIndicator) waitingIndicator.style.display = "none";
        }, 1000);
    } catch (error) {
        console.error("Error while generating response:", error);
        const i18n = window.kimiI18nManager;
        const fallbackResponse = i18n
            ? i18n.t("fallback_general_error")
            : "Sorry my love, I am having a little technical issue! 💕";
        addMessageToChat("kimi", fallbackResponse);
        if (window.voiceManager) {
            window.voiceManager.speak(fallbackResponse);
        }
        if (waitingIndicator) waitingIndicator.style.display = "none";
    }
}

function setupSettingsListeners(kimiDB, kimiMemory) {
    const voiceRateSlider = document.getElementById("voice-rate");
    const voicePitchSlider = document.getElementById("voice-pitch");
    const voiceVolumeSlider = document.getElementById("voice-volume");
    const languageSelect = document.getElementById("language-selection");
    const voiceSelect = document.getElementById("voice-selection");
    const traitSliders = [
        "trait-affection",
        "trait-playfulness",
        "trait-intelligence",
        "trait-empathy",
        "trait-humor",
        "trait-romance"
    ];
    const llmTemperatureSlider = document.getElementById("llm-temperature");
    const llmMaxTokensSlider = document.getElementById("llm-max-tokens");
    const llmTopPSlider = document.getElementById("llm-top-p");
    const llmFrequencyPenaltySlider = document.getElementById("llm-frequency-penalty");
    const llmPresencePenaltySlider = document.getElementById("llm-presence-penalty");
    const colorThemeSelect = document.getElementById("color-theme");
    const interfaceOpacitySlider = document.getElementById("interface-opacity");
    const animationsToggle = document.getElementById("animations-toggle");

    // Cleanup existing listeners to prevent memory leaks
    const cleanupListeners = () => {
        if (window._kimiListenerCleanup) {
            window._kimiListenerCleanup.forEach(cleanup => cleanup());
        }
        window._kimiListenerCleanup = [];
    };

    cleanupListeners();

    // Create debounced functions for better performance
    const debouncedVoiceRateUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("voiceRate", parseFloat(value));
        if (kimiMemory && kimiMemory.preferences) {
            kimiMemory.preferences.voiceRate = parseFloat(value);
        }
    }, 300);

    const debouncedVoicePitchUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("voicePitch", parseFloat(value));
        if (kimiMemory && kimiMemory.preferences) {
            kimiMemory.preferences.voicePitch = parseFloat(value);
        }
    }, 300);

    const debouncedVoiceVolumeUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("voiceVolume", parseFloat(value));
        if (kimiMemory && kimiMemory.preferences) {
            kimiMemory.preferences.voiceVolume = parseFloat(value);
        }
    }, 300);

    const debouncedLLMTempUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("llmTemperature", parseFloat(value));
        if (window.kimiLLMManager) window.kimiLLMManager.temperature = parseFloat(value);
    }, 300);

    const debouncedLLMTokensUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("llmMaxTokens", parseInt(value));
        if (window.kimiLLMManager) window.kimiLLMManager.maxTokens = parseInt(value);
    }, 300);

    const debouncedLLMTopPUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("llmTopP", parseFloat(value));
        if (window.kimiLLMManager) window.kimiLLMManager.topP = parseFloat(value);
    }, 300);

    const debouncedLLMFrequencyPenaltyUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("llmFrequencyPenalty", parseFloat(value));
        if (window.kimiLLMManager) window.kimiLLMManager.frequencyPenalty = parseFloat(value);
    }, 300);

    const debouncedLLMPresencePenaltyUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("llmPresencePenalty", parseFloat(value));
        if (window.kimiLLMManager) window.kimiLLMManager.presencePenalty = parseFloat(value);
    }, 300);

    const debouncedOpacityUpdate = window.KimiPerformanceUtils?.debounce(async value => {
        if (kimiDB) await kimiDB.setPreference("interfaceOpacity", parseFloat(value));
        if (window.kimiAppearanceManager && window.kimiAppearanceManager.changeInterfaceOpacity)
            await window.kimiAppearanceManager.changeInterfaceOpacity(parseFloat(value));
    }, 300);

    if (voiceRateSlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "voiceRate");
            const value = validation?.value || parseFloat(e.target.value) || 1.1;

            document.getElementById("voice-rate-value").textContent = value;
            e.target.value = value; // Ensure slider shows validated value
            debouncedVoiceRateUpdate(value);
        };
        voiceRateSlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => voiceRateSlider.removeEventListener("input", listener));
    }
    if (voicePitchSlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "voicePitch");
            const value = validation?.value || parseFloat(e.target.value) || 1.1;

            document.getElementById("voice-pitch-value").textContent = value;
            e.target.value = value;
            debouncedVoicePitchUpdate(value);
        };
        voicePitchSlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => voicePitchSlider.removeEventListener("input", listener));
    }
    if (voiceVolumeSlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "voiceVolume");
            const value = validation?.value || parseFloat(e.target.value) || 0.8;

            document.getElementById("voice-volume-value").textContent = value;
            e.target.value = value;
            debouncedVoiceVolumeUpdate(value);
        };
        voiceVolumeSlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => voiceVolumeSlider.removeEventListener("input", listener));
    }
    if (languageSelect) {
        languageSelect.removeEventListener("change", window._kimiLanguageListener);
        window._kimiLanguageListener = async e => {
            if (kimiDB) await kimiDB.setPreference("selectedLanguage", e.target.value);
            if (window.voiceManager && window.voiceManager.initVoices) await window.voiceManager.initVoices();
        };
        languageSelect.addEventListener("change", window._kimiLanguageListener);
    }
    if (voiceSelect) {
        voiceSelect.removeEventListener("change", window._kimiVoiceSelectListener);
        window._kimiVoiceSelectListener = async e => {
            if (kimiDB) await kimiDB.setPreference("selectedVoice", e.target.value);
            if (window.voiceManager && window.voiceManager.initVoices) await window.voiceManager.initVoices();
        };
        voiceSelect.addEventListener("change", window._kimiVoiceSelectListener);
    }
    // Batch personality traits optimization
    let personalityBatchTimeout = null;
    const pendingTraitChanges = {};

    traitSliders.forEach(traitId => {
        const traitSlider = document.getElementById(traitId);
        if (traitSlider) {
            traitSlider.removeEventListener("input", window["_kimiTraitListener_" + traitId]);
            window["_kimiTraitListener_" + traitId] = async e => {
                const trait = traitId.replace("trait-", "");
                const value = parseInt(e.target.value, 10);

                // Update UI immediately for responsive feel
                const valueSpan = document.getElementById(traitId + "-value");
                if (valueSpan) {
                    valueSpan.textContent = value;
                }

                // Store pending change for batch processing
                pendingTraitChanges[trait] = value;

                // Clear existing timeout and set new one for batch save
                if (personalityBatchTimeout) {
                    clearTimeout(personalityBatchTimeout);
                }

                personalityBatchTimeout = setTimeout(async () => {
                    if (kimiDB && Object.keys(pendingTraitChanges).length > 0) {
                        try {
                            // Use batch operation for all pending changes
                            await kimiDB.setPersonalityBatch(pendingTraitChanges);

                            // Side-effects handled by central 'personality:updated' listener.
                        } catch (error) {
                            console.error("Error batch saving personality traits:", error);
                        }

                        // Clear pending changes
                        Object.keys(pendingTraitChanges).forEach(key => delete pendingTraitChanges[key]);
                    }
                }, 500); // Debounce for 500ms to batch multiple rapid changes
            };
            traitSlider.addEventListener("input", window["_kimiTraitListener_" + traitId]);
        }
    });
    if (llmTemperatureSlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "llmTemperature");
            const value = validation?.value || parseFloat(e.target.value) || 0.8;

            document.getElementById("llm-temperature-value").textContent = value;
            e.target.value = value;
            debouncedLLMTempUpdate(value);
        };
        llmTemperatureSlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => llmTemperatureSlider.removeEventListener("input", listener));
    }
    if (llmMaxTokensSlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "llmMaxTokens");
            const value = validation?.value || parseInt(e.target.value) || 400;

            document.getElementById("llm-max-tokens-value").textContent = value;
            e.target.value = value;
            debouncedLLMTokensUpdate(value);
        };
        llmMaxTokensSlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => llmMaxTokensSlider.removeEventListener("input", listener));
    }
    if (llmTopPSlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "llmTopP");
            const value = validation?.value || parseFloat(e.target.value) || 0.9;

            document.getElementById("llm-top-p-value").textContent = value;
            e.target.value = value;
            debouncedLLMTopPUpdate(value);
        };
        llmTopPSlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => llmTopPSlider.removeEventListener("input", listener));
    }
    if (llmFrequencyPenaltySlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "llmFrequencyPenalty");
            const value = validation?.value || parseFloat(e.target.value) || 0.6;

            document.getElementById("llm-frequency-penalty-value").textContent = value;
            e.target.value = value;
            debouncedLLMFrequencyPenaltyUpdate(value);
        };
        llmFrequencyPenaltySlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => llmFrequencyPenaltySlider.removeEventListener("input", listener));
    }
    if (llmPresencePenaltySlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "llmPresencePenalty");
            const value = validation?.value || parseFloat(e.target.value) || 0.5;

            document.getElementById("llm-presence-penalty-value").textContent = value;
            e.target.value = value;
            debouncedLLMPresencePenaltyUpdate(value);
        };
        llmPresencePenaltySlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => llmPresencePenaltySlider.removeEventListener("input", listener));
    }
    if (colorThemeSelect) {
        colorThemeSelect.removeEventListener("change", window._kimiColorThemeListener);
        window._kimiColorThemeListener = async e => {
            if (kimiDB) await kimiDB.setPreference("colorTheme", e.target.value);
            if (window.kimiAppearanceManager && window.kimiAppearanceManager.changeTheme)
                await window.kimiAppearanceManager.changeTheme(e.target.value);
            // Removed plugin reload for strict isolation
        };
        colorThemeSelect.addEventListener("change", window._kimiColorThemeListener);
    }
    if (interfaceOpacitySlider) {
        const listener = e => {
            const validation = window.KimiValidationUtils?.validateRange(e.target.value, "interfaceOpacity");
            const value = validation?.value || parseFloat(e.target.value) || 0.8;

            document.getElementById("interface-opacity-value").textContent = value;
            e.target.value = value;
            debouncedOpacityUpdate(value);
        };
        interfaceOpacitySlider.addEventListener("input", listener);
        window._kimiListenerCleanup.push(() => interfaceOpacitySlider.removeEventListener("input", listener));
    }
    // Animation toggle is handled by KimiAppearanceManager
    // Remove the duplicate handler to prevent conflicts
    const transcriptToggle = document.getElementById("transcript-toggle");
    if (transcriptToggle) {
        let showTranscript = true;
        if (kimiDB && kimiDB.getPreference) {
            kimiDB.getPreference("showTranscript", true).then(showTranscript => {
                transcriptToggle.classList.toggle("active", showTranscript);
                transcriptToggle.setAttribute("aria-checked", showTranscript ? "true" : "false");
            });
        }
        const onToggle = async () => {
            const enabled = !transcriptToggle.classList.contains("active");
            transcriptToggle.classList.toggle("active", enabled);
            transcriptToggle.setAttribute("aria-checked", enabled ? "true" : "false");
            if (kimiDB && kimiDB.setPreference) {
                await kimiDB.setPreference("showTranscript", enabled);
            }
        };
        transcriptToggle.onclick = onToggle;
        transcriptToggle.onkeydown = async e => {
            if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                await onToggle();
            }
        };
    }
}

// Exposer globalement (Note: KimiMemory and KimiAppearanceManager are now in separate files)
window.KimiDataManager = KimiDataManager;
window.updateFavorabilityLabel = updateFavorabilityLabel;
window.loadCharacterSection = loadCharacterSection;
window.getBasicResponse = getBasicResponse;
window.analyzeAndReact = analyzeAndReact;
window.addMessageToChat = addMessageToChat;
window.loadChatHistory = loadChatHistory;
window.loadSettingsData = loadSettingsData;
window.updateSlider = updateSlider;
// ========================= DYNAMIC SLIDER SYNC =========================
async function refreshAllSliders() {
    if (!window.kimiDB) return;
    const prefMap = [
        ["voice-rate", "voiceRate", "VOICE_RATE"],
        ["voice-pitch", "voicePitch", "VOICE_PITCH"],
        ["voice-volume", "voiceVolume", "VOICE_VOLUME"],
        ["llm-temperature", "llmTemperature", "LLM_TEMPERATURE"],
        ["llm-max-tokens", "llmMaxTokens", "LLM_MAX_TOKENS"],
        ["llm-top-p", "llmTopP", "LLM_TOP_P"],
        ["llm-frequency-penalty", "llmFrequencyPenalty", "LLM_FREQUENCY_PENALTY"],
        ["llm-presence-penalty", "llmPresencePenalty", "LLM_PRESENCE_PENALTY"],
        ["interface-opacity", "interfaceOpacity", "INTERFACE_OPACITY"]
    ];
    for (const [sliderId, prefKey, defaultKey] of prefMap) {
        try {
            const el = document.getElementById(sliderId);
            if (!el) continue;
            const stored = await window.kimiDB.getPreference(prefKey, window.KIMI_CONFIG?.DEFAULTS?.[defaultKey]);
            if (typeof stored === "number" || (typeof stored === "string" && stored !== null)) {
                updateSlider(sliderId, stored);
            }
        } catch {}
    }
}
window.refreshAllSliders = refreshAllSliders;

const _debouncedPrefUpdate = window.KimiPerformanceUtils
    ? window.KimiPerformanceUtils.debounce(evt => {
          const key = evt.detail?.key;
          if (!key) return;
          const keyToSlider = {
              voiceRate: "voice-rate",
              voicePitch: "voice-pitch",
              voiceVolume: "voice-volume",
              llmTemperature: "llm-temperature",
              llmMaxTokens: "llm-max-tokens",
              llmTopP: "llm-top-p",
              llmFrequencyPenalty: "llm-frequency-penalty",
              llmPresencePenalty: "llm-presence-penalty",
              interfaceOpacity: "interface-opacity"
          };
          const sliderId = keyToSlider[key];
          if (sliderId && typeof evt.detail.value !== "undefined") {
              updateSlider(sliderId, evt.detail.value);
          }
      }, 120)
    : null;
window.addEventListener("preferenceUpdated", evt => {
    if (_debouncedPrefUpdate) _debouncedPrefUpdate(evt);
});
window.updatePersonalitySliders = updatePersonalitySliders;
window.updateStats = updateStats;
window.initializeAllSliders = initializeAllSliders;
window.syncLLMMaxTokensSlider = syncLLMMaxTokensSlider;
window.syncLLMTemperatureSlider = syncLLMTemperatureSlider;
window.updateTabsScrollIndicator = updateTabsScrollIndicator;
window.loadAvailableModels = loadAvailableModels;
window.sendMessage = sendMessage;
window.setupSettingsListeners = setupSettingsListeners;
window.syncPersonalityTraits = syncPersonalityTraits;
window.validateEmotionContext = validateEmotionContext;
window.ensureVideoContextConsistency = ensureVideoContextConsistency;

document.addEventListener("DOMContentLoaded", function () {
    const toggleBtn = document.getElementById("toggle-personality-traits");
    const cheatPanel = document.getElementById("personality-traits-panel");
    if (toggleBtn && cheatPanel) {
        toggleBtn.addEventListener("click", function () {
            const expanded = toggleBtn.getAttribute("aria-expanded") === "true";
            toggleBtn.setAttribute("aria-expanded", !expanded);
            cheatPanel.classList.toggle("open", !expanded);
        });
    }

    // Refresh UI models list when the LLM model changes programmatically
    try {
        window.addEventListener("llmModelChanged", () => {
            if (typeof window.loadAvailableModels === "function") {
                window.loadAvailableModels();
            }
        });
    } catch (e) {}

    // Typing indicator wiring
    try {
        // Soft tweak of API key input attributes shortly after load to reduce password manager prompts
        setTimeout(() => {
            const apiInput = document.getElementById("openrouter-api-key");
            if (apiInput) {
                apiInput.setAttribute("autocomplete", "new-password");
                apiInput.setAttribute("name", "openrouter_api_key");
                apiInput.setAttribute("data-lpignore", "true");
                apiInput.setAttribute("data-1p-ignore", "true");
                apiInput.setAttribute("data-bwignore", "true");
                apiInput.setAttribute("data-form-type", "other");
                apiInput.setAttribute("autocapitalize", "none");
                apiInput.setAttribute("autocorrect", "off");
                apiInput.setAttribute("spellcheck", "false");
            }
        }, 300);

        window.addEventListener("chat:typing:start", () => {
            const waitingIndicator = document.getElementById("waiting-indicator");
            const globalTyping = document.getElementById("global-typing-indicator");
            clearTimeout(window._kimiTypingDelayTimer);
            window._kimiTypingDelayTimer = setTimeout(() => {
                if (waitingIndicator) waitingIndicator.classList.add("visible");
                if (globalTyping) globalTyping.classList.add("visible");
            }, 150);
            // Safety auto-hide after 10s in case stop event is blocked
            clearTimeout(window._kimiTypingSafetyTimer);
            window._kimiTypingSafetyTimer = setTimeout(() => {
                if (waitingIndicator) waitingIndicator.classList.remove("visible");
                if (globalTyping) globalTyping.classList.remove("visible");
            }, 10000);
        });
        window.addEventListener("chat:typing:stop", () => {
            const waitingIndicator = document.getElementById("waiting-indicator");
            const globalTyping = document.getElementById("global-typing-indicator");
            if (waitingIndicator) waitingIndicator.classList.remove("visible");
            if (globalTyping) globalTyping.classList.remove("visible");
            clearTimeout(window._kimiTypingSafetyTimer);
            clearTimeout(window._kimiTypingDelayTimer);
        });
    } catch (e) {}
});

// Function to sync all personality traits with database and UI
async function syncPersonalityTraits(characterName = null) {
    const kimiDB = window.kimiDB;
    if (!kimiDB) return;

    const selectedCharacter = characterName || (await kimiDB.getSelectedCharacter());
    const traits = await kimiDB.getAllPersonalityTraits(selectedCharacter);

    // Build required traits prioritizing character-specific defaults (fallback to generic)
    const getRequiredTraits = () => {
        const charDefaults = (window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[selectedCharacter]?.traits) || {};
        let generic = {};
        if (window.KimiEmotionSystem) {
            const emotionSystem = new window.KimiEmotionSystem(kimiDB);
            generic = emotionSystem.TRAIT_DEFAULTS;
        } else if (window.getTraitDefaults) {
            generic = window.getTraitDefaults();
        } else {
            generic = { affection: 65, playfulness: 55, intelligence: 70, empathy: 75, humor: 60, romance: 50 };
        }
        // Character defaults take precedence over generic defaults
        return { ...generic, ...charDefaults };
    };

    const requiredTraits = getRequiredTraits();
    let needsUpdate = false;
    const updatedTraits = {};

    for (const [trait, defaultValue] of Object.entries(requiredTraits)) {
        const currentValue = traits[trait];
        if (typeof currentValue !== "number" || currentValue < 0 || currentValue > 100) {
            updatedTraits[trait] = defaultValue;
            needsUpdate = true;
        } else {
            updatedTraits[trait] = currentValue;
        }
    }

    // Update database if needed
    if (needsUpdate) {
        await kimiDB.setPersonalityBatch(updatedTraits, selectedCharacter);
    }

    // Update UI sliders
    for (const [trait, value] of Object.entries(updatedTraits)) {
        updateSlider(`trait-${trait}`, value);
    }

    // Update memory cache
    if (window.kimiMemory && updatedTraits.affection) {
        window.kimiMemory.affectionTrait = updatedTraits.affection;
        if (window.kimiMemory.updateFavorabilityBar) {
            window.kimiMemory.updateFavorabilityBar();
        }
    }

    // Video/voice updates are centralized in the 'personality:updated' listener.

    return updatedTraits;
}

// Function to validate emotion and context consistency
function validateEmotionContext(emotion) {
    // Normalize video categories to base emotions before validation
    const normalized = emotion === "speakingPositive" ? "positive" : emotion === "speakingNegative" ? "negative" : emotion;
    // Use unified emotion system for validation
    if (window.kimiEmotionSystem) {
        return window.kimiEmotionSystem.validateEmotion(normalized);
    }

    // Fallback validation
    const validEmotions = [
        "positive",
        "negative",
        "neutral",
        "dancing",
        "listening",
        "romantic",
        "laughing",
        "surprise",
        "confident",
        "shy",
        "flirtatious",
        "kiss",
        "goodbye",
        "speakingPositive",
        "speakingNegative",
        "speaking"
    ];

    if (!validEmotions.includes(normalized)) {
        console.warn(`Invalid emotion detected: ${normalized}, falling back to neutral`);
        return "neutral";
    }

    return normalized;
}

// Function to ensure video context consistency
async function ensureVideoContextConsistency() {
    if (!window.kimiVideo) return;

    const kimiDB = window.kimiDB;
    if (!kimiDB) return;

    const selectedCharacter = await kimiDB.getSelectedCharacter();
    const traits = await kimiDB.getAllPersonalityTraits(selectedCharacter);

    // Validate current video context
    const currentInfo = window.kimiVideo.getCurrentVideoInfo();
    const validatedEmotion = validateEmotionContext(currentInfo.emotion);

    if (validatedEmotion !== currentInfo.emotion) {
        window.kimiVideo.switchToContext("neutral", "neutral", null, traits, traits.affection);
    }
}
