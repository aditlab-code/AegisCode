# Dynamic Feedback Hub & Runtime Log: Dirty File State Synchronization & Buffer Optimization

> **Document Type**: Runtime State Transitions & 4-Step CoT Blocker Hub (Phase 4)  
> **Status**: INITIALIZED (PENDING SENSEI APPROVAL)  
> **Author**: Shun for Adit-sensei  
> **Reference Plan**: [`task/0-Table-Phase.md`](0-Table-Phase.md)

---

## 1. Runtime State Overview

| Micro-Phase ID | Target File(s) | Status | Last Updated | Notes / Output |
| :--- | :--- | :--- | :--- | :--- |
| **MP-W1.1-STORE-DIRTY-MAP** | `src/store/types.ts`<br/>`src/store/slices/createWorkspaceSlice.ts` | `PASSED` | 2026-10-16 | Decoupled dirtyFiles map from fileBuffers content |
| **MP-W1.2-INVARIANT-TESTS** | `test/frontend/core/bufferLifecycleIntegrity.test.ts` | `PASSED` | 2026-10-16 | Added 4 unit tests verifying dirtyFiles reference stability |
| **MP-W2.1-EXPLORER-DECOUPLING** | `src/components/layout/sidebar/ExplorerPanel.tsx` | `PASSED` | 2026-10-16 | Switched buildExplorerGitDecorations to dirtyFiles map |
| **MP-W2.2-OUTLINE-DEBOUNCE** | `src/components/layout/sidebar/ExplorerPanel.tsx` | `PASSED` | 2026-10-16 | Debounced extractSymbols (350ms) and gated with outlineOpen |
| **MP-W3.1-TABS-DECOUPLING** | `src/components/layout/editor/EditorTabs.tsx` | `PASSED` | 2026-10-16 | Tab dirty & conflict indicators powered by tabFlagsMap and dirtyFiles |
| **MP-W4.1-GATES-AND-REGRESSIONS** | Full Repository | `PASSED` | 2026-10-16 | Full Vitest suite (322/322), Rolldown build (0 errors), oxfmt (0 errors), Go tests (15 pkgs ok) |

---

## 2. 4-Step CoT Execution Log

1. **Wave 1 (Store-Level Dirty State Decoupling)**:
   - **Trigger**: Keystrokes in CodeMirror produced new `fileBuffers` references on every character, causing downstream subscribers to re-render.
   - **Action**: Added `dirtyFiles: Record<string, boolean>` to `WorkspaceSlice`. Created `updateDirtyFilesLogic` which guarantees identical reference returns when dirty status is unchanged. Synced across `updateFileContent`, `saveFile`, `revertBufferContent`, `syncBufferWithDisk`, and `applyCodeWithReview`. Added comprehensive test suite in `bufferLifecycleIntegrity.test.ts`.
   - **Verification**: `rtk npm run test:frontend` passed 30 files, 322/322 tests.

2. **Wave 2 (Sidebar Explorer Decoupling & Lazy Outline)**:
   - **Trigger**: `ExplorerPanel.tsx` re-rendered on every keystroke and synchronously parsed symbols via `extractSymbols` at full file length.
   - **Action**: In `src/utils/explorerGitStatus.ts`, enhanced `buildExplorerGitDecorations` to accept `dirtyFilesOrBuffers` boolean map. In `ExplorerPanel.tsx`, replaced `fileBuffers` subscription with `dirtyFiles`. Made outline symbol extraction lazy (gated by `outlineOpen`) and debounced by listening to debounced content updates.
   - **Verification**: `rtk npm run test:frontend` passed 30 files, 322/322 tests.

3. **Wave 3 (EditorTabs Decoupling)**:
   - **Trigger**: `EditorTabs.tsx` subscribed to whole `fileBuffers`, causing all tabs and action icons to re-render on every keystroke even when the tab was already dirty.
   - **Action**: In `EditorTabs.tsx`, eliminated `fileBuffers` subscription from the main hook. Introduced a shallow-equal string flags map `tabFlagsMap` for open tab states (`${isDirty}:${hasDiskConflict}:${isDeletedOnDisk}:${hasConflict}`) which remains referentially equal while typing. Replaced revert button and context menu dirty checks with `dirtyFiles`.
   - **Verification**: `rtk npm run test:frontend` passed 30 files, 322/322 tests.

4. **Wave 4 (Verification Gates & Regression Checks)**:
   - `rtk npm run test:frontend`: 30 files, 322/322 passed.
   - `rtk npm run build`: Rolldown build succeeded in 782ms with 0 errors.
   - `rtk npm run format`: 174 files formatted cleanly with oxfmt.
   - `rtk go -C server test ./...`: 15 Go backend packages tested with 0 errors.

5. **Post-Wave 4 Fix (ExplorerPanel Open Editors List)**:
   - **Trigger**: Browser console error `ReferenceError: fileBuffers is not defined at ExplorerPanel.tsx:990:31`.
   - **Action**: Updated lines 952 and 990 in `ExplorerPanel.tsx` (Open Editors list for group 1 & group 2) to read `isDirty = Boolean(dirtyFiles[tab])` instead of the removed `fileBuffers` local variable.
   - **Verification**: `npm run build` (0 error), `npm run test:frontend` (322/322 passed), `npm run format` (174 files clean).