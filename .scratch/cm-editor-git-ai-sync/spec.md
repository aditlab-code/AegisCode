# Spec: Unbroken 3-Way Synchronization (CM Editor ↔ AI Drawer ↔ Source Control & Explorer)

## 1. Overview & Objective
This specification establishes an unbroken, real-time three-way synchronization pipeline between:
1. **CM Text Editor (`CMEditor.tsx`)**: Primary CodeMirror 6 engine for normal file editing and Git diff comparisons (`@codemirror/merge`).
2. **AI Drawer (`ChatDrawer.tsx` / `MarkdownRenderer.tsx`)**: Code application engine with Git-backed review gates (`applyCodeWithReview`).
3. **Source Control (`SourceControlPanel.tsx`) & Explorer (`ExplorerPanel.tsx`)**: Live tracking of working tree changes, commit graph, and visual dirty indicators on files and ancestor folders.

The objective is to eliminate race conditions, prevent stale state, ensure zero-redundancy (Single Source of Truth), and enforce strict styling without fallbacks.

---

## 2. Core Architectural Pillars

### Pillar A: Atomic Save Pipeline & Target Normalization
- **Race Condition Elimination**: All `saveFile` calls must be strictly asynchronous and awaited before querying `fetchDiff` or `refreshGit`.
- **Target Normalization**: If `saveFile` is invoked on a diff tab (e.g. `git-diff:src/App.tsx`), it must automatically resolve and strip the prefix to save the canonical target path `src/App.tsx`.
- **Atomic Cache Invalidation**: Saving to disk must atomically trigger:
  1. `workspace.saveFile(targetPath, hygiene)`
  2. `await git.refreshGit()`
  3. `setGitDiffVersion((v) => v + 1)`

### Pillar B: Seamless Auto-Save on Blur / Focus Transition
- When the user types in `CMEditor`, edits update `fileBuffers[path]` in-memory.
- When focus transitions away from `CMEditor` (e.g., clicking the Source Control panel, switching tabs, or focusing the AI Drawer), the editor triggers an automatic background save (`onSave?.()`).
- This guarantees that Source Control changes and the Git graph are always up-to-date without requiring explicit `⌘S` key presses.

### Pillar C: Unbroken 3-Way AI Drawer Review Flow
- When the AI Drawer applies code via `applyCodeWithReview`:
  1. Writes code directly to workspace disk.
  2. Updates in-memory `fileBuffers` cleanly (`savedContent = code`, `isDirty = false`).
  3. Atomically invalidates diff caches (`setGitDiffVersion++` & `refreshGit()`).
  4. Automatically opens the CodeMirror diff review gate (`openGitDiff(targetPath)`).
  5. Live tabs open in `CMEditor` immediately reflect the updated buffer without resetting cursor or remounting.
  6. Source Control changes list and Git graph reflect the modified file instantly.

### Pillar D: Dual-Layer Explorer Dirty Indicators
- **In-Memory Layer**: Any file with `fileBuffers[path]?.isDirty === true` immediately displays a dirty dot indicator (`●` in warning color) in the Explorer.
- **Ancestor Folder Propagation**: All ancestor folder segments of any dirty file are marked in `dirtyFoldersSet`, rendering a persistent dirty indicator dot on the parent folder.
- **Git Disk Layer**: Staged and unstaged Git status badges (`M`, `U`, `A`, `D`) remain active and synchronize in real-time when files are saved.

### Pillar E: Two-Way Reactivity from Source Control to Editor
- Staging, unstaging, or discarding changes in Source Control automatically synchronizes open `CMEditor` buffers (`fetchBufferSafely` on discard).
- Committing updates the Git commit graph and automatically updates or dismisses diff review tabs.

---

## 3. Invariants & Guardrails
1. **Zero Redundancy (SSOT)**: `CMEditor.tsx` is the sole visual component instantiating CodeMirror 6. `DiffEditorPane.tsx` acts purely as a Git Domain Controller.
2. **No Fallbacks**: No fallback to HTML `<textarea>` or `<pre>` tags. CodeMirror 6 and `@codemirror/merge` are the exclusive editing and comparison runtimes.
3. **No Hardcoded Hex Colors**: All syntax highlighting and diff chunk indicators use CSS variables from `src/styles/tokens.css`.
