# ProGit Official Documentation Site

This branch (`docs`) hosts the official **ProGit Documentation Site**, modeled after modern developer documentation platforms like `gogs.io` and Mintlify.

---

## 🌟 Features of the Documentation Site

- **Modern Mintlify / gogs.io Design**: Built with responsive layouts, GitHub dark mode palette (`#0d1117`), crisp typography, and ProGit emerald green brand accents.
- **Dark / Light Theme Toggle**: Seamless mode switching with `localStorage` memory and system preferences support.
- **Interactive Full-Text Search**: Press `Cmd+K` / `Ctrl+K` or `/` to trigger live search across all articles, configuration cheat sheets, and REST endpoints.
- **Multi-Tab Code Blocks**: Switch between Podman, Docker Compose, Standalone Binary, and Compile-from-Source instructions.
- **One-Click Code Copy**: Copy snippets and terminal commands with animated feedback.
- **Comprehensive REST API Reference (v1)**: Full request/response JSON schemas, method badges, and parameter specifications.
- **Zero-Dependency & Pure Static**: Can be hosted directly on **ProGit Pages** (`/pages/:owner/:repo/`), **GitHub Pages**, or opened locally as a static file (`open index.html`).

---

## 🚀 How to View Locally

Simply open `index.html` in your web browser:

```bash
open index.html # On macOS
xdg-open index.html # On Linux
```

Or serve with any static HTTP server:

```bash
python3 -m http.server 8080
# Visit http://localhost:8080
```

---

## 📜 Attribution

**Supported by PDIH and created by ProGit Team and Sanjeev.**  
Built on top of the Gogs source code. Released under the MIT License.
