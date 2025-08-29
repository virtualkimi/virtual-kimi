// KIMI INDEXEDDB DATABASE SYSTEM
class KimiDatabase {
    constructor() {
        this.dbName = "KimiDB";
        this.db = new Dexie(this.dbName);
        this.db
            .version(3)
            .stores({
                conversations: "++id,timestamp,favorability,character",
                preferences: "key",
                settings: "category",
                personality: "[character+trait],character",
                llmModels: "id",
                memories: "++id,[character+category],character,timestamp,isActive"
            })
            .upgrade(async tx => {
                try {
                    const preferences = tx.table("preferences");
                    const settings = tx.table("settings");
                    const conversations = tx.table("conversations");
                    const llmModels = tx.table("llmModels");

                    await preferences.toCollection().modify(rec => {
                        if (Object.prototype.hasOwnProperty.call(rec, "encrypted")) {
                            delete rec.encrypted;
                        }
                    });

                    const llmSetting = await settings.get("llm");
                    if (!llmSetting) {
                        await settings.put({
                            category: "llm",
                            settings: {
                                temperature: 0.9,
                                maxTokens: 400,
                                top_p: 0.9,
                                frequency_penalty: 0.9,
                                presence_penalty: 0.8
                            },
                            updated: new Date().toISOString()
                        });
                    }

                    await conversations.toCollection().modify(rec => {
                        if (!rec.character) rec.character = "kimi";
                    });

                    const modelsCount = await llmModels.count();
                    if (modelsCount === 0) {
                        await llmModels.put({
                            id: "mistralai/mistral-small-3.2-24b-instruct",
                            name: "Mistral Small 3.2",
                            provider: "openrouter",
                            apiKey: "",
                            config: { temperature: 0.9, maxTokens: 400 },
                            added: new Date().toISOString(),
                            lastUsed: null
                        });
                    }
                } catch (e) {
                    // Swallow upgrade errors to avoid blocking DB open; post-open migrations will attempt fixes
                }
            });

        // Version 4: extend memories metadata (importance, accessCount, lastAccess, createdAt)
        this.db
            .version(4)
            .stores({
                conversations: "++id,timestamp,favorability,character",
                preferences: "key",
                settings: "category",
                personality: "[character+trait],character",
                llmModels: "id",
                memories: "++id,[character+category],character,timestamp,isActive,importance,accessCount"
            })
            .upgrade(async tx => {
                try {
                    const memories = tx.table("memories");
                    const now = new Date().toISOString();
                    await memories.toCollection().modify(rec => {
                        if (rec.importance == null) rec.importance = rec.type === "explicit_request" ? 0.9 : 0.5;
                        if (rec.accessCount == null) rec.accessCount = 0;
                        if (!rec.createdAt) rec.createdAt = rec.timestamp || now;
                        if (!rec.lastAccess) rec.lastAccess = rec.timestamp || now;
                    });
                } catch (e) {
                    // Silent; non-blocking
                }
            });
    }

    async setConversationsBatch(conversationsArray) {
        if (!Array.isArray(conversationsArray)) return;
        try {
            await this.db.conversations.clear();
            if (conversationsArray.length) {
                await this.db.conversations.bulkPut(conversationsArray);
            }
        } catch (error) {
            console.error("Error restoring conversations:", error);
        }
    }

    async setLLMModelsBatch(modelsArray) {
        if (!Array.isArray(modelsArray)) return;
        try {
            await this.db.llmModels.clear();
            if (modelsArray.length) {
                await this.db.llmModels.bulkPut(modelsArray);
            }
        } catch (error) {
            console.error("Error restoring LLM models:", error);
        }
    }

    async getAllMemories() {
        try {
            return await this.db.memories.toArray();
        } catch (error) {
            console.warn("Error getting all memories:", error);
            return [];
        }
    }

    async setAllMemories(memoriesArray) {
        if (!Array.isArray(memoriesArray)) return;
        try {
            await this.db.memories.clear();
            if (memoriesArray.length) {
                await this.db.memories.bulkPut(memoriesArray);
            }
        } catch (error) {
            console.error("Error restoring memories:", error);
        }
    }

    async init() {
        await this.db.open();
        await this.initializeDefaultsIfNeeded();
        await this.runPostOpenMigrations();
        return this.db;
    }

    getUnifiedTraitDefaults() {
        if (window.KimiEmotionSystem) {
            const emotionSystem = new window.KimiEmotionSystem(this);
            return emotionSystem.TRAIT_DEFAULTS;
        }
        return {
            affection: 55,
            playfulness: 55,
            intelligence: 70,
            empathy: 75,
            humor: 60,
            romance: 50
        };
    }

    getDefaultPreferences() {
        return [
            { key: "selectedLanguage", value: "en" },
            { key: "selectedVoice", value: "auto" },
            { key: "voiceRate", value: 1.1 },
            { key: "voicePitch", value: 1.1 },
            { key: "voiceVolume", value: 0.8 },
            { key: "selectedCharacter", value: "kimi" },
            { key: "colorTheme", value: "dark" },
            { key: "interfaceOpacity", value: 0.8 },
            { key: "showTranscript", value: true },
            { key: "enableStreaming", value: true },
            { key: "voiceEnabled", value: true },
            { key: "memorySystemEnabled", value: true },
            { key: "llmProvider", value: "openrouter" },
            { key: "llmBaseUrl", value: "https://openrouter.ai/api/v1/chat/completions" },
            { key: "llmModelId", value: "mistralai/mistral-small-3.2-24b-instruct" },
            { key: "providerApiKey", value: "" }
        ];
    }

    getDefaultSettings() {
        return [
            {
                category: "llm",
                settings: {
                    temperature: 0.9,
                    maxTokens: 400,
                    top_p: 0.9,
                    frequency_penalty: 0.9,
                    presence_penalty: 0.8
                }
            }
        ];
    }

    getCharacterTraitDefaults() {
        if (!window.KIMI_CHARACTERS) return {};
        const characterDefaults = {};
        Object.keys(window.KIMI_CHARACTERS).forEach(characterKey => {
            const character = window.KIMI_CHARACTERS[characterKey];
            if (character && character.traits) {
                characterDefaults[characterKey] = character.traits;
            }
        });
        return characterDefaults;
    }

    getDefaultLLMModels() {
        return [
            {
                id: "mistralai/mistral-small-3.2-24b-instruct",
                name: "Mistral Small 3.2",
                provider: "openrouter",
                apiKey: "",
                config: { temperature: 0.9, maxTokens: 400 },
                added: new Date().toISOString(),
                lastUsed: null
            }
        ];
    }

    async initializeDefaultsIfNeeded() {
        const defaults = this.getUnifiedTraitDefaults();

        const defaultPreferences = this.getDefaultPreferences();
        const defaultSettings = this.getDefaultSettings();
        const personalityDefaults = this.getCharacterTraitDefaults();
        const defaultLLMModels = this.getDefaultLLMModels();

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
        }
    }

    async runPostOpenMigrations() {
        try {
            const defaultPreferences = this.getDefaultPreferences();
            for (const pref of defaultPreferences) {
                const existing = await this.db.preferences.get(pref.key);
                if (!existing) {
                    await this.db.preferences.put({
                        key: pref.key,
                        value: pref.value,
                        updated: new Date().toISOString()
                    });
                }
            }

            const characters = Object.keys(window.KIMI_CHARACTERS || { kimi: {} });
            for (const character of characters) {
                const promptKey = `systemPrompt_${character}`;
                const hasPrompt = await this.db.preferences.get(promptKey);
                if (!hasPrompt) {
                    const prompt = window.KIMI_CHARACTERS[character]?.defaultPrompt || "";
                    await this.db.preferences.put({ key: promptKey, value: prompt, updated: new Date().toISOString() });
                }
            }

            const defaultSettings = this.getDefaultSettings();
            for (const setting of defaultSettings) {
                const existing = await this.db.settings.get(setting.category);
                if (!existing) {
                    await this.db.settings.put({ ...setting, updated: new Date().toISOString() });
                } else {
                    const merged = { ...setting.settings, ...existing.settings };
                    await this.db.settings.put({
                        category: setting.category,
                        settings: merged,
                        updated: new Date().toISOString()
                    });
                }
            }

            const defaults = this.getUnifiedTraitDefaults();
            const personalityDefaults = this.getCharacterTraitDefaults();
            for (const character of Object.keys(window.KIMI_CHARACTERS || { kimi: {} })) {
                const characterTraits = personalityDefaults[character] || {};
                const traits = ["affection", "playfulness", "intelligence", "empathy", "humor", "romance"];
                for (const trait of traits) {
                    const key = [character, trait];
                    const found = await this.db.personality.get(key);
                    if (!found) {
                        const value = Number(characterTraits[trait] ?? defaults[trait] ?? 50);
                        const v = isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
                        await this.db.personality.put({ trait, character, value: v, updated: new Date().toISOString() });
                    }
                }
            }

            const llmCount = await this.db.llmModels.count();
            if (llmCount === 0) {
                for (const model of this.getDefaultLLMModels()) {
                    await this.db.llmModels.put(model);
                }
            }

            const allConvs = await this.db.conversations.toArray();
            const toPatch = allConvs.filter(c => !c.character);
            if (toPatch.length) {
                for (const c of toPatch) {
                    c.character = "kimi";
                    await this.db.conversations.put(c);
                }
            }

            const allPrefs = await this.db.preferences.toArray();
            const legacy = allPrefs.filter(p => Object.prototype.hasOwnProperty.call(p, "encrypted"));
            if (legacy.length) {
                for (const p of legacy) {
                    const { key, value } = p;
                    await this.db.preferences.put({ key, value, updated: new Date().toISOString() });
                }
            }

            // MIGRATION: Fix Kimi affection progression issue - update default affection from 65 to 55
            // This allows better progression and prevents blocking at ~65%
            const kimiAffectionRecord = await this.db.personality.get(["kimi", "affection"]);
            if (kimiAffectionRecord && kimiAffectionRecord.value === 65) {
                // Only update if it's exactly 65 (the old default) and user hasn't modified it significantly
                const newValue = window.KIMI_CHARACTERS?.kimi?.traits?.affection || 55;
                await this.db.personality.put({
                    trait: "affection",
                    character: "kimi",
                    value: newValue,
                    updated: new Date().toISOString()
                });
                console.log(`🔧 Migration: Updated Kimi affection from 65% to ${newValue}% for better progression`);
            }

            // MIGRATION: Fix Bella affection progression issue - update default affection from 70 to 60
            const bellaAffectionRecord = await this.db.personality.get(["bella", "affection"]);
            if (bellaAffectionRecord && bellaAffectionRecord.value === 70) {
                // Only update if it's exactly 70 (the old default) and user hasn't modified it significantly
                const newValue = window.KIMI_CHARACTERS?.bella?.traits?.affection || 60;
                await this.db.personality.put({
                    trait: "affection",
                    character: "bella",
                    value: newValue,
                    updated: new Date().toISOString()
                });
                console.log(`🔧 Migration: Updated Bella affection from 70% to ${newValue}% for better progression`);
            }

            // MIGRATION: Remove deprecated animations preference if exists
            try {
                const animPref = await this.db.preferences.get("animationsEnabled");
                if (animPref) {
                    await this.db.preferences.delete("animationsEnabled");
                    console.log("🔧 Migration: Removed deprecated preference 'animationsEnabled'");
                }
            } catch (mErr) {
                // Non-blocking: ignore migration error
            }

            // MIGRATION: Normalize legacy selectedLanguage values to primary subtag (e.g., 'en-US'|'en_US'|'us:en' -> 'en')
            try {
                const langRecord = await this.db.preferences.get("selectedLanguage");
                if (langRecord && typeof langRecord.value === "string") {
                    let raw = String(langRecord.value).toLowerCase();
                    // handle 'us:en' -> take part after ':'
                    if (raw.includes(":")) {
                        const parts = raw.split(":");
                        raw = parts[parts.length - 1];
                    }
                    raw = raw.replace("_", "-");
                    const primary = raw.includes("-") ? raw.split("-")[0] : raw;
                    if (primary && primary !== langRecord.value) {
                        await this.db.preferences.put({
                            key: "selectedLanguage",
                            value: primary,
                            updated: new Date().toISOString()
                        });
                        console.log(`🔧 Migration: Normalized selectedLanguage '${langRecord.value}' -> '${primary}'`);
                    }
                }
            } catch (normErr) {
                // Non-blocking
            }

            // FORCED MIGRATION: Normalize any preference keys containing the word 'language' to primary subtag
            // WARNING: This is destructive by design and will overwrite values without backup as requested.
            try {
                const allPrefs = await this.db.preferences.toArray();
                const langKeyRegex = /\blanguage\b/i;
                let modified = 0;
                for (const p of allPrefs) {
                    if (!p || typeof p.key !== "string" || typeof p.value !== "string") continue;
                    if (!langKeyRegex.test(p.key)) continue;
                    let raw = String(p.value).toLowerCase();
                    if (raw.includes(":")) raw = raw.split(":").pop();
                    raw = raw.replace("_", "-");
                    const primary = raw.includes("-") ? raw.split("-")[0] : raw;
                    if (primary && primary !== p.value) {
                        await this.db.preferences.put({ key: p.key, value: primary, updated: new Date().toISOString() });
                        modified++;
                    }
                }
                if (modified) {
                    console.log(
                        `🔧 Forced Migration: Normalized ${modified} language-related preference(s) to primary subtag (no backup)`
                    );
                }
            } catch (fmErr) {
                console.warn("Forced migration failed:", fmErr);
            }
        } catch {}
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
        if (key === "providerApiKey") {
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

        // Centralized numeric validation using KIMI_CONFIG ranges (only if key matches known numeric preference)
        const numericMap = {
            voiceRate: "VOICE_RATE",
            voicePitch: "VOICE_PITCH",
            voiceVolume: "VOICE_VOLUME",
            interfaceOpacity: "INTERFACE_OPACITY",
            llmTemperature: "LLM_TEMPERATURE",
            llmMaxTokens: "LLM_MAX_TOKENS",
            llmTopP: "LLM_TOP_P",
            llmFrequencyPenalty: "LLM_FREQUENCY_PENALTY",
            llmPresencePenalty: "LLM_PRESENCE_PENALTY"
        };
        if (numericMap[key] && window.KIMI_CONFIG && typeof window.KIMI_CONFIG.validate === "function") {
            const validation = window.KIMI_CONFIG.validate(value, numericMap[key]);
            if (validation.valid) {
                value = validation.value;
            }
        }

        // Update cache for regular preferences
        if (window.KimiCacheManager && typeof window.KimiCacheManager.set === "function") {
            window.KimiCacheManager.set(`pref_${key}`, value, 60000);
        }

        const result = await this.db.preferences.put({
            key: key,
            value: value,
            updated: new Date().toISOString()
        });
        if (window.dispatchEvent) {
            try {
                window.dispatchEvent(new CustomEvent("preferenceUpdated", { detail: { key, value } }));
            } catch {}
        }
        return result;
    }

    async getPreference(key, defaultValue = null) {
        // Try cache first (use a singleton cache instance)
        const cacheKey = `pref_${key}`;
        const cache =
            window.KimiCacheManager && typeof window.KimiCacheManager.get === "function" ? window.KimiCacheManager : null;
        if (cache && typeof cache.get === "function") {
            const cached = cache.get(cacheKey);
            if (cached !== null) {
                return cached;
            }
        }

        try {
            const record = await this.db.preferences.get(key);
            if (!record) {
                const cache =
                    window.KimiCacheManager && typeof window.KimiCacheManager.set === "function" ? window.KimiCacheManager : null;
                if (cache && typeof cache.set === "function") {
                    cache.set(cacheKey, defaultValue, 60000); // Cache for 1 minute
                }
                return defaultValue;
            }

            // Backward compatibility: decrypt legacy encrypted values
            let value = record.value;
            if (record.encrypted && window.KimiSecurityUtils) {
                try {
                    value = record.value; // decrypt removed – stored as plain text
                    // One-time migration: store back as plain text without encrypted flag
                    try {
                        await this.db.preferences.put({ key: key, value, updated: new Date().toISOString() });
                    } catch (mErr) {}
                } catch (e) {
                    // If decryption fails, fallback to raw value
                    console.warn("Failed to decrypt legacy API key; returning raw value", e);
                }
            }

            // Normalize specific preferences for backward-compatibility
            if (key === "selectedLanguage" && typeof value === "string") {
                try {
                    let raw = String(value).toLowerCase();
                    if (raw.includes(":")) raw = raw.split(":").pop();
                    raw = raw.replace("_", "-");
                    const primary = raw.includes("-") ? raw.split("-")[0] : raw;
                    if (primary && primary !== value) {
                        // Persist normalized primary subtag to DB for future reads
                        try {
                            await this.db.preferences.put({ key: key, value: primary, updated: new Date().toISOString() });
                            value = primary;
                        } catch (mErr) {
                            // ignore persistence error, but return normalized value
                            value = primary;
                        }
                    }
                } catch (e) {
                    // ignore normalization errors
                }
            }

            // Cache the result
            const cache =
                window.KimiCacheManager && typeof window.KimiCacheManager.set === "function" ? window.KimiCacheManager : null;
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
                if (window.getTraitDefaults) {
                    defaultValue = window.getTraitDefaults()[trait] || 50;
                } else {
                    defaultValue =
                        {
                            affection: 55,
                            playfulness: 55,
                            intelligence: 70,
                            empathy: 75,
                            humor: 60,
                            romance: 50
                        }[trait] || 50;
                }
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
                // Correction : valider les valeurs du cache
                const safeTraits = {};
                for (const [trait, value] of Object.entries(cached)) {
                    let v = Number(value);
                    if (!isFinite(v) || isNaN(v)) v = 50;
                    v = Math.max(0, Math.min(100, v));
                    safeTraits[trait] = v;
                }
                return safeTraits;
            }
        }

        const all = await this.db.personality.where("character").equals(character).toArray();
        const traits = {};
        all.forEach(item => {
            let v = Number(item.value);
            if (!isFinite(v) || isNaN(v)) v = 50;
            v = Math.max(0, Math.min(100, v));
            traits[item.trait] = v;
        });

        // If no traits stored yet for this character, seed from character defaults (one-time)
        if (Object.keys(traits).length === 0 && window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[character]) {
            const seed = window.KIMI_CHARACTERS[character].traits || {};
            const safeSeed = {};
            for (const [k, v] of Object.entries(seed)) {
                const num = typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
                safeSeed[k] = num;
                try {
                    await this.setPersonalityTrait(k, num, character);
                } catch {}
            }
            return safeSeed;
        }

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
        // Backwards-compatible: accept either an array [{key,value},...] or an object map { key: value }
        let prefsInput = prefsArray;
        if (!Array.isArray(prefsInput) && prefsInput && typeof prefsInput === "object") {
            // convert map to array
            prefsInput = Object.keys(prefsInput).map(k => ({ key: k, value: prefsInput[k] }));
            console.warn("setPreferencesBatch: converted prefs map to array for backward compatibility");
        }
        if (!Array.isArray(prefsInput)) {
            console.warn("setPreferencesBatch: expected array or object, got", typeof prefsArray);
            return;
        }

        const numericMap = {
            voiceRate: "VOICE_RATE",
            voicePitch: "VOICE_PITCH",
            voiceVolume: "VOICE_VOLUME",
            interfaceOpacity: "INTERFACE_OPACITY",
            llmTemperature: "LLM_TEMPERATURE",
            llmMaxTokens: "LLM_MAX_TOKENS",
            llmTopP: "LLM_TOP_P",
            llmFrequencyPenalty: "LLM_FREQUENCY_PENALTY",
            llmPresencePenalty: "LLM_PRESENCE_PENALTY"
        };
        const batch = prefsInput.map(({ key, value }) => {
            if (numericMap[key] && window.KIMI_CONFIG && typeof window.KIMI_CONFIG.validate === "function") {
                const validation = window.KIMI_CONFIG.validate(value, numericMap[key]);
                if (validation.valid) value = validation.value;
            }
            return { key, value, updated: new Date().toISOString() };
        });
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

        // Validation stricte : empêcher NaN ou valeurs non numériques
        const getDefault = trait => {
            if (window.KimiEmotionSystem) {
                return new window.KimiEmotionSystem(this).TRAIT_DEFAULTS[trait] || 50;
            }
            const fallback = { affection: 55, playfulness: 55, intelligence: 70, empathy: 75, humor: 60, romance: 50 };
            return fallback[trait] || 50;
        };
        const batch = Object.entries(traitsObj).map(([trait, value]) => {
            let v = Number(value);
            if (!isFinite(v) || isNaN(v)) v = getDefault(trait);
            v = Math.max(0, Math.min(100, v));
            return {
                trait,
                character,
                value: v,
                updated: new Date().toISOString()
            };
        });
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
                    val = item.value; // decrypt removed – stored as plain text
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

export default KimiDatabase;
// Export for usage
window.KimiDatabase = KimiDatabase;
