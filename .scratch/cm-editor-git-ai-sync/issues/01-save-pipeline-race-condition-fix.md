# Issue 01: Save Pipeline Race Condition Elimination & Tab Target Normalization

Status: resolved
Role: Frontend Core & Git Flow

## Description
Eliminate the race condition where `fetchDiff` queries the backend before asynchronous disk writes complete, and normalize tab target paths so saving diff tabs (`git-diff:*`) properly resolves to canonical file paths.

## Requirements
1. In `src/context/core/workbenchFacade.ts`:
   - In `saveFile(filenameToSave)`:
     - Normalize `target`: if `isGitDiffTab(target)`, extract canonical file via `parseGitDiffTab(target)?.file`.
     - Await `workspace.saveFile(target, hygiene)`.
     - Atomically await `gitRef.current?.refreshGit()`.
     - Atomically trigger `setGitDiffVersion((v) => v + 1)`.
2. In `src/components/layout/editor/DiffEditorPane.tsx`:
   - In `handleSave`:
     - Make `handleSave` async.
     - Strictly await `saveFile(file)`.
     - Only after `saveFile` completes, execute `fetchDiff(file, staged, commit)` to update `diffData`.
3. In `src/components/layout/editor/CMEditor.tsx`:
   - Ensure `onSave` invocation from keymap (`Mod-s`) handles async execution cleanly.
