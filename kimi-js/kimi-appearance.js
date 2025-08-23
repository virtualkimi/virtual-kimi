// ===== KIMI APPEARANCE MANAGER =====
class KimiAppearanceManager extends KimiBaseManager {
    constructor(database) {
        super();
        this.db = database;
        this.currentTheme = "dark";
        this.interfaceOpacity = 0.8;
        this.animationsEnabled = true;
    }

    async init() {
        try {
            await this.loadAppearanceSettings();
            this.applyTheme(this.currentTheme);
            this.applyInterfaceOpacity(this.interfaceOpacity);
            this.applyAnimationSettings(this.animationsEnabled);
            this.setupAppearanceControls();
            this.syncAnimationToggleState();
        } catch (error) {
            console.error("KimiAppearanceManager initialization error:", error);
        }
    }

    syncAnimationToggleState() {
        const animationsToggle = document.getElementById("animations-toggle");
        if (animationsToggle) {
            animationsToggle.classList.toggle("active", this.animationsEnabled);
            animationsToggle.setAttribute("aria-checked", this.animationsEnabled ? "true" : "false");
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
            this.animationsEnabled = await this.db.getPreference(
                "animationsEnabled",
                window.KIMI_CONFIG?.DEFAULTS?.ANIMATIONS_ENABLED ?? true
            );
        } catch (error) {
            console.error("Error loading appearance settings:", error);
        }
    }

    setupAppearanceControls() {
        try {
            this.setupThemeSelector();
            this.setupOpacitySlider();
            this.setupAnimationsToggle();
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

    setupAnimationsToggle() {
        const animationsToggle = document.getElementById("animations-toggle");
        if (!animationsToggle) return;

        animationsToggle.classList.toggle("active", this.animationsEnabled);
        animationsToggle.setAttribute("aria-checked", this.animationsEnabled ? "true" : "false");

        // Remove any existing listener to prevent conflicts
        if (this._animationsClickHandler) {
            animationsToggle.removeEventListener("click", this._animationsClickHandler);
        }

        this._animationsClickHandler = async () => {
            try {
                this.animationsEnabled = !this.animationsEnabled;
                animationsToggle.classList.toggle("active", this.animationsEnabled);
                animationsToggle.setAttribute("aria-checked", this.animationsEnabled ? "true" : "false");
                await this.toggleAnimations(this.animationsEnabled);
            } catch (error) {
                console.error("Error toggling animations:", error);
            }
        };

        animationsToggle.addEventListener("click", this._animationsClickHandler);
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

    async toggleAnimations(enabled) {
        try {
            this.animationsEnabled = enabled;
            this.applyAnimationSettings(enabled);

            if (this.db) {
                await this.db.setPreference("animationsEnabled", enabled);
            }
        } catch (error) {
            console.error("Error toggling animations:", error);
        }
    }

    applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
    }

    applyInterfaceOpacity(opacity) {
        document.documentElement.style.setProperty("--interface-opacity", opacity);
    }

    applyAnimationSettings(enabled) {
        document.documentElement.setAttribute("data-animations", enabled ? "true" : "false");
        document.documentElement.style.setProperty("--animations-enabled", enabled ? "1" : "0");

        // Ensure body class reflects animation state
        if (enabled) {
            document.body.classList.remove("no-animations");
            document.body.classList.add("animations-enabled");
        } else {
            document.body.classList.remove("animations-enabled");
            document.body.classList.add("no-animations");
        }
    }

    cleanup() {
        const animationsToggle = document.getElementById("animations-toggle");
        if (animationsToggle && this._animationsClickHandler) {
            animationsToggle.removeEventListener("click", this._animationsClickHandler);
            this._animationsClickHandler = null;
        }
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
        const animationsToggle = document.getElementById("animations-toggle");
        if (animationsToggle) {
            // Remove any conflicting classes or states
            animationsToggle.classList.remove("active");
            // Re-apply correct state
            animationsToggle.classList.toggle("active", this.animationsEnabled);
            animationsToggle.setAttribute("aria-checked", this.animationsEnabled ? "true" : "false");

            // Ensure CSS custom properties are in sync
            this.applyAnimationSettings(this.animationsEnabled);
        }
    }
}

window.KimiAppearanceManager = KimiAppearanceManager;
