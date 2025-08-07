// Kimi Logic - Use existing system

window.kimiAnalyzeEmotion = function (text, lang = "auto") {
    if (!text || typeof text !== "string") return "neutral";
    const lowerText = text.toLowerCase();

    let detectedLang = lang;
    if (lang === "auto") {
        if (/[àâäéèêëîïôöùûüÿç]/i.test(text)) detectedLang = "fr";
        else if (/[äöüß]/i.test(text)) detectedLang = "de";
        else if (/[ñáéíóúü]/i.test(text)) detectedLang = "es";
        else if (/[àèìòù]/i.test(text)) detectedLang = "it";
        else if (/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/i.test(text)) detectedLang = "ja";
        else if (/[\u4e00-\u9fff]/i.test(text)) detectedLang = "zh";
        else detectedLang = "en";
    }

    const positiveWords = window.KIMI_CONTEXT_POSITIVE?.[detectedLang] ||
        window.KIMI_CONTEXT_POSITIVE?.en || ["happy", "good", "great", "love"];
    const negativeWords = window.KIMI_CONTEXT_NEGATIVE?.[detectedLang] ||
        window.KIMI_CONTEXT_NEGATIVE?.en || ["sad", "bad", "angry", "hate"];

    const emotionKeywords = window.KIMI_CONTEXT_KEYWORDS?.[detectedLang] || window.KIMI_CONTEXT_KEYWORDS?.en || {};

    const emotionChecks = [
        { emotion: "dancing", keywords: emotionKeywords.dancing || ["dance", "dancing"] },
        { emotion: "romantic", keywords: emotionKeywords.romantic || ["love", "romantic"] },
        { emotion: "laughing", keywords: emotionKeywords.laughing || ["laugh", "funny"] },
        { emotion: "surprise", keywords: emotionKeywords.surprise || ["wow", "surprise"] },
        { emotion: "confident", keywords: emotionKeywords.confident || ["confident", "strong"] },
        { emotion: "shy", keywords: emotionKeywords.shy || ["shy", "embarrassed"] },
        { emotion: "flirtatious", keywords: emotionKeywords.flirtatious || ["flirt", "tease"] },
        { emotion: "kiss", keywords: emotionKeywords.kiss || ["kiss", "embrace"] },
        { emotion: "goodbye", keywords: emotionKeywords.goodbye || ["goodbye", "bye"] }
    ];

    for (const check of emotionChecks) {
        const hasKeywords = check.keywords.some(word => lowerText.includes(word.toLowerCase()));
        if (hasKeywords) return check.emotion;
    }

    const hasPositive = positiveWords.some(word => lowerText.includes(word.toLowerCase()));
    const hasNegative = negativeWords.some(word => lowerText.includes(word.toLowerCase()));

    if (hasPositive && !hasNegative) return "positive";
    if (hasNegative && !hasPositive) return "negative";
    return "neutral";
};

window.getPersonalityAverage = function (traits) {
    if (!traits || typeof traits !== "object") return 50;

    const values = Object.values(traits).filter(value => typeof value === "number" && !isNaN(value));
    if (values.length === 0) return 50;

    const sum = values.reduce((acc, value) => acc + value, 0);
    return Math.round(sum / values.length);
};

window.updatePersonalityTraitsFromEmotion = async function (emotion, text) {
    if (!window.kimiEmotionSystem) {
        console.warn("Emotion system not available");
        return;
    }

    try {
        await window.kimiEmotionSystem.updatePersonalityFromEmotion(emotion, text);
    } catch (error) {
        console.error("Error updating personality traits from emotion:", error);
    }
};
