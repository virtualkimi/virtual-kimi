// i18n.js - Utilitaire de traduction pour Kimi APP

class KimiI18nManager {
    constructor() {
        this.translations = {};
        this.currentLang = "en";
    }
    async setLanguage(lang) {
        this.currentLang = lang;
        await this.loadTranslations(lang);
        this.applyTranslations();
    }
    async loadTranslations(lang) {
        try {
            const response = await fetch("kimi-locale/" + lang + ".json");
            if (!response.ok) throw new Error("Translation file not found");
            this.translations = await response.json();
            this.currentLang = lang;
        } catch (e) {
            this.translations = {};
            this.currentLang = "en";
        }
    }
    t(key, params) {
        let str = this.translations[key] || key;
        if (params && typeof str === "string") {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace(new RegExp(`{${k}}`, "g"), v);
            }
        }
        return str;
    }
    applyTranslations() {
        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.getAttribute("data-i18n");
            let params = undefined;
            const paramsAttr = el.getAttribute("data-i18n-params");
            if (paramsAttr) {
                try {
                    params = JSON.parse(paramsAttr);
                } catch {}
            }
            el.textContent = this.t(key, params);
        });
        document.querySelectorAll("[data-i18n-title]").forEach(el => {
            const key = el.getAttribute("data-i18n-title");
            el.setAttribute("title", this.t(key));
        });
        document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
            const key = el.getAttribute("data-i18n-placeholder");
            el.setAttribute("placeholder", this.t(key));
        });
        if (document.title && this.translations["title"]) {
            document.title = this.translations["title"];
        }
    }
    detectLanguage() {
        const nav = (navigator && (navigator.language || (navigator.languages && navigator.languages[0]))) || "en";
        const short = String(nav).slice(0, 2).toLowerCase();
        return ["en", "fr", "es", "de", "it", "ja", "zh"].includes(short) ? short : "en";
    }
}

window.applyTranslations = function () {
    if (window.kimiI18nManager && typeof window.kimiI18nManager.applyTranslations === "function") {
        window.kimiI18nManager.applyTranslations();
    }
};

if (typeof document !== "undefined") {
    if (!window.kimiI18nManager) {
        window.kimiI18nManager = new KimiI18nManager();
    }
}

window.KimiI18nManager = KimiI18nManager;
