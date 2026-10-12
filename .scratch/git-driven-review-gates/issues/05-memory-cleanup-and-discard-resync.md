# Issue 05: Memory Management & Discard Synchronization

Status: resolved
Role: Editor Lifecycle & Memory

## Description
Ensure DiffEditorPane cleans up async state on unmount and discard operations cleanly restore in-memory buffers without state pollution.

## Requirements
1. In `src/components/layout/editor/DiffEditorPane.tsx`:
   - Verify unmount cancellation flag (`isCancelled = true`) cleanly releases diff payload.
   - Do not populate `fileBuffers` with orphaned entries if the file was never opened in a regular editor tab.
2. In `src/context/core/gitCore.ts` / `workbenchFacade.ts`:
   - In `discardChange`: if the discarded file has an active buffer in `fileBuffers`, re-fetch its clean HEAD state via `fetchBufferSafely(file)` and clear any dirty/conflict flags.
