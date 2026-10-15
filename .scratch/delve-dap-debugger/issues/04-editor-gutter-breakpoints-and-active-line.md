# Issue 04: Editor Gutter Breakpoints & Active Line Highlighting

Status: resolved
Blocked by: 03-debug-api-endpoints-and-sse-streaming.md
Type: task

## Context & Objectives
Enhance `CodePane.tsx` and editor state core (`src/context/core/editorCore.ts`) to support clicking line number gutters to toggle breakpoints, rendering red breakpoint dots, and highlighting the active stopped execution line.

## Acceptance Criteria
- [x] Maintain `breakpoints: Record<string, number[]>` (map of filePath -> line numbers) in editor state.
- [x] Gutter click handler in `CodePane.tsx` adds/removes breakpoint on clicked line.
- [x] Gutter displays a styled red dot indicator on lines with registered breakpoints.
- [x] When debug status is `stopped`, highlight the current execution line with a distinct yellow/accent background and left arrow glyph.
- [x] Synchronize active breakpoints to backend via `POST /api/v1/debug/breakpoints`.
- [x] Unit tests verify breakpoint addition, removal, and active line state rendering.
