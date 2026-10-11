# AegisCode Engineering Roadmap

> **Objective**: Milestone progression and delivery tracking for AegisCode.  
> **Lifecycle**: Tracks implementation from the initial lightweight frontend wireframe to the full cross-platform Go backend, bundled DAP debugging, and tablet multi-screen remote companion.

---

## Milestone Progress Overview

| Phase | Milestone Name | Status | Focus Area |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Shell Layout & Column Componentization | ✅ Completed | Master layout shell, CSS modularity, Tailwind v4 tokens |
| **Phase 2** | Workbench Text Editor & Interactive Buffers | ✅ Completed | Multi-pane groups, buffer editing, tabs DND, linter, 2px active tab |
| **Phase 3** | Explorer, Workspace CRUD, & Git Controls | ✅ Completed | Tree traversal, inline CRUD, regex search/replace, Git UI |
| **Phase 4** | Status Bar & Diagnostics Engine | ✅ Completed | Dynamic cursor Ln/Col, language detection, problem popover |
| **Phase 5** | AppDrawer AEGIS AI Agent & Session Hub | ✅ Completed | Multi-session chat, slash autocomplete, provider selector |
| **Special** | UI Dark/Light Theme & Modular Palettes | ✅ Completed | ActivityRail toggle, modular JSON palettes (Default, Atom, Tokyo Night) |
| **Special** | Settings Registry, Core IDE Preferences & Editor Polish | ✅ Completed | Decoupled schema registry, wildcard exclude, GPU cursor blinking, wrap column |
| **Phase 6** | Go Core Server, Flat-File Storage, AI Agent Drawer & Bundled DAP Debugger | 🟡 Active (6.1, 6.2, 6.3, 6.6 ✅) | Cross-platform Go binary & embed.FS, supervisor, JSON store, AI agent bridge, DAP/Delve |
| **Phase 7** | Multi-Viewer Engine & UI/UX Wireframe Studio (`tldraw`) | ⚪ Upcoming | Multi-format tab viewers (Images, CSV), vector canvas wireframing |
| **Phase 8** | Research Workshop & Data Science Studio | ⚪ Planned | LaTeX + PDF sync, BibTeX, Python/R dataframes, Biblioshiny |
| **Phase 9** | Web-Based Remote Pairing & Tablet Companion | ⚪ Deferred (Final) | LAN pairing, web preview host, touch-optimized editor mode |

---

## Detailed Milestone Specifications

### Phase 1: Shell Layout & Column Componentization
- **Status**: ✅ Completed
- **Objectives**:
  - Modularize the monolithic layout into decoupled components under [`src/components/layout/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout).
  - Implement co-located CSS files per layout module (`header.css`, `sidebar.css`, `editor.css`, `bottom-panel.css`, `chat.css`, `status-bar.css`).
  - Establish Tailwind CSS v4 `@theme` design tokens in [`src/styles/tokens.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/styles/tokens.css) with zero arbitrary hex colors.
  - Implement reusable UI primitives (`Icon`, `IconButton`, `Toast`) under [`src/components/ui/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/ui).

---

### Phase 2: Workbench Text Editor & Interactive Buffers
- **Status**: ✅ Completed
- **Deliverables**:
  - **Dual Independent Window Groups**: Split editor panes (Group 1 & Group 2) with draggable sash splitter.
  - **Drag-and-Drop Tabs (DND)**: Tab reordering and cross-group dragging using HTML5 native Drag and Drop.
  - **Custom Code Buffer Engine**: Line numbering gutter, active line highlighting, auto-indentation, dirty unsaved indicator, 2px active accent tab indicator bar.
  - **Client-Side Syntax Linter**: In-browser heuristic linter supporting TypeScript/JavaScript, Python, C++, and JSON.
  - **Editor Navigation & Find**: Floating in-editor find widget (`Ctrl+F`), breadcrumb bar, and minimap overview.
- **Exit Criteria**: Editing code in multiple open buffers feels instantaneous, tabs transfer reliably between panes, and linting feedback updates with zero UI lag.

---

### Phase 3: Explorer, Workspace CRUD, & Git Controls
- **Status**: ✅ Completed
- **Deliverables**:
  - **Explorer File Tree**: Nested directory view with folder collapse/expand, indent guidelines, and hidden files toggle.
  - **Inline File CRUD**: Create file, create folder, inline rename, delete file, and right-click context menu (Copy Path, Copy Relative Path).
  - **Search & Replace Engine (VS Code Parity)**: Live workspace regex search and granular replace engine (single match, per-file, workspace-wide) with inline chevron toggle, embedded replace-all icon, keyword match highlighting (`.match-highlight`), hover-only action buttons (`group-hover`), clean root path formatting, and automatic search refresh backed directly by the Go backend server.
  - **Source Control Git UI**: Staged and unstaged file lists, commit message input with Ctrl+Enter shortcut, branch graph visualization, and action triggers (commit, push, pull).
- **Exit Criteria**: Complete file tree management works seamlessly in memory and binds cleanly to backend workspace APIs once connected.

---

### Phase 4: Status Bar & Diagnostics Engine
- **Status**: ✅ Completed
- **Deliverables**:
  - Dynamic line and column cursor reporting (`Ln X, Col Y`).
  - Automatic language detection based on active file extension.
  - Interactive Git branch switcher and checkout popover with filter search and branch creation (`BranchPopover.tsx`).
  - Cloud synchronization status button with push/pull indicator (`↓behind ↑ahead`).
  - Diagnostics error and warning counter linking to the Problems view, with empty state handling (`ProblemsPopover.tsx`).
  - **Dynamic Status Bar Controls (Zero Hardcoding)**:
    - **Indentation (`Spaces: {tabSize}`)**: Dynamic reactive binding with editor configuration; clicking toggles indentation (2 ↔ 4 spaces) with confirmation toast; synchronized across Settings Modal and Sidebar.
    - **Encoding (`UTF-8`)**: Dynamic active document encoding indicator.
    - **Local Server Connection (`Local: Connected / Offline`)**: Dynamic backend health ping to Go Core Server (`/api/v1/workspace/info`) with live colored dot indicator (`--color-success` / `--color-error`) and click-to-reconnect/status check.
  - **Integrated Notification Center & Toast History**:
    - Automatic bidirectional bridge between transient toast notifications (`showToast`) and Notification Center history (`notifications`, max 30 in-memory items).
    - Popover features: Clean empty state (`No notifications`), header actions (`Mark all read`, `Clear all`), scrollable list, and per-item dismiss action (`NotificationsPopover.tsx`).
    - Popover dismiss interaction: Global click-outside listener and `Escape` key handling.
- **Exit Criteria**: Status bar remains responsive, eliminates all mock/hardcoded elements, cleanly records workspace notification events, and updates smoothly during rapid typing and editor pane switches.

---

### Phase 5: AppDrawer AEGIS AI Agent & Session Hub
- **Status**: ✅ Completed
- **Deliverables**:
  - **Session Management**: Master-detail session sidebar showing historical conversations, active thread selection, and new chat creation.
  - **Cascading Model Selection**: Grouped selector supporting local models and remote providers.
  - **Autocomplete Trigger Engine**: Interactive popup on typing `/` (skills and slash commands) and `@` (workspace file references).
  - **Message Streaming Renderer**: Markdown code block formatting, syntax highlighting, and copy-to-clipboard actions.
- **Exit Criteria**: Autocomplete triggers reliably with keyboard navigation, streaming markdown renders without flickering, and sessions persist cleanly in memory/local storage.

---

### Special Milestone: UI Dark/Light Theme & Modular Palettes
- **Status**: ✅ Completed
- **Deliverables**:
  - **ActivityRail Theme Toggle**: Interactive Sun/Moon icon toggle button above Settings with smooth rotation and toast confirmation.
  - **Modular JSON Palettes**: Split theme palettes into independent JSON palette files ([`default-dark.json`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/themes/default-dark.json), [`default-light.json`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/themes/default-light.json), [`atom-dark.json`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/themes/atom-dark.json), [`atom-light.json`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/themes/atom-light.json), [`tokyo-night-dark.json`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/themes/tokyo-night-dark.json), [`tokyo-night-light.json`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/themes/tokyo-night-light.json)) loaded via [`themeRegistry.ts`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/themes/themeRegistry.ts).
  - **Strict 100% Hex Token Architecture**: Completely eliminated all hardcoded `rgb()` / `rgba()` values; standardized on Tailwind CSS v4 `@theme` Hex tokens with universal status tokens (`--color-error`, `--color-warning`, `--color-success`, `--color-info`, `--color-surface-overlay`).
  - **Anti-Fatigue Ambient Gradient**: Dual-layer ambient radial glow over linear canvas in `base.css` providing eye comfort during prolonged coding sessions.
  - **UI Design Polish**: 2px active tab accent bar, surface elevation, accent dirty dot, 13.5px / 22px code editor line height, and 11px micro-copy scale.

---

### Special Milestone: Settings Registry, Core IDE Preferences & Editor Polish
- **Status**: ✅ Completed
- **Deliverables**:
  - **Decoupled Settings Registry Architecture**:
    - Extracted complete schema definitions into [`settingsRegistry.ts`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/settings/settingsRegistry.ts) ([`buildSettingsSchema`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/settings/settingsRegistry.ts#L79)), reducing [`SettingsModal.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/settings/SettingsModal.tsx) by 75% down to ~240 lines.
    - Added generic updater creator [`createSettingsUpdater`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/context/core/settingsCore.ts#L321) in [`settingsCore.ts`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/context/core/settingsCore.ts) to eliminate updater boilerplate.
  - **Complete Core IDE Settings**:
    - **Editor**: Unique `tabSize` (2, 4, 8), soft tabs `insertSpaces`, `cursorBlinking` (smooth, blink, solid), `renderWhitespace` (none, selection, all), `formatOnSave`, `accessibilityPageSize`, `wordWrap` & `wordWrapColumn`, `minimapScale` and `minimapSide`, diff editor font inheritance.
    - **Files**: `autoSave` (off, afterDelay, onFocusChange), `autoSaveDelay`, save hygiene (`trimTrailingWhitespace`, `insertFinalNewline`, `eol`), and `files.exclude`.
    - **Workbench**: Modular theme palette selection, Dark/Light modes, `sidebarPosition` (left, right), and `compactFolders`.
    - **Features**: Terminal configuration (SSE, shortcut, cursor style/blinking, `fontFamily`, `lineHeight`), Source Control pagination limit, Explorer timeline commit limit, and dynamic `comments` TODO badges.
    - **Companion (Tablet)** & **AI Agents**: Port, mDNS, pairing PIN, remote edit permissions, plus default LLM model (`agent.model`), temperature, token streaming, and context ingestion.
  - **Hardware-Accelerated Editor UX Polish**:
    - Real CSS `@keyframes aegis-caret-blink` and `@keyframes aegis-caret-smooth` in [`editor.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor/editor.css#L396).
    - True character-measure wrapping via `max-width: calc(var(--editor-wrap-column, 80) * 1ch)`.
    - Reactive minimap scale relative to active editor font size.
  - **Zero-Dependency Wildcard Matching**:
    - Fast wildcard matcher [`matchesExcludePattern`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/sidebar/ExplorerPanel.tsx#L105) for `files.exclude` supporting `*.log`, `*.tmp`, `**/*.ext`, and directory subpaths.
  - **100% Tailwind Semantic Token Compliance**:
    - Replaced all raw arbitrary escapes in [`DiffEditorPane.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor/DiffEditorPane.tsx) and [`SourceControlPanel.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/sidebar/SourceControlPanel.tsx) with semantic tokens (`border-line`, `bg-surface-raised`, `text-ink`, `text-accent`, etc.).
- **Exit Criteria**: Fully verified through 32 Vitest frontend tests, Go backend tests, Vite production build, and oxfmt formatting with 0 errors.

---

### Phase 6: Go Core Server, Flat-File Storage, AI Agent Drawer & Bundled DAP Debugger
- **Status**: 🟡 Active (Sub-Phases 6.1, 6.2, 6.3, and 6.6 Completed)

#### Sub-Phase 6.1: Live Workspace Engine & File Operations
- **Status**: ✅ Completed
- **Deliverables**:
  - Direct Go backend endpoints for directory browsing, file CRUD, recursive regex search, and workspace-wide string replacement (`/api/v1/workspace/*`).
  - Thread-safe workspace manager with path normalization and clean open/close lifecycle states.

#### Sub-Phase 6.2: Native Git CLI Synchronization & In-Editor Side-by-Side Diff
- **Status**: ✅ Completed
- **Deliverables**:
  - **Zero Fake Fallback**: 100% real Git CLI execution via 17 native Go backend endpoints (`/api/v1/git/*`).
  - **Dynamic User Profile**: Dynamic extraction of user name and email from local/global `git config` without hardcoding.
  - **VS Code Parity Source Control Sidebar**:
    - Repositories list with active repo, branch pill (`*` dirty indicator), and sync trigger.
    - Staged Changes and Changes collapsible lists with status code badges (`M`, `A`, `D`, `U`), line diff stats, stage/unstage/discard actions.
    - Responsive split Commit button with chevron dropdown options (`Commit`, `Commit & Push`) and AI commit draft generator (`sparkle` button).
    - Interactive SVG commit graph with clickable branch pills for instant branch switching.
    - Zero fake fallback empty states ("Initialize Repository" and "Open Folder").
  - **In-Editor Side-by-Side Git Diff (`DiffEditorPane.tsx`)**:
    - Complete elimination of over-engineered popup modal overlays.
    - Side-by-side comparison in the main editor pane: read-only original (HEAD/Commit) on left; live-editable working copy connected to `fileBuffers` on right (saveable via `⌘S` / `Ctrl+S`).
    - Synchronized line scrolling and diff toolbar actions (Open File, Stage, Unstage, Discard, Close).
    - Integrated with `EditorTabs.tsx` via `gitDiffTab.ts` (`filename (Working Tree)`, `filename (Index)`, `filename (commit)`).
  - **Explorer Timeline Integration**: File-specific commit history in Explorer panel with one-click diff opening and commit hash copying.
  - **Status Bar Integration**: Branch indicator with dirty state asterisk (`*`), live sync counter (`↓behind ↑ahead`), and branch switcher popover.

#### Sub-Phase 6.3: Process Supervisor & Native PTY Terminal Shells
- **Status**: ✅ Completed
- **Deliverables**:
  - **Native PTY Terminal Session Manager (`server/internal/terminal`)**:
    - Cross-platform pseudo-terminal allocation via `creack/pty` supporting custom shell resolution (`zsh`, `bash`, `sh`), working directory scoping, and dynamic window resizing (`Cols`, `Rows`).
    - Process group leadership (`Setsid`/`Setpgid`) and clean anti-orphan termination (`SIGTERM` + 50ms `SIGKILL` watchdog to `-pid` on Unix, process kill on Windows).
  - **Real-Time PTY Streaming (`/api/v1/terminal/*`)**:
    - Low-latency downlink streaming over Server-Sent Events (SSE) (`/api/v1/events/terminal/:sessionId`) with base64 data payloads and graceful exit notification.
    - Synchronized stdin uplink via HTTP POST (`/api/v1/terminal/:sessionId/input`) with micro-batched typing latency and dynamic resize (`/api/v1/terminal/:sessionId/resize`).
    - Seamlessly integrated with in-editor `TerminalView.tsx` powered by `@xterm/xterm` and `@xterm/addon-fit`.
  - **Fail-Fast Process Supervisor (`server/internal/supervisor`)**:
    - Robust child process supervisor for language servers (LSP), compiler CLI tools, and background worker jobs with fail-fast crash isolation ([ADR 0004](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/adr/0004-worker-supervision-and-agent-isolation.md)).
    - 5 explicit lifecycle states: `Starting`, `Running`, `Backoff`, `Crashed`, `Stopped`.
    - Resilient restart policies: `RestartNever` and `RestartOnFailure` with exponential backoff and quota limit (max 3 retries in 30s) preventing CPU infinite spin loops.
    - In-memory 64 KB thread-safe circular ring buffer per worker capturing combined stdout/stderr for instant post-mortem diagnostics.
    - Diagnostic observability endpoints: `GET /api/v1/workers`, `POST /api/v1/workers`, `GET /api/v1/workers/:id`, `GET /api/v1/workers/:id/logs`, and `POST /api/v1/workers/:id/stop`.
    - Integrated with Go server graceful teardown in `server/cmd/server/main.go` and Tasks log channel (`s.BroadcastLog`).

#### Sub-Phase 6.4: Stateless/Immutable Runtime & Flat-File Data Isolation
- **Status**: ✅ Completed
- **Deliverables**:
  - **Zero-DB Stateless Architecture & OS-Level Flat-File Storage (`~/.aegis/`)**:
    - Full elimination of heavy SQLite / CGO dependencies in favor of lightweight, pure-Go standard library JSON flat-files (`os`, `encoding/json`). Preserves 100% pure-Go cross-compilation matrix (`CGO_ENABLED=0`) across macOS (arm64/amd64), Linux (amd64/arm64), and Windows (amd64) with zero external database dependencies.
    - User-level isolation in OS home directory (`~/.aegis/` on macOS/Linux, `%APPDATA%/AegisCode/` on Windows):
      - `~/.aegis/config.json`: Persistent user preferences, theme overrides, model configurations, and bypassed auth/API tokens.
      - `~/.aegis/state.json`: Recent workspace paths, window state, and active session pointers.
      - `~/.aegis/chats/<session_id>.json`: Isolated multi-session AI chat conversation histories with full messages, provider metadata, and timestamps.
    - **Zero Repo Pollution**: Active project repositories remain 100% clean and free of database / lock files, preventing Git status clutter and accidental secret leakage.
  - **Atomic File Writes & Crash Resistance**:
    - Thread-safe atomic file writing pattern (temporary file write + OS kernel atomic rename) guaranteeing zero file corruption during unexpected power outages or app termination.
  - **REST Persistence Endpoints (`/api/v1/chats/*`, `/api/v1/config`, `/api/v1/state`)**:
    - Lightweight endpoints:
      - `GET/POST /api/v1/config`: Read/write global configuration and token bypass metadata.
      - `GET/POST /api/v1/state`: Read/write application state and active session pointer.
      - `POST/DELETE /api/v1/state/recent`: Add, remove, or clear recent project paths.
      - `GET /api/v1/chats`: List all chat session summaries.
      - `GET/POST /api/v1/chats/:id`: Retrieve or save full chat session history.
      - `DELETE /api/v1/chats/:id`: Delete a chat session file.
    - Seamlessly bridges frontend Local-First caching with backend disk persistence, ensuring persistent multi-device session sync for future Tablet Companion (Phase 9).
  - **Non-Destructive Legacy Migration ([ADR 0002](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/adr/0002-app-data-directory-and-legacy-migration.md), [ADR 0007](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/adr/0007-non-destructive-shadow-migration.md))**:
    - Startup adapter detects legacy v1 artifacts (`data/settings.json`, `.aegis/auth.json`, legacy databases) and executes a non-destructive read-only shadow migration into `~/.aegis/config.json`.
  - **Immutable Boot Configuration**:
    - Environment variables (`WORKSPACE_ROOT`, `PORT`, `AEGIS_OPEN`) parsed into read-only Go structs at boot time; zero mutating global server state.
  - **Verification**: 100% unit and integration test coverage (`TestStoreInitialization`, `TestConfigPersistence`, `TestAppStateAndRecentProjects`, `TestChatSessionsCRUD`, `TestSanitizeIDTraversalGuard`, `TestLegacyMigration`, and `TestStorageEndpoints`).

#### Sub-Phase 6.5: Bundled DAP Debugger (Delve `dlv`) Engine
- **Status**: 🟡 Next
- **Deliverables**:
  - Debug Adapter Protocol (DAP) client proxy and bundled Delve runner for step-by-step Go and backend debugging through the web UI.

#### Sub-Phase 6.6: Single Cross-Platform Binary, Embedded Frontend (`embed.FS`) & Native Desktop Window
- **Status**: ✅ Completed
- **Deliverables**:
  - **Embedded Frontend in Go Binary (`server/internal/web`)**:
    - Embedded production React 19 web assets into Go binary using `//go:embed all:dist` with SPA client routing fallback.
    - Unified HTTP routing: `/api/v1/*` routes handled by Go workspace/git/terminal APIs, all static/SPA routes served from the embedded bundle.
    - Dynamic port auto-binding & fallback in `server/cmd/server/main.go`: binds default `8080`, and gracefully cascades across `8081..8095` if occupied.
    - CLI options: `--port`, `--open`, `--headless`, and Windows Edge App Mode (`--app=http://...`) launch.
  - **Native Desktop App Shell (`scripts/macos-wrapper/main.swift`)**:
    - Ultra-lightweight native Swift/Cocoa `WKWebView` window wrapper (~88 KB binary) replacing heavyweight Electron (~200MB+ overhead).
    - Native macOS window chrome, styled dark titlebar, Obsidian canvas backdrop (`#0d0f12`), and full window controls.
  - **Fail-Safe Port Cleanup & Anti-Zombie Watchdog**:
    - Robust process lifecycle supervision in Cocoa wrapper: traps `SIGTERM`, `SIGINT`, `SIGHUP`, window close delegate (`windowWillClose`), and `applicationShouldTerminateAfterLastWindowClosed` (`⌘Q`).
    - Immediately dispatches `SIGTERM` to the child `aegiscode-server` process group, backed by a 250ms `SIGKILL` watchdog timer. Guarantees 100% clean port release with zero zombie background processes.
  - **Cross-Platform Matrix & DMG Packaging**:
    - Automated cross-compilation matrix script (`scripts/build-binary.js`, `npm run build:binary`) with UPX compression generating lightweight standalone binaries (~7.5 MB - 8.1 MB) across 5 targets: macOS (`darwin/arm64`, `darwin/amd64`), Linux (`linux/amd64`, `linux/arm64`), and Windows (`windows/amd64`).
    - macOS DMG packager (`scripts/package-dmg.js`, `npm run package:dmg`) producing ready-to-mount `bin/AegisCode.dmg` installer (~3.5 MB) containing `AegisCode.app`.
  - **UI & Brand Hygiene**:
    - Purged legacy mock traffic lights from [`WindowControls.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/header/WindowControls.tsx) and [`header.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/header/header.css) in favor of native OS window controls.
    - Purged all legacy "figma-make-app" strings; standardized official Aegis Shield SVG branding and rich OpenGraph/HTML metadata.
  - **Verification**: 100% verified via automated frontend Vitest suite (32 tests), Go backend suite (7 suites), and live standalone DMG execution.

#### Sub-Phase 6.7: UI State & Context Extractor (Frontend PWA Focus)
- **Status**: ⚪ Planned
- **Deliverables**:
  - **Context Extractor Core**: Passive real-time context capture engine (`ContextManager` in React Context) collecting:
    - `activeFilePath`: Relative path of the currently focused editor tab.
    - `selectedText`: Instant cursor text selection.
    - `entireBuffer`: Full editor buffer content with character threshold guardrail (>50,000 chars falls back to active selection with warning badge).
  - **Token Exclude Filter**: Seamless integration with `matchesExcludePattern` from IDE settings (`files.exclude`) to ensure giant files, binary artifacts, or build output (`node_modules/`, `dist/`, `*.log`) are stripped client-side prior to network dispatch.
  - **Context Chip Badge in AppComposer**: Visual pills in composer displaying active file and selection tags (`@file.go`, `Selection (Ln 12-45)`) with one-click dismiss.

#### Sub-Phase 6.8: Go API Bridge & Token Lifecycle (Auth Context)
- **Status**: ⚪ Planned
- **Deliverables**:
  - **Global Config Read (`~/.aegis/config.json`)**: Thread-safe configuration reader accessing persisted provider API keys, model preferences, and CLI bypass tokens.
  - **OAuth CMD Bypass & Manual Login Handling**:
    - Support for 4 unified AI providers:
      1. **Antigravity**: OAuth CMD / CLI bypass token (manual user login via CLI).
      2. **OpenCode**: OpenAI-compatible API gateway (configurable base URL & API key).
      3. **OpenRouter**: Multi-model gateway (`https://openrouter.ai/api/v1`) via API key.
      4. **Claude**: OAuth CMD / CLI bypass token (manual user login via CLI).
    - If credentials expire (401 response from upstream), Go triggers background refresh command or dispatches auth notification.
  - **Real-Time Auth Status Stream via SSE**: Dispatches `auth:refreshing` and `auth:ready` signals to PWA over `/api/v1/events/workspace` to keep UI updated without modal popups.

#### Sub-Phase 6.9: Isolated Engine & SSE Streaming (Backend Provider Go)
- **Status**: ⚪ Planned
- **Deliverables**:
  - **Uniform AI Request Contract (`server/internal/ai`)**:
    - Unified `AIRequest` struct containing `provider`, `model`, `prompt`, `messages`, and `WorkspaceContext`.
    - Modular `Provider` interface (`StreamChat(ctx, req, out)`) isolating OpenAI-compatible streaming (`openrouter`, `opencode`) from CLI OAuth token streaming (`antigravity`, `claude`).
  - **Low-Latency SSE Chunked Stream Renderer (`/api/v1/ai/chat`)**:
    - Chunked streaming per token/word via Server-Sent Events with zero flickering markdown rendering in `ChatMessageList.tsx`.
    - **Client Abort & Cancellation**: Request tied to `r.Context()`; when user clicks "Stop Generating" (AbortController), Go immediately cancels upstream LLM connection, saving user tokens and network bandwidth.
  - **On-Demand Lazy Loading for `@file` Mentions**: Fast targeted disk reading (`/api/v1/workspace/file`) strictly for files mentioned in prompt tags, without scanning entire workspace trees.

#### Sub-Phase 6.10: Git-Driven Review Gates (Apply & Code Manipulation)
- **Status**: ⚪ Planned
- **Deliverables**:
  - **Path Boundary Verification**: Strict path validation enforcing that all AI code generation targets reside within the active `rootPath` before disk writes (preventing directory traversal attacks).
  - **Git-Backed Side-by-Side Review**:
    - User clicks "Apply to Editor" on markdown code blocks (`ChatMessageList.tsx`), writing changes via `/api/v1/workspace/file`.
    - Leverage Phase 6.2 real Git CLI: modifications immediately surface in [`DiffEditorPane.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor/DiffEditorPane.tsx) side-by-side view with synchronized scrolling.
    - Zero redundant temporary buffer system: users accept via native Git Stage/Commit or reject via native Discard Changes.
  - **Interactive Markdown Code Block Toolbar**:
    - Action headers for all markdown code fences: `[Copy]`, `[Apply to Editor]`, and `[Insert at Cursor]`.

---

### Phase 7: Multi-Viewer Engine & UI/UX Wireframe Studio (`tldraw`)
- **Status**: ⚪ Upcoming (Next UI Frontier)
- **Objectives & Deliverables**:
  - **Sub-Phase 7.1: Multi-Viewer Tab Dispatcher & Universal On-Demand Code Splitting**:
    - Abstraction of workbench editor tabs from pure text buffers to a versatile MIME/Extension viewer dispatcher.
    - **PWA Dynamic Code-Splitting Rule for ALL Viewers**: To prevent application bundle bloat beyond 50MB+ and protect client memory, **every** non-code viewer pane and its third-party parsing/rendering engines **MUST NEVER** be imported in the initial boot bundle. All non-text viewers are partitioned into isolated asynchronous chunks via `React.lazy()` and dynamic `import()`:
      - **Media Pan-Zoom Pane (`ImageViewerPane`)**: Dynamically loaded on-demand strictly upon opening `.png`, `.jpg`, `.jpeg`, `.svg`, `.webp` (with pan, zoom, pixel grid, and checkerboard).
      - **Spreadsheet & Tabular Pane (`SpreadsheetViewerPane`)**: Dynamically loaded on-demand strictly upon opening `.csv`, `.tsv`, `.xls`, `.xlsx` (row virtualization, column sorting, and sheet parser).
      - **Live Markdown Splitter (`MarkdownPreviewPane`)**: Dynamically loaded on-demand strictly upon toggling preview on `.md` (live rendered preview and math notation).
      - **PDF Document Viewer (`PdfViewerPane`)**: Dynamically loaded on-demand strictly upon opening `.pdf` (PDF.js rendering and SyncTeX).
      - **Vector Canvas Studio (`WireframeStudioPane`)**: Dynamically loaded on-demand strictly upon opening `.canvas`, `.design` (`@tldraw/tldraw`).
    - **Zero-RAM Code Studio Guarantee**: While developers are editing standard code (`.go`, `.ts`, `.tsx`, `.py`, `.json`, `.css`), none of these viewer chunks are downloaded, parsed, or loaded into computer RAM.
  - **Sub-Phase 7.2: Vector Canvas Wireframe Studio (`tldraw`)**:
    - Integration of `@tldraw/tldraw` infinite vector canvas engine isolated strictly inside an on-demand dynamic chunk (`tldraw-chunk.js`).
    - **Zero-Footprint in Code Studio**: The tldraw chunk is downloaded and mounted into RAM **only** when the user opens `.canvas` or `.design` files. While editing standard code (`.go`, `.ts`, `.tsx`, `.py`), tldraw assets consume 0 MB of computer memory and 0 KB initial network bandwidth.
    - Zero-overhead state persistence: canvas state saved as structured JSON directly through Go workspace file endpoints (`/api/v1/workspace/file`) with full Git version tracking.
    - Wireframe UI toolkit: Rectangles, Frames (Artboards for Mobile/Desktop screens), UI buttons, input boxes, typography, arrows, and sticky annotations.
  - **Sub-Phase 7.3: Design-to-Code & Perspective Presets**:
    - Mode Switcher in Header bar: `Code Studio` ↔ `Design Studio` with contextual Activity Rail filtering.
    - Token color bridge linking canvas element palettes directly to AegisCode Tailwind CSS tokens (`bg-surface`, `text-ink`, `color-accent`).
    - AEGIS AI Drawer integration: ability to read canvas JSON nodes to suggest layout refinements or draft React/Tailwind TSX component scaffolds.

---

### Phase 8: Research Workshop & Data Science Studio
- **Status**: ⚪ Planned
- **Objectives & Deliverables**:
  - **Sub-Phase 8.1: LaTeX Compilation & Live PDF Synchronization**:
    - Go supervisor asynchronous job runner executing `tectonic` / `pdflatex` CLI with streaming build logs to Output Panel via SSE.
    - Native `PdfViewerPane` powered by PDF.js, **dynamically code-split via `React.lazy()`** so PDF.js engine is only downloaded and instantiated when opening a `.pdf` file. Bidirectional SyncTeX click-to-code navigation.
  - **Sub-Phase 8.2: BibTeX Reference Manager**:
    - Dedicated sidebar panel and in-editor autocomplete (`\cite{...}`) backed by `.bib` file parser.
  - **Sub-Phase 8.3: Data Science Python / R & Interactive Analytics**:
    - Integrated DataFrame visualizer with column filtering and statistical profiling.
    - Python environment inspector (`venv` / `uv` / `pip` package manager).
    - Subprocess sandboxed webview iframe for R Shiny / `biblioshiny` and PLS-SEM interactive visualizations.

---

### Phase 9: Web-Based Remote Pairing & Tablet Companion Display
- **Status**: ⚪ Deferred (Final Milestone)
- **Deliverables**:
  - **Local Network Pairing**: Go server exposes a local LAN interface with a one-time pairing token or terminal/UI QR code.
  - **Companion View Mode (`/?mode=companion`)**:
    - **Host Web Preview Tab**: Embedded webview displaying the application running from the workspace server, with touch-friendly refresh and navigation controls.
    - **Focus Code Editor Tab**: Distraction-free, single-buffer touch-optimized text editor allowing tablet users to edit active code files with instant synchronization to the desktop workspace.
  - **Realtime Sync Protocol**: WebSocket / SSE event bus keeping file buffers and cursor states synchronized between desktop and tablet.
- **Exit Criteria**: A developer can open AegisCode on an iPad/tablet on the same Wi-Fi, run the web application preview on the tablet, and edit code buffers with zero desktop layout corruption.
