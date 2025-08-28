// ===== KIMI APPEARANCE MANAGER =====
class KimiAppearanceManager extends KimiBaseManager {
    constructor(database) {
        super();
        this.db = database;
        this.currentTheme = "dark";
        this.interfaceOpacity = 0.8;
        // animations are always enabled by default; toggle removed
        this.animationsEnabled = true;
    }

    async init() {
        try {
            await this.loadAppearanceSettings();
            this.applyTheme(this.currentTheme);
            this.applyInterfaceOpacity(this.interfaceOpacity);
            this.applyAnimationSettings(this.animationsEnabled);
            this.setupAppearanceControls();
        } catch (error) {
            console.error("KimiAppearanceManager initialization error:", error);
        }
    }

    async loadAppearanceSettings() {
        if (!this.db) return;

        try {
            this.currentTheme = await this.db.getPreference("colorTheme", window.KIMI_CONFIG?.DEFAULTS?.THEME ?? "dark");
            this.interfaceOpacity = await this.db.getPreference(
                "interfaceOpacity",
                window.KIMI_CONFIG?.DEFAULTS?.INTERFACE_OPACITY ?? 0.8
            );
            // animations preference removed; always enabled by default
        } catch (error) {
            console.error("Error loading appearance settings:", error);
        }
    }

    setupAppearanceControls() {
        try {
            this.setupThemeSelector();
            this.setupOpacitySlider();
            // animations toggle removed
        } catch (error) {
            console.error("Error setting up appearance controls:", error);
        }
    }

    setupThemeSelector() {
        const themeSelector = document.getElementById("color-theme");
        if (!themeSelector) return;

        themeSelector.value = this.currentTheme;
        themeSelector.addEventListener("change", async e => {
            try {
                await this.changeTheme(e.target.value);
            } catch (error) {
                console.error("Error changing theme:", error);
            }
        });
    }

    setupOpacitySlider() {
        const opacitySlider = document.getElementById("interface-opacity");
        const opacityValue = document.getElementById("interface-opacity-value");

        if (!opacitySlider || !opacityValue) return;

        opacitySlider.value = this.interfaceOpacity;
        opacityValue.textContent = this.interfaceOpacity;

        opacitySlider.addEventListener("input", async e => {
            try {
                const value = parseFloat(e.target.value);
                opacityValue.textContent = value;
                await this.changeInterfaceOpacity(value);
            } catch (error) {
                console.error("Error changing opacity:", error);
            }
        });
    }

    async changeTheme(theme) {
        try {
            this.currentTheme = theme;
            this.applyTheme(theme);

            if (this.db) {
                await this.db.setPreference("colorTheme", theme);
            }
        } catch (error) {
            console.error("Error changing theme:", error);
        }
    }

    async changeInterfaceOpacity(opacity) {
        try {
            const validatedOpacity = window.KimiValidationUtils?.validateRange(opacity, "interfaceOpacity");
            const finalOpacity = validatedOpacity?.valid ? validatedOpacity.value : opacity;

            this.interfaceOpacity = finalOpacity;
            this.applyInterfaceOpacity(finalOpacity);

            if (this.db) {
                await this.db.setPreference("interfaceOpacity", finalOpacity);
            }
        } catch (error) {
            console.error("Error changing interface opacity:", error);
        }
    }

    // Animations toggle removed: keep animations enabled at all times

    applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    applyInterfaceOpacity(opacity) {
        document.documentElement.style.setProperty("--interface-opacity", opacity);
    }

    applyAnimationSettings(enabled) {
        // Force-enable animations by default; CSS now respects prefers-reduced-motion.
        document.documentElement.style.setProperty("--animations-enabled", "1");
        document.body.classList.add("animations-enabled");
    }

    cleanup() {
        // animations toggle removed; nothing specific to cleanup here
    }

    getThemeName(theme) {
        const themeNames = {
            dark: "Dark Night",
            pink: "Passionate Pink",
            blue: "Ocean Blue",
            purple: "Mystic Purple",
            green: "Emerald Forest"
        };
        return themeNames[theme] || "Unknown";
    }

    forceSyncUIState() {
        // Force synchronization of UI state to prevent inconsistencies
        // Ensure CSS custom properties are in sync
        this.applyAnimationSettings(this.animationsEnabled);
    }
}

window.KimiAppearanceManager = KimiAppearanceManager;
