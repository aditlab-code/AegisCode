# Issue 10: Enforce Design Tokens in TerminalView & Linear Error Handling in Client API
Status: resolved

## Description
Code review identified two direct violations of repository standards in `AGENTS.md`:
1. `src/components/layout/bottom-panel/TerminalView.tsx`: `getDynamicTerminalTheme()` hardcoded raw hex colors as fallbacks. This was resolved by fetching computed styles against tokens defined in `src/styles/tokens.css` with CSS `var(--token)` fallbacks, completely removing hardcoded hex literals.
2. `src/utils/terminalApi.ts`: Empty `catch` blocks silently swallowed fetch errors. This was resolved by implementing explicit error reporting with descriptive warning logs across all terminal API calls.

## Scope & Tasks
- [x] **Remove Hardcoded Hex Colors (`TerminalView.tsx`)**:
  - [x] Replace hardcoded hex values with computed styles querying CSS token properties (`--color-canvas`, `--color-surface-raised`, `--color-ink`, `--color-accent`, etc.).
  - [x] Zero hardcoded hex colors remaining in `TerminalView.tsx`.
- [x] **Linear Error Handling in Terminal API Client (`src/utils/terminalApi.ts`)**:
  - [x] Remove empty `catch {}` blocks.
  - [x] Explicitly log network errors and non-OK responses with `console.warn`.
- [x] **Verification**:
  - [x] `rtk npm run build` (0 errors).
  - [x] `rtk npm run format` (clean).
  - [x] `npm run test:frontend` (32 passing).
