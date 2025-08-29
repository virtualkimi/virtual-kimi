// ===== KIMI VOICE MANAGEMENT MODULE =====
class KimiVoiceManager {
    constructor(database, memory) {
        this.db = database;
        this.memory = memory;
        this.isInitialized = false;

        // Voice properties
        this.speechSynthesis = window.speechSynthesis;
        this.currentVoice = null;
        this.availableVoices = [];

        // Speech recognition
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = null;
        this.isListening = false;
        this.isStoppingVolontaire = false;

        // DOM elements
        this.micButton = null;
        // Real-time transcript overlay elements (shows live speech transcription and AI responses)
        this.transcriptContainer = null; // Container for transcript overlay
        this.transcriptText = null; // Text element displaying current transcript

        // Callback for voice message analysis
        this.onSpeechAnalysis = null;

        // Reference to mic handler function for removal
        this.handleMicClick = null;

        this.transcriptHideTimeout = null;
        this.listeningTimeout = null;

        // Selected character for responses (will be updated from database)
        this.selectedCharacter = window.KIMI_CONFIG?.DEFAULTS?.SELECTED_CHARACTER || "Kimi";

        // Speaking flag
        this.isSpeaking = false;

        // Auto-stop listening duration (in milliseconds)
        this.autoStopDuration = 15000; // 15 seconds

        // Silence timeout after final transcript (in milliseconds)
        this.silenceTimeout = 2200; // 2.2 seconds

        // Track if microphone permission has been granted
        this.micPermissionGranted = false;

        // Debounced microphone toggle (centralized utility)
        this._debouncedToggleMicrophone = window.KimiPerformanceUtils
            ? window.KimiPerformanceUtils.debounce(() => this._toggleMicrophoneCore(), 300, false, this)
            : null;

        // Browser detection
        this.browser = this._detectBrowser();
    }

    // ===== INITIALIZATION =====
    async init() {
        // Avoid double initialization
        if (this.isInitialized) {
            console.log("VoiceManager already initialized, ignored");
            return true;
        }

        try {
            // Initialize DOM elements with verification
            this.micButton = document.getElementById("mic-button");
            this.transcriptContainer = document.querySelector(".transcript-container");
            this.transcriptText = document.getElementById("transcript");

            if (!this.micButton) {
                console.warn("Microphone button not found in DOM!");
                return false;
            }

            // Check transcript elements (non-critical, just warn)
            if (!this.transcriptContainer) {
                console.warn("Transcript container not found in DOM - transcript feature will be disabled");
            }
            if (!this.transcriptText) {
                console.warn("Transcript text element not found in DOM - transcript feature will be disabled");
            }

            // Initialize voice synthesis
            await this.initVoices();

            // Only setup listener once during initialization
            if (!this._voicesListenerSetup) {
                this.setupVoicesChangedListener();
                this._voicesListenerSetup = true;
            }

            this.setupLanguageSelector();

            // Initialize speech recognition
            this.setupSpeechRecognition();
            this.setupMicrophoneButton();

            // Check current microphone permission status
            await this.checkMicrophonePermission();

            // Initialize selected character with proper display name
            if (this.db && typeof this.db.getSelectedCharacter === "function") {
                const charKey = await this.db.getSelectedCharacter();
                if (charKey && window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[charKey]) {
                    // Use the display name, not the key
                    this.selectedCharacter = window.KIMI_CHARACTERS[charKey].name;
                } else if (charKey) {
                    // Fallback to key if KIMI_CHARACTERS not available
                    this.selectedCharacter = charKey;
                }
            }

            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error("Error during VoiceManager initialization:", error);
            return false;
        }
    }

    _detectBrowser() {
        const ua = navigator.userAgent || "";
        const isOpera = (!!window.opr && !!opr.addons) || ua.includes(" OPR/");
        const isFirefox = typeof InstallTrigger !== "undefined" || ua.toLowerCase().includes("firefox");
        const isSafari = /Safari\//.test(ua) && !/Chrom(e|ium)\//.test(ua) && !/Edg\//.test(ua);
        const isEdge = /Edg\//.test(ua);
        // Detect Brave explicitly: navigator.brave exists in many Brave builds, UA may also include 'Brave'
        const isBrave =
            (!!navigator.brave && typeof navigator.brave.isBrave === "function") || ua.toLowerCase().includes("brave");
        const isChrome = /Chrome\//.test(ua) && !isEdge && !isOpera && !isBrave;
        if (isFirefox) return "firefox";
        if (isOpera) return "opera";
        if (isBrave) return "brave";
        if (isSafari) return "safari";
        if (isEdge) return "edge";
        if (isChrome) return "chrome";
        return "unknown";
    }

    _getUnsupportedSRMessage() {
        // Build an i18n key by browser, then fallback to English if translation system isn't ready
        let key = "sr_not_supported_generic";
        if (this.browser === "firefox") key = "sr_not_supported_firefox";
        else if (this.browser === "opera") key = "sr_not_supported_opera";
        else if (this.browser === "safari") key = "sr_not_supported_safari";
        const translated = typeof window.kimiI18nManager?.t === "function" ? window.kimiI18nManager.t(key) : undefined;
        // Many i18n libs return the key itself if missing; detect that and fall back to English
        if (!translated || translated === key) {
            if (key === "sr_not_supported_firefox") {
                return "Speech recognition is not supported on Firefox. Please use Chrome, Edge, or Brave.";
            }
            if (key === "sr_not_supported_opera") {
                return "Speech recognition may not work on Opera. Please try Chrome, Edge, or Brave.";
            }
            if (key === "sr_not_supported_safari") {
                return "Speech recognition support varies on Safari. Prefer Chrome or Edge for best results.";
            }
            return "Speech recognition is not available in this browser.";
        }
        return translated;
    }

    // ===== MICROPHONE PERMISSION MANAGEMENT =====
    async checkMicrophonePermission() {
        try {
            // Check if running on file:// protocol
            if (window.location.protocol === "file:") {
                console.log("🎤 Running on file:// protocol - microphone permissions will be requested each time");
                this.micPermissionGranted = false;
                return;
            }

            if (!navigator.permissions) {
                console.log("🎤 Permissions API not available");
                this.micPermissionGranted = false; // Set default state
                return;
            }

            const permissionStatus = await navigator.permissions.query({ name: "microphone" });
            this.micPermissionGranted = permissionStatus.state === "granted";

            // Listen for permission changes
            permissionStatus.addEventListener("change", () => {
                this.micPermissionGranted = permissionStatus.state === "granted";
            });
        } catch (error) {
            console.log("🎤 Could not check microphone permission:", error);
            this.micPermissionGranted = false;
        }
    }

    // ===== VOICE SYNTHESIS =====
    async initVoices() {
        // Prevent multiple simultaneous calls
        if (this._initializingVoices) {
            return;
        }
        this._initializingVoices = true;

        this.availableVoices = this.speechSynthesis.getVoices();

        // Handle case where voices are not loaded yet (common timing issue)
        if (this.availableVoices.length === 0) {
            this._initializingVoices = false;
            // The onvoiceschanged listener will retry initialization
            return;
        }

        // Only get language from DB if not already set
        if (!this.selectedLanguage) {
            const selectedLanguage = await this.db?.getPreference("selectedLanguage", "en");
            // Normalize legacy formats (en-US, en_US, us:en -> en) using shared util
            this.selectedLanguage = window.KimiLanguageUtils.normalizeLanguageCode(selectedLanguage || "en") || "en";
        }

        const savedVoice = await this.db?.getPreference("selectedVoice", "auto");

        const filteredVoices = this.getVoicesForLanguage(this.selectedLanguage);

        if (savedVoice && savedVoice !== "auto") {
            // Only search within language-compatible voices
            const foundVoice = filteredVoices.find(voice => voice.name === savedVoice);
            if (foundVoice) {
                this.currentVoice = foundVoice;
                console.log(
                    `🎤 Voice restored from cache: "${foundVoice.name}" (${foundVoice.lang}) for language "${this.selectedLanguage}"`
                );
                this.updateVoiceSelector();
                this._initializingVoices = false;
                return;
            } else {
                // Saved voice not compatible with current language, fall back to auto-selection
                console.log(
                    `🎤 Saved voice "${savedVoice}" not compatible with language "${this.selectedLanguage}", using auto-selection`
                );
                await this.db?.setPreference("selectedVoice", "auto");
            }
        }

        // Prefer female voices if available in the language-compatible voices
        // Use real voice names since voice.gender is rarely provided by browsers
        const femaleVoice = filteredVoices.find(voice => {
            const name = voice.name.toLowerCase();

            // Common female voice names across different platforms
            const femaleNames = [
                // Microsoft voices
                "aria",
                "emma",
                "jenny",
                "michelle",
                "karen",
                "heather",
                "susan",
                "joanna",
                "salli",
                "kimberly",
                "kendra",
                "ivy",
                "rebecca",
                "zira",
                "eva",
                "linda",
                "denise",
                "elsa",
                "nathalie",
                "julie",
                "hortense",
                "marie",
                "pauline",
                "claudia",
                "lucia",
                "paola",
                "bianca",
                "cosima",
                "katja",
                "hedda",
                "helena",
                "naayf",
                "sabina",
                "naja",
                "sara",
                "amelie",
                "lea",
                "manon",

                // Google voices
                "wavenet-a",
                "wavenet-c",
                "wavenet-e",
                "wavenet-f",
                "wavenet-g",
                "standard-a",
                "standard-c",
                "standard-e",

                // Apple voices
                "allison",
                "ava",
                "samantha",
                "susan",
                "vicki",
                "victoria",
                "audrey",
                "aurelie",
                "marie",
                "thomas",
                "amelie",

                // General keywords
                "female",
                "woman",
                "girl",
                "lady"
            ];

            // Check if voice name contains any female name
            return (
                femaleNames.some(femaleName => name.includes(femaleName)) ||
                (voice.gender && voice.gender.toLowerCase() === "female")
            );
        });

        // Debug: Check what we actually found
        if (femaleVoice) {
            console.log(`🎤 Female voice found: "${femaleVoice.name}" (${femaleVoice.lang})`);
        } else {
            console.log(
                `🎤 No female voice found, using first available: "${filteredVoices[0]?.name}" (${filteredVoices[0]?.lang})`
            );
            // Debug: Show what voices are available and why they don't match
            if (filteredVoices.length > 0 && filteredVoices.length <= 5) {
                console.log(
                    `🎤 Available voices for ${this.selectedLanguage}:`,
                    filteredVoices.map(v => ({
                        name: v.name,
                        lang: v.lang,
                        gender: v.gender || "undefined"
                    }))
                );
            }
        }

        // Use female voice if found, otherwise first compatible voice, with proper fallback
        // KEEP legacy auto-selection behavior only for Chrome/Edge where it was reliable.
        // For other browsers (Firefox/Brave/Opera), avoid auto-selecting to prevent wrong default (e.g., Hortense).
        const browser = this.browser || this._detectBrowser();
        if (browser === "chrome" || browser === "edge") {
            this.currentVoice = femaleVoice || filteredVoices[0] || null;
        } else {
            // Do not auto-select on less predictable browsers
            this.currentVoice = femaleVoice && filteredVoices.length > 1 ? femaleVoice : null;
        }

        if (!this.currentVoice) {
            console.warn("🎤 No voices available for speech synthesis - this may resolve automatically when voices load");
            this._initializingVoices = false;
            // Don't return here - let the system continue, voices may load later via onvoiceschanged
            // The updateVoiceSelector will handle the empty state gracefully
        } else {
            // Log successful voice selection with language info
            console.log(
                `🎤 Voice loaded: "${this.currentVoice.name}" (${this.currentVoice.lang}) for language "${this.selectedLanguage}"`
            );
        }

        // Do not overwrite "auto" preference here; only update if user selects a specific voice

        this.updateVoiceSelector();
        this._initializingVoices = false;
    }

    updateVoiceSelector() {
        const voiceSelect = document.getElementById("voice-selection");
        if (!voiceSelect) return;

        // Clear existing options
        while (voiceSelect.firstChild) {
            voiceSelect.removeChild(voiceSelect.firstChild);
        }

        // Add auto option
        const autoOption = document.createElement("option");
        autoOption.value = "auto";
        autoOption.textContent = "Automatic (Best voice for selected language)";
        voiceSelect.appendChild(autoOption);

        const filteredVoices = this.getVoicesForLanguage(this.selectedLanguage);

        // If browser is not Chrome or Edge, do NOT expose voice options even when voices exist.
        // This avoids misleading users on Brave/Firefox/Opera/Safari who might think TTS is supported when it's not.
        const browser = this.browser || this._detectBrowser();
        if ((browser !== "chrome" && browser !== "edge") || filteredVoices.length === 0) {
            const noVoicesOption = document.createElement("option");
            noVoicesOption.value = "none";
            noVoicesOption.textContent = "No voices available for this browser";
            noVoicesOption.disabled = true;
            voiceSelect.appendChild(noVoicesOption);
        } else {
            filteredVoices.forEach(voice => {
                const option = document.createElement("option");
                option.value = voice.name;
                option.textContent = `${voice.name} (${voice.lang})`;
                if (this.currentVoice && voice.name === this.currentVoice.name) {
                    option.selected = true;
                }
                voiceSelect.appendChild(option);
            });
        }

        // Remove existing handler before adding new one
        if (this.voiceChangeHandler) {
            voiceSelect.removeEventListener("change", this.voiceChangeHandler);
        }

        // Create and store the handler
        this.voiceChangeHandler = this.handleVoiceChange.bind(this);
        voiceSelect.addEventListener("change", this.voiceChangeHandler);
    }

    async handleVoiceChange(e) {
        if (e.target.value === "auto") {
            console.log(`🎤 Voice set to automatic selection for language "${this.selectedLanguage}"`);
            await this.db?.setPreference("selectedVoice", "auto");
            this.currentVoice = null; // clear immediate in-memory voice
            // Re-initialize voices synchronously so currentVoice is set before other code reacts
            try {
                await this.initVoices();
            } catch (err) {
                // If init fails, leave currentVoice null but don't throw
                console.warn("🎤 initVoices failed after setting auto:", err);
            }
        } else {
            this.currentVoice = this.availableVoices.find(voice => voice.name === e.target.value);
            console.log(`🎤 Voice manually selected: "${this.currentVoice?.name}" (${this.currentVoice?.lang})`);
            await this.db?.setPreference("selectedVoice", e.target.value);
        }
    }

    setupVoicesChangedListener() {
        if (this.speechSynthesis.onvoiceschanged !== undefined) {
            // Prevent multiple event listeners
            this.speechSynthesis.onvoiceschanged = null;
            this.speechSynthesis.onvoiceschanged = async () => {
                // Only reinitialize if voices are actually available now
                if (this.speechSynthesis.getVoices().length > 0) {
                    await this.initVoices();
                }
            };
        }

        // Fallback: Only use timeout if onvoiceschanged is not supported
        if (this.availableVoices.length === 0 && this.speechSynthesis.onvoiceschanged === undefined) {
            setTimeout(async () => {
                await this.initVoices();
            }, 1000);
        }
    }

    // ===== LANGUAGE UTILITIES =====
    getLanguageCode(langShort) {
        const languageMap = {
            en: "en-US",
            fr: "fr-FR",
            es: "es-ES",
            de: "de-DE",
            it: "it-IT",
            ja: "ja-JP",
            zh: "zh-CN"
        };
        return languageMap[langShort] || langShort;
    }

    // language normalization handled by window.KimiLanguageUtils.normalizeLanguageCode

    getVoicesForLanguage(language) {
        const norm = window.KimiLanguageUtils.normalizeLanguageCode(language || "");
        // First pass: voices whose lang primary subtag starts with normalized code
        let filteredVoices = this.availableVoices.filter(voice => {
            try {
                const vlang = String(voice.lang || "").toLowerCase();
                return vlang.startsWith(norm);
            } catch (e) {
                return false;
            }
        });

        // Second pass: voices that contain the code anywhere
        if (filteredVoices.length === 0 && norm) {
            filteredVoices = this.availableVoices.filter(voice =>
                String(voice.lang || "")
                    .toLowerCase()
                    .includes(norm)
            );
        }

        // Do not fall back to all voices: if none match, return empty array so UI shows "no voices available"
        if (filteredVoices.length === 0) return [];
        return filteredVoices;
    }

    // ===== VOICE PREFERENCE UTILITIES =====
    getVoicePreference(paramType, options = {}) {
        // Hierarchy: options > memory.preferences > kimiMemory.preferences > DOM element > default
        const defaults = {
            rate: window.KIMI_CONFIG?.DEFAULTS?.VOICE_RATE || 1.1,
            pitch: window.KIMI_CONFIG?.DEFAULTS?.VOICE_PITCH || 1.1,
            volume: window.KIMI_CONFIG?.DEFAULTS?.VOICE_VOLUME || 0.8
        };

        const elementIds = {
            rate: "voice-rate",
            pitch: "voice-pitch",
            volume: "voice-volume"
        };

        const memoryKeys = {
            rate: "voiceRate",
            pitch: "voicePitch",
            volume: "voiceVolume"
        };

        // 1. Check options parameter
        if (options[paramType] !== undefined) {
            return parseFloat(options[paramType]);
        }

        // 2. Check local memory preferences
        if (this.memory?.preferences?.[memoryKeys[paramType]] !== undefined) {
            return parseFloat(this.memory.preferences[memoryKeys[paramType]]);
        }

        // 3. Check global memory preferences
        if (window.kimiMemory?.preferences?.[memoryKeys[paramType]] !== undefined) {
            return parseFloat(window.kimiMemory.preferences[memoryKeys[paramType]]);
        }

        // 4. Check DOM element
        const element = document.getElementById(elementIds[paramType]);
        if (element) {
            return parseFloat(element.value);
        }

        // 5. Return default value
        return defaults[paramType];
    }

    // ===== CHAT MESSAGE UTILITIES =====
    handleChatMessage(userMessage, kimiResponse) {
        const chatContainer = document.getElementById("chat-container");
        const chatMessages = document.getElementById("chat-messages");

        if (!chatContainer || !chatContainer.classList.contains("visible") || !chatMessages) {
            return;
        }

        const addMessageToChat = window.addMessageToChat || (typeof addMessageToChat !== "undefined" ? addMessageToChat : null);

        if (addMessageToChat) {
            addMessageToChat("user", userMessage);
            addMessageToChat(this.selectedCharacter.toLowerCase(), kimiResponse);
        } else {
            // Fallback manual message creation
            this.createChatMessage(chatMessages, "user", userMessage);
            this.createChatMessage(chatMessages, this.selectedCharacter.toLowerCase(), kimiResponse);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    createChatMessage(container, sender, text) {
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${sender}`;

        const textDiv = document.createElement("div");
        textDiv.textContent = text;

        const timeDiv = document.createElement("div");
        timeDiv.className = "message-time";
        timeDiv.textContent = new Date().toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit"
        });

        messageDiv.appendChild(textDiv);
        messageDiv.appendChild(timeDiv);
        container.appendChild(messageDiv);
    }

    async speak(text, options = {}) {
        // If no text or voice not ready, attempt short retries for voice initialization
        if (!text) {
            console.warn("Unable to speak: empty text");
            return;
        }

        const maxRetries = 3;
        let attempt = 0;
        while (!this.currentVoice && attempt < maxRetries) {
            // Small jittered backoff
            const wait = 100 + Math.floor(Math.random() * 200); // 100-300ms
            await new Promise(r => setTimeout(r, wait));
            // If voices available, try to init
            if (this.availableVoices.length > 0) {
                // attempt to pick a voice for the current language
                try {
                    await this.initVoices();
                } catch (e) {
                    // ignore and retry
                }
            }
            attempt++;
        }

        if (!this.currentVoice) {
            console.warn("Unable to speak: voice not initialized after retries");
            return;
        }
        this.clearTranscriptTimeout();
        if (this.speechSynthesis.speaking) {
            this.speechSynthesis.cancel();
        }

        // Clean text for better speech synthesis
        let processedText = this._normalizeForSpeech(text);

        // Get voice settings using centralized utility
        let customRate = this.getVoicePreference("rate", options);
        let customPitch = this.getVoicePreference("pitch", options);

        // Check for emotional indicators in original text (before processing)
        const lowerText = text.toLowerCase();
        if (
            lowerText.includes("❤️") ||
            lowerText.includes("💕") ||
            lowerText.includes("😘") ||
            lowerText.includes("amour") ||
            lowerText.includes("love") ||
            lowerText.includes("bisou")
        ) {
            // Tender loving content - slower and higher pitch
            customRate = Math.max(0.7, customRate - 0.2);
            customPitch = Math.min(1.3, customPitch + 0.1);
        }

        const utterance = new SpeechSynthesisUtterance(processedText);
        utterance.voice = this.currentVoice;
        utterance.rate = customRate;
        utterance.pitch = customPitch;

        // Get volume using centralized utility
        utterance.volume = this.getVoicePreference("volume", options);
        const emotionFromText = this.analyzeTextEmotion(text);
        if (window.kimiVideo && emotionFromText !== "neutral") {
            requestAnimationFrame(() => {
                window.kimiVideo.respondWithEmotion(emotionFromText);
            });
        }
        if (typeof window.updatePersonalityTraitsFromEmotion === "function") {
            window.updatePersonalityTraitsFromEmotion(emotionFromText, text);
        }
        this.showResponseWithPerfectTiming(text);

        utterance.onstart = async () => {
            this.isSpeaking = true;
            // Note: transcript visibility is already handled by showResponseWithPerfectTiming
            // This ensures the transcript stays visible while AI is speaking

            // Ensure a speaking animation plays (avoid frozen neutral frame during TTS)
            try {
                if (window.kimiVideo && window.kimiVideo.getCurrentVideoInfo) {
                    const info = window.kimiVideo.getCurrentVideoInfo();
                    if (info && !(info.context && info.context.startsWith("speaking"))) {
                        // Use positive speaking as neutral fallback
                        const traits = await this.db?.getAllPersonalityTraits(
                            window.kimiMemory?.selectedCharacter || (await this.db.getSelectedCharacter())
                        );
                        const affection = traits ? traits.affection : 50;
                        window.kimiVideo.switchToContext("speakingPositive", "positive", null, traits || {}, affection);
                    }
                }
            } catch (e) {
                // Silent fallback
            }
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            // Hide transcript overlay when AI finishes speaking
            this.updateTranscriptVisibility(false);
            // Clear any pending hide timeout
            this.clearTranscriptTimeout();
            if (window.kimiVideo) {
                // Do not force neutral if an emotion clip is still playing (speaking/dancing)
                try {
                    const info = window.kimiVideo.getCurrentVideoInfo ? window.kimiVideo.getCurrentVideoInfo() : null;
                    const isEmotionClip =
                        info &&
                        (info.context === "speakingPositive" ||
                            info.context === "speakingNegative" ||
                            info.context === "dancing");
                    if (!isEmotionClip) {
                        requestAnimationFrame(() => {
                            window.kimiVideo.returnToNeutral();
                        });
                    }
                } catch (_) {
                    requestAnimationFrame(() => {
                        window.kimiVideo.returnToNeutral();
                    });
                }
            }
        };

        utterance.onerror = e => {
            this.isSpeaking = false;
            this.updateTranscriptVisibility(false);
            this.clearTranscriptTimeout();
        };

        this.speechSynthesis.speak(utterance);
    }

    /**
     * Normalize raw model text into something natural for browser speech synthesis.
     * Goals:
     *  - Remove emojis / pictographs (engines try to read them literally)
     *  - Collapse excessive punctuation while preserving rhythm
     *  - Convert ellipses to a Unicode ellipsis (…)
     *  - Remove markdown / formatting artifacts (* _ ~ ` # [] <> etc.)
     *  - Remove stray markup like **bold**, inline code, URLs parentheses clutter
     *  - Keep meaningful punctuation (. , ! ? ; :)
     *  - Avoid inserting artificial words (e.g., "pause")
     */
    _normalizeForSpeech(raw) {
        if (!raw) return "";
        let txt = raw;
        // Remove URLs completely (they sound awkward) – keep none.
        txt = txt.replace(/https?:\/\/\S+/gi, " ");
        // Remove markdown code blocks and inline code markers
        txt = txt.replace(/`{3}[\s\S]*?`{3}/g, " "); // fenced blocks
        txt = txt.replace(/`([^`]+)`/g, "$1"); // inline code unwrap
        // Remove emphasis markers (*, _, ~) while keeping inner text
        txt = txt.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
        txt = txt.replace(/_{1,3}([^_]+)_{1,3}/g, "$1");
        txt = txt.replace(/~{1,2}([^~]+)~{1,2}/g, "$1");
        // Strip remaining markdown heading symbols at line starts
        txt = txt.replace(/^\s{0,3}#{1,6}\s+/gm, "");
        // Remove HTML/XML tags
        txt = txt.replace(/<[^>]+>/g, " ");
        // Remove brackets content if it is link style [text](url)
        txt = txt.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
        // Remove leftover standalone brackets
        txt = txt.replace(/[\[\]<>]/g, " ");
        // Remove emojis / pictographic chars
        txt = txt.replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, " ");
        // Normalize ellipses: sequences of 3+ dots -> single ellipsis surrounded by light spaces
        txt = txt.replace(/\.{3,}/g, " … ");
        // Replace double dots with single period + space
        txt = txt.replace(/\.\./g, ". ");
        // Collapse multiple exclamation/question marks to single (keeps expressiveness but avoids stutter)
        txt = txt.replace(/!{2,}/g, "!");
        txt = txt.replace(/\?{2,}/g, "?");
        // Space after sentence punctuation if missing
        txt = txt.replace(/([.!?])([^\s\d])/g, "$1 $2");
        // Replace underscores or asterisks still present with spaces
        txt = txt.replace(/[*_]{2,}/g, " ");
        // Remove stray backticks
        txt = txt.replace(/`+/g, " ");
        // Collapse mixed punctuation like ?!?! to a single terminal symbol keeping first char
        txt = txt.replace(/([!?]){2,}/g, "$1");
        // Remove repeated commas / semicolons / colons
        txt = txt.replace(/,{2,}/g, ",");
        txt = txt.replace(/;{2,}/g, ";");
        txt = txt.replace(/:{2,}/g, ":");
        // Remove leading/trailing punctuation clusters
        txt = txt.replace(/^[\s.,;:!?]+/, "").replace(/[\s.,;:!?]+$/, "");
        // Collapse whitespace
        txt = txt.replace(/\s+/g, " ");
        // Final trim
        txt = txt.trim();
        return txt;
    }

    // Intelligently calculate synthesis duration
    calculateSpeechDuration(text, rate = 0.9) {
        const baseWordsPerMinute = 150;
        const adjustedWPM = baseWordsPerMinute * rate;
        const wordCount = text.split(/\s+/).length;
        const estimatedMinutes = wordCount / adjustedWPM;
        const estimatedMilliseconds = estimatedMinutes * 60 * 1000;
        const bufferTime = text.split(/[.!?]/).length * 500;
        return Math.max(estimatedMilliseconds + bufferTime, 2000);
    }

    // ===== REAL-TIME TRANSCRIPT DISPLAY =====
    // Centralized transcript timeout management
    clearTranscriptTimeout() {
        if (this.transcriptHideTimeout) {
            clearTimeout(this.transcriptHideTimeout);
            this.transcriptHideTimeout = null;
        }
    }

    // Utility method to safely check transcript preference and control visibility
    async updateTranscriptVisibility(shouldShow, text = null) {
        if (!this.transcriptContainer || !this.transcriptText) return false;

        const showTranscript = await this.db?.getPreference(
            "showTranscript",
            window.KIMI_CONFIG?.DEFAULTS?.SHOW_TRANSCRIPT ?? true
        );
        if (!showTranscript) {
            // If transcript is disabled, always hide
            this.transcriptContainer.classList.remove("visible");
            return false;
        }

        if (shouldShow) {
            if (text) {
                // Show with text content
                this.transcriptText.textContent = text;
                this.transcriptContainer.classList.add("visible");
                return true;
            } else {
                // Show but keep existing text (for cases where we just want to maintain visibility)
                this.transcriptContainer.classList.add("visible");
                return true;
            }
        } else {
            // Hide transcript
            this.transcriptContainer.classList.remove("visible");
            return false;
        }
    }

    // Show AI response text in real-time transcript overlay when AI is speaking
    async showResponseWithPerfectTiming(text) {
        const success = await this.updateTranscriptVisibility(true, `${this.selectedCharacter}: ${text}`);
        if (success) {
            this.clearTranscriptTimeout();
        }
    }

    showResponse(text) {
        this.showResponseWithPerfectTiming(text);
    }

    // Show user voice input text in real-time transcript overlay during speech recognition
    async showUserMessage(text, duration = 3000) {
        const success = await this.updateTranscriptVisibility(true, text);
        if (success) {
            this.clearTranscriptTimeout();
            // Auto-hide transcript after specified duration
            this.transcriptHideTimeout = setTimeout(async () => {
                await this.updateTranscriptVisibility(false);
                this.transcriptHideTimeout = null;
            }, duration);
        }
    }

    // ===== SPEECH RECOGNITION =====
    setupSpeechRecognition() {
        if (!this.SpeechRecognition) {
            // Do not show a UI message during initial load; only log.
            console.log("Your browser does not support speech recognition.");
            return;
        }
        this.recognition = new this.SpeechRecognition();
        this.recognition.continuous = true;
        const langCode = this.getLanguageCode(this.selectedLanguage || "en");
        this.recognition.lang = langCode;
        this.recognition.interimResults = true;

        // Add onstart handler to confirm permission
        this.recognition.onstart = () => {
            if (!this.micPermissionGranted) {
                this.micPermissionGranted = true;
                console.log("🎤 Microphone permission confirmed via onstart");
            }
        };

        this.recognition.onresult = async event => {
            // Mark permission as granted if we get results
            if (!this.micPermissionGranted) {
                this.micPermissionGranted = true;
                console.log("🎤 Microphone permission confirmed via onresult");
            }

            // Process speech recognition results into final and interim transcripts
            let final_transcript = "";
            let interim_transcript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final_transcript += event.results[i][0].transcript;
                } else {
                    interim_transcript += event.results[i][0].transcript;
                }
            }

            // Display real-time speech transcription if enabled
            const transcriptText = final_transcript || interim_transcript;
            if (transcriptText) {
                await this.updateTranscriptVisibility(true, transcriptText);
            }
            if (final_transcript && this.onSpeechAnalysis) {
                try {
                    // Auto-stop after silence timeout following final transcript
                    setTimeout(() => {
                        this.stopListening();
                    }, this.silenceTimeout);
                    (async () => {
                        let response;
                        if (typeof window.analyzeAndReact === "function") {
                            response = await window.analyzeAndReact(final_transcript);
                        } else if (this.onSpeechAnalysis) {
                            response = await this.onSpeechAnalysis(final_transcript);
                        }

                        if (response) {
                            this.handleChatMessage(final_transcript, response);
                            setTimeout(() => {
                                this.speak(response);
                            }, 500);
                        }
                    })();
                } catch (error) {
                    console.error("🎤 Error during voice analysis:", error);
                }
            }
        };

        this.recognition.onerror = event => {
            console.error("🎤 Speech recognition error:", event.error);
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                console.log("🎤 Permission denied - stopping listening");
                this.micPermissionGranted = false;
                this.stopListening();
                const message =
                    window.kimiI18nManager?.t("mic_permission_denied") || "Microphone permission denied. Click again to retry.";
                // Use promise-based approach for async operation
                this.updateTranscriptVisibility(true, message).then(() => {
                    setTimeout(() => {
                        this.updateTranscriptVisibility(false);
                    }, 2000);
                });
            } else {
                this.stopListening();
            }
        };

        this.recognition.onend = () => {
            console.log("🎤 Speech recognition ended");

            // Clear timeout if recognition ends naturally
            if (this.listeningTimeout) {
                clearTimeout(this.listeningTimeout);
                this.listeningTimeout = null;
            }

            // Always reset listening state when recognition ends
            this.isListening = false;

            if (this.isStoppingVolontaire) {
                console.log("Voluntary stop confirmed");
                this.isStoppingVolontaire = false;
                if (this.micButton) {
                    this.micButton.classList.remove("mic-pulse-active");
                    this.micButton.classList.remove("is-listening");
                }
                return;
            }

            // User must click the mic button again to reactivate listening
            this.isListening = false;
            if (this.micButton) this.micButton.classList.remove("is-listening");
            if (this.micButton) this.micButton.classList.remove("mic-pulse-active");
            this.updateTranscriptVisibility(false);
        };
    }

    setupMicrophoneButton() {
        if (!this.micButton) {
            console.error("setupMicrophoneButton: Mic button not found!");
            return;
        }

        // Remove any existing event listener to prevent duplicates
        this.micButton.removeEventListener("click", this.handleMicClick);

        // Create the click handler function
        this.handleMicClick = () => {
            if (!this.SpeechRecognition) {
                console.warn("🎤 Speech recognition not available");
                let key = "sr_not_supported_generic";
                if (this.browser === "firefox") key = "sr_not_supported_firefox";
                else if (this.browser === "opera") key = "sr_not_supported_opera";
                else if (this.browser === "safari") key = "sr_not_supported_safari";
                const message = window.kimiI18nManager?.t(key) || "Speech recognition is not available in this browser.";
                this.updateTranscriptVisibility(true, message).then(() => {
                    setTimeout(() => {
                        this.updateTranscriptVisibility(false);
                    }, 4000);
                });
                return;
            }

            if (this.isListening) {
                console.log("🎤 Stopping microphone via button click");
                this.stopListening();
            } else {
                console.log("🎤 Starting microphone via button click");
                this.startListening();
            }
        };

        // Add the event listener
        this.micButton.addEventListener("click", this.handleMicClick);
    }

    async startListening() {
        // Show helpful message if SR API is missing
        if (!this.SpeechRecognition) {
            let key = "sr_not_supported_generic";
            if (this.browser === "firefox") key = "sr_not_supported_firefox";
            else if (this.browser === "opera") key = "sr_not_supported_opera";
            else if (this.browser === "safari") key = "sr_not_supported_safari";
            const message = window.kimiI18nManager?.t(key) || "Speech recognition is not available in this browser.";
            this.updateTranscriptVisibility(true, message).then(() => {
                setTimeout(() => {
                    this.updateTranscriptVisibility(false);
                }, 4000);
            });
            return;
        }
        if (!this.recognition || this.isListening) return;

        // Check microphone API availability
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("MediaDevices API not available");
            const message = window.kimiI18nManager?.t("mic_not_supported") || "Microphone not supported in this browser.";
            this.updateTranscriptVisibility(true, message).then(() => {
                setTimeout(() => {
                    this.updateTranscriptVisibility(false);
                }, 3000);
            });
            return;
        }

        // If permission was previously granted, start directly
        if (this.micPermissionGranted) {
            console.log("🎤 Using previously granted microphone permission");
            this.startRecognitionDirectly();
            return;
        }

        // Check current permission status
        try {
            const permissionStatus = await navigator.permissions.query({ name: "microphone" });
            console.log("🎤 Current microphone permission status:", permissionStatus.state);

            if (permissionStatus.state === "granted") {
                this.micPermissionGranted = true;
                this.startRecognitionDirectly();
                return;
            } else if (permissionStatus.state === "denied") {
                console.log("🎤 Microphone permission denied");
                const message =
                    window.kimiI18nManager?.t("mic_permission_denied") ||
                    "Microphone permission denied. Please allow access in browser settings.";
                this.updateTranscriptVisibility(true, message).then(() => {
                    setTimeout(() => {
                        this.updateTranscriptVisibility(false);
                    }, 4000);
                });
                return;
            }
        } catch (error) {
            console.log("🎤 Could not check permission status:", error);
        }

        // Permission is 'prompt' or unknown, proceed with recognition start (will trigger permission dialog)
        this.startRecognitionDirectly();
    }

    startRecognitionDirectly() {
        // Prevent starting if already listening or if recognition is in an active state
        if (this.isListening) {
            console.log("🎤 Already listening, ignoring start request");
            return;
        }

        // Check if recognition is already in progress
        if (this.recognition && this.recognition.state && this.recognition.state !== "inactive") {
            console.log("🎤 Recognition already active, stopping first");
            try {
                this.recognition.stop();
            } catch (e) {
                console.warn("🎤 Error stopping existing recognition:", e);
            }
            // Wait a bit before trying to start again
            setTimeout(() => {
                this.startRecognitionDirectly();
            }, 100);
            return;
        }

        this.isListening = true;
        this.isStoppingVolontaire = false;

        if (this.micButton) {
            this.micButton.classList.add("is-listening");
        } else {
            console.error("Unable to add 'is-listening' - mic button not found");
        }

        if (window.kimiVideo) {
            window.kimiVideo.startListening();
        }

        // Set auto-stop timeout
        this.listeningTimeout = setTimeout(() => {
            console.log("🎤 Auto-stopping listening after timeout");
            this.stopListening();
        }, this.autoStopDuration);

        try {
            this.recognition.start();
            console.log("🎤 Started listening with auto-stop timeout");
        } catch (error) {
            console.error("Error starting listening:", error);
            this.isListening = false; // Reset state on error
            this.stopListening();

            // Show user-friendly error message
            const message =
                window.kimiI18nManager?.t("mic_permission_denied") || "Microphone permission denied. Click again to retry.";
            this.updateTranscriptVisibility(true, message).then(() => {
                setTimeout(() => {
                    this.updateTranscriptVisibility(false);
                }, 3000);
            });
        }
    }

    stopListening() {
        if (!this.recognition || !this.isListening) return;

        // Clear auto-stop timeout if it exists
        if (this.listeningTimeout) {
            clearTimeout(this.listeningTimeout);
            this.listeningTimeout = null;
        }

        this.isListening = false;
        this.isStoppingVolontaire = true;

        if (this.micButton) {
            this.micButton.classList.remove("is-listening");
            this.micButton.classList.add("mic-pulse-active");
        } else {
            console.error("Unable to remove 'is-listening' - mic button not found");
        }

        if (window.kimiVideo) {
            const currentInfo = window.kimiVideo.getCurrentVideoInfo ? window.kimiVideo.getCurrentVideoInfo() : null;
            if (
                currentInfo &&
                (currentInfo.context === "speakingPositive" ||
                    currentInfo.context === "speakingNegative" ||
                    currentInfo.context === "dancing")
            ) {
                // Let emotion video finish naturally
            } else if (this.isStoppingVolontaire) {
                // Use centralized video utility for neutral transition
                window.kimiVideo.returnToNeutral();
            }
        }

        this.clearTranscriptTimeout();

        if (!this.speechSynthesis.speaking) {
            // Hide transcript after delay if AI is not speaking
            this.transcriptHideTimeout = setTimeout(async () => {
                await this.updateTranscriptVisibility(false);
                this.transcriptHideTimeout = null;
            }, 2000);
        }

        try {
            this.recognition.stop();
            console.log("🎤 Stopped listening");
        } catch (error) {
            console.error("Error stopping listening:", error);
        }
    }

    // ===== UTILITY METHODS =====
    isVoiceAvailable() {
        return this.currentVoice !== null;
    }

    getCurrentVoice() {
        return this.currentVoice;
    }

    getAvailableVoices() {
        return this.availableVoices;
    }

    setOnSpeechAnalysis(callback) {
        this.onSpeechAnalysis = callback;
    }

    analyzeTextEmotion(text) {
        // Use unified emotion system
        if (window.kimiAnalyzeEmotion) {
            const emotion = window.kimiAnalyzeEmotion(text, "auto");
            return this._modulateEmotionByPersonality(emotion);
        }
        return "neutral";
    } // Helper to modulate emotion based on personality traits
    _modulateEmotionByPersonality(emotion) {
        try {
            let avg = 50;
            if (this.memory && typeof this.memory.affectionTrait === "number") {
                avg = this.memory.affectionTrait;
            }

            // Low affection makes emotions more subdued
            if (avg <= 20 && emotion !== "neutral") {
                return "shy";
            }
            if (avg <= 40 && emotion === "positive") {
                return "shy";
            }

            return emotion;
        } catch (e) {
            return emotion;
        }
    }

    async testVoice() {
        const testMessages = [
            window.kimiI18nManager?.t("test_voice_message_1") || "Hello my beloved! 💕",
            window.kimiI18nManager?.t("test_voice_message_2") || "I am Kimi, your virtual companion!",
            window.kimiI18nManager?.t("test_voice_message_3") || "How are you today, my love?"
        ];
    }

    destroy() {
        // Clear all timeouts
        if (this.listeningTimeout) {
            clearTimeout(this.listeningTimeout);
            this.listeningTimeout = null;
        }

        this.clearTranscriptTimeout();

        if (this.recognition) {
            this.recognition.stop();
            this.recognition = null;
        }

        if (this.speechSynthesis.speaking) {
            this.speechSynthesis.cancel();
        }

        // Clean up mic button event listener
        if (this.micButton && this.handleMicClick) {
            this.micButton.removeEventListener("click", this.handleMicClick);
        }

        // Clean up voice selector event listener
        if (this.voiceChangeHandler) {
            const voiceSelect = document.getElementById("voice-selection");
            if (voiceSelect) {
                voiceSelect.removeEventListener("change", this.voiceChangeHandler);
            }
            this.voiceChangeHandler = null;
        }

        // Clean up language selector event listener
        if (this.languageChangeHandler) {
            const languageSelect = document.getElementById("language-selection");
            if (languageSelect) {
                languageSelect.removeEventListener("change", this.languageChangeHandler);
            }
            this.languageChangeHandler = null;
        }

        // Reset state
        this.currentVoice = null;
        this.isInitialized = false;
        this.isListening = false;
        this.isStoppingVolontaire = false;
        this.handleMicClick = null;

        console.log("KimiVoiceManager destroyed and cleaned up");
    }

    setupLanguageSelector() {
        const languageSelect = document.getElementById("language-selection");
        if (!languageSelect) return;

        languageSelect.value = this.selectedLanguage || "en";

        // Remove existing handler before adding new one
        if (this.languageChangeHandler) {
            languageSelect.removeEventListener("change", this.languageChangeHandler);
        }

        // Create and store the handler
        this.languageChangeHandler = this.handleLanguageChange.bind(this);
        languageSelect.addEventListener("change", this.languageChangeHandler);
    }

    async handleLanguageChange(e) {
        const newLang = e.target.value;
        const oldLang = this.selectedLanguage;
        console.log(`🎤 Language changing: "${oldLang}" → "${newLang}"`);

        this.selectedLanguage = newLang;
        await this.db?.setPreference("selectedLanguage", newLang);

        // Update i18n system for interface translations
        if (window.kimiI18nManager?.setLanguage) {
            await window.kimiI18nManager.setLanguage(newLang);
        }

        // Check saved voice compatibility: only reset to 'auto' if incompatible
        try {
            const currentVoicePref = await this.db?.getPreference("selectedVoice", "auto");
            // Clear in-memory currentVoice to allow re-selection
            this.currentVoice = null;

            if (currentVoicePref && currentVoicePref !== "auto") {
                // If saved voice name exists, check if it's present among filtered voices for the new language
                const filtered = this.getVoicesForLanguage(newLang);
                const compatible = filtered.some(v => v.name === currentVoicePref);
                if (!compatible) {
                    // Only write 'auto' when incompatible
                    await this.db?.setPreference("selectedVoice", "auto");
                }
            }

            // Re-init voices to pick a correct voice for the new language
            await this.initVoices();
        } catch (err) {
            // On error, fall back to safe behavior: init voices and set 'auto'
            try {
                await this.db?.setPreference("selectedVoice", "auto");
            } catch {}
            await this.initVoices();
        }

        if (this.currentVoice) {
            console.log(`🎤 Voice selected for "${newLang}": "${this.currentVoice.name}" (${this.currentVoice.lang})`);
        } else {
            console.warn(`🎤 No voice found for language "${newLang}"`);
        }

        if (this.recognition) {
            const langCode = this.getLanguageCode(newLang);
            this.recognition.lang = langCode;
        }
    }

    async updateSelectedCharacter() {
        if (this.db && typeof this.db.getSelectedCharacter === "function") {
            const charKey = await this.db.getSelectedCharacter();
            if (charKey && window.KIMI_CHARACTERS && window.KIMI_CHARACTERS[charKey]) {
                // Use the display name, not the key
                this.selectedCharacter = window.KIMI_CHARACTERS[charKey].name;
            } else if (charKey) {
                // Fallback to key if KIMI_CHARACTERS not available
                this.selectedCharacter = charKey;
            }
        }
    }

    // Public method for external microphone toggle (keyboard, etc.)
    toggleMicrophone() {
        if (this._debouncedToggleMicrophone) return this._debouncedToggleMicrophone();
        return this._toggleMicrophoneCore();
    }

    _toggleMicrophoneCore() {
        if (!this.SpeechRecognition) {
            console.warn("🎤 Speech recognition not available");
            return false;
        }
        // If Kimi is speaking, stop speech synthesis first
        if (this.isSpeaking && this.speechSynthesis.speaking) {
            console.log("🎤 Interrupting speech to start listening");
            this.speechSynthesis.cancel();
            this.isSpeaking = false;
            this.updateTranscriptVisibility(false);
        }

        if (this.isListening) {
            console.log("🎤 Stopping microphone via external trigger");
            this.stopListening();
        } else {
            console.log("🎤 Starting microphone via external trigger");
            this.startListening();
        }
        return true;
    }

    // Configuration methods for timeout durations
    setSilenceTimeout(milliseconds) {
        if (typeof milliseconds === "number" && milliseconds > 0) {
            this.silenceTimeout = milliseconds;
            console.log(`🎤 Silence timeout set to ${milliseconds}ms`);
        } else {
            console.warn("🎤 Invalid silence timeout value");
        }
    }

    setAutoStopDuration(milliseconds) {
        if (typeof milliseconds === "number" && milliseconds > 0) {
            this.autoStopDuration = milliseconds;
            console.log(`🎤 Auto-stop duration set to ${milliseconds}ms`);
        } else {
            console.warn("🎤 Invalid auto-stop duration value");
        }
    }

    // Get current timeout configurations
    getTimeoutConfiguration() {
        return {
            silenceTimeout: this.silenceTimeout,
            autoStopDuration: this.autoStopDuration
        };
    }
}

// Export for usage
window.KimiVoiceManager = KimiVoiceManager;
