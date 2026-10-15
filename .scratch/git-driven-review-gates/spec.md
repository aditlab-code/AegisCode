# Spec: Git-Driven Review Gates (Apply & Code Manipulation) — Sub-Phase 6.10

## Overview
Sub-Phase 6.10 bridges AI code generation with native Git version control in AegisCode. It eliminates "blind overwrites" by establishing a Git-backed side-by-side review gate for applied AI changes, secures the filesystem against directory traversal, provides clean code block actions in chat, and provides batch review shortcuts for multi-file agent modifications without redundant temporary buffers.

## Core Architectural Pillars

### 1. Dual-Layer Path Boundary Verification
- **Go Backend (`server/internal/workspace/workspace.go`)**:
  - Harden `resolvePath` to strictly evaluate `filepath.Rel(m.rootPath, target)`.
  - Reject paths containing `..` escape sequences or absolute paths pointing outside `m.rootPath` with HTTP 400 Bad Request.
- **Frontend Client (`src/utils/workspaceApi.ts`)**:
  - Pre-flight path validation in `saveWorkspaceFile` ensuring target paths resolve strictly within the active workspace root.

### 2. Pragmatic Target File Resolution
- **Markdown Code Fence Parser (`src/components/layout/chat/MarkdownRenderer.tsx`)**:
  - Detect `lang:filepath` header syntax (e.g. ````ts:src/utils.ts````) using lightweight non-over-engineered parsing.
  - If a file path is present, label the action button `[Apply to <basename>]` targeting that exact path.
  - If no file path is in the fence, fallback to `activeTab` (skipping diff tabs `git-diff:*`).
  - If no target file is open or resolved, display an interactive warning toast.

### 3. Git-Backed Review Gate Execution & Buffer Safety
- **Apply Workflow**:
  - **Dirty Buffer Protection**: If target file buffer has unsaved manual changes (`isDirty: true`), prompt confirmation before writing.
  - **Disk Write**: Write directly to `/api/v1/workspace/file`.
  - **Buffer Synchronization**: Update `fileBuffers[targetPath]` with `{ content: newContent, savedContent: newContent, isDirty: false, hasDiskConflict: false }`.
  - **Diff Trigger**: Invalidate Git diff cache (`gitDiffVersion++`) and automatically open/switch to `makeGitDiffTab(targetPath)` in `DiffEditorPane.tsx`.
- **Zero Temporary Buffers**:
  - Accept via native Git **Stage** / **Commit**.
  - Reject via native Git **Discard Changes** (restores HEAD on disk, deletes untracked files, closes diff tab, cleanly reloads buffer if open in regular tab).

### 4. Agent Multi-File Batch Review
- When AI autonomous agent modifies multiple workspace files via tool calls (`write_to_file`):
  - Render an interactive review card in the chat message footer: *"Modified N files: ..."* with button `[Review All in Source Control]`.
  - Clicking navigates directly to `SourceControlPanel.tsx` with sidebar expanded.

### 5. Lean UI & Anti-Leak Memory Management
- **Toolbar**: 2 clean buttons: `[Apply to Editor]` (or `[Apply to <file>]`) and `[Copy]`. Omit `[Insert at Cursor]` to prevent DOM focus-stealing bugs.
- **Memory**: Do not create duplicate orphaned `fileBuffers` for files only previewed in diff; clean up promises and diff data when `DiffEditorPane.tsx` unmounts.
