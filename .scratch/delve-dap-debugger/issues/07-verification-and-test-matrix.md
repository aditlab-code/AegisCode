# Issue 07: Comprehensive Regression Verification & Quality Gates

Status: resolved
Blocked by: 06-call-stack-and-variables-view.md
Type: task

## Context & Objectives
Implement end-to-end unit and integration tests across both frontend and backend for the DAP Delve debugger, registering scenarios into the Core Test Matrix and passing all mandatory quality gates.

## Acceptance Criteria
- [x] Backend test suite `server/internal/debug/runner_test.go` and `server/internal/debug/client_test.go` covering handshake, port allocation, and error handling.
- [x] Integration test in `test/backend/core/server_core_test.go` testing `/api/v1/debug/*` endpoints.
- [x] Frontend unit tests in `test/frontend/debug/debugWorkflow.test.ts` verifying breakpoint toggle, toolbar actions, and active line state.
- [x] Pass `rtk npm test` (all frontend Vitest suites + all Go backend packages).
- [x] Pass `rtk npm run build` (0 errors).
- [x] Pass `rtk npm run format` with oxfmt.
