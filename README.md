<div align="center">

<b>Virtual Kimi</b>

[![Open Source](https://img.shields.io/badge/Open%20Source-GitHub-brightgreen?style=flat-square&logo=github)](https://github.com/virtualkimi)
[![No Commercial Use](https://img.shields.io/badge/No%20Commercial%20Use-%F0%9F%9A%AB-red?style=flat-square)](#license)

</div>

# Virtual Kimi - AI Companion Application 💖

Web-based AI girlfriend and companion featuring adaptive personalities, intelligent memory systems, and immersive conversational experiences.

## Overview

Virtual Kimi is an advanced virtual companion application that combines modern web technologies with state-of-the-art AI models to create meaningful, evolving relationships between users and AI girlfriend personalities.

- **Lightweight:** ~800 KB of pure JavaScript, HTML, and CSS (no frameworks)
- **Local-first:** All data is stored in your browser's IndexedDB (managed by Dexie.js)
- **No tracking:** The only external calls are to FontAwesome (for icons) and the OpenRouter API (for AI)

Built with vanilla JavaScript and modern web APIs, it offers a rich, responsive experience across devices.

---

## 🌐 Support & Links

- **Website**: [virtualkimi.com](https://virtual-kimi.com)
- **Email**: [ijohn@virtualkimi.com](ijohn@virtualkimi.com)
- **X (Twitter)**: [x.com/virtualkimi](https://x.com/virtualkimi)
- **GitHub**: [github.com/virtualkimi](https://github.com/virtualkimi)
- **HuggingFace**: [huggingface.co/VirtualKimi](https://huggingface.co/VirtualKimi)
- **YouTube**: [YouTube Channel](https://www.youtube.com/@VirtualKimi)

- **Support the project**: [ko-fi.com/virtualkimi](https://ko-fi.com/virtualkimi)
  _If you like this project or want to help me (I'm currently without a permanent job), you can buy me a coffee or make a donation. Every bit helps keep Virtual Kimi alive and evolving!_

- **ETH Wallet**: 0x836C9D2e605f98Bc7144C62Bef837627b1a9C30c

---

## Key Features

### 🤖 **Advanced AI Integration**

Recommended models (IDs and short notes — updated Aug 2025):

- mistralai/mistral-small-3.2-24b-instruct — Mistral-small-3.2 (128k context, economical)
- qwen/qwen3-30b-a3b-instruct-2507 — Qwen3 30b (131k context)
- nousresearch/hermes-4-70b — Nous Hermes 4 70B (131k context)
- x-ai/grok-3-mini — Grok 3 mini (131k context)
- cohere/command-r-08-2024 — Cohere Command-R (128k context)
- qwen/qwen3-235b-a22b-2507 — Qwen3-235b (262k context)
- anthropic/claude-3-haiku — Claude 3 Haiku (large context)
- local/ollama — Local Model (Ollama, experimental, 4k context)

Notes: model IDs in the app are authoritative; pricing/context values are indicative and may change with providers.

### 👥 **Multiple AI Personalities**

- **Kimi**: Cosmic dreamer and astrophysicist with ethereal sensibilities
- **Bella**: Nurturing botanist who sees people as plants needing care
- **Rosa**: Chaotic prankster thriving on controlled chaos
- **Stella**: Digital artist transforming reality through pixelated vision
- **2Blanche**: Stoic android combat unit hiding deep emotional vulnerability
- **Jasmine**: Goddess of Love versed in the traditions of the Kamasutra

### Personality Trait Ranges

All personality traits operate on a 0-100 scale:

- **Affection**: Emotional warmth and attachment
- **Playfulness**: Fun-loving and spontaneous behavior
- **Intelligence**: Analytical and thoughtful responses
- **Empathy**: Understanding and emotional support
- **Humor**: Wit and lighthearted interactions
- **Romance**: Romantic and intimate expressions

### 🧠 **Intelligent Memory System**

- Automatic extraction and categorization of conversation memories
- Seven memory categories: Personal, Preferences, Relationships, Activities, Goals, Experiences, Events
- Persistent memory across sessions with search and management capabilities
- Character-specific memory isolation

### 💫 **Dynamic Personality Evolution**

- Six personality traits that evolve based on interactions:
- Affection, Playfulness, Intelligence, Empathy, Humor, Romance
- Real-time trait adjustments based on conversation tone and content
- Visual personality indicators and progression tracking
- Intelligent model selection and switching
- Real-time emotion detection and analysis
- Contextually-aware responses

### 🎬 **Emotion-Driven Visual Experience**

- Real-time video responses matching detected emotions
- Smooth transitions between emotional states
- Character-specific visual libraries with ~360 video clips (approx. 60 per main character)
- Context-aware video selection system

### 🎨 **Customizable Interface**

- Five professionally designed themes
- Adjustable interface transparency
- Responsive design optimized for desktop, tablet, and mobile
- Accessibility features and keyboard navigation

### 🌍 **Multilingual Support**

- Full localization in 7 languages: English, French, Spanish, German, Italian, Japanese, Chinese
- Automatic language detection from user input
- Culturally-aware responses and emotion keywords

### 🔌 **Extensible Plugin System**

- Theme plugins for visual customization (currently, only the color theme plugin is functional)
- Voice plugins for speech synthesis options (planned)
- Behavior plugins for personality modifications (planned)
- Secure plugin loading with validation

### 🛡️ **Security & Privacy**

- Input validation and sanitization
- Secure API key handling
- Local data storage with IndexedDB
- No server dependencies for core functionality

## 🏗️ Technical Architecture

### 🧩 Core Technologies

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
- **Database**: IndexedDB with Dexie.js
- **AI Integration**: OpenRouter (default), OpenAI-compatible, Cohere, Anthropic, Groq, Together, or local Ollama
- **Speech**: Web Speech API
- **Audio**: Web Audio API

---

## ✨ Inspiration & Assets

This project was originally inspired by the [JackyWine GitHub repository](https://github.com/Jackywine).
@Jackywine on X (Twitter)

The six main characters are visually based on images from creators on X (Twitter):

- @JulyFox33 (Kimi)
- @BelisariaNew (Bella)
- @JuliAIkiko (Rosa and Stella)
- @Icey2026 (Jasmine)
- Custom designs inspired by NieR:Automata (2Blanche)

All character videos were generated using the image-to-video AI from Kling.ai, specifically with the Kling v2.1 model.

Get 50% bonus Credits in your first month with this code referral 7BR9GT2WQ6JF - link: [https://klingai.com](https://klingai.com/h5-app/invitation?code=7BR9GT2WQ6JF)

---

### Project Structure (current)

Top-level files and main modules:

- index.html — Main application entry
- virtual-kimi (static assets & landing): virtual-kimi\*.html
- kimi-js/
    - kimi-script.js — App initialization & orchestration
    - kimi-database.js — IndexedDB persistence (Dexie)
    - kimi-config.js — Runtime configuration
    - kimi-security.js — Security utilities
    - kimi-llm-manager.js — LLM integration and model list
    - kimi-emotion-system.js — Emotion analysis
    - kimi-memory-system.js — Memory extraction & storage
    - kimi-memory-ui.js — Memory management UI
    - kimi-appearance.js, kimi-voices.js, kimi-utils.js, kimi-module.js, etc.
- kimi-css/ — styles and themes
- kimi-plugins/ — local plugins (sample-theme, sample-behavior, sample-voice)
- kimi-locale/ — translations and i18n files
- dexie.min.js — local DB helper

### Data Flow

1. **Input Processing**: User input → Security validation → Language detection
2. **AI Analysis**: Emotion detection → Memory extraction → LLM processing
3. **Response Generation**: Personality-aware response → Emotion mapping → Visual selection
4. **Memory Update**: Trait evolution → Memory storage → UI synchronization

## Installation & Setup

### Prerequisites

- Modern web browser (Chrome, Edge or recent Firefox recommended). The app is plain HTML/CSS/JS and runs locally in a browser — no build step is required.
- (Optional) OpenRouter API key or another compatible provider API key if you want remote LLM access. The app can run without a key using local-only features, but AI responses will be limited.
- HTTPS is required for microphone access and some browser TTS features. For full voice/microphone features, open the app via a local server (see Quick Start). If you only open `index.html` directly, most features still work but microphone may be blocked by the browser.
- Dexie.js is included for IndexedDB persistence (no installation required; file `dexie.min.js` is bundled).

### Quick Start

1. **Clone the repository**

    ```bash
    git clone https://github.com/virtualkimi/virtual-kimi.git
    cd virtual-kimi
    ```

2. **Open the application**

    - Open `index.html` in your web browser
    - Or serve via local web server for optimal performance:
        ```bash
        python -m http.server 8000
        # Navigate to http://localhost:8000
        ```

3. **Configure API access**

    - Open Settings → AI & Models
    - Provider: choose the LLM provider to use. Supported options in the app include `openrouter` (recommended), `openai`/OpenAI-compatible endpoints, and `ollama` (local). The selected provider is saved in the app preferences.
    - API key: paste your provider API key into the API Key field. Keys are saved locally in your browser's IndexedDB (preferences) so they never leave your machine except when the app sends requests to the selected provider.
    - Base URL: if you use a non‑default provider or an OpenAI-compatible endpoint, set the provider base URL (Settings → AI & Models → Base URL). This overrides the built-in default endpoints.
    - Model selection: choose a model ID from the list. The app's authoritative model list is defined in `kimi-js/kimi-llm-manager.js`. If the provider does not support the selected model, the app will attempt a best-match fallback or show an error.
    - Test API key: use the app's built-in test function (Settings → Test API) to validate your key; this performs a minimal request and reports success or the provider error message.
    - Local (Ollama) usage: to use a local model with `ollama`, run your local Ollama-compatible server (the app uses `http://localhost:11434/api/chat`). Select provider `ollama` and set model ID accordingly. Local models are experimental and work only if the local server is running.
    - No key behavior: the app runs without an API key for local UI features and stored data, but remote LLM responses require a valid provider/key. If no key is configured the app will return friendly fallback messages for AI features.

    Troubleshooting notes:

    - If you see HTTP 401: verify the API key for the selected provider.
    - If you see HTTP 429 or rate-limit errors: wait a moment or choose a different model/provider account.
    - If the model is reported as unavailable (422-like errors): verify the model ID and, if needed, refresh the remote model list in Settings.
    - For OpenRouter-specific issues: check the Base URL is `https://openrouter.ai/api/v1/chat/completions` (default) unless you use a custom endpoint.

4. **Customize your experience**
    - Choose your language and preferred voice
    - Choose a character in Personality tab
    - Enable memory system in Data tab
    - Adjust themes and UI opacity in Appearance tab

### Production Deployment

For production deployment, ensure:

- HTTPS is enabled (required for microphone access)
- Gzip compression for assets
- Proper cache headers
- CSP headers for enhanced security

## ⚙️ Configuration

### API Integration

The application supports multiple AI providers; choose and configure your provider in Settings → AI & Models.

- Mistral models
- Nous Hermes models
- Qwen3 models
- xAI models
- Open-source alternatives

### Memory System Configuration

```javascript
// Memory categories can be customized
const memoryCategories = [
    "personal", // Personal information
    "preferences", // Likes and dislikes
    "relationships", // People and connections
    "activities", // Hobbies and activities
    "goals", // Aspirations and plans
    "experiences", // Past events
    "important" // Significant moments
];
```

## 🛠️ Development

### Project Structure

```
<repo root>
├── index.html
├── README.md
├── LICENSE.md
├── package.json
├── kimi-js/           # core JS modules (kimi-*.js)
├── kimi-locale/       # translations (en.json, fr.json, ...)
├── kimi-plugins/      # plugin examples
├── kimi-videos/       # character video clips
├── kimi-icons/        # image assets and favicons
└── dexie.min.js       # IndexedDB helper
```

### Adding New Features

#### Creating a New Plugin

```javascript
// manifest.json
{
    "name": "Custom Theme",
    "version": "1.0.0",
    "type": "theme",
    "style": "theme.css",
    "main": "theme.js",
    "enabled": true
}
```

> **Note:** As of version 1.0, only the color theme plugin is fully functional. Voice and behavior plugins are planned for future releases. See `kimi-plugins/sample-theme/` for a working example.

#### Extending Memory Categories

```javascript
// Add to kimi-memory-system.js
const customCategory = {
    name: "custom",
    icon: "fas fa-star",
    keywords: ["keyword1", "keyword2"],
    confidence: 0.7
};
```

### Health Check System

The application includes a comprehensive health check system:

```javascript
// Run health check
const healthCheck = new KimiHealthCheck();
const report = await healthCheck.runAllChecks();
console.log(report.status); // 'HEALTHY' or 'NEEDS_ATTENTION'
```

## Browser Compatibility

| Browser     | Voice Recognition | Full Features | Notes                     |
| ----------- | ----------------- | ------------- | ------------------------- |
| Chrome 90+  | ✅                | ✅            | Recommended               |
| Edge 90+    | ✅                | ✅            | Optimal voice performance |
| Firefox 88+ | ⚠️                | ✅            | Limited voice support     |
| Safari 14+  | ⚠️                | ✅            | iOS limitations           |

## Performance

### Optimization Features

- Lazy loading of non-critical modules
- Efficient batch database operations
- Debounced UI interactions
- Memory management with cleanup
- Optimized video preloading

### Resource Usage

- Memory footprint: ~15-30MB active usage
- Storage: Scales with conversation history
- Network: API calls only, no tracking
- CPU: Minimal background processing

## Privacy & Security

### Data Handling

- All data stored locally in browser
- No telemetry or analytics
- API keys in your local storage
- User content never sent to external servers (except chosen AI provider)

### Security Measures

- Input validation and sanitization
- XSS protection
- Safe plugin loading
- Secure API communication

## Troubleshooting

### Common Issues

- **Microphone not working**: Ensure HTTPS and browser permissions
- **API errors / provider issues**: Verify the API key and selected provider for the chosen model. This app supports multiple providers (OpenRouter, OpenAI-compatible endpoints, Groq, Together, Cohere, Anthropic, local/Ollama, etc.). Make sure the provider-specific base URL, model ID and API key are correctly configured in Settings → AI & Models.
- **Text-to-Speech (TTS) voices**: The app uses the browser Web Speech API for TTS. For best voice support, use modern Chromium-based browsers (Edge or Chrome) which generally provide better built-in voices and compatibility. If voices are missing or sound low quality, try Edge/Chrome or install additional TTS engines on your system.
- **Performance issues**: Clear browser cache, check available memory
- **Memory system not learning**: Ensure system is enabled in Data tab

## Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request with detailed description

### Development Guidelines

- Follow existing code style and patterns
- Add comments for complex functionality
- Test across multiple browsers
- Update documentation for new features

## 🔄 TODO / Roadmap (current priorities)

- [ ] Full support for local models (Ollama integration — currently experimental)
- [ ] Voice plugin system (custom voices, TTS engines) — planned
- [ ] Behavior plugin system (custom AI behaviors) — planned
- [ ] Improve advanced memory management UI and ranked memory snapshot features (in-progress)
- [ ] More character personalities and backgrounds
- [ ] In-app onboarding and help system
- [ ] Better mobile UI/UX and accessibility improvements
- [ ] More granular privacy controls and explicit user consent flows
- [ ] Automated testing and CI/CD pipeline (unit + basic UI tests)
- [ ] Performance profiling and optimization for large conversation histories
- [ ] Documentation updates to reflect implemented features (models, API handling, plugin validation)

## 📜 License

This project is distributed under a custom license. **Any commercial use, resale, or monetization of this application or its derivatives is strictly prohibited without the explicit written consent of the author.**

See the [LICENSE](LICENSE.md) file for details.

[![Open Source](https://img.shields.io/badge/Open%20Source-GitHub-brightgreen?style=flat-square&logo=github)](https://github.com/virtualkimi)
[![No Commercial Use](https://img.shields.io/badge/No%20Commercial%20Use-%F0%9F%9A%AB-red?style=flat-square)](#license)

---

**Virtual Kimi** - Creating meaningful connections between humans and AI, one conversation at a time.

> _"Love is the most powerful code"_ 💕
>
> — 2025 Virtual Kimi - Created with 💜 by Jean & Kimi
