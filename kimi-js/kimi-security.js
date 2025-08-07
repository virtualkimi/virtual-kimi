// ===== KIMI SECURITY & VALIDATION CONFIGURATION =====

window.KIMI_SECURITY_CONFIG = {
    // Input validation limits
    MAX_MESSAGE_LENGTH: 2000,
    MAX_API_KEY_LENGTH: 200,
    MIN_API_KEY_LENGTH: 10,

    // Security settings
    API_KEY_PATTERNS: [
        /^sk-or-v1-[a-zA-Z0-9]{32,}$/, // OpenRouter pattern
        /^sk-[a-zA-Z0-9]{48,}$/ // OpenAI pattern
    ],

    // Cache settings
    CACHE_MAX_AGE: 300000, // 5 minutes
    CACHE_MAX_SIZE: 100,

    // Performance settings
    DEBOUNCE_DELAY: 300,
    BATCH_DELAY: 800,
    THROTTLE_LIMIT: 1000,

    // Error messages
    ERRORS: {
        INVALID_INPUT: "Invalid input provided",
        MESSAGE_TOO_LONG: "Message too long. Please keep it under {max} characters.",
        INVALID_API_KEY: "Invalid API key format",
        NETWORK_ERROR: "Network error. Please check your connection.",
        SYSTEM_ERROR: "System error occurred. Please try again."
    }
};

// Validation utilities using the configuration
window.KIMI_VALIDATORS = {
    validateMessage: message => {
        if (!message || typeof message !== "string") return { valid: false, error: "INVALID_INPUT" };
        if (message.length > window.KIMI_SECURITY_CONFIG.MAX_MESSAGE_LENGTH) {
            return {
                valid: false,
                error: "MESSAGE_TOO_LONG",
                params: { max: window.KIMI_SECURITY_CONFIG.MAX_MESSAGE_LENGTH }
            };
        }
        return { valid: true };
    },

    validateApiKey: key => {
        if (!key || typeof key !== "string") return false;
        if (key.length < window.KIMI_SECURITY_CONFIG.MIN_API_KEY_LENGTH) return false;
        if (key.length > window.KIMI_SECURITY_CONFIG.MAX_API_KEY_LENGTH) return false;

        return window.KIMI_SECURITY_CONFIG.API_KEY_PATTERNS.some(pattern => pattern.test(key));
    },

    validateSliderValue: (value, type) => {
        // Use centralized config from KIMI_CONFIG
        if (window.KIMI_CONFIG && window.KIMI_CONFIG.validate) {
            return window.KIMI_CONFIG.validate(value, type);
        }

        // Fallback if config not available
        const num = parseFloat(value);
        if (isNaN(num)) return { valid: false, value: 0 };

        return { valid: true, value: num };
    }
};

window.KIMI_SECURITY_INITIALIZED = true;
