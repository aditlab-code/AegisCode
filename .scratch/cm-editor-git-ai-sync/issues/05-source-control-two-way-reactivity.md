# Issue 05: Source Control Two-Way Reactivity to Active CMEditor Tabs

Status: resolved
Role: Source Control Core

## Description
Ensure Git operations (stage, unstage, discard, commit, branch checkout) immediately react across all open CMEditor tabs (normal files and diff tabs) without requiring manual reloads.

## Requirements
1. In `src/context/core/workbenchFacade.ts`:
   - `discardChangeWithBufferSync(file)`: ensures discarded files re-fetch their disk content via `fetchBufferSafely(file)` and update active buffers.
   - When staging or unstaging, update `gitDiffVersion` to re-fetch hunks on open diff tabs.
2. In `src/context/core/gitCore.ts`:
   - Ensure `refreshGit()` triggers listener updates cleanly.
   - Ensure `commitChanges` refreshes commit graph (`gitCommits`) and updates changes list.
