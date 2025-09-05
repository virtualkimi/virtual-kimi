// ===== KIMI UNIFIED EMOTION SYSTEM =====
// Centralizes all emotion analysis, personality updates, and validation

class KimiEmotionSystem {
    constructor(database = null) {
        this.db = database;
        this.negativeStreaks = {};

        // Debouncing system for personality updates
        this._personalityUpdateQueue = {};
        this._personalityUpdateTimer = null;
        this._personalityUpdateDelay = 300; // ms

        // Unified emotion mappings
        this.EMOTIONS = {
            // Base emotions
            POSITIVE: "positive",
            NEGATIVE: "negative",
            NEUTRAL: "neutral",

            // Specific emotions
            ROMANTIC: "romantic",
            DANCING: "dancing",
            LISTENING: "listening",
            LAUGHING: "laughing",
            SURPRISE: "surprise",
            CONFIDENT: "confident",
            SHY: "shy",
            FLIRTATIOUS: "flirtatious",
            KISS: "kiss",
            GOODBYE: "goodbye"
        };

        // Unified video context mapping - CENTRALIZED SOURCE OF TRUTH
        this.emotionToVideoCategory = {
            // Base emotional states
            positive: "speakingPositive",
            negative: "speakingNegative",
            neutral: "neutral",

            // Special contexts (always take priority)
            dancing: "dancing",
            listening: "listening",

            // Specific emotions mapped to appropriate categories
            romantic: "speakingPositive",
            laughing: "speakingPositive",
            surprise: "speakingPositive",
            confident: "speakingPositive",
            flirtatious: "speakingPositive",
            kiss: "speakingPositive",

            // Neutral/subdued emotions
            shy: "neutral",
            goodbye: "neutral",

            // Explicit context mappings (for compatibility)
            speaking: "speakingPositive", // Generic speaking defaults to positive
            speakingPositive: "speakingPositive",
            speakingNegative: "speakingNegative"
        };

        // Emotion priority weights for conflict resolution
        this.emotionPriorities = {
            dancing: 10, // Maximum priority - immersive experience
            kiss: 9, // Very high - intimate moment
            romantic: 8, // High - emotional connection
            listening: 7, // High - active interaction
            flirtatious: 6, // Medium-high - playful interaction
            laughing: 6, // Medium-high - positive expression
            surprise: 5, // Medium - reaction
            confident: 5, // Medium - personality expression
            speaking: 4, // Medium-low - generic speaking context
            positive: 4, // Medium-low - general positive
            negative: 4, // Medium-low - general negative
            neutral: 3, // Low - default state
            shy: 3, // Low - subdued state
            goodbye: 2, // Very low - transitional
            speakingPositive: 4, // Medium-low - for consistency
            speakingNegative: 4 // Medium-low - for consistency
        };

        // Context/emotion validation system for system integrity
        this.validContexts = ["dancing", "listening", "speaking", "speakingPositive", "speakingNegative", "neutral"];
        this.validEmotions = Object.values(this.EMOTIONS);

        // Unified trait defaults - Balanced for progressive experience
        this.TRAIT_DEFAULTS = {
            affection: 55, // Baseline neutral affection
            playfulness: 55, // Moderately playful baseline
            intelligence: 70, // Competent baseline intellect
            empathy: 75, // Warm & caring baseline
            humor: 60, // Mild sense of humor baseline
            romance: 50 // Neutral romance baseline (earned over time)
        };

        // Central emotion -> trait base deltas (pre global multipliers & gainCfg scaling)
        // Positive numbers increase trait, negative decrease.
        // Keep values small; final effect passes through adjustUp/adjustDown and global multipliers.
        this.EMOTION_TRAIT_EFFECTS = {
            positive: { affection: 0.45, empathy: 0.2, playfulness: 0.25, humor: 0.25 },
            negative: { affection: -0.7, empathy: 0.3 },
            romantic: { romance: 0.7, affection: 0.55, empathy: 0.15 },
            flirtatious: { romance: 0.55, playfulness: 0.45, affection: 0.25 },
            laughing: { humor: 0.85, playfulness: 0.5, affection: 0.25 },
            dancing: { playfulness: 1.1, affection: 0.45 },
            surprise: { intelligence: 0.12, empathy: 0.12 },
            shy: { romance: -0.3, affection: -0.12 },
            confident: { intelligence: 0.15, affection: 0.55 },
            listening: { empathy: 0.6, intelligence: 0.25 },
            kiss: { romance: 0.85, affection: 0.7 },
            goodbye: { affection: -0.15, empathy: 0.1 }
        };

        // Trait keyword scaling model for conversation analysis (per-message delta shaping)
        this.TRAIT_KEYWORD_MODEL = {
            affection: { posFactor: 0.5, negFactor: 0.65, streakPenaltyAfter: 3, maxStep: 2 },
            romance: { posFactor: 0.55, negFactor: 0.75, streakPenaltyAfter: 2, maxStep: 1.8 },
            empathy: { posFactor: 0.4, negFactor: 0.5, streakPenaltyAfter: 3, maxStep: 1.5 },
            playfulness: { posFactor: 0.45, negFactor: 0.4, streakPenaltyAfter: 4, maxStep: 1.4 },
            humor: { posFactor: 0.55, negFactor: 0.45, streakPenaltyAfter: 4, maxStep: 1.6 },
            intelligence: { posFactor: 0.35, negFactor: 0.55, streakPenaltyAfter: 2, maxStep: 1.2 }
        };
    }

    // ===== DEBOUNCED PERSONALITY UPDATE SYSTEM =====
    _debouncedPersonalityUpdate(updates, character) {
        // Merge with existing queued updates for this character
        if (!this._personalityUpdateQueue[character]) {
            this._personalityUpdateQueue[character] = {};
        }
        Object.assign(this._personalityUpdateQueue[character], updates);

        // Clear existing timer and set new one
        if (this._personalityUpdateTimer) {
            clearTimeout(this._personalityUpdateTimer);
        }

        this._personalityUpdateTimer = setTimeout(async () => {
            try {
                const allUpdates = { ...this._personalityUpdateQueue };
                this._personalityUpdateQueue = {};
                this._personalityUpdateTimer = null;

                // Process all queued updates
                for (const [char, traits] of Object.entries(allUpdates)) {
                    if (Object.keys(traits).length > 0) {
                        await this.db.setPersonalityBatch(traits, char);

                        // Emit unified personality update event
                        if (typeof window !== "undefined" && window.dispatchEvent) {
                            window.dispatchEvent(
                                new CustomEvent("personality:updated", {
                                    detail: { character: char, traits: traits }
                                })
                            );
                        }
                    }
                }
            } catch (error) {
                console.error("Error in debounced personality update:", error);
            }
        }, this._personalityUpdateDelay);
    }

    // ===== CENTRALIZED VALIDATION SYSTEM =====
    validateContext(context) {
        if (!context || typeof context !== "string") return "neutral";
        const normalized = context.toLowerCase().trim();

        // Check if it's a valid context
        if (this.validContexts.includes(normalized)) return normalized;

        // Check if it's a valid emotion that can be mapped to context
        if (this.emotionToVideoCategory[normalized]) return normalized;

        return "neutral"; // Safe fallback
    }

    validateEmotion(emotion) {
        if (!emotion || typeof emotion !== "string") return "neutral";
        const normalized = emotion.toLowerCase().trim();

        // Check if it's a valid emotion
        if (this.validEmotions.includes(normalized)) return normalized;

        // Check common aliases
        const aliases = {
            happy: "positive",
            sad: "negative",
            mad: "negative",
            angry: "negative",
            excited: "positive",
            calm: "neutral",
            romance: "romantic",
            laugh: "laughing",
            dance: "dancing",
            // Speaking contexts as emotion aliases
            speaking: "positive", // Generic speaking defaults to positive
            speakingpositive: "positive",
            speakingnegative: "negative"
        };

        if (aliases[normalized]) return aliases[normalized];

        return "neutral"; // Safe fallback
    }

    validateVideoCategory(category) {
        const validCategories = ["dancing", "listening", "speakingPositive", "speakingNegative", "neutral"];
        if (!category || typeof category !== "string") return "neutral";

        const normalized = category.toLowerCase().trim();
        return validCategories.includes(normalized) ? normalized : "neutral";
    }

    // Enhanced emotion analysis with validation
    analyzeEmotionValidated(text, lang = "auto") {
        const rawEmotion = this.analyzeEmotion(text, lang);
        return this.validateEmotion(rawEmotion);
    }

    // ===== UTILITY METHODS FOR SYSTEM INTEGRATION =====
    // Centralized method to get video category for any emotion/context combination
    getVideoCategory(emotionOrContext, traits = null) {
        // Handle the case where we get both context and emotion (e.g., from determineCategory calls)
        // Priority: Specific contexts > Specific emotions > Generic fallbacks

        // Try context validation first for immediate context matches
        let validated = this.validateContext(emotionOrContext);
        if (validated !== "neutral" || emotionOrContext === "neutral") {
            // Valid context found or explicitly neutral
            const category = this.emotionToVideoCategory[validated] || "neutral";
            return this.validateVideoCategory(category);
        }

        // If no valid context, try as emotion
        validated = this.validateEmotion(emotionOrContext);
        const category = this.emotionToVideoCategory[validated] || "neutral";
        return this.validateVideoCategory(category);
    } // Get priority weight for any emotion/context
    getPriorityWeight(emotionOrContext) {
        // Try context validation first, then emotion validation
        let validated = this.validateContext(emotionOrContext);
        if (validated === "neutral" && emotionOrContext !== "neutral") {
            // If context validation gave neutral but input wasn't neutral, try as emotion
            validated = this.validateEmotion(emotionOrContext);
        }

        return this.emotionPriorities[validated] || 3; // Default medium-low priority
    }

    // Check if an emotion/context should override current state
    shouldOverride(newEmotion, currentEmotion, currentContext = null) {
        const newPriority = this.getPriorityWeight(newEmotion);
        const currentPriority = Math.max(this.getPriorityWeight(currentEmotion), this.getPriorityWeight(currentContext));

        return newPriority > currentPriority;
    }

    // Utility to normalize and validate a complete emotion/context request
    normalizeEmotionRequest(context, emotion, traits = null) {
        return {
            context: this.validateContext(context),
            emotion: this.validateEmotion(emotion),
            category: this.getVideoCategory(emotion || context, traits),
            priority: this.getPriorityWeight(emotion || context)
        };
    }

    // ===== UNIFIED EMOTION ANALYSIS =====
    analyzeEmotion(text, lang = "auto") {
        if (!text || typeof text !== "string") return this.EMOTIONS.NEUTRAL;
        const lowerText = this.normalizeText(text);

        // Auto-detect language
        let detectedLang = this._detectLanguage(text, lang);

        // Get language-specific keywords
        const positiveWords = window.KIMI_CONTEXT_POSITIVE?.[detectedLang] ||
            window.KIMI_CONTEXT_POSITIVE?.en || ["happy", "good", "great", "love"];
        const negativeWords = window.KIMI_CONTEXT_NEGATIVE?.[detectedLang] ||
            window.KIMI_CONTEXT_NEGATIVE?.en || ["sad", "bad", "angry", "hate"];

        const emotionKeywords = window.KIMI_CONTEXT_KEYWORDS?.[detectedLang] || window.KIMI_CONTEXT_KEYWORDS?.en || {};

        // Priority order for emotion detection - reordered for better logic
        const emotionChecks = [
            // High-impact emotions first
            { emotion: this.EMOTIONS.KISS, keywords: emotionKeywords.kiss || ["kiss", "embrace"] },
            { emotion: this.EMOTIONS.DANCING, keywords: emotionKeywords.dancing || ["dance", "dancing"] },
            { emotion: this.EMOTIONS.ROMANTIC, keywords: emotionKeywords.romantic || ["love", "romantic"] },
            { emotion: this.EMOTIONS.FLIRTATIOUS, keywords: emotionKeywords.flirtatious || ["flirt", "tease"] },
            { emotion: this.EMOTIONS.LAUGHING, keywords: emotionKeywords.laughing || ["laugh", "funny"] },
            { emotion: this.EMOTIONS.SURPRISE, keywords: emotionKeywords.surprise || ["wow", "surprise"] },
            { emotion: this.EMOTIONS.CONFIDENT, keywords: emotionKeywords.confident || ["confident", "strong"] },
            { emotion: this.EMOTIONS.SHY, keywords: emotionKeywords.shy || ["shy", "embarrassed"] },
            { emotion: this.EMOTIONS.GOODBYE, keywords: emotionKeywords.goodbye || ["goodbye", "bye"] },
            // Listening intent (lower priority to not mask other emotions)
            {
                emotion: this.EMOTIONS.LISTENING,
                keywords: emotionKeywords.listening || [
                    "listen carefully",
                    "I'm listening",
                    "listening to you",
                    "hear me out",
                    "pay attention"
                ]
            }
        ];

        // Check for specific emotions first, applying sensitivity weights per language
        const sensitivity = (window.KIMI_EMOTION_SENSITIVITY &&
            (window.KIMI_EMOTION_SENSITIVITY[detectedLang] || window.KIMI_EMOTION_SENSITIVITY.default)) || {
            listening: 1,
            dancing: 1,
            romantic: 1,
            laughing: 1,
            surprise: 1,
            confident: 1,
            shy: 1,
            flirtatious: 1,
            kiss: 1,
            goodbye: 1,
            positive: 1,
            negative: 1
        };

        // Normalize keyword lists to handle accents/contractions
        const normalizeList = arr => (Array.isArray(arr) ? arr.map(x => this.normalizeText(String(x))).filter(Boolean) : []);
        const normalizedPositiveWords = normalizeList(positiveWords);
        const normalizedNegativeWords = normalizeList(negativeWords);
        const normalizedChecks = emotionChecks.map(ch => ({
            emotion: ch.emotion,
            keywords: normalizeList(ch.keywords)
        }));

        let bestEmotion = null;
        let bestScore = 0;
        for (const check of normalizedChecks) {
            const hits = check.keywords.reduce((acc, word) => acc + (this.countTokenMatches(lowerText, String(word)) ? 1 : 0), 0);
            if (hits > 0) {
                const key = check.emotion;
                const weight = sensitivity[key] != null ? sensitivity[key] : 1;
                const score = hits * weight;
                if (score > bestScore) {
                    bestScore = score;
                    bestEmotion = check.emotion;
                }
            }
        }
        if (bestEmotion) return bestEmotion;

        // Fall back to positive/negative analysis (use normalized lists)
        const hasPositive = normalizedPositiveWords.some(word => this.countTokenMatches(lowerText, String(word)) > 0);
        const hasNegative = normalizedNegativeWords.some(word => this.countTokenMatches(lowerText, String(word)) > 0);

        // If some positive keywords are present but negated, treat as negative
        const negatedPositive = normalizedPositiveWords.some(word => this.isTokenNegated(lowerText, String(word)));

        if (hasPositive && !hasNegative) {
            if (negatedPositive) {
                return this.EMOTIONS.NEGATIVE;
            }
            // Apply sensitivity for base polarity
            if ((sensitivity.positive || 1) >= (sensitivity.negative || 1)) return this.EMOTIONS.POSITIVE;
            // If negative is favored, still fall back to positive since no negative hit
            return this.EMOTIONS.POSITIVE;
        }
        if (hasNegative && !hasPositive) {
            if ((sensitivity.negative || 1) >= (sensitivity.positive || 1)) return this.EMOTIONS.NEGATIVE;
            return this.EMOTIONS.NEGATIVE;
        }
        return this.EMOTIONS.NEUTRAL;
    }

    // ===== UNIFIED PERSONALITY SYSTEM =====
    async updatePersonalityFromEmotion(emotion, text, character = null) {
        if (!this.db) {
            console.warn("Database not available for personality updates");
            return;
        }

        const selectedCharacter = character || (await this.db.getSelectedCharacter());
        const traits = await this.db.getAllPersonalityTraits(selectedCharacter);

        const safe = (v, def) => (typeof v === "number" && isFinite(v) ? v : def);
        let affection = safe(traits?.affection, this.TRAIT_DEFAULTS.affection);
        let romance = safe(traits?.romance, this.TRAIT_DEFAULTS.romance);
        let empathy = safe(traits?.empathy, this.TRAIT_DEFAULTS.empathy);
        let playfulness = safe(traits?.playfulness, this.TRAIT_DEFAULTS.playfulness);
        let humor = safe(traits?.humor, this.TRAIT_DEFAULTS.humor);
        let intelligence = safe(traits?.intelligence, this.TRAIT_DEFAULTS.intelligence);

        // Unified adjustment functions - More balanced progression for better user experience
        const adjustUp = (val, amount) => {
            // Gradual slowdown only at very high levels to allow natural progression
            if (val >= 95) return val + amount * 0.2; // Slow near max to preserve challenge
            if (val >= 88) return val + amount * 0.5; // Moderate slowdown at very high levels
            if (val >= 80) return val + amount * 0.7; // Slight slowdown at high levels
            if (val >= 60) return val + amount * 0.9; // Nearly normal progression in mid-high range
            return val + amount; // Normal progression below 60%
        };

        const adjustDown = (val, amount) => {
            // Faster decline at higher values - easier to lose than to gain
            if (val >= 80) return val - amount * 1.2; // Faster loss at high levels
            if (val >= 60) return val - amount; // Normal loss at medium levels
            if (val >= 40) return val - amount * 0.8; // Slower loss at low-medium levels
            if (val <= 20) return val - amount * 0.4; // Very slow loss at low levels
            return val - amount * 0.6; // Moderate loss between 20-40
        };

        // Unified emotion-based adjustments - More balanced and realistic progression
        const gainCfg = window.KIMI_TRAIT_ADJUSTMENT || {
            globalGain: 1,
            globalLoss: 1,
            emotionGain: {},
            traitGain: {},
            traitLoss: {}
        };
        const emoGain = emotion && gainCfg.emotionGain ? gainCfg.emotionGain[emotion] || 1 : 1;
        const GGAIN = (gainCfg.globalGain || 1) * emoGain;
        const GLOSS = gainCfg.globalLoss || 1;

        // Helpers to apply trait-specific scaling
        const scaleGain = (traitName, baseDelta) => {
            const t = gainCfg.traitGain && (gainCfg.traitGain[traitName] || 1);
            return baseDelta * GGAIN * t;
        };
        const scaleLoss = (traitName, baseDelta) => {
            const t = gainCfg.traitLoss && (gainCfg.traitLoss[traitName] || 1);
            return baseDelta * GLOSS * t;
        };

        // Apply emotion deltas from centralized map (if defined)
        const map = this.EMOTION_TRAIT_EFFECTS?.[emotion];
        if (map) {
            for (const [traitName, baseDelta] of Object.entries(map)) {
                const delta = baseDelta; // base delta -> will be scaled below
                if (delta === 0) continue;
                switch (traitName) {
                    case "affection":
                        affection =
                            delta > 0
                                ? Math.min(100, adjustUp(affection, scaleGain("affection", delta)))
                                : Math.max(0, adjustDown(affection, scaleLoss("affection", Math.abs(delta))));
                        break;
                    case "romance":
                        romance =
                            delta > 0
                                ? Math.min(100, adjustUp(romance, scaleGain("romance", delta)))
                                : Math.max(0, adjustDown(romance, scaleLoss("romance", Math.abs(delta))));
                        break;
                    case "empathy":
                        empathy =
                            delta > 0
                                ? Math.min(100, adjustUp(empathy, scaleGain("empathy", delta)))
                                : Math.max(0, adjustDown(empathy, scaleLoss("empathy", Math.abs(delta))));
                        break;
                    case "playfulness":
                        playfulness =
                            delta > 0
                                ? Math.min(100, adjustUp(playfulness, scaleGain("playfulness", delta)))
                                : Math.max(0, adjustDown(playfulness, scaleLoss("playfulness", Math.abs(delta))));
                        break;
                    case "humor":
                        humor =
                            delta > 0
                                ? Math.min(100, adjustUp(humor, scaleGain("humor", delta)))
                                : Math.max(0, adjustDown(humor, scaleLoss("humor", Math.abs(delta))));
                        break;
                    case "intelligence":
                        intelligence =
                            delta > 0
                                ? Math.min(100, adjustUp(intelligence, scaleGain("intelligence", delta)))
                                : Math.max(0, adjustDown(intelligence, scaleLoss("intelligence", Math.abs(delta))));
                        break;
                }
            }
        }

        // Cross-trait interactions - traits influence each other for more realistic personality development
        // High empathy should boost affection over time
        if (empathy >= 75 && affection < empathy - 5) {
            affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.1)));
        }

        // High intelligence should slightly boost empathy (understanding others)
        if (intelligence >= 80 && empathy < intelligence - 10) {
            empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.05)));
        }

        // Humor and playfulness should reinforce each other
        if (humor >= 70 && playfulness < humor - 10) {
            playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.05)));
        }
        if (playfulness >= 70 && humor < playfulness - 10) {
            humor = Math.min(100, adjustUp(humor, scaleGain("humor", 0.05)));
        }

        // Content-based adjustments (unified)
        await this._analyzeTextContent(
            text,
            traits => {
                if (typeof traits.romance !== "undefined") romance = traits.romance;
                if (typeof traits.affection !== "undefined") affection = traits.affection;
                if (typeof traits.humor !== "undefined") humor = traits.humor;
                if (typeof traits.playfulness !== "undefined") playfulness = traits.playfulness;
            },
            adjustUp
        );

        // Cross-trait modifiers (applied after primary emotion & content changes)
        ({ affection, romance, empathy, playfulness, humor, intelligence } = this._applyCrossTraitModifiers({
            affection,
            romance,
            empathy,
            playfulness,
            humor,
            intelligence,
            adjustUp,
            adjustDown,
            scaleGain,
            scaleLoss
        }));

        // Preserve fractional progress to allow gradual visible changes
        const to2 = v => Number(Number(v).toFixed(2));
        const clamp = v => Math.max(0, Math.min(100, v));
        const updatedTraits = {
            affection: to2(clamp(affection)),
            romance: to2(clamp(romance)),
            empathy: to2(clamp(empathy)),
            playfulness: to2(clamp(playfulness)),
            humor: to2(clamp(humor)),
            intelligence: to2(clamp(intelligence))
        };

        // Prepare persistence with smoothing / threshold to avoid tiny writes
        const toPersist = {};
        for (const [trait, candValue] of Object.entries(updatedTraits)) {
            const current = typeof traits?.[trait] === "number" ? traits[trait] : this.TRAIT_DEFAULTS[trait];
            const prep = this._preparePersistTrait(trait, current, candValue, selectedCharacter);
            if (prep.shouldPersist) toPersist[trait] = prep.value;
        }

        // Use debounced update instead of immediate DB write
        if (Object.keys(toPersist).length > 0) {
            this._debouncedPersonalityUpdate(toPersist, selectedCharacter);
        }

        return updatedTraits;
    }

    // Apply cross-trait synergy & balancing rules.
    _applyCrossTraitModifiers(ctx) {
        let { affection, romance, empathy, playfulness, humor, intelligence, adjustUp, adjustDown, scaleGain } = ctx;
        // High empathy soft-boost affection if still lagging
        if (empathy >= 80 && affection < empathy - 8) {
            affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.08)));
        }
        // High romance amplifies affection gains subtlely
        if (romance >= 80 && affection < romance - 5) {
            affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.06)));
        }
        // High affection but lower romance triggers slight romance catch-up
        if (affection >= 90 && romance < 70) {
            romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.05)));
        }
        // Intelligence supports empathy & humor small growth
        if (intelligence >= 85) {
            if (empathy < intelligence - 12) {
                empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.04)));
            }
            if (humor < 75) {
                humor = Math.min(100, adjustUp(humor, scaleGain("humor", 0.04)));
            }
        }
        // Humor/playfulness mutual reinforcement (retain existing logic but guarded)
        if (humor >= 70 && playfulness < humor - 10) {
            playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.05)));
        }
        if (playfulness >= 70 && humor < playfulness - 10) {
            humor = Math.min(100, adjustUp(humor, scaleGain("humor", 0.05)));
        }
        return { affection, romance, empathy, playfulness, humor, intelligence };
    }

    // ===== UNIFIED LLM PERSONALITY ANALYSIS =====
    async updatePersonalityFromConversation(userMessage, kimiResponse, character = null) {
        if (!this.db) return;
        const lowerUser = this.normalizeText(userMessage || "");
        const lowerKimi = this.normalizeText(kimiResponse || "");
        const traits = (await this.db.getAllPersonalityTraits(character)) || {};
        const selectedLanguage = await this.db.getPreference("selectedLanguage", "en");

        // Use unified keyword system
        const getPersonalityWords = (trait, type) => {
            if (window.KIMI_PERSONALITY_KEYWORDS && window.KIMI_PERSONALITY_KEYWORDS[selectedLanguage]) {
                return window.KIMI_PERSONALITY_KEYWORDS[selectedLanguage][trait]?.[type] || [];
            }
            return this._getFallbackKeywords(trait, type);
        };

        const pendingUpdates = {};
        for (const trait of ["humor", "intelligence", "romance", "affection", "playfulness", "empathy"]) {
            const posWords = getPersonalityWords(trait, "positive");
            const negWords = getPersonalityWords(trait, "negative");
            let currentVal =
                typeof traits[trait] === "number" && isFinite(traits[trait]) ? traits[trait] : this.TRAIT_DEFAULTS[trait];
            const model = this.TRAIT_KEYWORD_MODEL[trait];
            const posFactor = model.posFactor;
            const negFactor = model.negFactor;
            const maxStep = model.maxStep;
            const streakLimit = model.streakPenaltyAfter;

            let posScore = 0;
            let negScore = 0;
            for (const w of posWords) {
                posScore += this.countTokenMatches(lowerUser, String(w)) * 1.0;
                posScore += this.countTokenMatches(lowerKimi, String(w)) * 0.5;
            }
            for (const w of negWords) {
                negScore += this.countTokenMatches(lowerUser, String(w)) * 1.0;
                negScore += this.countTokenMatches(lowerKimi, String(w)) * 0.5;
            }

            let rawDelta = posScore * posFactor - negScore * negFactor;

            // Track negative streaks per trait (only when net negative & no positives)
            if (!this.negativeStreaks[trait]) this.negativeStreaks[trait] = 0;
            if (negScore > 0 && posScore === 0) {
                this.negativeStreaks[trait]++;
            } else if (posScore > 0) {
                this.negativeStreaks[trait] = 0;
            }

            if (rawDelta < 0 && this.negativeStreaks[trait] >= streakLimit) {
                rawDelta *= 1.15; // escalate sustained negativity
            }

            // Clamp magnitude
            if (rawDelta > maxStep) rawDelta = maxStep;
            if (rawDelta < -maxStep) rawDelta = -maxStep;

            if (rawDelta !== 0) {
                let newVal = currentVal + rawDelta;
                if (rawDelta > 0) {
                    newVal = Math.min(100, newVal);
                } else {
                    newVal = Math.max(0, newVal);
                }
                pendingUpdates[trait] = newVal;
            }
        }

        // Flush pending updates in a single batch write to avoid overwrites
        if (Object.keys(pendingUpdates).length > 0) {
            // Apply smoothing/threshold per trait (read current values)
            const toPersist = {};
            for (const [trait, candValue] of Object.entries(pendingUpdates)) {
                const current = typeof traits?.[trait] === "number" ? traits[trait] : this.TRAIT_DEFAULTS[trait];
                const prep = this._preparePersistTrait(trait, current, candValue, character);
                if (prep.shouldPersist) toPersist[trait] = prep.value;
            }
            if (Object.keys(toPersist).length > 0) {
                await this.db.setPersonalityBatch(toPersist, character);
            }
        }
    }

    validatePersonalityTrait(trait, value) {
        if (typeof value !== "number" || value < 0 || value > 100) {
            console.warn(`Invalid trait value for ${trait}: ${value}, using default`);
            return this.TRAIT_DEFAULTS[trait] || 50;
        }
        return value;
    }

    // ===== NORMALIZATION & MATCH HELPERS =====
    // Normalize text for robust matching (NFD -> remove diacritics, normalize quotes, lower, collapse spaces)
    normalizeText(s) {
        if (!s || typeof s !== "string") return "";
        // Convert various apostrophes to ASCII, normalize NFD and remove diacritics
        let out = s.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
        out = out.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
        // Expand a few common French contractions to improve detection (non-exhaustive)
        out = out.replace(/\bj'/gi, "je ");
        // expand negation contraction n' -> ne
        out = out.replace(/\bn'/gi, "ne ");
        out = out.replace(/\bt'/gi, "te ");
        out = out.replace(/\bc'/gi, "ce ");
        out = out.replace(/\bd'/gi, "de ");
        out = out.replace(/\bl'/gi, "le ");
        // Unicode normalize and strip combining marks
        out = out.normalize("NFD").replace(/\p{Diacritic}/gu, "");
        // Lowercase and collapse whitespace
        out = out.toLowerCase().replace(/\s+/g, " ").trim();
        return out;
    }

    // Count non-overlapping occurrences of needle in haystack
    countOccurrences(haystack, needle) {
        if (!haystack || !needle) return 0;
        let count = 0;
        let pos = 0;
        while (true) {
            const idx = haystack.indexOf(needle, pos);
            if (idx === -1) break;
            count++;
            pos = idx + needle.length;
        }
        return count;
    }

    // Tokenize normalized text into words (strip punctuation)
    tokenizeText(s) {
        if (!s || typeof s !== "string") return [];
        // split on whitespace, remove surrounding non-alphanum, keep ascii letters/numbers
        return s
            .split(/\s+/)
            .map(t => t.replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, ""))
            .filter(t => t.length > 0);
    }

    // Check for simple negators in a window before a token index
    hasNegationWindow(tokens, index, window = 3) {
        if (!Array.isArray(tokens) || tokens.length === 0) return false;
        // Respect runtime-configured negators if available
        const globalNegators = (window.KIMI_NEGATORS && window.KIMI_NEGATORS.common) || [];
        // Try selected language list if set
        const lang = (window.KIMI_SELECTED_LANG && String(window.KIMI_SELECTED_LANG)) || null;
        const langNegators = (lang && window.KIMI_NEGATORS && window.KIMI_NEGATORS[lang]) || [];
        const merged = new Set([
            ...(Array.isArray(langNegators) ? langNegators : []),
            ...(Array.isArray(globalNegators) ? globalNegators : [])
        ]);
        // Always include a minimal english/french set as fallback
        ["no", "not", "never", "none", "nobody", "nothing", "ne", "n", "pas", "jamais", "plus", "aucun", "rien", "non"].forEach(
            x => merged.add(x)
        );
        const win = Number(window.KIMI_NEGATION_WINDOW) || window;
        const start = Math.max(0, index - win);
        for (let i = start; i < index; i++) {
            if (merged.has(tokens[i])) return true;
        }
        return false;
    }

    // Count token-based matches (exact word or phrase) with negation handling
    countTokenMatches(haystack, needle) {
        if (!haystack || !needle) return 0;
        const normNeedle = this.normalizeText(String(needle));
        if (normNeedle.length === 0) return 0;
        const needleTokens = this.tokenizeText(normNeedle);
        if (needleTokens.length === 0) return 0;
        const normHay = this.normalizeText(String(haystack));
        const tokens = this.tokenizeText(normHay);
        if (tokens.length === 0) return 0;
        let count = 0;
        for (let i = 0; i <= tokens.length - needleTokens.length; i++) {
            let match = true;
            for (let j = 0; j < needleTokens.length; j++) {
                if (tokens[i + j] !== needleTokens[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                // skip if a negation is in window before the match
                if (!this.hasNegationWindow(tokens, i)) {
                    count++;
                }
                i += needleTokens.length - 1; // advance to avoid overlapping
            }
        }
        return count;
    }

    // Return true if any occurrence of needle in haystack is negated (within negation window)
    isTokenNegated(haystack, needle) {
        if (!haystack || !needle) return false;
        const normNeedle = this.normalizeText(String(needle));
        const needleTokens = this.tokenizeText(normNeedle);
        if (needleTokens.length === 0) return false;
        const normHay = this.normalizeText(String(haystack));
        const tokens = this.tokenizeText(normHay);
        for (let i = 0; i <= tokens.length - needleTokens.length; i++) {
            let match = true;
            for (let j = 0; j < needleTokens.length; j++) {
                if (tokens[i + j] !== needleTokens[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                if (this.hasNegationWindow(tokens, i)) return true;
                i += needleTokens.length - 1;
            }
        }
        return false;
    }

    // ===== SMOOTHING / PERSISTENCE HELPERS =====
    // Apply EMA smoothing between current and candidate value. alpha in (0..1).
    _applyEMA(current, candidate, alpha) {
        alpha = typeof alpha === "number" && isFinite(alpha) ? alpha : 0.3;
        return current * (1 - alpha) + candidate * alpha;
    }

    // Decide whether to persist based on absolute change threshold. Returns {shouldPersist, value}
    _preparePersistTrait(trait, currentValue, candidateValue, character = null) {
        // Configurable via globals
        const alpha = (window.KIMI_SMOOTHING_ALPHA && Number(window.KIMI_SMOOTHING_ALPHA)) || 0.3;
        const threshold = (window.KIMI_PERSIST_THRESHOLD && Number(window.KIMI_PERSIST_THRESHOLD)) || 0.25; // percent absolute

        const smoothed = this._applyEMA(currentValue, candidateValue, alpha);
        const absDelta = Math.abs(smoothed - currentValue);
        if (absDelta < threshold) {
            return { shouldPersist: false, value: currentValue };
        }
        return { shouldPersist: true, value: Number(Number(smoothed).toFixed(2)) };
    }

    // ===== UTILITY METHODS =====
    _detectLanguage(text, lang) {
        if (lang !== "auto") return lang;

        if (/[àâäéèêëîïôöùûüÿç]/i.test(text)) return "fr";
        else if (/[äöüß]/i.test(text)) return "de";
        else if (/[ñáéíóúü]/i.test(text)) return "es";
        else if (/[àèìòù]/i.test(text)) return "it";
        else if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/i.test(text)) return "ja";
        else if (/[\u4e00-\u9fff]/i.test(text)) return "zh";
        return "en";
    }

    async _analyzeTextContent(text, callback, adjustUp) {
        if (!this.db) return;

        const selectedLanguage = await this.db.getPreference("selectedLanguage", "en");
        const romanticWords = window.KIMI_CONTEXT_KEYWORDS?.[selectedLanguage]?.romantic ||
            window.KIMI_CONTEXT_KEYWORDS?.en?.romantic || ["love", "romantic", "kiss"];
        const humorWords = window.KIMI_CONTEXT_KEYWORDS?.[selectedLanguage]?.laughing ||
            window.KIMI_CONTEXT_KEYWORDS?.en?.laughing || ["joke", "funny", "lol"];

        const romanticPattern = new RegExp(`(${romanticWords.join("|")})`, "i");
        const humorPattern = new RegExp(`(${humorWords.join("|")})`, "i");

        const traits = {};
        if (text.match(romanticPattern)) {
            traits.romance = adjustUp(traits.romance || this.TRAIT_DEFAULTS.romance, 0.5);
            traits.affection = adjustUp(traits.affection || this.TRAIT_DEFAULTS.affection, 0.5);
        }
        if (text.match(humorPattern)) {
            traits.humor = adjustUp(traits.humor || this.TRAIT_DEFAULTS.humor, 2);
            traits.playfulness = adjustUp(traits.playfulness || this.TRAIT_DEFAULTS.playfulness, 1);
        }

        callback(traits);
    }

    _getFallbackKeywords(trait, type) {
        const fallbackKeywords = {
            humor: {
                positive: ["funny", "hilarious", "joke", "laugh", "amusing"],
                negative: ["boring", "sad", "serious", "cold", "dry"]
            },
            intelligence: {
                positive: ["intelligent", "smart", "brilliant", "logical", "clever"],
                negative: ["stupid", "dumb", "foolish", "slow", "naive"]
            },
            romance: {
                positive: ["cuddle", "love", "romantic", "kiss", "tenderness"],
                negative: ["cold", "distant", "indifferent", "rejection"]
            },
            affection: {
                positive: ["affection", "tenderness", "close", "warmth", "kind"],
                negative: ["mean", "cold", "indifferent", "distant", "rejection"]
            },
            playfulness: {
                positive: ["play", "game", "tease", "mischievous", "fun"],
                negative: ["serious", "boring", "strict", "rigid"]
            },
            empathy: {
                positive: ["listen", "understand", "empathy", "support", "help"],
                negative: ["indifferent", "cold", "selfish", "ignore"]
            }
        };

        return fallbackKeywords[trait]?.[type] || [];
    }

    // ===== PERSONALITY CALCULATION =====
    calculatePersonalityAverage(traits) {
        const keys = ["affection", "romance", "empathy", "playfulness", "humor", "intelligence"];
        let sum = 0;
        let count = 0;

        keys.forEach(key => {
            if (typeof traits[key] === "number") {
                sum += traits[key];
                count++;
            }
        });

        return count > 0 ? sum / count : 50;
    }

    getMoodCategoryFromPersonality(traits) {
        const avg = this.calculatePersonalityAverage(traits);

        if (avg >= 80) return "speakingPositive";
        if (avg >= 60) return "neutral";
        if (avg >= 40) return "neutral";
        if (avg >= 20) return "speakingNegative";
        return "speakingNegative";
    }
}

window.KimiEmotionSystem = KimiEmotionSystem;
// Expose centralized tuning maps for debugging / live adjustments
Object.defineProperty(window, "KIMI_EMOTION_TRAIT_EFFECTS", {
    get() {
        return window.kimiEmotionSystem ? window.kimiEmotionSystem.EMOTION_TRAIT_EFFECTS : null;
    }
});
Object.defineProperty(window, "KIMI_TRAIT_KEYWORD_MODEL", {
    get() {
        return window.kimiEmotionSystem ? window.kimiEmotionSystem.TRAIT_KEYWORD_MODEL : null;
    }
});

// Debug/tuning helpers
window.setEmotionDelta = function (emotion, trait, value) {
    if (!window.kimiEmotionSystem) return false;
    const map = window.kimiEmotionSystem.EMOTION_TRAIT_EFFECTS;
    if (!map[emotion]) map[emotion] = {};
    map[emotion][trait] = Number(value);
    return true;
};
window.resetEmotionDeltas = function () {
    if (!window.kimiEmotionSystem) return false;
    // No stored original snapshot; advise page reload for full reset.
    console.warn("For full reset reload the page (original deltas are not snapshotted).");
};
window.setTraitKeywordScaling = function (trait, cfg) {
    if (!window.kimiEmotionSystem) return false;
    const model = window.kimiEmotionSystem.TRAIT_KEYWORD_MODEL;
    if (!model[trait]) return false;
    Object.assign(model[trait], cfg);
    return true;
};

// Force recompute + UI refresh for personality average
window.refreshPersonalityAverageUI = async function (characterKey = null) {
    try {
        if (window.updateGlobalPersonalityUI) {
            await window.updateGlobalPersonalityUI(characterKey);
        } else if (window.getPersonalityAverage && window.kimiDB) {
            const charKey = characterKey || (await window.kimiDB.getSelectedCharacter());
            const traits = await window.kimiDB.getAllPersonalityTraits(charKey);
            const avg = window.getPersonalityAverage(traits);
            const bar = document.getElementById("favorability-bar");
            const text = document.getElementById("favorability-text");
            if (bar) bar.style.width = `${avg}%`;
            if (text) text.textContent = `${avg.toFixed(2)}%`;
        }
    } catch (err) {
        console.warn("refreshPersonalityAverageUI failed", err);
    }
};
export default KimiEmotionSystem;

// ===== BACKWARD COMPATIBILITY LAYER =====
// Ensure single instance of KimiEmotionSystem (Singleton pattern)
function getKimiEmotionSystemInstance() {
    if (!window.kimiEmotionSystem) {
        window.kimiEmotionSystem = new KimiEmotionSystem(window.kimiDB);
    }
    return window.kimiEmotionSystem;
}

// Replace the old kimiAnalyzeEmotion function
window.kimiAnalyzeEmotion = function (text, lang = "auto") {
    return getKimiEmotionSystemInstance().analyzeEmotion(text, lang);
};

// Replace the old updatePersonalityTraitsFromEmotion function
window.updatePersonalityTraitsFromEmotion = async function (emotion, text) {
    const updatedTraits = await getKimiEmotionSystemInstance().updatePersonalityFromEmotion(emotion, text);
    return updatedTraits;
};

// Replace getPersonalityAverage function
window.getPersonalityAverage = function (traits) {
    return getKimiEmotionSystemInstance().calculatePersonalityAverage(traits);
};

// Unified trait defaults accessor
window.getTraitDefaults = function () {
    return getKimiEmotionSystemInstance().TRAIT_DEFAULTS;
};
