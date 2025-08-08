// ===== CENTRALIZED KIMI UTILITIES =====

// Input validation and sanitization utilities
window.KimiValidationUtils = {
    // Validate and sanitize user messages
    validateMessage: function (message) {
        if (!message || typeof message !== "string") {
            return { valid: false, error: "Message must be a non-empty string" };
        }

        const trimmed = message.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: "Message cannot be empty" };
        }

        if (trimmed.length > 5000) {
            return { valid: false, error: "Message too long (max 5000 characters)" };
        }

        // Basic XSS prevention
        const sanitized = this.escapeHtml(trimmed);

        return { valid: true, sanitized: sanitized };
    },

    // Escape HTML to prevent XSS
    escapeHtml: function (text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    },

    // Validate numeric ranges for sliders
    validateRange: function (value, type) {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
            return { valid: false, value: null };
        }

        const ranges = {
            voiceRate: { min: 0.5, max: 2, default: 1.1 },
            voicePitch: { min: 0.5, max: 2, default: 1.1 },
            voiceVolume: { min: 0, max: 1, default: 0.8 },
            llmTemperature: { min: 0.1, max: 1, default: 0.9 },
            llmMaxTokens: { min: 10, max: 1000, default: 100 },
            llmTopP: { min: 0, max: 1, default: 0.9 },
            llmFrequencyPenalty: { min: 0, max: 2, default: 0.3 },
            llmPresencePenalty: { min: 0, max: 2, default: 0.3 },
            interfaceOpacity: { min: 0.1, max: 1, default: 0.7 }
        };

        const range = ranges[type];
        if (!range) {
            return { valid: false, value: null };
        }

        const clampedValue = Math.max(range.min, Math.min(range.max, numValue));
        return { valid: true, value: clampedValue };
    },

    // Validate API keys
    validateApiKey: function (key) {
        if (!key || typeof key !== "string") {
            return { valid: false, error: "API key must be a string" };
        }
        const trimmed = key.trim();
        if (trimmed.length === 0) {
            return { valid: false, error: "API key cannot be empty" };
        }
        if (window.KIMI_VALIDATORS && typeof window.KIMI_VALIDATORS.validateApiKey === "function") {
            const ok = window.KIMI_VALIDATORS.validateApiKey(trimmed);
            return ok ? { valid: true, sanitized: trimmed } : { valid: false, error: "Invalid API key format" };
        }
        return { valid: true, sanitized: trimmed };
    }
};

// Performance utility functions for debouncing and throttling
window.KimiPerformanceUtils = {
    // Enhanced debounce with immediate execution option
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

    // Enhanced throttle function with leading and trailing options
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
    },

    // Batch processing utility
    createBatcher: function (processor, delay = 500) {
        let timeout = null;
        const pending = {};

        return function (key, value) {
            pending[key] = value;

            if (timeout) clearTimeout(timeout);

            timeout = setTimeout(async () => {
                if (Object.keys(pending).length > 0) {
                    try {
                        await processor(pending);
                        Object.keys(pending).forEach(k => delete pending[k]);
                    } catch (error) {
                        console.error("Batch processing error:", error);
                    }
                }
            }, delay);
        };
    },

    // Batch requests utility
    batchRequests: function (requests, batchSize = 10) {
        const batches = [];
        for (let i = 0; i < requests.length; i += batchSize) {
            batches.push(requests.slice(i, i + batchSize));
        }
        return batches;
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

    static encryptApiKey(key) {
        // Simple encoding for basic protection (not cryptographically secure)
        return btoa(key).split("").reverse().join("");
    }

    static decryptApiKey(encodedKey) {
        try {
            return atob(encodedKey.split("").reverse().join(""));
        } catch {
            return "";
        }
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
        this.transitionDuration = 900;
        this.updateVideoCategories();
        this.emotionToCategory = {
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
    }

    setCharacter(characterName) {
        this.characterName = characterName;

        // Nettoyer les handlers en cours lors du changement de personnage
        this._cleanupLoadingHandlers();

        this.updateVideoCategories();
    }

    updateVideoCategories() {
        const folder = getCharacterInfo(this.characterName).videoFolder;
        this.videoCategories = {
            listening: [
                `${folder}listening/listening-gentle-sway.mp4`,
                `${folder}listening/listening-hand-gesture.mp4`,
                `${folder}listening/listening-hair-touch.mp4`,
                `${folder}listening/listening-chin-hand.mp4`,
                `${folder}listening/listening-full-spin.mp4`,
                `${folder}listening/listening-teasing-smile.mp4`,
                `${folder}listening/listening-dreamy-gaze-romantic.mp4`
            ],
            speakingPositive: [
                `${folder}speaking-positive/speaking-happy-gestures.mp4`,
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
                `${folder}speaking-negative/speaking-sad-elegant.mp4`,
                `${folder}speaking-negative/speaking-frustrated-graceful.mp4`,
                `${folder}speaking-negative/speaking-worried-tender.mp4`,
                `${folder}speaking-negative/speaking-disappointed-elegant.mp4`,
                `${folder}speaking-negative/speaking-shy-blush-adorable.mp4`,
                `${folder}speaking-negative/speaking-gentle-wave-goodbye.mp4`
            ],
            neutral: [
                `${folder}neutral/neutral-thinking-pose.mp4`,
                `${folder}neutral/neutral-gentle-breathing.mp4`,
                `${folder}neutral/neutral-hair-adjustment.mp4`,
                `${folder}neutral/neutral-arms-crossed-elegant.mp4`,
                `${folder}neutral/neutral-seductive-slow-gaze.mp4`,
                `${folder}neutral/neutral-confident-pose-alluring.mp4`,
                `${folder}neutral/neutral-affectionate-kiss-blow.mp4`
            ],
            dancing: [
                `${folder}dancing/dancing-chin-hand.mp4`,
                `${folder}dancing/dancing-full-spin.mp4`,
                `${folder}dancing/dancing-seductive-dance-undulation.mp4`,
                `${folder}dancing/dancing-slow-seductive.mp4`,
                `${folder}dancing/dancing-spinning-elegance-twirl.mp4`
            ]
        };
        this.positiveVideos = this.videoCategories.speakingPositive;
        this.negativeVideos = this.videoCategories.speakingNegative;
        this.neutralVideos = this.videoCategories.neutral;
    }

    async init(database = null) {
        // Removed preloader initialization - simplified video management
    }

    // Intelligent contextual management
    switchToContext(context, emotion = "neutral", specificVideo = null, traits = null, affection = null) {
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
                if (typeof this._rememberPlayed === "function") this._rememberPlayed(category, nextVideo);
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

        // Chemin optimisé lorsque TTS parle/écoute (évite clignotements)
        if (
            window.voiceManager &&
            window.voiceManager.isSpeaking &&
            (context === "speaking" || context === "speakingPositive" || context === "speakingNegative")
        ) {
            const speakingPath = this.selectOptimalVideo(category, specificVideo, traits, affection);
            const speakingCurrent = this.activeVideo.querySelector("source").getAttribute("src");
            if (speakingCurrent !== speakingPath || this.activeVideo.ended) {
                this.loadAndSwitchVideo(speakingPath, priority);
            }
            this.currentContext = context;
            this.currentEmotion = emotion;
            this.lastSwitchTime = Date.now();
            return;
        }
        if (window.voiceManager && window.voiceManager.isListening && context === "listening") {
            const listeningPath = this.selectOptimalVideo(category, specificVideo, traits, affection);
            const listeningCurrent = this.activeVideo.querySelector("source").getAttribute("src");
            if (listeningCurrent !== listeningPath || this.activeVideo.ended) {
                this.loadAndSwitchVideo(listeningPath, priority);
            }
            this.currentContext = context;
            this.currentEmotion = emotion;
            this.lastSwitchTime = Date.now();
            return;
        }

        // Sélection standard
        let videoPath = this.selectOptimalVideo(category, specificVideo, traits, affection);
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
        let minTransitionDelay = 300; // Base minimum

        const now = Date.now();
        const timeSinceLastSwitch = now - (this.lastSwitchTime || 0);

        // Context-specific timing adjustments
        if (priority === "speaking") {
            minTransitionDelay = 200; // Faster for speech responses
        } else if (context === "listening") {
            minTransitionDelay = 150; // Very fast for listening states
        } else if (context === "dancing") {
            minTransitionDelay = 500; // Slower for dancing transitions
        } else if (context === "neutral") {
            minTransitionDelay = 800; // Slower for neutral returns
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

        this.loadAndSwitchVideo(videoPath, priority);
        this.currentContext = context;
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
            this._globalEndedHandler = () => this.returnToNeutral();
            this.activeVideo.addEventListener("ended", this._globalEndedHandler, { once: true });
            // Safety timer
            if (typeof this.scheduleAutoTransition === "function") {
                this.scheduleAutoTransition(this.autoTransitionDuration || 10000);
            }
            return;
        }

        if (context === "speakingPositive" || context === "speakingNegative") {
            this._globalEndedHandler = () => {
                this.isEmotionVideoPlaying = false;
                this.currentEmotionContext = null;
                this._neutralLock = false;
                this.returnToNeutral();
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

    selectOptimalVideo(category, specificVideo = null, traits = null, affection = null) {
        const availableVideos = this.videoCategories[category] || this.videoCategories.neutral;

        if (specificVideo && availableVideos.includes(specificVideo)) {
            this.updatePlayHistory(category, specificVideo);
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
                    // More positive videos when affection is high, but not extreme
                    return 1 + (affection / 100) * 0.3;
                }
                if (category === "speakingNegative") {
                    // More negative/shy videos when affection is low
                    return 1 + ((100 - affection) / 100) * 0.4;
                }
                if (category === "neutral") {
                    // Neutral videos when affection is moderate
                    return 1 + (Math.abs(50 - affection) / 100) * 0.2;
                }
                if (category === "dancing") {
                    // Dancing strongly influenced by playfulness but capped
                    return 1 + Math.min(0.6, (traits.playfulness / 100) * 0.7);
                }
                if (category === "listening") {
                    // Listening influenced by empathy and attention
                    const empathyWeight = (traits.empathy || 50) / 100;
                    return 1 + empathyWeight * 0.2;
                }
                return 1;
            });

            const total = weights.reduce((a, b) => a + b, 0);
            let r = Math.random() * total;
            for (let i = 0; i < candidateVideos.length; i++) {
                if (r < weights[i]) {
                    return candidateVideos[i];
                }
                r -= weights[i];
            }
            const selectedVideo = candidateVideos[0];
            this.updatePlayHistory(category, selectedVideo);
            return selectedVideo;
        }

        const selectedVideo = candidateVideos[Math.floor(Math.random() * candidateVideos.length)];
        this.updatePlayHistory(category, selectedVideo);
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
        // Prefer explicit context mapping if provided (e.g., 'listening','dancing')
        if (this.emotionToCategory && this.emotionToCategory[context]) {
            return this.emotionToCategory[context];
        }
        // Normalize generic 'speaking' by emotion polarity
        if (context === "speaking") {
            if (emotion === "positive") return "speakingPositive";
            if (emotion === "negative") return "speakingNegative";
            return "neutral";
        }
        // Map by emotion label when possible
        if (this.emotionToCategory && this.emotionToCategory[emotion]) {
            return this.emotionToCategory[emotion];
        }
        return "neutral";
    }

    // SPECIALIZED METHODS FOR EACH CONTEXT
    startListening() {
        if (this.currentContext === "listening" && !this.activeVideo.paused && !this.activeVideo.ended) {
            return;
        }
        this.switchToContext("listening");
    }

    respondWithEmotion(emotion, traits = null, affection = null) {
        if (this.isEmotionVideoPlaying && this.currentEmotionContext === emotion) return;
        this.isEmotionVideoPlaying = true;
        this.currentEmotionContext = emotion;
        this.switchToContext("speaking", emotion, null, traits, affection);
    }

    returnToNeutral() {
        // Always ensure we resume playback with a fresh neutral video to avoid freeze
        if (this._neutralLock) return;
        this._neutralLock = true;
        setTimeout(() => {
            this._neutralLock = false;
        }, 1000);
        this.isEmotionVideoPlaying = false;
        this.currentEmotionContext = null;

        // Force-select a neutral clip different from current, then load and switch
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
            if (typeof this._rememberPlayed === "function") this._rememberPlayed(category, nextSrc);
            this.currentContext = "neutral";
            this.currentEmotion = "neutral";
            this.lastSwitchTime = Date.now();
        } else {
            // Fallback to existing path if list empty
            this.switchToContext("neutral");
        }
    }

    // ADVANCED CONTEXTUAL ANALYSIS
    // ADVANCED CONTEXTUAL ANALYSIS - SIMPLIFIED
    async analyzeAndSelectVideo(userMessage, kimiResponse, emotionAnalysis, traits = null, affection = null, lang = null) {
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

        // Special case: Auto-dancing if playfulness very high
        if (traits && typeof traits.playfulness === "number" && traits.playfulness >= 85) {
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
            // Map emotion to context using our emotion mapping
            const targetCategory = this.emotionToCategory[dominant];
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

        // Default to neutral context
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
                this.returnToNeutral();
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
        // Only log high priority or error cases to reduce noise
        if (priority === "speaking" || priority === "high") {
            console.log(`🎬 Loading video: ${videoSrc} (priority: ${priority})`);
        }

        // Si une vidéo haute priorité arrive, on peut interrompre le chargement en cours
        if (this._loadingInProgress) {
            if (priority === "high" || priority === "speaking") {
                this._loadingInProgress = false;
                // Nettoyer les event listeners en cours sur la vidéo inactive
                this.inactiveVideo.removeEventListener("canplaythrough", this._currentLoadHandler);
                this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
            } else {
                return;
            }
        }

        this._loadingInProgress = true;

        // Nettoyer tous les timers en cours
        clearTimeout(this.autoTransitionTimer);

        // Direct video loading - no preloader needed
        this.inactiveVideo.querySelector("source").setAttribute("src", videoSrc);
        this.inactiveVideo.load();

        // Stocker les références aux handlers pour pouvoir les nettoyer
        this._currentLoadHandler = () => {
            this._loadingInProgress = false;
            this.performSwitch();
        };

        const folder = getCharacterInfo(this.characterName).videoFolder;
        const fallbackVideo = `${folder}neutral/neutral-gentle-breathing.mp4`;

        this._currentErrorHandler = e => {
            console.warn(`Error loading video: ${videoSrc}, falling back to: ${fallbackVideo}`);
            this._loadingInProgress = false;
            if (videoSrc !== fallbackVideo) {
                // Try fallback video
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
        };

        this.inactiveVideo.addEventListener("canplaythrough", this._currentLoadHandler, { once: true });
        this.inactiveVideo.addEventListener("error", this._currentErrorHandler, { once: true });
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

        this.inactiveVideo.addEventListener("canplaythrough", this._currentLoadHandler, { once: true });
    }

    performSwitch() {
        // Prevent rapid double toggles
        if (this._switchInProgress) {
            return;
        }
        this._switchInProgress = true;

        this.activeVideo.classList.remove("active");
        this.inactiveVideo.classList.add("active");
        const temp = this.activeVideo;
        this.activeVideo = this.inactiveVideo;
        this.inactiveVideo = temp;

        const playPromise = this.activeVideo.play();
        if (playPromise && typeof playPromise.then === "function") {
            playPromise
                .then(() => {
                    // Reduced logging for video playing events
                    this._switchInProgress = false;
                    // Configurer les event listeners APRÈS que la vidéo commence à jouer
                    this.setupEventListenersForContext(this.currentContext);
                })
                .catch(error => {
                    console.warn("Failed to play video:", error);
                    this._switchInProgress = false;
                    // Even in case of error, configure listeners
                    this.setupEventListenersForContext(this.currentContext);
                });
        } else {
            // Fallback si pas de Promise
            this._switchInProgress = false;
            this.setupEventListenersForContext(this.currentContext);
        }
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
    analyzeTextEmotion(text) {
        // Use unified emotion system
        return window.kimiAnalyzeEmotion ? window.kimiAnalyzeEmotion(text, "auto") : "neutral";
    } // CLEANUP
    destroy() {
        clearTimeout(this.autoTransitionTimer);
        this.autoTransitionTimer = null;
    }

    // Utilitaire pour déterminer la catégorie vidéo selon la moyenne des traits
    setMoodByPersonality(traits) {
        const category = getMoodCategoryFromPersonality(traits);
        this.switchToContext(category, category, null, traits, traits.affection);
    }

    _cleanupLoadingHandlers() {
        if (this._currentLoadHandler) {
            this.inactiveVideo.removeEventListener("canplaythrough", this._currentLoadHandler);
            this._currentLoadHandler = null;
        }
        if (this._currentErrorHandler) {
            this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
            this._currentErrorHandler = null;
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

    // Fallback (should not be reached)
    const keys = ["affection", "romance", "empathy", "playfulness", "humor"];
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
                this.adjustTabsForScrollbar();
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
                        // ...
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
        this._initSliders();
    }
    _initSliders() {
        document.querySelectorAll(".kimi-slider").forEach(slider => {
            const valueSpan = document.getElementById(slider.id + "-value");
            if (valueSpan) {
                valueSpan.textContent = slider.value;
            }
            slider.addEventListener("input", async e => {
                if (valueSpan) valueSpan.textContent = slider.value;
                if (this.db) {
                    const settingName = slider.id.replace("trait-", "").replace("voice-", "").replace("llm-", "");
                    if (slider.id.startsWith("trait-")) {
                        const selectedCharacter = await this.db.getSelectedCharacter();
                        await this.db.setPersonalityTrait(settingName, parseInt(slider.value), selectedCharacter);

                        // Update memory cache if available
                        if (this.memory && settingName === "affection") {
                            this.memory.affectionTrait = parseInt(slider.value);
                            if (this.memory.updateFavorabilityBar) {
                                this.memory.updateFavorabilityBar();
                            }
                        }

                        // Update video context based on new personality values
                        if (window.kimiVideo && window.kimiVideo.setMoodByPersonality) {
                            const allTraits = await this.db.getAllPersonalityTraits(selectedCharacter);
                            window.kimiVideo.setMoodByPersonality(allTraits);
                        }

                        // Favorability bar is automatically updated by KimiMemory system
                    } else if (slider.id.startsWith("voice-")) {
                        await this.db.setPreference(settingName, parseFloat(slider.value));
                        if (window.voiceManager && window.voiceManager.updateSettings) {
                            window.voiceManager.updateSettings();
                        }
                    } else {
                        await this.db.setPreference(settingName, parseFloat(slider.value));

                        // Update LLM settings if needed
                        if (slider.id.startsWith("llm-") && window.kimiLLM) {
                            if (window.kimiLLM.updateSettings) {
                                window.kimiLLM.updateSettings();
                            }
                        }
                    }
                }
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
    setFavorability(value) {
        const v = Number(value) || 0;
        const clamped = Math.max(0, Math.min(100, v));
        this.state.favorability = clamped;
        window.KimiDOMUtils.setText("#favorability-text", `${clamped.toFixed(2)}%`);
        window.KimiDOMUtils.get("#favorability-bar").style.width = `${clamped}%`;
    }
    setTranscript(text) {
        this.state.transcript = text;
        window.KimiDOMUtils.setText("#transcript", text);
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
                fr: "Pour vraiment discuter avec moi, ajoute ta clé API OpenRouter dans les paramètres ! 💕",
                en: "To really chat with me, add your OpenRouter API key in settings! 💕",
                es: "Para realmente chatear conmigo, ¡agrega tu clave API de OpenRouter en configuración! 💕",
                de: "Um wirklich mit mir zu chatten, füge deinen OpenRouter API-Schlüssel in den Einstellungen hinzu! 💕",
                it: "Per chattare davvero con me, aggiungi la tua chiave API OpenRouter nelle impostazioni! 💕"
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
                return "To really chat with me, add your OpenRouter API key in settings! 💕";
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
