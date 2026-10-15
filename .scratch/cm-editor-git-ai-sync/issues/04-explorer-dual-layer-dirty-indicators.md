# Issue 04: Explorer Dual-Layer Dirty Indicators for Files & Folders

Status: resolved
Role: Explorer & Workspace UI

## Description
Provide real-time visual dirty indicators in the Explorer tree for both in-memory unsaved edits (`fileBuffers.isDirty`) and Git disk modifications (`stagedChanges` & `gitChanges`), propagating dirty dots up to ancestor folders.

## Requirements
1. In `src/utils/explorerGitStatus.ts`:
   - Update `buildExplorerGitDecorations` signature to accept optional `fileBuffers: Record<string, FileBuffer>`.
   - Iterate `fileBuffers`: if `buffer.isDirty === true`:
     - If file has no Git badge in `gitStatusMap`, register a badge or indicator (`{ code: "●", colorClass: "text-warning", title: "Unsaved Changes" }`).
     - Propagate all ancestor folder segments of the dirty file into `dirtyFoldersSet`.
2. In `src/components/layout/sidebar/ExplorerPanel.tsx`:
   - Pass `fileBuffers` to `buildExplorerGitDecorations(stagedChanges, gitChanges, fileBuffers)`.
   - Update `useMemo` dependency array to include `fileBuffers`.
   - Render the dirty dot on files and folders whenever `isDirty` is true.
