# Issue 11: Project Logs Streaming & Spec Conformance Harmonization
Status: resolved

## Description
Code review identified that `GET /api/v1/events/logs` only streamed terminal lifecycle events, and that scope additions were not formally harmonized in the feature spec.
This has been resolved:
- `server/internal/api/api.go` now broadcasts real-time server and workspace operational events (root mount, unmount, rescan) to the `Server` log channel.
- `spec.md` was updated to document all API endpoints (`/api/v1/terminal/sessions`, `/api/v1/terminal/:sessionId`, `/api/v1/events/workspace`) and dev orchestration tooling (`scripts/dev-all.js`).

## Scope & Tasks
- [x] **Stream Server & Workspace Events to Project Logs (`server/internal/api/api.go`)**:
  - [x] Add log broadcast calls when workspace roots are mounted, switched, or closed.
  - [x] Stream real-time operational server logs to the Output tab over `/api/v1/events/logs`.
- [x] **Harmonize Spec & Documentation**:
  - [x] Document all terminal endpoints and dev orchestrator script in `spec.md`.
- [x] **Verification**:
  - [x] `go test ./...` in server (100% pass).
  - [x] `rtk npm run build` & `rtk npm run format` (clean).
