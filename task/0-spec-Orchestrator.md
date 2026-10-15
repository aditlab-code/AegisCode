# Task Specification & Architecture Contract: Modular Refactoring of `server/internal/api/api.go`

> **Dokumen Spesifikasi Teknis & Batasan Arsitektur**  
> Dibuat pada **Phase Analyze** oleh Master Orchestrator (Kanna) sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Berisi kontrak batas sistem, pemisahan domain internal Go package `api`, pemetaan LSP & MCP, dan jaminan zero breaking changes.

---

## 1. Executive Summary & Problem Statement

- **Target Component:** `server/internal/api/api.go` (AegisCode Backend HTTP Layer)
- **Current Metric:** 1 file monolitik, 3,420 lines of code (LOC), 64 HTTP handlers
- **Target Metric:** 1 orchestrator file (`api.go`, ~280 LOC) + 10 domain handler files (~150–550 LOC each)
- **Breaking Changes:** 0 (Zero breaking changes, tetap dalam `package api`, identik 100% dengan HTTP contract frontend)
- **Current Verified Baseline:** 198 Go tests passing (`server`), 304 Vitest tests passing, 0 build errors.

---

## 2. Invariants & Architectural Boundaries

1. **Package-Internal Cohesion**:
   - Seluruh file baru tetap berada dalam `package api` di direktori `server/internal/api/`.
   - Menggunakan receiver method Go `(s *Server)` sehingga tidak mengubah visibilitas, signature fungsi, maupun pemanggilan dari package luar (`server/cmd/server/main.go`).
2. **Lean & Direct (Prime Directive)**:
   - Tidak menambahkan layer abstraksi baru, DDD overhead, atau interface yang tidak perlu.
   - Tetap menggunakan `s.ws`, `s.git`, `s.terminal`, `s.supervisor`, `s.store`, `s.debug`, `s.lsp`, `s.mcp`, `s.codegraph`, `s.eventHub`, `s.pairing` secara langsung.
3. **LSP & MCP Isolation**:
   - **LSP Handlers** (`lsp_handlers.go`): Mengisolasi 11 handler LSP (`handleLSPOpen`, `handleLSPChange`, `handleLSPSave`, `handleLSPClose`, `handleLSPSymbols`, `handleLSPCompletion`, `handleLSPHover`, `handleLSPDefinition`, `handleLSPFormatting`, `handleLSPStatus`, `handleLSPEvents`).
   - **MCP Handlers** (`mcp_handlers.go`): Mengisolasi JSON-RPC stdio proxy (`handleMCP`), event ingest (`handleMCPEventsIngest`), event broadcast lifecycle (`BroadcastMCPEventStatus`), dan bridge event hub (`initEventHubBridges`).
4. **Shared Types & Utilities**:
   - `types.go`, `events_hub.go`, dan `pairing.go` dipertahankan apa adanya.
   - Helper transport `jsonResponse`, `jsonError`, `isOriginAllowed`, `isPublicEndpoint`, dan `corsAndAuthMiddleware` tetap berada di `api.go` agar dapat diakses oleh seluruh domain handlers.

---

## 3. Granite Decomposition Matrix

| Target File | Domain / Scope | Handler Methods / Functions | Est. LOC |
| :--- | :--- | :--- | :--- |
| `api.go` | Core Orchestrator | `Server` struct, `NewServer()`, getters, transport middleware, `Routes()` | ~280 |
| `workspace_handlers.go` | Workspace & Filesystem | `handleWorkspaceInfo`, `Open`, `Close`, `PickFolder`, `Browse`, `CreateFolder`, `Tree`, `File`, `FileRaw`, `CsvQuery`, `Rename`, `Move`, `Search`, `FilesFind`, `IndexStats`, `ReplaceAll`, struct `FilesFindResponse` | ~560 |
| `git_handlers.go` | Version Control (Git) | `handleGitStatus`, `Init`, `Unlock`, `Branches`, `BranchCheckout`, `BranchCreate`, `Log`, `Timeline`, `Stage`, `Unstage`, `Discard`, `Commit`, `Push`, `Pull`, `Sync`, `Tags`, `TagCreate`, `TagPush`, `AddRemote`, `Diff`, `Compare` | ~400 |
| `terminal_handlers.go` | PTY Terminal & Logs | `handleTerminalCreate`, `Sessions`, `Operations`, `Events`, `LogsEvents`, `WorkspaceEvents`, helper `BroadcastLog` | ~320 |
| `supervisor_handlers.go` | Process Supervisor | `handleWorkersList`, `Operations`, `Events`, helper `BroadcastWorkerCrash` | ~160 |
| `storage_handlers.go` | Flat-File Storage & State | `handleConfig`, `State`, `StateRecent`, `ChatSearch`, `ChatsList`, `ChatOperations`, `Blob` | ~345 |
| `ai_handlers.go` | AI Assistant & Streaming | `handleAITest`, `Models`, `Skills`, `Transcript`, `ChatStream` | ~255 |
| `debug_handlers.go` | Delve DAP & System Shutdown | `handleDebugStart`, `Breakpoints`, `Step`, `State`, `Terminate`, `Events`, `handleSystemShutdown`, helper `resolveGoProgram` | ~300 |
| `lsp_handlers.go` | Language Server Protocol | `handleLSPOpen`, `Change`, `Save`, `Close`, `Symbols`, `Completion`, `Hover`, `Definition`, `Formatting`, `Status`, `Events` | ~240 |
| `mcp_handlers.go` | Model Context Protocol | `handleMCP`, `handleMCPEventsIngest`, `broadcastMCPEvent`, `broadcastMCPEventStatus`, `BroadcastMCPEvent`, `BroadcastMCPEventStatus`, `initEventHubBridges` | ~160 |
| `codegraph_handlers.go` | CodeGraph AST Daemon Proxy | `handleCodeGraphStatus`, `Reindex`, `File`, `SymbolsSearch`, `Entrypoints` | ~265 |

---

## 4. Quality & Verification Gates

Eksekusi wajib mematuhi gerbang validasi berikut:
1. `rtk go test ./internal/api/...` (di direktori `server/`) -> Semua 46 unit test API harus lolos tanpa modifikasi test file.
2. `rtk go test ./...` (di direktori `server/`) -> Seluruh 198 unit test backend harus PASS.
3. `rtk npm run build` (di root) -> Vite frontend build 0 error.
4. `rtk npm run format` (di root) -> oxfmt formatter clean.
