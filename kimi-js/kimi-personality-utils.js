// Central personality utilities (single source of truth wrappers)
// All calculations route through KimiEmotionSystem if available.
(function () {
    function calcAverage(traits) {
        if (window.kimiEmotionSystem && typeof window.kimiEmotionSystem.calculatePersonalityAverage === "function") {
            return window.kimiEmotionSystem.calculatePersonalityAverage(traits || {});
        }
        const keys = ["affection", "playfulness", "intelligence", "empathy", "humor", "romance"];
        let sum = 0,
            c = 0;
        for (const k of keys) {
            const v = traits && traits[k];
            if (typeof v === "number" && isFinite(v)) {
                sum += Math.max(0, Math.min(100, v));
                c++;
            }
        }
        return c ? Number((sum / c).toFixed(2)) : 0;
    }
    /**
     * @deprecated Call updateGlobalPersonalityUI() directly.
     */
    async function refreshUI(characterKey = null) {
        if (window.updateGlobalPersonalityUI) {
            return window.updateGlobalPersonalityUI(characterKey);
        }
    }
    window.KimiPersonalityUtils = { calcAverage, refreshUI };
})();
