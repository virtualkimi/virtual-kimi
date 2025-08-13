// ===== KIMI SECURITY & VALIDATION CONFIGURATION =====

window.KIMI_SECURITY_CONFIG = {
    // Input validation limits
    MAX_MESSAGE_LENGTH: 5000,
    MAX_API_KEY_LENGTH: 200,
    MIN_API_KEY_LENGTH: 10,

    // Security settings
    API_KEY_PATTERNS: [
        /^sk-or-v1-[a-zA-Z0-9]{16,}$/, // OpenRouter pattern (relaxed length)
        /^sk-[a-zA-Z0-9_\-]{16,}$/, // OpenAI and similar (relaxed)
        /^[a-zA-Z0-9_\-]{16,}$/ // Generic API key fallback
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

// ===== Global Input Hardening (anti-autofill and password manager suppression) =====
(function setupGlobalInputHardening() {
    try {
        const ATTRS = {
            autocomplete: "off",
            autocapitalize: "none",
            autocorrect: "off",
            spellcheck: "false",
            inputmode: "text",
            "aria-autocomplete": "none",
            "data-lpignore": "true",
            "data-1p-ignore": "true",
            "data-bwignore": "true",
            "data-form-type": "other"
        };

        const API_INPUT_ID = "openrouter-api-key";

        function hardenElement(el) {
            if (!el || !(el instanceof HTMLElement)) return;
            const tag = el.tagName;
            if (tag !== "INPUT" && tag !== "TEXTAREA") return;

            // Do not convert other inputs to password; only enforce anti-autofill attributes
            for (const [k, v] of Object.entries(ATTRS)) {
                try {
                    if (el.getAttribute(k) !== v) el.setAttribute(k, v);
                } catch {}
            }

            // Special handling for the API key field: ensure it's treated as non-credential by managers
            if (el.id === API_INPUT_ID) {
                try {
                    // Keep password type by default for masking; JS toggler can switch to text on demand
                    if (!el.hasAttribute("type")) el.setAttribute("type", "password");
                    // Explicitly set a non-credential-ish name/value context
                    if (el.getAttribute("name") !== "openrouter_api_key") el.setAttribute("name", "openrouter_api_key");
                    if (el.getAttribute("autocomplete") !== "new-password") el.setAttribute("autocomplete", "new-password");
                } catch {}
            } else {
                // For non-API inputs, if browser set type=password by heuristics, revert to text
                try {
                    if (el.getAttribute("type") === "password" && el.id !== API_INPUT_ID) {
                        el.setAttribute("type", "text");
                    }
                } catch {}
            }
        }

        function hardenAll(scope = document) {
            const nodes = scope.querySelectorAll("input, textarea");
            nodes.forEach(hardenElement);
        }

        // Initial pass
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => hardenAll());
        } else {
            hardenAll();
        }

        // Observe dynamic DOM changes
        const mo = new MutationObserver(mutations => {
            for (const m of mutations) {
                if (m.type === "childList") {
                    m.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.matches && (node.matches("input") || node.matches("textarea"))) {
                                hardenElement(node);
                            }
                            const descendants = node.querySelectorAll ? node.querySelectorAll("input, textarea") : [];
                            descendants.forEach(hardenElement);
                        }
                    });
                }
            }
        });
        try {
            mo.observe(document.documentElement || document.body, {
                subtree: true,
                childList: true
            });
        } catch {}

        // Expose for debugging if needed
        window._kimiInputHardener = { hardenAll };
    } catch (e) {
        // Fail-safe: never block the app
        console.warn("Input hardening setup error:", e);
    }
})();
