# AegisCode Database Schema & Partitioning Specification

AegisCode utilizes an embedded, zero-CGO, pure-Go SQLite relational engine (`modernc.org/sqlite`) running with Write-Ahead Logging (`WAL`).

---

## 1. Database Partitioning Strategy

Storage is cleanly partitioned across two tiers to ensure strict project isolation and zero repository pollution:

```text
~/.aegis/
├── aegis.db                   # [Global Tier] System configs, chat ledgers, blobs, and chat FTS
└── graphs/
    ├── a1b2c3d4e5f6.db        # [Project Tier] Workspace AST code symbols and dependency graph
    └── 7e8d9c0b1a2f.db        # [Project Tier] Workspace B AST code symbols and dependency graph
```

* **Global Tier (`aegis.db`)**: Houses user preferences, session metadata, dialog history, content-addressed blob payloads, and cross-session search indices.
* **Project Tier (`graphs/<workspace_hash>.db`)**: Scoped per project workspace, keyed by the 16-character SHA-256 hash of the cleaned workspace root path (`ComputeWorkspaceHash`). If a user deletes or renames a project, its graph cache can be discarded without touching global conversation records.

---

## 2. Global Database Schema (`~/.aegis/aegis.db`)

### Connection PRAGMAs
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
PRAGMA cache_size = -2000; -- ~2 MB cache
```

### Table Dictionary

#### 1. `app_config` & `app_state`
Stores persistent global user settings (`id = 1` singleton row) and workbench window/recent project state.
```sql
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_session_id TEXT,
    recent_projects_json TEXT NOT NULL DEFAULT '[]',
    window_state_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);
```

#### 2. `chat_sessions`
Manages AI conversation threads, external CLI `conversation_id` links, branch pointers, and project scoping.
```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    workspace_path TEXT NOT NULL DEFAULT '',
    conversation_id TEXT NOT NULL DEFAULT '',
    root_node_id TEXT,
    active_leaf_id TEXT,
    node_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_workspace ON chat_sessions(workspace_path, updated_at DESC);
```

#### 3. `chat_events`
Append-only graph ledger preserving fine-grained dialog event nodes, model thoughts, tool calls, and branching parent-child links.
```sql
CREATE TABLE IF NOT EXISTS chat_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    parent_id TEXT,
    type TEXT NOT NULL,          -- 'user', 'assistant', 'thought', 'tool_call', 'tool_result'
    text TEXT,
    reasoning TEXT,
    tool_name TEXT,
    meta_json TEXT,              -- JSON metadata (tokens, models, timestamps)
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_events_session ON chat_events(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_events_parent ON chat_events(parent_id);
```

#### 4. `blobs`
Content-Addressed Storage (CAS) for large event payloads (> 4 KB), preventing table bloat in `chat_events`.
```sql
CREATE TABLE IF NOT EXISTS blobs (
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    hash TEXT NOT NULL,
    data BLOB NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, hash)
);
```

#### 5. `chat_fts` (FTS5 Full-Text Search)
External-content virtual full-text search table backed by `chat_events` with automatic insert/update/delete triggers.
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS chat_fts USING fts5(
    session_id UNINDEXED,
    id UNINDEXED,
    text,
    reasoning,
    content='chat_events',
    content_rowid='rowid'
);
```

---

## 3. Project Workspace Graph Schema (`graphs/<hash>.db`)

### Table Dictionary

#### 1. `graph_files`
Tracks indexed source files and their SHA-256 hashes for fast bailout detection.
```sql
CREATE TABLE IF NOT EXISTS graph_files (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,     -- Relative path inside workspace
    hash TEXT NOT NULL,           -- SHA-256 hex digest
    language TEXT NOT NULL,       -- 'go', 'typescript', 'python', etc.
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graph_files_path ON graph_files(path);
```

#### 2. `code_symbols`
Extracted AST symbols, declarations, line bounds, and documentation comments.
```sql
CREATE TABLE IF NOT EXISTS code_symbols (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES graph_files(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,           -- 'function', 'struct', 'interface', 'variable'
    signature TEXT,
    scope TEXT,
    doc_comment TEXT,
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    col_start INTEGER NOT NULL,
    col_end INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_code_symbols_name ON code_symbols(name);
CREATE INDEX IF NOT EXISTS idx_code_symbols_file_id ON code_symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_code_symbols_kind ON code_symbols(kind);
CREATE INDEX IF NOT EXISTS idx_code_symbols_scope ON code_symbols(scope);
```

#### 3. `code_edges`
Directional dependency, caller/callee, and type inheritance relationships between symbols.
```sql
CREATE TABLE IF NOT EXISTS code_edges (
    id INTEGER PRIMARY KEY,
    source_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
    target_symbol_id INTEGER REFERENCES code_symbols(id) ON DELETE CASCADE,
    target_raw_name TEXT,
    relation TEXT NOT NULL,       -- 'calls', 'implements', 'imports', 'references'
    line_number INTEGER NOT NULL,
    confidence REAL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_code_edges_source ON code_edges(source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_code_edges_target ON code_edges(target_symbol_id);
CREATE INDEX IF NOT EXISTS idx_code_edges_relation ON code_edges(relation);
```

#### 4. `symbol_fts` (FTS5 Search)
External-content virtual table synchronized with `code_symbols` (`content_rowid='id'`) for fast symbol lookup and autocomplete.
```sql
CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
    name,
    signature,
    doc_comment,
    content='code_symbols',
    content_rowid='id'
);
```
