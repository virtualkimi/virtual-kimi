// ===== KIMI VIDEO CONTROLLER =====

class KimiVideoController {
    constructor(videoManager) {
        this.videoManager = videoManager;
        this._lastNegativeAt = 0;
        this._negativeCooldownMs = 8000; // avoid spamming negative videos
        this._negativeStickUntil = 0; // timestamp until which negative stays sticky
        this._baseNegativeStickMs = 3000; // minimal stickiness
        this._positiveDebounceMs = 5000; // block positive too soon after negative
        this._lastCategory = "neutral";
        this._lastSwitchAt = 0;
        this._suppressPositiveUntil = 0; // timestamp blocking positive transitions
        // Dynamic hostility series tracking
        this._hostileTimestamps = []; // epoch ms of negative triggers
        this._maxSeriesWindowMs = 60000; // 60s sliding window
        this._minCooldownMs = 3000; // lower bound
        this._maxCooldownMs = 15000; // upper bound
    }

    // ===== SINGLE DECISION FUNCTION =====

    playVideo(trigger, text = "") {
        // 1. DECISION BASE
        let category = "neutral";

        const now = Date.now();

        if (this._isDancing(text)) {
            category = "dancing";
        } else if (trigger === "user") {
            // Analyze user message directly for immediate negative reaction
            let userEmo = null;
            try {
                userEmo = window.kimiEmotionSystem?.analyzeEmotionValidated?.(text) || null;
            } catch {}
            if (userEmo === "negative") {
                const severity = this._computeHostileSeverity(text);
                if (now - this._lastNegativeAt > this._negativeCooldownMs) {
                    category = "speakingNegative";
                    this._lastNegativeAt = now;
                    this._negativeStickUntil = now + this._stickDurationForSeverity(severity);
                    this._registerNegative(now, severity);
                } else if (now < this._negativeStickUntil) {
                    category = "speakingNegative"; // still sticky
                }
            }
        } else if (trigger === "tts") {
            // Prefer centralized emotion analysis if available
            let emo = null;
            try {
                if (window.kimiEmotionSystem?.analyzeEmotionValidated) {
                    emo = window.kimiEmotionSystem.analyzeEmotionValidated(text || "");
                } else if (window.kimiEmotionSystem?.analyzeEmotion) {
                    emo = window.kimiEmotionSystem.analyzeEmotion(text || "");
                }
            } catch {}
            if (emo === "negative") {
                const severity = this._computeHostileSeverity(text);
                if (now - this._lastNegativeAt > this._negativeCooldownMs) {
                    category = "speakingNegative";
                    this._lastNegativeAt = now;
                    this._negativeStickUntil = now + this._stickDurationForSeverity(severity);
                    this._registerNegative(now, severity);
                } else if (now < this._negativeStickUntil) {
                    category = "speakingNegative";
                } else {
                    // cooldown active; degrade to neutral
                    category = "neutral";
                }
            } else {
                // Block positive if still inside debounce window after last negative
                if (now < this._suppressPositiveUntil && now < this._negativeStickUntil) {
                    category = "speakingNegative"; // keep negative sticky
                } else if (now < this._suppressPositiveUntil) {
                    category = "neutral"; // soft neutral instead of immediate positive
                } else {
                    category = "speakingPositive";
                }
            }
        } else if (trigger === "listening") {
            category = "listening";
        }

        // Sticky guard: if trying to leave negative before stick time -> stay
        if (this._lastCategory === "speakingNegative" && category !== "speakingNegative" && Date.now() < this._negativeStickUntil) {
            category = "speakingNegative";
        }

        // Neutral dedupe & cascade suppression (< 500ms repeated neutrals)
        if (category === "neutral" && this._lastCategory === "neutral") {
            const since = now - this._lastSwitchAt;
            if (since < 500) {
                if (window.KIMI_DEBUG_EMOTION) console.debug("[EMO] Skip rapid neutral cascade", { since });
                return;
            }
        }

        this._commitCategory(category, now);
        if (window.KIMI_DEBUG_EMOTION) {
            console.debug("[EMO] category=", category, {
                lastNegativeAt: this._lastNegativeAt,
                stickUntil: this._negativeStickUntil,
                now,
                debounceRemaining: Math.max(0, this._positiveDebounceMs - (now - this._lastNegativeAt)),
                suppressPositiveMs: Math.max(0, this._suppressPositiveUntil - now)
            });
        }
    }

    // ===== SIMPLE HELPERS =====

    _isDancing(text) {
        if (!text) return false;
        if (window.hasKeywordCategory && window.hasKeywordCategory("dancing", text)) return true;
        // Fallback minimal legacy list (should rarely be used)
        const words = ["dance", "dancing"];
        return words.some(w => text.toLowerCase().includes(w));
    }

    // _isNegative deprecated: centralized emotion system handles polarity

    // Severity = proportion of hostile keywords length found relative to text tokens
    _computeHostileSeverity(text) {
        if (!text) return 0;
        try {
            const lang = window.KIMI_LAST_LANG || "en";
            const raw = text.toLowerCase();
            const tokens = raw.split(/\s+/).filter(Boolean);
            if (!tokens.length) return 0;
            const hostile = (window.KIMI_CONTEXT_KEYWORDS?.[lang]?.hostile || []).concat(window.KIMI_CONTEXT_KEYWORDS?.en?.hostile || []);
            // Prebuild boundary regex list once per call
            const patterns = hostile.map(h => {
                const esc = String(h)
                    .trim()
                    .toLowerCase()
                    .replace(/[-/\\^$*+?.()|[\]{}]/g, r => "\\" + r);
                return new RegExp(`\\b${esc}\\b`, "i");
            });
            let hits = 0;
            for (const p of patterns) {
                if (p.test(raw)) hits++;
            }
            const severity = hits / tokens.length;
            return severity > 1 ? 1 : severity;
        } catch {
            return 0;
        }
    }

    _commitCategory(category, now) {
        if (this.videoManager?.switchToContext) {
            this.videoManager.switchToContext(category, category, null, null, null, false);
        }
        this._lastCategory = category;
        this._lastSwitchAt = now;
    }

    _stickDurationForSeverity(sev) {
        if (sev >= 0.4) return 6000;
        if (sev >= 0.25) return 4500;
        if (sev >= 0.15) return 3800;
        return this._baseNegativeStickMs;
    }

    _registerNegative(now, severity) {
        try {
            this._hostileTimestamps.push({ t: now, s: severity });
            // purge old
            const cutoff = now - this._maxSeriesWindowMs;
            this._hostileTimestamps = this._hostileTimestamps.filter(e => e.t >= cutoff);
            this._updateDynamicCooldown(now);
        } catch {}
    }

    _updateDynamicCooldown(now) {
        const entries = this._hostileTimestamps;
        if (!entries.length) return;
        // Compute weighted intensity: sum(severity * freshnessWeight)
        // freshnessWeight = 1 - age/maxWindow
        const cutoff = now - this._maxSeriesWindowMs;
        let weighted = 0;
        for (const e of entries) {
            const age = Math.min(this._maxSeriesWindowMs, Math.max(0, now - e.t));
            const w = 1 - age / this._maxSeriesWindowMs;
            weighted += e.s * w;
        }
        // Normalize to rough 0..N scale. If user spams many insults severity .3 → weighted ~ >1
        // Map weighted to cooldown via inverse relation: plus d'hostilité récente => cooldown plus long & debounce plus long
        // Clamp weighted to 0..2 for mapping
        const clamped = Math.min(2, weighted);
        const ratio = clamped / 2; // 0..1
        // Interpolate cooldown
        const newCooldown = Math.round(this._minCooldownMs + (this._maxCooldownMs - this._minCooldownMs) * ratio);
        this._negativeCooldownMs = newCooldown;
        // Optionally also scale positive debounce (bounded 3000..8000)
        this._positiveDebounceMs = 3000 + Math.round(5000 * ratio);
        if (window.KIMI_DEBUG_EMOTION) {
            console.debug("[EMO] dynamicCooldown", { weighted, ratio, newCooldown, positiveDebounce: this._positiveDebounceMs, series: entries.length });
        }
    }
}

// ===== SIMPLE API =====

function initializeVideoController(videoManager) {
    const controller = new KimiVideoController(videoManager);
    return controller;
}

// ES6 exports
export { KimiVideoController, initializeVideoController };

// Global exposure
window.KimiVideoController = KimiVideoController;
window.initializeVideoController = initializeVideoController;
