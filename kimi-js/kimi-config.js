// ===== KIMI CONFIGURATION CENTER =====
window.KIMI_CONFIG = {
    // Default values for all components
    DEFAULTS: {
        LANGUAGE: "en",
        THEME: "purple",
        INTERFACE_OPACITY: 0.8,
        ANIMATIONS_ENABLED: true,
        VOICE_RATE: 1.1,
        VOICE_PITCH: 1.1,
        VOICE_VOLUME: 0.8,
        LLM_TEMPERATURE: 0.9,
        LLM_MAX_TOKENS: 400,
        LLM_TOP_P: 0.9,
        LLM_FREQUENCY_PENALTY: 0.9,
        LLM_PRESENCE_PENALTY: 0.8,
        SELECTED_CHARACTER: "kimi",
        SHOW_TRANSCRIPT: true
    },

    // Validation ranges
    RANGES: {
        VOICE_RATE: { min: 0.5, max: 2.0 },
        VOICE_PITCH: { min: 0.5, max: 2.0 },
        VOICE_VOLUME: { min: 0.0, max: 1.0 },
        INTERFACE_OPACITY: { min: 0.1, max: 1.0 },
        LLM_TEMPERATURE: { min: 0.0, max: 1.0 },
        LLM_MAX_TOKENS: { min: 10, max: 8192 },
        LLM_TOP_P: { min: 0.0, max: 1.0 },
        LLM_FREQUENCY_PENALTY: { min: 0.0, max: 2.0 },
        LLM_PRESENCE_PENALTY: { min: 0.0, max: 2.0 }
    },

    // Performance settings
    PERFORMANCE: {
        DEBOUNCE_DELAY: 300,
        THROTTLE_DELAY: 100,
        BATCH_SIZE: 10,
        MAX_MEMORY_ENTRIES: 1000,
        CLEANUP_INTERVAL: 300000 // 5 minutes
    },

    // UI settings
    UI: {
        LOADING_TIMEOUT: 1500,
        ANIMATION_DURATION: 500,
        FEEDBACK_DURATION: 1500,
        TAB_SCROLL_THRESHOLD: 50
    },

    // API settings
    API: {
        MAX_RETRIES: 3,
        TIMEOUT: 30000,
        RATE_LIMIT_DELAY: 1000
    },

    // Error messages
    ERRORS: {
        INIT_FAILED: "Initialization failed",
        DB_ERROR: "Database error",
        API_ERROR: "API error",
        VALIDATION_ERROR: "Validation error",
        NETWORK_ERROR: "Network error"
    },

    // Available themes
    THEMES: {
        dark: "Dark Night",
        default: "Passionate Pink",
        blue: "Ocean Blue",
        purple: "Mystic Purple",
        green: "Emerald Forest"
    },

    // Supported languages
    LANGUAGES: {
        fr: "French",
        en: "English",
        es: "Spanish",
        de: "German",
        it: "Italian",
        ja: "Japanese",
        zh: "Chinese"
    }
};

// Configuration utility functions
window.KIMI_CONFIG.get = function (path, fallback = null) {
    try {
        const keys = path.split(".");
        let value = this;

        for (const key of keys) {
            if (value && typeof value === "object" && key in value) {
                value = value[key];
            } else {
                return fallback;
            }
        }

        return value;
    } catch (error) {
        console.error("Config get error:", error);
        return fallback;
    }
};

window.KIMI_CONFIG.validate = function (value, type) {
    try {
        const range = this.RANGES[type];
        if (!range) return { valid: true, value };

        const numValue = parseFloat(value);
        if (isNaN(numValue)) return { valid: false, value: this.DEFAULTS[type] };

        const clampedValue = Math.max(range.min, Math.min(range.max, numValue));
        return { valid: true, value: clampedValue };
    } catch (error) {
        console.error("Config validation error:", error);
        return { valid: false, value: this.DEFAULTS[type] };
    }
};
