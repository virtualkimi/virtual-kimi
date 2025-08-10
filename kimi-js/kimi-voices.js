// ===== KIMI VOICE MANAGEMENT MODULE =====
class KimiVoiceManager {
    constructor(database, memory) {
        this.db = database;
        this.memory = memory;
        this.isInitialized = false;

        // Voice properties
        this.speechSynthesis = window.speechSynthesis;
        this.kimiEnglishVoice = null;
        this.availableVoices = [];

        // Speech recognition
        this.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = null;
        this.isListening = false;
        this.isStoppingVolontaire = false;

        // DOM elements
        this.micButton = null;
        this.transcriptContainer = null;
        this.transcriptText = null;

        // Callback for voice message analysis
        this.onSpeechAnalysis = null;

        // Reference to mic handler function for removal
        this.handleMicClick = null;

        this.transcriptHideTimeout = null;
        this.listeningTimeout = null;

        // Selected character for responses
        this.selectedCharacter = "Kimi";

        // Speaking flag
        this.isSpeaking = false;

        // Auto-stop listening duration (in milliseconds)
        this.autoStopDuration = 15000; // 15 seconds

        // Silence timeout after final transcript (in milliseconds)
        this.silenceTimeout = 2200; // 2.2 seconds

        // Track if microphone permission has been granted
        this.micPermissionGranted = false;

        // Debounce flag for toggle microphone
        this._toggleDebounce = false;

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

            // Initialize voice synthesis
            await this.initVoices();
            this.setupVoicesChangedListener();
            this.setupLanguageSelector();

            // Initialize speech recognition
            this.setupSpeechRecognition();
            this.setupMicrophoneButton();

            // Check current microphone permission status
            await this.checkMicrophonePermission();

            // Initialize selected character
            if (this.db && typeof this.db.getSelectedCharacter === "function") {
                const char = await this.db.getSelectedCharacter();
                if (char) this.selectedCharacter = char;
            }

            this.isInitialized = true;
            console.log("🎤 VoiceManager initialized successfully");
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
        const isChrome = /Chrome\//.test(ua) && !isEdge && !isOpera;
        if (isFirefox) return "firefox";
        if (isOpera) return "opera";
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
                return;
            }

            const permissionStatus = await navigator.permissions.query({ name: "microphone" });
            this.micPermissionGranted = permissionStatus.state === "granted";

            console.log("🎤 Initial microphone permission status:", permissionStatus.state);

            // Listen for permission changes
            permissionStatus.addEventListener("change", () => {
                this.micPermissionGranted = permissionStatus.state === "granted";
                console.log("🎤 Microphone permission changed to:", permissionStatus.state);
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

        // Only get language from DB if not already set
        if (!this.selectedLanguage) {
            const selectedLanguage = await this.db?.getPreference("selectedLanguage", "en");
            this.selectedLanguage = selectedLanguage || "en";
        }

        const savedVoice = await this.db?.getPreference("selectedVoice", "auto");

        let filteredVoices = this.availableVoices.filter(voice => voice.lang.toLowerCase().startsWith(this.selectedLanguage));
        if (filteredVoices.length === 0) {
            filteredVoices = this.availableVoices.filter(voice => voice.lang.toLowerCase().includes(this.selectedLanguage));
        }
        if (filteredVoices.length === 0) {
            // As a last resort, use any available voice rather than defaulting to English
            filteredVoices = this.availableVoices;
        }

        if (savedVoice && savedVoice !== "auto") {
            let foundVoice = filteredVoices.find(voice => voice.name === savedVoice);
            if (!foundVoice) {
                foundVoice = this.availableVoices.find(voice => voice.name === savedVoice);
            }
            if (foundVoice) {
                this.kimiEnglishVoice = foundVoice;
                this.updateVoiceSelector();
                this._initializingVoices = false;
                return;
            } else if (filteredVoices.length > 0) {
                this.kimiEnglishVoice = filteredVoices[0];
                await this.db?.setPreference("selectedVoice", this.kimiEnglishVoice.name);
                this.updateVoiceSelector();
                this._initializingVoices = false;
                return;
            }
        }

        if (this.selectedLanguage && this.selectedLanguage.startsWith("fr")) {
            this.kimiEnglishVoice =
                filteredVoices.find(voice => voice.name.startsWith("Microsoft Eloise Online")) ||
                filteredVoices.find(voice => voice.name.toLowerCase().includes("eloise")) ||
                filteredVoices[0] ||
                this.availableVoices[0];
        } else {
            this.kimiEnglishVoice =
                filteredVoices.find(voice => voice.name.toLowerCase().includes("female")) ||
                filteredVoices[0] ||
                this.availableVoices[0];
        }

        if (this.kimiEnglishVoice) {
            await this.db?.setPreference("selectedVoice", this.kimiEnglishVoice.name);
        }

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

        let filteredVoices = this.availableVoices.filter(voice => voice.lang.toLowerCase().startsWith(this.selectedLanguage));
        if (filteredVoices.length === 0) {
            filteredVoices = this.availableVoices.filter(voice => voice.lang.toLowerCase().includes(this.selectedLanguage));
        }
        if (filteredVoices.length === 0) {
            // Show all voices if none match the selected language
            filteredVoices = this.availableVoices;
        }

        filteredVoices.forEach(voice => {
            const option = document.createElement("option");
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            if (this.kimiEnglishVoice && voice.name === this.kimiEnglishVoice.name) {
                option.selected = true;
            }
            voiceSelect.appendChild(option);
        });

        voiceSelect.removeEventListener("change", this.handleVoiceChange);
        voiceSelect.addEventListener("change", this.handleVoiceChange.bind(this));
    }

    async handleVoiceChange(e) {
        if (e.target.value === "auto") {
            await this.db?.setPreference("selectedVoice", "auto");
            // Don't re-init voices when auto is selected to avoid loops
            this.kimiEnglishVoice = null; // Reset to trigger auto-selection on next speak
        } else {
            this.kimiEnglishVoice = this.availableVoices.find(voice => voice.name === e.target.value);
            await this.db?.setPreference("selectedVoice", e.target.value);
            // Reduced logging to prevent noise
        }
    }

    setupVoicesChangedListener() {
        if (this.speechSynthesis.onvoiceschanged !== undefined) {
            this.speechSynthesis.onvoiceschanged = async () => await this.initVoices();
        }
    }

    async speak(text, options = {}) {
        if (!text || !this.kimiEnglishVoice) {
            console.warn("Unable to speak: empty text or voice not initialized");
            return;
        }
        if (this.transcriptHideTimeout) {
            clearTimeout(this.transcriptHideTimeout);
            this.transcriptHideTimeout = null;
        }
        if (this.speechSynthesis.speaking) {
            this.speechSynthesis.cancel();
        }

        // Clean text for better speech synthesis
        let processedText = text
            .replace(/([\p{Emoji}\p{Extended_Pictographic}])/gu, " ")
            .replace(/\.\.\./g, " pause ")
            .replace(/\!+/g, " ! ")
            .replace(/\?+/g, " ? ")
            .replace(/\.{2,}/g, " pause ")
            .replace(/[,;:]+/g, ", ")
            .replace(/\s+/g, " ")
            .trim();

        // Detect emotional content for voice adjustments
        let customRate = options.rate;
        if (customRate === undefined) {
            customRate = this.memory?.preferences?.voiceRate;
        }
        if (customRate === undefined) {
            customRate = window.kimiMemory?.preferences?.voiceRate;
        }
        if (customRate === undefined) {
            const rateSlider = document.getElementById("voice-rate");
            customRate = rateSlider ? parseFloat(rateSlider.value) : 1.1;
        }

        let customPitch = options.pitch;
        if (customPitch === undefined) {
            customPitch = this.memory?.preferences?.voicePitch;
        }
        if (customPitch === undefined) {
            customPitch = window.kimiMemory?.preferences?.voicePitch;
        }
        if (customPitch === undefined) {
            const pitchSlider = document.getElementById("voice-pitch");
            customPitch = pitchSlider ? parseFloat(pitchSlider.value) : 1.1;
        }

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
        utterance.voice = this.kimiEnglishVoice;
        utterance.rate = customRate;
        utterance.pitch = customPitch;

        // Get volume from multiple sources with fallback hierarchy
        let volume = options.volume;
        if (volume === undefined) {
            // Try to get from memory preferences
            volume = this.memory?.preferences?.voiceVolume;
        }
        if (volume === undefined) {
            // Try to get from kimiMemory global
            volume = window.kimiMemory?.preferences?.voiceVolume;
        }
        if (volume === undefined) {
            // Try to get directly from slider
            const volumeSlider = document.getElementById("voice-volume");
            volume = volumeSlider ? parseFloat(volumeSlider.value) : 0.8;
        }
        utterance.volume = volume;
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
            const showTranscript = await this.db?.getPreference("showTranscript", true);
            if (showTranscript && this.transcriptContainer) {
                this.transcriptContainer.classList.add("visible");
            } else if (this.transcriptContainer) {
                this.transcriptContainer.classList.remove("visible");
            }
        };

        utterance.onend = () => {
            this.isSpeaking = false;
            if (this.transcriptContainer) {
                this.transcriptContainer.classList.remove("visible");
            }
            this.transcriptHideTimeout = null;
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
            if (this.transcriptContainer) {
                this.transcriptContainer.classList.remove("visible");
            }
            this.transcriptHideTimeout = null;
        };

        this.speechSynthesis.speak(utterance);
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

    async showResponseWithPerfectTiming(text) {
        if (!this.transcriptContainer || !this.transcriptText) return;
        const showTranscript = await this.db?.getPreference("showTranscript", true);
        if (!showTranscript) return;
        this.transcriptText.textContent = `${this.selectedCharacter}: ${text}`;
        this.transcriptContainer.classList.add("visible");
        if (this.transcriptHideTimeout) {
            clearTimeout(this.transcriptHideTimeout);
            this.transcriptHideTimeout = null;
        }
    }

    showResponse(text) {
        this.showResponseWithPerfectTiming(text);
    }

    async showUserMessage(text, duration = 3000) {
        if (!this.transcriptContainer || !this.transcriptText) return;
        const showTranscript = await this.db?.getPreference("showTranscript", true);
        if (!showTranscript) return;
        if (this.transcriptHideTimeout) {
            clearTimeout(this.transcriptHideTimeout);
            this.transcriptHideTimeout = null;
        }
        this.transcriptText.textContent = text;
        this.transcriptContainer.classList.add("visible");
        this.transcriptHideTimeout = setTimeout(() => {
            if (this.transcriptContainer) {
                this.transcriptContainer.classList.remove("visible");
            }
            this.transcriptHideTimeout = null;
        }, duration);
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
        let langCode = this.selectedLanguage || "en";
        if (langCode === "fr") langCode = "fr-FR";
        if (langCode === "en") langCode = "en-US";
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

            let final_transcript = "";
            let interim_transcript = "";
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    final_transcript += event.results[i][0].transcript;
                } else {
                    interim_transcript += event.results[i][0].transcript;
                }
            }
            const showTranscript = await this.db?.getPreference("showTranscript", true);
            if (showTranscript && this.transcriptText) {
                this.transcriptText.textContent = final_transcript || interim_transcript;
                if (this.transcriptContainer && (final_transcript || interim_transcript)) {
                    this.transcriptContainer.classList.add("visible");
                }
            } else if (this.transcriptContainer) {
                this.transcriptContainer.classList.remove("visible");
            }
            if (final_transcript && this.onSpeechAnalysis) {
                try {
                    // Auto-stop after silence timeout following final transcript
                    setTimeout(() => {
                        this.stopListening();
                    }, this.silenceTimeout);
                    (async () => {
                        if (typeof window.analyzeAndReact === "function") {
                            const response = await window.analyzeAndReact(final_transcript);
                            if (response) {
                                const chatContainer = document.getElementById("chat-container");
                                const chatMessages = document.getElementById("chat-messages");
                                if (chatContainer && chatContainer.classList.contains("visible") && chatMessages) {
                                    const addMessageToChat =
                                        window.addMessageToChat ||
                                        (typeof addMessageToChat !== "undefined" ? addMessageToChat : null);
                                    if (addMessageToChat) {
                                        addMessageToChat("user", final_transcript);
                                        addMessageToChat("kimi", response);
                                    } else {
                                        const userDiv = document.createElement("div");
                                        userDiv.className = "message user";

                                        const userMessageDiv = document.createElement("div");
                                        userMessageDiv.textContent = final_transcript;

                                        const userTimeDiv = document.createElement("div");
                                        userTimeDiv.className = "message-time";
                                        userTimeDiv.textContent = new Date().toLocaleTimeString("en-US", {
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        });

                                        userDiv.appendChild(userMessageDiv);
                                        userDiv.appendChild(userTimeDiv);
                                        chatMessages.appendChild(userDiv);

                                        const kimiDiv = document.createElement("div");
                                        kimiDiv.className = "message kimi";

                                        const kimiMessageDiv = document.createElement("div");
                                        kimiMessageDiv.textContent = response;

                                        const kimiTimeDiv = document.createElement("div");
                                        kimiTimeDiv.className = "message-time";
                                        kimiTimeDiv.textContent = new Date().toLocaleTimeString("en-US", {
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        });

                                        kimiDiv.appendChild(kimiMessageDiv);
                                        kimiDiv.appendChild(kimiTimeDiv);
                                        chatMessages.appendChild(kimiDiv);
                                        chatMessages.scrollTop = chatMessages.scrollHeight;
                                    }
                                }
                                setTimeout(() => {
                                    this.speak(response);
                                }, 500);
                            }
                        } else {
                            const response = await this.onSpeechAnalysis(final_transcript);
                            if (response) {
                                const chatContainer = document.getElementById("chat-container");
                                const chatMessages = document.getElementById("chat-messages");
                                if (chatContainer && chatContainer.classList.contains("visible") && chatMessages) {
                                    const addMessageToChat =
                                        window.addMessageToChat ||
                                        (typeof addMessageToChat !== "undefined" ? addMessageToChat : null);
                                    if (addMessageToChat) {
                                        addMessageToChat("user", final_transcript);
                                        addMessageToChat("kimi", response);
                                    } else {
                                        const userDiv = document.createElement("div");
                                        userDiv.className = "message user";

                                        const userMessageDiv = document.createElement("div");
                                        userMessageDiv.textContent = final_transcript;

                                        const userTimeDiv = document.createElement("div");
                                        userTimeDiv.className = "message-time";
                                        userTimeDiv.textContent = new Date().toLocaleTimeString("en-US", {
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        });

                                        userDiv.appendChild(userMessageDiv);
                                        userDiv.appendChild(userTimeDiv);
                                        chatMessages.appendChild(userDiv);

                                        const kimiDiv = document.createElement("div");
                                        kimiDiv.className = "message kimi";

                                        const kimiMessageDiv = document.createElement("div");
                                        kimiMessageDiv.textContent = response;

                                        const kimiTimeDiv = document.createElement("div");
                                        kimiTimeDiv.className = "message-time";
                                        kimiTimeDiv.textContent = new Date().toLocaleTimeString("en-US", {
                                            hour: "2-digit",
                                            minute: "2-digit"
                                        });

                                        kimiDiv.appendChild(kimiMessageDiv);
                                        kimiDiv.appendChild(kimiTimeDiv);
                                        chatMessages.appendChild(kimiDiv);
                                        chatMessages.scrollTop = chatMessages.scrollHeight;
                                    }
                                }
                                setTimeout(() => {
                                    this.speak(response);
                                }, 500);
                            }
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
                if (this.transcriptText) {
                    this.transcriptText.textContent =
                        window.kimiI18nManager?.t("mic_permission_denied") ||
                        "Microphone permission denied. Click again to retry.";
                    this.transcriptContainer?.classList.add("visible");
                    setTimeout(() => {
                        this.transcriptContainer?.classList.remove("visible");
                    }, 2000);
                }
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
            if (this.transcriptContainer) {
                this.transcriptContainer.classList.remove("visible");
            }
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
                if (this.transcriptText) {
                    this.transcriptText.textContent = message;
                    this.transcriptContainer?.classList.add("visible");
                    setTimeout(() => {
                        this.transcriptContainer?.classList.remove("visible");
                    }, 4000);
                }
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
        console.log("🎤 Microphone button event listener setup complete");
    }

    async startListening() {
        // Show helpful message if SR API is missing
        if (!this.SpeechRecognition) {
            let key = "sr_not_supported_generic";
            if (this.browser === "firefox") key = "sr_not_supported_firefox";
            else if (this.browser === "opera") key = "sr_not_supported_opera";
            else if (this.browser === "safari") key = "sr_not_supported_safari";
            const message = window.kimiI18nManager?.t(key) || "Speech recognition is not available in this browser.";
            if (this.transcriptText) {
                this.transcriptText.textContent = message;
                this.transcriptContainer?.classList.add("visible");
                setTimeout(() => {
                    this.transcriptContainer?.classList.remove("visible");
                }, 4000);
            }
            return;
        }
        if (!this.recognition || this.isListening) return;

        // Check microphone API availability
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.warn("MediaDevices API not available");
            if (this.transcriptText) {
                this.transcriptText.textContent =
                    window.kimiI18nManager?.t("mic_not_supported") || "Microphone not supported in this browser.";
                this.transcriptContainer?.classList.add("visible");
                setTimeout(() => {
                    this.transcriptContainer?.classList.remove("visible");
                }, 3000);
            }
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
                if (this.transcriptText) {
                    this.transcriptText.textContent =
                        window.kimiI18nManager?.t("mic_permission_denied") ||
                        "Microphone permission denied. Please allow access in browser settings.";
                    this.transcriptContainer?.classList.add("visible");
                    setTimeout(() => {
                        this.transcriptContainer?.classList.remove("visible");
                    }, 4000);
                }
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
            if (this.transcriptText) {
                this.transcriptText.textContent =
                    window.kimiI18nManager?.t("mic_permission_denied") || "Microphone permission denied. Click again to retry.";
                this.transcriptContainer?.classList.add("visible");
                setTimeout(() => {
                    this.transcriptContainer?.classList.remove("visible");
                }, 3000);
            }
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
                // On laisse la vidéo d'émotion se terminer naturellement
            } else if (this.isStoppingVolontaire) {
                // On retourne directement au neutre sans utiliser "transition"
                window.kimiVideo.returnToNeutral();
            }
        }

        if (this.transcriptHideTimeout) {
            clearTimeout(this.transcriptHideTimeout);
            this.transcriptHideTimeout = null;
        }

        if (!this.speechSynthesis.speaking) {
            this.transcriptHideTimeout = setTimeout(() => {
                if (this.transcriptContainer) {
                    this.transcriptContainer.classList.remove("visible");
                }
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
        return this.kimiFrenchVoice !== null;
    }

    getCurrentVoice() {
        return this.kimiFrenchVoice;
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
        const randomMessage = testMessages[Math.floor(Math.random() * testMessages.length)];
        await this.speak(randomMessage);
    }

    destroy() {
        // Clear all timeouts
        if (this.listeningTimeout) {
            clearTimeout(this.listeningTimeout);
            this.listeningTimeout = null;
        }

        if (this.transcriptHideTimeout) {
            clearTimeout(this.transcriptHideTimeout);
            this.transcriptHideTimeout = null;
        }

        if (this.recognition) {
            this.recognition.stop();
            this.recognition = null;
        }

        if (this.speechSynthesis.speaking) {
            this.speechSynthesis.cancel();
        }

        if (this.micButton && this.handleMicClick) {
            this.micButton.removeEventListener("click", this.handleMicClick);
        }

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
    }

    async handleLanguageChange(e) {
        const newLang = e.target.value;
        console.log(`🎤 Language changing to: ${newLang}`);
        this.selectedLanguage = newLang;
        await this.db?.setPreference("selectedLanguage", newLang);

        // Force voice reset when changing language
        const currentVoicePref = await this.db?.getPreference("selectedVoice", "auto");
        if (currentVoicePref === "auto") {
            // Reset voice selection to force auto-selection for new language
            this.kimiEnglishVoice = null;
            console.log(`🎤 Voice reset for auto-selection in ${newLang}`);
        }

        await this.initVoices();
        console.log(
            `🎤 Voice initialized for ${newLang}, selected voice:`,
            this.kimiEnglishVoice?.name,
            this.kimiEnglishVoice?.lang
        );

        if (this.recognition) {
            let langCode = newLang;
            if (langCode === "fr") langCode = "fr-FR";
            else if (langCode === "en") langCode = "en-US";
            else if (langCode === "es") langCode = "es-ES";
            else if (langCode === "de") langCode = "de-DE";
            else if (langCode === "it") langCode = "it-IT";
            else if (langCode === "ja") langCode = "ja-JP";
            else if (langCode === "zh") langCode = "zh-CN";
            this.recognition.lang = langCode;
        }
    }

    async updateSelectedCharacter() {
        if (this.db && typeof this.db.getSelectedCharacter === "function") {
            const char = await this.db.getSelectedCharacter();
            if (char) this.selectedCharacter = char;
        }
    }

    // Public method for external microphone toggle (keyboard, etc.)
    toggleMicrophone() {
        if (!this.SpeechRecognition) {
            console.warn("🎤 Speech recognition not available");
            return false;
        }

        // Add debouncing to prevent rapid toggles
        if (this._toggleDebounce) {
            console.log("🎤 Toggle debounced, ignoring rapid call");
            return false;
        }

        this._toggleDebounce = true;
        setTimeout(() => {
            this._toggleDebounce = false;
        }, 300); // 300ms debounce

        // If Kimi is speaking, stop speech synthesis first
        if (this.isSpeaking && this.speechSynthesis.speaking) {
            console.log("🎤 Interrupting speech to start listening");
            this.speechSynthesis.cancel();
            this.isSpeaking = false;
            if (this.transcriptContainer) {
                this.transcriptContainer.classList.remove("visible");
            }
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
