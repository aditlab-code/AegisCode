# Issue 05: Floating Debug Toolbar & Keyboard Shortcuts

Status: resolved
Blocked by: 04-editor-gutter-breakpoints-and-active-line.md
Type: task

## Context & Objectives
Implement the floating debug action bar (`src/components/layout/editor/DebugToolbar.tsx`) and bind global keyboard shortcuts in `workbenchFacade.ts` to trigger debugging execution controls.

## Acceptance Criteria
- [x] Create `DebugToolbar.tsx` rendered at the top-center of the editor area when a debug session is active (`isDebugging: true`).
- [x] Action buttons:
  - Continue / Pause (`F5`)
  - Step Over (`F10`)
  - Step Into (`F11`)
  - Step Out (`Shift+F11`)
  - Restart (`Ctrl/Cmd+Shift+F5`)
  - Stop (`Shift+F5`)
- [x] Wire actions to backend REST API via `src/utils/debugApi.ts`.
- [x] Add global keydown listener handling standard debugging function keys (`F5`, `F10`, `F11`).
- [x] Use Tailwind semantic tokens (`bg-surface`, `border-line`, `text-ink`, `bg-accent`).
- [x] Unit tests verify action dispatching and shortcut bindings.
