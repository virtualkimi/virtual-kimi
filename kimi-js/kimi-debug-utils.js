// KIMI DEBUG UTILITIES
// Centralized debug management for production optimization
//
// USAGE:
// debugOn() - Enable all debug logs
// debugOff() - Disable all debug logs (production mode)
// debugStatus() - Show current debug configuration
// kimiDebugAll() - Complete debug dashboard (includes errors)
// kimiDiagnosDB() - Database schema diagnostics
//
// CATEGORIES:
// KimiDebugController.setDebugCategory("VIDEO", true)
// KimiDebugController.setDebugCategory("MEMORY", false)
// Available: VIDEO, VOICE, MEMORY, API, SYNC

// Global debug controller
window.KimiDebugController = {
    // Enable/disable all debug features
    setGlobalDebug(enabled) {
        if (window.KIMI_CONFIG && window.KIMI_CONFIG.DEBUG) {
            window.KIMI_CONFIG.DEBUG.ENABLED = enabled;
            window.KIMI_CONFIG.DEBUG.VOICE = enabled;
            window.KIMI_CONFIG.DEBUG.VIDEO = enabled;
            window.KIMI_CONFIG.DEBUG.MEMORY = enabled;
            window.KIMI_CONFIG.DEBUG.API = enabled;
            window.KIMI_CONFIG.DEBUG.SYNC = enabled;
        }

        // Legacy flags (to be removed)
        window.KIMI_DEBUG_SYNC = enabled;
        window.KIMI_DEBUG_MEMORIES = enabled;
        window.KIMI_DEBUG_API_AUDIT = enabled;
        window.DEBUG_SAFE_LOGS = enabled;

        console.log(`🔧 Global debug ${enabled ? "ENABLED" : "DISABLED"}`);
    },

    // Enable specific debug category
    setDebugCategory(category, enabled) {
        if (window.KIMI_CONFIG && window.KIMI_CONFIG.DEBUG) {
            if (category in window.KIMI_CONFIG.DEBUG) {
                window.KIMI_CONFIG.DEBUG[category] = enabled;
                console.log(`🔧 Debug category ${category} ${enabled ? "ENABLED" : "DISABLED"}`);
            }
        }

        // Video manager specific
        if (category === "VIDEO" && window.kimiVideo) {
            window.kimiVideo.setDebug(enabled);
        }
    },

    // Production mode (all debug off)
    setProductionMode() {
        this.setGlobalDebug(false);
        console.log("🚀 Production mode activated - all debug logs disabled");
    },

    // Development mode (selective debug on)
    setDevelopmentMode() {
        this.setGlobalDebug(true);
        console.log("🛠️ Development mode activated - debug logs enabled");
    },

    // Get current debug status
    getDebugStatus() {
        const status = {
            global: window.KIMI_CONFIG?.DEBUG?.ENABLED || false,
            voice: window.KIMI_CONFIG?.DEBUG?.VOICE || false,
            video: window.KIMI_CONFIG?.DEBUG?.VIDEO || false,
            memory: window.KIMI_CONFIG?.DEBUG?.MEMORY || false,
            api: window.KIMI_CONFIG?.DEBUG?.API || false,
            sync: window.KIMI_CONFIG?.DEBUG?.SYNC || false
        };

        console.table(status);
        return status;
    }
};

// Quick shortcuts for console
window.debugOn = () => window.KimiDebugController.setDevelopmentMode();
window.debugOff = () => window.KimiDebugController.setProductionMode();
window.debugStatus = () => window.KimiDebugController.getDebugStatus();

// Integration with error manager for unified debugging
window.kimiDebugAll = () => {
    console.group("🔧 Kimi Debug Dashboard");
    window.KimiDebugController.getDebugStatus();
    if (window.kimiErrorManager) {
        window.kimiErrorManager.printErrorSummary();
    }
    console.groupEnd();
};

// Database diagnostics helper
window.kimiDiagnosDB = async () => {
    console.group("🔍 Database Diagnostics");
    try {
        if (window.kimiDB) {
            console.log("📊 Database version:", window.kimiDB.db.verno);
            console.log("📋 Available tables:", Object.keys(window.kimiDB.db._dbSchema));

            // Check memories table schema
            const memoriesSchema = window.kimiDB.db._dbSchema.memories;
            if (memoriesSchema) {
                console.log("🧠 Memories schema:", memoriesSchema);
                const hasCharacterIsActiveIndex = memoriesSchema.indexes?.some(
                    idx =>
                        idx.name === "[character+isActive]" ||
                        (idx.keyPath?.includes("character") && idx.keyPath?.includes("isActive"))
                );
                console.log("✅ [character+isActive] index:", hasCharacterIsActiveIndex ? "PRESENT" : "❌ MISSING");

                if (!hasCharacterIsActiveIndex) {
                    console.warn(
                        "🚨 SOLUTION: Clear browser data (Application > Storage > Clear Site Data) to force schema upgrade"
                    );
                }
            }
        } else {
            console.warn("❌ Database not initialized yet");
        }
    } catch (error) {
        console.error("Error during database diagnostics:", error);
    }
    console.groupEnd();
};

// Auto-initialize to production mode for performance
if (typeof window.KIMI_CONFIG !== "undefined") {
    window.KimiDebugController.setProductionMode();
}
