(function () {
    if (!window.KimiAPI) return;
    window.KimiAPI.registerBehavior({
        id: "playful-mode",
        name: "Playful Mode",
        description: "Makes Kimi more playful and fun in her responses.",
        modifyPrompt: function (prompt) {
            return prompt + "\n[Playful mode: Add more jokes and light-hearted comments.]";
        }
    });
})();
