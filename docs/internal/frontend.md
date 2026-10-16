# AegisCode Frontend UI Design Reference

> **Purpose**: Single source of truth for the active UI design and visual layout structure.  
> **Rule**: Must be updated whenever visual components, layout regions, or styling paradigms change.  
> **Design Principles**: Reusable Tailwind tokens, reusable UI components, zero arbitrary hex codes in components, lightweight modular layouts, universal on-demand code-splitting architecture for future non-code viewers (.canvas, .pdf, .csv, .xls, .svg, .png, .jpg, .md).
> **Universal On-Demand Code Splitting Rule (Architectural Constraint for Viewers)**: Non-code viewer panes (e.g. `@tldraw/tldraw` for `.canvas`/`.design`, PDF preview for `.pdf`, Tabular spreadsheet for `.csv`/`.tsv`/`.xls`/`.xlsx`, and Media Pan-Zoom for `.png`/`.jpg`/`.svg`/`.webp`) are planned extensions that MUST NEVER be imported into the main initial bundle. When implemented, they must be loaded strictly via `React.lazy()` / dynamic `import()` on-demand when the user opens a matching file extension, keeping the main IDE bundle lightweight.

---

## 1. Master Layout Shell & Wireframe Structure

The AegisCode interface utilizes a multi-column, multi-panel desktop shell (`.app-shell`) structured via flexbox and CSS grid with drag-resizable sashes:

```
+----------------------------------------------------------------------------------------------------+
|  HEADER BAR (Window Controls, App Menu, Global Search ⌘K, Layout Toggles, Companion QR)            |
+---+----------------------+----------------------------------------------+--------------------------+
| A | SIDEBAR              | WORKBENCH CODE EDITOR                        | AEGIS AI AGENT DRAWER    |
| C |                      |                                              |                          |
| T | - Explorer (CRUD)    | [EditorTabs: Group 1]   [EditorTabs: Group 2]| - Session Master List    |
| I | - Git Source Control | [EditorBreadcrumbs]                          | - Streaming Message View |
| V | - Search & Replace   | [CodePane + Gutter]                          | - Autocomplete (/ & @)   |
| I |                      | [Minimap]                                    | - Model Selector         |
| T |                      +----------------------------------------------+                          |
| Y |                      | BOTTOM PANEL (Expanded: 180px / Dock: 28px)  |                          |
|   |                      | [Terminal] [Problems] [Output] [Debug]       |                          |
| R |                      | [Persistent PTY / Dynamic Dark-Light Canvas] |                          |
+---+----------------------+----------------------------------------------+--------------------------+
|  STATUS BAR (Cursor Position Ln/Col, Active Language, Git Branch, Notification Center)            |
+----------------------------------------------------------------------------------------------------+
```

### Shell Grid Columns & Responsive Sashes

The desktop shell (`.workspace`) distributes columns dynamically according to panel states with CSS grid and inline CSS variables (`--sidebar-width`, `--chat-width`):
- **Default open**: `44px var(--sidebar-width, 260px) minmax(0, 1fr) var(--chat-width, 340px)`
- **Chat expanded with sessions**: `44px var(--sidebar-width, 260px) minmax(0, 1fr) var(--chat-width, 500px)`

| Layout Region | Default Dimension | Minimum Dimension | Maximum Dimension | Auto-Collapse Threshold | Reopen Restores |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Activity Rail** | 44px (width) | 44px | 44px | N/A (permanent) | Permanent |
| **Primary Sidebar** | 260px (width) | 220px | 460px | Drag < 160px | Last width or 260px |
| **Workbench Editor** | `minmax(0, 1fr)` | 320px (target) | Viewport-bound | N/A | Flexible |
| **Chat Drawer (Normal)** | 340px (width) | 300px | 600px | Drag < 180px | Last width or 340px |
| **Chat Drawer (+Sessions)**| 500px (width) | 480px | 600px | Drag < 320px | Last width or 500px |
| **Bottom Panel (Open)** | 180px (height) | 100px (height) | 800px (height) | Drag < 80px (collapses to dock) | Last height or 180px |
| **Bottom Panel (Dock)** | 28px (height) | 28px (height) | 28px (height) | N/A (click tab/expand to open) | Opens last active tab |

---

## 2. Layout Modules (by Folder)

All layout modules live in [`src/components/layout/`](../../src/components/layout) with co-located CSS files and self-contained sub-components:

### 1. Header (`header/`)
- **Path**: [`src/components/layout/header/`](../../src/components/layout/header)
- **Primary Components**: `Header.tsx`, `WindowControls.tsx`, `AppMenu.tsx`, `GlobalSearchButton.tsx`, `HeaderActions.tsx`, `header.css`
- **Visual Design & Grid Layout**:
  - Balanced 3-column CSS Grid (`grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)`) with symmetric `padding: 0 12px;` guaranteeing exact mathematical 50% midpoint centering for the search bar regardless of asymmetric left/right header controls.
  - Left column: macOS-style traffic light window controls (red/yellow/green) with hover icons, Aegis branding badge, and dropdown application menu (File, Edit, View, Run, Terminal, Help).
  - Center column: Unified search bar container (`.header-search-container`, constrained to 300px width). Functions as quick launcher button when idle and live search input when active (`command-search-active`), showing active workspace context, shortcut badge (`⌘K` / `Ctrl+K`), and `Esc` close button.
  - Right column: Header action buttons aligned to end (`justify-self: end`): toggle primary sidebar (`Ctrl+B`, `sidebar-left`), toggle bottom panel (`Ctrl+J`, `panel`), and toggle AI chat drawer (`sidebar-right`).
  - Responsive collapse: switches to `grid-template-columns: auto 1fr auto` on mobile/narrow viewports (`<= 680px`), collapsing idle search into a 32px icon button.
- **Tokens Used**: `bg-surface`, `border-line`, `text-ink`, `text-ink-muted`, `color-accent`.

### 2. Activity Rail (`activity-rail/`)
- **Path**: [`src/components/layout/activity-rail/`](../../src/components/layout/activity-rail)
- **Primary Components**: `ActivityRail.tsx`, `activity-rail.css`
- **Visual Design**:
  - Slim 44px vertical rail on the left border (matching `.workspace` 44px grid column).
  - Top action group: Explorer icon, Search icon, Source Control Git icon.
  - Bottom action group:
    - **Theme Toggle Button**: Interactive toggle button with dynamic `sun` (in Dark mode) and `moon` (in Light mode) icon with 20° rotation hover transition and instant toast notification.
    - Settings gear icon (`⌘,`).
  - Active indicator pill on left edge with accent coloring (`bg-accent`).

### 3. Sidebar (`sidebar/`)
- **Path**: [`src/components/layout/sidebar/`](../../src/components/layout/sidebar)
- **Primary Components**: `Sidebar.tsx`, `ExplorerPanel.tsx`, `SearchPanel.tsx`, `SourceControlPanel.tsx`, `DebugSidePanel.tsx`, `sidebar.css`
  - **Visual Design & Responsive Architecture**:
  - **Run & Debug Panel (`DebugSidePanel.tsx`)**:
    - **Session Controls Header**: Displays current session status badge (`idle`, `running`, `paused: reason`), detected target file (`.go`, `.py`, `.cpp`), and quick Start Debugging (`F5`) / Pause / Continue / Stop controls.
    - **Vertical Accordions (VS Code Standard)**:
      - **Variables**: Collapsible accordion displaying in-scope variables with names in accent color, types, values, and interactive click-to-expand toggling between truncated and full text.
      - **Call Stack**: Collapsible accordion displaying active stack frames with clickable file and line links that immediately navigate editor panes and set active debug line.
      - **Breakpoints**: Collapsible accordion listing active breakpoints (`file.go:line`), with one-click navigation to editor lines (`openFileInGroup`), individual breakpoint delete hover action, and "Clear All Breakpoints" action in the section title bar.
  - **Sidebar Shell & Header Actions (`Sidebar.tsx`)**:
    - Outer title bar dynamically hidden for Source Control, and header action `<IconButton>` elements wired to `refreshWorkspace()` and custom event `aegis:explorer-collapse-all`.
  - **Dimensions & Drag Sash**: Default width **260px**, minimum width **220px**, maximum width **460px** bounded by an interactive vertical drag sash (`ResizeSash.tsx`). Uses a cumulative mouse movement ref (`dragWidthRef`) starting from `onResizeStart` to ensure reliable continuous drag tracking without clamp traps.
  - **Auto-Collapse**: Dragging the sash leftwards below the threshold (**< 160px**) automatically triggers an instant collapse (`setSidebarOpen(false)`). Reopening the sidebar via Activity Rail or shortcut (`Ctrl+B`) smoothly restores the previous valid width (or default 260px).
  - **Explorer Panel**:
    - Inline CRUD supporting arbitrary parent folders (`${cleanParent}/${name}`), folder context menus, protected by `isSubmittingRef` to prevent blur/enter race conditions.
    - "OPEN EDITORS" section with "Close All Editors" button (safeguarding dirty buffers via confirmation modal) and group-level close buttons when split.
    - Workspace file tree with folder expansion, tree guides, hidden file visibility toggle, inline CRUD actions (New File, New Folder, Rename, safe Delete confirmation modal), Refresh Explorer, and Collapse Folders in Explorer (`collapse-all`).
    - **Deterministic Ordering**: Folders always render at the top, followed by files, sorted alphabetically (case-insensitive A-Z) across root and all nested subdirectories.
    - **Dedicated Smooth Scrolling**: Dedicated flex container with `overflow-y: auto` ensuring smooth vertical scrolling on large workspaces.
  - **Source Control Panel**:
    - Staged & unstaged changes tree with diff viewer launching.
    - Commit history with graphical DAG timeline lines.
    - Interactive scrollable list of all workspace `gitBranches` with active branch indicator and one-click branch checkout.
    - AI commit message draft generation populated with detailed lists of staged and unstaged file paths.
    - **Commit Checkout ("Call Back")**: Quick checkout action to inspect or switch working copy directly to any commit hash (detached HEAD).
    - **Hash-to-Hash Comparison**: Dedicated commit comparison mode (`base` ↔ `target`) displaying changed files list and launching side-by-side / unified diffs between arbitrary commits.
    - **VS Code Standard Git Status Badges**: Fast, non-blocking Git status decorations in the file tree: right-aligned status letter badges (`M` modified in `text-warning`, `U`/`A` untracked/added in `text-success`, `D` deleted in `text-error`, `R` renamed in `text-accent`) on files, and subtle indicator dots (`bg-accent`) on ancestor folders containing modified files computed via `buildExplorerGitDecorations`.
    - Context menu on right-click (Copy Path, Copy Relative Path, Delete, Rename).
  - **Search Panel**:
    - Scrollable search results with flex layout (`flex: 1; min-height: 0; overflow-y: auto;` in `sidebar.css`), and clicking search match rows dispatches `aegis:editor-goto-line` with `{ file, line, col }`.
    - **Compact Input & Modifiers**: Input placeholder shortened to `Search files... (regex)` to preserve readability on narrow 220px widths. Search modifiers (`Aa`, `\b`, `.*`) and clear button (`✕`) are shielded with `flex-shrink: 0`.
    - **Integrated Search & Replace Box**: Chevron toggle (`>` / `v`) located directly to the left of the Search input box; when expanded, renders the Replace input box directly beneath with an embedded Replace All action icon button (`Icon name="replace-all"`).
    - **Results Toolbar**: Header actions for Refresh Search (`⟳`), Clear Results (`✕`), and Collapse/Expand All (`⊞`).
    - **Match Keyword Highlighting**: Matched terms inside code snippets highlighted with semantic token `--color-warning-soft` / `--color-warning` (`.match-highlight`).
    - **Hover-Only File & Match Actions**: Count badges displayed by default; Replace in File (`[edit]`), Dismiss File (`[✕]`), and Replace Match (`[edit]`) action buttons revealed dynamically on row hover (`:hover`) with `flex-shrink: 0` to prevent layout breaking.
    - **Clean Directory Path & Filename Truncation**: Filename and subfolder paths use `min-width: 0` with ellipsis truncation and native `title` tooltips for full path inspection.
    - **Direct Backend Engine**: Live workspace regex search and granular replace (single occurrence, file-level, workspace-wide) backed directly by Go server API with immediate search result refresh.
  - **Source Control Panel**:
    - **Header & Action Menu**: Action bar with Refresh Git status (`⟳`) and '...' menu (Pull, Push, Fetch & Sync, Create Tag, Push Tags, Add Remote).
    - **Repositories Section**: Displays active repository folder, responsive branch badge pill (constrained to `max-w-[110px]` with ellipsis and full tooltip), and live Sync button with ahead/behind counters (`↓behind ↑ahead`).
    - **Commit Box**: Compact multi-line input with `Message (⌘Enter to commit)` placeholder, contextual branch tooltip, `⌘Enter` / `Ctrl+Enter` commit dispatch, and AI commit message draft generator (`sparkle` icon).
    - **Responsive Split Commit Button**: Full-width container with primary Commit button, vertical dividing line, and chevron dropdown (`Commit`, `Commit & Push`) styled to prevent horizontal scroll at 220px.
    - **Changes & Staged Changes**: Collapsible lists with granular file status codes (`M` modified, `A` added, `D` deleted, `U` untracked), additions/deletions counts, `min-w-0` file path truncation with full path tooltips, and hover action buttons for Stage (`+`), Unstage (`-`), and Discard (`⎌`).
    - **Interactive SVG Commit Graph**: Visual commit log with clickable branch pills (clicking switches branch via `checkoutBranch`), tag badges, author, and timestamp.
    - **Dynamic Git Profile Footer**: Reads real user profile directly from `git config user.name`/`user.email` without hardcoding.
    - **Zero Fake Fallback Empty States**: Clean "Initialize Repository" and "No Folder Open" guide screens when no Git repo or folder is loaded.
    - **Conflict Marker Detection & Commit Guard**: Automatic detection of Git merge conflict markers (`<<<<<<< HEAD`, `=======`, `>>>>>>>`) across open buffers and unmerged files (`code === "U"`). Renders a warning banner above the commit input, disables the Commit button and dropdown options, intercepts `⌘Enter` shortcuts with alert toasts, and displays a yellow `CONFLICT` badge on editor tabs.
    - **Unified Diff Smooth Scrolling**: CodeMirror unified merge view configured without collapsing unchanged lines, rendered in a 100% height container with full vertical and horizontal scrolling matching split view behavior.

### 4. Workbench Text Editor (`editor/`)
- **Path**: [`src/components/layout/editor/`](../../src/components/layout/editor)
- **Primary Components**: `Editor.tsx`, `EditorTabs.tsx`, `EditorBreadcrumbs.tsx`, `CodePane.tsx`, `DiffEditorPane.tsx`, `Minimap.tsx`, `EditorFindWidget.tsx`, `DiagnosticHoverCard.tsx`, `editor.css`
- **Tab View Specialized Viewers Sub-module (`editor/viewers/`)**: `ViewerPane.tsx`, `ImageViewer.tsx`, `MarkdownViewer.tsx`, `PdfViewer.tsx`, `CsvViewer.tsx`, `viewerTypes.ts`, `viewers.css`
- **Visual Design**:
  - **Dual Window Groups (Split Pane)**: Group 1 and Group 2 side-by-side or stacked, divided by a draggable splitter sash.
  - **Editor Tabs**: Tab bar supporting drag-and-drop (HTML5 native DND) between groups, dirty unsaved indicator dot, close button.
    - **Pinned Tab Persistence**: Pinned tabs are centralized in Zustand `createEditorSlice.ts` (`pinnedTabs: Set<string>`), persisted across sessions in `localStorage` (`aegis_pinned_tabs`), and filtered out from batch close operations ("Close Others", "Close All").
    - **Canonical POSIX-Relative Buffer Indexing**: Single canonical POSIX-relative key indexing (`clean`), JIT (Just-In-Time) on-demand background tab loading, explicit `BufferStatus` (`idle` | `loading` | `ready` | `error`) with loading skeleton UI in `CodePane.tsx` (preventing blank string mounting that causes false Outline errors), and `workspaceEpoch` stale request guards.
    - **Contextual Tab Icons**: Displays semantic file icons dynamically (`image` for PNG/JPG/SVG, `table` for CSV/TSV, `git` for diff tabs, `trash` for deleted files, `code` for source files).
    - **Git Diff Tab Integration**: Special diff tab format (`git-diff:<file>?staged=true...`) parsed via [`src/utils/gitDiffTab.ts`](../../src/utils/gitDiffTab.ts), rendering Git branch icon and semantic titles (`file (Working Tree)`, `file (Index)`, `file (commit)`).
  - **Universal On-Demand Code Splitting for Non-Code Viewers (`ViewerPane.tsx`)**:
    - Specialized tab viewers (`ImageViewer`, `MarkdownViewer`, `PdfViewer`, `CsvViewer`) are partitioned into isolated asynchronous chunks via `React.lazy()` and dynamic `import()`.
    - Wrapped in `<Suspense fallback={<ViewerSkeleton />}>` with zero footprint during standard code editing.
  - **Dynamic Pan-Zoom Image Viewer (`ImageViewer.tsx`)**:
    - Displays static image centered with natural aspect ratio on initial load.
    - Seamlessly transitions to dynamic pan & zoom via mouse wheel and pointer dragging with `setPointerCapture`.
    - Clamped constraints: min zoom 0.1x (10%), max zoom 25.0x (2500%), and container bounding box clamping preventing coordinate runaway and infinite loops.
    - Toolbar controls: Zoom In, Zoom Out, Fit to Window, 1:1 Reset, Checkerboard Transparency Grid toggle, Dimensions ($W \times H$) and file size badges, and "Edit SVG XML" mode toggle for `.svg` files.
  - **Markdown Live Preview & Enhanced Toolbar (`MarkdownViewer.tsx`)**:
    - Real-time reactive preview subscribing to `fileBuffers[filename]`. Debounced sanitization (150ms) prevents AST thrashing and DOM infinite loops during fast keystrokes.
    - **Anti-Big-O Synchronized Scrolling**: Dual-pane scroll synchronization utilizing a single-source mutex lock (`isSyncingScroll`) and 4px threshold delta guard, completely eliminating infinite scroll ping-pong feedback loops.
    - **Markdown Enhanced Toolbar**: Embedded top toolbar with quick formatting actions (Bold `**`, Italic `*`, H2, H3, Lists, Tasks `- [ ]`, Hyperlinks, Tables, Code Blocks, Blockquotes) operating cleanly on editor buffers.
    - **3-Mode Switcher**: One-click toggling between `Code` (Editor only), `Split` (Side-by-side with draggable splitter), and `Preview` (Rendered preview only).
  - **Lightweight PDF.js Document Viewer (`PdfViewer.tsx`)**:
    - On-demand `pdfjs-dist` integration streaming pages from Go backend (`GET /api/v1/workspace/file/raw`) supporting HTTP `Range` headers.
    - **Virtualized Page-by-Page Rendering**: Only active page is rendered onto HTML5 canvas, preventing $O(N)$ canvas memory exhaustion on multi-hundred-page documents.
    - **Clamped Zoom & In-Flight Cancellation**: Zoom range 50% to 300% (0.25 steps) with active render task cancellation (`renderTask.cancel()`) preventing race condition collisions.
    - **Dual-Engine Toggle**: One-click switch between custom Canvas view and browser native `<iframe />` embed.
  - **Data Table CSV Viewer (`CsvViewer.tsx`)**:
    - **Server-Side Windowed Streaming**: Integrates with Go Server-Side Windowed Streaming (`/api/v1/workspace/csv/query`) for any non-trivial dataset ($\ge 2\text{ MB}$ or $> 100$ rows) with seamless client-side pagination.
    - Delimiter auto-detection (comma `,`, semicolon `;`, tab `\t`) with manual delimiter selector override.
    - Robust RFC 4180 parsing supporting quoted fields with embedded delimiters, newlines, and escaped quotes (`""`).
    - **Rebatching & Pagination for Large Tables (> 100 rows)**: Batch pagination (50, 100, 250, 500 rows per page) keeping DOM lightweight even on 10,000+ row datasets.
    - Sticky headers with column letters (A, B, C...) and interactive sorting (numeric and alphabetical).
    - Sticky row numbers column (1, 2, 3...).
    - Real-time search filter across all cells, text wrap toggle (`Wrap` vs `Truncate`), and `[Table | Raw Text]` mode switcher.
  - **In-Editor Side-by-Side Git Diff (`DiffEditorPane.tsx`)**:
    - **Primary Review Gate for AI Code Generation (Sub-Phase 6.10)**: When users click `[Apply to Editor]` on chat code blocks, changes write to disk and automatically open side-by-side in `DiffEditorPane.tsx` without redundant temporary buffers. Users accept via native **Stage** / **Commit** or reject via native **Discard Changes** (with automatic buffer resynchronization to clean HEAD).
    - **Left Pane (Original)**: Read-only display of HEAD or previous commit revision with red background diff highlights. Synthesizes empty `/dev/null` diff for untracked / newly created files.
    - **Right Pane (Modified)**: Live-editable buffer connected directly to `fileBuffers` (when viewing working copy), saveable via `⌘S` / `Ctrl+S`, with green background diff highlights.
    - **Synchronized Scrolling**: Dual-pane vertical and horizontal scroll synchronization with unmount state cleanup to prevent memory leaks.
    - **Diff Toolbar**: File path, additions/deletions stats, "Open in Normal Editor", "Stage / Unstage", and "Discard" actions.
  - **Editor Breadcrumbs**: Clean path navigation bar (`src > components > layout > editor > Editor.tsx`). Displays `diff > [git] file (Working Tree)` when a diff tab is active.
    - **Standardized Navigation Contract**: Breadcrumb navigation strictly emits standard `{ file, line, col: 1 }` on `aegis:editor-goto-line`.
  - **Editor Context Menu & Selection Bridge (`EditorContextMenu.tsx`)**:
    - **Ask AEGIS AI Bridge**: Directly activates `setChatOpen(true)` and bridges highlighted text into the active session's context chips.
  - **Code Pane**: Lightweight custom buffer editor with line numbers, active line highlight, auto-indentation, and syntax highlighting via semantic token parser.
  - **Inline Find Widget**: Floating widget in top-right corner (`Ctrl+F`) with match count and Next/Previous navigation.
  - **Minimap (`Minimap.tsx`)**:
    - **Fast-Lane Web Worker Tokenizer**: Fast Lane Web Worker tokenization (`tokenizerTask.ts` via `WorkerBroker`) with instant visual skeleton bars during fast scroll.
    - Scaled visual overview on the right edge of the editor buffer with click-to-scroll viewport box.
  - **Heuristic Linter (`WorkbenchLifecycle.ts`)**:
    - **Batch-Lane Web Worker Syntax Validation**: Offloads syntax validation to Batch Lane Web Worker (`linterTask.ts` via `WorkerBroker`) debounced at 300ms with `AbortController` cancellation.
  - **VantageCraft CodeGraph Studio (`src/components/codegraph/`, ADR 0014 & ADR 0015)**:
    - **Modular 6-View Architecture (`CodeGraphShell.tsx`)**:
      1. **Entrypoints / Program View (`EntrypointsView.tsx`)**: Framework-aware catalog of HTTP routes, CLI commands, scripts, and background jobs.
      2. **Execution Steps View (`StepsView.tsx`)**: Execution spine tree with architectural tiers (`Handler` $\rightarrow$ `Service` $\rightarrow$ `Repo` $\rightarrow$ `DB`), branch conditions, side effects, and symbol selector (eliminating fragile hardcoded `main` fallbacks).
      3. **Architecture Map View (`ArchitectureMapView.tsx`)**: Macro package/folder compound graph with reference thickness.
      4. **Directed Flow & Trails View (`FlowTrailsView.tsx`)**: 3-column blast radius (Callers $\rightarrow$ Target $\rightarrow$ Callees) and shortest-path call trails.
      5. **Screens & Events View (`ScreensEventsView.tsx`)**: UI component hierarchies linked to user interactions and backend handlers; properly handles non-routed codebases (`routed: false`, `screens: []`).
      6. **FileCode Drawer (`FileCodeDrawer.tsx`)**: Bounded source viewer with syntax highlighting and direct jump-to-line integration with `CMEditor.tsx`.
    - **Native API Service & Workspace Propagation (`src/services/codegraphApi.ts`)**:
      - Binds directly to the Go reverse proxy (`/api/codegraph/ui/*` and `/api/codegraph/entrypoints`).
      - Propagates active workspace root path (`workspace`) across all queries.
      - Adopts native stats keys (`stats.graph.nodes`, `stats.graph.edges`, `stats.graph.files`).
    - **Strict Zero-Swallow Error Policy (`ADR-0015`)**:
      - Client services never swallow errors with `catch { return null }` or return silent empty fallbacks.
      - Non-200 responses bubble up typed errors and surface actionable alert cards with retry and re-index triggers.
    - **Universal On-Demand Code Splitting**:
      - Loaded strictly via `React.lazy()` / dynamic `import()` when a `codegraph:*` or `graph` tab is active, maintaining 0 KB / 0 MB overhead during standard text editing.

### 5. Bottom Panel (`bottom-panel/`)
- **Path**: [`src/components/layout/bottom-panel/`](../../src/components/layout/bottom-panel)
- **Primary Components**: `BottomPanel.tsx`, `TerminalView.tsx`, `ProblemsView.tsx`, `OutputView.tsx`, `DebugConsoleView.tsx`, `bottom-panel.css`
- **Visual Design & Interactive Architecture**:
  - **VS Code-Style Hide / Minimize**: Tombol close `[x]` pada header panel atau pintasan keyboard `Ctrl+J` hanya menyembunyikan (*hide / minimize*) drawer ke mini dock strip permanen 28px di atas Status Bar, tanpa mematikan proses PTY shell atau memutuskan koneksi SSE.
  - **Interactive 28px Mini Dock Strip (`.bottom-panel-dock`)**: Saat panel diminimalkan, strip 28px menampilkan tab-tab interaktif (`Terminal`, `Problems`, `Output`, `Debug Console`), badge hitungan diagnostik, status live runner (`SSE active`), dan tombol expand `chevron-up`. Mengklik tab manapun langsung membuka kembali panel ke tab tersebut.
  - **DOM-Persistent Terminal Architecture**: `<BottomPanel />` selalu terpasang di DOM dan merender `<TerminalView />` dengan CSS `style={{ display: panelOpen ? undefined : "none" }}`. Ini menjamin xterm instance dan SSE EventSource tidak pernah ter-unmount, tidak reconnect, dan mempertahankan live output streaming 100% tanpa jeda (0ms lag).
  - **Dynamic Theme Re-Hydration**: Hook sinkronisasi reaktif `useEffect([theme, themePalette])` di `TerminalView.tsx` mengeksekusi `term.options.theme = getDynamicTerminalTheme(palette, mode)` secara instan (0ms snap) dengan palet hex konkret dan kontras warna ANSI yang tepat, sehingga canvas xterm langsung berganti warna seketika saat tema beralih antara Dark, Light, Atom One, dan Tokyo Night.
  - **Standardized Canvas Background**: Seluruh area konten panel bawah (`.bottom-panel-content`, `.terminal-session`, `.lint-output`, `.problems-container`, `DebugConsoleView`) menggunakan background canvas (`var(--color-canvas)` / `bg-canvas`) dengan teks `var(--color-ink)`, sementara header tab panel dan mini dock strip tetap menggunakan `var(--color-surface)` untuk memisahkan chrome dan konten secara elegan.
  - **Refreshed Toolbar Actions**:
    - **Session Shell Selector**: Cross-platform shell selector supporting host OS defaults (`detectDefaultShell()`), including `zsh`, `bash`, `fish`, `sh` on Unix and `pwsh`, `powershell`, `cmd` on Windows.
    - **New Session (`+`)**: Membuat sesi terminal baru via `createTerminalSession`.
    - **Kill Session (`trash` 🗑)**: Menghentikan proses dan menghapus sesi terminal via `closeTerminalSession`.
    - **Clear Buffer (`discard`)**: Mengosongkan buffer output xterm via `clearTerminal`.
    - **Restart Session (`refresh` ⟳ / `play` ▶)**: Me-restart proses shell baru via `restartTerminalSession`.
    - **Maximize/Restore (`maximize` / `chevron-down`)**: Toggle ukuran penuh panel (1fr).
    - **Hide Panel (`close` ✕)**: Menyembunyikan drawer ke mini dock strip (`setPanelOpen(false)`).
  - **Problems View**: Tabel diagnostik dengan filter chip (All, Errors, Warnings), jump-to-code saat baris diklik, dan tombol "Ask AI" untuk integrasi langsung ke AI chat drawer.
  - **Output View**: Pilihan channel (Server, Tasks, Linter, Git) dengan streaming log real-time melalui SSE event hub (`WorkbenchEventHub`). Channels diinisialisasi bersih `{ Server: [], Linter: [], Tasks: [], Git: [] }` dan diisi langsung dari backend log stream.
  - **Debug Console View (`DebugConsoleView.tsx`)**: Menggantikan tampilan debug lama sesuai standar VS Code. Menampilkan streaming real-time event log DAP (`stdout`, `stderr`, lifecycle events), filter teks, tombol copy dan clear console, serta baris interactive REPL input (`> `) di bagian bawah untuk evaluasi ekspresi menggunakan scope variables (`debugState.variables`) dan live DAP evaluation.

### 6. AEGIS AI Agent Drawer (`chat/`)
- **Path**: [`src/components/layout/chat/`](../../src/components/layout/chat)
- **Primary Components**: `ChatDrawer.tsx`, `ChatHeader.tsx`, `ChatSessionSidebar.tsx`, `ChatMessageList.tsx`, `MarkdownRenderer.tsx`, `MermaidBlock.tsx`, `MermaidPreviewModal.tsx`, `useSmoothStream.ts`, `ChatSuggestions.tsx`, `ChatComposer.tsx`, `ChatCommandPopover.tsx`, `ChatProviderSelect.tsx`, `CopilotInitBanner.tsx`, `CopilotInitModal.tsx`, `ChatWaveStepper.tsx`, `chat.css`
- **Visual Design & Responsive Architecture**:
  - **Flexbox Column Layout & Anti-Overlap Stacking (`.chat-main-pane`, `chat.css`)**:
    - Replaced rigid 3-row CSS Grid with a resilient, dynamic Flexbox column (`display: flex; flex-direction: column; height: 100%; min-width: 0; overflow: hidden;`).
    - Configured `.messages` with `flex: 1 1 0%; min-height: 0; overflow-y: auto;` guaranteeing it naturally occupies all remaining vertical space and scrolls smoothly.
    - Explicitly locked `shrink-0` / `flex-shrink: 0;` on `.chat-header` (49px), `<CopilotInitBanner />`, `<ChatWaveStepper />`, `aiTrace` banner, and `.composer-wrapper` to prevent vertical squishing, clipping, or overlapping between dynamic banners.
  - **Dual Dimension Modes & Drag Sash**: Resized along the left sash (`ResizeSash.tsx`) using cumulative drag tracking (`dragWidthRef`):
    - **Normal Mode (Sessions closed)**: Default width **340px**, minimum width **300px**, maximum width **600px**, auto-collapse threshold **< 180px**.
    - **Expanded Mode (Sessions open)**: Default width **500px**, minimum width **480px**, maximum width **600px**, auto-collapse threshold **< 320px**.
  - **Dynamic Width & State Memory**: Clicking the Session History toggle (`toggleChatSessions`) preserves the current normal chat width and auto-expands the drawer to 500px (or last expanded width). Closing the session history restores the exact previous normal width.
  - **3-Tier Adaptive Viewport Observer (`layoutCore.ts`)**:
    Enforces usable workspace bounds for the editor buffer across viewports:
    1. **Mobile Breakpoint (`< 768px`)**: Auto-collapses Primary Sidebar (`setSidebarOpen(false)`).
    2. **Compact Viewport Breakpoint (`< 980px`)**: Auto-collapses Chat Drawer (`setChatOpen(false)`).
    3. **Mid-Size Guard Breakpoint (`980px <= winWidth < 1200px`)**: Evaluates `availableForEditor = winWidth - 44px - currentSidebarWidth - currentChatWidth`. If `availableForEditor < 320px` and Chat Drawer is open:
       - **Step 1**: Closes Session History sidebar first (`setChatSessionsOpen(false)`), restoring normal chat width (340px) and reclaiming ~160px for the editor.
       - **Step 2**: Clamps chat width dynamically to `maxChatPossible = winWidth - 44px - currentSidebarWidth - 320px`.
       - **Step 3**: If `maxChatPossible < 300px` (`MIN_CHAT_WIDTH`), auto-collapses Chat Drawer entirely (`setChatOpen(false)`), preventing editor shrinkage below 320px.
  - **Header & Session Sidebar Responsive Polish**:
    - Header action buttons (`New session`, `Toggle sessions`, `Close`) shielded with `flex-shrink: 0`.
    - Active session title and agent heading dynamically adapt with `min-width: 0`, `flex: 1`, and ellipsis truncation.
    - Master session sidebar constrained to **180px** with session card titles styled with `flex: 1`, `min-width: 0`, and native `title` tooltips.
  - **AI Provider & Model Upward Popover (`ChatProviderSelect.tsx`)**:
    - **Upward-Floating Position**: Positioned at `bottom: calc(100% + 8px); left: 0; z-index: 100; width: 325px;` with `var(--shadow-popover)` shadow and smooth fade-in animation. Floats upwards above the composer footer.
    - **Zero CSS Clipping Rule**: Maintained `overflow: visible` across `.composer`, `.composer-footer`, `.composer-footer-left`, and `.composer-wrapper` to prevent clipping within the footer bar.
    - **Unified Multi-Provider Catalog**: Lists all 4 AI providers (`Antigravity`, `Claude`, `OpenCode`, `OpenRouter`) and all their standard + custom models simultaneously in one menu.
    - **Quick Filter Tabs**: Horizontal pills (`[Semua]`, `[AGY]`, `[CLD]`, `[OC]`, `[OR]`) with color-coded dot badges for instant single-provider filtering.
    - **Atomic Selection Handler**: Selecting any model immediately sets both provider and model on the active session (`setSessionModel`) and persists agent settings.
  - **Provider Badge Architecture (`ChatMessageList.tsx`)**:
    - Provider badge cleanly rendered in the assistant card header (`tag-antigravity`, `tag-claude`, `tag-opencode`, `tag-openrouter`), while the active model is clearly indicated in the composer toolbar and session sidebar.
  - **Streaming AI Response via HTTP POST & Streamed SSE-Formatted Reader (`storeApi.ts`)**:
    - Communicates via Go streaming proxy (`POST /api/v1/ai/chat`) and appends atomic event nodes to the graph ledger (`POST /api/v1/chats/:id/events`) with Content-Addressed Storage (CAS) blob offloading.
    - Client consumes streamed Server-Sent Events (`event: start/thinking/tool_call/chunk/done/error`) through a `ReadableStreamDefaultReader` parser.
    - Typewriter streaming text updates with pulsing cursor (`.streaming-cursor`) and shimmer loader (`.message-body-streaming-shimmer`).
  - **Adaptive Smooth Typewriter Pacing (`useSmoothStream.ts`)**:
    - Solves choppy, jumpy typing caused by coarse SSE chunking by buffering incoming text and pacing output through throttled 30ms interval micro-batches (~33 FPS).
    - Automatically scales step size according to buffer backlog, ensuring smooth visual typing without lagging behind when the stream finishes or locking up the UI thread.
  - **Modern Messenger-Style Balloon Architecture & Interactive Welcome Banner (`ChatMessageList.tsx`, `chat.css`)**:
    - **Interactive Welcome Empty State Banner (`.chat-welcome-banner`)**: Clean, modern greeting rendered on empty sessions featuring the active workspace folder pill badge (`.workspace-pill`) and quick hint badges (`/` for skills, `@` for files & folders).
    - **Messenger-Style Chat Balloons**: Replaces uniform flat blocks with intuitive conversational message turns:
      - **User Turn (Right-Aligned)**: Rendered on the right (`.message-turn-user`, `max-width: 85%`) inside an accent-tinted card (`.user-prompt-card`) with clickable context pills.
      - **Agent Turn (Left-Aligned)**: Rendered on the left (`.message-turn-agent`, `max-width: 95%`) inside a neutral elevated card (`.agent-response-card`) containing the provider badge, thinking accordion, tool activity, and markdown response body.
  - **Unified Collapsible Activity Timeline (`UnifiedActivityTimeline`)**:
    - Combines reasoning loops (Thinking process) and tool call actions into a single timeline stream with a vertical hairline and status dots. Auto-expands during live streaming (`isStreaming: true`), and auto-collapses into a 1-line summary badge upon stream completion (`⚡ 3 actions taken (Read 2 files, 1 edit)`). Clicking expands a single-line tree node feed with on-demand click-to-view for terminal outputs, diffs, and direct workbench file navigation.
    - **Floating Hover-Only Actions**: Copy and review buttons are hidden by default during idle reading, appearing seamlessly as floating action pills on message hover.
    - **Subtle Micro-Metadata Footer**: Monospace micro-text (`2.4s`) and provider tag at the message footer.
    - **Streaming Fast-Path & Zero-Parse Markdown Architecture (`MarkdownRenderer.tsx`)**: Completely bypasses expensive $O(N)$ AST block parsing and regex syntax tokenization during active streaming (`isStreaming === true`). Renders plain typography in `whitespace-pre-wrap` during live generation to eliminate DOM reconciliation churn, memory spikes, and tab freezing/crashing. Once generation completes (`isStreaming === false`), executes a single full markdown parse to render rich interactive elements (syntax highlighting, tables, code review gates, task lists).
    - **Interactive Code Blocks & Git Review Gates (`MarkdownRenderer.tsx`)**: Fenced code blocks with language badge, syntax highlighting (reusing `tokenizeLine` token classes), one-click **Copy Code** button with feedback, and **Apply to Editor** / **Apply to <basename>** review gate button. Supports `lang:filepath` fence headers (e.g. ````ts:src/utils.ts````) to automatically route code to the correct file. Writing triggers path validation, dirty buffer prompt protection, and opens the changes immediately in `DiffEditorPane.tsx` side-by-side view. Omitted `[Insert at Cursor]` to maintain a lean UI and prevent focus-stealing bugs.
    - **On-Demand Lazy Mermaid Rendering & Crash Guards (`MermaidBlock.tsx`)**:
      - Dynamically loaded on-demand (`import("mermaid")`) strictly when a ```mermaid fenced block is encountered, keeping the main bundle lightweight.
      - Automatically matches system Dark / Light theme tokens.
      - **Strict Streaming Guard**: Mermaid rendering is strictly bypassed while `isStreaming === true` or when the block is unclosed (`if (isStreaming || unclosed) return;`), completely preventing DOM reconciliation race conditions with React.
      - **Fault-Tolerant Fallback**: Syntax errors render formatted raw code with an error status badge rather than crashing the chat interface, and residual `#dmermaid` DOM nodes are safely pruned on error or unmount.
      - Features a Diagram / Code toggle and a dedicated Preview button opening the diagram in a full modal.
    - **Global Lightbox Modal Preview with Pan & Zoom (`MermaidPreviewModal.tsx`)**:
      - Ephemeral fullscreen modal mounted via `createPortal` to `document.body` (zero disk or tab buffer storage overhead).
      - Interactive canvas featuring mouse-drag panning, mouse wheel zooming (20% – 500%), and double-click reset to 100%.
      - Header toolbar with zoom buttons, one-click SVG export/download, source code copy, and keyboard `Esc` listener.
    - **Agent Multi-File Review Banner (`ChatMessageList.tsx`)**: Inspects both executed tool calls (`write_to_file`, `replace_file_content`, `create_file`, `delete_file`) and `lang:filepath` code blocks. Proposed file block extraction (`extractProposedCodeBlocks`) is deferred until stream completion to eliminate redundant regex scanning every frame. Renders a compact bottom summary banner displaying touched file counts, individual clickable file chips to open files directly in editor panes, an **Apply All ({N})** batch action for proposed code blocks, and a **Review in Git** button navigating directly to Source Control.
    - **Parameter & Output Sanitization & Anti-Ghost Tab**: Arguments and execution output blocks are sanitized and capped (max 2,500 characters in DOM preview via `CapOutput` / `sanitizeOutput`) to prevent DOM bloat. Strict path validation rejects empty paths or path values matching tool names (`view_file`), preventing empty ghost editor tabs.
      - **Line Range Badges**: If `StartLine` and `EndLine` are present on read tools, displays a compact range badge (e.g. `style.css · L1-100`) directly on the card header.
    - **Safe Streaming Batcher & Debounced Disk Sync (`chatCore.ts`)**: Batches incoming SSE typewriter deltas (`chunk`) and reasoning deltas (`thinking`) via RAF micro-buffering (40ms / 25fps) into a unified atomic session update, eliminating $O(N^2)$ re-rendering. Calls synchronous immediate flush (`flushDeltasSync()`) on stream completion, errors, or cancellation. Pushes disk persistence (`saveBackendChatSession`) through a 3-second debounce to eliminate HTTP POST request spam to the Go backend during live streams.
    - **Preserving Partial Text on Errors (`ChatMessageList.tsx`)**: Places the inline error card (`.chat-error-card`) as a footer below the rendered message body. If generation cuts off or fails, previously streamed text is completely preserved above the alert card rather than being replaced or clipped.
    - **Empty State Guard**: Renders informative fallback (`Sedang menunggu respons...`) if generation concludes with empty text.
  - **In-Flight Control & Stop Generation (`ChatComposer.tsx`)**:
    - Send button dynamically transforms into a red accent **Stop Generation** button (`.composer-stop-btn`) while generation is active.
    - `Escape` key shortcut support to abort the in-flight SSE stream and immediately kill the child process via `AbortController`.
  - **Native Multi-Provider Skill Discovery & Popover Auto-Scroll (`ChatCommandPopover.tsx`)**:
    - Popover for `/` is populated dynamically via `GET /api/v1/ai/skills?provider=...&workspace=...`, discovering native provider skills across System and Workspace directories (Antigravity, Claude, OpenCode, OpenRouter).
    - **Popover Keyboard Pointer Auto-Scroll**: Attaches item DOM references and executes `scrollIntoView({ block: "nearest", inline: "nearest" })` whenever `selectedIndex` updates, ensuring highlighted items below the fold stay visible during arrow key navigation.
    - Detailed skill metadata: renders name, description, and scope/source label (e.g. `Workspace · .gemini/skills/my-skill` or `System`).
  - **Context Mentions & Folder Support (`contextExtractorCore.ts`, `ChatComposer.tsx`, `ChatMessageList.tsx`)**:
    - **Folder / Directory Mentions (`@folder/`)**: Popover `@` allows selecting directories as well as files. Folders are rendered with `<Icon name="folder" />` and a distinct `(Dir)` badge.
    - **Lightweight Path-Only Context Packaging**: When folders are attached, prompt packaging (`formatPromptWithContext`) injects strictly `Directory: <path>` without reading or dumping filesystem trees into context buffers.
    - Files continue supporting progressive mode switching: `(Ref)` $\rightarrow$ `(Snippet)` $\rightarrow$ `(Full)` $\rightarrow$ `(Ref)`.
  - **Setup Needed Guard (`ChatComposer.tsx`)**:
    - Complete provider credential verification across all 5 supported providers (`claude`, `openai`, `gemini`, `openrouter`, `opencode`).
    - Warning badge (`Icon name="warning"`) displayed when active provider lacks credentials, linking directly to Settings Modal.
  - **Proactive Copilot Onboarding Banner (`CopilotInitBanner.tsx`, `ChatDrawer.tsx`)**:
    - **Contextual Onboarding Pill**: Dynamically rendered beneath `ChatHeader` when `isCopilotInitialized === false`. Styled with Tailwind v4 semantic tokens (`bg-accent/10 border-b border-accent/25`).
    - **1-Click Launch**: Features a direct **Initialize** CTA button that opens the `CopilotInitModal`.
  - **Copilot Workspace Initialization Modal (`CopilotInitModal.tsx`)**:
    - **Persona Selection**: Interactive preset selector supporting **Kanna** (Creative & Friendly anime companion), **Senior Architect** (Formal & Structured), and **Minimalist Hacker** (Direct & Lean).
    - **Sync with Detected Rules**: Pre-selects the active persona detected by backend heuristics from existing `AGENTS.md` content.
    - **Interactive Options**: Toggles for adding `.aegis/tasks/` to `.gitignore`, scaffolding initial welcome task (`001-welcome`), overwriting existing rules, and optional custom directives.
    - **Atomic Submission**: Calls `initWorkspaceCopilot` (`POST /api/v1/agent/init-workspace`), refreshes workspace state, and closes cleanly with a feedback toast.
  - **Contextual `/plan` & `/goal` Interception (`ChatComposer.tsx`)**:
    - When an uninitialized workspace attempts to submit autonomous commands like `/plan` or `/goal`, `ChatComposer` intercepts submission, shows a guidance toast, and automatically opens `CopilotInitModal` to ensure `.aegis/` is scaffolded before autonomous workflows execute.
  - **Aegis Copilot Autonomous Wave Stepper (`ChatWaveStepper.tsx`, `ChatDrawer.tsx`)**:
    - **Ultra-Compact Status Track**: Rendered directly beneath `ChatHeader` (or `CopilotInitBanner`) inside `ChatDrawer.tsx` as a slim ~32px horizontal bar declared with `shrink-0`.
    - **Real-Time Wave Chips**: Displays current autonomous task title with dynamic progress chips (`PASSED`, `IN_PROGRESS`, `PENDING`, `BLOCKED`) reacting to EventHub SSE topic `"copilot"`.
    - **Quick File Launchers**: Provides instantaneous links (`[Spec]`, `[Plan]`, `[Log]`) opening `.aegis/tasks/<task-slug>/` markdown files directly into active workbench editor panes via `openFileInGroup(...)`.
    - **Zero-Emoji Architecture**: Uses standard `<Icon name="..." />` primitives for all state indicators (e.g. `check`, `play`, `circle`).


### 7. Status Bar (`status-bar/`)
- **Path**: [`src/components/layout/status-bar/`](../../src/components/layout/status-bar)
- **Primary Components**: `StatusBar.tsx`, `PerfStatusPill.tsx`, `BranchPopover.tsx`, `ProblemsPopover.tsx`, `NotificationsPopover.tsx`, `LspStatusPopover.tsx`, `status-bar.css`
- **Visual Design & Interactive Capabilities**:
  - Slim 24px footer anchored at the bottom edge.
  - **Left Section**:
    - **Active Git Branch Button**: Displays active branch with dirty indicator (`*`) when working tree has uncommitted changes. Clicking opens `BranchPopover.tsx` with search filter and branch creation.
    - **Cloud Sync Status**: Interactive button with `↓behind ↑ahead` counters; clicking triggers `gitSync`.
    - **Problems Counter**: Error and warning counts opening `ProblemsPopover.tsx` with empty state detection and direct navigation to problems in editor/bottom panel.
  - **Right Section (Dynamic, Zero-Hardcoding)**:
    - **Cursor Position**: Real-time cursor coordinates (`Ln X, Col Y`).
    - **Indentation Toggle Button**: Dynamic `Spaces: {tabSize}` button reflecting workbench editor state; clicking directly toggles between 2 and 4 spaces with feedback toast, kept in sync with Settings Modal and Sidebar.
    - **Document Encoding**: Live file encoding indicator (`UTF-8`).
    - **Language Mode Badge**: Active file syntax mode detected automatically from file extensions.
    - **LSP Status Button & Popover (`LspStatusPopover.tsx`)**: Displays Language Server Protocol connection status with glowing dot indicator; clicking opens LSP server inspector.
    - **Zero-Freeze Performance Guard (`PerfStatusPill.tsx`)**:
      - Real-time frame rate indicator (`{fps} FPS`) monitored via `perfMonitor.ts` with semantic color states (`syntax-green` $\ge 50$ FPS, `syntax-orange`, `syntax-pink` $< 40$ FPS).
      - Clicking opens the Performance Guard inspector reporting live FPS, main-thread event loop lag (ms), active Web Worker pool size, LRU cache entry count, and detected Long Tasks (> 50 ms).
      - **Centered Popover Anchor**: Positioned with `left-1/2 -translate-x-1/2 mb-1` directly above the trigger button, guaranteeing symmetrical alignment and preventing viewport overflow.
      - **Standardized Popover Header**: Adopts `.status-popover-header` with uppercase `PERFORMANCE GUARD` label and "Clear Lags" action button.
      - **Active State Indicator**: Highlights the status item with `.status-button-active` while the popover remains open.
    - **Server Connection Indicator**: Live Go Core Server ping (`/api/v1/workspace/info`) displaying glowing dot (`--color-success` online / `--color-error` offline) with `Local: Connected / Offline`; clicking triggers manual health check / reconnect attempt.
    - **Notification Center Badge & Popover (`NotificationsPopover.tsx`)**:
      - Real-time unread notification badge counter.
      - Automated toast history bridge: transient toasts (`showToast`) automatically populate Notification Center history (up to 30 items).
      - Popover controls: Header action buttons ("Mark all read", "Clear all"), individual dismiss button on hover, and empty state ("No notifications - You're all caught up").
      - Global click-outside listener and `Escape` key handling to dismiss any active popover.

### 8. Settings Overlay (`settings/`)
- **Path**: [`src/components/layout/settings/`](../../src/components/layout/settings)
- **Primary Components**: `SettingsModal.tsx`, `SettingsView.tsx`, `AISettingsPane.tsx`, `AIProvidersCard.tsx`, `AIModelsTable.tsx`, `AgentRulesCard.tsx`, `FolderBrowserModal.tsx`, `settingsRegistry.ts`, `settings-modal.css`
- **Visual Design**:
  - Modal overlay with dimmed backdrop and dedicated standalone view support (`SettingsView.tsx`).
  - Two-column VS Code-style preferences: Left category rail (Editor, Files, Workbench, Terminal, Features, Companion, AI Agent) and right settings card list.
  - Top search input with instant regex filtering across all settings options.
  - **AI Agent Settings & Models Management (`AISettingsPane.tsx`)**:
    - **Aegis Copilot Workspace Setup Card**: Rendered prominently at the top of the AI Agent settings tab. Displays real-time workspace initialization status pill (`Initialized` with green dot or `Not Initialized` with amber dot) linked to `GET /api/v1/agent/workspace-status`. Features a direct one-click launcher button opening `CopilotInitModal` to scaffold guidelines and task tracking on-demand.
    - Unified multi-provider cards for Antigravity, Claude, OpenCode, and OpenRouter (`AIProvidersCard.tsx`).
    - **Antigravity Auto-Discovery Card**: Auto-detected via `~/.gemini/oauth_creds.json` and brain workspace, with 1-line concise hint and live sub-60ms connection probe.
    - **Custom Models Tag Chips & Table (`AIModelsTable.tsx`)**: Interactive pills and table allowing adding, testing, and deleting arbitrary custom model IDs per provider (`+ Add` / `✕`).
    - **Live Connection Test**: Real-time test probe buttons measuring round-trip latency (ms) with spinner and status tooltips.
  - **Workspace Rules & Persona Card (`AgentRulesCard.tsx`)**:
    - Embedded within the AI Agent settings category to manage `.aegis/` directives and root `AGENTS.md`.
    - **Live Status & Persona Detection**: Detects workspace state dynamically via `GET /api/v1/agent/rules-status`, inspecting file content to accurately display the active persona badge (`Kanna`, `Senior Architect`, `Minimalist Hacker`, or `Custom`) rather than defaulting to generic "custom".
    - **Preset Selector Dropdown**: Styled `<select>` dropdown with custom `<Icon name="chevron-down" />` supporting multiple persona presets (Kanna, Senior Architect, Minimalist), auto-synced with detected persona.
    - **Editable Markdown Preview Box**: Controlled monospace `<textarea>` with real-time `Modified` badge and contextual `Reset to default` action (`<Icon name="history" />`).
    - **1-Click Workspace File Creation & Save**:
      - `Copy Template`: Copies customized textarea contents to clipboard.
      - `Create AGENTS.md in Workspace`: Sends `{ preset, content }` to `POST /api/v1/agent/init-rules`, creating `AGENTS.md` in the workspace root and opening it in the editor.
      - `Save to AGENTS.md`: Appears when changes are made to an existing `AGENTS.md`.
      - `Open AGENTS.md in Editor`: Emerald green button (`bg-emerald-600 hover:bg-emerald-500 text-white`) with `<Icon name="edit" />` opening the file directly into CodePane.
  - **Strict Zero-Emoji UI Policy**: 100% SVG UI `<Icon name="..." />` components across all settings cards, headers, sidebars, and modal controls. Prohibits graphical color emojis (e.g. 📁, ⚙️, 🚀, 💡) in favor of semantic SVG icons. Standard typographical monospace glyphs and IDE symbols (such as `⌘`, `⟳`, `✕`, `↓`, `↑`, `*`) in keyboard shortcuts, badge labels, and commit status counters are standard system text glyphs.

### 9. Command Palette (`command-palette/`)
- **Path**: [`src/components/layout/command-palette/`](../../src/components/layout/command-palette)
- **Primary Components**: `CommandPalette.tsx`, `command-palette.css`
- **Visual Design & Floating Dropdown**:
  - **Direct Anchoring**: Rendered directly beneath the navbar search container (`top: calc(100% + 4px); width: 100%`), perfectly matching the 300px search bar width.
  - **Backdrop-Free Experience**: Completely eliminates dark blurred overlay/backdrop; workbench and code editor stay 100% bright, crisp, and visible while searching.
  - **Single Input UX**: Eliminates duplicate search bars; the navbar search bar itself serves as the interactive input, while the floating dropdown beneath exclusively displays command results.
  - **Results List**: Scrollable command list with uppercase section headers (`COMMANDS`), icons, bold labels, and muted detail subtitles with clean ellipsis truncation (`text-overflow: ellipsis`) for long items.
  - **Go-First Quick Open Subsystem (`GET /api/v1/workspace/files/find`)**:
    - Quick Open (`Cmd+P`) queries the Go-First in-memory workspace index, evaluating weighted subsequence matches across 50,000+ files in sub-2ms with multi-core Goroutines.
  - **Keyboard Navigation & Shortcuts**: Supports `⌘K` / `Ctrl+K` and `⌘P` / `Ctrl+P` toggle shortcuts, `Arrow Up/Down` for cyclical selection, `Enter` to execute, and `Escape` to close and reset query.
  - **Dismissal**: Outside-click dismissal via `pointerdown` listener on `document` and `Escape` key handling.
- **Tokens Used**: `bg-surface-overlay`, `border-line-bright`, `shadow-popover`, `text-ink`, `text-ink-soft`, `text-ink-muted`, `bg-surface-hover`.

---

## 3. Remote Tablet Companion View Mode (Roadmap / Planned Architecture)

For remote multi-screen workflows on tablets (iPad, Android tablets):
- **Access Route**: `/?mode=companion` or paired via QR Code / local URL from Header.
- **Two Primary Switcher Tabs**:
  1. **Web Preview Host Tab**: Renders the running web application hosted by the local Go backend in a touch-friendly viewport. Security specification requires an isolated sandboxed iframe (`sandbox="allow-scripts allow-forms allow-same-origin"` with dedicated local port binding and postMessage bridge boundary) to isolate parent IDE state from the user's running application.
  2. **Focus Code Editor Tab**: Renders a distraction-free, touch-optimized single-pane text editor buffer without sidebars or bottom drawers. Allows direct code editing and instant auto-save synchronization back to the desktop workspace.

---

## 4. Design System & CSS Token Conventions

AegisCode enforces a **Strict 100% Token Architecture** across all components:
- **Component Styling Rule**: All UI components, panels, cards, inputs, buttons, and popovers MUST strictly reference semantic CSS variables (`var(--color-canvas)`, `var(--color-surface)`, `var(--shadow-popover)`, etc.) and Tailwind CSS v4 `@theme` classes. Zero hardcoded hex values or arbitrary `rgb()`/`rgba()` values are permitted in TSX and component stylesheets.
- **Root Ambient Canvas Glow (Architectural Exception)**: Scoped exclusively to `src/styles/base.css` on `body` for the anti-fatigue ambient viewport gradient backdrop (`radial-gradient` + `linear-gradient`), which blends with `var(--color-canvas)`.

### Dual Theme Support (Dark & Light Mode)
Theme switching is managed globally via `WorkbenchContext.tsx`, persisted in `localStorage` (`aegis_theme`), and applied dynamically via `[data-theme="light"]` attribute on the root HTML element.

| Semantic Token | Dark Mode (Default) | Light Mode (`[data-theme="light"]`) | Usage / Role |
| :--- | :--- | :--- | :--- |
| `--color-canvas` | `#090d16` | `#f6f8fb` | Deep canvas background behind panels |
| `--color-surface` | `#121824c7` | `#ffffffea` | Main panel surfaces (sidebar, header, bottom panel) |
| `--color-surface-raised`| `#1c2434db` | `#eef2f7f0` | Raised cards, active tabs, dialogs |
| `--color-surface-hover` | `#7091be21` | `#1e293b0f` | Hover background for list items and menu rows |
| `--color-surface-overlay`| `#182030f2` | `#fffffff0` | Modal settings, command palette, toast popovers |
| `--color-line` | `#a8bedc1f` | `#cbd5e1b3` | Structural borders, dividers, resizer sashes |
| `--color-line-bright` | `#b3cdee38` | `#94a3b880` | Active borders, breadcrumbs, scrollbar thumb |
| `--color-ink` | `#e7edf7` | `#0f172a` | Primary high-contrast text |
| `--color-ink-soft` | `#aab6c8` | `#334155` | Secondary text, status bar items |
| `--color-ink-muted` | `#6f7d91` | `#64748b` | Comments, placeholder text, line numbers |
| `--color-accent` | `#38bdf8` | `#0284c7` | Active tabs (2px bar), focus rings, CTA buttons |
| `--color-accent-soft` | `#38bdf826` | `#0284c71a` | Background for active badges, hover glow |
| `--color-error` / `-soft`| `#f87171` / `#f8717124` | `#dc2626` / `#dc262617` | Universal error diagnostics, deleted files |
| `--color-warning` / `-soft`| `#fb923c` / `#fb923c24`| `#d97706` / `#d9770617` | Universal warnings, modified git badges |
| `--color-success` / `-soft`| `#4ade80` / `#4ade8024`| `#16a34a` / `#16a34a17` | Universal success, staged git changes |
| `--color-info` / `-soft` | `#38bdf8` / `#38bdf824` | `#0284c7` / `#0284c717` | Universal info, highlights, branch tags |
| `--shadow-elevation` | `0 14px 38px #00000033, inset 0 1px 0 #ffffff14` | `0 10px 30px #0f172a14, inset 0 1px 0 #ffffff80` | Glass panel shadow with dimensional inset |
| `--shadow-popover` | `0 20px 50px #00000066` | `0 14px 40px #0f172a1f` | Floating dialogs, command palette, toasts |

### Anti-Fatigue Background Gradient
Implemented in [`src/styles/base.css`](../../src/styles/base.css):
- **Dark Mode**: Dual ambient radial glow (`#2c67aa3d` & `#36a2ae21`) over linear deep obsidian canvas.
- **Light Mode**: Dual soft ambient mist (`#38bdf81f` & `#818cf814`) over calm pale slate canvas.
- Soft color transitions (`transition: background-color 0.25s ease, color 0.25s ease`) prevent retina strain.

---

## 5. Zustand Modular Store Architecture & Buffer Lifecycle

AegisCode v2 utilizes a unified, modular Zustand architecture ([`src/store/index.ts`](../../src/store/index.ts)) replacing all monolithic legacy facade files and context hooks. The store is composed of isolated, typed slices combining into a single root `useWorkbenchStore`:

### A. Modular Slice Boundaries
1. **`createWorkspaceSlice`**: Workspace root management, canonical buffer indexing (`fileBuffers[clean]`), async file fetching with per-file sequence tokens (`fileFetchTokens`), dirty buffer protection, and auto-save disk synchronization.
2. **`createEditorSlice`**: Multi-group window splits (`group1`, `group2`), active tab management, tab reordering / DND, pinned tab persistence (`pinnedTabs`), and editor settings synchronization.
3. **`createChatSlice`**: AI chat sessions, agent multi-provider configurations, streaming message batches (RAF micro-buffering), and context mentions (`@folder/`, `@file`).
4. **`createGitSlice`**: Git branch tracking, staging/unstaging, commit graph DAG nodes, diff mode toggles, and commit drafting.
5. **`createDebugSlice`**: Delve DAP debugger lifecycle, breakpoint registry (`debugState.breakpoints`), call stacks, in-scope variables, and interactive debug REPL console.
6. **`createTerminalSlice`**: Multi-session terminal PTY management, persistent active tabs, cross-platform host shell detection (`detectDefaultShell()`), and dynamic shell switching.
7. **`createLayoutSlice`**: UI panel visibility (`sidebarOpen`, `panelOpen`, `chatOpen`), panel dimensions (`sidebarWidth`, `chatWidth`, `panelHeight`), and workbench action dispatching (`runAction`).
8. **`createSettingsSlice`**: Single source of truth for global settings (`settings.workbench.appearance`, `settings.editor`, `settings.linter`), persistent in `localStorage` (`aegis_settings_v1`).
9. **`createCodeGraphSlice`**: VantageCraft CodeGraph visualization state, active perspective views, node selections, call trails, and graph search filters. Decoupled via `registerCodeGraphWorkbenchStore` to prevent circular imports.

### B. Single Sources of Truth & Decoupled Render Loops
- **Theme & Appearance**: `createSettingsSlice.ts` serves as the authoritative source of truth (`settings.workbench.appearance.mode` and `palette`). `createLayoutSlice.ts` harmonizes `setTheme` and `setThemePalette` directly into `settings`, ensuring zero state divergence with localStorage.
- **Editor Preferences**: `tabSize`, `minimapEnabled`, and `minimapScale` are synchronized bidirectionally between `createEditorSlice.ts` and `settings.editor` in `createSettingsSlice.ts`.
- **Linter Configuration**: `linterSettings` in `createWorkspaceSlice.ts` mirrors and binds directly to `settings.linter` in `createSettingsSlice.ts`.
- **Decoupled 60Hz Cursor Loop**: `CMEditor.tsx` cursor and selection coordinates are isolated via `useCursorPosition` subscriptions. `CodePane.tsx` does not re-render its entire editor shell or DOM body on cursor movement ticks, isolating high-frequency updates strictly to the StatusBar coordinates readout.

### C. Buffer Lifecycle & Race Protection (ADR 0016)
- **Single POSIX-Canonical Path Keying**: All buffer state in `fileBuffers` is indexed strictly by clean, normalized relative paths (e.g. `src/components/Header.tsx`). No duplicate alias keys exist.
- **In-Flight Network Save Keystroke Protection (`OPT-BUF-01`)**: During `saveFile()`, the buffer snapshot (`contentToSave`) is captured prior to dispatching network requests. Upon async completion, `markBufferSavedLogic` compares `currentBuf.content === contentToSave`. If keystrokes were typed while the save was in-flight, `isDirty` remains `true`, completely eliminating race condition data loss.
- **Self-Save Watcher Echo Suppression (`OPT-BUF-02`)**: Saving updates `buf.lastSaved = Date.now()`. When the Go filesystem watcher broadcasts a disk modification event within an 800ms window, or if on-disk content matches `buf.savedContent`, reload is suppressed. This eliminates editor unmounting, loading spinner flicker, and false `hasDiskConflict` alerts.
- **Per-File Async Fetch Sequence Guard (`OPT-BUF-05`)**: `fetchBufferSafely` maintains per-file monotonic tokens (`fileFetchTokens[clean]`). If rapid folder switches or tab clicks fire overlapping reads, older resolved responses with stale tokens are discarded immediately.

---

## 6. UI Verification Gates

Whenever frontend code in `src/` is modified, the following quality gates must pass:
1. `rtk npm run build` -> 0 compile errors.
2. `rtk npm run format` -> Code formatting verified via `oxfmt`.
3. Token reusability verified -> 0 hardcoded arbitrary hex colors in TSX/CSS.
4. Layout markup preservation -> Existing selectors and class contracts preserved 1:1.
5. Update this documentation if any layout module structure or CSS contract is modified.

---

## 7. Deprecated & Legacy Frontend Architecture (Historical Archive)

> **Notice**: The architectures, patterns, and files listed below have been deprecated or permanently purged from AegisCode v2. They are documented here solely for historical auditability and backward traceability.

### A. Purged Monolithic Core Facades & Legacy Context Hooks
- **Monolithic Facades (`src/context/`)**:
  - `editorCore.ts`: Monolithic editor state logic handling tabs, active files, and split panes in one large file. Superseded by `createEditorSlice.ts`.
  - `settingsCore.ts`: Legacy settings manager with ad-hoc mutations. Superseded by `createSettingsSlice.ts`.
  - `workspaceCore.ts`: Monolithic workspace filesystem and buffer manager. Superseded by `createWorkspaceSlice.ts`.
- **Legacy Context Hooks**:
  - `useChatCore`: Custom React context hook for chat state. Superseded by Zustand store selector `useWorkbenchStore((s) => s.chatState)`.
  - `useGitCore`: Custom React context hook for git operations. Superseded by Zustand store selector `useWorkbenchStore((s) => s.gitState)`.
  - `useLayoutCore`: Custom React context hook for layout dimensions and visibility. Superseded by `useWorkbenchStore((s) => s.layoutState)`.
  - `useTerminalCore`: Custom React context hook for terminal sessions. Superseded by `useWorkbenchStore((s) => s.terminalState)`.

### B. Legacy Buffer & Tab Patterns
- **Multi-Key Alias Buffer Indexing (`BUF-01`, `ADR-0016`)**:
  - *Legacy Pattern*: Storing duplicate 4-key aliases (`[clean]`, `[filename]`, `[baseName]`, `[rawBaseName]`) in `fileBuffers` dictionary to accommodate varied path inputs.
  - *Actual Replacement*: Single canonical POSIX-relative key indexing (`clean`), strictly normalized via `normalizeWorkspacePath()`.
- **Unbounded Eager Background Tab Fetching (`LFC-01`)**:
  - *Legacy Pattern*: Eagerly fetching disk contents for all open tabs on workspace launch, creating network spikes and blank mounts.
  - *Actual Replacement*: Just-In-Time (JIT) on-demand fetching when a tab gains focus, backed by `BufferStatus` (`idle` | `loading` | `ready` | `error`) and loading skeleton UI.
- **Unfiltered Pinned Tab Teardown (`HD-02`)**:
  - *Legacy Pattern*: Pinned tabs were local-only state in component memory and were closed during batch "Close All" or "Close Others" operations.
  - *Actual Replacement*: Zustand centralized `pinnedTabs: Set<string>` persisted across sessions in `localStorage` (`aegis_pinned_tabs`).

### C. Deprecated Viewer & Rendering Mechanics
- **Cytoscape Flat Graph Viewer (`GraphViewer.tsx`)**:
  - *Legacy Pattern*: Cytoscape.js canvas rendering flat recursive CTE nodes from `/api/v1/codegraph/neighborhood`.
  - *Actual Replacement*: VantageCraft 6-View Studio (`CodeGraphShell.tsx`) backed by Go reverse proxy `/api/codegraph/ui/*`.
- **Client-Side CSV Full Parsing (`viewerTypes.ts: parseCsv`)**:
  - *Legacy Pattern*: Browser main-thread string parsing of entire CSV files.
  - *Actual Replacement*: Server-side windowed streaming (`/api/v1/workspace/csv/query`) with client pagination.
- **Synchronous Main-Thread Tokenizer & Heuristic Linter**:
  - *Legacy Pattern*: Executing syntax tokenization and regex AST validation synchronously in the React component render loop.
  - *Actual Replacement*: Fast Lane and Batch Lane Web Workers (`tokenizerTask.ts`, `linterTask.ts` via `WorkerBroker`) with non-blocking execution.
- **Unsafe `new Function()` Debug REPL**:
  - *Legacy Pattern*: Raw `new Function()` evaluation in browser memory for debug console inputs.
  - *Actual Replacement*: Safe local scope inspection (`debugState.variables`) and Delve DAP expression evaluation.
- **Client-Side Linear Quick Open Search**:
  - *Legacy Pattern*: Linear JS array filtering (`files.filter()`) in browser thread across large projects.
  - *Actual Replacement*: Multi-core Goroutine subsequence matching in Go backend (`GET /api/v1/workspace/files/find`).

### D. Deprecated UI Elements & Micro-Patterns
- **Text Emoji Emoticons in Chrome**: Text emoticons like `⚡` in the status bar or header. Replaced with semantic SVG `<Icon name="zap" />` components.
- **Asymmetric Left-Aligned Status Popovers**: `left-0` alignment causing viewport overflow on narrow screens. Replaced with centered anchors `left-1/2 -translate-x-1/2`.
- **Unix-Only Terminal Shell Dropdown**: Hardcoded options list lacking Windows `pwsh`/`powershell`/`cmd` detection. Replaced with `detectDefaultShell()`.
- **Assistant Header Dual Model Identifier Pill**: Redundant model badge inside every individual assistant chat bubble. Replaced with provider badge only, leaving model indicator in composer and session sidebar.

