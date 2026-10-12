# Issue 03: Git-Backed Side-by-Side Review Gate Workflow

Status: resolved
Role: Frontend Core & Git Flow

## Description
Connect code block "Apply" action to disk write and automatic side-by-side Git review gate opening.

## Requirements
1. In `src/context/core/workbenchFacade.ts` and `workspaceCore.ts`:
   - Implement `applyCodeWithReview(targetPath: string, code: string)`:
     - Check if `fileBuffers[targetPath]?.isDirty`: prompt confirmation if dirty before writing.
     - Write code to disk via `saveWorkspaceFile(targetPath, code, false)`.
     - Synchronize `fileBuffers[targetPath]`: set `content = code`, `savedContent = code`, `isDirty = false`, `hasDiskConflict = false`.
     - Invalidate diff cache (`gitDiffVersion++` / `refreshGit()`).
     - Open/focus `makeGitDiffTab(targetPath)` in `DiffEditorPane.tsx`.
     - Display toast: `Applied to ${targetPath} — Opened Git review`.
