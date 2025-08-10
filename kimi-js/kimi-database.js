// ===== KIMI INDEXEDDB DATABASE SYSTEM =====
class KimiDatabase {
    constructor() {
        this.dbName = "KimiDB";
        this.db = new Dexie(this.dbName);
        this.db.version(3).stores({
            conversations: "++id,timestamp,favorability,character",
            preferences: "key",
            settings: "category",
            personality: "[character+trait],character",
            llmModels: "id",
            memories: "++id,[character+category],character,timestamp,isActive"
        });
    }

    async init() {
        await this.db.open();
        await this.initializeDefaultsIfNeeded();
        return this.db;
    }

    async initializeDefaultsIfNeeded() {
        // Use unified trait defaults from emotion system - CRITICAL FIX
        const getUnifiedDefaults = () => {
            if (window.KimiEmotionSystem) {
                const emotionSystem = new window.KimiEmotionSystem(this);
                return emotionSystem.TRAIT_DEFAULTS;
            }
            // Fallback to match KimiEmotionSystem exactly
            return {
                affection: 65,
                playfulness: 55,
                intelligence: 70,
                empathy: 75,
                humor: 60,
                romance: 50
            };
        };

        const defaults = getUnifiedDefaults();

        const defaultPreferences = [
            { key: "selectedLanguage", value: "en" },
            { key: "selectedVoice", value: "Microsoft Eloise Online" },
            { key: "voiceRate", value: 1.1 },
            { key: "voicePitch", value: 1.1 },
            { key: "voiceVolume", value: 0.8 },
            { key: "selectedCharacter", value: "kimi" },
            { key: "colorTheme", value: "purple" },
            { key: "interfaceOpacity", value: 0.8 },
            { key: "animationsEnabled", value: true },
            { key: "showTranscript", value: true },
            { key: "llmProvider", value: "openrouter" },
            { key: "llmBaseUrl", value: "https://openrouter.ai/api/v1/chat/completions" },
            { key: "llmModelId", value: "mistralai/mistral-small-3.2-24b-instruct" },
            { key: "llmApiKey", value: "" },
            { key: "apiKey_openai", value: "" },
            { key: "apiKey_groq", value: "" },
            { key: "apiKey_together", value: "" },
            { key: "apiKey_deepseek", value: "" },
            { key: "apiKey_custom", value: "" }
        ];
        const defaultSettings = [
            {
                category: "llm",
                settings: {
                    temperature: 0.9,
                    maxTokens: 100,
                    top_p: 0.9,
                    frequency_penalty: 0.3,
                    presence_penalty: 0.3
                }
            }
        ];

        const getCharacterDefaults = () => {
            if (!window.KIMI_CHARACTERS) return {};

            const characterDefaults = {};
            Object.keys(window.KIMI_CHARACTERS).forEach(characterKey => {
                const character = window.KIMI_CHARACTERS[characterKey];
                if (character && character.traits) {
                    characterDefaults[characterKey] = character.traits;
                }
            });
            return characterDefaults;
        };

        const personalityDefaults = getCharacterDefaults();

        const defaultLLMModels = [
            {
                id: "mistralai/mistral-small-3.2-24b-instruct",
                name: "Mistral Small 3.2",
                provider: "openrouter",
                apiKey: "",
                config: { temperature: 0.9, maxTokens: 100 },
                added: new Date().toISOString(),
                lastUsed: null
            }
        ];

        const prefCount = await this.db.preferences.count();
        if (prefCount === 0) {
            for (const pref of defaultPreferences) {
                await this.db.preferences.put({ ...pref, updated: new Date().toISOString() });
            }
            const characters = Object.keys(window.KIMI_CHARACTERS || { kimi: {} });
            for (const character of characters) {
                const prompt = window.KIMI_CHARACTERS[character]?.defaultPrompt || "";
                await this.db.preferences.put({
                    key: `systemPrompt_${character}`,
                    value: prompt,
                    updated: new Date().toISOString()
                });
            }
        }

        const setCount = await this.db.settings.count();
        if (setCount === 0) {
            for (const setting of defaultSettings) {
                await this.db.settings.put({ ...setting, updated: new Date().toISOString() });
            }
        }

        const persCount = await this.db.personality.count();
        if (persCount === 0) {
            const characters = Object.keys(window.KIMI_CHARACTERS || { kimi: {} });
            for (const character of characters) {
                // Use real character-specific traits, not generic defaults
                const characterTraits = personalityDefaults[character] || {};
                const traitsToInitialize = [
                    { trait: "affection", value: characterTraits.affection || defaults.affection },
                    { trait: "playfulness", value: characterTraits.playfulness || defaults.playfulness },
                    { trait: "intelligence", value: characterTraits.intelligence || defaults.intelligence },
                    { trait: "empathy", value: characterTraits.empathy || defaults.empathy },
                    { trait: "humor", value: characterTraits.humor || defaults.humor },
                    { trait: "romance", value: characterTraits.romance || defaults.romance }
                ];

                for (const trait of traitsToInitialize) {
                    await this.db.personality.put({ ...trait, character, updated: new Date().toISOString() });
                }
            }
        }

        const llmCount = await this.db.llmModels.count();
        if (llmCount === 0) {
            for (const model of defaultLLMModels) {
                await this.db.llmModels.put(model);
            }
        }

        // Fix: never recreate default conversations
        const convCount = await this.db.conversations.count();
        if (convCount === 0) {
            // Ne rien faire : aucune conversation par défaut
        }
    }

    async saveConversation(userText, kimiResponse, favorability, timestamp = new Date(), character = null) {
        if (!character) character = await this.getSelectedCharacter();
        const conversation = {
            user: userText,
            kimi: kimiResponse,
            favorability: favorability,
            timestamp: timestamp.toISOString(),
            date: timestamp.toDateString(),
            character: character
        };
        return this.db.conversations.add(conversation);
    }

    async getRecentConversations(limit = 10, character = null) {
        if (!character) character = await this.getSelectedCharacter();
        // Dexie limitation: orderBy() cannot follow a where() chain.
        // Use compound index path by querying all then sorting, or use a custom index strategy.
        // Here we query filtered by character, then sort in JS and take the last N.
        return this.db.conversations
            .where("character")
            .equals(character)
            .toArray()
            .then(arr => {
                arr.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                return arr.slice(-limit);
            });
    }

    async getAllConversations(character = null) {
        try {
            if (!character) character = await this.getSelectedCharacter();
            return await this.db.conversations.where("character").equals(character).toArray();
        } catch (error) {
            console.warn("Error getting all conversations:", error);
            return [];
        }
    }

    async setPreference(key, value) {
        if (key === "openrouterApiKey" || key === "llmApiKey" || key.startsWith("apiKey_")) {
            const isValid = window.KIMI_VALIDATORS?.validateApiKey(value) || window.KimiSecurityUtils?.validateApiKey(value);
            if (!isValid && value.length > 0) {
                throw new Error("Invalid API key format");
            }
            // Store keys in plain text (no encryption) per request
            if (window.KimiCacheManager && typeof window.KimiCacheManager.set === "function") {
                window.KimiCacheManager.set(`pref_${key}`, value, 60000);
            }
            return this.db.preferences.put({
                key: key,
                value: value,
                // do not set encrypted flag anymore
                updated: new Date().toISOString()
            });
        }

        // Update cache for regular preferences
        if (window.KimiCacheManager && typeof window.KimiCacheManager.set === "function") {
            window.KimiCacheManager.set(`pref_${key}`, value, 60000);
        }

        return this.db.preferences.put({
            key: key,
            value: value,
            updated: new Date().toISOString()
        });
    }

    async getPreference(key, defaultValue = null) {
        // Try cache first (use a singleton cache instance)
        const cacheKey = `pref_${key}`;
        const cache = window.kimiCache instanceof KimiCacheManager ? window.kimiCache : null;
        if (cache && typeof cache.get === "function") {
            const cached = cache.get(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }

        try {
            const record = await this.db.preferences.get(key);
            if (!record) {
                const cache = window.kimiCache instanceof KimiCacheManager ? window.kimiCache : null;
                if (cache && typeof cache.set === "function") {
                    cache.set(cacheKey, defaultValue, 60000); // Cache for 1 minute
                }
                return defaultValue;
            }

            // Backward compatibility: decrypt legacy encrypted values
            let value = record.value;
            if (record.encrypted && window.KimiSecurityUtils) {
                try {
                    value = window.KimiSecurityUtils.decryptApiKey(record.value);
                    // One-time migration: store back as plain text without encrypted flag
                    try {
                        await this.db.preferences.put({ key: key, value, updated: new Date().toISOString() });
                    } catch (mErr) {}
                } catch (e) {
                    // If decryption fails, fallback to raw value
                    console.warn("Failed to decrypt legacy API key; returning raw value", e);
                }
            }

            // Cache the result
            const cache = window.kimiCache instanceof KimiCacheManager ? window.kimiCache : null;
            if (cache && typeof cache.set === "function") {
                cache.set(cacheKey, value, 60000); // Cache for 1 minute
            }

            return value;
        } catch (error) {
            console.warn(`Error getting preference ${key}:`, error);
            return defaultValue;
        }
    }

    async getAllPreferences() {
        try {
            const all = await this.db.preferences.toArray();
            const prefs = {};
            all.forEach(item => {
                prefs[item.key] = item.value;
            });
            return prefs;
        } catch (error) {
            console.warn("Error getting all preferences:", error);
            return {};
        }
    }

    async setSetting(category, settings) {
        return this.db.settings.put({
            category: category,
            settings: settings,
            updated: new Date().toISOString()
        });
    }

    async getSetting(category, defaultSettings = {}) {
        const result = await this.db.settings.get(category);
        return result ? result.settings : defaultSettings;
    }

    async setPersonalityTrait(trait, value, character = null) {
        if (!character) character = await this.getSelectedCharacter();

        // Invalidate cache
        if (window.KimiCacheManager && typeof window.KimiCacheManager.delete === "function") {
            window.KimiCacheManager.delete(`trait_${character}_${trait}`);
            window.KimiCacheManager.delete(`all_traits_${character}`);
        }

        return this.db.personality.put({
            trait: trait,
            character: character,
            value: value,
            updated: new Date().toISOString()
        });
    }

    async getPersonalityTrait(trait, defaultValue = null, character = null) {
        if (!character) character = await this.getSelectedCharacter();

        // Use unified defaults from emotion system
        if (defaultValue === null) {
            if (window.KimiEmotionSystem) {
                const emotionSystem = new window.KimiEmotionSystem(this);
                defaultValue = emotionSystem.TRAIT_DEFAULTS[trait] || 50;
            } else {
                // Fallback defaults (must match KimiEmotionSystem.TRAIT_DEFAULTS exactly)
                const fallbackDefaults = {
                    affection: 65, // Fixed - matches KimiEmotionSystem
                    playfulness: 55, // Fixed - matches KimiEmotionSystem
                    intelligence: 70, // Fixed - matches KimiEmotionSystem
                    empathy: 75, // Fixed - matches KimiEmotionSystem
                    humor: 60, // Fixed - matches KimiEmotionSystem
                    romance: 50 // Fixed - matches KimiEmotionSystem
                };
                defaultValue = fallbackDefaults[trait] || 50;
            }
        }

        // Try cache first
        const cacheKey = `trait_${character}_${trait}`;
        if (window.KimiCacheManager && typeof window.KimiCacheManager.get === "function") {
            const cached = window.KimiCacheManager.get(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }

        const found = await this.db.personality.get([character, trait]);
        const value = found ? found.value : defaultValue;

        // Cache the result
        if (window.KimiCacheManager && typeof window.KimiCacheManager.set === "function") {
            window.KimiCacheManager.set(cacheKey, value, 120000); // Cache for 2 minutes
        }
        return value;
    }

    async getAllPersonalityTraits(character = null) {
        if (!character) character = await this.getSelectedCharacter();

        // Try cache first
        const cacheKey = `all_traits_${character}`;
        if (window.KimiCacheManager && typeof window.KimiCacheManager.get === "function") {
            const cached = window.KimiCacheManager.get(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }

        const all = await this.db.personality.where("character").equals(character).toArray();
        const traits = {};
        all.forEach(item => {
            traits[item.trait] = item.value;
        });

        // Cache the result
        if (window.KimiCacheManager && typeof window.KimiCacheManager.set === "function") {
            window.KimiCacheManager.set(cacheKey, traits, 120000); // Cache for 2 minutes
        }
        return traits;
    }

    async savePersonality(personalityObj, character = null) {
        if (!character) character = await this.getSelectedCharacter();
        // Invalidate caches for all affected traits and the aggregate cache for this character
        if (window.KimiCacheManager && typeof window.KimiCacheManager.delete === "function") {
            try {
                Object.keys(personalityObj).forEach(trait => {
                    window.KimiCacheManager.delete(`trait_${character}_${trait}`);
                });
                window.KimiCacheManager.delete(`all_traits_${character}`);
            } catch (e) {}
        }
        const entries = Object.entries(personalityObj).map(([trait, value]) =>
            this.db.personality.put({
                trait: trait,
                character: character,
                value: value,
                updated: new Date().toISOString()
            })
        );
        return Promise.all(entries);
    }

    async getPersonality(character = null) {
        return this.getAllPersonalityTraits(character);
    }

    async saveLLMModel(id, name, provider, apiKey, config) {
        return this.db.llmModels.put({
            id: id,
            name: name,
            provider: provider,
            apiKey: apiKey,
            config: config,
            added: new Date().toISOString(),
            lastUsed: null
        });
    }

    async getLLMModel(id) {
        return this.db.llmModels.get(id);
    }

    async getAllLLMModels() {
        try {
            return await this.db.llmModels.toArray();
        } catch (error) {
            console.warn("Error getting all LLM models:", error);
            return [];
        }
    }

    async deleteLLMModel(id) {
        return this.db.llmModels.delete(id);
    }

    async cleanOldConversations(days = null, character = null) {
        // If days not provided, fallback to full clean (legacy behavior)
        if (days === null) {
            if (character) {
                const all = await this.db.conversations.where("character").equals(character).toArray();
                const ids = all.map(item => item.id);
                return this.db.conversations.bulkDelete(ids);
            } else {
                return this.db.conversations.clear();
            }
        }
        const threshold = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        if (character) {
            const toDelete = await this.db.conversations
                .where("character")
                .equals(character)
                .and(c => c.timestamp < threshold)
                .toArray();
            const ids = toDelete.map(item => item.id);
            return this.db.conversations.bulkDelete(ids);
        } else {
            const toDelete = await this.db.conversations.where("timestamp").below(threshold).toArray();
            const ids = toDelete.map(item => item.id);
            return this.db.conversations.bulkDelete(ids);
        }
    }

    async getStorageStats() {
        try {
            const conversations = await this.getAllConversations();
            const preferences = await this.getAllPreferences();
            const models = await this.getAllLLMModels();
            return {
                conversations: conversations ? conversations.length : 0,
                preferences: preferences ? Object.keys(preferences).length : 0,
                models: models ? models.length : 0,
                totalSize: JSON.stringify({
                    conversations: conversations || [],
                    preferences: preferences || {},
                    models: models || []
                }).length
            };
        } catch (error) {
            console.error("Error getting storage stats:", error);
            return {
                conversations: 0,
                preferences: 0,
                models: 0,
                totalSize: 0
            };
        }
    }

    async deleteSingleMessage(conversationId, sender) {
        const conv = await this.db.conversations.get(conversationId);
        if (!conv) return;
        if (sender === "user") {
            conv.user = "";
        } else if (sender === "kimi") {
            conv.kimi = "";
        }
        if ((conv.user === undefined || conv.user === "") && (conv.kimi === undefined || conv.kimi === "")) {
            await this.db.conversations.delete(conversationId);
        } else {
            await this.db.conversations.put(conv);
        }
    }

    async setPreferencesBatch(prefsArray) {
        const batch = prefsArray.map(({ key, value }) => ({ key, value, updated: new Date().toISOString() }));
        return this.db.preferences.bulkPut(batch);
    }
    async setPersonalityBatch(traitsObj, character = null) {
        if (!character) character = await this.getSelectedCharacter();
        // Invalidate caches for all affected traits and the aggregate cache for this character
        if (window.KimiCacheManager && typeof window.KimiCacheManager.delete === "function") {
            try {
                Object.keys(traitsObj).forEach(trait => {
                    window.KimiCacheManager.delete(`trait_${character}_${trait}`);
                });
                window.KimiCacheManager.delete(`all_traits_${character}`);
            } catch (e) {}
        }

        const batch = Object.entries(traitsObj).map(([trait, value]) => ({
            trait,
            character,
            value,
            updated: new Date().toISOString()
        }));
        return this.db.personality.bulkPut(batch);
    }
    async setSettingsBatch(settingsArray) {
        const batch = settingsArray.map(({ category, settings }) => ({
            category,
            settings,
            updated: new Date().toISOString()
        }));
        return this.db.settings.bulkPut(batch);
    }
    async getPreferencesBatch(keys) {
        const results = await this.db.preferences.where("key").anyOf(keys).toArray();
        const out = {};
        for (const item of results) {
            let val = item.value;
            if (item.encrypted && window.KimiSecurityUtils) {
                try {
                    val = window.KimiSecurityUtils.decryptApiKey(item.value);
                    // Migrate back as plain
                    try {
                        await this.db.preferences.put({ key: item.key, value: val, updated: new Date().toISOString() });
                    } catch (mErr) {}
                } catch (e) {
                    console.warn("Failed to decrypt legacy pref in batch:", item.key, e);
                }
            }
            out[item.key] = val;
        }
        return out;
    }
    async getPersonalityTraitsBatch(traits, character = null) {
        if (!character) character = await this.getSelectedCharacter();
        const results = await this.db.personality.where("character").equals(character).toArray();
        const out = {};
        traits.forEach(trait => {
            const found = results.find(item => item.trait === trait);
            out[trait] = found ? found.value : 50;
        });
        return out;
    }

    async getSelectedCharacter() {
        try {
            return await this.getPreference("selectedCharacter", "kimi");
        } catch (error) {
            console.warn("Error getting selected character:", error);
            return "kimi";
        }
    }

    async setSelectedCharacter(character) {
        try {
            await this.setPreference("selectedCharacter", character);
        } catch (error) {
            console.error("Error setting selected character:", error);
        }
    }

    async getSystemPromptForCharacter(character = null) {
        if (!character) character = await this.getSelectedCharacter();
        try {
            const prompt = await this.getPreference(`systemPrompt_${character}`, null);
            if (prompt) return prompt;

            if (window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[character] && window.KIMI_CHARACTERS[character].defaultPrompt) {
                return window.KIMI_CHARACTERS[character].defaultPrompt;
            }

            return window.DEFAULT_SYSTEM_PROMPT || "";
        } catch (error) {
            console.warn("Error getting system prompt for character:", error);
            return window.DEFAULT_SYSTEM_PROMPT || "";
        }
    }

    async setSystemPromptForCharacter(character, prompt) {
        if (!character) character = await this.getSelectedCharacter();
        try {
            await this.setPreference(`systemPrompt_${character}`, prompt);
        } catch (error) {
            console.error("Error setting system prompt for character:", error);
        }
    }
}

// Export for usage
window.KimiDatabase = KimiDatabase;
