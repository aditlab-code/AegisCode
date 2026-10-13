# 0012. Zero-Freeze Architecture Subsystem: Go-First Offloading and Web Workers Runtime

We decided to establish a foundational **Zero-Freeze Architecture Subsystem** combining a client-side **Two-Lane Web Worker Broker** with a **Reactive In-Memory Go Workspace Engine** (`WorkspaceIndex`), mediated by a unified `offloadService` facade and monitored by a dual-mode `PerfMonitor` guardrail.

---

### Context & Problem
Under the previous architecture, several CPU-intensive and I/O-heavy operations were directly coupled to the main JavaScript/React UI thread or performed inefficient client-side scans:
1. **Minimap Line Tokenization**: `Minimap.tsx` executed synchronous regex tokenization per line during view renders. On large files (20,000+ lines) or rapid scroll gestures, hundreds of regex evaluations flooded the UI thread, causing frame drops and visual stutter.
2. **Synchronous Syntax & AST Linting**: Heuristic syntax validation (`validateSyntax`) ran on every buffer update in the main thread, blocking the event loop on large buffers.
3. **Client-Side Quick Open Iteration**: `CommandPalette.tsx` filtered file trees directly in browser memory via `files.filter()`, imposing high memory pressure and lag when searching across repositories with tens of thousands of files.
4. **Client-Side Dataset Parsing**: Large tabular files risked crashing the browser tab if parsed as raw in-memory 2D arrays in client JavaScript.

Rather than applying ad-hoc patches to each feature, a permanent, extensible architectural foundation was required to enforce a strict sub-5ms input latency and locked 60 FPS SLA.

---

### Decision & Architecture

1. **3-Tier Allocation Matrix & SLA**:
   - **Tier 1 (React UI Thread)**: Strictly reserved for direct user interactions (< 5ms latency, 60 FPS): keystroke handling, cursor selection, CodeMirror DOM sync, and lightweight view routing. Heavy regex, AST traversals, and raw data parsers are prohibited on Tier 1.
   - **Tier 2 (Web Worker Runtime)**: Dedicated to client-local, CPU-bound computations (10–100ms async): line regex tokenization, heuristic AST validation, live diff calculation, and code formatting. Workers run isolated from DOM APIs.
   - **Tier 3 (Go Backend Engine)**: Responsible for disk I/O, multi-file workspace searches, in-memory index queries, streaming windowed datasets (RFC 4180 CSV / binary), Git VCS operations, LSP compilation, and DAP Delve debugging.

2. **Two-Lane Web Worker Broker (`WorkerBroker`)**:
   Instead of fragmented, ad-hoc worker scripts, a centralized runtime (`src/workers/WorkerBroker.ts`) manages worker lifecycles with automatic crash/OOM recovery and strict lane isolation:
   - **Fast Lane (Dedicated Interactive Worker)**: 1 isolated worker dedicated to immediate visual feedback (`tokenizeLine`, regex highlighting). Operates with zero queue lag, never blocked behind heavy background batch jobs.
   - **Batch Lane (Pooled Compute Workers)**: An elastic pool (1 to 4 workers scaled to `navigator.hardwareConcurrency - 1`) for heavy background tasks (`validateSyntax`, AST parsing, diff computation) with prioritized scheduling (`HIGH`, `NORMAL`, `LOW`) and instant cancellation via `AbortSignal` for superseded buffer versions.
   - **Typed Task Registry**: Extensibility is standardized via `defineWorkerTask<TInput, TOutput>({ name, lane, handler })` in `src/workers/registry.ts`, giving future features complete TypeScript autocompletion and compile-time validation.

3. **Reactive In-Memory Go Workspace Index (`WorkspaceIndex`)**:
   - `server/internal/workspace/index.go` maintains a cache-aligned, contiguous slice `[]IndexedFile` in server RAM upon workspace mount.
   - **Weighted Subsequence Matching**: Queries are scored with heuristics rewarding basename matches (+100), word prefixes (+50), directory boundary `/` matches (+30), camelCase uppercase characters (+25), and consecutive matches (+15).
   - **Multi-Core Parallel Chunking**: When file counts exceed 2,000, searches are split across parallel goroutines using a min-heap to return the Top-20 ranked matches in < 1.5ms with zero memory allocations on the hot path.
   - **Reactive Watcher Synchronization**: Automatically updated via `watcher.go` (`fsnotify`) with atomic `sync.RWMutex` locks, eliminating disk re-scans.
   - **Unified `IndexProvider` Interface**: Exposed as a shared service interface for other backend packages (`internal/lsp`, `internal/ai`, and `internal/git`).

4. **Unified `offloadService` Facade & Resilience**:
   - Provides a standardized API: `offloadService.run<TInput, TOutput>(options)` returning `{ data, durationMs, source: 'worker' | 'backend' | 'fallback' }`.
   - **In-Flight Request Coalescing**: Concurrent identical requests (e.g. rapid keystrokes or tab toggling) coalesce into a single execution Promise.
   - **Hash-Indexed LRU Cache**: Fast FNV-1a hashing caches computation results (100 entries / 5MB bound) for sub-0.1ms cache hits.
   - **Transparent Graceful Degradation**: If browser sandboxing blocks Web Workers, tasks execute on the main thread via `requestIdleCallback` / microtask chunking. If the Go server is unreachable, Quick Open falls back gracefully to client in-memory files.

5. **Telemetry & Zero-Freeze SLA Guardrail (`PerfMonitor`)**:
   - Uses `PerformanceObserver` to track Long Tasks (> 50ms), event loop delays, and worker/Go task latency.
   - **Development Mode**: Renders an interactive Performance Status Pill in the Status Bar (`StatusBar.tsx`) with an expandable inspector popover listing offending tasks and durations.
   - **Production Mode**: Compiles to a zero-overhead, DOM-free telemetry interface (`window.__AEGIS_PERF__`).

---

### Migration & Verification Gate
The four critical areas are directly migrated to this foundation:
1. `Minimap.tsx` offloads tokenization to Fast Lane with instant skeleton bar fallback during fast flick scrolling.
2. `WorkbenchLifecycle.ts` and `createWorkspaceSlice.ts` offload syntax linting to Batch Lane with 300ms debouncing and `AbortController`.
3. `CommandPalette.tsx` Quick Open delegates file queries to `GET /api/v1/workspace/files/find` backed by `WorkspaceIndex`.
4. `CsvViewer.tsx` exclusively streams windowed rows from `GET /api/v1/workspace/csv/query`, deprecating raw client-side parsing.
