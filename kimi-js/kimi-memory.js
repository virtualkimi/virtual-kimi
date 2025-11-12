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

            // Load affection trait from personality database with unified defaults
            const charDefAff = (window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[this.selectedCharacter]?.traits?.affection) || null;
            const unifiedDefaults = window.kimiEmotionSystem?.TRAIT_DEFAULTS || { affection: 55 };
            const defaultAff = typeof charDefAff === "number" ? charDefAff : unifiedDefaults.affection;
            this.affectionTrait = await this.db.getPersonalityTrait("affection", defaultAff, this.selectedCharacter);

            this.preferences = {
                voiceRate: await this.db.getPreference("voiceRate", 1.1),
                voicePitch: await this.db.getPreference("voicePitch", 1.1),
                voiceVolume: await this.db.getPreference("voiceVolume", 0.8),
                lastInteraction: await this.db.getPreference(`lastInteraction_${this.selectedCharacter}`, null),
                totalInteractions: await this.db.getPreference(`totalInteractions_${this.selectedCharacter}`, 0),
                emotionalState: await this.db.getPreference(`emotionalState_${this.selectedCharacter}`, "neutral")
            };
            // affectionTrait already loaded above with coherent default
            this.isReady = true;
            this.updateFavorabilityBar();
        } catch (error) {
            console.error("KimiMemory initialization error:", error);
        }
    }

    async saveConversation(userText, kimiResponse, tokenInfo = null) {
        if (!this.db) return;

        try {
            const character = await this.db.getSelectedCharacter();

            // Use global personality average for conversation favorability score
            let relationshipLevel = 50; // fallback
            try {
                const traits = window.getCharacterTraits ? await window.getCharacterTraits(character) : await this.db.getAllPersonalityTraits(character);
                relationshipLevel = window.getPersonalityAverage ? window.getPersonalityAverage(traits) : 50;
            } catch (error) {
                console.warn("Error calculating relationship level for conversation:", error);
            }

            await this.db.saveConversation(userText, kimiResponse, relationshipLevel, new Date(), character);

            // Legacy interactions counter kept for backward compatibility (not shown in UI now)
            let total = await this.db.getPreference(`totalInteractions_${character}`, 0);
            total = Number(total) + 1;
            await this.db.setPreference(`totalInteractions_${character}`, total);
            this.preferences.totalInteractions = total;

            // Update tokens usage if provided (in/out)
            if (tokenInfo && typeof tokenInfo.tokensIn === "number" && typeof tokenInfo.tokensOut === "number") {
                const prevIn = Number(await this.db.getPreference(`totalTokensIn_${character}`, 0)) || 0;
                const prevOut = Number(await this.db.getPreference(`totalTokensOut_${character}`, 0)) || 0;
                await this.db.setPreference(`totalTokensIn_${character}`, prevIn + tokenInfo.tokensIn);
                await this.db.setPreference(`totalTokensOut_${character}`, prevOut + tokenInfo.tokensOut);
            }

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
            const unifiedDefaults = window.kimiEmotionSystem?.TRAIT_DEFAULTS || { affection: 55 };
            this.affectionTrait = await this.db.getPersonalityTrait("affection", unifiedDefaults.affection, this.selectedCharacter);
            this.updateFavorabilityBar();
        } catch (error) {
            console.error("Error updating affection trait:", error);
        }
    }

    /**
     * @deprecated Use updateGlobalPersonalityUI().
     * Thin wrapper retained for backward compatibility only.
     */
    updateFavorabilityBar() {
        if (window.updateGlobalPersonalityUI) {
            window.updateGlobalPersonalityUI();
        }
    }

    async getGreeting() {
        const i18n = window.kimiI18nManager;

        // Use global personality average instead of just affection trait
        let relationshipLevel = 50; // fallback
        try {
            if (this.db) {
                const traits = window.getCharacterTraits
                    ? await window.getCharacterTraits(this.selectedCharacter)
                    : await this.db.getAllPersonalityTraits(this.selectedCharacter);
                relationshipLevel = window.getPersonalityAverage ? window.getPersonalityAverage(traits) : 50;
            }
        } catch (error) {
            console.warn("Error calculating greeting level:", error);
        }

        if (relationshipLevel <= 10) {
            return i18n?.t("greeting_low") || "Hello.";
        }
        if (relationshipLevel < 40) {
            return i18n?.t("greeting_mid") || "Hi. How can I help you?";
        }
        return i18n?.t("greeting_high") || "Hello my love! 💕";
    }
}

// Export to global scope
window.KimiMemory = KimiMemory;
export default KimiMemory;
