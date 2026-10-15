# Spec: Bundled DAP Debugger (Delve `dlv`) Engine — Sub-Phase 6.5

## Overview
Sub-Phase 6.5 introduces native, step-by-step Go and backend debugging into AegisCode directly through the Web UI and Tablet Companion. Guided by ADR 0010, the Go Core Server supervises Delve (`dlv dap`) out-of-process, acts as a lightweight DAP client proxy converting REST and Server-Sent Events (SSE) into DAP JSON-RPC transactions over ephemeral localhost TCP, and renders gutter breakpoints, floating execution controls, and a call-stack/variables panel in the frontend workbench without external IDE extensions.

---

## Core Architectural Pillars

### 1. Supervised Delve Runner & Host Toolchain Resolution
- **Resolution**: Dynamically locates `dlv` on the host system via `exec.LookPath("dlv")` and checks `$GOPATH/bin/dlv` / `$HOME/go/bin/dlv`. If unavailable, returns an explicit `dlv_not_found` error payload with one-click installation guidance (`go install github.com/go-delve/delve/cmd/dlv@latest`).
- **Isolation**: Runs `dlv dap --listen=127.0.0.1:<ephemeral-port>` as a supervised child process with POSIX process group leadership (`Setsid`/`Setpgid`).
- **Fail-Safe Teardown**: Intercepts session termination, client disconnect, and server shutdown, issuing `SIGTERM` followed by a 250ms `SIGKILL` watchdog to `-pid`, guaranteeing zero zombie Delve processes or locked TCP ports.

### 2. DAP Client Proxy & JSON-RPC Bridge (`server/internal/debug`)
- **Connection**: Opens an internal TCP client connection to `127.0.0.1:<port>` once Delve starts.
- **Protocol Encoding**: Implements a lean DAP JSON-RPC codec handling:
  - `initialize` (capabilities negotiation)
  - `launch` / `attach` (compile and execute target Go package or attach to PID)
  - `setBreakpoints` (source file line registrations)
  - `configurationDone` (start program execution)
  - `continue`, `next` (step over), `stepIn`, `stepOut`, `pause`, `disconnect`
  - `threads`, `stackTrace`, `scopes`, `variables`
- **Concurrency**: Guarded by a thread-safe mutex state machine (`Uninitialized`, `Launching`, `Running`, `Stopped`, `Terminating`).

### 3. REST Control Endpoints & Real-Time SSE Stream
- **Control Endpoints**:
  - `POST /api/v1/debug/start`: Launches a debug session with package path, args, and env.
  - `POST /api/v1/debug/breakpoints`: Registers breakpoints for a file path.
  - `POST /api/v1/debug/step`: Dispatches execution control (`continue`, `stepOver`, `stepIn`, `stepOut`, `pause`).
  - `GET /api/v1/debug/state`: Returns active threads, current stack frame, and variables.
  - `POST /api/v1/debug/terminate`: Gracefully terminates the session and unlinks target process.
- **SSE Downlink (`/api/v1/events/debug`)**:
  - Streams real-time events: `debug:started`, `debug:stopped` (with reason, file, line), `debug:continued`, `debug:output` (stdout/stderr), and `debug:terminated`.

### 4. Frontend Workbench Integration
- **Editor Gutter Breakpoints (`CodePane.tsx`)**:
  - Clickable gutter margin toggling verified red breakpoint dots.
  - Synchronized with `editorCore.ts` / `workbenchFacade.ts`.
- **Active Execution Line Highlight**:
  - Distinct yellow/accent line background with arrow indicator on the stopped line.
- **Floating Debug Toolbar (`DebugToolbar.tsx`)**:
  - Draggable floating bar with Continue (`F5`), Step Over (`F10`), Step Into (`F11`), Step Out (`Shift+F11`), Restart, and Stop buttons.
- **Variables & Call Stack View (`BottomPanel.tsx` / `Sidebar.tsx`)**:
  - Collapsible tree view showing local variables, function arguments, struct fields, and stack frames when paused.

---

## Verification & Quality Gates
- **Backend Tests**: Unit tests for Delve launcher, DAP JSON-RPC codec, breakpoint manager, and REST/SSE handlers.
- **Frontend Tests**: State machine tests for breakpoint toggling, debug session lifecycle, and toolbar actions.
- **Mandatory Gates**: `rtk npm test`, `rtk npm run build`, `rtk npm run format` (0 errors).
