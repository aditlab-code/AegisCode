# AegisCode Frontend UI Design Reference

> **Purpose**: Single source of truth for the active UI design and visual layout structure.  
> **Rule**: Must be updated whenever visual components, layout regions, or styling paradigms change.  
> **Design Principles**: Reusable Tailwind tokens, reusable UI components, zero arbitrary hex codes, lightweight modular layouts, universal on-demand code-splitting for all non-code viewers (.canvas, .pdf, .csv, .xls, .svg, .png, .jpg, .md).

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
| Y |                      | BOTTOM PANEL                                 |                          |
|   |                      |                                              |                          |
| R |                      | [Terminal PTY] [Problems Diagnostics] [Logs] |                          |
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
| **Bottom Panel** | 180px (height) | 100px (height) | 800px (height) | N/A | Last height or 180px |

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
  - Right column: Header action buttons aligned to end (`justify-self: end`): toggle bottom panel (`Ctrl+J`), toggle primary sidebar (`Ctrl+B`), and toggle AI chat drawer.
  - Responsive collapse: switches to `grid-template-columns: auto 1fr auto` on mobile/narrow viewports (`<= 680px`), collapsing idle search into a 32px icon button.
- **Tokens Used**: `bg-surface`, `border-line`, `text-ink`, `text-ink-muted`, `color-accent`.

### 2. Activity Rail (`activity-rail/`)
- **Path**: [`src/components/layout/activity-rail/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/activity-rail)
- **Primary Components**: `ActivityRail.tsx`, `activity-rail.css`
- **Visual Design**:
  - Slim 48px vertical rail on the left border.
  - Top action group: Explorer icon, Search icon, Source Control Git icon.
  - Bottom action group:
    - **Theme Toggle Button**: Interactive toggle button with dynamic `sun` (in Dark mode) and `moon` (in Light mode) icon with 20° rotation hover transition and instant toast notification.
    - Settings gear icon (`⌘,`).
  - Active indicator pill on left edge with accent coloring (`bg-accent`).

### 3. Sidebar (`sidebar/`)
- **Path**: [`src/components/layout/sidebar/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/sidebar)
- **Primary Components**: `Sidebar.tsx`, `ExplorerPanel.tsx`, `SearchPanel.tsx`, `SourceControlPanel.tsx`, `sidebar.css`
- **Visual Design & Responsive Architecture**:
  - **Dimensions & Drag Sash**: Default width **260px**, minimum width **220px**, maximum width **460px** bounded by an interactive vertical drag sash (`ResizeSash.tsx`). Uses a cumulative mouse movement ref (`dragWidthRef`) starting from `onResizeStart` to ensure reliable continuous drag tracking without clamp traps.
  - **Auto-Collapse**: Dragging the sash leftwards below the threshold (**< 160px**) automatically triggers an instant collapse (`setSidebarOpen(false)`). Reopening the sidebar via Activity Rail or shortcut (`Ctrl+B`) smoothly restores the previous valid width (or default 260px).
  - **Explorer Panel**:
    - "OPEN EDITORS" section showing pinned tabs across editor groups.
    - Workspace file tree with folder expansion, tree guides, hidden file visibility toggle, inline CRUD actions (New File, New Folder, Rename, safe Delete confirmation modal), Refresh Explorer, and Collapse Folders in Explorer (`collapse-all`).
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

### 4. Workbench Text Editor (`editor/`)
- **Path**: [`src/components/layout/editor/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor)
- **Primary Components**: `Editor.tsx`, `EditorTabs.tsx`, `EditorBreadcrumbs.tsx`, `CodePane.tsx`, `DiffEditorPane.tsx`, `Minimap.tsx`, `EditorFindWidget.tsx`, `DiagnosticHoverCard.tsx`, `editor.css`
- **Visual Design**:
  - **Dual Window Groups (Split Pane)**: Group 1 and Group 2 side-by-side or stacked, divided by a draggable splitter sash.
  - **Editor Tabs**: Tab bar supporting drag-and-drop (HTML5 native DND) between groups, dirty unsaved indicator dot, close button.
    - **Git Diff Tab Integration**: Special diff tab format (`git-diff:<file>?staged=true...`) parsed via [`src/utils/gitDiffTab.ts`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/utils/gitDiffTab.ts), rendering Git branch icon and semantic titles (`file (Working Tree)`, `file (Index)`, `file (commit)`).
  - **In-Editor Side-by-Side Git Diff (`DiffEditorPane.tsx`)**:
    - Replaces over-engineered popup modals with a native in-editor diff view matching VS Code.
    - **Primary Review Gate for AI Code Generation (Sub-Phase 6.10)**: When users click `[Apply to Editor]` on chat code blocks, changes write to disk and automatically open side-by-side in `DiffEditorPane.tsx` without redundant temporary buffers. Users accept via native **Stage** / **Commit** or reject via native **Discard Changes** (with automatic buffer resynchronization to clean HEAD).
    - **Left Pane (Original)**: Read-only display of HEAD or previous commit revision with red background diff highlights. Synthesizes empty `/dev/null` diff for untracked / newly created files.
    - **Right Pane (Modified)**: Live-editable buffer connected directly to `fileBuffers` (when viewing working copy), saveable via `⌘S` / `Ctrl+S`, with green background diff highlights.
    - **Synchronized Scrolling**: Dual-pane vertical and horizontal scroll synchronization with unmount state cleanup to prevent memory leaks.
    - **Diff Toolbar**: File path, additions/deletions stats, "Open in Normal Editor", "Stage / Unstage", and "Discard" actions.
  - **Editor Breadcrumbs**: Clean path navigation bar (`src > components > layout > editor > Editor.tsx`). Displays `diff > [git] file (Working Tree)` when a diff tab is active.
  - **Code Pane**: Lightweight custom buffer editor with line numbers, active line highlight, auto-indentation, and syntax highlighting via semantic token parser.
  - **Inline Find Widget**: Floating widget in top-right corner (`Ctrl+F`) with match count and Next/Previous navigation.
  - **Minimap**: Scaled visual overview on the right edge of the editor buffer with click-to-scroll viewport box.

### 5. Bottom Panel (`bottom-panel/`)
- **Path**: [`src/components/layout/bottom-panel/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/bottom-panel)
- **Primary Components**: `BottomPanel.tsx`, `TerminalView.tsx`, `ProblemsView.tsx`, `OutputView.tsx`, `bottom-panel.css`
- **Visual Design**:
  - Collapsible lower drawer with draggable vertical resize sash.
  - Tab bar: **Terminal**, **Problems**, **Output**. Tab drag-and-drop reordering supported.
  - Panel header actions: Maximize/Restore panel, Close drawer.
  - **Terminal View**: Multi-session terminal emulator tabs, command history (Arrow Up/Down), terminal clear, interrupt (`Ctrl+C`).
  - **Problems View**: Diagnostics table filtered by severity (Errors, Warnings, Info). Clicking a problem jumps to the exact line/column in the active editor.
  - **Output View**: Channel selector (Linter, Tasks, Git, Server) with auto-scroll and clear actions.

### 6. AEGIS AI Agent Drawer (`chat/`)
- **Path**: [`src/components/layout/chat/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/chat)
- **Primary Components**: `ChatDrawer.tsx`, `ChatHeader.tsx`, `ChatSessionSidebar.tsx`, `ChatMessageList.tsx`, `MarkdownRenderer.tsx`, `ChatSuggestions.tsx`, `ChatComposer.tsx`, `ChatCommandPopover.tsx`, `ChatProviderSelect.tsx`, `chat.css`
- **Visual Design & Responsive Architecture**:
  - **Dual Dimension Modes & Drag Sash**: Resized along the left sash (`ResizeSash.tsx`) using cumulative drag tracking (`dragWidthRef`):
    - **Normal Mode (Sessions closed)**: Default width **340px**, minimum width **300px**, maximum width **600px**, auto-collapse threshold **< 180px**.
    - **Expanded Mode (Sessions open)**: Default width **500px**, minimum width **480px**, maximum width **600px**, auto-collapse threshold **< 320px**.
  - **Dynamic Width & State Memory**: Clicking the Session History toggle (`toggleChatSessions`) preserves the current normal chat width and auto-expands the drawer to 500px (or last expanded width). Closing the session history restores the exact previous normal width.
  - **Adaptive Viewport Observer**: When the browser window resizes (< 1200px) and available editor space drops below 320px:
    1. First automatically closes the Sessions sidebar to keep the chat conversation visible at normal width.
    2. If available space remains below 320px, collapses the Chat Drawer entirely.
  - **Header & Session Sidebar Responsive Polish**:
    - Header action buttons (`New session`, `Toggle sessions`, `Close`) shielded with `flex-shrink: 0`.
    - Active session title and agent heading dynamically adapt with `min-width: 0`, `flex: 1`, and ellipsis truncation.
    - Master session sidebar constrained to **180px** with session card titles styled with `flex: 1`, `min-width: 0`, and native `title` tooltips.
  - **AI Provider & Model Upward Popover (`ChatProviderSelect.tsx`)**:
    - **Upward-Floating Position**: Positioned at `bottom: calc(100% + 8px); left: 0; z-index: 100; width: 325px;` with `0 8px 28px rgba(0,0,0,0.45)` shadow and smooth fade-in animation. Floats upwards above the composer footer.
    - **Zero CSS Clipping Rule**: Maintained `overflow: visible` across `.composer`, `.composer-footer`, `.composer-footer-left`, and `.composer-wrapper` to prevent clipping within the footer bar.
    - **Unified Multi-Provider Catalog**: Lists all 4 AI providers (`Antigravity`, `Claude`, `OpenCode`, `OpenRouter`) and all their standard + custom models simultaneously in one menu.
    - **Quick Filter Tabs**: Horizontal pills (`[Semua]`, `[AGY]`, `[CLD]`, `[OC]`, `[OR]`) with color-coded dot badges for instant single-provider filtering.
    - **Atomic Selection Handler**: Selecting any model immediately sets both provider and model on the active session (`setSessionModel`) and persists agent settings.
  - **Dual Provider & Model Message Badges (`ChatMessageList.tsx`)**:
    - Assistant message headers render both the provider tag (`[AGY]`, `[CLD]`, `[OC]`, `[OR]`) and the model identifier pill (`[gemini-3.8-flash-high]`), providing instant visibility of the serving engine.
  - **Live 2-Way Agentic Streaming & Real-Time SSE Consumer (`chatCore.ts`)**:
    - Replaced mock contextual responses with live Server-Sent Events (`POST /api/v1/ai/chat`) connecting directly to the Antigravity backend engine.
    - Typewriter streaming text updates with pulsing cursor (`.streaming-cursor`) and shimmer loader (`.message-body-streaming-shimmer`).
  - **Rich Agentic Baloon Architecture (`ChatMessageList.tsx` & `MarkdownRenderer.tsx`)**:
    - **Streaming-Safe Native Markdown Engine (`MarkdownRenderer.tsx`)**: Zero-dependency parser converting streaming AI chunks into styled HTML without bundle overhead. Automatically auto-closes unclosed code blocks and formatting markers during live stream, preventing layout shifts.
    - **Interactive Code Blocks & Git Review Gates (`MarkdownRenderer.tsx`)**: Fenced code blocks with language badge, syntax highlighting (reusing `tokenizeLine` token classes), one-click **Copy Code** button with feedback, and **Apply to Editor** / **Apply to <basename>** review gate button. Supports `lang:filepath` fence headers (e.g. ````ts:src/utils.ts````) to automatically route code to the correct file. Writing triggers path validation, dirty buffer prompt protection, and opens the changes immediately in `DiffEditorPane.tsx` side-by-side view. Omitted `[Insert at Cursor]` to maintain a lean UI and prevent focus-stealing bugs.
    - **Agent Multi-File Review Banner (`ChatMessageList.tsx`)**: Automatically inspects tool calls modifying workspace files (`write_to_file`, `replace_file_content`, `create_file`, `delete_file`). When files are changed, renders a bottom review banner: *"Modified N files: ..."* with a one-click **Review in Git** button navigating directly to the Source Control panel.
    - **Typography & Structural Elements**: Full support for headers (`#` to `####`), lists (unordered, ordered, task checkboxes `- [ ]` / `- [x]`), blockquotes (`>`), horizontal rules (`---`), and GitHub-Flavored Markdown tables.
    - **AegisCode Special Tokens**: Clickable `@file` / `@folder` mention pills that directly open the referenced file in the editor pane, and stylized `/command` chips for slash skills.
    - **Thinking Process Accordion (`.message-thinking-block`)**: Collapsible reasoning viewer with real-time in-progress pulsing indicator (`animate-pulse text-accent`).
    - **Interactive Tool Call Action Chips (`.tool-call-chip`)**: Real-time status indicators (spinner during execution, green checkmark on completion, red error badge on failure) with collapsible JSON arguments and tool output viewer (`.tool-call-details`).
    - **Dedicated In-Chat Error Cards (`.chat-error-card`)**: High-visibility error diagnostics with an actionable `Open Settings` button, preventing blank bubbles or unhandled exceptions.
    - **Empty State Guard**: Renders informative fallback (`Sedang menunggu respons...`) if generation concludes with empty text.
  - **In-Flight Control & Stop Generation (`ChatComposer.tsx`)**:
    - Send button dynamically transforms into a red accent **Stop Generation** button (`.composer-stop-btn`) while generation is active.
    - `Escape` key shortcut support to abort the in-flight SSE stream and immediately kill the child process via `AbortController`.
  - **Dynamic Skills & Command Autocomplete (`ChatCommandPopover.tsx`)**:
    - Autocomplete popover for `/` populated dynamically via `GET /api/v1/ai/skills` discovering all local Antigravity builtin skills (`/plan`, `/spec`, `/review`, `/goal`, etc.).
  - **Context Extractor Chips & Envelope Pre-Injection (`ChatComposer.tsx`)**:
    - Interactive chips capturing active editor selection or full file buffer, with estimated token counts, truncation guardrails (>50k chars), and dismiss memory.
    - Attached context files are pre-injected into a structured Markdown `<context>` block preceding the prompt, eliminating extra round-trips for file reading.
  - **Setup Needed Guard**:
    - Warning badge (`Icon name="warning"`) displayed when active provider lacks credentials, linking directly to Settings Modal.
  - **Multi-line Textarea Composer**: Resilient composer with model badge, attachment triggers, and submit button fitting cleanly at 300px minimum width.

### 7. Status Bar (`status-bar/`)
- **Path**: [`src/components/layout/status-bar/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/status-bar)
- **Primary Components**: `StatusBar.tsx`, `BranchPopover.tsx`, `ProblemsPopover.tsx`, `NotificationsPopover.tsx`, `status-bar.css`
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
  - **Strict Zero-Emoji UI**: 100% SVG UI `<Icon name="..." />` components across all settings cards and modal controls.

### 9. Command Palette (`command-palette/`)
- **Path**: [`src/components/layout/command-palette/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/command-palette)
- **Primary Components**: `CommandPalette.tsx`, `command-palette.css`
- **Visual Design & Floating Dropdown**:
  - **Direct Anchoring**: Rendered directly beneath the navbar search container (`top: calc(100% + 4px); width: 100%`), perfectly matching the 300px search bar width.
  - **Backdrop-Free Experience**: Completely eliminates dark blurred overlay/backdrop; workbench and code editor stay 100% bright, crisp, and visible while searching.
  - **Single Input UX**: Eliminates duplicate search bars; the navbar search bar itself serves as the interactive input, while the floating dropdown beneath exclusively displays command results.
  - **Results List**: Scrollable command list with uppercase section headers (`COMMANDS`), icons, bold labels, and muted detail subtitles with clean ellipsis truncation (`text-overflow: ellipsis`) for long items.
  - **Keyboard Navigation & Shortcuts**: Supports `⌘K` / `Ctrl+K` and `⌘P` / `Ctrl+P` toggle shortcuts, `Arrow Up/Down` for cyclical selection, `Enter` to execute, and `Escape` to close and reset query.
  - **Dismissal**: Outside-click dismissal via `pointerdown` listener on `document` and `Escape` key handling.
- **Tokens Used**: `bg-surface-overlay`, `border-line-bright`, `shadow-popover`, `text-ink`, `text-ink-soft`, `text-ink-muted`, `bg-surface-hover`.

---

## 3. Remote Tablet Companion View Mode

For remote multi-screen workflows on tablets (iPad, Android tablets):
- **Access Route**: `/?mode=companion` or paired via QR Code / local URL from Header.
- **Two Primary Switcher Tabs**:
  1. **Web Preview Host Tab**: Renders the running web application hosted by the local Go backend in a sandboxed, touch-friendly iframe/viewport with reload and address bar controls.
  2. **Focus Code Editor Tab**: Renders a distraction-free, touch-optimized single-pane text editor buffer without sidebars or bottom drawers. Allows direct code editing and instant auto-save synchronization back to the desktop workspace.

---

## 4. Design System & CSS Token Conventions

AegisCode enforces a **Strict 100% Hex Token Architecture** with zero arbitrary hex values in components and zero hardcoded `rgb()` / `rgba()` values. All styles reference semantic CSS tokens defined in [`src/styles/tokens.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/styles/tokens.css) and Tailwind CSS v4 `@theme`:

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
