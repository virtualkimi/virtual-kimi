// Kimi Logic - Delegates to unified emotion system

if (!window.kimiAnalyzeEmotion)
    window.kimiAnalyzeEmotion = function (text, lang = "auto") {
        if (!window.kimiEmotionSystem) {
            window.kimiEmotionSystem = new (window.KimiEmotionSystem || function () {})();
        }
        if (window.kimiEmotionSystem && typeof window.kimiEmotionSystem.analyzeEmotion === "function") {
            return window.kimiEmotionSystem.analyzeEmotion(text, lang);
        }
        return "neutral";
    };

if (!window.getPersonalityAverage)
    window.getPersonalityAverage = function (traits) {
        if (!window.kimiEmotionSystem) {
            window.kimiEmotionSystem = new (window.KimiEmotionSystem || function () {})();
        }
        if (window.kimiEmotionSystem && typeof window.kimiEmotionSystem.calculatePersonalityAverage === "function") {
            return window.kimiEmotionSystem.calculatePersonalityAverage(traits);
        }
        if (!traits || typeof traits !== "object") return 50;
        const values = Object.values(traits).filter(v => typeof v === "number" && !isNaN(v));
        if (values.length === 0) return 50;
        const sum = values.reduce((a, b) => a + b, 0);
        return Math.round(sum / values.length);
    };

if (!window.updatePersonalityTraitsFromEmotion)
    window.updatePersonalityTraitsFromEmotion = async function (emotion, text) {
        if (!window.kimiEmotionSystem) {
            window.kimiEmotionSystem = new (window.KimiEmotionSystem || function () {})();
        }
        if (window.kimiEmotionSystem && typeof window.kimiEmotionSystem.updatePersonalityFromEmotion === "function") {
            try {
                await window.kimiEmotionSystem.updatePersonalityFromEmotion(emotion, text);
            } catch (error) {
                console.error("Error updating personality traits from emotion:", error);
            }
        }
    };
