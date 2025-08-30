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

        // Unified trait defaults - Balanced for progressive experience
        this.TRAIT_DEFAULTS = {
            affection: 55, // Lowered to allow more natural progression from start
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
                empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.5))); // Empathy still grows (understanding pain)
                break;
            case this.EMOTIONS.ROMANTIC:
                romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.6))); // Romance should be earned
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.5)));
                break;
            case this.EMOTIONS.LAUGHING:
                humor = Math.min(100, adjustUp(humor, scaleGain("humor", 0.8))); // Humor grows with laughter
                playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.4))); // Playfulness connection
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.2))); // Small affection boost from shared laughter
                break;
            case this.EMOTIONS.DANCING:
                playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 1.2))); // Dancing = maximum playfulness boost
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.5))); // Affection from shared activity
                break;
            case this.EMOTIONS.SHY:
                affection = Math.max(0, adjustDown(affection, scaleLoss("affection", 0.1))); // Small affection loss
                romance = Math.max(0, adjustDown(romance, scaleLoss("romance", 0.2))); // Shyness reduces romance more
                break;
            case this.EMOTIONS.CONFIDENT:
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.5)));
                intelligence = Math.min(100, adjustUp(intelligence, scaleGain("intelligence", 0.1))); // Slight intelligence boost
                break;
            case this.EMOTIONS.FLIRTATIOUS:
                romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.5)));
                playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.5)));
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.2))); // Small affection boost
                break;
            case this.EMOTIONS.SURPRISE:
                intelligence = Math.min(100, adjustUp(intelligence, scaleGain("intelligence", 0.1))); // Surprise stimulates thinking
                empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.1))); // Opens mind to new perspectives
                break;
            case this.EMOTIONS.KISS:
                romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.8))); // Strong romantic gesture
                affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.6))); // Very affectionate action
                break;
            case this.EMOTIONS.GOODBYE:
                // Slight melancholy but no major trait changes
                empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.05))); // Understanding of parting
                break;
            case this.EMOTIONS.LISTENING:
                intelligence = Math.min(100, adjustUp(intelligence, scaleGain("intelligence", 0.2))); // Active listening shows intelligence
                empathy = Math.min(100, adjustUp(empathy, scaleGain("empathy", 0.5))); // Listening builds empathy
                break;
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
        if (Object.keys(toPersist).length > 0) {
            await this.db.setPersonalityBatch(toPersist, selectedCharacter);
        }

        return updatedTraits;
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
            let value = typeof traits[trait] === "number" && isFinite(traits[trait]) ? traits[trait] : this.TRAIT_DEFAULTS[trait];

            // Count occurrences with proper weighting
            let posCount = 0;
            let negCount = 0;

            for (const w of posWords) {
                posCount += this.countTokenMatches(lowerUser, String(w)) * 1.0;
                posCount += this.countTokenMatches(lowerKimi, String(w)) * 0.5;
            }
            for (const w of negWords) {
                negCount += this.countTokenMatches(lowerUser, String(w)) * 1.0;
                negCount += this.countTokenMatches(lowerKimi, String(w)) * 0.5;
            }

            const delta = (posCount - negCount) * 0.8; // softened multiplier to 0.8 for gentler progression

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
                pendingUpdates[trait] = value;
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
export default KimiEmotionSystem;

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

    return updatedTraits;
};

// Replace getPersonalityAverage function
window.getPersonalityAverage = function (traits) {
    if (!window.kimiEmotionSystem) {
        window.kimiEmotionSystem = new KimiEmotionSystem(window.kimiDB);
    }
    return window.kimiEmotionSystem.calculatePersonalityAverage(traits);
};

// Unified trait defaults accessor
window.getTraitDefaults = function () {
    if (window.kimiEmotionSystem) return window.kimiEmotionSystem.TRAIT_DEFAULTS;
    const temp = new KimiEmotionSystem(window.kimiDB);
    return temp.TRAIT_DEFAULTS;
};
