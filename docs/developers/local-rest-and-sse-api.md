# Local REST & Server-Sent Events (SSE) API Reference

The AegisCode Go core server exposes a high-performance HTTP and SSE API on `http://127.0.0.1:<PORT>` (allocated dynamically at startup or explicitly configured via `--port` / `AEGIS_PORT`). All endpoints use JSON payloads and enforce strict workspace boundary confinement.

---

## 1. General Conventions & Error Standards

* **Host Binding & Dynamic Port Discovery**: Exclusively `127.0.0.1` (localhost) or local LAN in companion mode. By default, the server binds to an available port dynamically. The active address is output on stdout at process start (`Listening on http://127.0.0.1:<PORT>`), or can be overridden via `--port <PORT>` / `export AEGIS_PORT=<PORT>`.
* **Zero-Trust Session Authentication**: Critical or mutating endpoints (`/api/v1/system/shutdown`, `/api/v1/terminal/create`) strictly require the `X-Session-Token` or `X-Pairing-Token` header, even when initiated over loopback.
* **Content Types**:
  - Standard REST: `application/json; charset=utf-8`
  - Real-Time Streaming: `text/event-stream`
  - Raw Binary File Transfer: `application/octet-stream` or auto-detected MIME with `Range` header support.
* **Error Format**:
  ```json
  {
    "error": "File outside workspace root boundary",
    "code": 403
  }
  ```
  AegisCode never catches errors silently: any validation failure immediately returns an explicit HTTP error status (`400`, `403`, `404`, `409`, `500`).

---

## 2. Unified Server-Sent Events (SSE) & Real-Time Streams

All background telemetry and real-time events are multiplexed over a single persistent TCP connection per ADR-0016 to prevent browser HTTP/1.1 socket pool starvation:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/events` | **Unified SSE Multiplexer**: Streams topics (`workspace`, `lsp`, `debug`, `mcp`, `logs`, `workers`) over a single socket with 15s keep-alive ping. |
| `GET` | `/api/v1/events/terminal/{id}` | **Live PTY SSE Stream**: Streams lossless raw byte buffers for active terminal emulator sessions. |

---

## 3. Workspace & File System Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/workspace/info` | Returns active workspace root path and metadata |
| `POST` | `/api/v1/workspace/open` | Opens a new workspace directory (`{"path": "..."}`) |
| `POST` | `/api/v1/workspace/close` | Closes active workspace and resets internal watchers |
| `GET` | `/api/v1/workspace/tree` | Returns the hierarchical file tree representation |
| `GET` | `/api/v1/workspace/file?path=<rel>` | Retrieves UTF-8 file content |
| `GET` | `/api/v1/workspace/file/raw?path=<rel>` | Zero-copy binary file transfer (supports HTTP 206 Partial Content) |
| `POST` | `/api/v1/workspace/file` | Creates or saves file content (`{"path": "...", "content": "..."}`) |
| `DELETE` | `/api/v1/workspace/file?path=<rel>` | Deletes a file within the workspace boundary |
| `POST` | `/api/v1/workspace/folder` | Creates a new directory (`{"path": "..."}`) |
| `POST` | `/api/v1/workspace/rename` | Renames a file or directory (returns 400/404/409 on error) |
| `POST` | `/api/v1/workspace/move` | Moves a file or directory to a target directory |
| `POST` | `/api/v1/workspace/search` | Full-workspace regex text search |
| `POST` | `/api/v1/workspace/replace-all` | Batch find-and-replace across files |
| `GET` | `/api/v1/workspace/csv/query` | Big Data CSV/TSV query engine (row windowing, seek, search) |

---

## 4. Git Operations Endpoints

All operations execute through `git.Service` with internal mutex serialization and transient lock recovery:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/git/status` | Returns staged, unstaged, untracked, conflicting files, and branch metadata |
| `POST` | `/api/v1/git/init` | Initializes a new Git repository |
| `POST` | `/api/v1/git/stage` | Stages file paths (`{"paths": ["..."]}`) |
| `POST` | `/api/v1/git/unstage` | Unstages file paths |
| `POST` | `/api/v1/git/discard` | Discards unstaged modifications safely |
| `POST` | `/api/v1/git/commit` | Commits staged changes (`{"message": "..."}`) |
| `GET` | `/api/v1/git/diff?file=<path>&staged=<bool>` | Returns unified diff for an individual file |
| `GET` | `/api/v1/git/compare?base=<hash>&target=<hash>` | Compares arbitrary commits and returns changed files |
| `GET` | `/api/v1/git/branches` | Lists local and remote tracking branches |
| `POST` | `/api/v1/git/branch/checkout` | Checks out a branch or commit |
| `POST` | `/api/v1/git/branch/create` | Creates a new branch |
| `GET` | `/api/v1/git/log?limit=<n>` | Retrieves commit history nodes with author and branch decorations |
| `GET` | `/api/v1/git/timeline?file=<path>&limit=<n>` | Retrieves commit history specific to a file for the Timeline panel |
| `POST` | `/api/v1/git/push` | Pushes commits to remote |
| `POST` | `/api/v1/git/pull` | Pulls commits from remote |
| `POST` | `/api/v1/git/sync` | Pulls and pushes in a synchronized operation |

---

## 5. Terminal & Worker Supervision Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/terminal/create` | Spawns a new PTY session with dynamic OS shell resolution |
| `GET` | `/api/v1/terminal/sessions` | Lists active terminal sessions |
| `POST` | `/api/v1/terminal/:sessionId/write` | Writes input data to `stdin` |
| `POST` | `/api/v1/terminal/:sessionId/resize` | Updates terminal dimensions (`cols`, `rows`) |
| `DELETE` | `/api/v1/terminal/:sessionId` | Terminates terminal session process tree |
| `GET` | `/api/v1/workers` | Retrieves status, PID, and uptime of supervised workers |
| `POST` | `/api/v1/workers` | Registers and launches a new supervised worker process |
| `GET` | `/api/v1/workers/:id` | Retrieves live metadata for a specific worker |
| `GET` | `/api/v1/workers/:id/logs` | Returns in-memory ring buffer log history |
| `POST` | `/api/v1/workers/:id/stop` | Gracefully shuts down a worker process |

---

## 6. Optional External Tooling: Standalone CodeGraph & Custom MCP (Phase 26 Strategic Decoupling)

> [!NOTE]
> In Phase 26, CodeGraph reverse proxying and internal MCP JSON-RPC endpoints were decoupled from the default Core Server binary to keep runtime footprint under 30MB and eliminate mandatory background daemon dependencies. Symbol and outline resolution are 100% unified under native **Language Server Protocol (LSP)** (`/api/v1/lsp/*`).  
> Users wishing to inspect visual call-graphs can run the standalone CodeGraph daemon (`npx @colbymchenry/codegraph ui --port 3333`) independently.

---

## 7. Delve Debugger (DAP) Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/debug/start` | Spawns `dlv dap` and launches debug target |
| `POST` | `/api/v1/debug/breakpoints` | Synchronizes breakpoints (`{"file": "...", "lines": [...]}`) |
| `POST` | `/api/v1/debug/step` | Execution control (`{"action": "continue|stepOver|stepIn|stepOut"}`) |
| `GET` | `/api/v1/debug/state` | Returns call stack, active line, and variable scopes |
| `POST` | `/api/v1/debug/terminate` | Terminates debuggee process cleanly (with Windows tree-kill support) |

---

## 8. AI Assistant & Conversational Ledger Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/ai/chat` | **SSE Stream**: Streams token deltas, thoughts, and tool call traces |
| `GET` | `/api/v1/chats` | Lists project-scoped chat sessions from SQLite database |
| `GET` | `/api/v1/chats/{id}` | Returns append-only event ledger for a session |
| `GET` | `/api/v1/chats/search?q=<query>` | FTS5 full-text search across past conversations |
| `GET` | `/api/v1/ai/models` | Discovers available CLI models with 5-minute memory cache |
| `GET` | `/api/v1/ai/skills` | Dynamic discovery of workspace and system agent skills |
| `GET` | `/api/v1/ai/transcript/{id}` | Rehydrates chat session history directly from provider logs |

---

## 9. Deprecated & Legacy Endpoints (Historical Reference)

The following endpoints have been decommissioned or superseded during Phase 5 optimization and Phase 26 Strategic Decoupling and are preserved for historical audit only:

### A. Purged Dead Endpoints (Removed from ServeMux)
| Endpoint | Method | Audit ID | Disposition / Replacement |
| :--- | :---: | :---: | :--- |
| `/api/v1/auth/handshake` | `POST` | `OPT-API-01` | **Purged**. Zero frontend callers; companion token handshake moved to LAN pairing module. |
| `/api/v1/pairing/info` | `GET` | `OPT-API-02` | **Purged**. Zero frontend callers; integrated into status bar pairing popover. |
| `/api/v1/mcp/rpc` | `POST` | `OPT-API-03` | **Purged**. Duplicate alias to `/api/v1/mcp`. |
| `/api/v1/mcp/events` | `GET/POST`| `OPT-API-04` | **Purged**. Dead standalone SSE stream; replaced by unified `/api/v1/events`. |
| `/api/v1/codegraph/init` | `POST` | `OPT-API-05` | **Purged**. Dead index initialization endpoint. |
| `/api/codegraph/entrypoints`| `GET` | `OPT-API-14` | **Purged**. Duplicate route registration. |
| `/api/v1/mcp` | `POST` | `PHASE-26` | **Decoupled**. Internal MCP daemon removed from core server; external MCP clients connect standalone. |
| `/api/v1/events/mcp` | `POST` | `PHASE-26` | **Decoupled**. Ingest bridge purged; real-time event bridges moved to `events_hub.go`. |
| `/api/v1/codegraph/*` | `ALL` | `PHASE-26` | **Decoupled**. Reverse proxy and stubs removed; symbols/outlines powered natively by LSP (`/api/v1/lsp/*`). |
| `/api/codegraph/ui/*` | `ALL` | `PHASE-26` | **Decoupled**. CodeGraph UI reverse proxy removed from default server binary. |

### B. Deprecated Standalone SSE Streams (Superseded by Unified EventHub)
| Endpoint | Method | Audit ID | Disposition / Replacement |
| :--- | :---: | :---: | :--- |
| `/api/v1/events/workspace` | `GET` | `OPT-API-07` | **Deprecated**. Superseded by `GET /api/v1/events` channel `"workspace"`. |
| `/api/v1/events/workers` | `GET` | `OPT-API-08` | **Deprecated**. Superseded by `GET /api/v1/events` channel `"workers"`. |
| `/api/v1/events/logs` | `GET` | `OPT-API-12` | **Deprecated**. Superseded by `GET /api/v1/events` channel `"logs"` via `WorkbenchEventHub.ts`. |
| `/api/v1/events/debug` | `GET` | `OPT-API-13` | **Deprecated**. Superseded by `GET /api/v1/events` channel `"debug"`. |
| `/api/v1/events/lsp` | `GET` | `OPT-API-13` | **Deprecated**. Superseded by `GET /api/v1/events` channel `"lsp"`. |


