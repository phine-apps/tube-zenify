# Contributing to TubeZenify

First off, thank you for considering contributing to TubeZenify! It's people like you that make TubeZenify such a great tool.

## How Can I Contribute?

### Reporting Bugs
This section guides you through submitting a bug report for TubeZenify. Following these guidelines helps the maintainers (phine-apps) and the community understand your report, reproduce the behavior, and find related reports.

- **Check for existing issues.** Use the GitHub issue search.
- **Use a clear and descriptive title** for the issue to identify the problem.
- **Describe the exact steps which reproduce the problem** in as many details as possible.

### Suggesting Enhancements
This section guides you through submitting an enhancement suggestion for TubeZenify, including completely new features and minor improvements to existing functionality.

- **Check for existing suggestions.**
- **Use a clear and descriptive title.**
- **Provide a step-by-step description of the suggested enhancement** in as many details as possible.
- **Describe the current behavior and explain which behavior you expected to see instead** and why.

### Pull Requests
- **Create a new branch** for your feature or bug fix.
- **Write clear, concise commit messages.**
- **Include tests** if you're fixing a bug or adding a feature.
- **Ensure the build passes.**

## Development Setup

1. **Clone the repository.**
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Perform initial build:**
   ```bash
   npm run build
   ```
   This generates the `dist` folder required for loading the extension.
4. **Load the extension in your browser:**
   - Open Chrome or a Chromium-based browser.
   - Go to `chrome://extensions`.
   - Enable **"Developer mode"**.
   - Click **"Load unpacked"** and select the `dist` folder.
5. **Start development mode (HMR):**
   ```bash
   npm run dev
   ```
   With this running, changes you make to the source code will be automatically reflected in the extension.

## Production Build

To create an optimized, production-ready build for distribution:
```bash
npm run build
```
The output in `dist` will be minified and optimized.

---

By contributing, you agree that your contributions will be licensed under the GNU Affero General Public License v3.0 (AGPL-3.0) of the project.
