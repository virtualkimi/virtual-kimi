// ===== KIMI UNIFIED EMOTION SYSTEM =====
// Centralizes all emotion analysis, personality updates, and validation

class KimiEmotionSystem {
    constructor(database = null) {
        this.db = database;
        this.negativeStreaks = {};

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

        // Unified video context mapping
        this.emotionToVideoCategory = {
            positive: "speakingPositive",
            negative: "speakingNegative",
            neutral: "neutral",
            dancing: "dancing",
            listening: "listening",
            romantic: "speakingPositive",
            laughing: "speakingPositive",
            surprise: "speakingPositive",
            confident: "speakingPositive",
            shy: "neutral",
            flirtatious: "speakingPositive",
            kiss: "speakingPositive",
            goodbye: "neutral"
        };

        // Unified trait defaults - More balanced for progressive experience
        this.TRAIT_DEFAULTS = {
            affection: 65, // Reduced from 80 - starts neutral, grows with interaction
            playfulness: 55, // Reduced from 70 - more reserved initially
            intelligence: 70, // Reduced from 85 - still competent but not overwhelming
            empathy: 75, // Reduced from 90 - caring but not overly so
            humor: 60, // Reduced from 75 - develops sense of humor over time
            romance: 50 // Significantly reduced from 95 - romance must be earned!
        };
    }

    // ===== UNIFIED EMOTION ANALYSIS =====
    analyzeEmotion(text, lang = "auto") {
        if (!text || typeof text !== "string") return this.EMOTIONS.NEUTRAL;
        const lowerText = text.toLowerCase();

        // Auto-detect language
        let detectedLang = this._detectLanguage(text, lang);

        // Get language-specific keywords
        const positiveWords = window.KIMI_CONTEXT_POSITIVE?.[detectedLang] ||
            window.KIMI_CONTEXT_POSITIVE?.en || ["happy", "good", "great", "love"];
        const negativeWords = window.KIMI_CONTEXT_NEGATIVE?.[detectedLang] ||
            window.KIMI_CONTEXT_NEGATIVE?.en || ["sad", "bad", "angry", "hate"];

        const emotionKeywords = window.KIMI_CONTEXT_KEYWORDS?.[detectedLang] || window.KIMI_CONTEXT_KEYWORDS?.en || {};

        // Priority order for emotion detection
        const emotionChecks = [
            // Listening intent (user asks to talk or indicates speaking/listening)
            {
                emotion: this.EMOTIONS.LISTENING,
                keywords: emotionKeywords.listening || [
                    "listen",
                    "listening",
                    "écoute",
                    "ecoute",
                    "écouter",
                    "parle",
                    "speak",
                    "talk",
                    "question",
                    "ask"
                ]
            },
            { emotion: this.EMOTIONS.DANCING, keywords: emotionKeywords.dancing || ["dance", "dancing"] },
            { emotion: this.EMOTIONS.ROMANTIC, keywords: emotionKeywords.romantic || ["love", "romantic"] },
            { emotion: this.EMOTIONS.LAUGHING, keywords: emotionKeywords.laughing || ["laugh", "funny"] },
            { emotion: this.EMOTIONS.SURPRISE, keywords: emotionKeywords.surprise || ["wow", "surprise"] },
            { emotion: this.EMOTIONS.CONFIDENT, keywords: emotionKeywords.confident || ["confident", "strong"] },
            { emotion: this.EMOTIONS.SHY, keywords: emotionKeywords.shy || ["shy", "embarrassed"] },
            { emotion: this.EMOTIONS.FLIRTATIOUS, keywords: emotionKeywords.flirtatious || ["flirt", "tease"] },
            { emotion: this.EMOTIONS.KISS, keywords: emotionKeywords.kiss || ["kiss", "embrace"] },
            { emotion: this.EMOTIONS.GOODBYE, keywords: emotionKeywords.goodbye || ["goodbye", "bye"] }
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

        let bestEmotion = null;
        let bestScore = 0;
        for (const check of emotionChecks) {
            const hits = check.keywords.reduce((acc, word) => acc + (lowerText.includes(word.toLowerCase()) ? 1 : 0), 0);
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

        // Fall back to positive/negative analysis
        const hasPositive = positiveWords.some(word => lowerText.includes(word.toLowerCase()));
        const hasNegative = negativeWords.some(word => lowerText.includes(word.toLowerCase()));

        if (hasPositive && !hasNegative) {
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

        let affection = traits.affection || this.TRAIT_DEFAULTS.affection;
        let romance = traits.romance || this.TRAIT_DEFAULTS.romance;
        let empathy = traits.empathy || this.TRAIT_DEFAULTS.empathy;
        let playfulness = traits.playfulness || this.TRAIT_DEFAULTS.playfulness;
        let humor = traits.humor || this.TRAIT_DEFAULTS.humor;
        let intelligence = traits.intelligence || this.TRAIT_DEFAULTS.intelligence;

        // Unified adjustment functions - More gradual progression for balanced experience
        const adjustUp = (val, amount) => {
            // Slower progression as values get higher - make romance and affection harder to max out
            if (val >= 95) return val + amount * 0.1; // Very slow near max
            if (val >= 85) return val + amount * 0.3; // Slow progression at high levels
            if (val >= 70) return val + amount * 0.6; // Moderate progression at medium levels
            if (val >= 50) return val + amount * 0.8; // Normal progression above average
            return val + amount; // Normal progression below average
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

        switch (emotion) {
            case this.EMOTIONS.POSITIVE:
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.4))); // Slightly more affection gain
                empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.2)));
                playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.2)));
                humor = Math.min(100, adjustUp(humor, scaleGain("humor", 0.2)));
                romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.1))); // Romance grows very slowly
                break;
            case this.EMOTIONS.NEGATIVE:
                affection = Math.max(0, adjustDown(affection, scaleLoss("affection", 0.6))); // Affection drops faster on negative
                empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.3))); // Empathy still grows (understanding pain)
                break;
            case this.EMOTIONS.ROMANTIC:
                romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.6))); // Reduced from 0.8 - romance should be earned
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.3))); // Reduced from 0.4
                break;
            case this.EMOTIONS.LAUGHING:
                humor = Math.min(100, adjustUp(humor, scaleGain("humor", 0.8))); // Humor grows with laughter
                playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.4))); // Increased playfulness connection
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.2))); // Small affection boost from shared laughter
                break;
            case this.EMOTIONS.DANCING:
                playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 1.2))); // Dancing = maximum playfulness boost
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.3))); // Affection from shared activity
                break;
            case this.EMOTIONS.SHY:
                affection = Math.max(0, adjustDown(affection, scaleLoss("affection", 0.1))); // Small affection loss
                romance = Math.max(0, adjustDown(romance, scaleLoss("romance", 0.2))); // Shyness reduces romance more
                break;
            case this.EMOTIONS.CONFIDENT:
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.3))); // Reduced from 0.4
                intelligence = Math.min(100, adjustUp(intelligence, scaleGain("intelligence", 0.1))); // Slight intelligence boost
                break;
            case this.EMOTIONS.FLIRTATIOUS:
                romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.5))); // Reduced from 0.6
                playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.3))); // Reduced from 0.4
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.2))); // Small affection boost
                break;
        }

        // Content-based adjustments (unified)
        await this._analyzeTextContent(
            text,
            traits => {
                romance = traits.romance;
                affection = traits.affection;
                humor = traits.humor;
                playfulness = traits.playfulness;
            },
            adjustUp
        );

        const updatedTraits = {
            affection: Math.round(affection),
            romance: Math.round(romance),
            empathy: Math.round(empathy),
            playfulness: Math.round(playfulness),
            humor: Math.round(humor),
            intelligence: Math.round(intelligence)
        };

        // Save to database
        await this.db.setPersonalityBatch(updatedTraits, selectedCharacter);

        return updatedTraits;
    }

    // ===== UNIFIED LLM PERSONALITY ANALYSIS =====
    async updatePersonalityFromConversation(userMessage, kimiResponse, character = null) {
        if (!this.db) return;

        const lowerUser = userMessage ? userMessage.toLowerCase() : "";
        const lowerKimi = (kimiResponse || "").toLowerCase();
        const traits = await this.db.getAllPersonalityTraits(character);
        const selectedLanguage = await this.db.getPreference("selectedLanguage", "en");

        // Use unified keyword system
        const getPersonalityWords = (trait, type) => {
            if (window.KIMI_PERSONALITY_KEYWORDS && window.KIMI_PERSONALITY_KEYWORDS[selectedLanguage]) {
                return window.KIMI_PERSONALITY_KEYWORDS[selectedLanguage][trait]?.[type] || [];
            }
            return this._getFallbackKeywords(trait, type);
        };

        for (const trait of ["humor", "intelligence", "romance", "affection", "playfulness", "empathy"]) {
            const posWords = getPersonalityWords(trait, "positive");
            const negWords = getPersonalityWords(trait, "negative");
            let value = typeof traits[trait] === "number" ? traits[trait] : this.TRAIT_DEFAULTS[trait];

            // Count occurrences with proper weighting
            let posCount = 0;
            let negCount = 0;

            for (const w of posWords) {
                posCount += (lowerUser.match(new RegExp(w, "g")) || []).length * 1.0;
                posCount += (lowerKimi.match(new RegExp(w, "g")) || []).length * 0.3;
            }
            for (const w of negWords) {
                negCount += (lowerUser.match(new RegExp(w, "g")) || []).length * 1.0;
                negCount += (lowerKimi.match(new RegExp(w, "g")) || []).length * 0.3;
            }

            const delta = (posCount - negCount) * 0.3; // Reduced from 0.4 - slower LLM-based progression

            // Apply streak logic
            if (!this.negativeStreaks[trait]) this.negativeStreaks[trait] = 0;

            if (negCount > 0 && posCount === 0) {
                this.negativeStreaks[trait]++;
                if (this.negativeStreaks[trait] >= 3) {
                    value = Math.max(0, Math.min(100, value + delta - 1));
                } else {
                    value = Math.max(0, Math.min(100, value + delta));
                }
            } else if (posCount > 0) {
                this.negativeStreaks[trait] = 0;
                value = Math.max(0, Math.min(100, value + delta));
            }

            if (delta !== 0) {
                await this.db.setPersonalityTrait(trait, value, character);
            }
        }
    }

    // ===== UNIFIED VIDEO CONTEXT MAPPING =====
    mapEmotionToVideoCategory(emotion) {
        return this.emotionToVideoCategory[emotion] || "neutral";
    }

    // ===== VALIDATION SYSTEM =====
    validateEmotion(emotion) {
        const validEmotions = Object.values(this.EMOTIONS);
        if (!validEmotions.includes(emotion)) {
            console.warn(`Invalid emotion detected: ${emotion}, falling back to neutral`);
            return this.EMOTIONS.NEUTRAL;
        }
        return emotion;
    }

    validatePersonalityTrait(trait, value) {
        if (typeof value !== "number" || value < 0 || value > 100) {
            console.warn(`Invalid trait value for ${trait}: ${value}, using default`);
            return this.TRAIT_DEFAULTS[trait] || 50;
        }
        return value;
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
        const keys = ["affection", "romance", "empathy", "playfulness", "humor"];
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

// ===== GLOBAL EXPORT =====
window.KimiEmotionSystem = KimiEmotionSystem;

// ===== BACKWARD COMPATIBILITY LAYER =====
// Replace the old kimiAnalyzeEmotion function
window.kimiAnalyzeEmotion = function (text, lang = "auto") {
    if (!window.kimiEmotionSystem) {
        window.kimiEmotionSystem = new KimiEmotionSystem(window.kimiDB);
    }
    return window.kimiEmotionSystem.analyzeEmotion(text, lang);
};

// Replace the old updatePersonalityTraitsFromEmotion function
window.updatePersonalityTraitsFromEmotion = async function (emotion, text) {
    if (!window.kimiEmotionSystem) {
        window.kimiEmotionSystem = new KimiEmotionSystem(window.kimiDB);
    }

    const updatedTraits = await window.kimiEmotionSystem.updatePersonalityFromEmotion(emotion, text);

    // Update UI sliders
    if (updatedTraits && window.updateSlider) {
        window.updateSlider("trait-affection", updatedTraits.affection);
        window.updateSlider("trait-romance", updatedTraits.romance);
        window.updateSlider("trait-empathy", updatedTraits.empathy);
        window.updateSlider("trait-playfulness", updatedTraits.playfulness);
        window.updateSlider("trait-humor", updatedTraits.humor);
        window.updateSlider("trait-intelligence", updatedTraits.intelligence);
    }

    // Update memory system
    if (window.kimiMemory && updatedTraits) {
        window.kimiMemory.affectionTrait = updatedTraits.affection;
        if (window.kimiMemory.updateFavorabilityBar) {
            window.kimiMemory.updateFavorabilityBar();
        }
    }

    // Update video context
    if (window.kimiVideo && window.kimiVideo.setMoodByPersonality && updatedTraits) {
        window.kimiVideo.setMoodByPersonality(updatedTraits);
    }

    // Dispatch event
    if (window.dispatchEvent && updatedTraits) {
        const selectedCharacter = window.kimiDB ? await window.kimiDB.getSelectedCharacter() : "kimi";
        window.dispatchEvent(
            new CustomEvent("personalityUpdated", {
                detail: { character: selectedCharacter, traits: updatedTraits }
            })
        );
    }

    return updatedTraits;
};

// Replace getPersonalityAverage function
window.getPersonalityAverage = function (traits) {
    if (!window.kimiEmotionSystem) {
        window.kimiEmotionSystem = new KimiEmotionSystem(window.kimiDB);
    }
    return window.kimiEmotionSystem.calculatePersonalityAverage(traits);
};
