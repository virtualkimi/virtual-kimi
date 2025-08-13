// ESM bootstrap for Kimi App
// Import minimal utilities as modules; rely on existing globals for legacy parts
import { KimiProviderUtils } from "./kimi-utils.js";
import KimiLLMManager from "./kimi-llm-manager.js";
import KimiEmotionSystem from "./kimi-emotion-system.js";

// Expose module imports to legacy code paths that still rely on window
window.KimiProviderUtils = window.KimiProviderUtils || KimiProviderUtils;
window.KimiLLMManager = window.KimiLLMManager || KimiLLMManager;
window.KimiEmotionSystem = window.KimiEmotionSystem || KimiEmotionSystem;

// Defer to existing script initialization (kimi-script.js)
// This file mainly ensures ESM compatibility and prepares future migration.
