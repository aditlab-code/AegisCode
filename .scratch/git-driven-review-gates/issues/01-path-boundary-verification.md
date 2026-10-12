# Issue 01: Dual-Layer Path Boundary Verification

Status: resolved
Role: Backend & API Client

## Description
Prevent path traversal attacks (`../`, `/etc/passwd`, out-of-workspace writes) by strictly evaluating paths before disk operations.

## Requirements
1. In `server/internal/workspace/workspace.go` (`resolvePath`):
   - Evaluate `filepath.Rel(root, target)`.
   - Reject any path resolving outside `rootPath` or beginning with `..`.
   - In `handleWorkspaceFile` (`server/internal/api/api.go`), return HTTP 400 Bad Request on boundary validation errors.
   - Add unit tests in `workspace_test.go` and `api_test.go` verifying rejection of traversal attempts (`../../`, absolute paths outside root, root escape).
2. In frontend `src/utils/workspaceApi.ts` (`saveWorkspaceFile`):
   - Add pre-flight check rejecting paths containing `..` or leading absolute roots before issuing HTTP requests.
