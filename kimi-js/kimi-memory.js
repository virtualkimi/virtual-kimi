// ===== KIMI MEMORY MANAGER =====
class KimiMemory {
    constructor(database) {
        this.db = database;
        this.preferences = {
            voiceRate: 1.1,
            voicePitch: 1.1,
            voiceVolume: 0.8,
            lastInteraction: null,
            totalInteractions: 0,
            favoriteWords: [],
            emotionalState: "neutral"
        };
        this.isReady = false;
        // affectionTrait will be loaded from database during init()
        this.affectionTrait = 50; // Temporary default until loaded from DB
    }

    async init() {
        if (!this.db) {
            console.warn("Database not available, using local mode");
            return;
        }
        try {
            this.selectedCharacter = await this.db.getSelectedCharacter();
            // Start with lower favorability level - relationships must be built over time
            this.favorabilityLevel = await this.db.getPreference(`favorabilityLevel_${this.selectedCharacter}`, 50);

            // Load affection trait from personality database - CRITICAL FIX
            this.affectionTrait = await this.db.getPersonalityTrait("affection", 50, this.selectedCharacter);

            this.preferences = {
                voiceRate: await this.db.getPreference(`voiceRate_${this.selectedCharacter}`, 1.1),
                voicePitch: await this.db.getPreference(`voicePitch_${this.selectedCharacter}`, 1.1),
                voiceVolume: await this.db.getPreference(`voiceVolume_${this.selectedCharacter}`, 0.8),
                lastInteraction: await this.db.getPreference(`lastInteraction_${this.selectedCharacter}`, null),
                totalInteractions: await this.db.getPreference(`totalInteractions_${this.selectedCharacter}`, 0),
                favoriteWords: await this.db.getPreference(`favoriteWords_${this.selectedCharacter}`, []),
                emotionalState: await this.db.getPreference(`emotionalState_${this.selectedCharacter}`, "neutral")
            };
            this.affectionTrait = await this.db.getPersonalityTrait("affection", 80, this.selectedCharacter);
            this.isReady = true;
            this.updateFavorabilityBar();
        } catch (error) {
            console.error("KimiMemory initialization error:", error);
        }
    }

    async saveConversation(userText, kimiResponse) {
        if (!this.db) return;

        try {
            const character = await this.db.getSelectedCharacter();
            await this.db.saveConversation(userText, kimiResponse, this.favorabilityLevel, new Date(), character);

            let total = await this.db.getPreference(`totalInteractions_${character}`, 0);
            total = Number(total) + 1;
            await this.db.setPreference(`totalInteractions_${character}`, total);
            this.preferences.totalInteractions = total;

            let first = await this.db.getPreference(`firstInteraction_${character}`, null);
            if (!first) {
                first = new Date().toISOString();
                await this.db.setPreference(`firstInteraction_${character}`, first);
            }

            this.preferences.lastInteraction = new Date().toISOString();
            await this.db.setPreference(`lastInteraction_${character}`, this.preferences.lastInteraction);
        } catch (error) {
            console.error("Error saving conversation:", error);
        }
    }

    async updateFavorability(change) {
        try {
            this.affectionTrait = Math.max(0, Math.min(100, this.affectionTrait + change));
            if (this.db) {
                await this.db.setPersonalityTrait("affection", this.affectionTrait, this.selectedCharacter);
            }
            this.updateFavorabilityBar();
        } catch (error) {
            console.error("Error updating favorability:", error);
        }
    }

    async updateAffectionTrait() {
        if (!this.db) return;

        try {
            this.selectedCharacter = await this.db.getSelectedCharacter();
            // Use unified default that matches KimiEmotionSystem
            this.affectionTrait = await this.db.getPersonalityTrait("affection", 50, this.selectedCharacter);
            this.updateFavorabilityBar();
        } catch (error) {
            console.error("Error updating affection trait:", error);
        }
    }

    updateFavorabilityBar() {
        try {
            const favorabilityBar = document.getElementById("favorability-bar");
            const favorabilityText = document.getElementById("favorability-text");
            const value = this.affectionTrait;

            if (favorabilityBar) {
                favorabilityBar.style.width = `${value}%`;
            }
            if (favorabilityText) {
                favorabilityText.textContent = `${value}%`;
            }
        } catch (error) {
            console.error("Error updating favorability bar:", error);
        }
    }

    getGreeting() {
        const i18n = window.kimiI18nManager;

        if (this.affectionTrait <= 10) {
            return i18n?.t("greeting_low") || "Hello.";
        }
        if (this.affectionTrait < 40) {
            return i18n?.t("greeting_mid") || "Hi. How can I help you?";
        }
        return i18n?.t("greeting_high") || "Hello my love! 💕";
    }
}

// Export to global scope
window.KimiMemory = KimiMemory;
