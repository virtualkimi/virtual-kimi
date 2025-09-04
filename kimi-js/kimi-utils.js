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

// KimiVideoManager implementation moved to ./kimi-videos.js
// Ensure the video manager module is evaluated so it registers itself on window
import "./kimi-videos.js";

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

// Expose personality → mood helper for video manager
window.getMoodCategoryFromPersonality = getMoodCategoryFromPersonality;

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
// KimiVideoManager is provided by the separate module `kimi-videos.js` which sets
// `window.KimiVideoManager` when executed. Do not reference the symbol here to
// avoid ReferenceError during module evaluation.
window.KimiSecurityUtils = KimiSecurityUtils;
window.KimiCacheManager = new KimiCacheManager(); // Create global instance
// Expose helper used by the video manager
window.getCharacterInfo = getCharacterInfo;
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
