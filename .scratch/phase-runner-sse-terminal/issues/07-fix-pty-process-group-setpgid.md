# Issue 07: Fix PTY Process Group Leader (Setpgid) and Clean Process Termination
Status: resolved

## Description
During code review, a critical defect was identified in `server/internal/terminal/manager.go`:
`spec.md:7` specifies: `github.com/creack/pty in Go, with Setpgid for clean process group tree termination`.
However, `cmd.SysProcAttr` was never initialized with `Setpgid: true`. In investigation, `creack/pty`'s `StartWithSize` internally sets `Setsid: true` and `Setctty: true` on Unix (which automatically makes the child process the leader of its own session and process group, pgid == pid; setting `Setpgid: true` concurrently returns `EPERM`).
We established platform-specific helpers (`manager_unix.go` and `manager_windows.go`) ensuring proper process group targeting via `syscall.Kill(-pid, sig)`.
We also resolved all silent error handling (`_ =`) by adding proper warning logs and error returns, and extracted `withSession` to eliminate duplicated lookup code.

## Scope & Tasks
- [x] **Configure Process Group Leader (`server/internal/terminal/manager.go`)**:
  - [x] Establish platform helpers (`manager_unix.go` and `manager_windows.go`) for cross-platform process group creation and signaling.
  - [x] Target process group (`-pid`) cleanly via `killProcessGroup`.
- [x] **Fix Process Group Teardown & Error Reporting**:
  - [x] In `CloseSession`, check error returns from `killProcessGroup`, `sess.Cmd.Wait()`, and `sess.Pty.Close()`.
  - [x] Log warning or error messages instead of discarding errors with blank identifiers (`_ = ...`).
- [x] **Refactor Duplicated Session Lookup**:
  - [x] Extract `withSession(sessionID, fn)` helper to eliminate duplicated lock-and-check boilerplate across `WriteInput` and `Resize`.
- [x] **Tests & Verification**:
  - [x] Add `TestProcessGroupTermination` in `manager_test.go` verifying process group teardown with background subprocesses.
  - [x] `go test ./internal/terminal/...` (100% pass).
