# AegisCode 🛡️⚡

> **Next-Generation Lightweight Web IDE + Local Cross-Platform Go Core Server + Interactive Visual CodeGraph**

[![Release](https://img.shields.io/badge/Release-v1.0.0--beta.1-blue.svg)](RELEASE_NOTES.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.23+-00ADD8.svg)](https://golang.org)
[![React](https://img.shields.io/badge/React-19.0-61DAFB.svg)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC.svg)](https://tailwindcss.com)
[![Zero-CGO](https://img.shields.io/badge/Zero--CGO-Pure--Go-success.svg)](docs/architecture/architecture-overview.md)

---

## ⚡ 1-Line Quickstart

Launch the standalone IDE workbench instantly (macOS Apple Silicon pre-built binary):

```bash
curl -fsSL https://raw.githubusercontent.com/aditlab-code/AegisCode/main/scripts/install.sh | bash || ./bin/aegiscode-darwin-arm64 --open
```

Then navigate to:
```text
http://127.0.0.1:8080
```

---

## 🌟 Overview

**AegisCode** is an open-source, ultra-responsive developer workbench engineered to replace sluggish, multi-gigabyte memory-heavy IDEs. It couples a modular **React 19** front-end with an efficient **Go Core Server** compiled into a standalone, zero-dependency single executable.

Whether running as a native desktop application on macOS via a lightweight Cocoa WKWebView wrapper, running headless on a local server, or broadcasting an interactive coding session to your tablet, AegisCode guarantees instant cold-start times (<100ms) and minimal RAM utilization.

---

## 🛡️ Key Pillars & Capabilities

```mermaid
mindmap
  root((AegisCode))
    Zero-CGO Pure-Go
      Single Binary embed.FS
      modernc.org/sqlite
      Instant Startup &lt; 100ms
    Aegis Copilot Engine
      In-Process Go Core
      File-First .aegis/tasks
      Zero Codebase Cloud Leaks
    Visual CodeGraph
      VantageCraft 6-View Studio
      Dagre Hierarchical
      CoSE Clustered Topology
    Zero-Freeze Buffers
      Canonical Workspace Store
      Atomic Disk Sync
      Windowed Large File Slicing
```

* **Ultra-Fast CodeMirror 6 Engine**: Instant syntax highlighting, intelligent code completion via Language Server Protocol (LSP), and zero lag even in large files.
* **Integrated Go Delve Debugging**: Full-featured DAP debugger with gutter breakpoints, step execution, call stacks, and variable inspect panels.
* **VantageCraft CodeGraph Studio**: Interactive visual dependency mapping powered by Cytoscape layouts, real-time AI code tracing, and semantic symbol discovery.
* **Lightweight Local-First Security**: Strict loopback binding (`127.0.0.1`), CSWSH cross-site origin protection, physical symlink traversal prevention, and AES-256-GCM encrypted local vault for your AI provider keys.

---

## 🏗️ Architecture Blueprint

```mermaid
flowchart TD
    subgraph UI ["Frontend Studio (React 19 + Tailwind v4 + Modular Zustand)"]
        Editor["CodeMirror 6 Editor"]
        Chat["AI Assistant Studio [MCP] & Review Gates"]
        WaveStepper["Chat Wave Stepper (~32px)"]
        Terminal["xterm.js PTY Terminals"]
        DebugUI["DAP Debugger View"]
        GraphUI["VantageCraft CodeGraph Studio (Lazy-Loaded)"]
        Viewers["On-Demand Viewers (Image, PDF, CSV, Markdown)"]
        Store["Modular Zustand Store (9 Domain Slices)"]
    end

    subgraph Core ["Go Core Server (Single Executable, Zero-CGO)"]
        SPA["Embedded SPA Handler (embed.FS)"]
        EventHub["Unified EventHub SSE Multiplexer (/api/v1/events)"]
        API["REST Engine (Workspace, Git, CSV Query, Files)"]
        Copilot["Aegis Copilot Engine (server/internal/agent)"]
        WS["WebSocket Terminal Hub"]
        DAP["Bundled DAP Runner (Delve Proxy)"]
        MCP["Native MCP Bridge & Reverse Proxy"]
        DB[("Embedded SQLite (WAL + FTS5)")]
    end

    subgraph Subprocesses ["Sandboxed Subprocesses & Daemons"]
        PTY["Shell (zsh / bash / pwsh)"]
        DLV["Delve Debugger (dlv)"]
        AI["Antigravity CLI / Multi-Provider LLMs"]
        CGDaemon["CodeGraph Daemon & Kernel (.codegraph/)"]
    end

    Editor <-->|REST / Canonical Buffers| API
    Chat <-->|SSE Stream / In-Memory Context| API
    WaveStepper <-->|SSE Topic copilot| EventHub
    Terminal <-->|WebSocket / PTY Stream| WS
    DebugUI <-->|REST / DAP Protocol| DAP
    GraphUI <-->|Reverse Proxy /api/codegraph/ui/*| MCP
    Viewers <-->|Zero-Copy Stream & Windowed Query| API
    Store -.->|State Binding| UI

    API --> EventHub
    Copilot <-->|File-First Scaffolding| API
    EventHub -->|Multiplexed SSE Stream| UI
    API --> DB
    WS --> PTY
    DAP --> DLV
    API --> AI
    MCP <-->|stdio JSON-RPC / HTTP Proxy| CGDaemon
```

---

## 💻 Platform Distribution & Status

| Platform | Format | Status | Quick Command |
| :--- | :--- | :---: | :--- |
| **macOS Apple Silicon** (M1–M4) | `.dmg` Installer<br>`aegiscode-darwin-arm64` | **`[Tested & Verified]`** | Mount `bin/AegisCode.dmg` or run `./bin/aegiscode-darwin-arm64 --open` |
| **macOS Intel** (x86_64) | `aegiscode-darwin-amd64` | **`[Ready for Testing]`** | `./bin/aegiscode-darwin-amd64 --open` |
| **Linux** (x64 / ARM64) | `aegiscode-linux-amd64`<br>`aegiscode-linux-arm64` | **`[Ready for Testing]`** | `./bin/aegiscode-linux-amd64 --open` |
| **Windows** (x64) | `aegiscode-windows-amd64.exe` | **`[Ready for Testing]`** | `.\bin\aegiscode-windows-amd64.exe --open` |

---

## 🚀 Building from Source

### Prerequisites
- **Go**: Version `1.23+` ([golang.org](https://golang.org))
- **Node.js**: Version `20+` ([nodejs.org](https://nodejs.org))

```bash
# 1. Clone repository
git clone https://github.com/aditlab-code/AegisCode.git
cd AegisCode

# 2. Install dependencies & build frontend bundle
npm install
npm run build

# 3. Setup global CodeGraph MCP for AI agents (Claude, Cursor, Antigravity)
npm run mcp:install

# 4. Compile standalone single binary (Zero-CGO)
npm run build:binary

# 5. Launch the binary
./bin/aegiscode-darwin-arm64 --open
```

---

## 📚 Documentation Portal

Explore our public guides and developer references:

| Category | Guides & References |
| :--- | :--- |
| **Documentation Index** | [Master Documentation Index](docs/README.md) |
| **Architecture Overview** | [Architecture Overview](docs/architecture/architecture-overview.md) • [Database Schema & Partitioning](docs/architecture/database-schema.md) • [Architecture Decision Records](docs/adr/README.md) |
| **Developer & APIs** | [Local REST & Unified EventHub SSE API](docs/developers/local-rest-and-sse-api.md) • [MCP Specification](docs/developers/mcp-specification.md) • [Plugin & Extension Guide](docs/developers/plugin-and-extension-guide.md) |
| **Roadmap** | [Public Roadmap](ROADMAP.md) • [Release Notes](RELEASE_NOTES.md) |
| **User Guides** | [Installation Guide](docs/user-guide/installation.md) • [Getting Started](docs/user-guide/getting-started.md) • [Editor & Terminal](docs/user-guide/editor-and-terminal.md) • [Delve Debugger](docs/user-guide/debugging-with-delve.md) • [AI & Review Gates](docs/user-guide/ai-assistant-and-review-gates.md) • [Visual CodeGraph](docs/user-guide/visual-codegraph.md) • [Troubleshooting & FAQ](docs/user-guide/troubleshooting-and-faq.md) |
| **Community Standards** | [Contributing Guidelines](CONTRIBUTING.md) • [Code of Conduct](CODE_OF_CONDUCT.md) • [Security Policy](SECURITY.md) • [Changelog](CHANGELOG.md) |

---

## 📄 License & Attribution

AegisCode is open-source software licensed under the **[MIT License](LICENSE)**.  
Third-party component attributions and dependencies are cataloged in **[NOTICE](NOTICE)**.
