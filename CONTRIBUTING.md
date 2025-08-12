# Contributing to Virtual Kimi

Thank you for your interest in contributing to Virtual Kimi! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Contribution Guidelines](#contribution-guidelines)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Issue Reporting](#issue-reporting)

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

### Expected Behavior

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Modern web browser (Chrome, Edge, Firefox recommended)
- Basic knowledge of JavaScript, HTML, and CSS
- Git for version control
- Text editor or IDE of your choice

### First Contribution

1. Fork the repository
2. Clone your fork locally
3. Create a new branch for your feature/fix
4. Make your changes
5. Test thoroughly
6. Submit a pull request

## Development Setup

### Local Environment

```bash
# Clone the repository
git clone https://github.com/virtualkimi/virtual-kimi.git
cd virtual-kimi

# Open in browser
# Option 1: Direct file access
open index.html

# Option 2: Local server (recommended)
python -m http.server 8000
# Navigate to http://localhost:8000
```

### Development Tools

- **Browser DevTools**: For debugging and testing
- **Live Server**: For hot reload during development
- **Lighthouse**: For performance auditing
- **Accessibility tools**: For ensuring inclusive design

## Contribution Guidelines

### Types of Contributions

- **Bug fixes**: Resolve existing issues
- **Feature additions**: New functionality
- **Performance improvements**: Optimization and efficiency
- **Documentation**: Improve guides and comments
- **Localization**: Translation and internationalization
- **Plugin development**: Extend functionality
- **Testing**: Add or improve test coverage

### Before You Start

1. Check existing issues and pull requests
2. Open an issue to discuss major changes
3. Ensure your idea aligns with the project goals
4. Consider the impact on existing functionality

## Project Structure

### Core Files

```
├── index.html              # Main application
├── kimi-script.js          # Primary initialization
├── kimi-database.js        # Data persistence
├── kimi-llm-manager.js     # AI integration
├── kimi-emotion-system.js  # Emotion analysis
├── kimi-memory-system.js   # Memory management
├── kimi-voices.js          # Speech synthesis
├── kimi-appearance.js      # Theme management
└── kimi-utils.js           # Utility functions
```

### Module Dependencies

- **Core System**: Database → Security → Config
- **AI System**: LLM Manager → Emotion System → Memory System
- **UI System**: Appearance → Utils → Module functions
- **Localization**: i18n → All user-facing modules

### Adding New Features

#### New Memory Categories

```javascript
// In kimi-memory-system.js
const newCategory = {
    name: "custom_category",
    icon: "fas fa-custom-icon",
    keywords: ["keyword1", "keyword2"],
    confidence: 0.7
};

// Add to MEMORY_CATEGORIES constant
```

#### New Themes

```javascript
// Create plugin in kimi-plugins/custom-theme/
// manifest.json
{
    "name": "Custom Theme",
    "version": "1.0.0",
    "type": "theme",
    "style": "theme.css",
    "enabled": true
}
```

#### New AI Models

```javascript
// In kimi-llm-manager.js
"custom/model-id": {
    name: "Custom Model",
    provider: "Custom Provider",
    type: "openrouter",
    contextWindow: 8000,
    pricing: { input: 0.1, output: 0.2 },
    strengths: ["Custom", "Feature"]
}
```

## Coding Standards

### JavaScript Style

- Use ES6+ features and modern syntax
- Prefer `const` and `let` over `var`
- Use meaningful variable and function names in English
- Follow camelCase for variables and functions
- Use PascalCase for classes and constructors

### Code Organization

- Keep functions focused and single-purpose
- Use async/await for asynchronous operations
- Handle errors gracefully with try/catch blocks
- Add JSDoc comments for complex functions
- Group related functionality in modules

### Example Code Style

```javascript
/**
 * Analyzes user input for emotional content and updates personality traits
 * @param {string} text - User input text
 * @param {string} emotion - Detected emotion type
 * @returns {Promise<Object>} Updated personality traits
 */
async function updatePersonalityFromEmotion(text, emotion) {
    try {
        // Validate input
        if (!text || typeof text !== "string") {
            throw new Error("Invalid input text");
        }

        // Process emotion
        const traits = await this.processEmotionalContent(text, emotion);

        // Update database
        await this.db.setPersonalityBatch(traits);

        return traits;
    } catch (error) {
        console.error("Error updating personality:", error);
        throw error;
    }
}
```

### CSS Guidelines

- Use CSS custom properties (variables) for theming
- Follow BEM methodology for class naming
- Ensure responsive design principles
- Maintain accessibility standards
- Use semantic HTML elements

### HTML Standards

- Use semantic HTML5 elements
- Include proper ARIA labels for accessibility
- Ensure proper heading hierarchy
- Add meaningful alt text for images
- Validate markup regularly

## Testing

### Manual Testing Checklist

- [ ] Application loads without errors
- [ ] All core features function correctly
- [ ] Voice recognition works (in supported browsers)
- [ ] Memory system stores and retrieves data
- [ ] Theme switching works properly
- [ ] Responsive design on mobile devices
- [ ] Cross-browser compatibility
- [ ] Accessibility with keyboard navigation

### Browser Testing

Test in the following browsers:

- Chrome (latest 2 versions)
- Edge (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest version, if possible)

### Performance Testing

- Check loading times
- Monitor memory usage
- Test with large conversation histories
- Verify smooth animations
- Ensure responsive UI interactions

## Pull Request Process

### Before Submitting

1. **Test thoroughly**: Ensure your changes work as expected
2. **Check compatibility**: Test across different browsers
3. **Update documentation**: Modify README.md if needed
4. **Clean up code**: Remove debugging code and comments
5. **Commit messages**: Use clear, descriptive commit messages

### PR Template

```markdown
## Description

Brief description of changes made.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Performance improvement
- [ ] Documentation update
- [ ] Other: **\_**

## Testing

- [ ] Tested in Chrome
- [ ] Tested in Edge
- [ ] Tested in Firefox
- [ ] Tested on mobile
- [ ] No errors in console

## Screenshots (if applicable)

Add screenshots of UI changes.

## Additional Notes

Any additional context or considerations.
```

### Review Process

1. Maintainers review code for quality and functionality
2. Feedback provided through PR comments
3. Make requested changes and push updates
4. Final approval and merge

## Issue Reporting

### Bug Reports

Include the following information:

- Browser and version
- Operating system
- Steps to reproduce
- Expected behavior
- Actual behavior
- Console errors (if any)
- Screenshots (if applicable)

### Feature Requests

- Clear description of the feature
- Use case and benefits
- Possible implementation approach
- Any relevant examples or mockups

### Issue Labels

- `bug`: Something isn't working
- `enhancement`: New feature or improvement
- `documentation`: Documentation updates
- `good first issue`: Good for newcomers
- `help wanted`: Community assistance needed
- `plugin`: Related to plugin system
- `accessibility`: Accessibility improvements

## Development Tips

### Performance Optimization

- Minimize DOM manipulations
- Use event delegation for dynamic content
- Implement proper cleanup for event listeners
- Optimize database queries with batch operations

### Accessibility

- Test with keyboard navigation
- Verify screen reader compatibility
- Ensure sufficient color contrast
- Add appropriate ARIA labels

## Community

### Getting Help

- Open an issue for technical questions
- Check existing documentation first
- Be specific about your problem or question

### Communication

- Be respectful and professional
- Provide context and details
- Be patient with response times
- Help others when possible

Thank you for contributing to Virtual Kimi! Your efforts help create a better AI companion experience for everyone.

