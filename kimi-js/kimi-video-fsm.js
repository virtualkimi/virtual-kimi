// ===== KIMI VIDEO FINITE STATE MACHINE (INITIAL REFACTOR) =====
// All code in English per contribution guidelines.
// Lightweight, additive (non-breaking) layer offering explicit state & transition validation.
// Designed for incremental integration: if unavailable, existing logic in kimi-videos.js still works.

(function () {
    const STATES = Object.freeze({
        NEUTRAL: "neutral",
        LISTENING: "listening",
        SPEAKING_POS: "speakingPositive",
        SPEAKING_NEG: "speakingNegative",
        DANCING: "dancing"
    });

    // Priority aligns with emotion system weights (kept local for resilience if emotion system not yet loaded).
    const PRIORITY = Object.freeze({
        dancing: 10,
        speakingPositive: 4,
        speakingNegative: 4,
        listening: 7,
        neutral: 3
    });

    // Mapping external (context/emotion) -> canonical state.
    function resolveState(context, emotion) {
        // Direct context mapping precedence.
        if (!context && emotion) context = emotion;
        switch (context) {
            case "dancing":
                return STATES.DANCING;
            case "listening":
                return STATES.LISTENING;
            case "speakingNegative":
                return STATES.SPEAKING_NEG;
            case "speakingPositive":
                return STATES.SPEAKING_POS;
            case "speaking": {
                if (emotion === "negative") return STATES.SPEAKING_NEG;
                return STATES.SPEAKING_POS;
            }
            default:
                break;
        }
        // Emotion-based fallback (positive/negative map to speaking variants)
        if (emotion === "negative") return STATES.SPEAKING_NEG;
        if (["positive", "romantic", "laughing", "surprise", "confident", "flirtatious", "kiss", "android", "sensual", "love"].includes(emotion))
            return STATES.SPEAKING_POS;
        return STATES.NEUTRAL;
    }

    function stateToCategory(state) {
        switch (state) {
            case STATES.SPEAKING_POS:
                return "speakingPositive";
            case STATES.SPEAKING_NEG:
                return "speakingNegative";
            case STATES.LISTENING:
                return "listening";
            case STATES.DANCING:
                return "dancing";
            case STATES.NEUTRAL:
                return "neutral";
            default:
                return "neutral";
        }
    }

    // Transition guard rules.
    // Return {allow:boolean, reason?, downgradeState?}
    function validateTransition(from, to, ctx) {
        if (from === to) return { allow: true };
        // Dancing sticky: if still inside sticky window, block except recovery.
        if (from === STATES.DANCING && ctx && ctx.now < ctx.stickyUntil) {
            return { allow: false, reason: "dancing-sticky" };
        }
        // Speaking variant switches allowed without neutral bridge.
        if ((from === STATES.SPEAKING_POS || from === STATES.SPEAKING_NEG) && (to === STATES.SPEAKING_POS || to === STATES.SPEAKING_NEG)) {
            return { allow: true };
        }
        // While speaking (sticky) block downgrade to neutral unless sticky elapsed or higher priority.
        if ((from === STATES.SPEAKING_POS || from === STATES.SPEAKING_NEG) && to === STATES.NEUTRAL && ctx && ctx.now < ctx.stickyUntil) {
            return { allow: false, reason: "speaking-sticky" };
        }
        return { allow: true };
    }

    class KimiVideoFSM {
        constructor() {
            this.currentState = STATES.NEUTRAL;
            this._stickyUntil = 0;
        }
        getState() {
            return this.currentState;
        }
        getPriority(state) {
            if (window.kimiEmotionSystem && window.kimiEmotionSystem.getPriorityWeight) {
                return window.kimiEmotionSystem.getPriorityWeight(state);
            }
            return PRIORITY[state] || 3;
        }
        // Compute sticky duration based on state & optional text length (for speaking) use same heuristic as existing manager.
        computeSticky(state, opts = {}) {
            if (state === STATES.DANCING) {
                return window.KIMI_VIDEO_CONFIG?.sticky?.dancingMs || 9500;
            }
            if (state === STATES.SPEAKING_POS || state === STATES.SPEAKING_NEG) {
                const cps = window.KIMI_VIDEO_CONFIG?.ttsCharsPerSecond || 14;
                const len = opts.utteranceLength || 0;
                const est = len
                    ? Math.min(
                          window.KIMI_VIDEO_CONFIG?.sticky?.speakingMaxMs || 16000,
                          Math.max(window.KIMI_VIDEO_CONFIG?.sticky?.speakingMinMs || 5000, Math.round((len / cps) * 1000 + 1200))
                      )
                    : window.KIMI_VIDEO_CONFIG?.sticky?.speakingMs || 15000;
                return est;
            }
            return 0;
        }
        resolve(context, emotion) {
            const st = resolveState(context, emotion);
            return { state: st, category: stateToCategory(st) };
        }
        canTransition(targetState) {
            const now = Date.now();
            const res = validateTransition(this.currentState, targetState, { now, stickyUntil: this._stickyUntil });
            return res;
        }
        transition(targetState, options = {}) {
            const evalRes = this.canTransition(targetState);
            if (!evalRes.allow) return { changed: false, reason: evalRes.reason };
            this.currentState = targetState;
            if (options.sticky) {
                this._stickyUntil = Date.now() + this.computeSticky(targetState, options);
            } else if (this._stickyUntil && Date.now() >= this._stickyUntil) {
                this._stickyUntil = 0;
            }
            return { changed: true, state: this.currentState, stickyUntil: this._stickyUntil };
        }
        force(targetState) {
            this.currentState = targetState;
            return { changed: true, forced: true, state: this.currentState };
        }
        isStickyActive() {
            return Date.now() < this._stickyUntil;
        }
        getStickyRemaining() {
            return Math.max(0, this._stickyUntil - Date.now());
        }
    }

    // Global exposure
    window.KimiVideoFSM = KimiVideoFSM;
    window.createKimiVideoFSM = function () {
        return new KimiVideoFSM();
    };
})();

export {}; // ES module no-op export for bundlers.
