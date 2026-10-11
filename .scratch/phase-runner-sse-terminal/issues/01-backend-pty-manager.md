# Issue 01: Backend Native PTY Manager & Process Supervisor
Status: resolved

## Description
Implement the Go native PTY session manager in `server/internal/terminal/manager.go` using `github.com/creack/pty`.

## Scope & Tasks
- [x] Add `github.com/creack/pty` to `server/go.mod`.
- [x] Implement `Session` struct holding cmd, pty master fd, broadcast channels, and cancel context.
- [x] Implement `Manager` struct:
  - `CreateSession(shell, cwd, cols, rows) (*Session, error)`
  - `WriteInput(sessionID, data) error`
  - `Resize(sessionID, cols, rows) error`
  - `CloseSession(sessionID) error`
  - `Subscribe(sessionID) (<-chan []byte, func(), error)`
- [x] Configure process isolation and send `SIGTERM`/`SIGKILL` to process tree on termination to prevent orphan processes.
- [x] Unit tests in `server/internal/terminal/manager_test.go`.

## Verification
- `go -C server test ./internal/terminal/...` passed (100% green).

## Answer
Native PTY session manager implemented in `server/internal/terminal/manager.go` with full POSIX PTY allocation, dynamic shell discovery, workspace CWD binding, and clean process group termination.
