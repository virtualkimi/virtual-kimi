# Virtual Kimi Changelog

## [1.0.5] - 2025-08-13 - "Personality & Language Sensitivity"

### Added

- Multilingual profanity/insult detection for negative context across 7 languages (en, fr, es, de, it, ja, zh)
- Gendered variants support in negative keywords (fr, es, it, de) to improve accuracy (e.g., sérieux/sérieuse)
- Extended personality keywords for Spanish and Italian (all traits) with gendered forms

### Changed

- Personality sync now completes missing values using character-specific defaults (with generic fallback)
- Centralized side-effects on personality updates (UI/memory/video/voice) behind a single `personality:updated` listener
- Sliders: generic handler only updates display; persistence and effects handled by specialized listeners
- Trait updates preserve fractional progress (2 decimals) for smoother affection changes
- Stats now use character-specific default for affection (with generic fallback) when missing

### Fixed

- Removed obsolete `personalityUpdated` listener to avoid duplicate processing
- Unified KimiMemory affection default loading (removed conflicting double assignment and legacy default 80)
- Minor cleanup and consistency improvements in utils and sync flows

## [1.0.4] - 2025-08-09 - "Emotion & Context Logic Upgrade"

### Added

- Major improvements to emotion, context, and personality logic:
    - Enhanced emotion detection and mapping for more nuanced responses
    - Contextual keyword analysis for better understanding of user intent
    - Refined personality trait system with dynamic adaptation
    - Video selection logic now adapts to both emotion and conversational context
    - Improved handling of multi-layered context (emotion, keywords, personality, situation)

### Changed

- Video playback and character reactions are now more tightly coupled to detected context and personality traits
- Emotion and context logic refactored for clarity and maintainability
- Keyword extraction and context matching algorithms improved for accuracy

### Technical

- Refactored core logic in `kimi-emotion-system.js`, `kimi-logic.js`, and `kimi-memory-system.js`
- Updated video selection and playback logic in `kimi-memory.js` and `kimi-memory-ui.js`
- Improved context propagation between modules

## [1.0.3] - 2025-08-09 - "LLM multi-provider"

### Added

- LLM multi-provider UX enhancements:
    - Dynamic API key label per provider (OpenRouter, OpenAI, Groq, Together, DeepSeek, Custom, Ollama)
    - Visual "Saved" badge when a key is stored or after a successful test
    - Localized tooltip explaining Saved vs connection test

### Changed

- OpenAI-compatible flow now reads llmBaseUrl/llmModelId and the correct provider key from KimiDB
- Clears connection status message when provider/Base URL/Model ID/key changes for clearer feedback

## [1.0.2] - 2025-08-09 - "Smoother Video"

### Changed

- Video playback and transition stability improvements:
    - Lightweight MP4 prefetch queue (neutral + likely next clips) to reduce wait times during switches
    - Earlier transition on `canplay` (instead of `canplaythrough`) for faster, smoother swaps
    - Context-aware throttling to prevent rapid switching under load (speaking: ~200ms, listening: ~250ms, dancing: ~600ms, neutral: ~1200ms)

### Fixed

- Safe revert on failed `play()` during a switch to avoid frozen frames
- Aligned event listeners to `canplay` and ensured proper cleanup to prevent leaks
- Corrected prefetch cache initialization order (prevented `undefined.has` runtime error)
- Removed unsupported `<link rel="preload" as="video">` to eliminate console warnings

### Technical

- Front-end performance tweaks: GPU-accelerated fades with `will-change: opacity` and `backface-visibility: hidden`
- Connection warm-up: added `preconnect`/`dns-prefetch` to the origin for faster first video start
- Files updated: `index.html`, `kimi-css/kimi-style.css`, `kimi-js/kimi-utils.js`

## [1.0.1] - 2025-08-08

- Fixed an issue where the browser prompted to save the OpenRouter API key as a password. The input field is now properly configured to prevent password managers from interfering.
- Added a waiting animation that appears between the user's message submission and the LLM's response, improving user feedback during processing.
- Added a new section in the API tab: below the recommended LLM models, all available OpenRouter LLM models are now dynamically loaded and displayed for selection.

## [1.0.0] - 2025-08-07 - "Unified"

### Added

- **Intelligent Memory System**: Automatic extraction and categorization of memories from conversations
- **Multiple AI Characters**: 4 unique personalities (Kimi, Bella, Rosa, Stella) with distinct traits
- **Advanced Emotion Detection**: Real-time emotion analysis with cultural awareness
- **Plugin System**: Extensible architecture for themes, voices, and behaviors
- **Memory Management UI**: Complete interface for viewing, searching, and managing memories
- **Enhanced Personality System**: 6 dynamic traits that evolve based on interactions
- **Multilingual Support**: Full localization in 7 languages with auto-detection
- **Production Health Check**: Comprehensive system validation and monitoring
- **Performance Optimizations**: Batch database operations and improved loading times
- **Security Enhancements**: Input validation, sanitization, and secure API handling

### Changed

- **Unified Architecture**: Consolidated all emotion and personality systems
- **Improved Database**: Enhanced IndexedDB implementation with batch operations
- **Better Error Handling**: Centralized error management with fallback responses
- **Enhanced UI/UX**: More responsive and accessible interface design
- **Optimized Video System**: Smoother transitions and better emotion mapping

### Fixed

- Function export issues in module system
- Memory leaks in event listeners
- Cross-browser compatibility issues
- Voice recognition stability problems
- Database initialization race conditions

### Technical

- Migrated to unified emotion system
- Implemented comprehensive validation layer
- Added automated health monitoring
- Enhanced plugin security validation
- Improved mobile responsiveness

## [0.0.9] - 2025-08-04 - "Enhanced"

### Added

- Advanced LLM model selection interface
- Improved voice synthesis with better emotion mapping
- Enhanced personality trait visualization
- Better conversation export/import functionality

### Changed

- Upgraded database schema for better performance
- Improved theme system with more customization options
- Enhanced mobile interface responsiveness

### Fixed

- Various browser compatibility issues
- Voice recognition accuracy improvements
- Memory management optimizations

## [0.0.8] - 2025-08-01 - "Evolution"

### Added

- Dynamic personality trait evolution
- Enhanced emotion detection algorithms
- Improved conversation context awareness
- Better visual feedback systems

### Changed

- Redesigned settings interface
- Improved conversation flow management
- Enhanced error reporting system

### Fixed

- Database sync issues
- Voice recognition edge cases
- Theme switching problems

## [0.0.7] - 2025-07-29 - "Immersion"

### Added

- Real-time video emotion responses
- Enhanced voice interaction capabilities
- Improved conversation context retention
- Better visual theme system

### Changed

- Upgraded UI framework for better performance
- Improved data synchronization mechanisms
- Enhanced accessibility features

### Fixed

- Various stability improvements
- Better error handling
- Improved cross-platform compatibility

## [0.0.6] - 2025-07-26 - "Connection"

### Added

- Multi-language support system
- Enhanced conversation memory
- Improved personality customization
- Better audio/video synchronization

### Changed

- Redesigned conversation interface
- Improved data persistence layer
- Enhanced user experience flows

### Fixed

- Memory leak issues
- Browser compatibility problems
- Audio synchronization bugs

## [0.0.5] - 2025-07-23 - "Rebirth"

### Added

- Complete application rewrite
- Modern ES6+ JavaScript architecture
- Responsive design system
- Advanced AI integration capabilities
- Comprehensive settings system

### Changed

- Modernized codebase with current web standards
- Improved performance and reliability
- Enhanced user interface design
- Better data management system

### Removed

- Legacy jQuery dependencies
- Outdated browser support

## [0.0.4] - 2025-07-20 - "Stability"

### Added

- Enhanced voice recognition
- Improved conversation flow
- Better error handling
- Enhanced visual feedback

### Fixed

- Various stability issues
- Performance optimizations
- Browser compatibility improvements

## [0.0.3] - 2025-07-18 - "Polish"

### Added

- Improved user interface
- Better conversation management
- Enhanced customization options

### Fixed

- Various bugs and stability issues
- Performance improvements

## [0.0.2] - 2025-07-17 - "Improvements"

### Added

- Basic conversation memory
- Improved personality system
- Enhanced visual themes

### Fixed

- Initial bug fixes
- Performance optimizations

## [0.0.1] - 2025-07-16 - "Genesis"

### Added

- Initial release
- Basic AI conversation capabilities
- Voice recognition and synthesis
- Simple personality system
- Theme customization
- Local data storage

---

## Legend

- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements
- **Technical**: Internal technical changes

---

All notable changes to Virtual Kimi will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
