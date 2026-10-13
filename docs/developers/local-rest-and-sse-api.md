# Local REST & Server-Sent Events (SSE) API Reference

The AegisCode Go core server exposes a high-performance HTTP and SSE API on `127.0.0.1:8080` (or dynamically allocated port). All endpoints use JSON payloads and enforce strict workspace boundary confinement.

---

## 1. General Conventions & Error Standards

* **Host Binding**: Exclusively `127.0.0.1` (localhost).
* **Content Types**:
  - Standard REST: `application/json; charset=utf-8`
  - Real-Time Streaming: `text/event-stream`
* **Error Format**:
  ```json
  {
    "error": "File outside workspace root boundary",
    "code": 403
  }
  ```
  AegisCode never catches errors silently: any validation failure immediately returns an explicit HTTP error status (`400`, `403`, `404`, `409`, `500`).

---

## 2. Workspace & File System Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/workspace/info` | Returns active workspace root path and metadata |
| `POST` | `/api/v1/workspace/open` | Opens a new workspace directory (`{"path": "..."}`) |
| `POST` | `/api/v1/workspace/close` | Closes the active workspace |
| `GET` | `/api/v1/workspace/tree` | Returns the hierarchical file tree representation |
| `GET` | `/api/v1/workspace/file?path=<rel>` | Retrieves UTF-8 file content |
| `POST` | `/api/v1/workspace/file` | Creates or saves file content (`{"path": "...", "content": "..."}`) |
| `DELETE` | `/api/v1/workspace/file?path=<rel>` | Deletes a file within the workspace |
| `POST` | `/api/v1/workspace/folder` | Creates a new directory (`{"path": "..."}`) |
| `POST` | `/api/v1/workspace/rename` | Renames a file or directory |
| `POST` | `/api/v1/workspace/search` | Full-workspace text search |
| `POST` | `/api/v1/workspace/replace-all` | Batch find-and-replace across files |

---

## 3. Git Operations Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/git/status` | Returns staged, unstaged, untracked, and conflicting files |
| `POST` | `/api/v1/git/stage` | Stages file paths (`{"paths": ["..."]}`) |
| `POST` | `/api/v1/git/unstage` | Unstages file paths |
| `POST` | `/api/v1/git/discard` | Discards unstaged modifications safely |
| `POST` | `/api/v1/git/commit` | Commits staged changes (`{"message": "..."}`) |
| `GET` | `/api/v1/git/diff?path=<rel>` | Returns unified diff for an individual file |
| `GET` | `/api/v1/git/branches` | Lists local and remote branches |
| `POST` | `/api/v1/git/branch/checkout` | Checks out a branch |
| `POST` | `/api/v1/git/push` | Pushes commits to remote |
| `POST` | `/api/v1/git/pull` | Pulls commits from remote |

---

## 4. CodeGraph & AST Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/codegraph/status` | Returns indexing status, file count, and symbol count |
| `POST` | `/api/v1/codegraph/reindex` | Forces a complete re-scan and AST re-indexing |
| `GET` | `/api/v1/codegraph/file?path=<rel>` | Returns all AST symbols and local edges in a file |
| `GET` | `/api/v1/codegraph/workspace` | Returns full workspace graph for Cytoscape canvas |
| `GET` | `/api/v1/codegraph/neighborhood?symbol=<name>` | Queries sub-graph neighborhood around a symbol |
| `GET` | `/api/v1/codegraph/symbols/search?q=<query>` | FTS5 symbol lookup |

---

## 5. Delve Debugger Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/debug/start` | Spawns `dlv dap` and launches debug session |
| `POST` | `/api/v1/debug/breakpoints` | Synchronizes breakpoints (`{"file": "...", "lines": [...]}`) |
| `POST` | `/api/v1/debug/step` | Execution control (`{"action": "next|in|out|continue"}`) |
| `GET` | `/api/v1/debug/state` | Returns call stack, active line, and variable scopes |
| `POST` | `/api/v1/debug/terminate` | Terminates debuggee process and shuts down Delve |
| `GET` | `/api/v1/events/debug` | **SSE Stream**: Broadcasts breakpoint hit and stopped events |

---

## 6. Terminal PTY Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/terminal/create` | Spawns a new PTY shell session (`{"cols": 80, "rows": 24}`) |
| `GET` | `/api/v1/terminal/sessions` | Lists active terminal sessions |
| `DELETE` | `/api/v1/terminal/{id}` | Terminates a terminal session |
| `POST` | `/api/v1/terminal/{id}/resize` | Updates terminal dimensions |
| `POST` | `/api/v1/terminal/{id}/write` | Writes input data to `stdin` |
| `GET` | `/api/v1/events/terminal/{id}` | **SSE Stream**: Streams terminal output buffer |

---

## 7. AI Assistant & Model Context Protocol (MCP)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/ai/chat` | **SSE Stream**: Streams token deltas, thoughts, and tool calls |
| `GET` | `/api/v1/chats` | Lists project-scoped chat sessions |
| `GET` | `/api/v1/chats/{id}` | Returns append-only event ledger for a session |
| `GET` | `/api/v1/chats/search?q=<query>` | FTS5 full-text search across past conversations |
| `POST` | `/api/v1/mcp` | Handles incoming MCP JSON-RPC 2.0 tool requests |
