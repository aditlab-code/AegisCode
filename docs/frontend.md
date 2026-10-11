# AegisCode Frontend UI Design Reference

> **Purpose**: Single source of truth for the active UI design and visual layout structure.  
> **Rule**: Must be updated whenever visual components, layout regions, or styling paradigms change.  
> **Design Principles**: Reusable Tailwind tokens, reusable UI components, zero arbitrary hex codes, lightweight modular layouts.

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

---

## 2. Layout Modules (by Folder)

All layout modules live in [`src/components/layout/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout) with co-located CSS files and self-contained sub-components:

### 1. Header (`header/`)
- **Path**: [`src/components/layout/header/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/header)
- **Primary Components**: `Header.tsx`, `WindowControls.tsx`, `AppMenu.tsx`, `GlobalSearchButton.tsx`, `HeaderActions.tsx`, `header.css`
- **Visual Design**:
  - macOS-style traffic light window controls (red/yellow/green) with hover icons and Aegis branding badge.
  - Dropdown application menu: File, Edit, View, Run, Terminal, Help.
  - Centered quick launcher button triggering the Command Palette (`⌘K` / `Ctrl+K`).
  - Action buttons on the right: toggle primary sidebar, toggle bottom drawer, toggle AI agent chat, toggle companion pairing modal.
- **Tokens Used**: `bg-surface`, `border-line`, `text-ink`, `text-ink-muted`.

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
- **Visual Design**:
  - Resizable horizontal width (default 260px) bounded by an interactive drag sash (`ResizeSash.tsx`).
  - **Explorer Panel**:
    - "OPEN EDITORS" section showing pinned tabs across editor groups.
    - Workspace file tree with folder expansion, tree guides, hidden file visibility toggle, inline CRUD actions (New File, New Folder, Rename, safe Delete confirmation modal), Refresh Explorer, and Collapse Folders in Explorer (`collapse-all`).
    - Context menu on right-click (Copy Path, Copy Relative Path, Delete, Rename).
  - **Search Panel**:
    - **Integrated Search & Replace Box**: Chevron toggle (`>` / `v`) located directly to the left of the Search input box; when expanded, renders the Replace input box directly beneath with an embedded Replace All action icon button (`Icon name="replace-all"`).
    - **Search Modifiers**: Match Case (`Aa`), Match Whole Word (`\b`), and Use Regular Expression (`.*`).
    - **Results Toolbar**: Header actions for Refresh Search (`⟳`), Clear Results (`✕`), and Collapse/Expand All (`⊞`).
    - **Match Keyword Highlighting**: Matched terms inside code snippets highlighted with semantic token `--color-warning-soft` / `--color-warning` (`.match-highlight`).
    - **Hover-Only File & Match Actions**: Count badges displayed by default; Replace in File (`[edit]`), Dismiss File (`[✕]`), and Replace Match (`[edit]`) action buttons revealed dynamically on row hover (`:hover`).
    - **Clean Directory Path Formatting**: Files at root workspace display clean filename only (no `./`); subfolder paths displayed in muted text (`text-ink-muted`).
    - **Direct Backend Engine**: Live workspace regex search and granular replace (single occurrence, file-level, workspace-wide) backed directly by Go server API with immediate search result refresh.
  - **Source Control Panel**:
    - **Header & Action Menu**: Action bar with Refresh Git status (`⟳`) and '...' menu (Pull, Push, Fetch & Sync, Create Tag, Push Tags, Add Remote).
    - **Repositories Section**: Displays active repository folder, branch badge with dirty state (`*`), and live Sync button with ahead/behind counters (`↓behind ↑ahead`).
    - **Changes & Staged Changes**: Collapsible lists with granular file status codes (`M` modified, `A` added, `D` deleted, `U` untracked), additions/deletions counts, hover actions for Stage (`+`), Unstage (`-`), and Discard (`⎌`).
    - **Commit Box**: Multi-line message input with `⌘Enter` / `Ctrl+Enter` commit dispatch, AI commit message draft generator (`sparkle` icon).
    - **Responsive Split Commit Button**: Full-width container with primary Commit button, vertical dividing line, and chevron dropdown (`Commit`, `Commit & Push`).
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
    - **Left Pane (Original)**: Read-only display of HEAD or previous commit revision with red background diff highlights.
    - **Right Pane (Modified)**: Live-editable buffer connected directly to `fileBuffers` (when viewing working copy), saveable via `⌘S` / `Ctrl+S`, with green background diff highlights.
    - **Synchronized Scrolling**: Dual-pane vertical and horizontal scroll synchronization.
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
- **Primary Components**: `ChatDrawer.tsx`, `ChatHeader.tsx`, `ChatSessionSidebar.tsx`, `ChatMessageList.tsx`, `ChatSuggestions.tsx`, `ChatComposer.tsx`, `ChatCommandPopover.tsx`, `ChatProviderSelect.tsx`, `chat.css`
- **Visual Design**:
  - Split master-detail layout: Session history sidebar toggle on left, main chat conversation on right.
  - Model & Provider selector: Grouped dropdown supporting local runners, cloud providers, and custom endpoints.
  - Floating autocomplete popover triggered on `/` (Skills & Slash commands) and `@` (File paths & Context tags).
  - Quick action suggestion pills above the input composer.
  - Multi-line textarea composer with code snippet attachments and execution buttons.

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
- **Primary Components**: `SettingsModal.tsx`, `settings-modal.css`
- **Visual Design**:
  - Modal overlay with dimmed backdrop.
  - Two-column VS Code-style preferences: Left category rail (Editor, Terminal, AI Agent, Theme, Network) and right settings card list.
  - Top search input with instant regex filtering across all settings options.

### 9. Command Palette (`command-palette/`)
- **Path**: [`src/components/layout/command-palette/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/command-palette)
- **Primary Components**: `CommandPalette.tsx`, `command-palette.css`
- **Visual Design**:
  - Centered modal launcher (`⌘K`).
  - Search input with keyboard navigation (`Arrow Up/Down`, `Enter` to select, `Escape` to close).
  - Grouped commands: File navigation, View toggles, Git commands, AI prompts, Theme switches.

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
