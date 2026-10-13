# Changelog

All notable changes to the **AegisCode** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- General Availability (GA) v1.0 release packaging.
- Multi-language Language Server Protocol (LSP) bundle enhancements for Rust, Python, and TypeScript.
- Wireless Tablet Companion full bidirectional synchronization (`/?mode=companion`).

---

## [1.0.0-beta.1] - 2026-10-14

### Added
- **Single-Binary Zero-CGO Distribution**: Embedded React 19 production single-page application into pure-Go binary via `embed.FS`.
- **Pure-Go SQLite Engine (`modernc.org/sqlite`)**: Embedded zero-CGO database running in WAL mode with FTS5 search (`~/.aegis/aegis.db` and per-workspace `~/.aegis/graphs/<hash>.db`).
- **Native macOS Cocoa/Swift App**: Lightweight drag-and-drop `.dmg` packaged via native Swift WKWebView wrapper with zero Electron bloat.
- **DAP Debugger Client**: Native JSON-RPC Debug Adapter Protocol client with automatic Delve (`dlv`) orchestration, gutter breakpoints, execution controls (step in/over/out), call stack inspection, and local variable viewers.
- **Model Context Protocol (MCP) Server**: Implemented stdio JSON-RPC 2.0 runner exposing 7 progressive disclosure tools (`get_file_outline`, `get_symbol_definition`, `find_callers`, `get_dependencies`, `query_subgraph`, `search_symbols`, `get_node_neighbors`).
- **Interactive CodeGraph Viewer**: Visual interactive graph built with Cytoscape.js supporting both Hierarchical (Dagre) and Clustered (CoSE) layouts, symbol search, jump-to-source on double-click, and real-time AI tracing.
- **Full PTY Terminal Runner**: Multi-tabbed pseudoterminal sessions driven by `@xterm/xterm` with automatic viewport resizing, ANSI color parsing, and WebSocket/SSE transport.
- **AI Assistant Studio**: Multi-provider streaming chat with Antigravity CLI (`agy`), Anthropic Claude, and OpenAI endpoints, featuring collapsible thinking traces, session branching, and Git Review Gates.
- **Git Review Gates**: Safe line-by-line diff visualizer before AI file modifications are committed to disk.

### Changed
- Replaced fragmented flat-file storage (`~/.aegis/chats/*.jsonl`, `~/.aegis/blobs/*.raw`) with transactional SQLite ledger and content-addressed blob storage.
- Upgraded frontend styling to Tailwind CSS v4 using semantic design tokens (`bg-canvas`, `bg-surface`, `text-ink`, `border-line`).
- Optimized terminal stream parser to handle large chunks without dropped escape sequences.

### Fixed
- Fixed PTY process group teardown with `setpgid` and exit watchdog preventing orphaned child processes.
- Fixed database concurrency locks during rapid AST graph indexing with tuned SQLite PRAGMAs (`busy_timeout(5000)`, `journal_mode(WAL)`).
- Resolved race conditions in editor auto-save on blur during fast tab switching.

### Security
- Enforced workspace boundary confinement across all file operations (`createFile`, `deleteFile`, `git.Discard`, `git.GetDiff`).
- Restricted default server binding to `127.0.0.1` loopback with user-owned Unix domain sockets.

### Known Limitations
- Initial build binary requires manual execution of `xattr -d com.apple.quarantine` on macOS if unsigned DMG is downloaded from browser.
- Background AST indexing on codebases exceeding 100,000 LOC may show brief initial CPU spikes before SQLite WAL flush.
