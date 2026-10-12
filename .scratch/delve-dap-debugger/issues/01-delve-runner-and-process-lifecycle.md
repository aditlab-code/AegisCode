# Issue 01: Supervised Delve Runner & Host Toolchain Resolution

Status: resolved
Blocked by: none
Type: task

## Context & Objectives
Implement the out-of-process runner for Delve (`dlv dap`) within the Go Core Server (`server/internal/debug/runner.go`), resolving the host toolchain dynamically and guaranteeing fail-safe process teardown.

## Acceptance Criteria
- [x] Resolves `dlv` executable via `exec.LookPath("dlv")` and fallback paths (`$GOPATH/bin`, `$HOME/go/bin`).
- [x] Returns structured error payload if `dlv` is missing, containing 1-click installation instruction.
- [x] Allocates an ephemeral localhost TCP port (`127.0.0.1:<port>`) and spawns `dlv dap --listen=127.0.0.1:<port>`.
- [x] Enforces process group isolation (`Setpgid`/`Setsid`) on POSIX systems.
- [x] Implements clean termination via `SIGTERM` followed by a 250ms `SIGKILL` watchdog to `-pid`, releasing TCP ports immediately.
- [x] Unit tests verify launcher startup, port extraction, and clean shutdown.
