# Issue 09: Preserve Terminal View Lifecycle Across Bottom Panel Tabs
Status: resolved

## Description
In `src/components/layout/bottom-panel/BottomPanel.tsx`, `<TerminalView />` is now preserved in the DOM when navigating between panel tabs (Terminal / Problems / Output) using CSS display toggling (`hidden` vs flex container).
`TerminalView.tsx`'s `syncSize` was also equipped with a clientWidth/clientHeight guard to avoid zero-dimension resizes when hidden.
This prevents the SSE connection from dropping and prevents the Go backend from terminating the shell process when the user views Output or Problems.

## Scope & Tasks
- [x] **Preserve Terminal DOM & State Across Tab Toggles (`BottomPanel.tsx`)**:
  - [x] Keep `<TerminalView />` mounted in the DOM when navigating between panel tabs.
  - [x] Use CSS display toggling (`flex ...` vs `hidden`) so terminal state, xterm instance, and SSE downlink remain alive.
  - [x] Add guard in `syncSize` to safely resume resizing when returning to the "Terminal" tab.
- [x] **Verification**:
  - [x] Verify terminal sessions and running processes survive tab switching without reconnecting or teardown.
  - [x] Run `rtk npm run build` (0 errors).
  - [x] Run `rtk npm run format` (clean).
