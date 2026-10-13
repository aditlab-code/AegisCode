# 0013. Embedded Pure-Go SQLite Engine and FTS5 Search

- **Status**: Accepted & Implemented (2026-10-13)
- **Deciders**: AegisCode Architecture Core, Antigravity Agent
- **Supercedes**: Fragmented flat-file persistence (`ADR-0002`, `ADR-0007`, `ADR-0009`)

---

## Context
AegisCode previously persisted system state, user configurations, and AI chat histories in fragmented flat-files (`~/.aegis/config.json`, `~/.aegis/state.json`, `~/.aegis/sessions.json`, `~/.aegis/chats/*.jsonl`, and `~/.aegis/blobs/*.raw`). While lightweight and pure-Go, managing multiple flat files introduced several challenges:
1. Multi-client write concurrency risks (*last-write-wins* conflicts) ahead of Phase 9 (Tablet Companion).
2. Absence of relational indexing and Full-Text Search (FTS) for past conversations.
3. Complex multi-file state management during session branching, deletions, and crash recovery.
4. Legacy flat-file sprawl across the filesystem.

Traditional SQLite Go drivers like `mattn/go-sqlite3` require CGO (`CGO_ENABLED=1`), which introduces GCC/Clang toolchain dependencies and severely hampers cross-compilation across macOS, Linux, and Windows.

---

## Decision
We decided to adopt **`modernc.org/sqlite`** as an embedded, pure-Go, zero-CGO relational database engine (`~/.aegis/aegis.db`):

1. **Strict Zero-CGO (`CGO_ENABLED=0`)**: Standardizing on `modernc.org/sqlite` maintains 100% portable Go compilation across Apple Silicon, Intel, Linux (amd64/arm64), and Windows without external C compilers.
2. **High-Concurrency WAL Mode & Connection Pragmas**: The database connection string configures Write-Ahead Logging (`?_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=cache_size(-2000)`), ensuring every pooled connection inherits non-blocking concurrent reads alongside serialized writes.
3. **Unified Graph-First Schema**: The `chat_events` table preserves fine-grained dialogue event nodes (`type`, `parent_id`, `text`, `reasoning`, `tool_name`, `meta_json`) with 100% data fidelity for tree traversal, branching, and retry turns.
4. **Content-Addressed Blob Storage (CAS)**: Heavy payloads (> 4 KB) are stored directly in the `blobs` table as binary BLOBs with composite primary key `(session_id, hash)`. This guarantees multi-session blob isolation and automatic cascading cleanup on session deletion.
5. **Full-Text Search (FTS5)**: A virtual table `chat_fts USING fts5` with insert/delete/update triggers provides sub-3ms phrase and token searching across user prompts, assistant answers, and thinking reasoning deltas via `GET /api/v1/chats/search`. Prefix matching with token suffix wildcard (`*`) supports instant as-you-type search queries.
6. **Project-Scoped AI Chat Sessions (Option 2: Per-Workspace)**: The `chat_sessions` table includes `workspace_path TEXT NOT NULL DEFAULT ''` with index `idx_chat_sessions_workspace`. The backend API and frontend sidebar support project-scoped session filtering with an interactive toggle (`Current Workspace` vs `All Projects`).
7. **Self-Healing Migration & Total Legacy Orphans Cleanup**:
   - `migrateSchema` performs pre-DDL auto-healing to safely upgrade existing databases missing `workspace_path` or composite primary keys without runtime failures.
   - Non-destructive shadow migration transactionally imports all existing flat-files into SQLite.
   - Remnant sessions from `legacy_backup/chats` are ingested, empty `chats/` and `blobs/` folders are removed, and `legacy_backup/` is purged, resulting in a single self-contained database (`~/.aegis/aegis.db`) with zero directory clutter.

---

## Consequences
- **Positive**: Single-file storage boundary (`aegis.db`), ACID transactions, fast full-text search (< 3 ms), seamless cross-platform binary builds (`CGO_ENABLED=0`), safe multi-client concurrency, project-scoped conversation isolation, zero directory clutter.
- **Negative**: Adds ~2.5 MB to uncompressed Go binary size (well within our lightweight target).
