# AegisCode Feature Assessment & Evaluation Report

> **Purpose**: Standardized scorecard and evaluation framework for assessing existing features and approving new feature proposals.  
> **Guiding Principle**: Protect the lightweight architecture, preserve local performance, and prevent over-engineering.

---

## 1. Feature Assessment Scorecard

Every proposed feature or modification must be evaluated against the following scorecard before implementation:

| Evaluation Dimension | Passing Criteria | Scoring Weight |
| :--- | :--- | :---: |
| **1. Resource Lightweightness** | Adds <5MB client memory and <2MB server memory. Zero heavy third-party runtime dependencies. | 25% |
| **2. Anti-Over-Engineering** | Implementation uses direct, idiomatic patterns. Zero unnecessary abstraction layers, DDD bloat, or excessive microservice wrappers. | 25% |
| **3. Architecture & Constraint Fit** | Adheres strictly to repo constraints: Frontend reuses Tailwind tokens and UI primitives; Backend enforces zero silent error handling and single validation paths. | 25% |
| **4. Multi-Screen / Remote Compatibility**| Does not break desktop layout and considers tablet companion synchronization (preview or focus editor). | 15% |
| **5. Verification Gate Readiness** | Can be cleanly verified using `rtk npm run build`, `rtk npm run format`, and unit/integration tests with 0 errors. | 10% |

---

## 2. Pre-Implementation Feature Gate Checklist

Before writing code for any new feature, answer and verify each of the following gate questions:

### Gate 1: Problem Definition & Simplicity
- [ ] What specific developer workflow problem does this feature solve?
- [ ] Can this problem be solved using existing layout components or Go standard library primitives?
- [ ] Does this feature introduce any external npm packages or Go modules? (If yes, justify why native code is insufficient).

### Gate 2: Frontend Constraints Check
- [ ] Does the UI introduce any arbitrary hardcoded hex color codes? (Must strictly be 0; all colors must reference `--color-*` tokens in `src/styles/tokens.css`).
- [ ] Does the UI duplicate existing buttons, tabs, popovers, or icons? (Must reuse components in `src/components/ui/`).
- [ ] Is layout CSS co-located inside the corresponding `src/components/layout/<name>/` directory?
- [ ] Is the new layout responsive and resilient on desktop viewports down to 1024px?

### Gate 3: Backend Constraints Check
- [ ] Does the Go code contain any silent error ignores (`_ = err` without handling or empty error blocks)? (Strictly forbidden).
- [ ] Does any function have nested or spaghetti error logic? (Each function must have one clear, linear validation path; return/break early on error).
- [ ] Does the feature preserve the single-binary deployment model?
- [ ] Are all persistent user states written to SQLite in `~/.aegis/data/aegis.db` and never inside the user's project codebase directory?

### Gate 4: Verification & Quality Gates
- [ ] Does `rtk npm run build` compile with 0 warnings or errors?
- [ ] Does `rtk npm run format` format all touched files cleanly?
- [ ] Are all shell commands invoked via `rtk`?

---

## 3. RFC Template for Proposing New Features

When proposing a new feature to the repository, submit a short RFC document using the template below:

```markdown
### Feature RFC: [Feature Name]

#### 1. Summary & Motivation
Brief explanation of what the feature does and the developer problem it addresses.

#### 2. Architecture Impact
- **Frontend**: Which layout folder (`src/components/layout/*`) is modified? What new UI primitives are needed?
- **Backend**: Which endpoints or Go internal packages (`internal/*`) are affected?
- **Tablet Remote**: Does this feature affect the Web Preview host or Focus Editor companion?

#### 3. Constraints Audit
- [ ] Tailwind CSS tokens verified (0 arbitrary hex colors).
- [ ] Reusable UI components verified.
- [ ] Zero silent error handling confirmed.
- [ ] Flat package layout preserved.

#### 4. Performance & Memory Impact
Estimated bundle size delta and memory footprint impact.
```

---

## 4. Phase-by-Phase Health & Architecture Review Report

This section documents the formal architectural assessment for every completed and active milestone against the [Feature Assessment Scorecard](#1-feature-assessment-scorecard).

### Global Repository Health Summary (Current Milestone)
- **Production Bundle**: Clean Vite build (~670ms) with full on-demand dynamic code splitting for specialized viewers (`ImageViewer`, `MarkdownViewer`, `PdfViewer`, `CsvViewer`, `CodeGraphShell`). Zero-RAM footprint during standard code editing.
- **CSS Token Adherence**: **100% Compliant**. Zero arbitrary hex colors or unapproved CSS variable escapes across all modules.
- **Standalone Binaries & Packaging**: **~7.5 MB** UPX-compressed standalone binary, **~3.5 MB** DMG installer, **~88 KB** native Swift Cocoa `WKWebView` wrapper (zero Electron overhead).
- **Verification Gates**: **303 Vitest frontend tests** (28 test files) + **193 Go backend tests** (14 internal packages) passing with 0 errors; code cleanly formatted and verified via `oxfmt`.

---

### Phase-by-Phase Audit Matrix

| Phase / Milestone | Lightweight (25%) | Anti-Bloat (25%) | Constraints (25%) | Multi-Screen (15%) | Verification (10%) | Total Score | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Phase 1: Shell Layout & Columns** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Phase 2: Text Editor & Buffers** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Phase 3: Explorer & Workspace CRUD** | 25/25 | 25/25 | 25/25 | 14/15 | 10/10 | **99%** | ✅ Passed |
| **Phase 4: Status Bar & Diagnostics** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Phase 5: AEGIS AI Agent Hub** | 24/25 | 25/25 | 25/25 | 15/15 | 10/10 | **99%** | ✅ Passed |
| **Special: UI Theme & Palettes** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Special: Settings Registry & Polish** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.1: Workspace Engine** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.2: Native Git & Diff** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.3: Process Supervisor/PTY** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.4: Pure-Go SQLite & App State** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.5: Bundled DAP Debugger** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.6: Single Standalone Binary** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.8: AI Providers & Models** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.9: Live 2-Way Antigravity SSE**| 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Sub-Phase 6.15: VantageCraft CodeGraph** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Phase 7.1: Multi-Viewers & Big Data CSV** | 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Phase 7.2–7.3: Vector Canvas (tldraw)** | — | — | — | — | — | **Upcoming**| ⚪ Roadmap |
| **Wave 4 & 5: Zustand Slices & Hardening**| 25/25 | 25/25 | 25/25 | 15/15 | 10/10 | **100%** | ✅ Passed |
| **Phase 8: Research & Quant Studio (v1.2)**| — | — | — | — | — | **Planned** | ⚪ Roadmap |
| **Phase 9: Remote Pairing & Tablet** | — | — | — | — | — | **Deferred**| ⚪ Roadmap |

---

### Detailed Per-Phase Evaluations

#### Phase 1: Shell Layout & Column Componentization
- **Scope**: Layout shell partitioning into 9 decoupled modules under [`src/components/layout/`](../../src/components/layout/) with atomic primitives in [`src/components/ui/`](../../src/components/ui/).
- **Lightweight & Performance**: Co-located stylesheets per module eliminate global CSS bloat and prevent style thrashing.
- **Constraints Adherence**: Standardized Tailwind CSS v4 semantic design tokens in [`tokens.css`](../../src/styles/tokens.css) (`bg-canvas`, `bg-surface`, `border-line`, `text-ink`). Zero arbitrary hex colors.
- **Verification**: Zero CSS collisions across component boundaries.

#### Phase 2: Workbench Text Editor & Interactive Buffers
- **Scope**: Dual independent editor panes (Group 1 & 2), HTML5 tab Drag-and-Drop, in-browser regex heuristic linter, and Minimap overview.
- **Lightweight & Performance**: Custom DOM buffer engine avoids heavy Monaco/CodeMirror dependencies, saving ~15MB client RAM.
- **Anti-Over-Engineering**: Direct DOM text rendering with syntax highlight overlay behind transparent input textarea overlay.
- **Constraints Adherence**: 2px active accent tab indicator bar, 13.5px / 22px typography scale, and responsive line-number gutters.
- **Verification**: Verified via [`workbenchCore.test.ts`](../../test/frontend/core/workbenchCore.test.ts) covering tab group splits and buffer state integrity.

#### Phase 3: Explorer, Workspace CRUD, & Git Controls
- **Scope**: Hierarchical directory tree, folder collapse/expand, inline CRUD modals, and VS Code parity regex search/replace.
- **Lightweight & Performance**: Virtualized-like folder depth pruning prevents deep tree DOM bloat.
- **Anti-Over-Engineering**: Zero-dependency search replace engine directly bound to Go backend search endpoint `/api/v1/workspace/search`.
- **Constraints Adherence**: Reused [`Icon`](../../src/components/ui/Icon.tsx) and [`IconButton`](../../src/components/ui/IconButton.tsx); eliminated inline SVG duplication.
- **Verification**: Tested file addition, rename, deletion, and search match extraction.

#### Phase 4: Status Bar & Diagnostics Engine
- **Scope**: Dynamic cursor tracking (`Ln X, Col Y`), language detection, interactive branch switcher ([`BranchPopover.tsx`](../../src/components/layout/status-bar/BranchPopover.tsx)), problem diagnostics counter ([`ProblemsPopover.tsx`](../../src/components/layout/status-bar/ProblemsPopover.tsx)), and Notification Center history.
- **Lightweight & Performance**: Reactive state throttling; zero continuous background poll overhead; health check ping to `/api/v1/workspace/info`.
- **Anti-Over-Engineering**: All hardcoded mock labels eliminated. Interactive space toggle directly mutates global workbench tab size.
- **Constraints Adherence**: Semantic color indicators (`--color-success`, `--color-error`, `--color-warning`).

#### Phase 5: AppDrawer AEGIS AI Agent & Session Hub
- **Scope**: Master-detail session drawer ([`ChatDrawer.tsx`](../../src/components/layout/chat/ChatDrawer.tsx)), slash command autocomplete popup (`/`), `@` file references, and streaming markdown renderer.
- **Lightweight & Performance**: Pure in-memory session reducer persisted to `localStorage` with bounded message limits.
- **Anti-Over-Engineering**: Heuristic markdown parser avoids pulling full heavyweight remark/rehype pipelines into the main bundle.
- **Multi-Screen Readiness**: Chat drawer width persists independently (`chatDrawerWidth`) without squeezing the active code viewport.

#### Special Milestone: UI Dark/Light Theme & Modular Palettes
- **Scope**: Sun/Moon theme toggle on ActivityRail, strict 100% hex token architecture, dual-layer anti-fatigue ambient background gradient in [`base.css`](../../src/styles/base.css), and modular JSON palette separation ([`default-dark.json`](../../src/themes/default-dark.json), [`atom-dark.json`](../../src/themes/atom-dark.json), [`tokyo-night-dark.json`](../../src/themes/tokyo-night-dark.json)).
- **Lightweight & Performance**: Modular palettes loaded on-demand via [`themeRegistry.ts`](../../src/themes/themeRegistry.ts); zero hardcoded RGB values.
- **Verification**: Verified theme switching and palette resolution via Vitest test suite.

#### Special Milestone: Settings Registry, Core IDE Preferences & Editor Polish
- **Scope**: Extraction of [`settingsRegistry.ts`](../../src/components/layout/settings/settingsRegistry.ts) from [`SettingsModal.tsx`](../../src/components/layout/settings/SettingsModal.tsx); complete core IDE preferences across 7 categories; dynamic TODO highlighting; GPU-accelerated caret blinking; character-width wrapping; and zero-dependency wildcard matching.
- **Lightweight & Performance**: Shrunk [`SettingsModal.tsx`](../../src/components/layout/settings/SettingsModal.tsx) by **75%** (from ~980 to ~240 lines). GPU keyframes eliminate JS render ticks for cursor blinking.
- **Anti-Over-Engineering**: Zero new npm packages. Generic [`createSettingsUpdater`](../../src/context/core/settingsCore.ts#L321) eliminates repeated reducer boilerplate.
- **Constraints Adherence**: Purged all arbitrary CSS variable classes from [`DiffEditorPane.tsx`](../../src/components/layout/editor/DiffEditorPane.tsx) and [`SourceControlPanel.tsx`](../../src/components/layout/sidebar/SourceControlPanel.tsx).
- **Verification**: Tested with 11 unit tests in [`settingsAndExplorer.test.ts`](../../test/frontend/core/settingsAndExplorer.test.ts).

#### Sub-Phase 6.1: Live Workspace Engine & File Operations (Go Backend)
- **Scope**: Direct Go backend endpoints for workspace traversal, recursive regex search, and string replacement under [`server/internal/workspace/`](../../server/internal/workspace).
- **Lightweight & Performance**: Go binary consumes <15MB idle RAM. File walking uses thread-safe buffering with path traversal guards.
- **Backend Constraints**: Zero silent error handling (`_ = err` strictly forbidden); single linear validation path per handler.
- **Verification**: Tested via Go backend integration tests.

#### Sub-Phase 6.2: Native Git CLI Synchronization & Side-by-Side Diff
- **Scope**: 17 native Go backend endpoints (`/api/v1/git/*`) communicating directly with local `git` CLI; interactive commit graph SVG; in-editor split diff pane [`DiffEditorPane.tsx`](../../src/components/layout/editor/DiffEditorPane.tsx).
- **Lightweight & Performance**: Zero fake mock fallbacks. Uses native OS git process with output buffer limits.
- **Anti-Over-Engineering**: Eliminated over-engineered popup modal overlays in favor of integrated editor tabs.
- **Verification**: End-to-end Git status, staging, unstaging, commit creation, and diff rendering verified across frontend and backend.

#### Sub-Phase 6.3–6.5: Process Supervisor, Pure-Go SQLite & Bundled DAP Debugger
- **Scope**: Native PTY terminal streaming (`creack/pty`) with cross-platform shell auto-detection (`detectDefaultShell()`), Pure-Go modernc SQLite storage engine in `~/.aegis/data/aegis.db`, and bundled Delve DAP debugger runner (`server/internal/dap`).
- **Lightweight & Performance**: Zero CGO dependencies, memory-efficient PTY output streaming over WebSockets/SSE, and non-blocking process supervisor.
- **Verification**: Verified via terminal, DAP, and store unit tests.

#### Sub-Phase 6.6: Single Standalone Binary, Embedded Frontend (`embed.FS`) & Native Desktop Window
- **Scope**: Single-binary deployment bundling React 19 production assets via Go `embed.FS` (`server/internal/web/`), dynamic port auto-binding (8080..8095), native Cocoa `WKWebView` desktop wrapper (`scripts/macos-wrapper/main.swift`, ~88 KB), fail-safe port cleanup watchdog, cross-platform UPX build matrix (`scripts/build-binary.js`), and DMG packager (`scripts/package-dmg.js`).
- **Lightweight & Performance**: Native 88 KB Swift binary completely eliminates the ~200MB+ RAM and disk bloat of Electron. Go binary compressed from ~15MB to ~7.5MB via UPX. Standalone macOS installer (`AegisCode.dmg`) weighs only ~3.5MB.
- **Anti-Over-Engineering**: Zero CGO, zero heavyweight desktop runtime frameworks (Electron/Tauri). Direct Cocoa `NSWindow` + `WKWebView` integration on macOS and Edge App Mode on Windows (`--app=`).
- **Verification**: Verified with 32 Vitest frontend unit tests, 7 Go backend test suites, and end-to-end smoke testing of DMG mount and execution.

#### Sub-Phase 6.8 & 6.9: AI Providers, Custom Models & Antigravity SSE Streaming
- **Scope**: Multi-provider support (Antigravity, Claude, OpenCode, OpenRouter), dynamic custom models registry with interactive tag chips, live SSE streaming (`POST /api/v1/ai/chat`), Thinking Process Accordion, Interactive Tool Call Action Chips, and in-flight Stop Generation button with `AbortController` watchdog.
- **Lightweight & Performance**: Streaming chunked over standard HTTP SSE; zero WebSocket handshake bloat or heavy client markdown parsers. Antigravity model list cached in-memory with a 5-minute TTL.
- **Verification**: 61 Go backend tests (9 internal packages) and 45 Vitest frontend tests passing with 0 errors.

#### Sub-Phase 6.15: VantageCraft CodeGraph 6-View Studio & MCP Integration
- **Scope**: Integration with native CodeGraph CLI reverse proxy (`/api/codegraph/ui/*`) and 6-view layout (`CodeGraphShell.tsx` hosting Entrypoints, Steps, Map, Flow, Screens, FileCode Drawer).
- **Lightweight & Performance**: Loaded on-demand strictly via `React.lazy()` when opening a graph tab, maintaining 0 MB RAM overhead during normal code editing.
- **Verification**: Verified via `codegraphApi.ts` integration tests and Go proxy handler tests.

#### Phase 7.1: Multi-Viewer Engine & Native Big Data CSV Engine
- **Scope**: Universal on-demand code splitting for non-code viewers (`ImageViewer`, `MarkdownViewer`, `PdfViewer`, `CsvViewer`). Native Go Big Data CSV query engine with RFC 4180 row offset indexer evaluating 590,000+ rows in 770ms using only ~4.7 MB RAM.
- **Lightweight & Performance**: Eliminates multi-gigabyte browser heap crashes on massive datasets by slicing columns server-side and seeking offsets in sub-millisecond time.
- **Verification**: Verified via `csv_test.go` benchmarks and Vitest viewer tests.

#### Wave 4 & 5: Modular Zustand Slices & Concurrency Hardening
- **Scope**: Complete purge of monolithic facade files (`editorCore.ts`, `settingsCore.ts`, `workspaceCore.ts`) and legacy hooks. Migration of all frontend state to 9 modular Zustand slices (`src/store/slices/`). Elimination of dead Go backend endpoints and migration of logs to Unified `EventHub` (`/api/v1/events`). Hardened buffer concurrency with in-flight save keystroke preservation (`OPT-BUF-01`), 800ms self-save watcher echo suppression (`OPT-BUF-02`), and per-file monotonic fetch sequence tokens (`OPT-BUF-05`).
- **Verification**: 303 Vitest frontend tests across 28 test files and 193 Go backend tests across 14 packages passing with 0 errors.

#### Phase 8: Research Workshop & Quantitative Research Studio (Planned / Milestone v1.2)
- **Scope**: LaTeX Studio with tectonic / pdflatex CLI supervisor, live SyncTeX bidirectional PDF.js navigation, BibTeX reference manager, and Python/R DataFrame visualizer with PLS-SEM and Biblioshiny iframe sandboxing.

#### Phase 9: Web-Based Remote Pairing & Tablet Companion Display (Deferred / Final Milestone)
- **Scope**: Local network pairing (mDNS / pairing PIN), Web Preview host tab, and touch-optimized distraction-free Focus Editor tab (`/?mode=companion`).

---

## 5. Deprecated & Legacy Feature Audits (Historical Archive)

> **Notice**: The features, architectures, and endpoints listed below have been deprecated or decommissioned in accordance with the Anti-Over-Engineering and Resource Lightweightness guidelines.

### A. Decommissioned Frontend Core Facades & Context Hooks
- **Monolithic Context Facades (`src/context/`)**:
  - `editorCore.ts`, `settingsCore.ts`, `workspaceCore.ts`: Monolithic multi-thousand-line state wrappers containing coupled mutations and redundant re-render loops. Purged in Wave 4 in favor of modular Zustand slices (`createEditorSlice`, `createWorkspaceSlice`, `createSettingsSlice`).
  - `useChatCore`, `useGitCore`, `useLayoutCore`, `useTerminalCore`: Legacy context hooks inducing unnecessary component re-renders. Replaced with selective Zustand hooks (`useWorkbenchStore`).

### B. Decommissioned Fragmented SSE Streams (ADR 0016)
- **Standalone Streams**: `/api/v1/events/workspace`, `/api/v1/events/logs`, `/api/v1/events/workers`, `/api/v1/events/debug`, `/api/v1/events/lsp`.
- **Reason**: Consumed 5 of the 6 available HTTP/1.1 sockets in modern web browsers, causing starvation and blocking REST requests.
- **Replacement**: Unified Go `EventHub` multiplexer (`GET /api/v1/events`) serving all event topics over a single persistent connection.

### C. Decommissioned Cytoscape.js Flat Graph Viewer (ADR 0014)
- **Legacy Flat Canvas (`GraphViewer.tsx`)**: Cytoscape.js canvas rendering flat node-link graphs from recursive SQLite CTE queries (`/api/v1/codegraph/neighborhood`).
- **Reason**: Inefficient recursive CTE queries, lack of framework/screen hierarchy, and excessive DOM/canvas memory usage.
- **Replacement**: VantageCraft 6-View Studio (`CodeGraphShell.tsx`) utilizing native CodeGraph reverse proxying (`/api/codegraph/ui/*`).

### D. Decommissioned Backend REST Endpoints (Wave 5 / MP-5.1)
- `/api/v1/auth/handshake`: Redundant auth stub, replaced by direct pairing token headers.
- `/api/v1/pairing/info`: Unreferenced standalone endpoint.
- `/api/v1/mcp/rpc`: Duplicate alias of `/api/v1/mcp`.
- `/api/v1/mcp/events`: Unused standalone MCP SSE stream.
- `/api/v1/codegraph/init`: Deprecated index initialization route.
- `/api/codegraph/entrypoints`: Unversioned duplicate route removed in favor of `/api/v1/codegraph/entrypoints`.


