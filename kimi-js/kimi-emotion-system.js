// ===== KIMI UNIFIED EMOTION SYSTEM =====
// Centralizes all emotion analysis, personality updates, and validation

class KimiEmotionSystem {
    constructor(database = null) {
        /*
         * Personality Update Pipeline (Refactored)
         * 1. Emotion detected -> base deltas applied via EMOTION_TRAIT_EFFECTS (central map).
         *    - Each delta passes through adjustUp / adjustDown with global + per-trait multipliers
         *      (window.KIMI_TRAIT_ADJUSTMENT) for consistent scaling.
         * 2. Content keyword analysis (_analyzeTextContent) may override interim trait values (explicit matches).
         * 3. Cross-trait modifiers (_applyCrossTraitModifiers) apply ALL synergy / balancing rules (single location to avoid double application).
         * 4. Conversation-based drift (updatePersonalityFromConversation) uses TRAIT_KEYWORD_MODEL:
         *      - Counts positive/negative keyword hits (user weighted 1.0, model weighted 0.5).
         *      - Computes rawDelta = posHits*posFactor - negHits*negFactor.
         *      - Applies sustained negativity amplification after streakPenaltyAfter.
         *      - Clamps magnitude to maxStep per trait, then applies directly with bounds [0,100].
         * 5. Persistence: _preparePersistTrait decides threshold & smoothing before batch write.
         * 6. Global personality average (UI) = mean of six core traits. This class is the single source of truth; external helpers now delegate.
         * NOTE: Affection is fully independent (no derived average). All adjustments centralized here to avoid duplication.
         */
        this.db = database;
        this.negativeStreaks = {};
        // Accumulated micro-changes not yet persisted (trait -> float)
        this._pendingDrift = {};

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
            affection: 55, // Baseline neutral affection
            playfulness: 55, // Moderately playful baseline
            intelligence: 70, // Competent baseline intellect
            empathy: 75, // Warm & caring baseline
            humor: 60, // Mild sense of humor baseline
            romance: 50, // Neutral romance baseline (earned over time)
            trust: 50, // Trust starts neutral
            intimacy: 45 // Intimacy builds slower than trust/romance
        };

        // Central emotion -> trait base deltas (pre global multipliers & gainCfg scaling)
        // Positive numbers increase trait, negative decrease.
        // Keep values small; final effect passes through adjustUp/adjustDown and global multipliers.
        // Rebalanced: keep relative ordering but narrow spread to avoid runaway traits.
        // Target typical per-event magnitude range ~0.1 - 0.5.
        this.EMOTION_TRAIT_EFFECTS = {
            positive: { affection: 0.35, empathy: 0.18, playfulness: 0.2, humor: 0.22 },
            negative: { affection: -0.55, empathy: 0.22 },
            romantic: { romance: 0.55, affection: 0.45, empathy: 0.14 },
            flirtatious: { romance: 0.45, playfulness: 0.38, affection: 0.2 },
            laughing: { humor: 0.6, playfulness: 0.4, affection: 0.2 },
            dancing: { playfulness: 0.55, affection: 0.35 },
            surprise: { intelligence: 0.1, empathy: 0.1 },
            shy: { romance: -0.25, affection: -0.1 },
            confident: { intelligence: 0.13, affection: 0.45 },
            listening: { empathy: 0.45, intelligence: 0.2 },
            kiss: { romance: 0.65, affection: 0.55 },
            goodbye: { affection: -0.12, empathy: 0.08 }
        };

        // Trait keyword scaling model for conversation analysis (per-message delta shaping)
        this.TRAIT_KEYWORD_MODEL = {
            affection: { posFactor: 0.5, negFactor: 0.65, streakPenaltyAfter: 3, maxStep: 2 },
            romance: { posFactor: 0.55, negFactor: 0.75, streakPenaltyAfter: 2, maxStep: 1.8 },
            empathy: { posFactor: 0.4, negFactor: 0.5, streakPenaltyAfter: 3, maxStep: 1.5 },
            playfulness: { posFactor: 0.45, negFactor: 0.4, streakPenaltyAfter: 4, maxStep: 1.4 },
            humor: { posFactor: 0.55, negFactor: 0.45, streakPenaltyAfter: 4, maxStep: 1.6 },
            intelligence: { posFactor: 0.35, negFactor: 0.55, streakPenaltyAfter: 2, maxStep: 1.2 },
            trust: { posFactor: 0.45, negFactor: 0.9, streakPenaltyAfter: 2, maxStep: 1.2 },
            intimacy: { posFactor: 0.35, negFactor: 0.6, streakPenaltyAfter: 2, maxStep: 1.0 }
        };

        // Ephemeral relational warmth (short-term amplifier damped over time)
        this._warmth = 0; // range suggestion: -50..+50 (internally clamped)
        this._lastWarmthDecay = Date.now();
        this.WARMTH_CFG = Object.assign(
            {
                decayPerMinute: 2.5, // linear decay toward 0
                maxAbs: 50,
                affectionAmplifierAtMax: 0.25, // +25% affection delta at max warmth
                romanceAmplifierAtMax: 0.2,
                trustAmplifierAtMax: 0.22,
                negativeMultiplier: 1.2 // negative warmth increases penalty magnitude slightly
            },
            window.KIMI_WARMTH_CONFIG || {}
        );

        // Relationship stage thresholds (can be overridden by window.KIMI_RELATIONSHIP_THRESHOLDS)
        // Stages reflect progression: acquaintance -> friend -> close_friend -> romantic -> intimate -> deep_bond
        this.RELATIONSHIP_STAGE_THRESHOLDS = Object.assign(
            {
                acquaintance: { minAffection: 0, minRomance: 0 },
                friend: { minAffection: 40, minRomance: 0 },
                close_friend: { minAffection: 60, minRomance: 10 },
                romantic: { minAffection: 70, minRomance: 35 },
                intimate: { minAffection: 82, minRomance: 55 },
                deep_bond: { minAffection: 92, minRomance: 75 }
            },
            window.KIMI_RELATIONSHIP_THRESHOLDS || {}
        );
        this._currentRelationshipStage = "acquaintance";
    }
    // (Affection is an independent trait again; previous derived computation removed.)
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

        // Relationship-aware sensitivity adjustments (non-destructive copy)
        let stage = this._currentRelationshipStage || "acquaintance";
        const relBoost = { acquaintance: 0, friend: 0.05, close_friend: 0.1, romantic: 0.18, intimate: 0.25, deep_bond: 0.3 };
        const mult = 1 + (relBoost[stage] || 0);
        const stageSensitivity = { ...sensitivity };
        stageSensitivity.romantic *= mult;
        stageSensitivity.flirtatious *= mult;
        stageSensitivity.kiss *= 1 + (relBoost[stage] || 0) * 1.2;

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
                const weight = stageSensitivity[key] != null ? stageSensitivity[key] : 1;
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
        let trust = safe(traits?.trust, this.TRAIT_DEFAULTS.trust);
        let intimacy = safe(traits?.intimacy, this.TRAIT_DEFAULTS.intimacy);

        // Unified adjustment functions (parametric): soft diminishing returns / protection low end.
        // Tunable via window.KIMI_ADJUST_TUNING = { upExponent, downExponent, minLossFactor, maxLossFactor, minGainFactor }
        const tuning = window.KIMI_ADJUST_TUNING || {};
        const upExp = typeof tuning.upExponent === "number" ? tuning.upExponent : 1.2; // >1 speeds early gains, slows late
        const downExp = typeof tuning.downExponent === "number" ? tuning.downExponent : 1.1; // >1 accelerates high losses
        const minGainFactor = typeof tuning.minGainFactor === "number" ? tuning.minGainFactor : 0.25; // floor near 100
        const minLossFactor = typeof tuning.minLossFactor === "number" ? tuning.minLossFactor : 0.35; // floor near 0
        const maxLossFactor = typeof tuning.maxLossFactor === "number" ? tuning.maxLossFactor : 1.15; // cap high-end loss accel

        const adjustUp = (val, amount) => {
            // Factor scales with remaining headroom (distance to 100)
            const headroom = Math.max(0, 100 - val) / 100; // 1 at 0, 0 at 100
            const factor = Math.max(minGainFactor, Math.pow(headroom, upExp));
            return val + amount * factor;
        };
        const adjustDown = (val, amount) => {
            // Loss factor scales with current level (higher -> larger)
            const level = Math.max(0, Math.min(100, val)) / 100; // 0..1
            // curve amplifies as level increases
            let factor = Math.pow(level, downExp) * maxLossFactor;
            // Provide protection at very low end
            if (level < 0.2) factor = Math.min(factor, minLossFactor);
            return val - amount * factor;
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

        // Lightweight per-call token cache (avoids repeated normalization/tokenization)
        const _tokenCache = new Map();
        const getTokenCount = phrase => {
            if (!phrase) return 0;
            const key = String(phrase);
            if (_tokenCache.has(key)) return _tokenCache.get(key);
            const c = this.tokenizeText(this.normalizeText(key)).length;
            _tokenCache.set(key, c);
            return c;
        };

        // Warmth decay (linear drift toward 0)
        const nowTs = Date.now();
        if (this._warmth !== 0) {
            const mins = (nowTs - this._lastWarmthDecay) / 60000;
            if (mins > 0.05) {
                const decayAmt = this.WARMTH_CFG.decayPerMinute * mins;
                if (this._warmth > 0) this._warmth = Math.max(0, this._warmth - decayAmt);
                else this._warmth = Math.min(0, this._warmth + decayAmt);
                this._lastWarmthDecay = nowTs;
            }
        }

        // Derive a simple intensity factor from message length & punctuation emphasis
        const wordCount = getTokenCount(text || "");
        let intensity = 1;
        if (wordCount >= 8 && wordCount < 25) intensity = 1.05;
        else if (wordCount >= 25 && wordCount < 60) intensity = 1.12;
        else if (wordCount >= 60) intensity = 1.18;
        // Emphasis markers (!, ❤️, ???) add a small boost
        const emphasisMatches = (text && text.match(/[!?!]{2,}|❤️|💖|😍/g)) || [];
        if (emphasisMatches.length > 0) intensity += Math.min(0.12, 0.04 * emphasisMatches.length);

        // ===== Contextual affectionate profanity & chaotic lexicon handling =====
        const lower = (text || "").toLowerCase();
        // Compliment anti-spam (exact token based) with exponential damping
        this._complimentHistory = this._complimentHistory || [];
        const nowMs = Date.now();
        // Keep only last 60s entries
        this._complimentHistory = this._complimentHistory.filter(t => nowMs - t < 60000);
        const complimentTokens = ["merveilleuse", "merveilleux", "magnifique", "adorable", "charmant", "formidable"];
        const messageTokens = this.tokenizeText(lower);
        const complimentHits = messageTokens.filter(tok => complimentTokens.includes(tok)).length;
        if (complimentHits > 0) {
            for (let i = 0; i < complimentHits; i++) this._complimentHistory.push(nowMs);
        }
        const complimentDensity = this._complimentHistory.length; // raw count last 60s
        // Exponential damping factor: each additional compliment reduces gains multiplicatively
        // baseFactor^ (density-1), clamped
        const baseFactor = 0.88; // 12% reduction per extra compliment
        let complimentDampFactor = 1;
        if (complimentDensity > 1) {
            complimentDampFactor = Math.pow(baseFactor, complimentDensity - 1);
        }
        complimentDampFactor = Math.max(0.3, Math.min(1, complimentDampFactor));
        const lovePatterns = [
            /je t(?:'|e) ?aime/,
            /i love you/,
            /ti amo/,
            /te quiero/,
            /te amo/,
            /ich liebe dich/,
            /愛してる/,
            /我爱你/,
            /ti voglio bene/
        ];
        const softProfanity = /(putain|fuck|fucking|merde|shit|bordel)/;
        const positiveAdj = /(adorable|magnifique|formidable|belle|bello|hermos[ao]|beautiful|amazing|wonderful|gorgeous)/;
        const chaoticWords = /(chaos|chaotique|rebelle|rebel|wild|sauvage)/;
        const conjugalTerms = /(ma femme|mon mari)/;

        let affectionateProfane = false;
        if (lovePatterns.some(r => r.test(lower)) && softProfanity.test(lower) && positiveAdj.test(lower)) {
            affectionateProfane = true;
        }
        const containsChaos = chaoticWords.test(lower);
        const containsConjugal = conjugalTerms.test(lower);

        // If affectionate profanity detected while emotion not negative, gently bias toward romantic
        if (affectionateProfane && emotion && emotion !== this.EMOTIONS.NEGATIVE) {
            // Micro pre-boost before base map (acts like extra intensity)
            intensity *= 1.04;
            // Optionally upgrade neutral/positive to romantic
            if (emotion === this.EMOTIONS.POSITIVE || emotion === this.EMOTIONS.NEUTRAL) {
                emotion = this.EMOTIONS.ROMANTIC;
            }
        }

        // Conjugal gating: if conjugal term appears but relationship stage < romantic, reduce romantic sensitivity
        if (containsConjugal && emotion === this.EMOTIONS.ROMANTIC) {
            const stageOrder = ["acquaintance", "friend", "close_friend", "romantic", "intimate", "deep_bond"];
            const currentIdx = stageOrder.indexOf(this._currentRelationshipStage || "acquaintance");
            if (currentIdx >= 0 && currentIdx < stageOrder.indexOf("romantic")) {
                intensity *= 0.75; // soften premature strong romantic signal
            }
        }

        // Apply emotion deltas from centralized map (if defined)
        const map = this.EMOTION_TRAIT_EFFECTS?.[emotion];
        const cfg = window.KIMI_EMOTION_CONFIG || null;
        const traitScalar = cfg?.traitScalar || {};
        const emotionScalar = cfg?.emotionScalar || {};
        const emoScale = emotionScalar[emotion] || 1;
        if (map) {
            for (const [traitName, baseDelta] of Object.entries(map)) {
                let delta = baseDelta * emoScale * intensity; // apply emotion & intensity
                const perTraitScale = traitScalar[traitName];
                if (typeof perTraitScale === "number") delta *= perTraitScale;
                if (delta === 0) continue;
                switch (traitName) {
                    case "affection":
                        let adjAffDelta = delta;
                        if (delta > 0) adjAffDelta *= complimentDampFactor;
                        affection =
                            adjAffDelta > 0
                                ? Math.min(100, adjustUp(affection, scaleGain("affection", adjAffDelta)))
                                : Math.max(0, adjustDown(affection, scaleLoss("affection", Math.abs(adjAffDelta))));
                        break;
                    case "romance":
                        let adjRomDelta = delta;
                        if (delta > 0) adjRomDelta *= complimentDampFactor;
                        romance =
                            adjRomDelta > 0
                                ? Math.min(100, adjustUp(romance, scaleGain("romance", adjRomDelta)))
                                : Math.max(0, adjustDown(romance, scaleLoss("romance", Math.abs(adjRomDelta))));
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
                    case "trust":
                        trust =
                            delta > 0
                                ? Math.min(100, adjustUp(trust, scaleGain("trust", delta * 0.6)))
                                : Math.max(0, adjustDown(trust, scaleLoss("trust", Math.abs(delta) * 0.9)));
                        break;
                    case "intimacy":
                        intimacy =
                            delta > 0
                                ? Math.min(100, adjustUp(intimacy, scaleGain("intimacy", delta * 0.5)))
                                : Math.max(0, adjustDown(intimacy, scaleLoss("intimacy", Math.abs(delta) * 0.85)));
                        break;
                }
            }
        }

        // Micro direct trust/intimacy boost for respectful conjugal reference (stage-aware, only positive tone)
        if (containsConjugal && emotion === this.EMOTIONS.ROMANTIC) {
            const stageOrder = ["acquaintance", "friend", "close_friend", "romantic", "intimate", "deep_bond"];
            const currentIdx = stageOrder.indexOf(this._currentRelationshipStage || "acquaintance");
            const romanticIdx = stageOrder.indexOf("romantic");
            let scale = 0.18; // base micro boost
            if (currentIdx < romanticIdx) scale *= 0.5; // earlier stages smaller
            // Compliment spam damping
            scale *= complimentDampFactor;
            trust = Math.min(100, adjustUp(trust, scaleGain("affection", scale * 0.8)));
            intimacy = Math.min(100, adjustUp(intimacy, scaleGain("romance", scale * 0.6)));
        }

        // Cross-trait interactions removed here (now centralized exclusively in _applyCrossTraitModifiers)
        // to avoid double application of synergy boosts.

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

        // Micro contextual boosts (post content analysis, pre synergy)
        if (affectionateProfane) {
            // Treat as emphatic endearment: small extra romance & affection
            affection = Math.min(100, adjustUp(affection, scaleGain("affection", 0.25 * intensity)));
            romance = Math.min(100, adjustUp(romance, scaleGain("romance", 0.22 * intensity)));
            // Warmth gain
            this._warmth = Math.max(-this.WARMTH_CFG.maxAbs, Math.min(this.WARMTH_CFG.maxAbs, this._warmth + 8 * intensity));
            // Trust/intimacy micro boost if not spamming (use last delta heuristic: only if romance<90)
            if (romance < 90) {
                trust = Math.min(100, adjustUp(trust, scaleGain("trust", 0.12 * intensity)));
                intimacy = Math.min(100, adjustUp(intimacy, scaleGain("intimacy", 0.1 * intensity)));
            }
        }
        if (containsChaos) {
            playfulness = Math.min(100, adjustUp(playfulness, scaleGain("playfulness", 0.18 * intensity)));
            // Slight warmth nudge (a playful chaotic vibe)
            this._warmth = Math.max(-this.WARMTH_CFG.maxAbs, Math.min(this.WARMTH_CFG.maxAbs, this._warmth + 3 * intensity));
        }
        // Additional warmth gain for strong romantic emotion without profanity pattern
        if (!affectionateProfane && emotion === this.EMOTIONS.ROMANTIC) {
            const romanticPulse = 4 * intensity;
            this._warmth = Math.max(-this.WARMTH_CFG.maxAbs, Math.min(this.WARMTH_CFG.maxAbs, this._warmth + romanticPulse));
        }

        // Relationship affirmation memory (deduplicate recent)
        if (
            (affectionateProfane || (emotion === this.EMOTIONS.ROMANTIC && lovePatterns.some(r => r.test(lower)))) &&
            this.db?.db?.memories
        ) {
            try {
                const cutoff = Date.now() - 1000 * 60 * 60 * 6; // 6h
                const recent = await this.db.db.memories
                    .where("category")
                    .equals("relationships")
                    .and(m => (m.tags || []).includes("relationship:affirmation") && new Date(m.timestamp).getTime() > cutoff)
                    .limit(1)
                    .toArray();
                if (!recent || recent.length === 0) {
                    const content = affectionateProfane
                        ? "Intense affectionate profanity declaration"
                        : "Romantic love affirmation";
                    this.db.db.memories
                        .add({
                            category: "relationships",
                            type: "affirmation",
                            content,
                            importance: 0.9,
                            timestamp: new Date(),
                            character: selectedCharacter,
                            isActive: true,
                            tags: ["relationship:affirmation", "relationship:love"],
                            lastModified: new Date(),
                            createdAt: new Date(),
                            lastAccess: new Date(),
                            accessCount: 0
                        })
                        .then(id => {
                            if (window.kimiEventBus) window.kimiEventBus.emit("memory:stored", { memory: { id, content } });
                        });
                }
            } catch (e) {
                /* silent */
            }
        }

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
        // Warmth amplification post base deltas (affects core relational traits)
        if (this._warmth !== 0) {
            const ampRatio = Math.min(1, Math.abs(this._warmth) / this.WARMTH_CFG.maxAbs);
            const sign = this._warmth >= 0 ? 1 : -this.WARMTH_CFG.negativeMultiplier;
            const amplify = (val, base, scale) => clamp(val + sign * (val - base) * scale * ampRatio);
            affection = amplify(affection, this.TRAIT_DEFAULTS.affection, this.WARMTH_CFG.affectionAmplifierAtMax);
            romance = amplify(romance, this.TRAIT_DEFAULTS.romance, this.WARMTH_CFG.romanceAmplifierAtMax);
            trust = amplify(trust, this.TRAIT_DEFAULTS.trust, this.WARMTH_CFG.trustAmplifierAtMax);
            intimacy = amplify(intimacy, this.TRAIT_DEFAULTS.intimacy, this.WARMTH_CFG.romanceAmplifierAtMax * 0.8);
        }

        let updatedTraits = {
            affection: to2(clamp(affection)),
            romance: to2(clamp(romance)),
            empathy: to2(clamp(empathy)),
            playfulness: to2(clamp(playfulness)),
            humor: to2(clamp(humor)),
            intelligence: to2(clamp(intelligence)),
            trust: to2(clamp(trust)),
            intimacy: to2(clamp(intimacy))
        };

        // Damping: limit per-message total movement across sensitive relational traits
        const DAMP_CFG = Object.assign(
            {
                maxTotalDelta: 6, // sum of |delta| capped
                focus: ["affection", "romance", "trust", "intimacy"],
                softThreshold: 3.5 // start proportionally scaling beyond this
            },
            window.KIMI_DAMPING_CONFIG || {}
        );
        let total = 0;
        const deltas = {};
        for (const key of DAMP_CFG.focus) {
            const prev = typeof traits?.[key] === "number" ? traits[key] : this.TRAIT_DEFAULTS[key];
            const after = updatedTraits[key];
            const delta = after - prev;
            deltas[key] = delta;
            total += Math.abs(delta);
        }
        if (total > DAMP_CFG.softThreshold) {
            const scale = total > DAMP_CFG.maxTotalDelta ? DAMP_CFG.maxTotalDelta / total : DAMP_CFG.softThreshold / total;
            if (scale < 1) {
                for (const key of DAMP_CFG.focus) {
                    const prev = typeof traits?.[key] === "number" ? traits[key] : this.TRAIT_DEFAULTS[key];
                    updatedTraits[key] = to2(clamp(prev + deltas[key] * scale));
                }
            }
        }

        if (cfg && typeof cfg.finalize === "function") {
            try {
                const fin = cfg.finalize({ ...updatedTraits });
                if (fin && typeof fin === "object") updatedTraits = { ...updatedTraits, ...fin };
            } catch (e) {
                console.warn("Finalize hook error", e);
            }
        }

        // Emit event before persistence for observers/plugins
        if (window.kimiEventBus) {
            window.kimiEventBus.emit("traits:computed", { emotion, text, character: selectedCharacter, updatedTraits });
            window.kimiEventBus.emit("relationship:trustChanged", { trust: updatedTraits.trust, character: selectedCharacter });
            window.kimiEventBus.emit("relationship:intimacyChanged", {
                intimacy: updatedTraits.intimacy,
                character: selectedCharacter
            });
            window.kimiEventBus.emit("relationship:warmthChanged", { warmth: this._warmth, character: selectedCharacter });
        }

        // Update relationship stage based on new traits (affection & romance)
        try {
            this._updateRelationshipStage(updatedTraits, selectedCharacter);
        } catch (e) {
            /* non-blocking */
        }

        // Prepare persistence with smoothing / threshold to avoid tiny writes
        const toPersist = {};
        for (const [trait, candValue] of Object.entries(updatedTraits)) {
            const current = typeof traits?.[trait] === "number" ? traits[trait] : this.TRAIT_DEFAULTS[trait];
            const prep = this._preparePersistTrait(trait, current, candValue, selectedCharacter);
            if (prep.shouldPersist) {
                toPersist[trait] = prep.value;
                this._pendingDrift[trait] = 0; // reset drift
            }
        }
        if (Object.keys(toPersist).length > 0) {
            if (window.kimiEventBus) window.kimiEventBus.emit("traits:willPersist", { character: selectedCharacter, toPersist });
            await this.db.setPersonalityBatch(toPersist, selectedCharacter);
            if (window.kimiEventBus)
                window.kimiEventBus.emit("traits:didPersist", { character: selectedCharacter, persisted: toPersist });
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
        // Basic message intensity heuristic (long message -> slightly higher impact)
        const tokenCount = this.tokenizeText(lowerUser).length;
        const intensityFactor = tokenCount <= 4 ? 0.7 : tokenCount <= 12 ? 1 : tokenCount <= 30 ? 1.1 : 1.2;
        const MAX_HITS_PER_WORD = 5; // cap repetition farming

        for (const trait of [
            "humor",
            "intelligence",
            "romance",
            "affection",
            "playfulness",
            "empathy",
            "trust",
            "intimacy",
            "boundary"
        ]) {
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
                const uHits = Math.min(MAX_HITS_PER_WORD, this.countTokenMatches(lowerUser, String(w)));
                const kHits = Math.min(MAX_HITS_PER_WORD, this.countTokenMatches(lowerKimi, String(w)));
                // sqrt dampening avoids farming same word
                posScore += Math.sqrt(uHits) * 1.0 + Math.sqrt(kHits) * 0.5;
            }
            for (const w of negWords) {
                const uHits = Math.min(MAX_HITS_PER_WORD, this.countTokenMatches(lowerUser, String(w)));
                const kHits = Math.min(MAX_HITS_PER_WORD, this.countTokenMatches(lowerKimi, String(w)));
                negScore += Math.sqrt(uHits) * 1.0 + Math.sqrt(kHits) * 0.5;
            }

            let rawDelta = posScore * posFactor - negScore * negFactor;
            const isBoundary = trait === "boundary";
            // Apply message intensity scaling (kept modest)
            rawDelta *= intensityFactor;

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
                if (rawDelta > 0) newVal = Math.min(100, newVal);
                else newVal = Math.max(0, newVal);
                pendingUpdates[trait] = newVal;

                if (isBoundary) {
                    // Propagate boundary delta to trust/empathy/intimacy with scaled mapping
                    const bDelta = rawDelta;
                    if (bDelta > 0.05) {
                        const trustBase = pendingUpdates.trust ?? traits.trust ?? this.TRAIT_DEFAULTS.trust;
                        const empathyBase = pendingUpdates.empathy ?? traits.empathy ?? this.TRAIT_DEFAULTS.empathy;
                        const intimacyBase = pendingUpdates.intimacy ?? traits.intimacy ?? this.TRAIT_DEFAULTS.intimacy;
                        pendingUpdates.trust = Math.min(100, trustBase + bDelta * 0.6);
                        pendingUpdates.empathy = Math.min(100, empathyBase + bDelta * 0.35);
                        pendingUpdates.intimacy = Math.min(100, intimacyBase + bDelta * 0.25);
                    } else if (bDelta < -0.05) {
                        const trustBase = pendingUpdates.trust ?? traits.trust ?? this.TRAIT_DEFAULTS.trust;
                        const intimacyBase = pendingUpdates.intimacy ?? traits.intimacy ?? this.TRAIT_DEFAULTS.intimacy;
                        pendingUpdates.trust = Math.max(0, trustBase + bDelta * 0.7); // bDelta negative
                        pendingUpdates.intimacy = Math.max(0, intimacyBase + bDelta * 0.5);
                    }
                }
            }
        }

        // Affection stays as independently adjusted by keywords & emotion (no derived override)

        // Flush pending updates in a single batch write to avoid overwrites
        if (Object.keys(pendingUpdates).length > 0) {
            // Apply smoothing/threshold per trait (read current values)
            const toPersist = {};
            for (const [trait, candValue] of Object.entries(pendingUpdates)) {
                const current = typeof traits?.[trait] === "number" ? traits[trait] : this.TRAIT_DEFAULTS[trait];
                const prep = this._preparePersistTrait(trait, current, candValue, character);
                if (prep.shouldPersist) {
                    toPersist[trait] = prep.value;
                    this._pendingDrift[trait] = 0;
                }
            }
            if (Object.keys(toPersist).length > 0) {
                if (window.kimiEventBus) window.kimiEventBus.emit("traits:willPersist", { character, toPersist });
                await this.db.setPersonalityBatch(toPersist, character);
                if (window.kimiEventBus) window.kimiEventBus.emit("traits:didPersist", { character, persisted: toPersist });
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
        // Adaptive threshold with drift accumulation.
        const alpha = (window.KIMI_SMOOTHING_ALPHA && Number(window.KIMI_SMOOTHING_ALPHA)) || 0.3;
        const baseThreshold = (window.KIMI_PERSIST_THRESHOLD && Number(window.KIMI_PERSIST_THRESHOLD)) || 0.15; // lowered from 0.25
        // Initialize drift bucket
        if (typeof this._pendingDrift[trait] !== "number") this._pendingDrift[trait] = 0;

        const smoothed = this._applyEMA(currentValue, candidateValue, alpha);
        const delta = smoothed - currentValue;
        this._pendingDrift[trait] += delta;
        const absAccum = Math.abs(this._pendingDrift[trait]);

        if (absAccum < baseThreshold) {
            return { shouldPersist: false, value: currentValue };
        }
        const newValue = Number(Number(currentValue + this._pendingDrift[trait]).toFixed(2));
        return { shouldPersist: true, value: newValue };
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
        const cfg = window.KIMI_EMOTION_CONFIG && window.KIMI_EMOTION_CONFIG.moodThresholds;
        // Default thresholds
        const pos = cfg?.positive ?? 80;
        const neutralHigh = cfg?.neutralHigh ?? 55;
        const neutralLow = cfg?.neutralLow ?? 35;
        const neg = cfg?.negative ?? 15;
        if (avg >= pos) return "speakingPositive";
        if (avg >= neutralHigh) return "neutral";
        if (avg >= neutralLow) return "neutral";
        if (avg >= neg) return "speakingNegative";
        return "speakingNegative";
    }

    getRelationshipStage(affection, romance) {
        const stages = ["deep_bond", "intimate", "romantic", "close_friend", "friend", "acquaintance"]; // check highest first
        for (const stage of stages) {
            const t = this.RELATIONSHIP_STAGE_THRESHOLDS[stage];
            if (!t) continue;
            if (affection >= t.minAffection && romance >= t.minRomance) return stage;
        }
        return "acquaintance";
    }

    _updateRelationshipStage(traits, character) {
        const affection = traits.affection ?? this.TRAIT_DEFAULTS.affection;
        const romance = traits.romance ?? this.TRAIT_DEFAULTS.romance;
        const prev = this._currentRelationshipStage;
        const next = this.getRelationshipStage(affection, romance);
        if (next !== prev) {
            this._currentRelationshipStage = next;
            if (window.kimiEventBus) {
                try {
                    window.kimiEventBus.emit("relationship:stageChanged", {
                        previous: prev,
                        current: next,
                        traits: { affection, romance },
                        character
                    });
                } catch (e) {}
            }
            // Optionally add a memory note (only upward transitions)
            if (typeof this.db?.db?.memories !== "undefined" && prev !== next) {
                const upwardOrder = ["acquaintance", "friend", "close_friend", "romantic", "intimate", "deep_bond"];
                if (upwardOrder.indexOf(next) > upwardOrder.indexOf(prev)) {
                    try {
                        this.db.db.memories
                            .add({
                                category: "relationships",
                                type: "system_stage",
                                content: `Relationship stage advanced to ${next}`,
                                importance: 0.85,
                                timestamp: new Date(),
                                character: character,
                                isActive: true,
                                tags: ["relationship:stage", `relationship:stage_${next}`],
                                lastModified: new Date(),
                                createdAt: new Date(),
                                lastAccess: new Date(),
                                accessCount: 0
                            })
                            .then(id => {
                                if (window.kimiEventBus)
                                    try {
                                        window.kimiEventBus.emit("memory:stored", { memory: { id, stage: next } });
                                    } catch (e) {}
                            });
                    } catch (e) {
                        /* non-blocking */
                    }
                }
            }
        }
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
