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
| **Special** | UI Dark/Light Theme & 100% Hex Tokens | ✅ Completed | ActivityRail toggle, zero RGB tokens, ambient anti-fatigue gradients |
| **Phase 6** | Go Core Server, SQLite & Bundled DAP Debugger | 🟡 Active / Next | Cross-platform Go binary, supervisor, SQLite DB, DAP/Delve |
| **Phase 7** | Web-Based Remote Pairing & Tablet Companion | ⚪ Upcoming | LAN pairing, web preview host, touch-optimized editor mode |

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
  - Git branch checkout popover trigger.
  - Diagnostics error and warning counter linking to the Problems view.
  - Notification center badge with toast popover history.
- **Exit Criteria**: Status bar remains responsive and updates smoothly during rapid typing and editor pane switches.

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

### Special Milestone: UI Dark/Light Theme & 100% Hex Tokens
- **Status**: ✅ Completed
- **Deliverables**:
  - **ActivityRail Theme Toggle**: Interactive Sun/Moon icon toggle button above Settings with smooth rotation and toast confirmation.
  - **Strict 100% Hex Token Architecture**: Completely eliminated all hardcoded `rgb()` / `rgba()` values; standardized on Tailwind CSS v4 `@theme` Hex tokens with universal status tokens (`--color-error`, `--color-warning`, `--color-success`, `--color-info`, `--color-surface-overlay`).
  - **Anti-Fatigue Ambient Gradient**: Dual-layer ambient radial glow over linear canvas in `base.css` providing eye comfort during prolonged coding sessions.
  - **UI Design Polish**: 2px active tab accent bar, surface elevation, accent dirty dot, 13.5px / 22px code editor line height, and 11px micro-copy scale.

---

### Phase 6: Go Core Server, SQLite Storage, & Bundled DAP Debugger
- **Status**: 🟡 Active / Next (Backend Foundation)
- **Deliverables**:
  - **Live Workspace Engine**: REST endpoints for directory browsing, file CRUD, recursive regex search (content + filename matching), and workspace-wide string replacement (`/api/v1/workspace/*`).
  - **Single Cross-Platform Binary**: Go Core Server compiled for macOS (Darwin arm64/amd64), Linux, and Windows.
  - **Embedded Frontend Distribution**: Production web assets (`dist/`) embedded into the Go executable via `embed.FS` for instant zero-install distribution.
  - **Stateless/Immutable Runtime Design**: Configuration loaded immutably into memory; all user data, settings, and agent history isolated in `~/.aegis/data/aegis.db` (SQLite).
  - **Worker Supervisor**: Resilient process monitor for LSP servers and native PTY terminal shells with fail-fast crash isolation.
  - **Bundled DAP Debugger**: Integrated Debug Adapter Protocol runner with embedded/bundled Delve (`dlv`) for step-by-step Go and backend debugging directly through the AegisCode web UI.
  - **Typed TypeScript Contracts**: Automatic Go struct to TypeScript interface generation (`tygo`).
- **Exit Criteria**: Core server binary launches in under 30ms with <30MB RAM overhead, serves frontend web UI, runs native terminals, and controls debug breakpoints without external tools.

---

### Phase 7: Web-Based Remote Pairing & Tablet Companion Display
- **Status**: ⚪ Upcoming (Multi-Screen Remote)
- **Deliverables**:
  - **Local Network Pairing**: Go server exposes a local LAN interface with a one-time pairing token or terminal/UI QR code.
  - **Companion View Mode (`/?mode=companion`)**:
    - **Host Web Preview Tab**: Embedded webview displaying the application running from the workspace server, with touch-friendly refresh and navigation controls.
    - **Focus Code Editor Tab**: Distraction-free, single-buffer touch-optimized text editor allowing tablet users to edit active code files with instant synchronization to the desktop workspace.
  - **Realtime Sync Protocol**: WebSocket / SSE event bus keeping file buffers and cursor states synchronized between desktop and tablet.
- **Exit Criteria**: A developer can open AegisCode on an iPad/tablet on the same Wi-Fi, run the web application preview on the tablet, and edit code buffers with zero desktop layout corruption.
