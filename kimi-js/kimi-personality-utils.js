// Central personality utilities (single source of truth wrappers)
// All calculations route through KimiEmotionSystem if available.
(function () {
    function calcAverage(traits) {
        if (window.kimiEmotionSystem && typeof window.kimiEmotionSystem.calculatePersonalityAverage === "function") {
            return window.kimiEmotionSystem.calculatePersonalityAverage(traits || {});
        }
        return 50;
    }
    window.KimiPersonalityUtils = { calcAverage };
})();
