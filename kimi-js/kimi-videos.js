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
        // --- FSM Integration (additive, non-breaking) ---
        try {
            if (window.createKimiVideoFSM) {
                this._fsm = window.createKimiVideoFSM();
            }
        } catch {}
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
        // Track per-video load attempts to adapt timeouts & avoid faux échecs
        this._videoAttempts = new Map();

        // Error handling and recovery system
        this._errorRecoveryAttempts = 0;
        this._maxRecoveryAttempts = 3;
        this._lastErrorTime = 0;
        this._errorThreshold = 5000; // 5 seconds between error recovery attempts

        // ===== RUNTIME CONFIG (can be overridden before instantiation) =====
        // window.KIMI_VIDEO_CONFIG = {
        //   sticky:{ speakingMs:15000, dancingMs:9500, speakingMinMs:5000, speakingMaxMs:16000 },
        //   emit:true,
        //   ttsCharsPerSecond:14,
        //   emotionHalfLifeMs:6000,
        //   maxRapidSwitchHz:6
        // }
        const cfg = (window.KIMI_VIDEO_CONFIG = window.KIMI_VIDEO_CONFIG || {});
        cfg.sticky = cfg.sticky || { speakingMs: 15000, dancingMs: 9500 };
        if (typeof cfg.sticky.speakingMs !== "number") cfg.sticky.speakingMs = 15000;
        if (typeof cfg.sticky.dancingMs !== "number") cfg.sticky.dancingMs = 9500;
        cfg.emit = cfg.emit !== false; // default true

        // ===== METRICS =====
        this._metrics = {
            switches: 0,
            selections: 0,
            loadSuccess: 0,
            loadError: 0,
            recoveries: 0,
            lastContext: null,
            avgLoadMs: 0
        };

        // Plugin hook registry (lightweight): { event:{id:fn}, scoreAdjust:[fn] }
        this._hooks = { events: {}, scoreAdjust: {} }; // events keyed by event name, multiple ids
    }

    // Internal helper: return an alternative video different from current if possible
    _pickDifferent(list, current) {
        if (!Array.isArray(list) || list.length === 0) return null;
        const alternatives = list.filter(v => v !== current);
        if (alternatives.length === 0) return list[0];
        return alternatives[Math.floor(Math.random() * alternatives.length)];
    }

    // ===== EVENT EMISSION / PLUGIN DISPATCH =====
    _emit(type, detail = {}) {
        if (!window.KIMI_VIDEO_CONFIG || window.KIMI_VIDEO_CONFIG.emit === false) return;
        const eventName = `video:${type}`;
        if (window.emitAppEvent) {
            window.emitAppEvent(eventName, detail);
        } else {
            try {
                window.dispatchEvent(new CustomEvent(eventName, { detail }));
            } catch {}
        }
        // Execute plugin event hooks
        const bucket = this._hooks.events[type];
        if (bucket) {
            Object.values(bucket).forEach(fn => {
                try {
                    fn({ manager: this, type, detail });
                } catch (e) {
                    if (window.KIMI_CONFIG?.DEBUG?.VIDEO) console.warn("Hook error", type, e);
                }
            });
        }
    }

    getMetrics() {
        return { ...this._metrics, avgLoadMs: this._avgLoadTime || 0 };
    }

    // ===== ERROR HANDLING AND RECOVERY SYSTEM =====
    _handleVideoError(error, videoSrc = null, context = "unknown") {
        this._consecutiveErrorCount++;
        this._lastErrorTime = Date.now();

        const errorInfo = {
            error: error.message || "Unknown video error",
            videoSrc: videoSrc || "unknown",
            context,
            timestamp: Date.now(),
            consecutiveCount: this._consecutiveErrorCount
        };

        if (window.KIMI_CONFIG?.DEBUG?.VIDEO) {
            console.warn("🎬 Video error occurred:", errorInfo);
        }
        this._metrics.loadError++;
        this._emit("error", errorInfo);

        // Track failures for this specific video
        if (videoSrc) {
            this._recentFailures.set(videoSrc, Date.now());
        }

        // Attempt recovery if not too many consecutive errors
        if (this._consecutiveErrorCount <= this._maxRecoveryAttempts) {
            this._attemptErrorRecovery(context);
        } else {
            console.error("🎬 Too many consecutive video errors, disabling auto-recovery");
            this._fallbackToSafeState();
        }
    }

    _attemptErrorRecovery(context) {
        console.log("🎬 Attempting video error recovery...");
        // Dual legacy + new naming
        this._emit("recovery:start", { context });
        this._emit("stabilize:start", { context });

        // Try to switch to a safe neutral video
        setTimeout(() => {
            try {
                // Choose a different neutral video that hasn't failed recently
                const neutralVideos = this.videoCategories.neutral || [];
                const safeVideos = neutralVideos.filter(
                    video => !this._recentFailures.has(video) || Date.now() - this._recentFailures.get(video) > this._failureCooldown
                );

                if (safeVideos.length > 0) {
                    const safeVideo = safeVideos[0];
                    this._resetErrorState();
                    this.loadAndSwitchVideo(safeVideo, "high");
                    console.log("🎬 Video pipeline stabilized");
                    this._metrics.recoveries++;
                    this._emit("recovery:success", { context, video: safeVideo });
                    this._emit("stabilize:success", { context, video: safeVideo });
                } else {
                    this._fallbackToSafeState();
                }
            } catch (recoveryError) {
                console.error("🎬 Video recovery failed:", recoveryError);
                this._fallbackToSafeState();
            }
        }, 1000); // Small delay before recovery attempt
    }

    _fallbackToSafeState() {
        console.log("🎬 Falling back to safe state - pausing video system");
        this._emit("recovery:fallback", {});
        this._emit("stabilize:fallback", {});

        // Pause both videos to avoid further errors
        try {
            this.activeVideo?.pause();
            this.inactiveVideo?.pause();
        } catch (e) {
            // Silent fallback
        }

        // Clear all pending operations
        this._pendingSwitches.length = 0;
        this._stickyContext = null;
        this._stickyUntil = 0;
        this.isEmotionVideoPlaying = false;

        // Reset state with long cooldown
        setTimeout(() => {
            this._resetErrorState();
            console.log("🎬 Video system ready for retry");
        }, 10000);
    }

    _resetErrorState() {
        this._consecutiveErrorCount = 0;
        this._errorRecoveryAttempts = 0;

        // Clean old failure records
        const now = Date.now();
        for (const [video, timestamp] of this._recentFailures.entries()) {
            if (now - timestamp > this._failureCooldown) {
                this._recentFailures.delete(video);
            }
        }
    }

    _isVideoSafe(videoSrc) {
        if (!this._recentFailures.has(videoSrc)) return true;

        const lastFailure = this._recentFailures.get(videoSrc);
        return Date.now() - lastFailure > this._failureCooldown;
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
        video.innerHTML = '<source src="" type="video/mp4" /><span data-i18n="video_not_supported">Your browser does not support the video tag.</span>';
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
        if (!this._debug && !window.KIMI_CONFIG?.DEBUG?.VIDEO) return;
        if (payload) console.log("🎬 VideoManager:", message, payload);
        else console.log("🎬 VideoManager:", message);
    }

    _logSelection(category, selectedSrc, candidates = []) {
        if (!this._debug && !window.KIMI_CONFIG?.DEBUG?.VIDEO) return;
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
        if (!this._debug && !window.KIMI_CONFIG?.DEBUG?.VIDEO) return;
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

    _priorityWeight(context, emotion = "neutral") {
        // FSM-aware priority lookup
        try {
            if (this._fsm && this._fsm.getPriority) {
                // Resolve a target state then ask FSM priority
                const resolved = this._fsm.resolve(context, emotion);
                return this._fsm.getPriority(resolved.state);
            }
        } catch {}
        // Fallback to emotion system
        if (window.kimiEmotionSystem?.getPriorityWeight) {
            const emotionPriority = window.kimiEmotionSystem.getPriorityWeight(emotion);
            const contextPriority = window.kimiEmotionSystem.getPriorityWeight(context);
            return Math.max(emotionPriority, contextPriority);
        }
        // Legacy fallback
        if (context === "dancing") return 10;
        if (context === "listening") return 7;
        if (context === "speaking" || context === "speakingPositive" || context === "speakingNegative") return 4;
        return 3;
    }

    _enqueuePendingSwitch(req) {
        // Intelligent queue management - limit to 3 for better responsiveness
        const maxSize = 3;

        // Check if we already have a similar request (same context + emotion)
        const existingIndex = this._pendingSwitches.findIndex(pending => pending.context === req.context && pending.emotion === req.emotion);

        if (existingIndex !== -1) {
            // Replace existing similar request with newer one
            this._pendingSwitches[existingIndex] = req;
            this._logDebug("Replaced similar pending switch", { context: req.context, emotion: req.emotion });
        } else {
            // Add new request
            this._pendingSwitches.push(req);

            // If exceeded max size, remove oldest lower-priority request
            if (this._pendingSwitches.length > maxSize) {
                // Sort by priority weight (lower = remove first) then by age (older = remove first)
                this._pendingSwitches.sort((a, b) => {
                    const priorityDiff = (b.priorityWeight || 1) - (a.priorityWeight || 1);
                    if (priorityDiff !== 0) return priorityDiff;
                    return a.requestedAt - b.requestedAt; // Older first
                });

                // Remove the lowest priority, oldest request
                const removed = this._pendingSwitches.shift();
                this._logDebug("Removed low-priority pending switch", {
                    removed: removed.context,
                    queueSize: this._pendingSwitches.length
                });
            }
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

        // Rebuild neutral prefetch cache when character changes
        try {
            this._prefetchCache.clear();
            const neutrals = (this.videoCategories && this.videoCategories.neutral) || [];
            neutrals.slice(0, 2).forEach(src => this._prefetch(src));
        } catch {}
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
                `${folder}neutral/neutral-affectionate-kiss-blow.mp4`,
                `${folder}neutral/neutral-graceful-flirt-dance.mp4`,
                `${folder}neutral/neutral-lively-charm-bounce.mp4`,
                `${folder}neutral/neutral-relaxed-stretch-charm.mp4`
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
    switchToContext(context, emotion = "neutral", specificVideo = null, traits = null, affection = null, force = false) {
        // Log context switch for debugging
        console.log(`🎯 Context switch: ${this.currentContext}/${this.currentEmotion} → ${context}/${emotion}${force ? " (FORCED)" : ""}`);
        this._emit("beforeSwitch", { fromContext: this.currentContext, fromEmotion: this.currentEmotion, toContext: context, toEmotion: emotion, force });

        // --- FSM PRE-PROCESSING ---
        let fsmResolved = null;
        let fsmTransitionAllowed = true;
        if (this._fsm && !force) {
            try {
                fsmResolved = this._fsm.resolve(context, emotion);
                const can = this._fsm.canTransition(fsmResolved.state);
                if (!can.allow) {
                    this._logDebug("FSM blocked transition", { reason: can.reason, requested: fsmResolved.state });
                    // Queue instead of dropping if sticky prevents immediate change
                    if (can.reason && (can.reason.includes("sticky") || can.reason.includes("block"))) {
                        const priorityWeight = this._priorityWeight(context, emotion);
                        this._enqueuePendingSwitch({
                            context,
                            emotion,
                            specificVideo,
                            traits,
                            affection,
                            requestedAt: Date.now(),
                            priorityWeight
                        });
                    }
                    return;
                }
            } catch (e) {
                this._logDebug("FSM error (ignored)", e);
            }
        }

        // Respect sticky context (avoid overrides while dancing/speaking is active) unless forced
        if (this._stickyContext === "dancing" && context !== "dancing" && !force) {
            const categoryForPriority = this.determineCategory(context, emotion, traits);
            const priorityWeight = this._priorityWeight(context, emotion);
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

        // Respect sticky context for speaking (avoid interruption during TTS)
        if (this._stickyContext === "speaking" && context !== "speakingPositive" && context !== "speakingNegative" && context !== "speaking" && !force) {
            if (Date.now() < (this._stickyUntil || 0)) {
                console.log(`🎯 Ignoring transition during speaking (sticky): ${context}/${emotion}`);
                return;
            }
            this._stickyContext = null;
            this._stickyUntil = 0;
        }

        // Check priority for forced interruptions
        const incomingPriority = this._priorityWeight(context, emotion);
        const currentPriority = this._priorityWeight(this.currentContext, this.currentEmotion);

        // While an emotion video is playing (speaking), block non-speaking context switches unless high priority or forced
        if (
            this.isEmotionVideoPlaying &&
            (this.currentContext === "speaking" || this.currentContext === "speakingPositive" || this.currentContext === "speakingNegative") &&
            !(context === "speaking" || context === "speakingPositive" || context === "speakingNegative") &&
            !force
        ) {
            // Si priorité incoming très supérieure, interrompre immédiatement
            if (incomingPriority >= 8 && incomingPriority > currentPriority + 2) {
                this._logDebug("Interrupting speaking for high priority", { context, emotion, incomingPriority, currentPriority });
                // Continuer le traitement au lieu de return
            } else {
                // Queue normal pour priorités similaires
                const categoryForPriority = this.determineCategory(context, emotion, traits);
                const priorityWeight = this._priorityWeight(context, emotion);
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
        }

        // While speaking emotion video is playing, also queue speaking→speaking changes (avoid mid-clip replacement)
        if (
            this.isEmotionVideoPlaying &&
            (this.currentContext === "speaking" || this.currentContext === "speakingPositive" || this.currentContext === "speakingNegative") &&
            (context === "speaking" || context === "speakingPositive" || context === "speakingNegative") &&
            this.currentEmotionContext &&
            this.currentEmotionContext !== emotion
        ) {
            const priorityWeight = this._priorityWeight(context, emotion);
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

        // Determine the category FIRST (FSM aware)
        let category;
        if (fsmResolved) {
            category = fsmResolved.category;
        } else {
            category = this.determineCategory(context, emotion, traits);
        }

        // Throttle rapid switches (except high priority) based on configurable Hz
        const hz = window.KIMI_VIDEO_CONFIG?.maxRapidSwitchHz || 6; // switches/sec
        if (hz > 0) {
            const nowTs = Date.now();
            if (!this._recentSwitchTimestamps) this._recentSwitchTimestamps = [];
            this._recentSwitchTimestamps = this._recentSwitchTimestamps.filter(t => nowTs - t < 1000);
            const isHigh = category.startsWith("speaking") || context === "dancing";
            if (this._recentSwitchTimestamps.length >= hz && !isHigh && !force) {
                this._logDebug("Switch throttled", { category, emotion });
                return;
            }
            this._recentSwitchTimestamps.push(nowTs);
        }

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
            this._stickyUntil = Date.now() + this._getStickyDuration("dancing");
        }

        // Set sticky lock for speaking to avoid being interrupted during TTS
        if (context === "speakingPositive" || context === "speakingNegative" || context === "speaking") {
            this._stickyContext = "speaking";
            this._stickyUntil = Date.now() + this._getStickyDuration("speaking");
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

        // ALSO handle speaking contexts even when TTS is not yet flagged as speaking
        // This ensures immediate response to speaking context requests
        if (context === "speaking" || context === "speakingPositive" || context === "speakingNegative") {
            const speakingPath = this.selectOptimalVideo(category, specificVideo, traits, affection, emotion);
            this.loadAndSwitchVideo(speakingPath, priority);
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
        // Always store normalized category as currentContext
        this.currentContext = category;
        this.currentEmotion = emotion;
        // Commit FSM state after physical switch initiation
        if (this._fsm && fsmResolved) {
            try {
                const sticky = category === "speakingPositive" || category === "speakingNegative" || category === "dancing";
                this._fsm.transition(fsmResolved.state, { sticky, utteranceLength: window.lastLLMResponseText?.length || 0 });
            } catch {}
        }
        this.lastSwitchTime = now;
        this._metrics.switches++;
        this._metrics.lastContext = category;
        this._emit("afterSwitch", { context: category, emotion });
    }

    _getStickyDuration(type) {
        const root = window.KIMI_VIDEO_CONFIG || {};
        const cfg = root.sticky || {};
        if (type === "dancing") return typeof cfg.dancingMs === "number" ? cfg.dancingMs : 9500;
        if (type === "speaking") {
            // Dynamic estimation from last LLM response length if available
            try {
                const cps = root.ttsCharsPerSecond || 14; // typical ~13-16 chars/s
                const minMs = cfg.speakingMinMs || 5000;
                const maxMs = cfg.speakingMaxMs || cfg.speakingMs || 15000;
                let textLen = 0;
                if (window.lastLLMResponseText && typeof window.lastLLMResponseText === "string") {
                    textLen = window.lastLLMResponseText.length;
                } else if (window.kimiLLMManager && typeof window.kimiLLMManager.getLastResponse === "function") {
                    const r = window.kimiLLMManager.getLastResponse();
                    if (r && typeof r.text === "string") textLen = r.text.length;
                }
                if (textLen > 0) {
                    const est = (textLen / cps) * 1000 + 1200; // add margin for latency
                    return Math.min(maxMs, Math.max(minMs, Math.round(est)));
                }
            } catch {}
            return typeof cfg.speakingMs === "number" ? cfg.speakingMs : 15000;
        }
        return 10000;
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
                    const currentSrc = this.activeVideo.querySelector("source").getAttribute("src");
                    const pool = this.videoCategories[category] || [];
                    const next = this._pickDifferent(pool, currentSrc) || this.selectOptimalVideo(category, null, null, null, emotion);
                    if (next && next !== currentSrc) {
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
            this._globalEndedHandler = () => {
                // Additional safety: ensure we're still in neutral context before looping
                if (this.currentContext === "neutral") {
                    this.returnToNeutral();
                } else {
                    // Context changed, don't loop back to neutral
                    if (window.KIMI_CONFIG?.DEBUG?.VIDEO) {
                        console.log("🎬 Context changed from neutral, skipping auto-loop");
                    }
                }
            };
            this.activeVideo.addEventListener("ended", this._globalEndedHandler, { once: true });
        }
    }

    // Enhanced selectOptimalVideo with safety checks
    selectOptimalVideo(category, specificVideo = null, traits = null, affection = null, emotion = null) {
        const availableVideos = this.videoCategories[category] || this.videoCategories.neutral;

        if (specificVideo && availableVideos.includes(specificVideo) && this._isVideoSafe(specificVideo)) {
            if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, specificVideo);
            this._logSelection(category, specificVideo, availableVideos);
            return specificVideo;
        }

        const currentVideoSrc = this.activeVideo.querySelector("source").getAttribute("src");

        // Filter out recently played videos using adaptive history AND safety checks
        const recentlyPlayed = this.playHistory[category] || [];
        let candidateVideos = availableVideos.filter(video => video !== currentVideoSrc && !recentlyPlayed.includes(video) && this._isVideoSafe(video));

        // If no safe fresh videos, allow recently played but safe videos (not current)
        if (candidateVideos.length === 0) {
            candidateVideos = availableVideos.filter(video => video !== currentVideoSrc && this._isVideoSafe(video));
        }

        // If still no safe videos, use any available (excluding current) - ignore safety temporarily
        if (candidateVideos.length === 0) {
            candidateVideos = availableVideos.filter(video => video !== currentVideoSrc);
            // Reset safety flags for this category since we're desperate
            if (candidateVideos.length > 0) {
                console.warn(`🎬 All videos in category '${category}' marked unsafe, resetting safety flags`);
                candidateVideos.forEach(video => this._recentFailures.delete(video));
            }
        }

        // Ultimate fallback - use all available
        if (candidateVideos.length === 0) {
            candidateVideos = availableVideos;
            // Reset all safety flags for this category
            availableVideos.forEach(video => this._recentFailures.delete(video));
        }

        // Final fallback to neutral category if current category is empty or exhausted
        if (candidateVideos.length === 0 && category !== "neutral") {
            console.warn(`🎬 Category '${category}' exhausted, falling back to neutral`);
            const neutralVideos = this.videoCategories.neutral || [];
            candidateVideos = neutralVideos.filter(video => this._isVideoSafe(video));
            if (candidateVideos.length === 0) {
                candidateVideos = neutralVideos; // Last resort
                // Reset safety flags for neutral videos too
                neutralVideos.forEach(video => this._recentFailures.delete(video));
            }
        }

        // Critical error protection: if we still have no candidates, force emergency state
        if (candidateVideos.length === 0) {
            console.error(`🎬 CRITICAL: No videos available for category '${category}' or neutral fallback!`);
            // Clear ALL safety flags as emergency measure
            this._recentFailures.clear();
            // Try to use any video from the original category
            candidateVideos = availableVideos.length > 0 ? availableVideos : this.videoCategories.neutral || [];
        }

        // If traits and affection are provided, weight the selection more subtly
        if (traits && typeof affection === "number" && candidateVideos.length > 1) {
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

            // Allow scoreAdjust hooks to mutate weights (same length)
            const scoreHooks = this._hooks.scoreAdjust[category];
            if (scoreHooks) {
                Object.values(scoreHooks).forEach(fn => {
                    try {
                        const maybe = fn({ category, candidates: candidateVideos, weights, traits, affection, emotion, manager: this });
                        if (maybe && Array.isArray(maybe) && maybe.length === weights.length) {
                            weights = maybe.map(v => (typeof v === "number" && v > 0 ? v : 0.0001));
                        }
                    } catch (e) {
                        if (window.KIMI_CONFIG?.DEBUG?.VIDEO) console.warn("scoreAdjust hook error", e);
                    }
                });
            }

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
        this._metrics.selections++;
        this._emit("selection", { category, selected: selectedVideo, candidates: candidateVideos.length });
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

    // Simplified determineCategory - pure delegation to centralized system
    determineCategory(context, emotion = "neutral", traits = null) {
        // If FSM present, let it resolve canonical category (still allow legacy for safety)
        try {
            if (this._fsm) {
                const r = this._fsm.resolve(context, emotion);
                if (r && r.category) return r.category;
            }
        } catch {}
        // CRITICAL FIX: Handle speakingPositive/speakingNegative contexts directly
        if (context === "speakingPositive") return "speakingPositive";
        if (context === "speakingNegative") return "speakingNegative";
        if (context === "speaking") return "speakingPositive"; // Default speaking to positive
        if (context === "dancing") return "dancing";
        if (context === "listening") return "listening";

        // Use centralized emotion system for other cases
        if (window.kimiEmotionSystem?.getVideoCategory) {
            return window.kimiEmotionSystem.getVideoCategory(context || emotion, traits);
        }

        // Minimal fallback only if emotion system completely unavailable
        console.warn("KimiEmotionSystem not available - using minimal fallback");
        return "neutral";
    } // SPECIALIZED METHODS FOR EACH CONTEXT
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
            if (!traits && window.getCharacterTraits) {
                const allTraits = await window.getCharacterTraits();
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
        // Check if we're in a high-priority context that should persist
        const currentPriority = window.kimiEmotionSystem?.getPriorityWeight(this.currentContext) || 3;
        if (currentPriority >= 8) {
            // HIGH_PRIORITY_THRESHOLD
            console.log(`🎯 Staying in high-priority context: ${this.currentContext} (priority: ${currentPriority})`);
            // Stay in current context, just pick another video of the same type
            const category = this.determineCategory(this.currentContext, this.currentEmotion, null);
            if (category && this.videoCategories[category] && this.videoCategories[category].length > 0) {
                const currentVideoSrc = this.activeVideo.querySelector("source").getAttribute("src");
                const available = this.videoCategories[category].filter(v => v !== currentVideoSrc);
                if (available.length > 0) {
                    const nextVideo = available[Math.floor(Math.random() * available.length)];
                    this.loadAndSwitchVideo(nextVideo, "high");
                    return;
                }
            }
        }

        // Always ensure we resume playbook with a fresh neutral video to avoid freeze
        if (this._neutralLock) return;
        this._neutralLock = true;
        setTimeout(() => {
            this._neutralLock = false;
        }, 1000);
        this._stickyContext = null;
        this._stickyUntil = 0;
        this.isEmotionVideoPlaying = false;
        this.currentEmotionContext = null;

        // Clean up any existing ended handlers before proceeding
        if (this._globalEndedHandler) {
            this.activeVideo.removeEventListener("ended", this._globalEndedHandler);
            this.inactiveVideo.removeEventListener("ended", this._globalEndedHandler);
            this._globalEndedHandler = null;
        }

        // Si la voix est encore en cours, relancer une vidéo neutre en boucle
        const category = "neutral";
        const currentVideoSrc = this.activeVideo.querySelector("source").getAttribute("src");
        const available = this.videoCategories[category] || [];
        let nextSrc = null;

        if (available.length > 0) {
            // Prefer safe different
            const safeDifferent = available.filter(v => v !== currentVideoSrc && this._isVideoSafe(v));
            if (safeDifferent.length) nextSrc = this._pickDifferent(safeDifferent, currentVideoSrc);
            else {
                const different = available.filter(v => v !== currentVideoSrc);
                if (different.length) {
                    // Reset safety flags if all were unsafe
                    different.forEach(v => this._recentFailures.delete(v));
                    nextSrc = this._pickDifferent(different, currentVideoSrc);
                } else {
                    // Last resort includes current, clear safety
                    this._recentFailures.clear();
                    nextSrc = available[0];
                }
            }
        }

        if (nextSrc) {
            this.loadAndSwitchVideo(nextSrc, "normal");
            if (typeof this.updatePlayHistory === "function") this.updatePlayHistory(category, nextSrc);
            this.currentContext = "neutral";
            this.currentEmotion = "neutral";
            this.lastSwitchTime = Date.now();

            // Set up proper ended handler for continuous neutral playback
            this._globalEndedHandler = () => {
                // Double check we're still in neutral before looping
                if (this.currentContext === "neutral") {
                    this.returnToNeutral();
                }
            };
            this.activeVideo.addEventListener("ended", this._globalEndedHandler, { once: true });

            // Additional fallback: if video doesn't start playing in 5 seconds, retry
            setTimeout(() => {
                if (this.activeVideo.paused && this.currentContext === "neutral") {
                    console.warn("🎬 Neutral video seems stuck, attempting recovery");
                    this.returnToNeutral();
                }
            }, 5000);
        } else {
            // Emergency fallback: force reload the first available neutral video
            console.error("🎬 No neutral videos available, forcing emergency reload");
            if (available.length > 0) {
                this._recentFailures.clear(); // Clear all safety blocks
                this.loadAndSwitchVideo(available[0], "high");
                this.currentContext = "neutral";
                this.currentEmotion = "neutral";
                this.lastSwitchTime = Date.now();
            } else {
                // Critical error: try existing path as absolute last resort
                console.error("🎬 CRITICAL: No neutral videos defined!");
                this.switchToContext("neutral");
            }
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
        this.emotionHistory.push({ emo: detectedEmotion, ts: Date.now() });
        if (this.emotionHistory.length > this.maxEmotionHistory) this.emotionHistory.shift();

        // Exponential decay weighting (recent emotions weigh more)
        const nowTs = Date.now();
        const halfLife = window.KIMI_VIDEO_CONFIG?.emotionHalfLifeMs || 6000; // 6s demi-vie par défaut
        const ln2 = Math.log(2);
        const weights = {};
        const bucketTemplate = [
            "positive",
            "negative",
            "neutral",
            "dancing",
            "listening",
            "romantic",
            "laughing",
            "surprise",
            "confident",
            "shy",
            "flirtatious",
            "kiss",
            "goodbye"
        ];
        bucketTemplate.forEach(k => (weights[k] = 0));
        for (const item of this.emotionHistory) {
            if (!weights.hasOwnProperty(item.emo)) continue;
            const age = nowTs - item.ts;
            const decay = Math.exp((-ln2 * age) / halfLife);
            weights[item.emo] += decay;
        }
        let dominant = null;
        let max = 0;
        for (const k in weights) {
            if (weights[k] > max) {
                max = weights[k];
                dominant = k;
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

        // Auto-transition timing
        if (window.KIMI_CONFIG?.DEBUG?.VIDEO) {
            console.log(`Auto-transition scheduled in ${duration / 1000}s (${this.currentContext} → neutral)`);
        }
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
        this._emit("load:start", { src: videoSrc, priority });
        // Pseudo-abort previous inactive load
        if (this._loadingInProgress && this._currentLoadHandler) {
            try {
                this.inactiveVideo.removeEventListener("canplay", this._currentLoadHandler);
                this.inactiveVideo.removeEventListener("loadeddata", this._currentLoadHandler);
            } catch {}
        }
        // Register attempt count (used for adaptive backoff)
        const prevAttempts = this._videoAttempts.get(videoSrc) || 0;
        const attempts = prevAttempts + 1;
        this._videoAttempts.set(videoSrc, attempts);
        // Light trimming to avoid unbounded growth
        if (this._videoAttempts.size > 300) {
            for (const key of this._videoAttempts.keys()) {
                if (this._videoAttempts.size <= 200) break;
                this._videoAttempts.delete(key);
            }
        }
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
        // Log current video being loaded - always shown for debugging
        const videoName = videoSrc ? videoSrc.split("/").pop() : "unknown";
        //console.log(`🎬 Playing video: ${videoName} (priority: ${priority})`);

        // Only log detailed info for high priority or error cases to reduce noise
        if (priority === "speaking" || priority === "high") {
            // Video loading with priority
            if (window.KIMI_CONFIG?.DEBUG?.VIDEO) {
                console.log(`🎬 Loading video: ${videoSrc} (priority: ${priority})`);
            }
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
        let errorCause = "error-event"; // will be overwritten if timeout based
        const onReady = () => {
            if (fired) return;
            fired = true;
            this._loadingInProgress = false;
            if (this._loadTimeout) {
                clearTimeout(this._loadTimeout);
                this._loadTimeout = null;
            }
            this._metrics.loadSuccess++;
            this._emit("load:success", { src: videoSrc, priority });
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
            const baseSize = neutralList.length >= 5 ? 5 : neutralList.length;
            this._fallbackPool = neutralList.slice(0, baseSize);
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
            const stillLoading = !mediaEl?.error && networkState === 2;
            const realMediaError = !!mediaEl?.error;
            // Differentiate timeout vs real media error for clarity
            const tag = realMediaError
                ? "VideoLoadFail:media-error"
                : errorCause.startsWith("timeout")
                  ? `VideoLoadFail:${errorCause}`
                  : "VideoLoadFail:unknown";
            console.warn(
                `[${tag}] src=${videoSrc} readyState=${readyState} networkState=${networkState} mediaError=${mediaErrorCode} attempts=${attempts} fallback=${fallbackVideo}`
            );
            this._loadingInProgress = false;
            if (this._loadTimeout) {
                clearTimeout(this._loadTimeout);
                this._loadTimeout = null;
            }
            // Only mark as failure if c'est une vraie erreur décodage OU plusieurs timeouts persistants
            if (realMediaError || (!stillLoading && errorCause.startsWith("timeout")) || attempts >= 3) {
                this._recentFailures.set(videoSrc, performance.now());
                this._consecutiveErrorCount++;
            }
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
                if (this._fallbackPool.length < 3 && neutralVideos.length > this._fallbackPool.length) {
                    this._fallbackPool = neutralVideos.slice(0, Math.min(5, neutralVideos.length));
                }
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
            this._emit("load:error", { src: videoSrc, attempts, fallback: fallbackVideo });
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
        // First ever attempt for a video: be more lenient if no historical avg yet
        if (attempts === 1 && !this._avgLoadTime) {
            adaptiveTimeout = Math.floor(adaptiveTimeout * 1.8); // ~5400ms au lieu de 3000ms typique
        }
        this._loadTimeout = setTimeout(() => {
            if (!fired) {
                // If metadata is there but not canplay yet, extend once
                if (this.inactiveVideo.readyState >= 1 && this.inactiveVideo.readyState < 2) {
                    errorCause = "timeout-metadata";
                    console.debug(`Extending timeout (metadata) for ${videoSrc} readyState=${this.inactiveVideo.readyState} +${this._timeoutExtension}ms`);
                    this._loadTimeout = setTimeout(() => {
                        if (!fired) {
                            if (this.inactiveVideo.readyState >= 2) onReady();
                            else this._currentErrorHandler();
                        }
                    }, this._timeoutExtension);
                    return;
                }
                // Grace retry: still fetching over network (networkState=2) with no data (readyState=0)
                const maxGrace = 2; // allow up to two grace extensions
                if (this.inactiveVideo.networkState === 2 && this.inactiveVideo.readyState === 0 && (this._graceRetryCounts?.[videoSrc] || 0) < maxGrace) {
                    if (!this._graceRetryCounts) this._graceRetryCounts = {};
                    this._graceRetryCounts[videoSrc] = (this._graceRetryCounts[videoSrc] || 0) + 1;
                    const extra = this._timeoutExtension + 900;
                    errorCause = "timeout-grace";
                    console.debug(`Grace retry #${this._graceRetryCounts[videoSrc]} for ${videoSrc} (still NETWORK_LOADING). Ext +${extra}ms`);
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
                    errorCause = errorCause === "error-event" ? "timeout-final" : errorCause;
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
                            const videoName = src ? src.split("/").pop() : "unknown";
                            const info = { context: this.currentContext, emotion: this.currentEmotion };

                            // Always log current playing video for debugging
                            console.log(`🎥 Now playing: ${videoName} (${this.currentContext}/${this.currentEmotion})`);

                            if (this._debug) {
                                console.log("🎬 VideoManager: Now playing:", src, info);
                            }
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
            const cached = new Set([...this._prefetchCache.keys(), ...this._prefetchInFlight.values()].map(v => (typeof v === "string" ? v : v?.src))); // defensive
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
    // CLEANUP - Enhanced memory management
    destroy() {
        // Clear all timers
        clearTimeout(this.autoTransitionTimer);
        clearTimeout(this._warmupTimer);
        clearTimeout(this._listeningGraceTimer);
        clearTimeout(this._pendingSpeakSwitch);

        this.autoTransitionTimer = null;
        this._warmupTimer = null;
        this._listeningGraceTimer = null;
        this._pendingSpeakSwitch = null;

        // Remove all event listeners
        if (this._visibilityHandler) {
            document.removeEventListener("visibilitychange", this._visibilityHandler);
            this._visibilityHandler = null;
        }

        if (this._firstInteractionHandler) {
            window.removeEventListener("click", this._firstInteractionHandler);
            window.removeEventListener("keydown", this._firstInteractionHandler);
            this._firstInteractionHandler = null;
        }

        // Clean up video loading handlers
        this._cleanupLoadingHandlers();

        // Clear global ended handler
        if (this._globalEndedHandler) {
            this.activeVideo?.removeEventListener("ended", this._globalEndedHandler);
            this.inactiveVideo?.removeEventListener("ended", this._globalEndedHandler);
            this._globalEndedHandler = null;
        }

        // Clear caches and queues
        this._prefetchCache.clear();
        this._prefetchInFlight.clear();
        this._pendingSwitches.length = 0;
        this._videoAttempts.clear();
        this._recentFailures.clear();

        // Reset history to prevent memory accumulation
        this.playHistory = {};
        this.emotionHistory.length = 0;

        // Reset state flags
        this._stickyContext = null;
        this._stickyUntil = 0;
        this.isEmotionVideoPlaying = false;
        this.currentEmotionContext = null;
        this._neutralLock = false;

        // FSM alignment
        if (this._fsm) {
            try {
                this._fsm.transition("neutral");
            } catch {}
        }
    }

    // Simplified mood setting using centralized emotion system
    setMoodByPersonality(traits) {
        if (this._stickyContext === "dancing" || this.currentContext === "dancing") return;

        // Use centralized mood calculation from emotion system
        const category = window.kimiEmotionSystem?.getMoodCategoryFromPersonality(traits) || "neutral";

        // Normalize emotion for consistent validation
        let emotion = category;
        if (category === "speakingPositive") emotion = "positive";
        else if (category === "speakingNegative") emotion = "negative";

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

    // Diagnostic method to check video system health
    _diagnoseVideoState() {
        const activeVideo = this.activeVideo;
        const inactiveVideo = this.inactiveVideo;

        const diagnostics = {
            timestamp: new Date().toISOString(),
            currentContext: this.currentContext,
            currentEmotion: this.currentEmotion,
            activeVideo: {
                src: activeVideo?.querySelector("source")?.getAttribute("src") || "none",
                readyState: activeVideo?.readyState || "undefined",
                networkState: activeVideo?.networkState || "undefined",
                paused: activeVideo?.paused,
                ended: activeVideo?.ended,
                duration: activeVideo?.duration || "unknown"
            },
            inactiveVideo: {
                src: inactiveVideo?.querySelector("source")?.getAttribute("src") || "none",
                readyState: inactiveVideo?.readyState || "undefined",
                networkState: inactiveVideo?.networkState || "undefined"
            },
            systemState: {
                switchInProgress: this._switchInProgress,
                loadingInProgress: this._loadingInProgress,
                neutralLock: this._neutralLock,
                stickyContext: this._stickyContext,
                recentFailuresCount: this._recentFailures.size,
                consecutiveErrors: this._consecutiveErrorCount
            }
        };

        return diagnostics;
    }

    // Method to force video recovery when stuck
    _forceVideoRecovery() {
        if (window.KIMI_CONFIG?.DEBUG?.VIDEO) {
            console.warn("🎬 Forcing video recovery due to detected stall");
        }

        // Log current state for debugging only if debug enabled
        const diagnostics = this._diagnoseVideoState();
        if (window.KIMI_CONFIG?.DEBUG?.VIDEO) {
            console.log("🎬 Video diagnostics:", diagnostics);
        }

        // Clear any problematic state
        this._switchInProgress = false;
        this._loadingInProgress = false;
        this._neutralLock = false;

        // Clear safety flags to allow all videos
        this._recentFailures.clear();

        // Force return to neutral with high priority
        this.currentContext = "neutral";
        this.returnToNeutral();

        return diagnostics;
    }
}

// Expose globally for code that expects a window-level KimiVideoManager
window.KimiVideoManager = KimiVideoManager;

// Expose diagnostic utilities globally for debugging
window.kimiVideoDiagnostics = function () {
    if (window.videoManager && typeof window.videoManager._diagnoseVideoState === "function") {
        return window.videoManager._diagnoseVideoState();
    }
    return { error: "Video manager not available" };
};

window.kimiVideoRecovery = function () {
    if (window.videoManager && typeof window.videoManager._forceVideoRecovery === "function") {
        return window.videoManager._forceVideoRecovery();
    }
    return { error: "Video manager not available" };
};

// Also provide ES module exports for modern imports
export { KimiVideoManager };

// Lightweight global helper to fetch current metrics if manager instance present
window.kimiVideoMetrics = function () {
    try {
        if (window.kimiVideo && typeof window.kimiVideo.getMetrics === "function") {
            return window.kimiVideo.getMetrics();
        }
    } catch {}
    return null;
};

// Public hook registration API
window.registerVideoHook = function (type, id, fn) {
    try {
        if (!window.kimiVideo || !type || !id || typeof fn !== "function") return false;
        if (type.startsWith("event:")) {
            const evt = type.replace(/^event:/, "");
            if (!window.kimiVideo._hooks.events[evt]) window.kimiVideo._hooks.events[evt] = {};
            window.kimiVideo._hooks.events[evt][id] = fn;
            return true;
        }
        if (type.startsWith("score:")) {
            const cat = type.replace(/^score:/, "");
            if (!window.kimiVideo._hooks.scoreAdjust[cat]) window.kimiVideo._hooks.scoreAdjust[cat] = {};
            window.kimiVideo._hooks.scoreAdjust[cat][id] = fn;
            return true;
        }
    } catch {}
    return false;
};
window.unregisterVideoHook = function (type, id) {
    try {
        if (!window.kimiVideo || !type || !id) return false;
        if (type.startsWith("event:")) {
            const evt = type.replace(/^event:/, "");
            if (window.kimiVideo._hooks.events[evt]) delete window.kimiVideo._hooks.events[evt][id];
            return true;
        }
        if (type.startsWith("score:")) {
            const cat = type.replace(/^score:/, "");
            if (window.kimiVideo._hooks.scoreAdjust[cat]) delete window.kimiVideo._hooks.scoreAdjust[cat][id];
            return true;
        }
    } catch {}
    return false;
};
