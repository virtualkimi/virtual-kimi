// Simple trait simulation harness for development tuning.
// Usage: window.kimiTraitSim.run([ { emotion: 'positive', text: 'love joke' }, ... ])
(function () {
    async function run(sequence, character = null) {
        if (!window.kimiEmotionSystem || !window.kimiEmotionSystem.db) {
            console.warn("Emotion system not ready");
            return;
        }
        const results = [];
        for (const step of sequence) {
            const emotion = step.emotion || window.kimiEmotionSystem.analyzeEmotion(step.text || "", "auto");
            const traits = await window.kimiEmotionSystem.updatePersonalityFromEmotion(emotion, step.text || "", character);
            results.push({ emotion, text: step.text || "", traits: { ...traits } });
        }
        console.table(results.map(r => ({ emotion: r.emotion, ...r.traits })));
        return results;
    }
    window.kimiTraitSim = { run };
})();
