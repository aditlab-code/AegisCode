# 0014. Native `@colbymchenry/codegraph` Runtime and VantageCraft UI Integration

- **Status**: Accepted & Approved for Implementation (2026-10-14)
- **Deciders**: AegisCode Architecture Core, Antigravity Agent
- **Related ADRs**: ADR-0001 (Hybrid Process), ADR-0004 (Worker Supervision), ADR-0011 (Zustand Slices), ADR-0012 (Zero-Freeze Architecture)

---

## Context

AegisCode previously attempted an in-process code intelligence implementation in Go (`server/internal/codegraph/`) featuring custom AST extractors (`go_extractor.go`, `ts_extractor.go`, `py_extractor.go`, `lsp_extractor.go`), an internal SQLite schema (`db.go`), and a generic node/edge UI service (`ui_service.go`).

This design encountered three fatal architectural flaws:
1. **Incomplete Engine Fidelity**: The custom Go extractors relied on superficial regex and basic AST parsing without cross-file type resolution, multi-language framework synthesizers (e.g. Next.js, Express, Gin, React-to-API bridges), or the full 4-Phase Indexing Pipeline found in `@colbymchenry/codegraph` (powered by Rust `codegraph-kernel` and Tree-sitter grammars across 30+ languages).
2. **MCP Integration and Concurrency Breakages**: Re-implementing MCP tools in Go led to protocol incompatibilities:
   - Absence of the MCP `roots/list` handshake forced `@colbymchenry/codegraph` to treat `projectPath` as a mandatory parameter, breaking external AI agent tool invocations when omitted.
   - Dual-writing to SQLite databases created WAL writer-lock contention (`SQLITE_BUSY`) against external `codegraph` CLI daemons.
3. **UI Contract Mismatch**: `ui_service.go` produced generic flat graph payloads (`nodes` and `edges`) incompatible with the **VantageCraft CodeGraph Architecture**, which specifies 6 dedicated domain view models (`Entrypoints/Program`, `Execution Steps`, `Architecture Map`, `Directed Flow & Trails`, `Screens & Events`, and `Bounded FileCode & Symbol Inspector`).

---

## Decision

We decided to execute a clean-slate teardown of the legacy custom Go extractors and adopt the **Native `@colbymchenry/codegraph` Runtime + Managed UI Reverse Proxy + VantageCraft Frontend Architecture**:

### 1. Clean-Slate Teardown of Legacy In-Process Engine
- All legacy custom Go extractors (`go_extractor.go`, `ts_extractor.go`, `py_extractor.go`, `lsp_extractor.go`, `extractor_test.go`), indexers (`indexer.go`, `indexer_test.go`), custom database schemas/queries (`db.go`, `query.go`, `cache.go`), and old UI graph services (`ui_service.go`, `ui_types.go`) in `server/internal/codegraph/` are deprecated and permanently removed.
- All internal re-declarations of `codegraph_*` tools in `server/internal/mcp/server.go` are eliminated.

### 2. Managed Subprocess Supervision for `codegraph ui`
- When a workspace is opened or CodeGraph view is activated, AegisCode Core supervises a dedicated background process via the Worker Supervisor (`ADR-0004`):
  ```bash
  CODEGRAPH_UI=1 codegraph ui --project <workspace_path> --port <ephemeral_port> --no-open
  ```
- Uses `CODEGRAPH_UI=1` to enable the upstream browser viewer API, `CODEGRAPH_BROWSER=none` / `--no-open` to prevent unwanted browser popups, and `windowsHide: true` on Windows.
- Probes `GET /api/stats` for readiness before declaring the service healthy.
- Enforces strict graceful teardown (`SIGTERM` $\rightarrow$ `SIGKILL` watchdog) upon workspace close or server shutdown, preventing orphaned processes from locking ports.

### 3. Transparent Reverse Proxy in Go Core (`/api/codegraph/ui/*`)
- The Go HTTP router mounts a reverse proxy (`httputil.NewSingleHostReverseProxy`) forwarding `/api/codegraph/ui/*` directly to `http://127.0.0.1:<port>/api/*`.
- Standard endpoints served directly by upstream:
  - `GET /api/stats`: Index freshness, health, node/edge counts, detected frameworks.
  - `GET /api/entrypoints`: HTTP API routes, CLI binaries, entry files, hub nodes.
  - `GET /api/steps`: Execution step tree with tier classification, branch guards (`when`), and side effects.
  - `GET /api/map`: Macro-level module/package cluster map and cross-module link densities.
  - `GET /api/flow`: Call path strip between symbols (upstream callers $\rightarrow$ target $\rightarrow$ callees).
  - `GET /api/screens`: UI page/screen component trees linked to event handlers and endpoints.
  - `GET /api/filecode`: Bounded source slices with call site annotations and unresolved external references.
  - `GET /api/events`: Server-Sent Events (SSE) live stream notifying the UI of disk drift and re-indexes.
- Intercepts `POST /api/codegraph/ui/index` and `POST /api/codegraph/ui/sync` to invoke `codegraph index` / `codegraph sync` via CLI and return real-time streaming progress.

### 4. Native MCP Client Bridge & Auto-Injection
- AegisCode Core communicates with `codegraph serve --mcp` over stdio.
- **`roots/list` Handshake**: Declares `roots: { listChanged: true }` in `initialize` response, handles inbound `roots/list` requests by returning the active workspace root (`file://...`), and pushes `notifications/roots/list_changed` upon workspace switching.
- **Middleware `projectPath` Injection**: If an AI agent or provider calls `codegraph_explore` or related tools without `projectPath`, the MCP bridge automatically injects `"projectPath": "<active_workspace_path>"`.
- **Tool Suite Enablement**: Sets `CODEGRAPH_MCP_TOOLS=explore,context,node,callers,callees,impact,affected,search,flow,status` in the child environment to expose the full intelligence tool surface to LLM providers (`antigravity.go`, `claude.go`, `openai.go`).

### 5. VantageCraft 6-View Frontend Architecture
- Replaces legacy monolithic `GraphViewer.tsx` with modular `CodeGraphShell.tsx` hosting 6 domain views:
  1. **`EntrypointsView.tsx`**: Landing explorer grouping HTTP routes, screens, CLI binaries, and jobs with framework badges.
  2. **`StepsView.tsx`**: Sequential execution spine tree with tier badges (`Handler` $\rightarrow$ `Service` $\rightarrow$ `Repo` $\rightarrow$ `DB`), branch condition pills, effect badges, and synthesized hop indicators.
  3. **`ArchitectureMapView.tsx`**: Macro package/folder compound graph with reference thickness.
  4. **`FlowTrailsView.tsx`**: 3-column focused blast radius view (Callers $\rightarrow$ Target $\rightarrow$ Callees) and shortest-path trail explorer.
  5. **`ScreensEventsView.tsx`**: UI page component trees mapped to user interaction events and backend handlers.
  6. **`FileCodeDrawer.tsx`**: Bounded source viewer with syntax highlighting and direct jump-to-line integration with `CMEditor.tsx`.
- **Web Worker Layout**: Offloads intensive ELK / Dagre graph layout computations to `src/workers/codegraphLayout.worker.ts` per `ADR-0012` to ensure 60fps main-thread responsiveness.
- **On-Demand Code Splitting**: In compliance with Frontend Constraint 5, all CodeGraph views, Cytoscape engines, and drawer components are dynamically imported (`React.lazy`) and loaded only when a `codegraph:*` tab is active, maintaining a 0 KB / 0 MB footprint during standard code editing.

---

## Consequences

### Positive
- **100% Upstream Fidelity**: Full access to the mature 4-phase indexing pipeline, Tree-sitter grammars (>25 languages), and synthesized cross-tier relationships.
- **Zero SQLite Lock Contention**: Single-writer WAL locking handled cleanly by the upstream daemon.
- **Robust MCP Tool Calling**: Automatic `roots/list` negotiation and `projectPath` injection prevent AI agent call failures.
- **Zero UI Freeze**: Graph layout calculations executed off-thread in Web Workers per ADR-0012.
- **Lean Codebase**: Eliminates ~1,500 lines of brittle custom AST extractor and query code in Go.

### Negative
- **Subprocess Dependency**: Requires `@colbymchenry/codegraph` and Node.js to be available on the host machine (automated via `scripts/install-mcp.js`).
- **Startup Latency**: First opening of the CodeGraph tab incurs an ephemeral subprocess startup time (~300–600ms) while waiting for `GET /api/stats` readiness probe.
