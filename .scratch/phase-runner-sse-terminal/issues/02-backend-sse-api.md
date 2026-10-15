# Issue 02: Backend HTTP & SSE API Endpoints
Status: resolved

## Description
Expose terminal management, bidirectional streaming (SSE downlink + HTTP POST uplink), and project log streaming in `server/internal/api`.

## Scope & Tasks
- [x] Add request/response types in `server/internal/api/types.go` (`CreateTerminalRequest`, `TerminalInputRequest`, `TerminalResizeRequest`, etc.).
- [x] Implement HTTP handlers in `server/internal/api/api.go`:
  - `POST /api/v1/terminal/create`
  - `GET /api/v1/events/terminal/:sessionId` (Base64 chunk streaming + 15s keepalive ping)
  - `POST /api/v1/terminal/:sessionId/input`
  - `POST /api/v1/terminal/:sessionId/resize`
  - `DELETE /api/v1/terminal/:sessionId`
  - `GET /api/v1/terminal/sessions`
- [x] Implement `GET /api/v1/events/logs` to broadcast project/task execution logs for the Output tab.
- [x] Unit tests in `server/internal/api/api_test.go`.

## Verification
- `go -C server test ./internal/api/...` passed (100% green).

## Answer
API endpoints and SSE routes registered in `server/internal/api/api.go`, supporting Base64-encoded chunk streaming, keep-alive heartbeats, and client disconnect cleanup.
