// Utility class for centralized video management
class KimiVideoManager {
    constructor(video1, video2, characterName = "kimi") {
        // Fixed clip duration (all character videos are 10s)
        this.CLIP_DURATION_MS = 10000;
        this.characterName = characterName;
        this.video1 = video1;
        this.video2 = video2;
        this.activeVideo = video1;
        this.inactiveVideo = video2;
        this.currentContext = "neutral";
        this.currentEmotion = "neutral";
        this.lastSwitchTime = Date.now();
        this.pendingSwitch = null;
        this.autoTransitionDuration = this.CLIP_DURATION_MS;
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
        // Track per-video load attempts to adapt timeouts & avoid faux échecs
        this._videoAttempts = new Map();
        // Neutral pipeline disabled (previously handled seamless chaining)
        this.enableNeutralPipeline = false;
        this._nextNeutralPlannedAt = 0;
        this._scheduledNextNeutral = null;
        this._scheduledNeutralReady = false;
        this._neutralGapMetrics = null;
        // Speaking polarity throttling (prevents rapid flip-flop between positive / negative clips)
        this._speakingPolarityLast = null; // 'positive' | 'negative'
        this._speakingPolarityLastTs = 0;
        this._speakingPolarityBaseInterval = 2500; // base ms between polarity changes (will be scaled)
        this._speakingPolarityOverride = null; // manual override (ms) if set
        this._speakingPolarityRejectCount = 0; // number of consecutive rejected flips
        this._speakingPolarityMaxRejects = 2; // after this many rejects, allow next flip
        this._avgSpeakingDuration = 10000; // ms approximate; can refine after metadata

        // Ensure the initially active video is visible (remove any stale inline opacity)
        try {
            if (this.activeVideo && this.activeVideo.style && this.activeVideo.classList.contains("active")) {
                this.activeVideo.style.opacity = ""; // rely purely on CSS class
            }
        } catch {}

        // Optional debug overlay (activated via setDebug(true))
        this._debugOverlay = null;
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
        if (this._debug && !this._debugOverlay) {
            this._installDebugOverlay();
        } else if (!this._debug && this._debugOverlay) {
            try {
                this._debugOverlay.remove();
            } catch {}
            this._debugOverlay = null;
        }
    }

    _logDebug(message, payload = null) {
        if (!this._debug) return;
        if (payload) console.log("🎬 VideoManager:", message, payload);
        else console.log("🎬 VideoManager:", message);
        this._updateDebugOverlay();
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

    // Dynamically derive minimum interval between polarity changes using avg clip duration, with optional override.
    _getPolarityMinInterval() {
        if (typeof this._speakingPolarityOverride === "number") return this._speakingPolarityOverride;
        const avg = this._avgSpeakingDuration || 10000; // ms
        const derived = Math.round(avg * 0.22); // ~2200ms for 10s
        const blended = Math.round((derived + this._speakingPolarityBaseInterval) / 2);
        return Math.min(3400, Math.max(1900, blended));
    }

    setPolarityInterval(ms) {
        if (typeof ms === "number" && ms >= 500) this._speakingPolarityOverride = ms;
    }

    clearPolarityIntervalOverride() {
        this._speakingPolarityOverride = null;
    }

    _updateAvgSpeakingDuration(sampleDurationMs) {
        if (!sampleDurationMs || isNaN(sampleDurationMs) || sampleDurationMs < 500) return;
        const alpha = 0.25;
        this._avgSpeakingDuration = this._avgSpeakingDuration
            ? Math.round(alpha * sampleDurationMs + (1 - alpha) * this._avgSpeakingDuration)
            : sampleDurationMs;
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

        // Clean up the ongoing handlers when changing characters.
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

        // Determine the priority according to the context.
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
            this._stickyUntil = Date.now() + (this.CLIP_DURATION_MS - 500);
        }

        // Optimized path when TTS is speaking/listening (avoids flickering)
        if (
            window.voiceManager &&
            window.voiceManager.isSpeaking &&
            (context === "speaking" || context === "speakingPositive" || context === "speakingNegative")
        ) {
            // Throttle polarity oscillations (e.g., positive -> negative -> positive too fast)
            const nowTs = Date.now();
            const desiredPolarity = emotion === "negative" ? "negative" : "positive";
            const polarityInterval = this._getPolarityMinInterval();
            if (
                this._speakingPolarityLast &&
                this._speakingPolarityLast !== desiredPolarity &&
                nowTs - this._speakingPolarityLastTs < polarityInterval &&
                this._speakingPolarityRejectCount < this._speakingPolarityMaxRejects
            ) {
                // Force reuse last polarity within throttle window
                emotion = this._speakingPolarityLast;
                context = emotion === "negative" ? "speakingNegative" : "speakingPositive";
                this._speakingPolarityRejectCount++;
            }
            const speakingPath = this.selectOptimalVideo(category, specificVideo, traits, affection, emotion);
            const speakingCurrent = this.activeVideo.querySelector("source").getAttribute("src");
            if (speakingCurrent !== speakingPath || this.activeVideo.ended) {
                this.loadAndSwitchVideo(speakingPath, priority);
            }
            // IMPORTANT: normalize to the resolved category (e.g., speakingPositive/Negative)
            this.currentContext = category;
            this.currentEmotion = emotion;
            this.lastSwitchTime = Date.now();
            this._speakingPolarityLast = emotion === "negative" ? "negative" : "positive";
            this._speakingPolarityLastTs = nowTs;
            if (this._debug)
                this._logDebug("Polarity throttle state", {
                    last: this._speakingPolarityLast,
                    interval: this._getPolarityMinInterval()
                });
            if (desiredPolarity === this._speakingPolarityLast) {
                // Flip accepted -> reset rejection counter
                this._speakingPolarityRejectCount = 0;
            }
            if (this._debug)
                this._logDebug("Polarity throttle state", {
                    last: this._speakingPolarityLast,
                    interval: polarityInterval,
                    rejected: this._speakingPolarityRejectCount,
                    override: this._speakingPolarityOverride
                });
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

        // Standard selection
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
                // If still in active listening phase, loop listening instead of neutral
                if (window.voiceManager && window.voiceManager.isListening) {
                    this.isEmotionVideoPlaying = false;
                    this.currentEmotionContext = null;
                    this._neutralLock = false;
                    this.switchToContext("listening", "listening");
                    return;
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
            // Simple neutral loop: rely on returnToNeutral after ended
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

    // Infer appropriate speaking category based on current / recent emotions
    _inferSpeakingCategory(defaultEmotion = "positive") {
        // If we still have an explicit current emotion context, prefer it
        let emo = this.currentEmotionContext || this.currentEmotion || defaultEmotion;
        if (emo !== "positive" && emo !== "negative") {
            // Look back into emotion history for a recent polarity
            if (Array.isArray(this.emotionHistory)) {
                for (let i = this.emotionHistory.length - 1; i >= 0; i--) {
                    const e = this.emotionHistory[i];
                    if (e === "positive" || e === "negative") {
                        emo = e;
                        break;
                    }
                }
            }
        }
        if (emo !== "negative") return { category: "speakingPositive", emotion: "positive" };
        return { category: "speakingNegative", emotion: "negative" };
    }

    returnToNeutral() {
        // Throttle neutral transitions to avoid churn when multiple triggers fire close together
        const nowTs = Date.now();
        if (!this._lastNeutralAt) this._lastNeutralAt = 0;
        const MIN_NEUTRAL_INTERVAL = 800; // ms
        if (nowTs - this._lastNeutralAt < MIN_NEUTRAL_INTERVAL) return;
        this._lastNeutralAt = nowTs;
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

        // Neutral pipeline disabled: pick a fresh neutral only if not actively speaking.
        // If the voice (TTS) is in progress, we switch to an adapted speaking video (positive/negative) instead of looping on neutral.
        if (window.voiceManager && window.voiceManager.isSpeaking) {
            const { category, emotion } = this._inferSpeakingCategory();
            this.switchToContext(category, emotion);
            return;
        }
        // Maintain listening loop while user input capture is active
        if (window.voiceManager && window.voiceManager.isListening) {
            this.switchToContext("listening", "listening");
            return;
        }

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
                    duration = this.CLIP_DURATION_MS; // dancing clip length
                    break;
                case "speakingPositive":
                case "speakingNegative":
                    duration = this.CLIP_DURATION_MS; // speaking clip length
                    break;
                case "neutral":
                    // Pas d'auto-transition pour neutral (état par défaut, boucle en continu)
                    return;
                case "listening":
                    // Pas d'auto-transition pour listening (personnage écoute l'utilisateur)
                    return;
                default:
                    duration = this.autoTransitionDuration; // default derived duration
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

    loadAndSwitchVideo(videoSrc, priority = "normal") {
        const startTs = performance.now();
        // Basic attempt count (max 2 attempts per source in one call chain)
        const attempts = (this._videoAttempts.get(videoSrc) || 0) + 1;
        this._videoAttempts.set(videoSrc, attempts);
        if (attempts > 2) return; // hard stop

        // Cooldown skip (simple): if failed recently, choose another neutral immediately
        const lastFail = this._recentFailures.get(videoSrc);
        if (lastFail && performance.now() - lastFail < this._failureCooldown) {
            const neutrals = (this.videoCategories && this.videoCategories.neutral) || [];
            const alt = neutrals.find(v => v !== videoSrc) || neutrals[0];
            if (alt && alt !== videoSrc) {
                this.loadAndSwitchVideo(alt, priority);
                return;
            }
        }

        const activeSrc = this.activeVideo?.querySelector("source")?.getAttribute("src");
        if (videoSrc === activeSrc && priority !== "speaking" && priority !== "high") return;
        if (this._loadingInProgress && priority !== "speaking" && priority !== "high") return;

        if (this._loadingInProgress) {
            // Cancel current load listeners
            this.inactiveVideo.removeEventListener("canplay", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("loadeddata", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
            if (this._loadTimeout) clearTimeout(this._loadTimeout);
            this._loadingInProgress = false;
        }

        this._loadingInProgress = true;
        clearTimeout(this.autoTransitionTimer);
        if (this._loadTimeout) clearTimeout(this._loadTimeout);
        this._loadTimeout = null;

        this.inactiveVideo.querySelector("source").setAttribute("src", videoSrc);
        try {
            this.inactiveVideo.currentTime = 0;
        } catch {}
        this.inactiveVideo.load();

        let finished = false;
        const finalizeSuccess = () => {
            if (finished) return;
            finished = true;
            this._loadingInProgress = false;
            if (this._loadTimeout) {
                clearTimeout(this._loadTimeout);
                this._loadTimeout = null;
            }
            this.inactiveVideo.removeEventListener("canplay", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("loadeddata", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
            // Rolling avg (light)
            const dt = performance.now() - startTs;
            this._loadTimeSamples.push(dt);
            if (this._loadTimeSamples.length > this._maxSamples) this._loadTimeSamples.shift();
            this._avgLoadTime = this._loadTimeSamples.reduce((a, b) => a + b, 0) / this._loadTimeSamples.length;
            this._consecutiveErrorCount = 0;
            this.performSwitch();
        };

        this._currentLoadHandler = () => finalizeSuccess();

        this._currentErrorHandler = () => {
            if (finished) return;
            finished = true;
            this._loadingInProgress = false;
            if (this._loadTimeout) {
                clearTimeout(this._loadTimeout);
                this._loadTimeout = null;
            }
            this.inactiveVideo.removeEventListener("canplay", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("loadeddata", this._currentLoadHandler);
            this.inactiveVideo.removeEventListener("error", this._currentErrorHandler);
            this._recentFailures.set(videoSrc, performance.now());
            this._consecutiveErrorCount++;
            // Single retry with alternative neutral if first attempt
            if (attempts === 1) {
                const neutrals = (this.videoCategories && this.videoCategories.neutral) || [];
                const alt = neutrals.find(v => v !== videoSrc);
                if (alt) {
                    setTimeout(() => this.loadAndSwitchVideo(alt, priority), 0);
                    return;
                }
            }
            // If no retry path succeeded, invoke centralized recovery
            try {
                this._logDebug && this._logDebug("Video load error → recovery", { src: videoSrc, attempts });
            } catch {}
            this._recoverFromVideoError(videoSrc, priority);
        };

        this.inactiveVideo.addEventListener("loadeddata", this._currentLoadHandler, { once: true });
        this.inactiveVideo.addEventListener("canplay", this._currentLoadHandler, { once: true });
        this.inactiveVideo.addEventListener("error", this._currentErrorHandler, { once: true });

        // Simple timeout: 5000ms + single extension 1500ms if metadata only
        const baseTimeout = 5000;
        this._loadTimeout = setTimeout(() => {
            if (finished) return;
            if (this.inactiveVideo.readyState === 1) {
                // HAVE_METADATA only
                this._loadTimeout = setTimeout(() => {
                    if (!finished) this._currentErrorHandler();
                }, 1500);
                return;
            }
            if (this.inactiveVideo.readyState >= 2) finalizeSuccess();
            else {
                try {
                    this._logDebug && this._logDebug("Video load timeout", { src: videoSrc, rs: this.inactiveVideo.readyState });
                } catch {}
                this._currentErrorHandler();
            }
        }, baseTimeout);
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

        const finalizeSwap = () => {
            // Clear any inline opacity to rely solely on class-based visibility
            fromVideo.style.opacity = "";
            toVideo.style.opacity = "";

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
                            try {
                                const d = this.activeVideo.duration;
                                if (!isNaN(d) && d > 0.5) {
                                    const target = Math.max(1000, d * 1000 - 1100);
                                    this.autoTransitionDuration = target;
                                } else {
                                    this.autoTransitionDuration = this.CLIP_DURATION_MS;
                                }
                                this._prefetchNeutralDynamic();
                            } catch {}
                        } catch {}
                        this._switchInProgress = false;
                        this.setupEventListenersForContext(this.currentContext);
                        this._startFreezeWatchdog();
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
                // Non-promise fallback
                this._switchInProgress = false;
                try {
                    const d = this.activeVideo.duration;
                    if (!isNaN(d) && d > 0.5) {
                        const target = Math.max(1000, d * 1000 - 1100);
                        this.autoTransitionDuration = target;
                    } else {
                        this.autoTransitionDuration = this.CLIP_DURATION_MS;
                    }
                    this._prefetchNeutralDynamic();
                } catch {}
                this.setupEventListenersForContext(this.currentContext);
                this._startFreezeWatchdog();
            }
        };

        // Ensure target video is at start and attempt playback ahead of swap
        try {
            toVideo.currentTime = 0;
        } catch {}
        const ready = toVideo.readyState >= 2; // HAVE_CURRENT_DATA
        const performSimpleSwap = () => {
            // Remove active class from old, add to new, rely on CSS transitions (opacity) only
            fromVideo.classList.remove("active");
            toVideo.classList.add("active");
            finalizeSwap();
        };
        if (!ready) {
            const onReady = () => {
                toVideo.removeEventListener("canplay", onReady);
                performSimpleSwap();
            };
            toVideo.addEventListener("canplay", onReady, { once: true });
            try {
                toVideo.load();
            } catch {}
            toVideo.play().catch(() => {});
        } else {
            toVideo.play().catch(() => {});
            performSimpleSwap();
        }
    }

    /**
     * Ensure videos resume correctly when a blocking modal (settings or memory) is closed.
     * Some browsers may pause autoplaying inline videos when large overlays appear; we hook
     * into overlay class / style changes to attempt a resume if appropriate.
     */
    // Attempt to chain another speaking video when current one stalls/ends but TTS continues
    _chainSpeakingFallback() {
        try {
            const emotion = this.currentEmotionContext || this.currentEmotion || "positive";
            const category = emotion === "negative" ? "speakingNegative" : "speakingPositive";
            const next = this.selectOptimalVideo(category, null, null, null, emotion);
            if (next) {
                this.loadAndSwitchVideo(next, "speaking");
                this.currentContext = category;
                this.currentEmotion = emotion === "negative" ? "negative" : "positive";
                this.isEmotionVideoPlaying = true;
                this.currentEmotionContext = emotion;
                this.lastSwitchTime = Date.now();
            }
        } catch {}
    }

    // Central recovery path for load errors or repeated stalls
    _recoverFromVideoError(failedSrc, priority) {
        try {
            if (window.voiceManager && window.voiceManager.isSpeaking) {
                this._chainSpeakingFallback();
                return;
            }
            if (window.voiceManager && window.voiceManager.isListening) {
                this.switchToContext("listening", "listening");
                return;
            }
            this.returnToNeutral();
        } catch {}
    }

    _installModalResumeObserver() {
        if (this._modalObserverInstalled) return;
        this._modalObserverInstalled = true;
        const tryResume = () => {
            try {
                const v = this.activeVideo;
                if (v && v.paused && !v.ended) {
                    v.play().catch(() => {});
                } else if (v && v.ended && typeof this.returnToNeutral === "function") {
                    this.returnToNeutral();
                }
            } catch {}
        };
        const observeEl = id => {
            const el = document.getElementById(id);
            if (!el) return;
            const obs = new MutationObserver(muts => {
                for (const m of muts) {
                    if (m.type === "attributes" && (m.attributeName === "class" || m.attributeName === "style")) {
                        // When modal becomes hidden
                        const hidden = (el.style.display && el.style.display === "none") || !el.classList.contains("visible");
                        if (hidden) setTimeout(tryResume, 30);
                    }
                }
            });
            obs.observe(el, { attributes: true, attributeFilter: ["class", "style"] });
        };
        // Known modals
        observeEl("memory-overlay");
        observeEl("settings-overlay");
        // Visibility change (tab switching)
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) setTimeout(tryResume, 60);
        });
    }

    // (Removed JS crossfade: now handled purely by CSS transitions on the .active class.)

    // Watchdog to detect freeze when a 10s clip reaches end but 'ended' listener may not fire (browser quirk)
    _startFreezeWatchdog() {
        clearInterval(this._freezeInterval);
        const v = this.activeVideo;
        if (!v) return;
        const CHECK_MS = 1000;
        this._lastProgressTime = Date.now();
        let lastTime = v.currentTime;
        // Stalled detection via progress event
        const onStalled = () => {
            this._lastProgressTime = Date.now();
        };
        v.addEventListener("timeupdate", onStalled);
        v.addEventListener("progress", onStalled);
        this._freezeInterval = setInterval(() => {
            if (v !== this.activeVideo) return; // switched
            const dur = v.duration || 9.9; // assume 9.9s
            const nearEnd = v.currentTime >= dur - 0.25; // last 250ms
            const progressed = v.currentTime !== lastTime;
            if (progressed) {
                lastTime = v.currentTime;
                this._lastProgressTime = Date.now();
            }
            // If near end and not auto-transitioned within 500ms, trigger manual neutral
            if (nearEnd && Date.now() - this._lastProgressTime > 600) {
                // Ensure we are not already neutral cycling
                if (this.currentContext === "neutral") {
                    // Pick another neutral to animate
                    try {
                        this.returnToNeutral();
                    } catch {}
                } else {
                    if (!this._processPendingSwitches()) this.returnToNeutral();
                }
            }
            // Extra safety: if video paused unexpectedly before end
            if (!v.paused && !v.ended && Date.now() - this._lastProgressTime > 4000) {
                try {
                    v.play().catch(() => {});
                } catch {}
            } else if (v.paused && !v.ended) {
                // Resume if paused but not finished
                try {
                    v.play().catch(() => {});
                } catch {}
            }
            // Cleanup if naturally ended (ended handler will schedule next)
            if (v.ended) {
                clearInterval(this._freezeInterval);
                v.removeEventListener("timeupdate", onStalled);
                v.removeEventListener("progress", onStalled);
            }
        }, CHECK_MS);
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

    _installDebugOverlay() {
        const div = document.createElement("div");
        div.style.position = "fixed";
        div.style.bottom = "6px";
        div.style.left = "6px";
        div.style.padding = "6px 8px";
        div.style.background = "rgba(0,0,0,0.55)";
        div.style.color = "#fff";
        div.style.font = "12px/1.35 monospace";
        div.style.zIndex = 9999;
        div.style.pointerEvents = "none";
        div.style.borderRadius = "4px";
        div.style.maxWidth = "300px";
        div.style.whiteSpace = "pre-wrap";
        div.id = "kimi-video-debug";
        document.body.appendChild(div);
        this._debugOverlay = div;
        this._updateDebugOverlay();
    }

    _updateDebugOverlay() {
        if (!this._debug || !this._debugOverlay) return;
        const v = this.activeVideo;
        let info = this.getCurrentVideoInfo();
        let status = "";
        try {
            status =
                `t=${v.currentTime.toFixed(2)} / ${isNaN(v.duration) ? "?" : v.duration.toFixed(2)}\n` +
                `paused=${v.paused} ended=${v.ended} ready=${v.readyState}\n` +
                `ctx=${info.context} emo=${info.emotion}\n` +
                `switching=${this._switchInProgress} loading=${this._loadingInProgress}`;
        } catch {
            status = "n/a";
        }
        this._debugOverlay.textContent = status;
    }

    // Public helper to ensure the active clip is playing (centralized safety)
    ensureActivePlayback() {
        try {
            const v = this.activeVideo;
            if (!v) return;
            if (v.ended) {
                this.returnToNeutral();
                return;
            }
            if (v.paused) v.play().catch(() => {});
        } catch {}
    }

    // Neutral pipeline methods removed (simplified looping now handled by returnToNeutral + ended handlers)

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
        const category = window.getMoodCategoryFromPersonality ? window.getMoodCategoryFromPersonality(traits) : "neutral";
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

// Expose globally for code that expects a window-level KimiVideoManager
window.KimiVideoManager = KimiVideoManager;

// Also provide ES module exports for modern imports
export { KimiVideoManager };
