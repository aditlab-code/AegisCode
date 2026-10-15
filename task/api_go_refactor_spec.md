# Technical Specification: Modular Refactoring of `server/internal/api/api.go`

- **Target Component:** `server/internal/api/api.go` (AegisCode Backend HTTP Layer)
- **Current Metric:** 1 file, 3,323 lines of code (LOC), 63 HTTP handlers
- **Target Metric:** 1 orchestrator file (~250 LOC) + 10 domain-specific handler files (~100–500 LOC each)
- **Breaking Changes:** 0 (Zero breaking changes, same package `api`, identical HTTP contract)

---

## 1. Executive Summary & Problem Statement

Currently, `server/internal/api/api.go` acts as a monolithic file that houses the entire HTTP API surface of AegisCode. While internal domain engines (`workspace`, `git`, `debug`, `lsp`, `codegraph`, `store`, `supervisor`, `terminal`) are modularized in their respective sub-packages, their corresponding HTTP presentation and routing logic are all dumped into a single 3,323-line file.

### Key Pain Points
1. **Merge Conflicts:** Multiple engineers working on unrelated domains (e.g., Git vs. AI Assistant) inevitably modify the same file.
2. **Cognitive Overhead:** Finding and reviewing handler logic requires scrolling through thousands of lines of disparate domains.
3. **Violation of Single Responsibility:** A single file manages file system I/O, PTY streaming, subprocess supervision, DAP Delve protocol, LLM streaming, and Tree-sitter CodeGraph reverse proxying.

---

## 2. Refactoring Strategy: Package-Internal File Splitting

In Go, all files within the same directory declaring `package api` share the exact same package namespace and access unexported types and receiver methods.

This allows us to split methods on `(s *Server)` across multiple files **without modifying signatures, structs, or imports in caller code**.

```
server/internal/api/
├── api.go                    # Server struct, NewServer(), Middleware, Router (Routes())
├── types.go                  # Existing shared request/response DTOs
├── events_hub.go             # Existing SSE Multiplexer
├── pairing.go                # Existing companion pairing logic
├── workspace_handlers.go     # Workspace filesystem, file search, CSV queries
├── git_handlers.go           # Git commands, branch, commit, diff, sync
├── terminal_handlers.go      # Terminal PTY session lifecycle & SSE
├── supervisor_handlers.go    # Background runner / worker supervision & crash events
├── storage_handlers.go       # App config, state, chat history ledger, blobs
├── ai_handlers.go            # LLM provider streaming (Antigravity, Claude, OpenAI)
├── debug_handlers.go         # DAP Delve debugger orchestration & events
├── lsp_handlers.go           # Language Server Protocol client methods
├── mcp_handlers.go           # Model Context Protocol stdio runner & event bridges
└── codegraph_handlers.go     # CodeGraph reverse proxy, status, and symbols
```

---

## 3. Granular File Decomposition Specification

### File 1: `api.go` (Core Orchestrator)
- **Scope:** Server struct definition, constructor, dependency injection, middleware, and route mounting.
- **Estimated LOC:** ~280 lines (down from 3,323 lines).
- **Key Functions:**
  - `NewServer(ws, picker, customStore...) *Server`
  - Getters: `EventHub()`, `Pairing()`, `Codegraph()`, `MCP()`, `Debug()`, `Store()`, `Supervisor()`, `Terminal()`
  - Helpers: `jsonResponse()`, `jsonError()`, `isOriginAllowed()`, `isPublicEndpoint()`
  - Middleware: `corsAndAuthMiddleware()`
  - Router: `Routes() http.Handler`

### File 2: `workspace_handlers.go`
- **Scope:** Workspace lifecycle, folder selection, directory traversal, file I/O, search, CSV queries.
- **Estimated LOC:** ~550 lines (Lines 399–944 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleWorkspaceInfo`
  - `(s *Server) handleWorkspaceOpen`
  - `(s *Server) handleWorkspaceClose`
  - `(s *Server) handleWorkspacePickFolder`
  - `(s *Server) handleWorkspaceBrowse`
  - `(s *Server) handleWorkspaceCreateFolder`
  - `(s *Server) handleWorkspaceTree`
  - `(s *Server) handleWorkspaceFile`
  - `(s *Server) handleWorkspaceFileRaw`
  - `(s *Server) handleWorkspaceCsvQuery`
  - `(s *Server) handleWorkspaceRename`
  - `(s *Server) handleWorkspaceMove`
  - `(s *Server) handleWorkspaceSearch`
  - `(s *Server) handleWorkspaceFilesFind`
  - `(s *Server) handleWorkspaceReplaceAll`

### File 3: `git_handlers.go`
- **Scope:** Local Git operations, staging, commit, diff inspection, remote branch tracking.
- **Estimated LOC:** ~400 lines (Lines 945–1345 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleGitStatus`
  - `(s *Server) handleGitInit`
  - `(s *Server) handleGitUnlock`
  - `(s *Server) handleGitBranches`
  - `(s *Server) handleGitBranchCheckout`
  - `(s *Server) handleGitBranchCreate`
  - `(s *Server) handleGitLog`
  - `(s *Server) handleGitTimeline`
  - `(s *Server) handleGitStage`
  - `(s *Server) handleGitUnstage`
  - `(s *Server) handleGitDiscard`
  - `(s *Server) handleGitCommit`
  - `(s *Server) handleGitPush`
  - `(s *Server) handleGitPull`
  - `(s *Server) handleGitSync`
  - `(s *Server) handleGitTags`
  - `(s *Server) handleGitTagCreate`
  - `(s *Server) handleGitTagPush`
  - `(s *Server) handleGitDiff`
  - `(s *Server) handleGitCompare`
  - `(s *Server) handleGitAddRemote`

### File 4: `terminal_handlers.go`
- **Scope:** Pseudoterminal (PTY) session spawning, WebSocket/SSE streaming, log broadcast.
- **Estimated LOC:** ~320 lines (Lines 1346–1666 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleTerminalCreate`
  - `(s *Server) handleTerminalSessions`
  - `(s *Server) handleTerminalOperations`
  - `(s *Server) handleTerminalEvents`
  - `(s *Server) handleLogsEvents`
  - `(s *Server) handleWorkspaceEvents`
  - Helper: `(s *Server) BroadcastLog`

### File 5: `supervisor_handlers.go`
- **Scope:** Background child process runners, health inspection, crash broadcast.
- **Estimated LOC:** ~160 lines (Lines 1667–1826 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleWorkersList`
  - `(s *Server) handleWorkerOperations`
  - `(s *Server) handleWorkerEvents`
  - Helper: `(s *Server) BroadcastWorkerCrash`

### File 6: `storage_handlers.go`
- **Scope:** Local state persistence, global config, chat history search/ledger, content-addressed blob storage.
- **Estimated LOC:** ~345 lines (Lines 1827–2171 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleConfig`
  - `(s *Server) handleState`
  - `(s *Server) handleStateRecent`
  - `(s *Server) handleChatsList`
  - `(s *Server) handleChatSearch`
  - `(s *Server) handleChatOperations`
  - `(s *Server) handleBlob`

### File 7: `ai_handlers.go`
- **Scope:** LLM endpoint probing, skills registration, token streaming, Review Gate hooks.
- **Estimated LOC:** ~255 lines (Lines 2172–2425 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleAITest`
  - `(s *Server) handleAIModels`
  - `(s *Server) handleAISkills`
  - `(s *Server) handleAITranscript`
  - `(s *Server) handleAIChatStream`

### File 8: `debug_handlers.go`
- **Scope:** Delve DAP process orchestration, breakpoint management, execution stepping, server shutdown.
- **Estimated LOC:** ~280 lines (Lines 2426–2704 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleDebugStart`
  - `(s *Server) handleDebugBreakpoints`
  - `(s *Server) handleDebugStep`
  - `(s *Server) handleDebugState`
  - `(s *Server) handleDebugTerminate`
  - `(s *Server) handleDebugEvents`
  - `(s *Server) handleSystemShutdown`
  - Helper: `resolveGoProgram(program, cwd string) string`

### File 9: `lsp_handlers.go`
- **Scope:** LSP JSON-RPC client proxy, text document synchronization, symbol query, formatting.
- **Estimated LOC:** ~240 lines (Lines 2705–2941 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleLSPOpen`
  - `(s *Server) handleLSPChange`
  - `(s *Server) handleLSPSave`
  - `(s *Server) handleLSPClose`
  - `(s *Server) handleLSPSymbols`
  - `(s *Server) handleLSPCompletion`
  - `(s *Server) handleLSPHover`
  - `(s *Server) handleLSPDefinition`
  - `(s *Server) handleLSPFormatting`
  - `(s *Server) handleLSPStatus`
  - `(s *Server) handleLSPEvents`

### File 10: `mcp_handlers.go`
- **Scope:** Model Context Protocol stdio runner, event hub bridges, tool broadcasting.
- **Estimated LOC:** ~120 lines (Lines 2942–3058 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleMCP`
  - `(s *Server) broadcastMCPEvent`
  - `(s *Server) BroadcastMCPEvent`
  - `(s *Server) initEventHubBridges`

### File 11: `codegraph_handlers.go`
- **Scope:** CodeGraph daemon status, reindexing, symbol search, entrypoint extraction, reverse proxy setup.
- **Estimated LOC:** ~265 lines (Lines 3059–3323 in current `api.go`).
- **Handler Methods:**
  - `(s *Server) handleCodeGraphStatus`
  - `(s *Server) handleCodeGraphReindex`
  - `(s *Server) handleCodeGraphFile`
  - `(s *Server) handleCodeGraphSymbolsSearch`
  - `(s *Server) handleCodeGraphEntrypoints`

---

## 4. Implementation Steps & Verification Plan

### Phase 1: Preparation
1. Ensure working directory is clean: `git status`.
2. Verify existing test suite baseline passes: `go test -v ./server/internal/api/...`.

### Phase 2: Extraction
1. Create new files with `package api` headers and required standard library imports.
2. Cut handler methods from `api.go` and paste into target domain files.
3. Keep shared helpers (`jsonResponse`, `jsonError`) in `api.go` or move to a lightweight `helpers.go`.

### Phase 3: Compilation & Regression Testing
1. Run `go build ./server/cmd/server` to confirm symbols resolve across files.
2. Run `go test -v ./server/internal/api/...` to ensure all 193 backend tests remain green without regression.
3. Validate API regression suite: `codegraph_regression_test.go` and `events_hub_test.go`.

---

## 5. Architectural Benefits
- **Zero Disruption:** Purely internal reorganization; frontend and API clients remain 100% agnostic.
- **Enhanced Maintainability:** Average file size reduced from 3,323 LOC to ~280 LOC.
- **Independent Ownership:** Team members can work concurrently on Git, AI, and Terminal features without file merge collisions.
