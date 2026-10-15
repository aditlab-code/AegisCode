# Micro-Phase Execution & Verification Plan Table: Modular Refactoring of `server/internal/api/api.go`

> **Referensi Perencanaan & Delegasi Master Orchestrator (Kanna)**  
> Mengatur dekonstruksi refaktor modular monolitik `server/internal/api/api.go` (3.420 LOC) menjadi 10 domain file handler terisolasi.  
> Terhubung 1:1 dengan runtime log pada [`task/0-log-phase.md`](0-log-phase.md) dan kontrak spesifikasi pada [`task/0-spec-Orchestrator.md`](0-spec-Orchestrator.md).

---

## 1. Aturan Sinkronisasi Relasional

- **Wave Ref**: Merujuk langsung ke Wave ID (`W-1`, `W-2`, `W-3`, `W-4`).
- **Micro-Phase ID**: Format `MP-<Wave>.<SubStep>` (contoh: `MP-1.1`, `MP-1.2`).
- **Dynamic GAP Injection**: Jika ditemukan error kompilasi/tes, baris `MP-<Wave>.<SubStep>-FIX` wajib ditambahkan sebelum lanjut.
- **Status Lifecycle**: `PENDING` | `IN_PROGRESS` | `BLOCKED` | `PASSED`.

---

## 2. Dependency Map & Parallel Paths (Wave Architecture)

| Wave ID | Wave Name / Scope | Execution Topology (Linear / Parallel) | Prerequisites (Blockers) | Primary Objective | Readiness Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `W-1` | Core Infrastructure Handlers (Workspace, Git, Terminal, Supervisor) | Linear | Baseline tests passing | Pisahkan handler Workspace, Git, Terminal, dan Supervisor ke file masing-masing. | `PASSED` |
| `W-2` | Persistence, AI & DAP Handlers (Storage, AI, Debug) | Linear | `W-1` must be `PASSED` | Pisahkan handler Storage/State, AI Streaming, dan DAP Delve Debugger. | `PASSED` |
| `W-3` | Intelligence & Protocol Handlers (LSP, MCP, CodeGraph) | Linear | `W-2` must be `PASSED` | Pisahkan handler LSP (11 handlers), MCP (stdio & bridges), dan CodeGraph proxy. | `PASSED` |
| `W-4` | Orchestrator Slimdown & Full Gatekeeper Verification | Linear | `W-3` must be `PASSED` | Rampingkan `api.go` (~354 LOC), bersihkan unused imports, dan jalankan seluruh verification gates. | `PASSED` |

---

## 3. Micro-Phase Execution & Field Verification Status Table

### Legend Klasifikasi ID:
- `MOD` : Modular Extraction / File Splitting
- `ORC` : Orchestrator Slimdown
- `GATE`: Verification Gate

| Micro-Phase ID | Wave Ref | Track & Execution Nature | Target File(s) (File Isolation) | Resolved Scope | Atomic Execution Steps | Verification Gate (Smoke Test) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `MP-1.1` | `W-1` | Backend / Workspace | `server/internal/api/workspace_handlers.go` | `MOD-WS` | Buat file `workspace_handlers.go` dan pindahkan 16 workspace handler methods + struct `FilesFindResponse`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-1.2` | `W-1` | Backend / Git | `server/internal/api/git_handlers.go` | `MOD-GIT` | Buat file `git_handlers.go` dan pindahkan 21 git handler methods. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-1.3` | `W-1` | Backend / PTY & Supervisor | `server/internal/api/terminal_handlers.go`, `server/internal/api/supervisor_handlers.go` | `MOD-TERM-SUP` | Pindahkan terminal handlers + `BroadcastLog` ke `terminal_handlers.go`, dan worker handlers + `BroadcastWorkerCrash` ke `supervisor_handlers.go`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-2.1` | `W-2` | Backend / Storage | `server/internal/api/storage_handlers.go` | `MOD-STORE` | Pindahkan config, state, chat search/ledger, dan blob handlers ke `storage_handlers.go`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-2.2` | `W-2` | Backend / AI | `server/internal/api/ai_handlers.go` | `MOD-AI` | Pindahkan probe test, models, skills, transcript, dan chat stream handlers ke `ai_handlers.go`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-2.3` | `W-2` | Backend / Debug & System | `server/internal/api/debug_handlers.go` | `MOD-DEBUG` | Pindahkan Delve DAP handlers, `resolveGoProgram`, dan `handleSystemShutdown` ke `debug_handlers.go`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-3.1` | `W-3` | Backend / LSP | `server/internal/api/lsp_handlers.go` | `MOD-LSP` | Pindahkan 11 LSP handlers (open, change, save, close, symbols, completion, hover, definition, formatting, status, events) ke `lsp_handlers.go`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-3.2` | `W-3` | Backend / MCP | `server/internal/api/mcp_handlers.go` | `MOD-MCP` | Pindahkan MCP JSON-RPC, events ingest, status broadcast helpers, dan `initEventHubBridges` ke `mcp_handlers.go`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-3.3` | `W-3` | Backend / CodeGraph | `server/internal/api/codegraph_handlers.go` | `MOD-CG` | Pindahkan CodeGraph status, reindex, filecode, search, dan entrypoints handlers ke `codegraph_handlers.go`. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-4.1` | `W-4` | Backend / Orchestrator | `server/internal/api/api.go` | `ORC-CLEAN` | Rampingkan `api.go` (354 LOC) menyisakan `Server` struct, `NewServer()`, getters, middleware, dan `Routes()`. Bersihkan package imports yang tidak lagi digunakan. | `rtk go test ./internal/api/...` | `PASSED` |
| `MP-4.2` | `W-4` | System / Gatekeeper | Codebase wide | `GATE-ALL` | Jalankan gerbang pengujian menyeluruh: `rtk go test ./...` (198 passed), `rtk npm run build` (0 error), `rtk npm run format` (clean), dan `rtk npm run test:frontend` (304 passed). | `0 build errors & clean formatting` | `PASSED` |