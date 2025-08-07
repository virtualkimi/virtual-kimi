// ===== KIMI APPLICATION HEALTH CHECK =====
// This script runs comprehensive checks to ensure the application is production-ready

class KimiHealthCheck {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.passed = [];
    }

    checkDependencies() {
        const requiredGlobals = [
            "KimiDatabase",
            "KimiLLMManager",
            "KimiVoiceManager",
            "KimiMemorySystem",
            "KimiMemory",
            "KimiEmotionSystem",
            "KimiAppearanceManager",
            "KimiVideoManager",
            "KimiI18nManager",
            "KimiErrorManager",
            "KimiDOMUtils",
            "KIMI_CHARACTERS",
            "KIMI_CONFIG",
            "DEFAULT_SYSTEM_PROMPT"
        ];

        requiredGlobals.forEach(dep => {
            if (window[dep]) {
                this.passed.push(`✅ ${dep} available`);
            } else {
                this.errors.push(`❌ Missing dependency: ${dep}`);
            }
        });
    }

    checkFunctions() {
        const requiredFunctions = [
            "sendMessage",
            "analyzeAndReact",
            "addMessageToChat",
            "loadChatHistory",
            "loadSettingsData",
            "updatePersonalityTraitsFromEmotion",
            "kimiAnalyzeEmotion",
            "getPersonalityAverage"
        ];

        requiredFunctions.forEach(fn => {
            if (window[fn] && typeof window[fn] === "function") {
                this.passed.push(`✅ Function ${fn} available`);
            } else {
                this.errors.push(`❌ Missing function: ${fn}`);
            }
        });
    }

    checkDOMElements() {
        const requiredElements = [
            "video1",
            "video2",
            "chat-container",
            "chat-input",
            "send-button",
            "settings-overlay",
            "memory-overlay"
        ];

        requiredElements.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.passed.push(`✅ DOM element ${id} found`);
            } else {
                this.errors.push(`❌ Missing DOM element: ${id}`);
            }
        });
    }

    checkConfiguration() {
        if (window.KIMI_CHARACTERS) {
            const characters = Object.keys(window.KIMI_CHARACTERS);
            if (characters.length > 0) {
                this.passed.push(`✅ ${characters.length} characters configured`);

                characters.forEach(char => {
                    const character = window.KIMI_CHARACTERS[char];
                    if (character.traits && character.defaultPrompt) {
                        this.passed.push(`✅ Character ${char} properly configured`);
                    } else {
                        this.warnings.push(`⚠️ Character ${char} missing traits or defaultPrompt`);
                    }
                });
            } else {
                this.errors.push(`❌ No characters configured`);
            }
        }
    }

    async checkDatabase() {
        try {
            if (window.kimiDB) {
                const testPref = await window.kimiDB.getPreference("healthCheck", "test");
                if (testPref === "test") {
                    this.passed.push(`✅ Database read/write working`);
                }

                const character = await window.kimiDB.getSelectedCharacter();
                if (character) {
                    this.passed.push(`✅ Character selection working: ${character}`);
                }
            } else {
                this.errors.push(`❌ Database not initialized`);
            }
        } catch (error) {
            this.errors.push(`❌ Database error: ${error.message}`);
        }
    }

    checkMemorySystem() {
        if (window.kimiMemorySystem) {
            if (window.kimiMemorySystem.db) {
                this.passed.push(`✅ Memory system initialized`);
            } else {
                this.warnings.push(`⚠️ Memory system not connected to database`);
            }
        } else {
            this.errors.push(`❌ Memory system not available`);
        }
    }

    async runAllChecks() {
        console.log("🔍 Running Kimi Health Checks...");

        this.checkDependencies();
        this.checkFunctions();
        this.checkDOMElements();
        this.checkConfiguration();
        await this.checkDatabase();
        this.checkMemorySystem();

        return this.generateReport();
    }

    generateReport() {
        const report = {
            status: this.errors.length === 0 ? "HEALTHY" : "NEEDS_ATTENTION",
            totalChecks: this.passed.length + this.warnings.length + this.errors.length,
            passed: this.passed.length,
            warnings: this.warnings.length,
            errors: this.errors.length,
            details: {
                passed: this.passed,
                warnings: this.warnings,
                errors: this.errors
            }
        };

        console.log(`\n📊 HEALTH CHECK REPORT:`);
        console.log(`Status: ${report.status}`);
        console.log(`✅ Passed: ${report.passed}`);
        console.log(`⚠️ Warnings: ${report.warnings}`);
        console.log(`❌ Errors: ${report.errors}`);

        if (this.errors.length > 0) {
            console.log(`\n🚨 CRITICAL ISSUES:`);
            this.errors.forEach(error => console.log(error));
        }

        if (this.warnings.length > 0) {
            console.log(`\n⚠️ WARNINGS:`);
            this.warnings.forEach(warning => console.log(warning));
        }

        return report;
    }
}

// Auto-run health check when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", async () => {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for initialization
        const healthCheck = new KimiHealthCheck();
        const report = await healthCheck.runAllChecks();
        window.KIMI_HEALTH_REPORT = report;
    });
} else {
    // DOM already loaded
    setTimeout(async () => {
        const healthCheck = new KimiHealthCheck();
        const report = await healthCheck.runAllChecks();
        window.KIMI_HEALTH_REPORT = report;
    }, 2000);
}

window.KimiHealthCheck = KimiHealthCheck;
