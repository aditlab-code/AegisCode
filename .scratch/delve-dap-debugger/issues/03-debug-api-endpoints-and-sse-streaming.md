# Issue 03: Debug REST Endpoints & Real-Time SSE Stream

Status: resolved
Blocked by: 02-dap-client-proxy-and-jsonrpc-bridge.md
Type: task

## Context & Objectives
Wire the DAP proxy into the Core Server HTTP router (`server/internal/api/api.go`), providing clean REST control endpoints and a Server-Sent Events downlink for the UI Shell.

## Acceptance Criteria
- [x] Implement `POST /api/v1/debug/start`: Starts a session (or returns `404` / `400` with clear diagnostics if `dlv` is missing or compile fails).
- [x] Implement `POST /api/v1/debug/breakpoints`: Receives `{ file: string, lines: number[] }` and syncs with Delve `setBreakpoints`.
- [x] Implement `POST /api/v1/debug/step`: Dispatches execution control `{ action: "continue" | "stepOver" | "stepIn" | "stepOut" | "pause" }`.
- [x] Implement `GET /api/v1/debug/state`: Returns `{ status, currentFile, currentLine, stackFrames, variables, threads }`.
- [x] Implement `POST /api/v1/debug/terminate`: Gracefully terminates session and unlinks target process.
- [x] Implement `GET /api/v1/events/debug`: Streams real-time SSE events (`debug:started`, `debug:stopped`, `debug:continued`, `debug:output`, `debug:terminated`).
- [x] Unit & HTTP integration tests in `server/internal/api/api_test.go`.
