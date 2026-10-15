# 0016. HTTP/1.1 Socket Starvation Prevention, Direct Backend API Base, and Canonical Workspace Buffer Lifecycle

- **Status**: Accepted & Implemented (2026-10-15)
- **Deciders**: AegisCode Architecture Core, Antigravity Agent
- **Related ADRs**: ADR-0001 (Hybrid Process), ADR-0003 (Core Server Runtime in Golang), ADR-0011 (Zustand Modular Slices), ADR-0012 (Zero-Freeze Architecture)

---

## Context

Following the multi-track refactoring of the frontend store and backend service integration, critical browser-level deadlocks and state desynchronizations emerged during multi-workspace testing (specifically reproducible when opening or switching to external repositories such as `AegisResearch`):

1. **HTTP/1.1 Socket Pool Saturation & Indefinite "STILL LOADING" Spinner**:
   - Modern browser engines (Chromium, WebKit, Gecko) enforce a strict connection pool limit of **6 concurrent HTTP/1.1 TCP connections per host origin** (`kMaxSocketsPerGroup = 6`).
   - The application maintained **5 persistent Server-Sent Events (SSE) streaming connections** (`/api/v1/events/debug`, `/api/v1/mcp/events`, `/api/v1/events/workspace`, `/api/v1/events/lsp`, `/api/v1/events/logs`) routed through Vite's dev server proxy on `http://localhost:5173`.
   - Furthermore, Vite's proxy configuration enforced `headers: { Connection: "keep-alive" }`.
   - Because 5 of the 6 sockets on `localhost:5173` were held open indefinitely by infinite event streams, any new standard HTTP request (`/api/v1/workspace/file`, `/api/v1/workspace/tree`, `/api/v1/git/status`, directory browsing) was placed into the browser's **Stalled / Queueing** network state waiting indefinitely for an available socket.
   - Consequently, the browser's navigation coordinator could never mark the document load "committed/complete", keeping the tab favicon loading spinner active indefinitely.

2. **Blank Editor Panes ("NULL" Content) & Domino Outline Failure**:
   - Because file fetching was stalled in the saturated socket queue, `fetchBufferSafely` hung.
   - In `createWorkspaceSlice.ts`, `loadWorkspaceInternal` launched `fetchBufferSafely` in an unawaited background promise (`void get().fetchBufferSafely(tab)`) and immediately transitioned `isWorkspaceLoading` to `false`.
   - As a result, `CodePane.tsx` mounted `CMEditor` with `content = ""`, rendering line 1 with empty text.
   - Lexical and AST symbol extractors in `ExplorerPanel.tsx` evaluated empty buffers, resulting in `"No symbols detected in file"` in the Outline panel, and the Timeline panel remained blank.

3. **Workspace Folder Switching State Annihilation**:
   - In `openRootFolder`, an eager `resetAllGroups()` call wiped all open tabs before `loadWorkspaceInternal` could reconcile them.
   - If the user opened a new workspace folder, all editor tabs were destroyed, leaving an empty void even if corresponding entrypoint files (`App.tsx`, `main.tsx`, `README.md`) existed in the target directory.

---

## Decision

We instituted a definitive architectural resolution spanning network origin routing, browser lifecycle timing, and store buffer reconciliation:

### 1. Centralized Direct-to-Backend `API_BASE` in Development
- Established `src/utils/apiBase.ts` defining a dynamic base URL resolver:
  ```ts
  export function getApiBase(): string {
    if (typeof window === "undefined") {
      return typeof process !== "undefined" && process.env?.VITEST ? "" : "http://localhost:8080"
    }
    if (window.location?.port === "5173") {
      return `http://${window.location.hostname || "localhost"}:8080`
    }
    return ""
  }
  export const API_BASE = getApiBase()
  ```
- **Separation of Concerns**:
  - In development mode (`port 5173`), all REST API endpoints and SSE event streams connect directly to the Go core server on `http://localhost:8080`.
  - Go server natively supports loopback CORS (`http://localhost:*`) and handles connection concurrency using goroutines without host socket pool limits.
  - Vite dev server on port 5173 is relieved of all persistent streaming sockets, maintaining **0 persistent SSE connections**. All 6 browser sockets on port 5173 remain free for instant asset delivery, HMR, and navigation completion.
  - In production builds or embedded Go distributions (`embed.FS` serving `index.html` on port 8080), `API_BASE` evaluates to `""`, preserving single-port relative URL operations.
- Removed `headers: { Connection: "keep-alive" }` from `vite.config.ts`.

### 2. Unified Go `EventHub` Multiplexer & Deferred Window-Load SSE
- Consolidated multiple fragmented SSE streams (`workspace`, `lsp`, `debug`, `mcp`, `logs`) into a single high-throughput Go backend multiplexer: `GET /api/v1/events`.
- In `src/services/WorkbenchEventHub.ts`, the frontend manages typed channel subscriptions over this single persistent connection, reducing persistent streaming socket usage from 5 TCP sockets down to **1 TCP socket** on `localhost:8080`.
- In `src/context/WorkbenchLifecycle.ts`, background SSE listener initialization is deferred until `document.readyState === "complete"` or the window `load` event.
- This guarantees that Chromium's navigation coordinator finalizes navigation immediately without socket contention, clearing the tab favicon loading indicator with zero delay.

### 3. Single POSIX Canonical Buffer Lifecycle & Self-Save Echo Suppression
- **Single Canonical POSIX Keying**:
  - The historical interim solution of duplicating buffer objects across multiple keys (`[clean]`, `[filename]`, `[baseName]`, `[rawBaseName]`) was superseded by strict **Single POSIX Canonical Path Keying** (`normalizeWorkspacePath`).
  - Storing duplicate keys caused memory leaks and desynchronization when files across different directories shared colliding base names (e.g. `src/components/index.ts` vs `src/types/index.ts`).
  - All store operations (`fileBuffers[clean]`), tab closures (`closeTabInGroup`), and dirty checks enforce `normalizeWorkspacePath(path)`.
- **In-Flight Save Keystroke Protection (`markBufferSavedLogic`)**:
  - `saveFile` snapshots `contentToSave` prior to awaiting the async network write.
  - Upon completion, `markBufferSavedLogic` compares `currentBuf.content === contentToSave`. If the user continued typing while the save was in-flight, `isDirty` remains `true` and the newer edits are preserved safely.
- **Self-Save Watcher Echo Suppression (`WorkbenchLifecycle.ts`)**:
  - Successful file writes record a high-resolution `buf.lastSaved = Date.now()` timestamp on the buffer.
  - When the backend file modification watcher fires, events within an 800ms window whose disk content matches `buf.savedContent` are suppressed.
  - This eliminates editor pane unmounts, CM6 cursor resets, loading spinner flickers, and false `hasDiskConflict` dialogs on every save.
- **Per-File Async Sequence Guard (`AsyncSequenceGuard`)**:
  - `fetchBufferSafely` maintains per-file sequence request tokens, discarding stale responses caused by out-of-order network arrival during rapid tab switching.

### 4. Non-Destructive Workspace Tab Reconciliation & Entrypoint Fallback
- Removed destructive `resetAllGroups()` from `openRootFolder`.
- In `loadWorkspaceInternal`:
  - Existing open tabs are validated against the newly mounted workspace file tree using a canonical path map.
  - **Fallback Entrypoint Selection**: If no existing tabs belong to the new workspace (e.g. switching between unrelated projects), the system automatically selects the primary entrypoint (`App.tsx`, `main.tsx`, `index.tsx`, `index.ts`, `main.go`, `main.py`, `index.js`, or `README.md`) or the first readable file, preventing an empty editor void.
  - **Priority Buffer Pre-fetch Awaiting**: The buffers for active editor tabs in Group 1 and Group 2 are explicitly awaited via `Promise.allSettled(...)` before setting `isWorkspaceLoading: false`. CodeMirror always mounts with populated code on workspace switches.

---

## Consequences

### Positive
- **Instant Navigation Finalization**: Browser tab favicon stops spinning immediately on page load; zero network stall warnings in DevTools.
- **Single Multiplexed Socket**: Background events (`workspace`, `lsp`, `debug`, `mcp`, `logs`) consume exactly 1 backend socket instead of 5, preventing HTTP/1.1 pool starvation.
- **Zero In-Flight Save Data Loss**: Typing during network latency is fully preserved with accurate dirty state tracking.
- **Zero-Flicker Saving**: Self-save echo suppression prevents CMEditor unmounts and spurious conflict prompts.
- **Flawless Multi-Workspace Transitions**: Switching between workspaces smoothly preserves valid tabs, opens primary entrypoints when no tabs match, and immediately renders source code across split panes.
- **Complete Symbol & Timeline Availability**: Outline panel accurately extracts symbols (AST and lexical fallback) and Timeline shows git history without delays.
- **Zero Production Degradation**: Production single-binary builds continue to serve assets and API seamlessly from port 8080 via relative paths (`API_BASE = ""`).

### Negative / Considerations
- **Development Port Requirement**: In development mode, the Go server must run on port 8080 (or LAN IP) while Vite runs on 5173. This is standard for AegisCode's hybrid architecture (`npm run dev:full` or running `npm run server` alongside Vite).
- **CORS Integrity**: Go server's `isOriginAllowed` middleware must remain active to allow `localhost:*` loopback origins.

---

## Implementation Reference

| Area | Modified File | Purpose |
| :--- | :--- | :--- |
| **API Base Resolution** | [`src/utils/apiBase.ts`](../../src/utils/apiBase.ts) | Dynamic port-8080 backend connection for dev mode |
| **Multiplexed SSE Hub** | [`src/services/WorkbenchEventHub.ts`](../../src/services/WorkbenchEventHub.ts) | Single-stream multiplexer for workspace, lsp, debug, mcp, logs |
| **Workspace Store** | [`src/store/slices/createWorkspaceSlice.ts`](../../src/store/slices/createWorkspaceSlice.ts) | Tab reconciliation, priority buffer awaiting, in-flight save guard |
| **Lifecycle Coordinator** | [`src/context/WorkbenchLifecycle.ts`](../../src/context/WorkbenchLifecycle.ts) | Self-save echo suppression (800ms) and direct `API_BASE` streams |
| **Editor Pane** | [`src/components/layout/editor/CodePane.tsx`](../../src/components/layout/editor/CodePane.tsx) | Canonical normalized path buffer lookup |
| **Editor Tabs** | [`src/components/layout/editor/EditorTabs.tsx`](../../src/components/layout/editor/EditorTabs.tsx) | Enforce canonical tab path normalization on tab close |
| **Explorer & Outline** | [`src/components/layout/sidebar/ExplorerPanel.tsx`](../../src/components/layout/sidebar/ExplorerPanel.tsx) | Resilient activeSymbols buffer lookup |
| **Dev Server Proxy** | [`vite.config.ts`](../../vite.config.ts) | Removed `Connection: keep-alive` proxy header |
