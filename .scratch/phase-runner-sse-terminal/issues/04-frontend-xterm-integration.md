# Issue 04: Frontend @xterm/xterm Integration & Bottom Panel
Status: resolved

## Description
Integrate `@xterm/xterm` into `TerminalView.tsx`, replace mock terminal logic in `terminalCore.ts` with real API calls, and wire multi-session controls in `BottomPanel.tsx`.

## Scope & Tasks
- [x] Add `@xterm/xterm` and `@xterm/addon-fit` to `package.json`.
- [x] Update `src/context/core/terminalCore.ts` to manage real server terminal sessions (`createTerminalSession`, `closeTerminalSession`, active session syncing).
- [x] Update `src/components/layout/bottom-panel/TerminalView.tsx`:
  - Mount xterm canvas with theme derived from `tokens.css`.
  - Connect to SSE `EventSource` on `/api/v1/events/terminal/:sessionId`.
  - Decode Base64 payloads and stream into `term.write`.
  - Intercept keystrokes with `term.onData` and forward to `/input`.
  - Attach `FitAddon` + `ResizeObserver` to sync terminal window geometry.
- [x] Update `src/components/layout/bottom-panel/BottomPanel.tsx`:
  - Shell dropdown (zsh, bash, sh) and multi-session tab bar.
  - Connect Output tab channels to SSE project logs.
- [x] Style terminal container in `bottom-panel.css`.

## Verification
- `npm run test:frontend` passed (32 tests passed).
- `npm run build` passed with 0 errors.

## Answer
`@xterm/xterm` is fully mounted with AegisCode Tailwind token colors, micro-batched input handling, resize observation, multi-session tabs, and live Output tab log streaming.
