# Issue 02: Code Fence Toolbar & Target File Resolution

Status: resolved
Role: Frontend UI & Markdown

## Description
Upgrade markdown code fence parsing in `MarkdownRenderer.tsx` with lean `lang:filepath` syntax support and a refined 2-button toolbar (`[Apply]` + `[Copy]`).

## Requirements
1. Update `parseMarkdownBlocks` in `src/components/layout/chat/MarkdownRenderer.tsx`:
   - Match `^```(\w+)(?::(\S+))?` to parse `lang` and optional `targetPath`.
2. Refactor `CodeBlockView`:
   - Display language badge and target path badge (if present).
   - If `targetPath` exists, render button as `Apply to <basename>` with full path in tooltip.
   - If no `targetPath`, render as `Apply to Editor` targeting `activeTab` (if `activeTab` is a non-diff file).
   - If no valid target can be resolved, show a warning toast on click.
   - Omit `[Insert at Cursor]` to maintain lean UI and avoid focus-stealing bugs.
