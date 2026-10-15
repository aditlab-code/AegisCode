# Issue 06: Variables & Call Stack Panel

Status: resolved
Blocked by: 05-floating-debug-toolbar-and-shortcuts.md
Type: task

## Context & Objectives
Add a dedicated Debug view inside the Bottom Panel (`src/components/layout/bottom-panel/DebugView.tsx`) or Sidebar to inspect variables, goroutines, and the active call stack when execution is stopped.

## Acceptance Criteria
- [x] Add tab `Debug` to `BottomPanel.tsx` with bug/play icon.
- [x] **Variables Section**: Expandable tree listing local variables, function arguments, and struct values fetched from `GET /api/v1/debug/state`.
- [x] **Call Stack Section**: List active goroutines and stack frames with function names, file basenames, and line numbers.
- [x] Clicking a stack frame navigates to that file and highlights the line in `CodePane.tsx`.
- [x] Empty state when debugger is inactive: "No active debug session. Press F5 or Start Debugging".
- [x] Unit tests verify tree rendering and frame navigation click handler.
