// External emotion & personality tuning overrides
// Can be edited or replaced without touching core system.
(function () {
    // Load order note:
    // Include this file BEFORE modules that use KimiEmotionSystem so overrides apply on first use.
    // Example (in index.html): event-bus -> emotion-config -> other kimi-*.js.
    window.KIMI_EMOTION_CONFIG = {
        moodThresholds: { positive: 80, neutralHigh: 55, neutralLow: 35, negative: 15 },
        // Optional scaling multipliers per trait for emotion deltas (post base map, pre adjustUp/Down)
        traitScalar: { affection: 1, romance: 1, empathy: 1, playfulness: 1, humor: 1, intelligence: 1 },
        // Optional emotion specific multipliers
        emotionScalar: {
            positive: 1,
            negative: 1,
            romantic: 1,
            flirting: 1,
            laughing: 1,
            dancing: 1,
            surprise: 1,
            shy: 1,
            confident: 1,
            listening: 1,
            kiss: 1,
            goodbye: 1
        },
        // Hook to modify final computed updatedTraits before persistence
        finalize: function (traits) {
            return traits;
        }
    };
})();
