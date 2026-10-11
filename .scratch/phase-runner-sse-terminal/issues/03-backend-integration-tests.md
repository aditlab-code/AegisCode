# Issue 03: End-to-End Integration Test Harness
Status: resolved

## Description
Validate terminal session creation, input execution, SSE stream reception, and clean shutdown through the live server test harness in `test/backend/core`.

## Scope & Tasks
- [x] Add `TestTerminalSessionSSEWorkflow` in `test/backend/core/server_core_test.go`:
  - Spin up live test server.
  - Call `POST /api/v1/terminal/create`.
  - Subscribe to SSE stream `GET /api/v1/events/terminal/:sessionId`.
  - Send input `echo "HELLO_AEGIS_PTY"` via `POST /api/v1/terminal/:sessionId/input`.
  - Validate SSE receives chunk containing `HELLO_AEGIS_PTY`.
  - Delete session and verify cleanup.

## Verification
- `go -C test/backend test ./...` passed (100% green).

## Answer
Integration test `TestTerminalSessionSSEWorkflow` passes end-to-end verifying PTY allocation, SSE chunk reception, HTTP input routing, and clean teardown.
