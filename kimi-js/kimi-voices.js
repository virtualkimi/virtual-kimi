// ===== KIMI VOICE MANAGEMENT MODULE =====
class KimiVoiceManager {
    constructor(database, memory) {
        this.db = database;
        this.memory = memory;
        this.isInitialized = false;
        // Removed cross-language reuse: voices must match selected language strictly
        this.showAllVoices = false; // user toggle to display every system voice
        this.ttsEnabled = true; // global TTS enable/disable toggle
        // Refactor 2025-09: Simplified voice/language handling (removed 'auto' gendered selection)

        // Capability flags (added 2025-09)
        this.hasSR = false; // Speech Recognition available
        this.hasTTS = typeof window.speechSynthesis !== "undefined";

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

    // Detect capabilities cross-browser (minimal, no UA heuristics except Safari SR absence)
    _detectCapabilities() {
        // Speech Recognition API
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
        this.hasSR = !!SR;
        // TTS already inferred by constructor (speechSynthesis)
        this.hasTTS = typeof window.speechSynthesis !== "undefined";
        return { hasSR: this.hasSR, hasTTS: this.hasTTS };
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
                if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
                    console.warn("Microphone button not found in DOM!");
                }
                return false;
            }

            // Check transcript elements (non-critical, just warn)
            if (!this.transcriptContainer) {
                if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
                    console.warn("Transcript container not found in DOM - transcript feature will be disabled");
                }
            }
            if (!this.transcriptText) {
                if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
                    console.warn("Transcript text element not found in DOM - transcript feature will be disabled");
                }
            }

            // Capability detection early
            this._detectCapabilities();

            // Initialize voice synthesis only if TTS exists
            if (this.hasTTS) {
                // Load saved preference for showAllVoices before building selectors
                try {
                    const prefShowAll = await this.db?.getPreference("showAllVoices", null);
                    if (prefShowAll === "true" || prefShowAll === true) {
                        this.showAllVoices = true;
                    }
                } catch {}
                await this.initVoices();
            }

            // Only setup listener once during initialization
            if (!this._voicesListenerSetup) {
                this.setupVoicesChangedListener();
                this._voicesListenerSetup = true;
            }

            this.setupLanguageSelector();
            this.setupShowAllVoicesToggle();
            this.setupTtsToggle();

            // Initialize speech recognition only if available
            if (this.hasSR) {
                this.setupSpeechRecognition();
            }
            this.setupMicrophoneButton(); // UI always prepared; will disable if no SR

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

    setupShowAllVoicesToggle() {
        const toggleSwitch = document.getElementById("show-all-voices-toggle");
        if (!toggleSwitch) return;

        // Set initial state
        if (this.showAllVoices) {
            toggleSwitch.classList.add("active");
            toggleSwitch.setAttribute("aria-checked", "true");
        } else {
            toggleSwitch.classList.remove("active");
            toggleSwitch.setAttribute("aria-checked", "false");
        }

        // Handle click event
        toggleSwitch.addEventListener("click", () => {
            this.showAllVoices = !this.showAllVoices;

            // Update UI
            if (this.showAllVoices) {
                toggleSwitch.classList.add("active");
                toggleSwitch.setAttribute("aria-checked", "true");
            } else {
                toggleSwitch.classList.remove("active");
                toggleSwitch.setAttribute("aria-checked", "false");
            }

            // Persist preference
            this.db?.setPreference("showAllVoices", String(this.showAllVoices));
            this.updateVoiceSelector();
        });
    }

    setupTtsToggle() {
        const toggleSwitch = document.getElementById("tts-toggle");
        if (!toggleSwitch) return;

        // Set initial state
        if (this.ttsEnabled) {
            toggleSwitch.classList.add("active");
            toggleSwitch.setAttribute("aria-checked", "true");
        } else {
            toggleSwitch.classList.remove("active");
            toggleSwitch.setAttribute("aria-checked", "false");
        }

        // Handle click event
        toggleSwitch.addEventListener("click", () => {
            this.ttsEnabled = !this.ttsEnabled;

            // Update UI
            if (this.ttsEnabled) {
                toggleSwitch.classList.add("active");
                toggleSwitch.setAttribute("aria-checked", "true");
            } else {
                toggleSwitch.classList.remove("active");
                toggleSwitch.setAttribute("aria-checked", "false");
                // Cancel any ongoing speech
                if (this.speechSynthesis && this.speechSynthesis.speaking) {
                    this.speechSynthesis.cancel();
                }
            }

            // Persist preference
            this.db?.setPreference("ttsEnabled", String(this.ttsEnabled));
        });
    }

    _applySpeechRecognitionCapabilityUI() {
        if (!this.micButton) return;
        if (!this.hasSR) {
            this.micButton.classList.add("disabled");
            this.micButton.setAttribute("aria-disabled", "true");
            const msg = this._getUnsupportedSRMessage();
            this.micButton.title = msg;
        } else {
            this.micButton.classList.remove("disabled");
            this.micButton.removeAttribute("aria-disabled");
            this.micButton.removeAttribute("title");
        }
    }

    _detectBrowser() {
        const ua = navigator.userAgent || "";
        const isOpera = (!!window.opr && !!opr.addons) || ua.includes(" OPR/");
        const isFirefox = typeof InstallTrigger !== "undefined" || ua.toLowerCase().includes("firefox");
        const isSafari = /Safari\//.test(ua) && !/Chrom(e|ium)\//.test(ua) && !/Edg\//.test(ua);
        const isEdge = /Edg\//.test(ua);
        // Detect Brave explicitly: navigator.brave exists in many Brave builds, UA may also include 'Brave'
        const isBrave = (!!navigator.brave && typeof navigator.brave.isBrave === "function") || ua.toLowerCase().includes("brave");
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
                if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
                    console.log("🎤 Running on file:// protocol - microphone permissions will be requested each time");
                }
                this.micPermissionGranted = false;
                return;
            }

            if (!navigator.permissions) {
                if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
                    console.log("🎤 Permissions API not available");
                }
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
        // Guard against re-entrancy
        if (this._initializingVoices) return;
        this._initializingVoices = true;

        // One-time inventory log when DEBUG.VOICE enabled
        if (!this._voiceInventoryLogged && window.KIMI_CONFIG?.DEBUG?.VOICE) {
            const raw = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
            const inventory = raw.map(v => ({ name: v.name, lang: v.lang }));
            console.log("🎤 Voice inventory:", inventory);
            this._voiceInventoryLogged = true;
        }

        // Ensure selectedLanguage
        if (!this.selectedLanguage) {
            try {
                const storedLang = await this.db?.getPreference("selectedLanguage", "en");
                this.selectedLanguage = window.KimiLanguageUtils.normalizeLanguageCode(storedLang || "en") || "en";
            } catch {
                this.selectedLanguage = "en";
            }
        }

        // Wait for voices to actually load (multi-browser, esp. Android / Safari)
        this.availableVoices = await this._waitForVoices(1200);
        if (!Array.isArray(this.availableVoices)) this.availableVoices = [];

        const primary = await this.getEffectiveLanguage(this.selectedLanguage);
        const filtered = this.getVoicesForLanguage(primary);

        // Backward compatibility: if old preference was "auto" treat as none
        let savedVoice = await this.db?.getPreference("selectedVoice", null);
        if (savedVoice === "auto") savedVoice = null;

        if (savedVoice) {
            const found = filtered.find(v => v.name === savedVoice);
            if (found) {
                this.currentVoice = found;
                if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
                    console.log(`🎤 Restored saved voice: ${found.name} (${found.lang})`);
                }
            } else {
                await this.db?.setPreference("selectedVoice", null);
                this.currentVoice = null;
            }
        }

        // If still no voice and we have filtered matches, choose first
        if (!this.currentVoice && filtered.length > 0) {
            this.currentVoice = this._chooseCompatibleVoice(primary, filtered);
            if (this.currentVoice && window.KIMI_CONFIG?.DEBUG?.VOICE) {
                console.log(`🎤 Auto-selected voice: ${this.currentVoice.name} (${this.currentVoice.lang})`);
            }
        }

        // If still no voice we leave currentVoice null so UI shows 'no compatible voices'
        // No cross-language fallback: if none found, currentVoice stays null

        this.updateVoiceSelector();
        this._initializingVoices = false;
    }

    updateVoiceSelector() {
        const voiceSelect = document.getElementById("voice-selection");
        if (!voiceSelect) return;

        // Legacy cleanup: remove any lingering 'auto' option injected by cached HTML or extensions
        const legacyAuto = Array.from(voiceSelect.querySelectorAll('option[value="auto"], option[data-i18n="automatic"]'));
        if (legacyAuto.length) {
            legacyAuto.forEach(o => o.remove());
        }

        // Clear existing (after legacy cleanup)
        while (voiceSelect.firstChild) voiceSelect.removeChild(voiceSelect.firstChild);

        const primary = this.selectedLanguage || "en";
        const filtered = this.getVoicesForLanguage(primary);
        const allVoices = this.availableVoices || [];
        if (!this.showAllVoices) {
            if (filtered.length === 0) {
                const opt = document.createElement("option");
                opt.value = "";
                const txt = window.kimiI18nManager?.t("no_compatible_voices") || "No compatible voices for this language";
                opt.textContent = txt;
                opt.disabled = true;
                voiceSelect.appendChild(opt);
            } else {
                filtered.forEach(v => {
                    const opt = document.createElement("option");
                    opt.value = v.name;
                    opt.textContent = `${v.name} (${v.lang})`;
                    if (this.currentVoice && v.name === this.currentVoice.name) opt.selected = true;
                    voiceSelect.appendChild(opt);
                });
            }
        } else {
            // Show all voices; mark non-matching ones with *
            if (allVoices.length === 0) {
                const opt = document.createElement("option");
                opt.value = "";
                const txt = window.kimiI18nManager?.t("no_compatible_voices") || "No compatible voices for this language";
                opt.textContent = txt;
                opt.disabled = true;
                voiceSelect.appendChild(opt);
            } else {
                allVoices.forEach(v => {
                    const opt = document.createElement("option");
                    opt.value = v.name;
                    const isMatch = filtered.some(f => f.name === v.name);
                    opt.textContent = isMatch ? `${v.name} (${v.lang})` : `${v.name} (${v.lang}) *`;
                    if (this.currentVoice && v.name === this.currentVoice.name) opt.selected = true;
                    voiceSelect.appendChild(opt);
                });
            }
        }

        if (this.voiceChangeHandler) voiceSelect.removeEventListener("change", this.voiceChangeHandler);
        this.voiceChangeHandler = this.handleVoiceChange.bind(this);
        voiceSelect.addEventListener("change", this.voiceChangeHandler);
    }

    async handleVoiceChange(e) {
        const name = e.target.value;
        if (name === "auto") {
            // legacy safeguard
            await this.db?.setPreference("selectedVoice", "");
            return;
        }
        const found = this.availableVoices.find(v => v.name === name);
        if (found) {
            this.currentVoice = found;
            await this.db?.setPreference("selectedVoice", name);
            console.log(`🎤 Voice selected: ${found.name} (${found.lang})`);
        }
    }

    setupVoicesChangedListener() {
        if (this.speechSynthesis.onvoiceschanged !== undefined) {
            // Prevent multiple event listeners
            this.speechSynthesis.onvoiceschanged = null;
            this.speechSynthesis.onvoiceschanged = async () => {
                // Only reinitialize if voices are actually available now
                if (this.speechSynthesis.getVoices().length > 0) {
                    if (window.KIMI_CONFIG?.DEBUG?.VOICE) console.log("🎤 voiceschanged event -> re-init voices");
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
            zh: "zh-CN",
            pt: "pt-BR"
        };
        return languageMap[langShort] || langShort;
    }

    // language normalization handled by window.KimiLanguageUtils.normalizeLanguageCode

    getVoicesForLanguage(language) {
        const primary = window.KimiLanguageUtils.normalizeLanguageCode(language || "");
        if (!primary) return [];
        const normVoice = v =>
            String(v.lang || "")
                .replace(/_/g, "-")
                .toLowerCase();
        const primaryOf = v => normVoice(v).split("-")[0];

        const voices = this.availableVoices || [];
        // 1. Exact primary- prefixed (en- / fr-)
        let exact = voices.filter(v => normVoice(v).startsWith(primary + "-"));
        if (exact.length) return exact;
        // 2. Same primary subtag
        let samePrimary = voices.filter(v => primaryOf(v) === primary);
        if (samePrimary.length) return samePrimary;
        // 3. Locale synonyms mapping (e.g., British / Canadian variants)
        const synonymMap = {
            en: ["en", "en-gb", "en-us", "en-au", "en-ca"],
            fr: ["fr", "fr-fr", "fr-ca", "fr-be"],
            es: ["es", "es-es", "es-mx", "es-ar"],
            de: ["de", "de-de", "de-at", "de-ch"],
            it: ["it", "it-it"],
            pt: ["pt", "pt-br", "pt-pt"],
            ja: ["ja", "ja-jp"],
            zh: ["zh", "zh-cn", "zh-hk", "zh-tw"]
        };
        const synList = synonymMap[primary] || [primary];
        let synonymMatches = voices.filter(v => {
            const lv = normVoice(v);
            return synList.some(s => lv.startsWith(s));
        });
        if (synonymMatches.length) return synonymMatches;
        // 4. Loose contains
        let loose = voices.filter(v => normVoice(v).includes(primary));
        if (loose.length) return loose;
        // 5. Last resort: return all voices (caller will pick first)
        return [];
    }

    // ===== INTERNAL HELPERS (NEW FLOW) =====
    async _waitForVoices(timeoutMs = 1200) {
        const start = performance.now();
        const pollInterval = 50;
        let lastLength = 0;
        while (performance.now() - start < timeoutMs) {
            const list = this.speechSynthesis.getVoices();
            if (list.length > 0) {
                // Heuristic: stable length twice
                if (list.length === lastLength) return list;
                lastLength = list.length;
            }
            await new Promise(r => setTimeout(r, pollInterval));
        }
        return this.speechSynthesis.getVoices();
    }

    _chooseCompatibleVoice(primary, filtered) {
        if (filtered && filtered.length) return filtered[0];
        // If nothing filtered provided (unexpected), fallback to best guess in all voices
        const voices = this.availableVoices || [];
        const normVoice = v =>
            String(v.lang || "")
                .replace(/_/g, "-")
                .toLowerCase();
        const primaryOf = v => normVoice(v).split("-")[0];
        // Prefer same primary
        const same = voices.filter(v => primaryOf(v) === primary);
        if (same.length) return same[0];
        return voices[0] || null;
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
        // Always save to chat history, regardless of chat visibility
        const addMessageToChat = window.addMessageToChat || (typeof addMessageToChat !== "undefined" ? addMessageToChat : null);

        if (addMessageToChat) {
            // Save messages to history
            addMessageToChat("user", userMessage);
            addMessageToChat(this.selectedCharacter.toLowerCase(), kimiResponse);
        } else {
            // Fallback: only add to visible chat if available
            const chatContainer = document.getElementById("chat-container");
            const chatMessages = document.getElementById("chat-messages");

            if (chatContainer && chatContainer.classList.contains("visible") && chatMessages) {
                this.createChatMessage(chatMessages, "user", userMessage);
                this.createChatMessage(chatMessages, this.selectedCharacter.toLowerCase(), kimiResponse);
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }
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
        // Check if TTS is globally enabled
        if (!this.ttsEnabled) {
            if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
                console.log("TTS is disabled globally, skipping speak");
            }
            return;
        }

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
            // If voices available, try to init (simplified selection, no legacy 'auto' heuristics)
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

        // Use centralized emotion system for consistency
        const emotionFromText = window.kimiEmotionSystem?.analyzeEmotionValidated(text) || "neutral";

        // SIMPLE VIDEO CONTROL
        if (window.kimiVideoController) {
            window.kimiVideoController.playVideo("tts", text);
        }

        if (typeof window.updatePersonalityTraitsFromEmotion === "function") {
            window.updatePersonalityTraitsFromEmotion(emotionFromText, text);
        }

        // Start TTS AFTER video is prepared
        this.showResponseWithPerfectTiming(text);

        utterance.onstart = async () => {
            this.isSpeaking = true;
            // Speaking animation is already prepared above in PRE-PREPARE section
            // No need to duplicate the logic here
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            // Hide transcript overlay when AI finishes speaking
            this.updateTranscriptVisibility(false);
            // Clear any pending hide timeout
            this.clearTranscriptTimeout();

            // IMMEDIATELY return to neutral when TTS ends
            // SIMPLE TTS END
            if (window.kimiVideoController) {
                window.kimiVideoController.playVideo("neutral");
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

        const showTranscript = await this.db?.getPreference("showTranscript", window.KIMI_CONFIG?.DEFAULTS?.SHOW_TRANSCRIPT ?? true);
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
    async setupSpeechRecognition() {
        if (!this.SpeechRecognition) {
            // Do not show a UI message during initial load; only log.
            console.log("Your browser does not support speech recognition.");
            return;
        }
        // Always create a fresh instance (some browsers cache language at construction time)
        this.recognition = new this.SpeechRecognition();
        this.recognition.continuous = true;

        // Resolve effective language (block invalid 'auto')
        const normalized = await this.getEffectiveLanguage(this.selectedLanguage);
        const langCode = this.getLanguageCode(normalized || "en");
        try {
            this.recognition.lang = langCode;
        } catch (e) {
            console.warn("Could not set recognition.lang, fallback en-US", e);
            this.recognition.lang = "en-US";
        }
        console.log(`🎤 SpeechRecognition initialized (lang=${this.recognition.lang})`);
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
                    // Show final user message in transcript before processing
                    await this.showUserMessage(`You: ${final_transcript}`, 2000);

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
                const message = window.kimiI18nManager?.t("mic_permission_denied") || "Microphone permission denied. Click again to retry.";
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

        // Apply capability UI state every time we set up
        this._applySpeechRecognitionCapabilityUI();

        // Remove any existing event listener to prevent duplicates
        this.micButton.removeEventListener("click", this.handleMicClick);

        // Create the click handler function
        this.handleMicClick = () => {
            // If SR not available, just show explanatory message once.
            if (!this.hasSR) {
                const message = this._getUnsupportedSRMessage();
                this.updateTranscriptVisibility(true, message).then(() => {
                    setTimeout(() => this.updateTranscriptVisibility(false), 4000);
                });
                return;
            }
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

        // If microphone permission already granted, start directly
        if (this.micPermissionGranted) {
            console.log("🎤 Microphone permission already granted");
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
                const message = window.kimiI18nManager?.t("mic_permission_denied") || "Microphone permission denied. Please allow access in browser settings.";
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

        if (window.kimiVideoController) {
            window.kimiVideoController.playVideo("listening");
        } else if (window.kimiVideo) {
            // Fallback to old system
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
            const message = window.kimiI18nManager?.t("mic_permission_denied") || "Microphone permission denied. Click again to retry.";
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
                (currentInfo.context === "speakingPositive" || currentInfo.context === "speakingNegative" || currentInfo.context === "dancing")
            ) {
                // Let emotion video finish naturally
            } else if (this.isStoppingVolontaire) {
                // SIMPLE NEUTRAL
                if (window.kimiVideoController) {
                    window.kimiVideoController.playVideo("neutral");
                } else if (window.kimiVideo) {
                    // Fallback to old system
                    window.kimiVideo.returnToNeutral();
                }
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

        if (window.KIMI_CONFIG?.DEBUG?.VOICE) {
            console.warn("🎤 Voice selector empty after filtering", {
                selectedLanguage: this.selectedLanguage,
                available: (this.availableVoices || []).map(v => ({ name: v.name, lang: v.lang }))
            });
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
        const rawLang = e.target.value;
        const newLang = window.KimiLanguageUtils?.normalizeLanguageCode ? window.KimiLanguageUtils.normalizeLanguageCode(rawLang) : rawLang;
        const oldLang = this.selectedLanguage;
        console.log(`🎤 Language changing: "${oldLang}" → "${newLang}"`);

        this.selectedLanguage = newLang;
        await this.db?.setPreference("selectedLanguage", newLang);

        // Update i18n system for interface translations
        if (window.kimiI18nManager?.setLanguage) {
            await window.kimiI18nManager.setLanguage(newLang);
        }

        // Revalidate current voice preference for new language (remove "auto" semantics)
        try {
            const pref = await this.db?.getPreference("selectedVoice", null);
            if (pref) {
                const compatible = this.getVoicesForLanguage(newLang).some(v => v.name === pref);
                if (!compatible) await this.db?.setPreference("selectedVoice", null);
            }
        } catch {}

        this.currentVoice = null;
        await this.initVoices();

        if (this.currentVoice) {
            console.log(`🎤 Voice selected for "${newLang}": "${this.currentVoice.name}" (${this.currentVoice.lang})`);
        } else {
            console.warn(`🎤 No voice found for language "${newLang}"`);
        }

        // Single clear path: recreate recognition instance with new language
        this._refreshRecognitionLanguage(newLang);
    }

    /**
     * Recreate speech recognition instance with a new language.
     * Some browsers (notably Chrome) may ignore lang changes mid-session; recreating ensures consistency.
     */
    async _refreshRecognitionLanguage(newLang) {
        if (!this.SpeechRecognition) return;
        const wasListening = this.isListening;
        if (this.recognition) {
            try {
                if (this.isListening) this.recognition.stop();
            } catch {}
            this.recognition.onresult = null;
            this.recognition.onstart = null;
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition = null;
        }
        this.selectedLanguage = newLang;
        await this.setupSpeechRecognition();
        console.log(`🎤 Recognition language refreshed -> ${this.recognition?.lang}`);
        // Restart listening if it was active
        if (wasListening) {
            // Small delay to allow new instance to settle
            setTimeout(() => {
                this.startListening();
            }, 150);
        }
    }

    // Return a normalized concrete language code (primary subtag) never 'auto'
    async getEffectiveLanguage(raw) {
        let base = raw || this.selectedLanguage || "en";
        if (base === "auto") {
            try {
                if (window.KimiLanguageUtils?.getLanguage) {
                    base = await window.KimiLanguageUtils.getLanguage();
                } else {
                    base = navigator.language?.split("-")[0] || "en";
                }
            } catch {
                base = "en";
            }
        }
        return window.KimiLanguageUtils?.normalizeLanguageCode ? window.KimiLanguageUtils.normalizeLanguageCode(base) : base || "en";
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
        if (!this.hasSR || !this.SpeechRecognition) {
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

    // Cleanup method to prevent memory leaks
    cleanup() {
        // Clean up permission listener if it exists
        if (this.permissionStatus && this.permissionChangeHandler) {
            try {
                this.permissionStatus.removeEventListener("change", this.permissionChangeHandler);
            } catch (e) {
                // Silent cleanup - permission API may not support removal
            }
        }

        // Clean up timeouts
        if (this.listeningTimeout) {
            clearTimeout(this.listeningTimeout);
            this.listeningTimeout = null;
        }

        if (this.transcriptHideTimeout) {
            clearTimeout(this.transcriptHideTimeout);
            this.transcriptHideTimeout = null;
        }

        // Clean up recognition
        if (this.recognition) {
            try {
                this.recognition.abort();
            } catch (e) {
                // Silent cleanup
            }
        }

        // Clean up mic button listener
        if (this.micButton && this.handleMicClick) {
            this.micButton.removeEventListener("click", this.handleMicClick);
        }

        // Clean up voice select listener
        const voiceSelect = document.getElementById("voice-select");
        if (voiceSelect && this.voiceChangeHandler) {
            voiceSelect.removeEventListener("change", this.voiceChangeHandler);
        }
    }
}

// Export for usage
window.KimiVoiceManager = KimiVoiceManager;
