# Issue 02: DAP Client Proxy & JSON-RPC Protocol Bridge

Status: resolved
Blocked by: 01-delve-runner-and-process-lifecycle.md
Type: task

## Context & Objectives
Implement the lightweight DAP client in `server/internal/debug/client.go` to connect to the Delve TCP port, handle JSON-RPC message framing (Content-Length header + JSON body), and execute core DAP protocol sequences.

## Acceptance Criteria
- [x] Connects via TCP to `127.0.0.1:<port>` with timeout and retry backoff.
- [x] Implements DAP message framing: `Content-Length: <len>\r\n\r\n<payload>` reader and writer.
- [x] Supports request/response matching with sequence IDs (`seq`, `request_seq`, `command`).
- [x] Implements DAP commands: `initialize`, `launch`, `setBreakpoints`, `configurationDone`, `continue`, `next`, `stepIn`, `stepOut`, `pause`, `threads`, `stackTrace`, `scopes`, `variables`, and `disconnect`.
- [x] Listens for DAP asynchronous events (`stopped`, `continued`, `output`, `exited`, `terminated`) and dispatches them to internal event channels.
- [x] Unit tests verify handshake serialization and event parsing.
