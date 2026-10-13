# Architecture Decision Records (ADRs)

This directory catalogs the **Architecture Decision Records (ADRs)** for **AegisCode**. Each document captures an important architectural decision, its context, technical alternatives considered, and downstream consequences.

---

## 📑 ADR Catalog (ADR 0001 – ADR 0013)

| ADR | Title | Category | Status | One-Sentence Summary |
| :---: | :--- | :--- | :---: | :--- |
| **[0001](0001-hybrid-process-architecture.md)** | Hybrid Process Architecture | Core Architecture | `Accepted` | Separates high-performance Go core server from lightweight React 19 UI front-end. |
| **[0002](0002-app-data-directory-and-legacy-migration.md)** | App Data Directory & Zero-DB Storage | Storage & Isolation | `Superceded` | Isolated configs inside `~/.aegis/` to prevent repository clutter (superceded by ADR 0013). |
| **[0003](0003-core-server-runtime-golang.md)** | Core Server Runtime in Golang | Core Architecture | `Accepted` | Standardizes backend runtime on Go for fast startup, low RAM, and concurrency. |
| **[0004](0004-worker-supervision-and-agent-isolation.md)** | Worker Supervision & Agent Isolation | Supervision | `Accepted` | Enforces process-group isolation (`setpgid`) and watchdog cleanup for child workers. |
| **[0005](0005-unix-domain-sockets-for-agent-ipc.md)** | Unix Domain Sockets for Agent IPC | IPC & Security | `Accepted` | Adopts local Unix sockets with user permissions (`0700`) for low-overhead secure IPC. |
| **[0006](0006-pragmatic-go-package-layout.md)** | Pragmatic Go Package Layout | Codebase Design | `Accepted` | Enforces flat package boundaries under `server/internal/*` without over-engineered DDD layers. |
| **[0007](0007-non-destructive-shadow-migration.md)** | Non-Destructive Shadow Migration | Storage & Migration| `Superceded` | Safely migrated legacy v1 configs without modifying user project files (superceded by ADR 0013). |
| **[0008](0008-typed-contract-generation.md)** | Typed Contract Generation | API & Types | `Accepted` | Generates shared TypeScript types from Go structs to prevent API drift. |
| **[0009](0009-append-only-chat-graph-ledger.md)** | Append-Only Chat Graph Ledger | AI & Ledger | `Superceded` | Established append-only tree structure for chat events and branching (migrated to SQLite in ADR 0013). |
| **[0010](0010-bundled-dap-delve-debugger.md)** | Bundled DAP Delve Debugger | Debugging | `Accepted` | Integrates native JSON-RPC client directly with Go Delve (`dlv dap`) for zero-config debugging. |
| **[0011](0011-zustand-modular-slices-and-zero-breaking-bridge.md)** | Zustand Modular Slices & Bridge | Frontend State | `Accepted` | Splits monolithic frontend store into cohesive slices while preserving backwards compatibility. |
| **[0012](0012-zero-freeze-architecture-go-first-offloading-and-web-workers.md)** | Zero-Freeze Architecture | Performance | `Accepted` | Offloads heavy AST indexing, graph layouts, and stream parsing to Go backend and Web Workers. |
| **[0013](0013-embedded-pure-go-sqlite-and-fts5-search.md)** | Embedded Pure-Go SQLite & FTS5 | Storage & Search | `Accepted` | Replaces fragmented flat-files with transactional pure-Go SQLite (`modernc.org/sqlite`) in WAL mode with FTS5. |

---

## 🏛️ Decisions by Architecture Domain

### 1. Core Architecture & Runtime
- **[ADR 0001: Hybrid Process Architecture](0001-hybrid-process-architecture.md)**
- **[ADR 0003: Core Server Runtime in Golang](0003-core-server-runtime-golang.md)**
- **[ADR 0006: Pragmatic Go Package Layout](0006-pragmatic-go-package-layout.md)**

### 2. Process Supervision, IPC & Security
- **[ADR 0004: Worker Supervision and Agent Isolation](0004-worker-supervision-and-agent-isolation.md)**
- **[ADR 0005: Unix Domain Sockets for Agent IPC](0005-unix-domain-sockets-for-agent-ipc.md)**

### 3. Database, Ledger & Search Engine
- **[ADR 0013: Embedded Pure-Go SQLite Engine and FTS5 Search](0013-embedded-pure-go-sqlite-and-fts5-search.md)**
- Historical context: [ADR 0002](0002-app-data-directory-and-legacy-migration.md), [ADR 0007](0007-non-destructive-shadow-migration.md), [ADR 0009](0009-append-only-chat-graph-ledger.md)

### 4. Debugging & Developer Tools
- **[ADR 0010: Bundled DAP Delve Debugger](0010-bundled-dap-delve-debugger.md)**

### 5. Frontend Architecture & Responsiveness
- **[ADR 0008: Typed Contract Generation](0008-typed-contract-generation.md)**
- **[ADR 0011: Zustand Modular Slices and Zero-Breaking Bridge](0011-zustand-modular-slices-and-zero-breaking-bridge.md)**
- **[ADR 0012: Zero-Freeze Architecture: Go-First Offloading and Web Workers](0012-zero-freeze-architecture-go-first-offloading-and-web-workers.md)**
