# Spec: Phase Runner SSE Terminal

## Overview
Implement native PTY pseudo-terminal execution and Server-Sent Events (SSE) streaming in the AegisCode Go Core Server, paired with an `@xterm/xterm` emulator in the React frontend. Provides full-fidelity OS interactive shell (`zsh`, `bash`) execution, workspace cwd binding, provider CLI support (`antigravity` / `agy`), real-time project logs streaming, and real-time multi-file workspace change synchronization.

## Architecture & Protocols
- **PTY Engine**: `github.com/creack/pty` in Go, with session and process group leadership (`Setsid`) for clean process group tree termination (`syscall.Kill(-pid, sig)`).
- **SSE Downlink**: `GET /api/v1/events/terminal/:sessionId` streaming base64-encoded PTY chunks + keepalive pings.
- **Workspace Sync Downlink**: `GET /api/v1/events/workspace` streaming debounced file change events (`created`, `modified`, `deleted`).
- **HTTP Uplink & Control**:
  - `POST /api/v1/terminal/create`: Provision PTY shell session.
  - `GET /api/v1/terminal/sessions`: List active terminal sessions and metadata.
  - `POST /api/v1/terminal/:sessionId/input`: Stream keystroke inputs.
  - `POST /api/v1/terminal/:sessionId/resize`: Propagate viewport dimension changes (`cols`, `rows`).
  - `DELETE /api/v1/terminal/:sessionId`: Explicit termination of PTY session.
- **Project Logs**: `GET /api/v1/events/logs` streaming task & server execution logs to the Output tab.
- **Frontend Emulator**: `@xterm/xterm` dynamically styled with AegisCode semantic tokens (`src/styles/tokens.css`). Preserved in DOM across panel tab changes to prevent premature disconnects.
- **Environment & CWD**: Inherits host environment (`PATH` with `agy`, `homebrew`, etc.), sets `TERM=xterm-256color`, `LANG=en_US.UTF-8`, and defaults `CWD` to active workspace root.
- **Stateless Lifecycle**: Abrupt disconnect immediately kills PTY master and process group, ensuring zero zombie processes.
- **Dev Orchestration**: `npm run dev:all` (`scripts/dev-all.js`) providing unified supervision of Vite frontend and Go backend server.
