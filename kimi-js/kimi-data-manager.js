// KIMI DATA MANAGER (extracted from kimi-module.js)
// This file contains only the KimiDataManager class and its global exposure.
// Depends on: KimiBaseManager (defined in kimi-utils.js) and DOM APIs.

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
            const preferencesObj = await this.db.getAllPreferences();
            // Export preferences as an array of {key,value} so export is directly re-importable
            const preferences = Array.isArray(preferencesObj)
                ? preferencesObj
                : Object.keys(preferencesObj).map(k => ({ key: k, value: preferencesObj[k] }));
            const personalityTraits = await this.db.getAllPersonalityTraits();
            const models = await this.db.getAllLLMModels();
            const memories = await this.db.getAllMemories();

            const exportData = {
                version: "1.0",
                exportDate: new Date().toISOString(),
                conversations: conversations,
                preferences: preferences,
                personalityTraits: personalityTraits,
                models: models,
                memories: memories,
                metadata: {
                    totalConversations: conversations.length,
                    totalPreferences: Object.keys(preferences).length,
                    totalTraits: Object.keys(personalityTraits).length,
                    totalModels: models.length,
                    totalMemories: memories.length
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

    async importData(event) {
        const file = event.target.files[0];
        if (!file) {
            alert("No file selected.");
            return;
        }
        const reader = new FileReader();
        reader.onload = async e => {
            try {
                const data = JSON.parse(e.target.result);
                try {
                    console.log("Import file keys:", Object.keys(data));
                } catch (ex) {}

                if (data.preferences) {
                    try {
                        const isArray = Array.isArray(data.preferences);
                        const len = isArray ? data.preferences.length : Object.keys(data.preferences).length;
                        console.log("Import: preferences type=", isArray ? "array" : "object", "length=", len);
                    } catch (ex) {}
                    await this.db.setPreferencesBatch(data.preferences);
                } else {
                    console.log("Import: no preferences found");
                }

                if (data.conversations) {
                    try {
                        console.log(
                            "Import: conversations length=",
                            Array.isArray(data.conversations) ? data.conversations.length : "not-array"
                        );
                    } catch (ex) {}
                    await this.db.setConversationsBatch(data.conversations);
                } else {
                    console.log("Import: no conversations found");
                }

                if (data.personalityTraits) {
                    try {
                        console.log("Import: personalityTraits type=", typeof data.personalityTraits);
                    } catch (ex) {}
                    await this.db.setPersonalityBatch(data.personalityTraits);
                } else {
                    console.log("Import: no personalityTraits found");
                }

                if (data.models) {
                    try {
                        console.log("Import: models length=", Array.isArray(data.models) ? data.models.length : "not-array");
                    } catch (ex) {}
                    await this.db.setLLMModelsBatch(data.models);
                } else {
                    console.log("Import: no models found");
                }

                if (data.memories) {
                    try {
                        console.log(
                            "Import: memories length=",
                            Array.isArray(data.memories) ? data.memories.length : "not-array"
                        );
                    } catch (ex) {}
                    await this.db.setAllMemories(data.memories);
                } else {
                    console.log("Import: no memories found");
                }

                alert("Import successful!");
                await this.updateStorageInfo();

                // Reload the page to ensure all UI state is rebuilt from the newly imported DB
                setTimeout(() => {
                    location.reload();
                }, 200);
            } catch (err) {
                console.error("Import failed:", err);
                alert("Import failed. Invalid file or format.");
            }
        };
        reader.readAsText(file);
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

// Global exposure (legacy pattern). Will be phased out; prefer: import { KimiDataManager } from "./kimi-data-manager.js";
window.KimiDataManager = KimiDataManager; // DEPRECATED access path (kept for backward compatibility)

export { KimiDataManager };
