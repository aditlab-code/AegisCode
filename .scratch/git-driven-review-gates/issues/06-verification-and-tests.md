# Issue 06: Verification Gates, Unit Tests & Formatting

Status: resolved
Role: Testing & Quality Assurance

## Description
Validate all backend security and frontend flow implementations with automated test coverage and pass all required verification gates.

## Requirements
1. Backend Tests:
   - Add unit tests in `server/internal/workspace/workspace_test.go` and `server/internal/api/api_test.go` verifying boundary security against directory traversal attacks (`../`, `/etc`, etc.).
   - Run `rtk go test ./...` in `server/` (must pass 100%).
2. Frontend Tests:
   - Add unit tests in `test/frontend/` verifying `lang:filepath` code fence parsing, target file resolution, and boundary validation.
   - Run `rtk npx vitest run` (must pass 100%).
3. Verification Gates:
   - Run `rtk npm run build` (0 errors).
   - Run `rtk npm run format` (clean oxfmt).
