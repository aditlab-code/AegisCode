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

All layout modules live in [`src/components/layout/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout) with co-located CSS files and self-contained sub-components:

### 1. Header (`header/`)
- **Path**: [`src/components/layout/header/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/header)
- **Primary Components**: `Header.tsx`, `WindowControls.tsx`, `AppMenu.tsx`, `GlobalSearchButton.tsx`, `HeaderActions.tsx`, `header.css`
- **Visual Design & Grid Layout**:
  - Balanced 3-column CSS Grid (`grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)`) with symmetric `padding: 0 12px;` guaranteeing exact mathematical 50% midpoint centering for the search bar regardless of asymmetric left/right header controls.
  - Left column: macOS-style traffic light window controls (red/yellow/green) with hover icons, Aegis branding badge, and dropdown application menu (File, Edit, View, Run, Terminal, Help).
  - Center column: Unified search bar container (`.header-search-container`, constrained to 300px width). Functions as quick launcher button when idle and live search input when active (`command-search-active`), showing active workspace context, shortcut badge (`⌘K` / `Ctrl+K`), and `Esc` close button.
  - Right column: Header action buttons aligned to end (`justify-self: end`): toggle primary sidebar (`Ctrl+B`, `sidebar-left`), toggle bottom panel (`Ctrl+J`, `panel`), and toggle AI chat drawer (`sidebar-right`).
  - Responsive collapse: switches to `grid-template-columns: auto 1fr auto` on mobile/narrow viewports (`<= 680px`), collapsing idle search into a 32px icon button.
- **Tokens Used**: `bg-surface`, `border-line`, `text-ink`, `text-ink-muted`, `color-accent`.

### 2. Activity Rail (`activity-rail/`)
- **Path**: [`src/components/layout/activity-rail/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/activity-rail)
- **Primary Components**: `ActivityRail.tsx`, `activity-rail.css`
- **Visual Design**:
  - Slim 44px vertical rail on the left border (matching `.workspace` 44px grid column).
  - Top action group: Explorer icon, Search icon, Source Control Git icon.
  - Bottom action group:
    - **Theme Toggle Button**: Interactive toggle button with dynamic `sun` (in Dark mode) and `moon` (in Light mode) icon with 20° rotation hover transition and instant toast notification.
    - Settings gear icon (`⌘,`).
  - Active indicator pill on left edge with accent coloring (`bg-accent`).

### 3. Sidebar (`sidebar/`)
- **Path**: [`src/components/layout/sidebar/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/sidebar)
- **Primary Components**: `Sidebar.tsx`, `ExplorerPanel.tsx`, `SearchPanel.tsx`, `SourceControlPanel.tsx`, `DebugSidePanel.tsx`, `sidebar.css`
- **Visual Design & Responsive Architecture**:
  - **Run & Debug Panel (`DebugSidePanel.tsx`)**:
    - **Session Controls Header**: Displays current session status badge (`idle`, `running`, `paused: reason`), detected target file (`.go`, `.py`, `.cpp`), and quick Start Debugging (`F5`) / Pause / Continue / Stop controls.
    - **Vertical Accordions (VS Code Standard)**:
      - **Variables**: Collapsible accordion displaying in-scope variables with names in accent color, types, and values.
      - **Call Stack**: Collapsible accordion displaying active stack frames with clickable file and line links that immediately navigate editor panes and set active debug line.
      - **Breakpoints**: Collapsible accordion listing active breakpoints (`file.go:line`), with one-click navigation to editor lines, individual breakpoint delete hover action, and "Clear All Breakpoints" action in the section title bar.
  - **Dimensions & Drag Sash**: Default width **260px**, minimum width **220px**, maximum width **460px** bounded by an interactive vertical drag sash (`ResizeSash.tsx`). Uses a cumulative mouse movement ref (`dragWidthRef`) starting from `onResizeStart` to ensure reliable continuous drag tracking without clamp traps.
  - **Auto-Collapse**: Dragging the sash leftwards below the threshold (**< 160px**) automatically triggers an instant collapse (`setSidebarOpen(false)`). Reopening the sidebar via Activity Rail or shortcut (`Ctrl+B`) smoothly restores the previous valid width (or default 260px).
  - **Explorer Panel**:
    - "OPEN EDITORS" section with "Close All Editors" button (safeguarding dirty buffers via confirmation modal) and group-level close buttons when split.
    - Workspace file tree with folder expansion, tree guides, hidden file visibility toggle, inline CRUD actions (New File, New Folder, Rename, safe Delete confirmation modal), Refresh Explorer, and Collapse Folders in Explorer (`collapse-all`).
    - **Deterministic Ordering**: Folders always render at the top, followed by files, sorted alphabetically (case-insensitive A-Z) across root and all nested subdirectories.
    - **Dedicated Smooth Scrolling**: Dedicated flex container with `overflow-y: auto` ensuring smooth vertical scrolling on large workspaces.
  - **Source Control Panel**:
    - Staged & unstaged changes tree with diff viewer launching.
    - Commit history with graphical DAG timeline lines.
    - **Commit Checkout ("Call Back")**: Quick checkout action to inspect or switch working copy directly to any commit hash (detached HEAD).
    - **Hash-to-Hash Comparison**: Dedicated commit comparison mode (`base` ↔ `target`) displaying changed files list and launching side-by-side / unified diffs between arbitrary commits.
    - **VS Code Standard Git Status Badges**: Fast, non-blocking Git status decorations in the file tree: right-aligned status letter badges (`M` modified in `text-warning`, `U`/`A` untracked/added in `text-success`, `D` deleted in `text-error`, `R` renamed in `text-accent`) on files, and subtle indicator dots (`bg-accent`) on ancestor folders containing modified files computed via `buildExplorerGitDecorations`.
    - Context menu on right-click (Copy Path, Copy Relative Path, Delete, Rename).
  - **Search Panel**:
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
- **Path**: [`src/components/layout/editor/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor)
- **Primary Components**: `Editor.tsx`, `EditorTabs.tsx`, `EditorBreadcrumbs.tsx`, `CodePane.tsx`, `DiffEditorPane.tsx`, `Minimap.tsx`, `EditorFindWidget.tsx`, `DiagnosticHoverCard.tsx`, `editor.css`
- **Tab View Specialized Viewers Sub-module (`editor/viewers/`)**: `ViewerPane.tsx`, `ImageViewer.tsx`, `MarkdownViewer.tsx`, `PdfViewer.tsx`, `CsvViewer.tsx`, `viewerTypes.ts`, `viewers.css`
- **Visual Design**:
  - **Dual Window Groups (Split Pane)**: Group 1 and Group 2 side-by-side or stacked, divided by a draggable splitter sash.
  - **Editor Tabs**: Tab bar supporting drag-and-drop (HTML5 native DND) between groups, dirty unsaved indicator dot, close button.
    - **Contextual Tab Icons**: Displays semantic file icons dynamically (`image` for PNG/JPG/SVG, `table` for CSV/TSV, `git` for diff tabs, `trash` for deleted files, `code` for source files).
    - **Git Diff Tab Integration**: Special diff tab format (`git-diff:<file>?staged=true...`) parsed via [`src/utils/gitDiffTab.ts`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/utils/gitDiffTab.ts), rendering Git branch icon and semantic titles (`file (Working Tree)`, `file (Index)`, `file (commit)`).
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
    - `[DEPRECATED — Client-Side CSV Full Parse]`: Client-side parsing of raw string buffers (`parseCsv` in `viewerTypes.ts`) is deprecated in favor of Go Server-Side Windowed Streaming (`/api/v1/workspace/csv/query`) for any non-trivial dataset ($\ge 2\text{ MB}$ or $> 100$ rows).
    - Delimiter auto-detection (comma `,`, semicolon `;`, tab `\t`) with manual delimiter selector override.
    - Robust RFC 4180 parsing supporting quoted fields with embedded delimiters, newlines, and escaped quotes (`""`).
    - **Rebatching & Pagination for Large Tables (> 100 rows)**: Batch pagination (50, 100, 250, 500 rows per page) keeping DOM lightweight even on 10,000+ row datasets.
    - Sticky headers with column letters (A, B, C...) and interactive sorting (numeric and alphabetical).
    - Sticky row numbers column (1, 2, 3...).
    - Real-time search filter across all cells, text wrap toggle (`Wrap` vs `Truncate`), and `[Table | Raw Text]` mode switcher.
  - **In-Editor Side-by-Side Git Diff (`DiffEditorPane.tsx`)**:
    - `[DEPRECATED — Legacy Popup Modal Diffs]`: Heavy overlay modal diff dialogs have been deprecated in favor of native in-editor `DiffEditorPane.tsx` matching VS Code ergonomics.
    - **Primary Review Gate for AI Code Generation (Sub-Phase 6.10)**: When users click `[Apply to Editor]` on chat code blocks, changes write to disk and automatically open side-by-side in `DiffEditorPane.tsx` without redundant temporary buffers. Users accept via native **Stage** / **Commit** or reject via native **Discard Changes** (with automatic buffer resynchronization to clean HEAD).
    - **Left Pane (Original)**: Read-only display of HEAD or previous commit revision with red background diff highlights. Synthesizes empty `/dev/null` diff for untracked / newly created files.
    - **Right Pane (Modified)**: Live-editable buffer connected directly to `fileBuffers` (when viewing working copy), saveable via `⌘S` / `Ctrl+S`, with green background diff highlights.
    - **Synchronized Scrolling**: Dual-pane vertical and horizontal scroll synchronization with unmount state cleanup to prevent memory leaks.
    - **Diff Toolbar**: File path, additions/deletions stats, "Open in Normal Editor", "Stage / Unstage", and "Discard" actions.
  - **Editor Breadcrumbs**: Clean path navigation bar (`src > components > layout > editor > Editor.tsx`). Displays `diff > [git] file (Working Tree)` when a diff tab is active.
  - **Code Pane**: Lightweight custom buffer editor with line numbers, active line highlight, auto-indentation, and syntax highlighting via semantic token parser.
  - **Inline Find Widget**: Floating widget in top-right corner (`Ctrl+F`) with match count and Next/Previous navigation.
  - **Minimap (`Minimap.tsx`)**:
    - `[DEPRECATED — Synchronous Main-Thread Tokenizer]`: Synchronous `tokenizeLine` in the React render loop is deprecated in favor of Fast Lane Web Worker tokenization (`tokenizerTask.ts` via `WorkerBroker`) with instant visual skeleton bars during fast scroll.
    - Scaled visual overview on the right edge of the editor buffer with click-to-scroll viewport box.
  - **Heuristic Linter (`WorkbenchLifecycle.ts`)**:
    - `[DEPRECATED — Synchronous Main-Thread Syntax Validation]`: Synchronous `validateSyntax` execution inside `WorkbenchLifecycle.ts` is deprecated in favor of Batch Lane Web Worker (`linterTask.ts` via `WorkerBroker`) debounced at 300ms with `AbortController` cancellation.

### 5. Bottom Panel (`bottom-panel/`)
- **Path**: [`src/components/layout/bottom-panel/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/bottom-panel)
- **Primary Components**: `BottomPanel.tsx`, `TerminalView.tsx`, `ProblemsView.tsx`, `OutputView.tsx`, `DebugConsoleView.tsx`, `bottom-panel.css`
- **Visual Design & Interactive Architecture**:
  - **VS Code-Style Hide / Minimize**: Tombol close `[x]` pada header panel atau pintasan keyboard `Ctrl+J` hanya menyembunyikan (*hide / minimize*) drawer ke mini dock strip permanen 28px di atas Status Bar, tanpa mematikan proses PTY shell atau memutuskan koneksi SSE.
  - **Interactive 28px Mini Dock Strip (`.bottom-panel-dock`)**: Saat panel diminimalkan, strip 28px menampilkan tab-tab interaktif (`Terminal`, `Problems`, `Output`, `Debug Console`), badge hitungan diagnostik, status live runner (`SSE active`), dan tombol expand `chevron-up`. Mengklik tab manapun langsung membuka kembali panel ke tab tersebut.
  - **DOM-Persistent Terminal Architecture**: `<BottomPanel />` selalu terpasang di DOM dan merender `<TerminalView />` dengan CSS `style={{ display: panelOpen ? undefined : "none" }}`. Ini menjamin xterm instance dan SSE EventSource tidak pernah ter-unmount, tidak reconnect, dan mempertahankan live output streaming 100% tanpa jeda (0ms lag).
  - **Dynamic Theme Re-Hydration**: Hook sinkronisasi reaktif `useEffect([theme, themePalette])` di `TerminalView.tsx` mengeksekusi `term.options.theme = getDynamicTerminalTheme(palette, mode)` secara instan (0ms snap) dengan palet hex konkret dan kontras warna ANSI yang tepat, sehingga canvas xterm langsung berganti warna seketika saat tema beralih antara Dark, Light, Atom One, dan Tokyo Night.
  - **Standardized Canvas Background**: Seluruh area konten panel bawah (`.bottom-panel-content`, `.terminal-session`, `.lint-output`, `.problems-container`, `DebugConsoleView`) menggunakan background canvas (`var(--color-canvas)` / `bg-canvas`) dengan teks `var(--color-ink)`, sementara header tab panel dan mini dock strip tetap menggunakan `var(--color-surface)` untuk memisahkan chrome dan konten secara elegan.
  - **Refreshed Toolbar Actions**:
    - **Session Shell Selector**: Dropdown pemilihan shell (`zsh`, `bash`, `fish`, `sh`) dan sesi aktif.
    - **New Session (`+`)**: Membuat sesi terminal baru via `createTerminalSession`.
    - **Kill Session (`trash` 🗑)**: Menghentikan proses dan menghapus sesi terminal via `closeTerminalSession`.
    - **Clear Buffer (`discard`)**: Mengosongkan buffer output xterm via `clearTerminal`.
    - **Restart Session (`refresh` ⟳ / `play` ▶)**: Me-restart proses shell baru via `restartTerminalSession`.
    - **Maximize/Restore (`maximize` / `chevron-down`)**: Toggle ukuran penuh panel (1fr).
    - **Hide Panel (`close` ✕)**: Menyembunyikan drawer ke mini dock strip (`setPanelOpen(false)`).
  - **Problems View**: Tabel diagnostik dengan filter chip (All, Errors, Warnings), jump-to-code saat baris diklik, dan tombol "Ask AI" untuk integrasi langsung ke AI chat drawer.
  - **Output View**: Pilihan channel (Server, Tasks, Linter, Git) dengan streaming log real-time melalui SSE endpoint `/api/v1/events/logs`.
  - **Debug Console View (`DebugConsoleView.tsx`)**: Menggantikan tampilan debug lama sesuai standar VS Code. Menampilkan streaming real-time event log DAP (`stdout`, `stderr`, lifecycle events), filter teks, tombol copy dan clear console, serta baris interactive REPL input (`> `) di bagian bawah untuk evaluasi ekspresi saat proses berhenti/berjalan.

### 6. AEGIS AI Agent Drawer (`chat/`)
- **Path**: [`src/components/layout/chat/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/chat)
- **Primary Components**: `ChatDrawer.tsx`, `ChatHeader.tsx`, `ChatSessionSidebar.tsx`, `ChatMessageList.tsx`, `MarkdownRenderer.tsx`, `ChatSuggestions.tsx`, `ChatComposer.tsx`, `ChatCommandPopover.tsx`, `ChatProviderSelect.tsx`, `chat.css`
- **Visual Design & Responsive Architecture**:
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
  - **Dual Provider & Model Message Badges (`ChatMessageList.tsx`)**:
    - `[DEPRECATED — Assistant Header Dual Model Identifier Pill]`: Displaying repetitive model identifier pills (`[gemini-3.8-flash]`) in every assistant message card header is deprecated to eliminate visual redundancy. Only the provider badge is retained in the assistant card (`tag-antigravity`, `tag-claude`, `tag-opencode`, `tag-openrouter`), while the active model is clearly indicated in the composer toolbar and session sidebar.
  - **Streaming AI Response via HTTP POST & Streamed SSE-Formatted Reader (`storeApi.ts` & `chatCore.ts`)**:
    - `[DEPRECATED — Mock Streaming & Monolithic JSON Overwrite]`: Simulated client-side streaming (`mockData.ts`) and full-session monolithic JSON rewriting (`~/.aegis/chats/<id>.json`) are deprecated. The active system communicates via Go streaming proxy (`POST /api/v1/ai/chat`) and appends atomic event nodes to the graph ledger (`POST /api/v1/chats/:id/events`) with Content-Addressed Storage (CAS) blob offloading.
    - Client consumes streamed Server-Sent Events (`event: start/thinking/tool_call/chunk/done/error`) through a `ReadableStreamDefaultReader` parser.
    - Typewriter streaming text updates with pulsing cursor (`.streaming-cursor`) and shimmer loader (`.message-body-streaming-shimmer`).
  - **Modern Messenger-Style Balloon Architecture & Interactive Welcome Banner (`ChatMessageList.tsx`, `chat.css`)**:
    - `[DEPRECATED — Hardcoded Dummy Initial Messages]`: Legacy initial dummy conversation messages (`[antigravity · gemini-3.8-flash-medium] New session started...` and `I'm connected to your local workspace...`) are deprecated and removed from `chatCore.ts`.
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
    - `[DEPRECATED — Static Hardcoded Skills Autocomplete & Clipped Popover]`: Static hardcoded skill arrays and unscrollable popover containers are deprecated.
    - Popover for `/` is populated dynamically via `GET /api/v1/ai/skills?provider=...&workspace=...`, discovering native provider skills across System and Workspace directories (Antigravity, Claude, OpenCode, OpenRouter).
    - **Popover Keyboard Pointer Auto-Scroll**: Attaches item DOM references and executes `scrollIntoView({ block: "nearest", inline: "nearest" })` whenever `selectedIndex` updates, ensuring highlighted items below the fold stay visible during arrow key navigation.
    - Detailed skill metadata: renders name, description, and scope/source label (e.g. `Workspace · .gemini/skills/my-skill` or `System`).
  - **Context Mentions & Folder Support (`contextExtractorCore.ts`, `ChatComposer.tsx`, `ChatMessageList.tsx`)**:
    - `[DEPRECATED — Token Calculation UI Badges & Budgeting Demotion Loop]`: The `~{item.estimatedTokens} tokens` UI badge in `ChatComposer.tsx` and the `enforceContextTokenBudget` computation loop in `createChatSlice.ts` are deprecated and eliminated to lighten client computation.
    - **Folder / Directory Mentions (`@folder/`)**: Popover `@` allows selecting directories as well as files. Folders are rendered with `<Icon name="folder" />` and a distinct `(Dir)` badge.
    - **Lightweight Path-Only Context Packaging**: When folders are attached, prompt packaging (`formatPromptWithContext`) injects strictly `Directory: <path>` without reading or dumping filesystem trees into context buffers.
    - Files continue supporting progressive mode switching: `(Ref)` $\rightarrow$ `(Snippet)` $\rightarrow$ `(Full)` $\rightarrow$ `(Ref)`.
  - **Setup Needed Guard**:
    - Warning badge (`Icon name="warning"`) displayed when active provider lacks credentials, linking directly to Settings Modal.
  - **Multi-line Textarea Composer**: Resilient composer with model badge, attachment triggers, and submit button fitting cleanly at 300px minimum width.

### 7. Status Bar (`status-bar/`)
- **Path**: [`src/components/layout/status-bar/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/status-bar)
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
      - `[DEPRECATED — Text Emoji ⚡ in Status Bar]`: Text emoticon `⚡` has been deprecated and replaced by `<Icon name="zap" size={13} />` (and `size={12}` in header) from `IconName` and `Icon.tsx`.
      - `[DEPRECATED — Asymmetric left-0 Popover Alignment]`: Left-aligned positioning (`left-0`) causing right-edge viewport overflow is deprecated in favor of centered anchor `left-1/2 -translate-x-1/2`.
    - **Server Connection Indicator**: Live Go Core Server ping (`/api/v1/workspace/info`) displaying glowing dot (`--color-success` online / `--color-error` offline) with `Local: Connected / Offline`; clicking triggers manual health check / reconnect attempt.
    - **Notification Center Badge & Popover (`NotificationsPopover.tsx`)**:
      - Real-time unread notification badge counter.
      - Automated toast history bridge: transient toasts (`showToast`) automatically populate Notification Center history (up to 30 items).
      - Popover controls: Header action buttons ("Mark all read", "Clear all"), individual dismiss button on hover, and empty state ("No notifications - You're all caught up").
      - Global click-outside listener and `Escape` key handling to dismiss any active popover.

### 8. Settings Overlay (`settings/`)
- **Path**: [`src/components/layout/settings/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/settings)
- **Primary Components**: `SettingsModal.tsx`, `settingsRegistry.ts`, `settings-modal.css`
- **Visual Design**:
  - Modal overlay with dimmed backdrop.
  - Two-column VS Code-style preferences: Left category rail (Editor, Files, Workbench, Terminal, Features, Companion, AI Agent) and right settings card list.
  - Top search input with instant regex filtering across all settings options.
  - **AI Agent Settings & Models Management**:
    - Unified multi-provider cards for Antigravity, Claude, OpenCode, and OpenRouter.
    - **Antigravity Auto-Discovery Card**: Auto-detected via `~/.gemini/oauth_creds.json` and brain workspace, with 1-line concise hint and live sub-60ms connection probe.
    - **Custom Models Tag Chips**: Interactive pills allowing adding and deleting arbitrary custom model IDs per provider (`+ Add` / `✕`).
    - **Live Connection Test**: Real-time test probe buttons measuring round-trip latency (ms) with spinner and status tooltips.
  - **Strict Zero-Emoji UI Policy**: 100% SVG UI `<Icon name="..." />` components across all settings cards, headers, sidebars, and modal controls. Prohibits graphical color emojis (e.g. 📁, ⚙️, 🚀, 💡) in favor of semantic SVG icons. Standard typographical monospace glyphs and IDE symbols (such as `⌘`, `⟳`, `✕`, `↓`, `↑`, `*`) in keyboard shortcuts, badge labels, and commit status counters are standard system text glyphs.

### 9. Command Palette (`command-palette/`)
- **Path**: [`src/components/layout/command-palette/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/command-palette)
- **Primary Components**: `CommandPalette.tsx`, `command-palette.css`
- **Visual Design & Floating Dropdown**:
  - **Direct Anchoring**: Rendered directly beneath the navbar search container (`top: calc(100% + 4px); width: 100%`), perfectly matching the 300px search bar width.
  - **Backdrop-Free Experience**: Completely eliminates dark blurred overlay/backdrop; workbench and code editor stay 100% bright, crisp, and visible while searching.
  - **Single Input UX**: Eliminates duplicate search bars; the navbar search bar itself serves as the interactive input, while the floating dropdown beneath exclusively displays command results.
  - **Results List**: Scrollable command list with uppercase section headers (`COMMANDS`), icons, bold labels, and muted detail subtitles with clean ellipsis truncation (`text-overflow: ellipsis`) for long items.
  - **Go-First Quick Open Subsystem (`GET /api/v1/workspace/files/find`)**:
    - `[DEPRECATED — Client-Side JavaScript files.filter()]`: Client-side linear filtering of tens of thousands of file paths in the browser thread is deprecated. Quick Open (`Cmd+P`) now queries the Go-First in-memory workspace index, evaluating weighted subsequence matches across 50.000+ files in sub-2ms with multi-core Goroutines.
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
Implemented in [`src/styles/base.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/styles/base.css):
- **Dark Mode**: Dual ambient radial glow (`#2c67aa3d` & `#36a2ae21`) over linear deep obsidian canvas.
- **Light Mode**: Dual soft ambient mist (`#38bdf81f` & `#818cf814`) over calm pale slate canvas.
- Soft color transitions (`transition: background-color 0.25s ease, color 0.25s ease`) prevent retina strain.

---

## 5. UI Verification Gates

Whenever frontend code in `src/` is modified, the following quality gates must pass:
1. `rtk npm run build` -> 0 compile errors.
2. `rtk npm run format` -> Code formatting verified via `oxfmt`.
3. Token reusability verified -> 0 hardcoded arbitrary hex colors in TSX/CSS.
4. Layout markup preservation -> Existing selectors and class contracts preserved 1:1.
5. Update this documentation if any layout module structure or CSS contract is modified.
