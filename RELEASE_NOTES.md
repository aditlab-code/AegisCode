# AegisCode v1.0.0-beta.1 Community Release Notes

**Release Date**: October 2026  
**Tag**: `v1.0.0-beta.1`  
**License**: [MIT License](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/LICENSE)

---

## Welcome to AegisCode `v1.0.0-beta.1`! 🛡️⚡

We are thrilled to announce the first public preview release of **AegisCode** (`v1.0.0-beta.1`).

AegisCode is an ultra-lightweight, high-performance web-based IDE engineered with a local cross-platform Go core server, bundled DAP debugging, multi-provider AI pair-programming, and wireless multi-screen companion pairing for iPads and Android tablets.

Designed under the core principle of **Zero Over-Engineering**, AegisCode delivers maximum developer productivity without the sluggishness or multi-gigabyte memory footprints of traditional Electron-based editors.

---

## Key Highlights & Architectural Features

### 1. Single-Binary Self-Contained Deployment
* **Zero External Web Server Required**: The Go backend embeds the complete React 19 production single-page application via `embed.FS`.
* **Instant Startup**: Launches in under **100 milliseconds** with minimal memory consumption.
* **Autonomous Port Resolution**: Automatically discovers and binds to open TCP ports (8080–8095) with built-in port clearing utilities.

### 2. Native macOS Desktop Application (`.dmg` & Cocoa WKWebView)
* **Tested & Verified on Apple Silicon**: Pre-packaged [`bin/AegisCode.dmg`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/bin/AegisCode.dmg) provides a native drag-and-drop installer for macOS.
* **Lightweight WKWebView Window**: Uses a compiled native Swift wrapper (`scripts/macos-wrapper/main.swift`) rather than heavyweight Electron runtimes, saving hundreds of megabytes of RAM.

### 3. Unified Multi-Provider AI Pair-Programming Engine
* **Universal Model Routing**: Seamless streaming integration with:
  - **Antigravity CLI (`agy`)**: Deep multi-agent CLI reasoning with out-of-process process execution and live NDJSON parser.
  - **Anthropic Claude**: Real-time HTTP SSE streaming with block-level tool use tracking.
  - **OpenAI & OpenCode / OpenRouter**: Token delta aggregation and instant streaming.
* **Tool Call Normalization**: Real-time visualization for tool executions (`write_to_file`, `replace_file_content`, `run_command`, `search_web`), automated target path resolution, and ghost-tab guards.
* **Unified Activity Timeline**: Clean, minimalist chat interface with collapsible thought traces and step-by-step progress cards.

### 4. Bundled Debug Adapter Protocol (DAP) Debugger
* **Native Debugging Engine**: Integrated JSON-RPC DAP client communicating with Go Delve (`dlv`) and custom adapters.
* **Interactive UI Controls**: Step over, step into, step out, continue, pause, and real-time breakpoint toggling.
* **Runtime Call Stack & Variable Scopes**: Inspect local stack frames, heap pointers, and structured variables directly in the sidebar.

### 5. Instant Terminal PTY Runner
* **High-Throughput WebSockets**: Real-time pseudo-terminal session manager built on `@xterm/xterm` with automatic viewport resizing (`fitAddon`).
* **Multi-Tab Sessions**: Seamlessly manage, rename, and terminate multiple terminal shells in parallel.

### 6. Wireless Tablet Companion Pairing
* **Second-Screen Workflow**: Open `/?mode=companion` over local Wi-Fi to use your iPad or Android tablet as a responsive companion display.
* **Dual Modes**:
  - **Live Web Preview**: Test web applications and services directly on physical mobile screens with live reload.
  - **Focused Scratchpad Editor**: Touch-optimized editing buffer for note-taking and rapid code snippets.

---

## Operating System Test Status Matrix

To ensure absolute transparency for our community, here is our current platform verification matrix:

| Operating System | Distribution Format | Testing Status | Community Action |
| :--- | :--- | :--- | :--- |
| **macOS Apple Silicon** (M1/M2/M3/M4) | `.dmg` Installer<br>`aegiscode-darwin-arm64` binary | **`[Tested & Verified]`** | Ready for daily use. Drag & drop installation verified. |
| **macOS Intel** (x86_64) | `aegiscode-darwin-amd64` binary | **`[Untested / Experimental]`** | Binary built via Go compiler. Awaiting physical Intel Mac testing. |
| **Windows 10 / 11** (x86_64) | `aegiscode-windows-amd64.exe` | **`[Untested / Experimental]`** | Binary built via Go compiler. Supports standalone Microsoft Edge App mode. |
| **Linux** (x86_64 & ARM64) | `aegiscode-linux-amd64`<br>`aegiscode-linux-arm64` | **`[Untested / Experimental]`** | Binaries built via Go compiler. Awaiting distribution tests across Ubuntu, Arch, and Fedora. |

> [!NOTE]
> If you are running Windows or Linux, we invite you to test these standalone executables and report any issues or feedback to our issue tracker.

---

## Quickstart Installation

Refer to our comprehensive [INSTALLATION.md](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/INSTALLATION.md) for full setup instructions, including macOS Gatekeeper authorization steps and building from source.

### Run on macOS Apple Silicon:
```bash
# 1. Mount AegisCode.dmg from bin/ and drag AegisCode.app to /Applications
# 2. If prompted by Gatekeeper on initial launch, authorize via:
xattr -cr /Applications/AegisCode.app
```

### Run Standalone Binary:
```bash
./bin/aegiscode-darwin-arm64 --open
```

---

## Documentation Navigation

- **Release & User Guides**:
  - [README.md](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/README.md) — Project overview & capabilities
  - [INSTALLATION.md](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/INSTALLATION.md) — Step-by-step installation instructions
  - [LICENSE](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/LICENSE) — MIT License
- **Internal Development & Architecture Specifications**:
  - [`docs/README.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/README.md) — Internal developer index
  - [`docs/internal/architecture.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/internal/architecture.md) — System architecture
  - [`docs/internal/feature-backend.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/internal/feature-backend.md) — Backend APIs & DAP debugger
  - [`docs/internal/frontend.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/internal/frontend.md) — UI design & Tailwind token system

---

Thank you to everyone who contributed to making `v1.0.0-beta.1` possible! Happy coding with AegisCode! 🚀
