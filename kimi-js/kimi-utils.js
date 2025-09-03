// CENTRALIZED KIMI UTILITIES

// Input validation and sanitization utilities
window.KimiValidationUtils = {
    validateMessage(message) {
        if (!message || typeof message !== "string") {
            return { valid: false, error: "Message must be a non-empty string" };
        }
        const trimmed = message.trim();
        if (!trimmed) return { valid: false, error: "Message cannot be empty" };
        const MAX = (window.KIMI_SECURITY_CONFIG && window.KIMI_SECURITY_CONFIG.MAX_MESSAGE_LENGTH) || 5000;
        if (trimmed.length > MAX) {
            return { valid: false, error: `Message too long (max ${MAX} characters)` };
        }
        return { valid: true, sanitized: this.escapeHtml(trimmed) };
    },
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    },
    validateRange(value, key) {
        const bounds = {
            voiceRate: { min: 0.5, max: 2, def: 1.1 },
            voicePitch: { min: 0.5, max: 2, def: 1.1 },
            voiceVolume: { min: 0, max: 1, def: 0.8 },
            llmTemperature: { min: 0, max: 1, def: 0.9 },
            llmMaxTokens: { min: 1, max: 8192, def: 400 },
            llmTopP: { min: 0, max: 1, def: 0.9 },
            llmFrequencyPenalty: { min: 0, max: 2, def: 0.9 },
            llmPresencePenalty: { min: 0, max: 2, def: 0.8 },
            interfaceOpacity: { min: 0.1, max: 1, def: 0.8 }
        };
        const b = bounds[key] || { min: 0, max: 100, def: 0 };
        const v = window.KimiSecurityUtils
            ? window.KimiSecurityUtils.validateRange(value, b.min, b.max, b.def)
            : isNaN(parseFloat(value))
              ? b.def
              : Math.max(b.min, Math.min(b.max, parseFloat(value)));
        return { value: v, clamped: v !== parseFloat(value) };
    }
};

// Provider utilities used across the app
const KimiProviderUtils = {
    getKeyPrefForProvider(provider) {
        // Each provider should have its own separate API key storage
        const providerKeys = {
            openrouter: "openrouterApiKey",
            openai: "openaiApiKey",
            groq: "groqApiKey",
            together: "togetherApiKey",
            deepseek: "deepseekApiKey",
            "openai-compatible": "customApiKey",
            ollama: null
        };
        return providerKeys[provider] || "providerApiKey";
    },
    async getApiKey(db, provider) {
        if (!db) return null;
        if (provider === "ollama") return "__local__";
        const keyPref = this.getKeyPrefForProvider(provider);
        return await db.getPreference(keyPref);
    },
    getLabelForProvider(provider) {
        const labels = {
            openrouter: "OpenRouter API Key",
            openai: "OpenAI API Key",
            groq: "Groq API Key",
            together: "Together API Key",
            deepseek: "DeepSeek API Key",
            custom: "Custom API Key",
            "openai-compatible": "API Key",
            ollama: "API Key"
        };
        return labels[provider] || "API Key";
    }
};
window.KimiProviderUtils = KimiProviderUtils;
// Shared provider placeholders used by UI and LLM manager. Keep in window for backward compatibility.
const KimiProviderPlaceholders = {
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    openai: "https://api.openai.com/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    together: "https://api.together.xyz/v1/chat/completions",
    deepseek: "https://api.deepseek.com/chat/completions",
    "openai-compatible": "",
    ollama: "http://localhost:11434/api/chat"
};
window.KimiProviderPlaceholders = KimiProviderPlaceholders;
export { KimiProviderUtils, KimiProviderPlaceholders };

// Performance utility functions for debouncing and throttling
window.KimiPerformanceUtils = {
    debounce: function (func, wait, immediate = false, context = null) {
        let timeout;
        let result;

        return function executedFunction(...args) {
            const later = () => {
                timeout = null;
                if (!immediate) {
                    result = func.apply(context || this, args);
                }
            };

            const callNow = immediate && !timeout;
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);

            if (callNow) {
                result = func.apply(context || this, args);
            }

            return result;
        };
    },

    throttle: function (func, limit, options = {}) {
        const { leading = true, trailing = true } = options;
        let inThrottle;
        let lastFunc;
        let lastRan;

        return function (...args) {
            if (!inThrottle) {
                if (leading) {
                    func.apply(this, args);
                }
                lastRan = Date.now();
                inThrottle = true;
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(
                    () => {
                        if (trailing && Date.now() - lastRan >= limit) {
                            func.apply(this, args);
                            lastRan = Date.now();
                        }
                    },
                    limit - (Date.now() - lastRan)
                );
            }

            setTimeout(() => (inThrottle = false), limit);
        };
    }
};

// Language management utilities
window.KimiLanguageUtils = {
    // Default language priority: auto -> user preference -> browser -> fr
    async getLanguage() {
        if (window.kimiDB && window.kimiDB.getPreference) {
            const userLang = await window.kimiDB.getPreference("selectedLanguage", null);
            if (userLang && userLang !== "auto") {
                return userLang;
            }
        }

        // Auto-detect from browser
        const browserLang = navigator.language?.split("-")[0] || "en";
        const supportedLangs = ["en", "fr", "es", "de", "it", "ja", "zh"];
        return supportedLangs.includes(browserLang) ? browserLang : "en";
    },

    // Auto-detect language from text content
    detectLanguage(text) {
        if (!text) return "en";

        if (/[àâäéèêëîïôöùûüÿç]/i.test(text)) return "fr";
        if (/[äöüß]/i.test(text)) return "de";
        if (/[ñáéíóúü]/i.test(text)) return "es";
        if (/[àèìòù]/i.test(text)) return "it";
        if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/i.test(text)) return "ja";
        if (/[\u4e00-\u9fff]/i.test(text)) return "zh";
        return "en";
    },
    // Normalize language codes to a primary subtag (e.g. 'en-US' -> 'en', 'us:en' -> 'en')
    normalizeLanguageCode(raw) {
        if (!raw) return "";
        try {
            let norm = String(raw).toLowerCase();
            if (norm.includes(":")) {
                const parts = norm.split(":");
                norm = parts[parts.length - 1];
            }
            norm = norm.replace("_", "-");
            if (norm.includes("-")) norm = norm.split("-")[0];
            return norm;
        } catch (e) {
            return "";
        }
    }
};

// Security and validation utilities
class KimiSecurityUtils {
    static sanitizeInput(input, type = "text") {
        if (typeof input !== "string") return "";

        switch (type) {
            case "html":
                return input
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#x27;");
            case "number":
                const num = parseFloat(input);
                return isNaN(num) ? 0 : num;
            case "integer":
                const int = parseInt(input, 10);
                return isNaN(int) ? 0 : int;
            case "url":
                try {
                    new URL(input);
                    return input;
                } catch {
                    return "";
                }
            default:
                return input.trim();
        }
    }

    static validateRange(value, min, max, defaultValue = 0) {
        const num = parseFloat(value);
        if (isNaN(num)) return defaultValue;
        return Math.max(min, Math.min(max, num));
    }

    static validateApiKey(key) {
        if (!key || typeof key !== "string") return false;
        if (window.KIMI_VALIDATORS && typeof window.KIMI_VALIDATORS.validateApiKey === "function") {
            return !!window.KIMI_VALIDATORS.validateApiKey(key.trim());
        }
        return key.trim().length > 10 && (key.startsWith("sk-") || key.startsWith("sk-or-"));
    }
}

// Cache management for better performance
class KimiCacheManager {
    constructor(maxAge = 300000) {
        // 5 minutes default
        this.cache = new Map();
        this.maxAge = maxAge;
    }

    set(key, value, customMaxAge = null) {
        const maxAge = customMaxAge || this.maxAge;
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
            maxAge
        });

        // Clean old entries periodically
        if (this.cache.size > 100) {
            this.cleanup();
        }
    }

    get(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        const now = Date.now();
        if (now - entry.timestamp > entry.maxAge) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    has(key) {
        return this.get(key) !== null;
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    cleanup() {
        const now = Date.now();
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.maxAge) {
                this.cache.delete(key);
            }
        }
    }

    getStats() {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }
}

class KimiBaseManager {
    constructor() {
        // Common base for all managers
    }

    // Utility method to format file size
    formatFileSize(bytes) {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }

    // Utility method for error handling
    handleError(error, context = "Operation") {
        console.error(`Error in ${context}:`, error);
    }

    // Utility method to wait
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Utility class for centralized video management
class KimiVideoManager {
    constructor(video1, video2, characterName = "kimi") {
        this.characterName = characterName;
        this.video1 = video1;
        this.video2 = video2;
        this.activeVideo = video1;
        this.inactiveVideo = video2;
        this.currentContext = "neutral";
        this.currentEmotion = "neutral";
        this.lastSwitchTime = Date.now();
        this.pendingSwitch = null;
        this.autoTransitionDuration = 9900;
        this.transitionDuration = 300;
        this._prefetchCache = new Map();
        this._prefetchInFlight = new Set();
        this._maxPrefetch = 3;
        this._loadTimeout = null;
        this.updateVideoCategories();
        // Use centralized emotion mapping from emotion system
        this.emotionToCategory = null; // Will be fetched from emotion system when needed
        this.positiveVideos = this.videoCategories.speakingPositive;
        this.negativeVideos = this.videoCategories.speakingNegative;
        this.neutralVideos = this.videoCategories.neutral;

        // Anti-repetition and scoring - Adaptive history based on available videos
        this.playHistory = {
            listening: [],
            speakingPositive: [],
            speakingNegative: [],
            neutral: [],
            dancing: []
        };
        this.maxHistoryPerCategory = 5; // Will be dynamically adjusted per category

        this.emotionHistory = [];
        this.maxEmotionHistory = 5;
        this._neutralLock = false;
        this.isEmotionVideoPlaying = false;
        this.currentEmotionContext = null;
        this._switchInProgress = false;
        this._loadingInProgress = false;
        this._currentLoadHandler = null;
        this._currentErrorHandler = null;
        this._stickyContext = null;
        this._stickyUntil = 0;
        this._pendingSwitches = [];
        this._debug = false;
        // Adaptive timeout refinements (A+B+C)
        this._maxTimeout = 6000; // Reduced upper bound (was 10000) for 10s clips
        this._timeoutExtension = 1200; // Extension when metadata only
        this._timeoutCapRatio = 0.7; // Cap total wait <= 70% clip length
        // Initialize adaptive loading metrics and failure tracking
        this._avgLoadTime = null;
        this._loadTimeSamples = [];
        this._maxSamples = 10;
        this._minTimeout = 3000;
        this._recentFailures = new Map();
        this._failureCooldown = 5000;
        this._consecutiveErrorCount = 0;
    }

    //Centralized crossfade transition between two videos.
    static crossfadeVideos(fromVideo, toVideo, duration = 300, onComplete) {
        // Resolve duration from CSS variable if present
        try {
            const cssDur = getComputedStyle(document.documentElement).getPropertyValue("--video-fade-duration").trim();
            if (cssDur) {
                // Convert CSS time to ms number if needed (e.g., '300ms' or '0.3s')
                if (cssDur.endsWith("ms")) duration = parseFloat(cssDur);
                else if (cssDur.endsWith("s")) duration = Math.round(parseFloat(cssDur) * 1000);
            }
        } catch {}

        // Preload and strict synchronization
        const easing = "ease-in-out";
        fromVideo.style.transition = `opacity ${duration}ms ${easing}`;
        toVideo.style.transition = `opacity ${duration}ms ${easing}`;
        // Prepare target video (opacity 0, top z-index)
        toVideo.style.opacity = "0";
        toVideo.style.zIndex = "2";
        fromVideo.style.zIndex = "1";

        // Start target video slightly before the crossfade
        const startTarget = () => {
            if (toVideo.paused) toVideo.play().catch(() => {});
            // Lance le fondu croisé
            setTimeout(() => {
                fromVideo.style.opacity = "0";
                toVideo.style.opacity = "1";
            }, 20);
            // After transition, adjust z-index and call the callback
            setTimeout(() => {
                fromVideo.style.zIndex = "1";
                toVideo.style.zIndex = "2";
                if (onComplete) onComplete();
            }, duration + 30);
        };

        // If target video is not ready, wait for canplay
        if (toVideo.readyState < 3) {
            toVideo.addEventListener("canplay", startTarget, { once: true });
            toVideo.load();
        } else {
            startTarget();
        }
        // Ensure source video is playing
        if (fromVideo.paused) fromVideo.play().catch(() => {});
    }

    //Centralized video element creation utility.
    static createVideoElement(id, className = "bg-video") {
        const video = document.createElement("video");
        video.id = id;
        video.className = className;
        video.autoplay = true;
        video.muted = true;
        video.playsinline = true;
        video.preload = "auto";
        video.style.opacity = "0";
        video.innerHTML =
            '<source src="" type="video/mp4" /><span data-i18n="video_not_supported">Your browser does not support the video tag.</span>';
        return video;
    }

    //Centralized video selection utility.
    static getVideoElement(selector) {
        if (typeof selector === "string") {
            if (selector.startsWith("#")) {
                return document.getElementById(selector.slice(1));
            }
            return document.querySelector(selector);
        }
        return selector;
    }

    setDebug(enabled) {
        this._debug = !!enabled;
    }

    _logDebug(message, payload = null) {
        if (!this._debug) return;
        if (payload) console.log("🎬 VideoManager:", message, payload);
        else console.log("🎬 VideoManager:", message);
    }

    _logSelection(category, selectedSrc, candidates = []) {
        if (!this._debug) return;
        const recent = (this.playHistory && this.playHistory[category]) || [];
        const adaptive = typeof this.getAdaptiveHistorySize === "function" ? this.getAdaptiveHistorySize(category) : null;
        console.log("🎬 VideoManager: selection", {
            category,
            selected: selectedSrc,
            candidatesCount: Array.isArray(candidates) ? candidates.length : 0,
            adaptiveHistorySize: adaptive,
            recentHistory: recent
        });
    }

    debugPrintHistory(category = null) {
        if (!this._debug) return;
        if (!this.playHistory) {
            console.log("🎬 VideoManager: no play history yet");
            return;
        }
        if (category) {
            const recent = this.playHistory[category] || [];
            console.log("🎬 VideoManager: history", { category, recent });
            return;
        }
        const summary = Object.keys(this.playHistory).reduce((acc, key) => {
            acc[key] = this.playHistory[key];
            return acc;
        }, {});
        console.log("🎬 VideoManager: history summary", summary);
    }

    _priorityWeight(context) {
        if (context === "speaking" || context === "speakingPositive" || context === "speakingNegative") return 3;
        if (context === "dancing" || context === "listening") return 2;
        return 1;
    }

    _enqueuePendingSwitch(req) {
        // Keep small bounded list; prefer newest higher-priority
        const maxSize = 5;
        this._pendingSwitches.push(req);
        if (this._pendingSwitches.length > maxSize) {
            this._pendingSwitches = this._pendingSwitches.slice(-maxSize);
        }
    }

    _takeNextPendingSwitch() {
        if (!this._pendingSwitches.length) return null;
        let bestIdx = 0;
        let best = this._pendingSwitches[0];
        for (let i = 1; i < this._pendingSwitches.length; i++) {
            const cand = this._pendingSwitches[i];
            if (cand.priorityWeight > best.priorityWeight) {
                best = cand;
                bestIdx = i;
            } else if (cand.priorityWeight === best.priorityWeight && cand.requestedAt > best.requestedAt) {
                best = cand;
                bestIdx = i;
            }
        }
        this._pendingSwitches.splice(bestIdx, 1);
        return best;
    }

    _processPendingSwitches() {
        if (this._stickyContext === "dancing") return false;
        const next = this._takeNextPendingSwitch();
        if (!next) return false;
        this._logDebug("Processing pending switch", next);
        this.switchToContext(next.context, next.emotion, next.specificVideo, next.traits, next.affection);
        return true;
    }

    setCharacter(characterName) {
        this.characterName = characterName;

        // Nettoyer les handlers en cours lors du changement de personnage
        this._cleanupLoadingHandlers();
        // Reset per-character fallback pool so it will be rebuilt for the new character
        this._fallbackPool = null;
        this._fallbackIndex = 0;
        this._fallbackPoolCharacter = null;

        this.updateVideoCategories();
    }

    updateVideoCategories() {
        const folder = getCharacterInfo(this.characterName).videoFolder;
        this.videoCategories = {
            listening: [
                `${folder}listening/listening-gentle-sway.mp4`,
                `${folder}listening/listening-magnetic-eye-gaze.mp4`,
                `${folder}listening/listening-silky-caressing-hairplay.mp4`,
                `${folder}listening/listening-softly-velvet-glance.mp4`,
                `${folder}listening/listening-surprise-sweet-shiver.mp4`,
                `${folder}listening/listening-whispered-attention.mp4`,
                `${folder}listening/listening-hand-gesture.mp4`,
                `${folder}listening/listening-hair-touch.mp4`,
                `${folder}listening/listening-full-spin.mp4`,
                `${folder}listening/listening-teasing-smile.mp4`,
                `${folder}listening/listening-dreamy-gaze-romantic.mp4`
            ],
            speakingPositive: [
                `${folder}speaking-positive/speaking-happy-gestures.mp4`,
                `${folder}speaking-positive/speaking-positive-heartfelt-shine.mp4`,
                `${folder}speaking-positive/speaking-positive-joyful-flutter.mp4`,
                `${folder}speaking-positive/speaking-positive-mischief-touch.mp4`,
                `${folder}speaking-positive/speaking-positive-sparkling-tease.mp4`,
                `${folder}speaking-positive/speaking-playful-wink.mp4`,
                `${folder}speaking-positive/speaking-excited-clapping.mp4`,
                `${folder}speaking-positive/speaking-heart-gesture.mp4`,
                `${folder}speaking-positive/speaking-surprise-graceful-gasp.mp4`,
                `${folder}speaking-positive/speaking-laughing-melodious.mp4`,
                `${folder}speaking-positive/speaking-gentle-smile.mp4`,
                `${folder}speaking-positive/speaking-graceful-arms.mp4`,
                `${folder}speaking-positive/speaking-flirtatious-tease.mp4`
            ],
            speakingNegative: [
                `${folder}speaking-negative/speaking-negative-anxious-caress.mp4`,
                `${folder}speaking-negative/speaking-negative-frosted-glance.mp4`,
                `${folder}speaking-negative/speaking-negative-muted-longing.mp4`,
                `${folder}speaking-negative/speaking-negative-shadowed-sigh.mp4`,
                `${folder}speaking-negative/speaking-sad-elegant.mp4`,
                `${folder}speaking-negative/speaking-frustrated-graceful.mp4`,
                `${folder}speaking-negative/speaking-worried-tender.mp4`,
                `${folder}speaking-negative/speaking-disappointed-elegant.mp4`,
                `${folder}speaking-negative/speaking-gentle-wave-goodbye.mp4`
            ],
            neutral: [
                `${folder}neutral/neutral-thinking-pose.mp4`,
                `${folder}neutral/neutral-shy-blush-adorable.mp4`,
                `${folder}neutral/neutral-confident-chic-flair.mp4`,
                `${folder}neutral/neutral-dreamy-soft-reverie.mp4`,
                `${folder}neutral/neutral-flirt-wink-whisper.mp4`,
                `${folder}neutral/neutral-goodbye-tender-wave.mp4`,
                `${folder}neutral/neutral-hair-twirl.mp4`,
                `${folder}neutral/neutral-kiss-air-caress.mp4`,
                `${folder}neutral/neutral-poised-shift.mp4`,
                `${folder}neutral/neutral-shy-blush-glow.mp4`,
                `${folder}neutral/neutral-speaking-dreamy-flow.mp4`,
                `${folder}neutral/neutral-gentle-breathing.mp4`,
                `${folder}neutral/neutral-hair-adjustment.mp4`,
                `${folder}neutral/neutral-arms-crossed-elegant.mp4`,
                `${folder}neutral/neutral-seductive-slow-gaze.mp4`,
                `${folder}neutral/neutral-confident-pose-alluring.mp4`,
                `${folder}neutral/neutral-affectionate-kiss-blow.mp4`
            ],
            dancing: [
                `${folder}dancing/dancing-chin-hand.mp4`,
                `${folder}dancing/dancing-bow-promise.mp4`,
                `${folder}dancing/dancing-enchanting-flow.mp4`,
                `${folder}dancing/dancing-magnetic-spin.mp4`,
                `${folder}dancing/dancing-playful-glimmer.mp4`,
                `${folder}dancing/dancing-silken-undulation.mp4`,
                `${folder}dancing/dancing-full-spin.mp4`,
                `${folder}dancing/dancing-seductive-dance-undulation.mp4`,
                `${folder}dancing/dancing-slow-seductive.mp4`,
                `${folder}dancing/dancing-spinning-elegance-twirl.mp4`
            ]
        };
        this.positiveVideos = this.videoCategories.speakingPositive;
        this.negativeVideos = this.videoCategories.speakingNegative;
        this.neutralVideos = this.videoCategories.neutral;

        const neutrals = this.neutralVideos || [];
        // Progressive warm-up phase: start with only 2 neutrals (adaptive on network), others scheduled later
        let neutralPrefetchCount = 2;
        try {
            const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
            if (conn && conn.effectiveType) {
                // Reduce on slower connections
                if (/2g/i.test(conn.effectiveType)) neutralPrefetchCount = 1;
                else if (/3g/i.test(conn.effectiveType)) neutralPrefetchCount = 2;
            }
        } catch {}
        neutrals.slice(0, neutralPrefetchCount).forEach(src => this._prefetch(src));

        // Schedule warm-up step 2: after 5s prefetch the 3rd neutral if not already cached
        if (!this._warmupTimer) {
            this._warmupTimer = setTimeout(() => {
                try {
                    const target = neutrals[2];
                    if (target && !this._prefetchCache.has(target)) this._prefetch(target);
                } catch {}
            }, 5000);
        }

        // Mark waiting for first interaction to fetch 4th neutral later
        this._awaitingFirstInteraction = true;
    }

    async init(database = null) {
        // Attach lightweight visibility guard
        if (!this._visibilityHandler) {
            this._visibilityHandler = this.onVisibilityChange.bind(this);
            document.addEventListener("visibilitychange", this._visibilityHandler);
        }
        // Hook basic user interaction (first click / keypress) to advance warm-up
        if (!this._firstInteractionHandler) {
            this._firstInteractionHandler = () => {
                if (this._awaitingFirstInteraction) {
                    this._awaitingFirstInteraction = false;
                    try {
                        const neutrals = this.neutralVideos || [];
                        const fourth = neutrals[3];
                        if (fourth && !this._prefetchCache.has(fourth)) this._prefetch(fourth);
                    } catch {}
                }
            };
            window.addEventListener("click", this._firstInteractionHandler, { once: true });
            window.addEventListener("keydown", this._firstInteractionHandler, { once: true });
        }
    }

    onVisibilityChange() {
        if (document.visibilityState !== "visible") return;
        const v = this.activeVideo;
        if (!v) return;
        try {
            if (v.ended) {
                if (typeof this.returnToNeutral === "function") this.returnToNeutral();
            } else if (v.paused) {
                v.play().catch(() => {
                    if (typeof this.returnToNeutral === "function") this.returnToNeutral();
                });
            }
        } catch {}
    }

    // Intelligent contextual management
    switchToContext(context, emotion = "neutral", specificVideo = null, traits = null, affection = null) {
        // Respect sticky context (avoid overrides while dancing is requested/playing)
        if (this._stickyContext === "dancing" && context !== "dancing") {
            const categoryForPriority = this.determineCategory(context, emotion, traits);
            const priorityWeight = this._priorityWeight(
                categoryForPriority === "speakingPositive" || categoryForPriority === "speakingNegative" ? "speaking" : context
            );
            if (Date.now() < (this._stickyUntil || 0)) {
                this._enqueuePendingSwitch({
                    context,
                    emotion,
                    specificVideo,
                    traits,
                    affection,
                    requestedAt: Date.now(),
                    priorityWeight
                });
                this._logDebug("Queued during dancing (sticky)", { context, emotion, priorityWeight });
                return;
            }
            this._stickyContext = null;
            this._stickyUntil = 0;
            // Do not reset adaptive loading metrics here; preserve rolling stats across sticky context release
        }
        // While an emotion video is playing (speaking), block non-speaking context switches
        if (
            this.isEmotionVideoPlaying &&
            (this.currentContext === "speaking" ||
                this.currentContext === "speakingPositive" ||
                this.currentContext === "speakingNegative") &&
            !(context === "speaking" || context === "speakingPositive" || context === "speakingNegative")
        ) {
            // Queue the request with appropriate priority to be processed after current clip
            const categoryForPriority = this.determineCategory(context, emotion, traits);
            const priorityWeight = this._priorityWeight(
                categoryForPriority === "speakingPositive" || categoryForPriority === "speakingNegative" ? "speaking" : context
            );
            this._enqueuePendingSwitch({
                context,
                emotion,
                specificVideo,
                traits,
                affection,
                requestedAt: Date.now(),
                priorityWeight
            });
            this._logDebug("Queued non-speaking during speaking emotion", { context, emotion, priorityWeight });
            return;
        }

        // While speaking emotion video is playing, also queue speaking→speaking changes (avoid mid-clip replacement)
        if (
            this.isEmotionVideoPlaying &&
            (this.currentContext === "speaking" ||
                this.currentContext === "speakingPositive" ||
                this.currentContext === "speakingNegative") &&
            (context === "speaking" || context === "speakingPositive" || context === "speakingNegative") &&
            this.currentEmotionContext &&
            this.currentEmotionContext !== emotion
        ) {
            const priorityWeight = this._priorityWeight("speaking");
            this._enqueuePendingSwitch({
                context,
                emotion,
                specificVideo,
                traits,
                affection,
                requestedAt: Date.now(),
                priorityWeight
            });
            this._logDebug("Queued speaking→speaking during active emotion", { from: this.currentEmotionContext, to: emotion });
            return;
        }
        if (context === "neutral" && this._neutralLock) return;
        if (
            (context === "speaking" || context === "speakingPositive" || context === "speakingNegative") &&
            this.isEmotionVideoPlaying &&
            this.currentEmotionContext === emotion
        )
            return;

        if (this.currentContext === context && this.currentEmotion === emotion && !specificVideo) {
            const category = this.determineCategory(context, emotion, traits);
            const currentVideoSrc = this.activeVideo.querySelector("source").getAttribute("src");
            const availableVideos = this.videoCategories[category] || this.videoCategories.neutral;
            const differentVideos = availableVideos.filter(v => v !== currentVideoSrc);

            if (differentVideos.length > 0) {
                const nextVideo =
                    typeof this._pickScoredVideo === "function"
                        ? this._pickScoredVideo(category, differentVideos, traits)
                        : differentVideos[Math.floor(Math.random() * differentVideos.length)];
                this.loadAndSwitchVideo(nextVideo, "normal");
                // Track play history to avoid immediate repeats
                if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, nextVideo);
                this._logSelection(category, nextVideo, differentVideos);
                this.lastSwitchTime = Date.now();
            }
            return;
        }

        // Determine the category FIRST to ensure correct video selection
        const category = this.determineCategory(context, emotion, traits);

        // Déterminer la priorité selon le contexte
        let priority = "normal";
        if (context === "speaking" || context === "speakingPositive" || context === "speakingNegative") {
            priority = "speaking";
        } else if (context === "dancing" || context === "listening") {
            priority = "high";
        }

        // Set sticky lock for dancing to avoid being interrupted by emotion/neutral updates
        if (context === "dancing") {
            this._stickyContext = "dancing";
            // Lock roughly for one clip duration; will also be cleared on end/neutral
            this._stickyUntil = Date.now() + 9500;
        }

        // Chemin optimisé lorsque TTS parle/écoute (évite clignotements)
        if (
            window.voiceManager &&
            window.voiceManager.isSpeaking &&
            (context === "speaking" || context === "speakingPositive" || context === "speakingNegative")
        ) {
            const speakingPath = this.selectOptimalVideo(category, specificVideo, traits, affection, emotion);
            const speakingCurrent = this.activeVideo.querySelector("source").getAttribute("src");
            if (speakingCurrent !== speakingPath || this.activeVideo.ended) {
                this.loadAndSwitchVideo(speakingPath, priority);
            }
            // IMPORTANT: normalize to the resolved category (e.g., speakingPositive/Negative)
            this.currentContext = category;
            this.currentEmotion = emotion;
            this.lastSwitchTime = Date.now();
            return;
        }
        if (window.voiceManager && window.voiceManager.isListening && context === "listening") {
            const listeningPath = this.selectOptimalVideo(category, specificVideo, traits, affection, emotion);
            const listeningCurrent = this.activeVideo.querySelector("source").getAttribute("src");
            if (listeningCurrent !== listeningPath || this.activeVideo.ended) {
                this.loadAndSwitchVideo(listeningPath, priority);
            }
            // Normalize to category for consistency
            this.currentContext = category;
            this.currentEmotion = emotion;
            this.lastSwitchTime = Date.now();
            return;
        }

        // Sélection standard
        let videoPath = this.selectOptimalVideo(category, specificVideo, traits, affection, emotion);
        const currentVideoSrc = this.activeVideo.querySelector("source").getAttribute("src");

        // Anti-répétition si plusieurs vidéos disponibles
        if (videoPath === currentVideoSrc && (this.videoCategories[category] || []).length > 1) {
            const alternatives = this.videoCategories[category].filter(v => v !== currentVideoSrc);
            if (alternatives.length > 0) {
                videoPath =
                    typeof this._pickScoredVideo === "function"
                        ? this._pickScoredVideo(category, alternatives, traits)
                        : alternatives[Math.floor(Math.random() * alternatives.length)];
            }
        }

        // Adaptive transition timing based on context and priority
        let minTransitionDelay = 300;

        const now = Date.now();
        const timeSinceLastSwitch = now - (this.lastSwitchTime || 0);

        // Context-specific timing adjustments
        if (priority === "speaking") {
            minTransitionDelay = 200;
        } else if (context === "listening") {
            minTransitionDelay = 250;
        } else if (context === "dancing") {
            minTransitionDelay = 600;
        } else if (context === "neutral") {
            minTransitionDelay = 1200;
        }

        // Prevent rapid switching only if not critical
        if (
            this.currentContext === context &&
            this.currentEmotion === emotion &&
            currentVideoSrc === videoPath &&
            !this.activeVideo.paused &&
            !this.activeVideo.ended &&
            timeSinceLastSwitch < minTransitionDelay &&
            priority !== "speaking" // Always allow speech to interrupt
        ) {
            return;
        }

        this._prefetchLikely(category);

        this.loadAndSwitchVideo(videoPath, priority);
        // Always store normalized category as currentContext so event bindings match speakingPositive/Negative
        this.currentContext = category;
        this.currentEmotion = emotion;
        this.lastSwitchTime = now;
    }

    setupEventListenersForContext(context) {
        // Clean previous
        if (this._globalEndedHandler) {
            this.activeVideo.removeEventListener("ended", this._globalEndedHandler);
            this.inactiveVideo.removeEventListener("ended", this._globalEndedHandler);
        }

        // Defensive: ensure helpers exist
        if (!this.playHistory) this.playHistory = {};
        if (!this.maxHistoryPerCategory) this.maxHistoryPerCategory = 8;

        // For dancing: auto-return to neutral after video ends to avoid freeze
        if (context === "dancing") {
            this._globalEndedHandler = () => {
                this._stickyContext = null;
                this._stickyUntil = 0;
                if (!this._processPendingSwitches()) {
                    this.returnToNeutral();
                }
            };
            this.activeVideo.addEventListener("ended", this._globalEndedHandler, { once: true });
            // Safety timer
            if (typeof this.scheduleAutoTransition === "function") {
                this.scheduleAutoTransition(this.autoTransitionDuration || 10000);
            }
            return;
        }

        if (context === "speakingPositive" || context === "speakingNegative") {
            this._globalEndedHandler = () => {
                // If TTS is still speaking, keep the speaking flow by chaining another speaking clip
                if (window.voiceManager && window.voiceManager.isSpeaking) {
                    const emotion = this.currentEmotion || this.currentEmotionContext || "positive";
                    // Preserve speaking context while chaining
                    const category = emotion === "negative" ? "speakingNegative" : "speakingPositive";
                    const next = this.selectOptimalVideo(category, null, null, null, emotion);
                    if (next) {
                        this.loadAndSwitchVideo(next, "speaking");
                        this.currentContext = category;
                        this.currentEmotion = emotion;
                        this.isEmotionVideoPlaying = true;
                        this.currentEmotionContext = emotion;
                        this.lastSwitchTime = Date.now();
                        return;
                    }
                }
                // Otherwise, allow pending high-priority switch or return to neutral
                this.isEmotionVideoPlaying = false;
                this.currentEmotionContext = null;
                this._neutralLock = false;
                if (!this._processPendingSwitches()) {
                    this.returnToNeutral();
                }
            };
            this.activeVideo.addEventListener("ended", this._globalEndedHandler, { once: true });
            return;
        }

        if (context === "listening") {
            this._globalEndedHandler = () => {
                this.switchToContext("listening", "listening");
            };
            this.activeVideo.addEventListener("ended", this._globalEndedHandler, { once: true });
            return;
        }

        // Neutral: on end, pick another neutral to avoid static last frame
        if (context === "neutral") {
            this._globalEndedHandler = () => this.returnToNeutral();
            this.activeVideo.addEventListener("ended", this._globalEndedHandler, { once: true });
        }
    }

    // keep only the augmented determineCategory above (with traits)
    selectOptimalVideo(category, specificVideo = null, traits = null, affection = null, emotion = null) {
        const availableVideos = this.videoCategories[category] || this.videoCategories.neutral;

        if (specificVideo && availableVideos.includes(specificVideo)) {
            if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, specificVideo);
            this._logSelection(category, specificVideo, availableVideos);
            return specificVideo;
        }

        const currentVideoSrc = this.activeVideo.querySelector("source").getAttribute("src");

        // Filter out recently played videos using adaptive history
        const recentlyPlayed = this.playHistory[category] || [];
        let candidateVideos = availableVideos.filter(video => video !== currentVideoSrc && !recentlyPlayed.includes(video));

        // If no fresh videos, allow recently played but not current
        if (candidateVideos.length === 0) {
            candidateVideos = availableVideos.filter(video => video !== currentVideoSrc);
        }

        // Ultimate fallback
        if (candidateVideos.length === 0) {
            candidateVideos = availableVideos;
        }

        // Ensure we're not falling back to wrong category
        if (candidateVideos.length === 0) {
            candidateVideos = this.videoCategories.neutral;
        }

        // If traits and affection are provided, weight the selection more subtly
        if (traits && typeof affection === "number") {
            let weights = candidateVideos.map(video => {
                if (category === "speakingPositive") {
                    // Positive videos favored by affection, romance, and humor
                    const base = 1 + (affection / 100) * 0.4; // Affection influence factor
                    let bonus = 0;
                    const rom = typeof traits.romance === "number" ? traits.romance : 50;
                    const hum = typeof traits.humor === "number" ? traits.humor : 50;
                    if (emotion === "romantic") bonus += (rom / 100) * 0.3; // Romance context bonus
                    if (emotion === "laughing") bonus += (hum / 100) * 0.3; // Humor context bonus
                    return base + bonus;
                }
                if (category === "speakingNegative") {
                    // Negative videos when affection is low (reduced weight to balance)
                    return 1 + ((100 - affection) / 100) * 0.3; // Low-affection influence factor
                }
                if (category === "neutral") {
                    // Neutral videos when affection is moderate, also influenced by intelligence
                    const distance = Math.abs(50 - affection) / 50; // 0 at 50, 1 at 0 or 100
                    const intBonus = ((traits.intelligence || 50) / 100) * 0.1; // Intelligence adds to neutral thoughtfulness
                    return 1 + (1 - Math.min(1, distance)) * 0.2 + intBonus;
                }
                if (category === "dancing") {
                    // Dancing strongly influenced by playfulness, romance also adds excitement
                    const playBonus = Math.min(0.6, (traits.playfulness / 100) * 0.7);
                    const romanceBonus = ((traits.romance || 50) / 100) * 0.2; // Romance adds to dance appeal
                    return 1 + playBonus + romanceBonus;
                }
                if (category === "listening") {
                    // Listening influenced by empathy, intelligence, and affection
                    const empathyWeight = (traits.empathy || 50) / 100;
                    const intWeight = ((traits.intelligence || 50) / 100) * 0.1; // Intelligence improves listening quality
                    return 1 + empathyWeight * 0.3 + (affection / 100) * 0.1 + intWeight;
                }
                return 1;
            });

            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            for (let i = 0; i < candidateVideos.length; i++) {
                if (r < weights[i]) {
                    const chosen = candidateVideos[i];
                    if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, chosen);
                    this._logSelection(category, chosen, candidateVideos);
                    return chosen;
                }
                r -= weights[i];
            }
            const selectedVideo = candidateVideos[0];
            if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, selectedVideo);
            this._logSelection(category, selectedVideo, candidateVideos);
            return selectedVideo;
        }

        // No traits weighting: random pick
        if (candidateVideos.length === 0) {
            return availableVideos && availableVideos[0] ? availableVideos[0] : null;
        }
        const selectedVideo = candidateVideos[Math.floor(Math.random() * candidateVideos.length)];
        if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, selectedVideo);
        this._logSelection(category, selectedVideo, candidateVideos);
        return selectedVideo;
    }

    // Get adaptive history size based on available videos
    getAdaptiveHistorySize(category) {
        const availableVideos = this.videoCategories[category] || [];
        const videoCount = availableVideos.length;

        // Adaptive history: keep 40-60% of available videos in history
        // Minimum 2, maximum 8 to prevent extreme cases
        if (videoCount <= 3) return Math.max(1, videoCount - 1);
        if (videoCount <= 6) return Math.max(2, Math.floor(videoCount * 0.5));
        return Math.min(8, Math.floor(videoCount * 0.6));
    }

    // Update history with adaptive sizing
    updatePlayHistory(category, videoPath) {
        if (!this.playHistory[category]) {
            this.playHistory[category] = [];
        }

        const adaptiveSize = this.getAdaptiveHistorySize(category);
        this.playHistory[category].push(videoPath);

        // Trim to adaptive size
        if (this.playHistory[category].length > adaptiveSize) {
            this.playHistory[category] = this.playHistory[category].slice(-adaptiveSize);
        }
    }

    // Ensure determineCategory exists as a class method (used at line ~494 and ~537)
    determineCategory(context, emotion = "neutral", traits = null) {
        // Get emotion mapping from centralized emotion system
        const emotionToCategory = window.kimiEmotionSystem?.emotionToVideoCategory || {
            listening: "listening",
            positive: "speakingPositive",
            negative: "speakingNegative",
            neutral: "neutral",
            surprise: "speakingPositive",
            laughing: "speakingPositive",
            shy: "neutral",
            confident: "speakingPositive",
            romantic: "speakingPositive",
            flirtatious: "speakingPositive",
            goodbye: "neutral",
            kiss: "speakingPositive",
            dancing: "dancing",
            speaking: "speakingPositive",
            speakingPositive: "speakingPositive",
            speakingNegative: "speakingNegative"
        };

        // Prefer explicit context mapping if provided (e.g., 'listening','dancing')
        if (emotionToCategory[context]) {
            return emotionToCategory[context];
        }
        // Normalize generic 'speaking' by emotion polarity
        if (context === "speaking") {
            if (emotion === "positive") return "speakingPositive";
            if (emotion === "negative") return "speakingNegative";
            return "neutral";
        }
        // Map by emotion label when possible
        if (emotionToCategory[emotion]) {
            return emotionToCategory[emotion];
        }
        return "neutral";
    }

    // SPECIALIZED METHODS FOR EACH CONTEXT
    async startListening(traits = null, affection = null) {
        // If already listening and playing, avoid redundant switch
        if (this.currentContext === "listening" && !this.activeVideo.paused && !this.activeVideo.ended) {
            return;
        }
        // Immediate switch to keep UI responsive
        this.switchToContext("listening");

        // Add a short grace window to prevent immediate switch to speaking before TTS starts
        clearTimeout(this._listeningGraceTimer);
        this._listeningGraceTimer = setTimeout(() => {
            // No-op; used as a time marker to let LLM prepare the answer
        }, 1500);

        // If caller did not provide traits, try to fetch and refine selection
        try {
            if (!traits && window.kimiDB && typeof window.kimiDB.getAllPersonalityTraits === "function") {
                const selectedCharacter = await window.kimiDB.getSelectedCharacter();
                const allTraits = await window.kimiDB.getAllPersonalityTraits(selectedCharacter);
                if (allTraits && typeof allTraits === "object") {
                    const aff = typeof allTraits.affection === "number" ? allTraits.affection : undefined;
                    // Re-issue context switch with weighting parameters to better pick listening videos
                    this.switchToContext("listening", "listening", null, allTraits, aff);
                }
            } else if (traits) {
                this.switchToContext("listening", "listening", null, traits, affection);
            }
        } catch (e) {
            // Non-fatal: keep basic listening behavior
            console.warn("Listening refinement skipped due to error:", e);
        }
    }

    respondWithEmotion(emotion, traits = null, affection = null) {
        // Ignore neutral emotion to avoid unintended overrides (use returnToNeutral when appropriate)
        if (emotion === "neutral") {
            if (this._stickyContext === "dancing" || this.currentContext === "dancing") return;
            this.returnToNeutral();
            return;
        }
        // Do not override dancing while sticky
        if (this._stickyContext === "dancing" || this.currentContext === "dancing") return;
        // If we are already playing the same emotion video, do nothing
        if (this.isEmotionVideoPlaying && this.currentEmotionContext === emotion) return;
        // If we just entered listening and TTS isn’t started yet, wait a bit to avoid desync
        const now = Date.now();
        const stillInGrace = this._listeningGraceTimer != null;
        const ttsNotStarted = !(window.voiceManager && window.voiceManager.isSpeaking);
        if (this.currentContext === "listening" && stillInGrace && ttsNotStarted) {
            clearTimeout(this._pendingSpeakSwitch);
            this._pendingSpeakSwitch = setTimeout(() => {
                // Re-check speaking state; only switch when we have an actual emotion to play alongside TTS
                if (window.voiceManager && window.voiceManager.isSpeaking) {
                    this.switchToContext("speaking", emotion, null, traits, affection);
                    this.isEmotionVideoPlaying = true;
                    this.currentEmotionContext = emotion;
                }
            }, 900);
            return;
        }

        // First switch context (so internal guards don't see the new flags yet)
        this.switchToContext("speaking", emotion, null, traits, affection);
        // Then mark the emotion video as playing for override protection
        this.isEmotionVideoPlaying = true;
        this.currentEmotionContext = emotion;
    }

    returnToNeutral() {
        // Always ensure we resume playback with a fresh neutral video to avoid freeze
        if (this._neutralLock) return;
        this._neutralLock = true;
        setTimeout(() => {
            this._neutralLock = false;
        }, 1000);
        this._stickyContext = null;
        this._stickyUntil = 0;
        this.isEmotionVideoPlaying = false;
        this.currentEmotionContext = null;

        // Si la voix est encore en cours, relancer une vidéo neutre en boucle
        const category = "neutral";
        const currentVideoSrc = this.activeVideo.querySelector("source").getAttribute("src");
        const available = this.videoCategories[category] || [];
        let nextSrc = null;
        if (available.length > 0) {
            const candidates = available.filter(v => v !== currentVideoSrc);
            nextSrc =
                candidates.length > 0
                    ? candidates[Math.floor(Math.random() * candidates.length)]
                    : available[Math.floor(Math.random() * available.length)];
        }
        if (nextSrc) {
            this.loadAndSwitchVideo(nextSrc, "normal");
            if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, nextSrc);
            this.currentContext = "neutral";
            this.currentEmotion = "neutral";
            this.lastSwitchTime = Date.now();
            // Si la voix est encore en cours, s'assurer qu'on relance une vidéo neutre à la fin
            if (window.voiceManager && window.voiceManager.isSpeaking) {
                this.activeVideo.addEventListener(
                    "ended",
                    () => {
                        if (window.voiceManager && window.voiceManager.isSpeaking) {
                            this.returnToNeutral();
                        }
                    },
                    { once: true }
                );
            }
        } else {
            // Fallback to existing path if list empty
            this.switchToContext("neutral");
        }
    }

    // ADVANCED CONTEXTUAL ANALYSIS
    async analyzeAndSelectVideo(userMessage, kimiResponse, emotionAnalysis, traits = null, affection = null, lang = null) {
        // Do not analyze-switch away while dancing is sticky/playing
        if (this._stickyContext === "dancing" || this.currentContext === "dancing") {
            return; // let dancing finish
        }
        // Auto-detect language if not specified
        let userLang = lang;
        if (!userLang && window.kimiDB && window.kimiDB.getPreference) {
            userLang = await window.KimiLanguageUtils.getLanguage();
        }

        // Use existing emotion analysis instead of creating new system
        let detectedEmotion = "neutral";
        if (window.kimiAnalyzeEmotion) {
            // Analyze combined user message and Kimi response using existing function
            const combinedText = [userMessage, kimiResponse].filter(Boolean).join(" ");
            detectedEmotion = window.kimiAnalyzeEmotion(combinedText, userLang);
            console.log(`🎭 Emotion detected: "${detectedEmotion}" from text: "${combinedText.substring(0, 50)}..."`);
        } else if (emotionAnalysis && emotionAnalysis.reaction) {
            // Fallback to provided emotion analysis
            detectedEmotion = emotionAnalysis.reaction;
        }

        // Special case: Auto-dancing if playfulness high (more accessible)
        if (traits && typeof traits.playfulness === "number" && traits.playfulness >= 75) {
            this.switchToContext("dancing", "dancing", null, traits, affection);
            return;
        }

        // Add to emotion history
        this.emotionHistory.push(detectedEmotion);
        if (this.emotionHistory.length > this.maxEmotionHistory) {
            this.emotionHistory.shift();
        }

        // Analyze emotion trend - support all possible emotions
        const counts = {
            positive: 0,
            negative: 0,
            neutral: 0,
            dancing: 0,
            listening: 0,
            romantic: 0,
            laughing: 0,
            surprise: 0,
            confident: 0,
            shy: 0,
            flirtatious: 0,
            kiss: 0,
            goodbye: 0
        };
        for (let i = 0; i < this.emotionHistory.length; i++) {
            const emo = this.emotionHistory[i];
            if (counts[emo] !== undefined) counts[emo]++;
        }

        // Find dominant emotion
        let dominant = null;
        let max = 0;
        for (const key in counts) {
            if (counts[key] > max) {
                max = counts[key];
                dominant = key;
            }
        }

        // Switch to appropriate context based on dominant emotion
        if (max >= 1 && dominant) {
            // Map emotion to context using centralized emotion mapping
            const emotionToCategory = window.kimiEmotionSystem?.emotionToVideoCategory || {};
            const targetCategory = emotionToCategory[dominant];
            if (targetCategory) {
                this.switchToContext(targetCategory, dominant, null, traits, affection);
                return;
            }

            // Fallback for unmapped emotions
            if (dominant === "dancing") {
                this.switchToContext("dancing", "dancing", null, traits, affection);
                return;
            }
            if (dominant === "positive") {
                this.switchToContext("speakingPositive", "positive", null, traits, affection);
                return;
            }
            if (dominant === "negative") {
                this.switchToContext("speakingNegative", "negative", null, traits, affection);
                return;
            }
            if (dominant === "listening") {
                this.switchToContext("listening", "listening", null, traits, affection);
                return;
            }
        }

        // Default to neutral context, with a positive bias at high affection (more accessible)
        if (traits && typeof traits.affection === "number" && traits.affection >= 80) {
            const chance = Math.random();
            if (chance < 0.35) {
                // Increased chance from 0.25 to 0.35
                this.switchToContext("speakingPositive", "positive", null, traits, affection);
                return;
            }
        }
        // Avoid neutral override if a transient state should persist (handled elsewhere)
        this.switchToContext("neutral", "neutral", null, traits, affection);
    }

    // AUTOMATIC TRANSITION TO NEUTRAL
    scheduleAutoTransition(delayMs) {
        clearTimeout(this.autoTransitionTimer);

        // Ne pas programmer d'auto-transition pour les contextes de base
        if (this.currentContext === "neutral" || this.currentContext === "listening") {
            return;
        }

        // Durées adaptées selon le contexte (toutes les vidéos font 10s)
        let duration;
        if (typeof delayMs === "number") {
            duration = delayMs;
        } else {
            switch (this.currentContext) {
                case "dancing":
                    duration = 10000; // 10 secondes pour dancing (durée réelle des vidéos)
                    break;
                case "speakingPositive":
                case "speakingNegative":
                    duration = 10000; // 10 secondes pour speaking (durée réelle des vidéos)
                    break;
                case "neutral":
                    // Pas d'auto-transition pour neutral (état par défaut, boucle en continu)
                    return;
                case "listening":
                    // Pas d'auto-transition pour listening (personnage écoute l'utilisateur)
                    return;
                default:
                    duration = this.autoTransitionDuration; // 10 secondes par défaut
            }
        }

        console.log(`Auto-transition scheduled in ${duration / 1000}s (${this.currentContext} → neutral)`);
        this.autoTransitionTimer = setTimeout(() => {
            if (this.currentContext !== "neutral" && this.currentContext !== "listening") {
                if (!this._processPendingSwitches()) {
                    this.returnToNeutral();
                }
            }
        }, duration);
    }

    // COMPATIBILITY WITH THE OLD SYSTEM
    switchVideo(emotion = null) {
        if (emotion) {
            this.switchToContext("speaking", emotion);
        } else {
            this.switchToContext("neutral");
        }
    }

    autoSwitchToNeutral() {
        this._neutralLock = false;
        this.isEmotionVideoPlaying = false;
        this.currentEmotionContext = null;
        this.switchToContext("neutral");
    }

    getNextVideo(emotion, currentSrc) {
        // Adapt the old method for compatibility
        const category = this.determineCategory("speaking", emotion);
        return this.selectOptimalVideo(category);
    }

    loadAndSwitchVideo(videoSrc, priority = "normal") {
        const startTs = performance.now();
        // Guard: ignore if recently failed and still in cooldown
        const lastFail = this._recentFailures.get(videoSrc);
        if (lastFail && performance.now() - lastFail < this._failureCooldown) {
            // Pick an alternative neutral as quick substitution
            const neutralList = (this.videoCategories && this.videoCategories.neutral) || [];
            const alt = neutralList.find(v => v !== videoSrc) || neutralList[0];
            if (alt && alt !== videoSrc) {
                console.warn(`Skipping recently failed video (cooldown): ${videoSrc} -> trying alt: ${alt}`);
                return this.loadAndSwitchVideo(alt, priority);
            }
        }
        // Avoid redundant loading if the requested source is already active or currently loading in inactive element
        const activeSrc = this.activeVideo?.querySelector("source")?.getAttribute("src");
        const inactiveSrc = this.inactiveVideo?.querySelector("source")?.getAttribute("src");
        if (videoSrc && (videoSrc === activeSrc || (this._loadingInProgress && videoSrc === inactiveSrc))) {
            if (priority !== "high" && priority !== "speaking") {
                return; // no need to reload same video
            }
        }
        // Only log high priority or error cases to reduce noise
        if (priority === "speaking" || priority === "high") {
            console.log(`🎬 Loading video: ${videoSrc} (priority: ${priority})`);
        }

        // Si une vidéo haute priorité arrive, on peut interrompre le chargement en cours
        if (this._loadingInProgress) {
            if (priority === "high" || priority === "speaking") {
                this._loadingInProgress = false;
                // Nettoyer les event listeners en cours sur la vidéo inactive
                this.inactiveVideo.removeEventListener("canplay", this._currentLoadHandler);
                this.inactiveVideo.removeEventListener("loadeddata", this._currentLoadHandler);
                this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
                if (this._loadTimeout) {
                    clearTimeout(this._loadTimeout);
                    this._loadTimeout = null;
                }
            } else {
                return;
            }
        }

        this._loadingInProgress = true;

        // Nettoyer tous les timers en cours
        clearTimeout(this.autoTransitionTimer);
        if (this._loadTimeout) {
            clearTimeout(this._loadTimeout);
            this._loadTimeout = null;
        }

        const pref = this._prefetchCache.get(videoSrc);
        if (pref && (pref.readyState >= 2 || pref.buffered.length > 0)) {
            const source = this.inactiveVideo.querySelector("source");
            source.setAttribute("src", videoSrc);
            try {
                this.inactiveVideo.currentTime = 0;
            } catch {}
            this.inactiveVideo.load();
        } else {
            this.inactiveVideo.querySelector("source").setAttribute("src", videoSrc);
            this.inactiveVideo.load();
        }

        // Stocker les références aux handlers pour pouvoir les nettoyer
        let fired = false;
        const onReady = () => {
            if (fired) return;
            fired = true;
            this._loadingInProgress = false;
            if (this._loadTimeout) {
                clearTimeout(this._loadTimeout);
                this._loadTimeout = null;
            }
            this.inactiveVideo.removeEventListener("canplay", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("loadeddata", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
            // Update rolling average load time
            const duration = performance.now() - startTs;
            this._loadTimeSamples.push(duration);
            if (this._loadTimeSamples.length > this._maxSamples) this._loadTimeSamples.shift();
            const sum = this._loadTimeSamples.reduce((a, b) => a + b, 0);
            this._avgLoadTime = sum / this._loadTimeSamples.length;
            this._consecutiveErrorCount = 0; // reset on success
            this.performSwitch();
        };
        this._currentLoadHandler = onReady;

        const folder = getCharacterInfo(this.characterName).videoFolder;
        // Rotating fallback pool (stable neutrals first positions)
        // Build or rebuild fallback pool when absent or when character changed
        if (!this._fallbackPool || this._fallbackPoolCharacter !== this.characterName) {
            const neutralList = (this.videoCategories && this.videoCategories.neutral) || [];
            // Choose first 3 as core reliable set; if less than 3 available, take all
            this._fallbackPool = neutralList.slice(0, 3);
            this._fallbackIndex = 0;
            this._fallbackPoolCharacter = this.characterName;
        }
        const fallbackVideo = this._fallbackPool[this._fallbackIndex % this._fallbackPool.length];

        this._currentErrorHandler = e => {
            const mediaEl = this.inactiveVideo;
            const readyState = mediaEl ? mediaEl.readyState : -1;
            const networkState = mediaEl ? mediaEl.networkState : -1;
            let mediaErrorCode = null;
            if (mediaEl && mediaEl.error) mediaErrorCode = mediaEl.error.code;
            console.warn(
                `Error loading video: ${videoSrc} (readyState=${readyState} networkState=${networkState} mediaError=${mediaErrorCode}) falling back to: ${fallbackVideo}`
            );
            this._loadingInProgress = false;
            if (this._loadTimeout) {
                clearTimeout(this._loadTimeout);
                this._loadTimeout = null;
            }
            this._recentFailures.set(videoSrc, performance.now());
            this._consecutiveErrorCount++;
            // Stop runaway fallback loop: pause if too many sequential errors relative to pool size
            if (this._fallbackPool && this._consecutiveErrorCount >= this._fallbackPool.length * 2) {
                console.error("Temporarily pausing fallback loop after repeated failures. Retrying in 2s.");
                setTimeout(() => {
                    this._consecutiveErrorCount = 0;
                    this.loadAndSwitchVideo(fallbackVideo, "high");
                }, 2000);
                return;
            }
            if (videoSrc !== fallbackVideo) {
                // Try fallback video
                this._fallbackIndex = (this._fallbackIndex + 1) % this._fallbackPool.length; // advance for next time
                this.loadAndSwitchVideo(fallbackVideo, "high");
            } else {
                // Ultimate fallback: try any neutral video
                console.error(`Fallback video also failed: ${fallbackVideo}. Trying ultimate fallback.`);
                const neutralVideos = this.videoCategories.neutral || [];
                if (neutralVideos.length > 0) {
                    // Try a different neutral video
                    const ultimateFallback = neutralVideos.find(video => video !== fallbackVideo);
                    if (ultimateFallback) {
                        this.loadAndSwitchVideo(ultimateFallback, "high");
                    } else {
                        // Last resort: try first neutral video anyway
                        this.loadAndSwitchVideo(neutralVideos[0], "high");
                    }
                } else {
                    // Critical error: no neutral videos available
                    console.error("CRITICAL: No neutral videos available!");
                    this._switchInProgress = false;
                }
            }
            // Escalate diagnostics if many consecutive errors
            if (this._consecutiveErrorCount >= 3) {
                console.info(
                    `Diagnostics: avgLoadTime=${this._avgLoadTime?.toFixed(1) || "n/a"}ms samples=${this._loadTimeSamples.length} prefetchCache=${this._prefetchCache.size}`
                );
            }
        };

        this.inactiveVideo.addEventListener("loadeddata", this._currentLoadHandler, { once: true });
        this.inactiveVideo.addEventListener("canplay", this._currentLoadHandler, { once: true });
        this.inactiveVideo.addEventListener("error", this._currentErrorHandler, { once: true });

        if (this.inactiveVideo.readyState >= 2) {
            queueMicrotask(() => onReady());
        }

        // Dynamic timeout: refined formula avg*1.5 + buffer, bounded
        let adaptiveTimeout = this._minTimeout;
        if (this._avgLoadTime) {
            adaptiveTimeout = Math.min(this._maxTimeout, Math.max(this._minTimeout, this._avgLoadTime * 1.5 + 400));
        }
        // Cap by clip length ratio if we know (assume 10000ms default when metadata absent)
        const currentClipMs = 10000; // All clips are 10s
        adaptiveTimeout = Math.min(adaptiveTimeout, Math.floor(currentClipMs * this._timeoutCapRatio));
        this._loadTimeout = setTimeout(() => {
            if (!fired) {
                // If metadata is there but not canplay yet, extend once
                if (this.inactiveVideo.readyState >= 1 && this.inactiveVideo.readyState < 2) {
                    console.debug(
                        `Extending timeout for ${videoSrc} (readyState=${this.inactiveVideo.readyState}) by ${this._timeoutExtension}ms`
                    );
                    this._loadTimeout = setTimeout(() => {
                        if (!fired) {
                            if (this.inactiveVideo.readyState >= 2) onReady();
                            else this._currentErrorHandler();
                        }
                    }, this._timeoutExtension);
                    return;
                }
                // Grace retry: still fetching over network (networkState=2) with no data (readyState=0)
                if (
                    this.inactiveVideo.networkState === 2 &&
                    this.inactiveVideo.readyState === 0 &&
                    (this._graceRetryCounts?.[videoSrc] || 0) < 1
                ) {
                    if (!this._graceRetryCounts) this._graceRetryCounts = {};
                    this._graceRetryCounts[videoSrc] = (this._graceRetryCounts[videoSrc] || 0) + 1;
                    const extra = this._timeoutExtension + 600;
                    console.debug(`Grace retry for ${videoSrc} (network loading). Extending by ${extra}ms`);
                    this._loadTimeout = setTimeout(() => {
                        if (!fired) {
                            if (this.inactiveVideo.readyState >= 2) onReady();
                            else this._currentErrorHandler();
                        }
                    }, extra);
                    return;
                }
                if (this.inactiveVideo.readyState >= 2) {
                    onReady();
                } else {
                    this._currentErrorHandler();
                }
            }
        }, adaptiveTimeout);
    }

    usePreloadedVideo(preloadedVideo, videoSrc) {
        const source = this.inactiveVideo.querySelector("source");
        source.setAttribute("src", videoSrc);

        this.inactiveVideo.currentTime = 0;
        this.inactiveVideo.load();

        this._currentLoadHandler = () => {
            this._loadingInProgress = false;
            this.performSwitch();
        };

        this.inactiveVideo.addEventListener("canplay", this._currentLoadHandler, { once: true });
    }

    performSwitch() {
        // Prevent rapid double toggles
        if (this._switchInProgress) return;
        this._switchInProgress = true;

        const fromVideo = this.activeVideo;
        const toVideo = this.inactiveVideo;

        // Perform a JS-managed crossfade for smoother transitions
        // Let crossfadeVideos resolve duration from CSS variable (--video-fade-duration)
        this.constructor.crossfadeVideos(fromVideo, toVideo, undefined, () => {
            // After crossfade completion, finalize state and classes
            fromVideo.classList.remove("active");
            toVideo.classList.add("active");

            // Swap references
            const prevActive = this.activeVideo;
            const prevInactive = this.inactiveVideo;
            this.activeVideo = prevInactive;
            this.inactiveVideo = prevActive;

            const playPromise = this.activeVideo.play();
            if (playPromise && typeof playPromise.then === "function") {
                playPromise
                    .then(() => {
                        try {
                            const src = this.activeVideo?.querySelector("source")?.getAttribute("src");
                            const info = { context: this.currentContext, emotion: this.currentEmotion };
                            console.log("🎬 VideoManager: Now playing:", src, info);
                            // Recompute autoTransitionDuration from actual duration if available (C)
                            try {
                                const d = this.activeVideo.duration;
                                if (!isNaN(d) && d > 0.5) {
                                    // Keep 1s headroom before natural end for auto scheduling
                                    const target = Math.max(1000, d * 1000 - 1100);
                                    this.autoTransitionDuration = target;
                                } else {
                                    this.autoTransitionDuration = 9900; // fallback for 10s clips
                                }
                                // Dynamic neutral prefetch to widen diversity without burst
                                this._prefetchNeutralDynamic();
                            } catch {}
                        } catch {}
                        this._switchInProgress = false;
                        this.setupEventListenersForContext(this.currentContext);
                    })
                    .catch(error => {
                        console.warn("Failed to play video:", error);
                        // Revert to previous video to avoid frozen state
                        toVideo.classList.remove("active");
                        fromVideo.classList.add("active");
                        this.activeVideo = fromVideo;
                        this.inactiveVideo = toVideo;
                        try {
                            this.activeVideo.play().catch(() => {});
                        } catch {}
                        this._switchInProgress = false;
                        this.setupEventListenersForContext(this.currentContext);
                    });
            } else {
                // Non-promise play fallback
                this._switchInProgress = false;
                try {
                    const d = this.activeVideo.duration;
                    if (!isNaN(d) && d > 0.5) {
                        const target = Math.max(1000, d * 1000 - 1100);
                        this.autoTransitionDuration = target;
                    } else {
                        this.autoTransitionDuration = 9900;
                    }
                    this._prefetchNeutralDynamic();
                } catch {}
                this.setupEventListenersForContext(this.currentContext);
            }
        });
    }

    _prefetchNeutralDynamic() {
        try {
            const neutrals = (this.videoCategories && this.videoCategories.neutral) || [];
            if (!neutrals.length) return;
            // Build a set of already cached or in-flight
            const cached = new Set(
                [...this._prefetchCache.keys(), ...this._prefetchInFlight.values()].map(v => (typeof v === "string" ? v : v?.src))
            ); // defensive
            const current = this.activeVideo?.querySelector("source")?.getAttribute("src");
            // Choose up to 2 unseen neutral videos different from current
            const candidates = neutrals.filter(s => s && s !== current && !cached.has(s));
            if (!candidates.length) return;
            let limit = 2;
            // Network-aware limiting
            try {
                const conn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
                if (conn && conn.effectiveType) {
                    if (/2g/i.test(conn.effectiveType)) limit = 0;
                    else if (/3g/i.test(conn.effectiveType)) limit = 1;
                }
            } catch {}
            if (limit <= 0) return;
            candidates.slice(0, limit).forEach(src => this._prefetch(src));
        } catch {}
    }

    _prefetch(src) {
        if (!src || this._prefetchCache.has(src) || this._prefetchInFlight.has(src)) return;
        if (this._prefetchCache.size + this._prefetchInFlight.size >= this._maxPrefetch) return;
        this._prefetchInFlight.add(src);
        const v = document.createElement("video");
        v.preload = "auto";
        v.muted = true;
        v.playsInline = true;
        v.src = src;
        const cleanup = () => {
            v.oncanplaythrough = null;
            v.oncanplay = null;
            v.onerror = null;
            this._prefetchInFlight.delete(src);
        };
        v.oncanplay = () => {
            this._prefetchCache.set(src, v);
            this._trimPrefetchCacheIfNeeded();
            cleanup();
        };
        v.oncanplaythrough = () => {
            this._prefetchCache.set(src, v);
            this._trimPrefetchCacheIfNeeded();
            cleanup();
        };
        v.onerror = () => {
            cleanup();
        };
        try {
            v.load();
        } catch {}
    }

    _trimPrefetchCacheIfNeeded() {
        try {
            // Only apply LRU trimming to neutral videos; cap at 6 neutrals cached
            const MAX_NEUTRAL = 6;
            const entries = [...this._prefetchCache.entries()];
            const neutralEntries = entries.filter(([src]) => /\/neutral\//.test(src));
            if (neutralEntries.length <= MAX_NEUTRAL) return;
            // LRU heuristic: older insertion first (Map preserves insertion order)
            const excess = neutralEntries.length - MAX_NEUTRAL;
            let removed = 0;
            for (const [src, vid] of neutralEntries) {
                if (removed >= excess) break;
                // Avoid removing currently active or about to be used
                const current = this.activeVideo?.querySelector("source")?.getAttribute("src");
                if (src === current) continue;
                this._prefetchCache.delete(src);
                try {
                    vid.removeAttribute("src");
                    vid.load();
                } catch {}
                removed++;
            }
        } catch {}
    }

    _prefetchLikely(category) {
        const list = this.videoCategories[category] || [];
        // Prefetch 1-2 next likely videos different from current
        const current = this.activeVideo?.querySelector("source")?.getAttribute("src") || null;
        const candidates = list.filter(s => s && s !== current).slice(0, 2);
        candidates.forEach(src => this._prefetch(src));
    }

    // DIAGNOSTIC AND DEBUG METHODS
    getCurrentVideoInfo() {
        const currentSrc = this.activeVideo.querySelector("source").getAttribute("src");
        return {
            currentVideo: currentSrc,
            context: this.currentContext,
            emotion: this.currentEmotion,
            category: this.determineCategory(this.currentContext, this.currentEmotion)
        };
    }

    // METHODS TO ANALYZE EMOTIONS FROM TEXT
    // CLEANUP
    destroy() {
        clearTimeout(this.autoTransitionTimer);
        this.autoTransitionTimer = null;
        if (this._visibilityHandler) {
            document.removeEventListener("visibilitychange", this._visibilityHandler);
            this._visibilityHandler = null;
        }
    }

    // Utilitaire pour déterminer la catégorie vidéo selon la moyenne des traits
    setMoodByPersonality(traits) {
        if (this._stickyContext === "dancing" || this.currentContext === "dancing") return;
        const category = getMoodCategoryFromPersonality(traits);
        // Normalize emotion so validation uses base emotion labels
        let emotion = category;
        if (category === "speakingPositive") emotion = "positive";
        else if (category === "speakingNegative") emotion = "negative";
        // For other categories (neutral, listening, dancing) emotion can equal category
        this.switchToContext(category, emotion, null, traits, traits.affection);
    }

    _cleanupLoadingHandlers() {
        if (this._currentLoadHandler) {
            this.inactiveVideo.removeEventListener("canplay", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("loadeddata", this._currentLoadHandler);
            this._currentLoadHandler = null;
        }
        if (this._currentErrorHandler) {
            this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
            this._currentErrorHandler = null;
        }
        if (this._loadTimeout) {
            clearTimeout(this._loadTimeout);
            this._loadTimeout = null;
        }
        this._loadingInProgress = false;
        this._switchInProgress = false;
    }
}

function getMoodCategoryFromPersonality(traits) {
    // Use unified emotion system
    if (window.kimiEmotionSystem) {
        return window.kimiEmotionSystem.getMoodCategoryFromPersonality(traits);
    }

    // Fallback (should not be reached) - must match emotion system calculation
    const keys = ["affection", "romance", "empathy", "playfulness", "humor", "intelligence"];
    let sum = 0;
    let count = 0;
    keys.forEach(key => {
        if (typeof traits[key] === "number") {
            sum += traits[key];
            count++;
        }
    });
    const avg = count > 0 ? sum / count : 50;

    if (avg >= 80) return "speakingPositive";
    if (avg >= 60) return "neutral";
    if (avg >= 40) return "neutral";
    if (avg >= 20) return "speakingNegative";
    return "speakingNegative";
}

// Centralized initialization manager
class KimiInitManager {
    constructor() {
        this.managers = new Map();
        this.initOrder = [];
        this.isInitialized = false;
    }

    register(name, managerFactory, dependencies = [], delay = 0) {
        this.managers.set(name, {
            factory: managerFactory,
            dependencies,
            delay,
            instance: null,
            initialized: false
        });
    }

    async initializeAll() {
        if (this.isInitialized) return;

        // Sort by dependencies and delays
        const sortedManagers = this.topologicalSort();

        for (const managerName of sortedManagers) {
            await this.initializeManager(managerName);
        }

        this.isInitialized = true;
    }
    async initializeManager(name) {
        const manager = this.managers.get(name);
        if (!manager || manager.initialized) return;

        // Wait for dependencies
        for (const dep of manager.dependencies) {
            await this.initializeManager(dep);
        }

        // Apply delay if necessary
        if (manager.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, manager.delay));
        }

        try {
            manager.instance = await manager.factory();
            manager.initialized = true;
        } catch (error) {
            console.error(`Error during initialization of ${name}:`, error);
            throw error;
        }
    }

    topologicalSort() {
        // Simple implementation of topological sort
        const sorted = [];
        const visited = new Set();
        const temp = new Set();

        const visit = name => {
            if (temp.has(name)) {
                throw new Error(`Circular dependency detected: ${name}`);
            }
            if (visited.has(name)) return;

            temp.add(name);
            const manager = this.managers.get(name);

            for (const dep of manager.dependencies) {
                visit(dep);
            }

            temp.delete(name);
            visited.add(name);
            sorted.push(name);
        };

        for (const name of this.managers.keys()) {
            visit(name);
        }

        return sorted;
    }

    getInstance(name) {
        const manager = this.managers.get(name);
        return manager ? manager.instance : null;
    }
}

// Utility class for DOM manipulations
class KimiDOMUtils {
    static get(selector) {
        return document.querySelector(selector);
    }
    static getAll(selector) {
        return document.querySelectorAll(selector);
    }
    static setText(selector, text) {
        const el = this.get(selector);
        if (el) el.textContent = text;
    }
    static setValue(selector, value) {
        const el = this.get(selector);
        if (el) el.value = value;
    }
    static show(selector) {
        const el = this.get(selector);
        if (el) el.style.display = "";
    }
    static hide(selector) {
        const el = this.get(selector);
        if (el) el.style.display = "none";
    }
    static toggle(selector) {
        const el = this.get(selector);
        if (el) el.style.display = el.style.display === "none" ? "" : "none";
    }
    static addClass(selector, className) {
        const el = this.get(selector);
        if (el) el.classList.add(className);
    }
    static removeClass(selector, className) {
        const el = this.get(selector);
        if (el) el.classList.remove(className);
    }
    static transition(selector, property, value, duration = 300) {
        const el = this.get(selector);
        if (el) {
            el.style.transition = property + " " + duration + "ms";
            el.style[property] = value;
        }
    }
}

// Déclaration complète de la classe KimiOverlayManager
class KimiOverlayManager {
    constructor() {
        this.overlays = {};
        this._initAll();
    }
    _initAll() {
        const overlayIds = ["chat-container", "settings-overlay", "help-overlay"];
        overlayIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                this.overlays[id] = el;
                if (id !== "chat-container") {
                    el.addEventListener("click", e => {
                        if (e.target === el) {
                            this.close(id);
                        }
                    });
                }
            }
        });
    }
    open(name) {
        const el = this.overlays[name];
        if (el) el.classList.add("visible");
    }
    close(name) {
        const el = this.overlays[name];
        if (el) el.classList.remove("visible");
        // Ensure background video resumes after closing any overlay
        const kv = window.kimiVideo;
        if (kv && kv.activeVideo) {
            try {
                const v = kv.activeVideo;
                if (v.ended) {
                    if (typeof kv.returnToNeutral === "function") kv.returnToNeutral();
                } else if (v.paused) {
                    v.play().catch(() => {
                        if (typeof kv.returnToNeutral === "function") kv.returnToNeutral();
                    });
                }
            } catch {}
        }
    }
    toggle(name) {
        const el = this.overlays[name];
        if (el) el.classList.toggle("visible");
    }
    isOpen(name) {
        const el = this.overlays[name];
        return el ? el.classList.contains("visible") : false;
    }
}

function getCharacterInfo(characterName) {
    return window.KIMI_CHARACTERS[characterName] || window.KIMI_CHARACTERS.kimi;
}

// Restauration de la classe KimiTabManager
class KimiTabManager {
    constructor(options = {}) {
        this.settingsOverlay = document.getElementById("settings-overlay");
        this.settingsTabs = document.querySelectorAll(".settings-tab");
        this.tabContents = document.querySelectorAll(".tab-content");
        this.settingsContent = document.querySelector(".settings-content");
        this.onTabChange = options.onTabChange || null;
        this.resizeObserver = null;
        // Guard flag to batch ResizeObserver callbacks within a frame
        this._resizeRafScheduled = false;
        this.init();
    }

    init() {
        this.settingsTabs.forEach(tab => {
            tab.addEventListener("click", () => {
                this.activateTab(tab.dataset.tab);
            });
        });
        const activeTab = document.querySelector(".settings-tab.active");
        if (activeTab) this.activateTab(activeTab.dataset.tab);
        this.setupResizeObserver();
        this.setupModalObserver();
    }

    activateTab(tabName) {
        this.settingsTabs.forEach(tab => {
            if (tab.dataset.tab === tabName) tab.classList.add("active");
            else tab.classList.remove("active");
        });
        this.tabContents.forEach(content => {
            if (content.dataset.tab === tabName) content.classList.add("active");
            else content.classList.remove("active");
        });
        // Ensure the content scroll resets to the top when changing tabs
        if (this.settingsContent) {
            this.settingsContent.scrollTop = 0;
            // Defer once to handle layout updates after class toggles
            window.requestAnimationFrame(() => {
                this.settingsContent.scrollTop = 0;
            });
        }
        if (this.onTabChange) this.onTabChange(tabName);
        setTimeout(() => this.adjustTabsForScrollbar(), 100);
        if (window.innerWidth <= 768) {
            const tab = Array.from(this.settingsTabs).find(t => t.dataset.tab === tabName);
            if (tab) tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
        }
    }

    setupResizeObserver() {
        if ("ResizeObserver" in window && this.settingsContent) {
            this.resizeObserver = new ResizeObserver(() => {
                // Defer to next animation frame to avoid ResizeObserver loop warnings
                if (this._resizeRafScheduled) return;
                this._resizeRafScheduled = true;
                window.requestAnimationFrame(() => {
                    this._resizeRafScheduled = false;
                    this.adjustTabsForScrollbar();
                });
            });
            this.resizeObserver.observe(this.settingsContent);
        }
    }

    setupModalObserver() {
        if (!this.settingsOverlay) return;
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === "attributes" && mutation.attributeName === "class") {
                    if (this.settingsOverlay.classList.contains("visible")) {
                        // Reset scroll to top when the settings modal opens
                        if (this.settingsContent) {
                            this.settingsContent.scrollTop = 0;
                            window.requestAnimationFrame(() => {
                                this.settingsContent.scrollTop = 0;
                            });
                        }
                    }
                }
            });
        });
        observer.observe(this.settingsOverlay, { attributes: true, attributeFilter: ["class"] });
    }

    adjustTabsForScrollbar() {
        if (!this.settingsContent || !this.settingsTabs.length) return;
        const tabsContainer = document.querySelector(".settings-tabs");
        const hasVerticalScrollbar = this.settingsContent.scrollHeight > this.settingsContent.clientHeight;
        if (hasVerticalScrollbar) {
            const scrollbarWidth = this.settingsContent.offsetWidth - this.settingsContent.clientWidth;
            tabsContainer.classList.add("compressed");
            tabsContainer.style.paddingRight = `${Math.max(scrollbarWidth, 8)}px`;
            tabsContainer.style.boxSizing = "border-box";
            const tabs = tabsContainer.querySelectorAll(".settings-tab");
            const availableWidth = tabsContainer.clientWidth - scrollbarWidth;
            const tabCount = tabs.length;
            const idealTabWidth = availableWidth / tabCount;
            tabs.forEach(tab => {
                if (idealTabWidth < 140) {
                    tab.style.fontSize = "0.85rem";
                    tab.style.padding = "14px 10px";
                } else if (idealTabWidth < 160) {
                    tab.style.fontSize = "0.95rem";
                    tab.style.padding = "15px 12px";
                } else {
                    tab.style.fontSize = "1rem";
                    tab.style.padding = "16px 16px";
                }
            });
        } else {
            tabsContainer.classList.remove("compressed");
            tabsContainer.style.paddingRight = "";
            tabsContainer.style.boxSizing = "";
            const tabs = tabsContainer.querySelectorAll(".settings-tab");
            tabs.forEach(tab => {
                tab.style.fontSize = "";
                tab.style.padding = "";
            });
        }
    }
}

class KimiUIEventManager {
    constructor() {
        this.events = [];
    }
    addEvent(target, type, handler, options) {
        target.addEventListener(type, handler, options);
        this.events.push({ target, type, handler, options });
    }
    removeAll() {
        for (const { target, type, handler, options } of this.events) {
            target.removeEventListener(type, handler, options);
        }
        this.events = [];
    }
}

class KimiFormManager {
    constructor(options = {}) {
        this.db = options.db || null;
        this.memory = options.memory || null;
        this._autoInit = options.autoInit === true;
        if (this._autoInit) {
            this._initSliders();
        }
    }
    init() {
        this._initSliders();
    }
    _initSliders() {
        document.querySelectorAll(".kimi-slider").forEach(slider => {
            const valueSpan = document.getElementById(slider.id + "-value");
            if (valueSpan) valueSpan.textContent = slider.value;
            // Only update visible value; side-effects handled by specialized listeners
            slider.addEventListener("input", () => {
                if (valueSpan) valueSpan.textContent = slider.value;
            });
        });
    }
}

class KimiUIStateManager {
    constructor() {
        this.state = {
            overlays: {},
            activeTab: null,
            favorability: 65,
            transcript: "",
            chatOpen: false,
            settingsOpen: false,
            micActive: false,
            sliders: {}
        };
        this.overlayManager = window.kimiOverlayManager || null;
        this.tabManager = window.kimiTabManager || null;
        this.formManager = window.kimiFormManager || null;
    }
    setOverlay(name, visible) {
        this.state.overlays[name] = visible;
        if (this.overlayManager) {
            if (visible) this.overlayManager.open(name);
            else this.overlayManager.close(name);
        }
    }
    setActiveTab(tabName) {
        this.state.activeTab = tabName;
        if (this.tabManager) this.tabManager.activateTab(tabName);
    }
    /**
     * @deprecated Prefer calling updateGlobalPersonalityUI() after updating traits.
     * This direct setter will be removed in a future cleanup.
     */
    setPersonalityAverage(value) {
        const v = Number(value) || 0;
        const clamped = Math.max(0, Math.min(100, v));
        this.state.favorability = clamped;
        window.KimiDOMUtils.setText("#favorability-text", `${clamped.toFixed(2)}%`);
        window.KimiDOMUtils.get("#favorability-bar").style.width = `${clamped}%`;
    }
    /**
     * @deprecated Use setPersonalityAverage() (itself deprecated) or updateGlobalPersonalityUI().
     */
    setFavorability(value) {
        this.setPersonalityAverage(value);
    }
    async setTranscript(text) {
        this.state.transcript = text;
        // Always use the proper transcript management via VoiceManager
        if (window.kimiVoiceManager && window.kimiVoiceManager.updateTranscriptVisibility) {
            await window.kimiVoiceManager.updateTranscriptVisibility(!!text, text);
        } else {
            console.warn("VoiceManager not available - transcript display may not work properly");
        }
    }
    setChatOpen(open) {
        this.state.chatOpen = open;
        this.setOverlay("chat-container", open);
    }
    setSettingsOpen(open) {
        this.state.settingsOpen = open;
        this.setOverlay("settings-overlay", open);
    }
    setMicActive(active) {
        this.state.micActive = active;
        window.KimiDOMUtils.get("#mic-button").classList.toggle("active", active);
    }
    setSlider(id, value) {
        this.state.sliders[id] = value;
        if (this.formManager) {
            const slider = document.getElementById(id);
            if (slider) slider.value = value;
            const valueSpan = document.getElementById(id + "-value");
            if (valueSpan) valueSpan.textContent = value;
        }
    }
    getState() {
        return { ...this.state };
    }
}

// SIMPLE Fallback management - BASIC ONLY
window.KimiFallbackManager = {
    getFallbackMessage: function (errorType, customMessage = null) {
        const i18n = window.kimiI18nManager;

        // If i18n is available, try to get translated message
        if (i18n && typeof i18n.t === "function") {
            if (customMessage) {
                const translated = i18n.t(customMessage);
                if (translated && translated !== customMessage) {
                    return translated;
                }
            }

            const translationKey = `fallback_${errorType}`;
            const translated = i18n.t(translationKey);
            if (translated && translated !== translationKey) {
                return translated;
            }
        }

        // Fallback to hardcoded messages in multiple languages
        const fallbacks = {
            api_missing: {
                fr: "Pour discuter avec moi, ajoute ta clé API du provider choisi dans les paramètres ! 💕",
                en: "To chat with me, add your selected provider API key in settings! 💕",
                es: "Para chatear conmigo, agrega la clave API de tu proveedor en configuración! 💕",
                de: "Um mit mir zu chatten, füge deinen Anbieter-API-Schlüssel in den Einstellungen hinzu! 💕",
                it: "Per chattare con me, aggiungi la chiave API del provider nelle impostazioni! 💕"
            },
            api_error: {
                fr: "Désolée, le service IA est temporairement indisponible. Veuillez réessayer plus tard.",
                en: "Sorry, the AI service is temporarily unavailable. Please try again later.",
                es: "Lo siento, el servicio de IA no está disponible temporalmente. Inténtalo de nuevo más tarde.",
                de: "Entschuldigung, der KI-Service ist vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.",
                it: "Spiacente, il servizio IA è temporaneamente non disponibile. Riprova più tardi."
            },
            model_error: {
                fr: "Désolée, le modèle sélectionné n'est pas disponible. Veuillez choisir un autre modèle.",
                en: "Sorry, the selected model is not available. Please choose another model.",
                es: "Lo siento, el modelo seleccionado no está disponible. Elige otro modelo.",
                de: "Entschuldigung, das ausgewählte Modell ist nicht verfügbar. Bitte wählen Sie ein anderes Modell.",
                it: "Spiacente, il modello selezionato non è disponibile. Scegli un altro modello."
            }
        };

        // Detect current language (fallback detection)
        const currentLang = this.detectCurrentLanguage();

        if (fallbacks[errorType] && fallbacks[errorType][currentLang]) {
            return fallbacks[errorType][currentLang];
        }

        // Ultimate fallback to English
        if (fallbacks[errorType] && fallbacks[errorType].en) {
            return fallbacks[errorType].en;
        }

        switch (errorType) {
            case "api_missing":
                return "To chat with me, add your API key in settings! 💕";
            case "api_error":
            case "api":
                return "Sorry, the AI service is temporarily unavailable. Please try again later.";
            case "model_error":
            case "model":
                return "Sorry, the selected model is not available. Please choose another model or check your configuration.";
            case "network_error":
            case "network":
                return "Sorry, I cannot respond because there is no internet connection.";
            case "technical_error":
            case "technical":
                return "Sorry, I am unable to answer due to a technical issue.";
            case "general_error":
            default:
                return "Sorry my love, I am having a little technical issue! 💕";
        }
    },

    detectCurrentLanguage: function () {
        // Try to get language from various sources

        // 1. Try from language selector if available
        const langSelect = document.getElementById("language-selection");
        if (langSelect && langSelect.value) {
            return langSelect.value;
        }

        // 2. Try from HTML lang attribute
        const htmlLang = document.documentElement.lang;
        if (htmlLang) {
            return htmlLang.split("-")[0]; // Get just the language part
        }

        // 3. Try from browser language
        const browserLang = navigator.language || navigator.userLanguage;
        if (browserLang) {
            return browserLang.split("-")[0];
        }

        // 4. Default to English (as seems to be the default for this app)
        return "en";
    },

    showFallbackResponse: async function (errorType, customMessage = null) {
        const message = this.getFallbackMessage(errorType, customMessage);

        // Add to chat
        if (window.addMessageToChat) {
            window.addMessageToChat("kimi", message);
        }

        // Speak if available
        if (window.voiceManager && window.voiceManager.speak) {
            window.voiceManager.speak(message);
        }

        // SIMPLE: Always show neutral videos in fallback mode
        if (window.kimiVideo && window.kimiVideo.switchToContext) {
            window.kimiVideo.switchToContext("neutral", "neutral");
        }

        return message;
    }
};

window.KimiBaseManager = KimiBaseManager;
window.KimiVideoManager = KimiVideoManager;
window.KimiSecurityUtils = KimiSecurityUtils;
window.KimiCacheManager = new KimiCacheManager(); // Create global instance
window.KimiInitManager = KimiInitManager;
window.KimiDOMUtils = KimiDOMUtils;
window.KimiOverlayManager = KimiOverlayManager;
window.KimiTabManager = KimiTabManager;
window.KimiUIEventManager = KimiUIEventManager;
window.KimiFormManager = KimiFormManager;
window.KimiUIStateManager = KimiUIStateManager;

window.KimiTokenUtils = {
    // Approximate token estimation (heuristic):
    // Base: 1 token ~ 4 chars (English average). We refine by word count and punctuation density.
    estimate(text) {
        if (!text || typeof text !== "string") return 0;
        const trimmed = text.trim();
        if (!trimmed) return 0;
        const charLen = trimmed.length;
        const words = trimmed.split(/\s+/).length;
        // Base estimates
        let estimateByChars = Math.ceil(charLen / 4);
        const estimateByWords = Math.ceil(words * 1.3); // average 1.3 tokens per word
        // Blend and adjust for punctuation heavy content
        const punctCount = (trimmed.match(/[.,!?;:]/g) || []).length;
        const punctFactor = 1 + Math.min(punctCount / Math.max(words, 1) / 5, 0.15); // cap at +15%
        const blended = Math.round((estimateByChars * 0.55 + estimateByWords * 0.45) * punctFactor);
        return Math.max(1, blended);
    }
};
