(function () {
    if (!window.KimiAPI) return;
    window.KimiAPI.registerVoice({
        id: "sample-voice",
        name: "Sample Voice",
        lang: "en-US",
        speak: function (text, options) {
            const utter = new SpeechSynthesisUtterance(text);
            utter.voice = speechSynthesis.getVoices().find(v => v.lang === "en-US");
            utter.rate = options?.rate || 1;
            utter.pitch = options?.pitch || 1;
            utter.volume = options?.volume || 1;
            speechSynthesis.speak(utter);
        }
    });
})();
