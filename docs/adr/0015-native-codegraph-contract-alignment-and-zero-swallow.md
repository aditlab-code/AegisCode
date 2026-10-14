# 0015. Native CodeGraph Contract Alignment, MCP Envelope Unwrapping, and Zero-Swallow Error Handling

- **Status**: Accepted & Implemented (2026-10-14)
- **Deciders**: AegisCode Architecture Core, Antigravity Agent
- **Related ADRs**: ADR-0001 (Hybrid Process), ADR-0004 (Worker Supervision), ADR-0006 (Pragmatic Go Layout), ADR-0012 (Zero-Freeze), ADR-0014 (Native CodeGraph Runtime & VantageCraft UI)

---

## Context

Following the adoption of the native `@colbymchenry/codegraph` daemon in ADR-0014, real-world integration testing and end-to-end QA uncovered three critical structural discrepancies between the Go core server, the supervised daemon, and the VantageCraft frontend:

1. **MCP Envelope vs. Direct UI JSON Discrepancy**:
   - The native `@colbymchenry/codegraph` tool endpoints and CLI daemon return JSON payloads wrapped inside standard Model Context Protocol (MCP) response envelopes:
     ```json
     { "content": [{ "type": "text", "text": "{\"stats\":{...}}" }] }
     ```
   - When the frontend queried endpoints such as `/api/codegraph/entrypoints` or reverse-proxied routes, frontend components expecting raw domain JSON objects received the outer envelope or failed during JSON deserialization, causing blank panels.
2. **Legacy Endpoints & Silent Error Swallowing Anti-Pattern**:
   - The codebase still contained lingering legacy REST routes (`/api/v1/codegraph/neighborhood`, `/api/v1/codegraph/workspace`) pointing to decommissioned in-process Go AST extractors.
   - Frontend utility functions in `src/utils/codegraphApi.ts` suffered from silent error swallowing (`catch { return null }` or `if (!res.ok) return null`). As a result, 404/500 backend errors or empty states were swallowed silently, showing infinite skeletons or broken views with zero diagnostic feedback to the developer.
3. **Domain Schema & View Fallback Mismatches**:
   - In `StepsView.tsx`, an unselected symbol defaulted to `|| "main"`. In projects without a top-level `main` function (e.g. Next.js, Express, Go packages, library repos), this triggered 404/500 errors.
   - In `ScreensEventsView.tsx`, non-web or unrouted workspaces without `navigates` edges returned `{ routed: false, screens: [] }`, which was misdiagnosed as an engine failure rather than expected architectural domain state.
   - Stats keys (`stats.graph.nodes`, `stats.graph.edges`, `stats.graph.files`) and workspace root propagation were inconsistently applied across sub-views.

---

## Decision

We decided to execute a comprehensive contract alignment and error handling overhaul across Go backend proxying and the VantageCraft frontend:

### 1. Permanent Deprecation & Removal of Legacy Graph Endpoints
- **Decommissioned Routes**:
  - `GET /api/v1/codegraph/neighborhood` -> **DEPRECATED & REMOVED**. Replaced by native supervised daemon endpoints `/api/codegraph/ui/flow` and `/api/codegraph/ui/steps`.
  - `GET /api/v1/codegraph/workspace` -> **DEPRECATED & REMOVED**. Replaced by native endpoints `/api/codegraph/ui/entrypoints` and `/api/codegraph/ui/map`.
  - In-process custom Go AST extractors (`go_extractor.go`, `ts_extractor.go`, `py_extractor.go`, `lsp_extractor.go`) -> **DEPRECATED & REMOVED** per ADR-0014.
- **Active Native Endpoints**:
  - `/api/codegraph/ui/*`: Reverse-proxied directly to the upstream `@colbymchenry/codegraph` UI HTTP server.
  - `/api/codegraph/entrypoints` & `/api/v1/codegraph/entrypoints`: Go handler invoking daemon tool with automatic workspace injection and envelope unwrapping.
  - `/api/v1/codegraph/status`, `/init`, `/reindex`, `/file`, `/symbols/search`: Active fallback stubs.

### 2. Automatic MCP Envelope Unwrapping in Go Core
- Go proxy layer (`server/internal/codegraph/proxy.go`, `server/internal/codegraph/manager.go`) automatically detects and unwraps MCP text envelopes (`content[0].text`).
- If an upstream tool or daemon responds with MCP JSON, Go decodes the inner JSON payload and streams clean domain JSON (`Entrypoint[]`, `StepTree`, `ArchitectureMap`, etc.) to the client.
- Eliminates brittle string-parsing workarounds on the frontend.

### 3. Strict Zero-Swallow Error Policy
- Aligned with AGENTS.md Prime Directive and Backend Constraint 1: **DO NOT Catch Errors Silently**.
- Frontend service layer (`src/services/codegraphApi.ts`) must never swallow errors with `catch { return null }` or silently return empty dummy data on HTTP error statuses.
- All non-2xx responses throw descriptive, actionable `Error` instances containing the HTTP status and response text.
- UI views render clear error alerts with retry triggers and re-index buttons instead of infinite spinners or blank canvases.

### 4. Frontend Service Consolidation & Typed Contracts
- Replaced fragmented `src/utils/codegraphApi.ts` fetchers with standardized `src/services/codegraphApi.ts`.
- Retained clean compatibility bridges in `src/utils/codegraphApi.ts` re-exporting typed contracts (`CodeGraphStats`, `CodeGraphEntrypoint`, `CodeGraphStepTree`, `CodeGraphMapData`, `CodeGraphFlowData`, `CodeGraphScreenData`).
- Added full support for native stats format (`stats.graph.nodes`, `stats.graph.edges`, `stats.graph.files`).

### 5. Workspace Propagation & Domain Fallback Resilience
- The active workspace root (`workspace`) is consistently attached as a query parameter across all CodeGraph API calls (`stats`, `entrypoints`, `steps`, `map`, `flow`, `screens`, `filecode`).
- `StepsView.tsx`: Removed the fragile `|| "main"` hardcoded symbol fallback. Prompts user to select an entrypoint or symbol when none is specified.
- `ScreensEventsView.tsx`: Correctly handles projects where `routed: false` and `screens: []`, presenting an informative non-routed architecture state rather than throwing an engine error.

---

## Consequences

### Positive
- **Contract Uniformity**: Frontend receives pure, predictable domain JSON without dealing with raw MCP envelopes.
- **High Observability**: Failures (missing index, unindexed project, crashed daemon) are surfaced immediately with human-readable error banners.
- **Robust Multi-Framework Support**: Non-main codebases (Next.js, Go packages, library repos) and non-routed backends function without 404 crashes.
- **Clean Architecture**: Legacy AST endpoints completely removed from backend routing, preventing accidental regressions.

### Negative
- **Strict Error Handling**: Any unexpected upstream error immediately surfaces in the UI rather than failing silently, requiring careful UI error state presentation.

---

## Deprecated & Removed Components Summary

| Component / Endpoint | Status | Replacement |
| :--- | :---: | :--- |
| `GET /api/v1/codegraph/neighborhood` | `DEPRECATED & REMOVED` | `/api/codegraph/ui/flow` & `/api/codegraph/ui/steps` |
| `GET /api/v1/codegraph/workspace` | `DEPRECATED & REMOVED` | `/api/codegraph/ui/entrypoints` & `/api/codegraph/ui/map` |
| In-process Go AST extractors (`*_extractor.go`) | `DEPRECATED & REMOVED` | Native `@colbymchenry/codegraph` daemon (Tree-sitter/Rust) |
| Client-side silent `catch { return null }` | `DEPRECATED & PROHIBITED`| Strict Zero-Swallow Error Policy & typed errors |
| Hardcoded `|| "main"` symbol fallback | `DEPRECATED & REMOVED` | Dynamic entrypoint selector & explicit empty prompts |
