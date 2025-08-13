<div align="center">

<b>Virtual Kimi</b>

[![Open Source](https://img.shields.io/badge/Open%20Source-GitHub-brightgreen?style=flat-square&logo=github)](https://github.com/virtualkimi)
[![No Commercial Use](https://img.shields.io/badge/No%20Commercial%20Use-%F0%9F%9A%AB-red?style=flat-square)](#license)

</div>

# Virtual Kimi - AI Companion Application 💖

Web-based AI companion girlfriends featuring adaptive personalities, intelligent memory systems, and immersive conversational experiences.

## Overview

Virtual Kimi is an advanced virtual companion application that combines modern web technologies with state-of-the-art AI models to create meaningful, evolving relationships between users and AI girlfriend personalities.

- **Lightweight:** ~600 KB of pure JavaScript, HTML, and CSS (no frameworks)
- **Local-first:** All data is stored in your browser's IndexedDB (managed by Dexie.js)
- **No tracking:** The only external calls are to FontAwesome (for icons) and the OpenRouter API (for AI)

Built with vanilla JavaScript and modern web APIs, it offers a rich, responsive experience across devices.

---

## 🌐 Support & Links

- **Website**: [virtualkimi.com](https://virtualkimi.com)
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

**Available recommended models and pricing for Openrouter (per 1M tokens):**

- **Mistral-small-3.2**: 0.05$ input, 0.1$ output (128k context)
- **Nous Hermes Llama 3.1 70B**: 0.1$ input, 0.28$ output (131k context)
- **Cohere Command-R-08-2024**: 0.15$ input, 0.6$ output (131k context)
- **Qwen3-235b-a22b-think**: 0.13$ input, 0.6$ output (262k context)
- **Grok 3 mini**: 0.3$ input, 0.5$ output (131k context)
- **Nous Hermes Llama 3.1 405B**: 0.7$ input, 0.8$ output (131k context)
- **Anthropic Claude 3 Haiku**: 0.25$ input, 1.25$ output (131k context)
- **Local Model (Ollama)**: 0$ input, 0$ output (4k context, runs offline — _experimental, not fully functional yet_)

### 👥 **Multiple AI Personalities**

- **Kimi**: Cosmic dreamer and astrophysicist with ethereal sensibilities
- **Bella**: Nurturing botanist who sees people as plants needing care
- **Rosa**: Chaotic prankster thriving on controlled chaos
- **Stella**: Digital artist transforming reality through pixelated vision

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
- Character-specific visual libraries with 50+ video clips
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
- **AI Integration**: OpenRouter API
- **Speech**: Web Speech API
- **Audio**: Web Audio API

---

## ✨ Inspiration & Assets

This project was originally inspired by the [JackyWine GitHub repository](https://github.com/Jackywine).
@Jackywine on X (Twitter)

The four main characters are visually based on images from four creators on X (Twitter):

- @JulyFox33 (Kimi)
- @BelisariaNew (Bella)
- @JuliAIkiko (Rosa and Stella)

All character videos were generated using the image-to-video AI from Kling.ai, specifically with the Kling v2.1 model.

Get 50% bonus Credits in your first month with this code referral 7BR9GT2WQ6JF - link: [https://klingai.com](https://klingai.com/h5-app/invitation?code=7BR9GT2WQ6JF)

---

### 🗂️ Module Structure

```

├── Core System
│ ├── kimi-script.js # Main initialization
│ ├── kimi-database.js # Data persistence layer
│ ├── kimi-config.js # Configuration management
│ └── kimi-security.js # Security utilities
├── AI & Memory
│ ├── kimi-llm-manager.js # LLM integration
│ ├── kimi-emotion-system.js # Emotion analysis
│ ├── kimi-memory-system.js # Intelligent memory
│ └── kimi-memory-ui.js # Memory interface
├── Interface & Media
│ ├── kimi-appearance.js # Theme management
│ ├── kimi-voices.js # Speech synthesis
│ ├── kimi-utils.js # Utility classes
│ └── kimi-module.js # Core functions
├── Localization
│ └── kimi-locale/ # Translation files
└── Extensions
└── kimi-plugins/ # Plugin system

```

### Data Flow

1. **Input Processing**: User input → Security validation → Language detection
2. **AI Analysis**: Emotion detection → Memory extraction → LLM processing
3. **Response Generation**: Personality-aware response → Emotion mapping → Visual selection
4. **Memory Update**: Trait evolution → Memory storage → UI synchronization

## Installation & Setup

### Prerequisites

- Modern web browser (Chrome, Edge, Firefox recommended)
- OpenRouter API key (optional but recommended for full functionality)

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
    - Add your OpenRouter API key
    - Select preferred AI model

4. **Customize your experience**
    - Choose a character in Personality tab
    - Enable memory system in Data tab
    - Adjust themes in Appearance tab

### Production Deployment

For production deployment, ensure:

- HTTPS is enabled (required for microphone access)
- Gzip compression for assets
- Proper cache headers
- CSP headers for enhanced security

## ⚙️ Configuration

### API Integration

The application supports multiple AI providers through OpenRouter:

- Mistral models
- Nous Hermes models
- Qwen3 models
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
virtual-kimi/
├── index.html              # Main application
├── virtualkimi.html         # Landing page
├── kimi-*.js               # Core modules
├── kimi-locale/            # Localization
├── kimi-plugins/           # Plugin examples
├── kimi-videos/            # Character videos
├── kimi-icons/             # Character assets
└── docs/                   # Documentation
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
- API keys encrypted in local storage
- User content never sent to external servers (except chosen AI provider)

### Security Measures

- Input validation and sanitization
- XSS protection
- Safe plugin loading
- Secure API communication

## Troubleshooting

### Common Issues

- **Microphone not working**: Ensure HTTPS and browser permissions
- **API errors**: Verify OpenRouter key and model availability
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

## 🔄 TODO / Roadmap

- [ ] Full support for local models (Ollama integration, offline mode)
- [ ] Voice plugin system (custom voices, TTS engines)
- [ ] Behavior plugin system (custom AI behaviors)
- [ ] Better advanced memory management UI
- [ ] More character personalities and backgrounds
- [ ] In-app onboarding and help system
- [ ] Enhanced mobile experience (UI/UX)
- [ ] More granular privacy controls
- [ ] User profile and persistent settings sync (optional)
- [ ] Community plugin/theme sharing platform
- [ ] Improved error reporting and diagnostics
- [ ] Accessibility improvements (screen reader, contrast, etc.)
- [ ] Automated testing and CI/CD pipeline
- [ ] Documentation in multiple languages
- [ ] Performance profiling and optimization for large histories
- [ ] Create new character videos better matching specific contexts
- [ ] Improve emotion and context logic
- [ ] Enhance memory management and logic

---

## 📜 License

This project is distributed under a custom license. **Any commercial use, resale, or monetization of this application or its derivatives is strictly prohibited without the explicit written consent of the author.**

See the [LICENSE](LICENSE) file for details.

[![Open Source](https://img.shields.io/badge/Open%20Source-GitHub-brightgreen?style=flat-square&logo=github)](https://github.com/virtualkimi)
[![No Commercial Use](https://img.shields.io/badge/No%20Commercial%20Use-%F0%9F%9A%AB-red?style=flat-square)](#license)

---

**Virtual Kimi** - Creating meaningful connections between humans and AI, one conversation at a time.

> _"Love is the most powerful code"_ 💕
>
> — 2025 Virtual Kimi - Created with 💜 by Jean & Kimi
