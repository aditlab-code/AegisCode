# Issue 02: CMEditor Auto-Save on Blur & Focus Transition

Status: resolved
Role: Editor Core

## Description
Implement automatic background save on focus blur in `CMEditor.tsx` to keep disk and Git status in sync when switching between Editor, Source Control, and AI Drawer.

## Requirements
1. In `src/components/layout/editor/CMEditor.tsx`:
   - Attach blur event handling via `EditorView.domEventHandlers`:
     ```ts
     domEventHandlers: {
       blur() {
         if (!isReadOnly) {
           onSave?.()
         }
         return false
       }
     }
     ```
   - For `MergeView` in diff mode, attach blur handler to editor B (`mergeView.b`) so edits in the working copy auto-save when clicking outside.
2. Ensure auto-save does not trigger unnecessary disk writes if content is unchanged (`!isDirty`).
