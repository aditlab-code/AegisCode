Berikut adalah rancangan spesifikasi teknis lengkap untuk integrasi **SQLite Core + CodeGraph Knowledge Engine + Native MCP Bridge**, yang siap diadopsi ke dalam roadmap rekayasa AegisCode:

---

# Sub-Phase: Pure-Go SQLite Architecture, CodeGraph Engine & Native MCP Bridge

> **Objective**: Menggantikan persistensi *flat-file* dengan **Pure-Go SQLite** (`modernc.org/sqlite`) berkinerja tinggi, membangun **CodeGraph Knowledge Engine** lokal untuk memetakan arsitektur kode (*AST & relation graph*), serta mengeksposnya sebagai **MCP (Model Context Protocol) Server** bawaan agar agen AI (Gemini, Claude, OpenCode) dapat bernavigasi ke dalam relasi kode secara presisi (*surgical context*) dengan efisiensi token maksimal.

---

## 1. Arsitektur & Aturan Dasar (Design Constraints)

1. **Strict Zero-CGO Matrix (`CGO_ENABLED=0`)**:
* Seluruh komponen database wajib menggunakan `modernc.org/sqlite`. Kompilasi lintas platform (macOS arm64/amd64, Linux, Windows) tetap murni satu binary portabel tanpa ketergantungan toolchain GCC/Clang.


2. **Zero Repo Pollution Policy**:
* Repositori proyek yang sedang dibuka pengembang **tidak boleh dikotori file database atau lockfile**.
* Database dibagi menjadi 2 partisi terisolasi:
* **Global Core Store**: `~/.aegis/aegis.db` (konfigurasi, state, riwayat chat AI, FTS5, dan binary blobs).
* **Project CodeGraph Cache**: `~/.aegis/graphs/<workspace_hash>.db` (indeks graf relasi simbol kode per proyek).




3. **High-Concurrency WAL Mode**:
* Database dikonfigurasi dengan `PRAGMA journal_mode = WAL;`, `PRAGMA synchronous = NORMAL;`, dan `PRAGMA busy_timeout = 5000;` agar pembacaan graf oleh MCP tidak mengunci proses penulisan editor.



---

## 2. Skema Database SQLite Lengkap (DDL)

### Bagian A: Global Store (`~/.aegis/aegis.db`)

```sql
-- 1. Konfigurasi IDE Global
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. State Aplikasi, Pointers & Recent Projects
CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_session_id TEXT,
    recent_projects_json TEXT NOT NULL DEFAULT '[]',
    window_state_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);

-- 3. AI Chat Sessions (Master Registry)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);

-- 4. Event Node Ledger (Multi-turn, Branching, Thought traces)
CREATE TABLE IF NOT EXISTS chat_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    parent_id TEXT,
    role TEXT NOT NULL, -- 'user', 'agent', 'system'
    text TEXT NOT NULL,
    reasoning TEXT,
    provider TEXT,
    model TEXT,
    context_json TEXT,
    tool_calls_json TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_events_session ON chat_events(session_id, created_at ASC);

-- 5. Full-Text Search (FTS5) Riwayat Chat AI
CREATE VIRTUAL TABLE IF NOT EXISTS chat_fts USING fts5(
    session_id UNINDEXED,
    event_id UNINDEXED,
    text,
    reasoning,
    content='chat_events',
    content_rowid='rowid'
);

-- Triggers Sinkronisasi FTS Otomatis
CREATE TRIGGER IF NOT EXISTS trg_chat_events_ai AFTER INSERT ON chat_events BEGIN
    INSERT INTO chat_fts(rowid, session_id, event_id, text, reasoning)
    VALUES (new.rowid, new.session_id, new.id, new.text, coalesce(new.reasoning, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_chat_events_ad AFTER DELETE ON chat_events BEGIN
    INSERT INTO chat_fts(chat_fts, rowid, session_id, event_id, text, reasoning)
    VALUES ('delete', old.rowid, old.session_id, old.id, old.text, coalesce(old.reasoning, ''));
END;

-- 6. Content-Addressed Blobs (>4KB Output/Dumps)
CREATE TABLE IF NOT EXISTS blobs (
    hash TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

```

---

### Bagian B: Project CodeGraph Store (`~/.aegis/graphs/<workspace_hash>.db`)

```sql
-- 1. Metadata File & Hash Pelacak Perubahan (Incremental Ingestion)
CREATE TABLE IF NOT EXISTS graph_files (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    hash TEXT NOT NULL, -- SHA-256 konten
    language TEXT NOT NULL,
    mtime INTEGER NOT NULL,
    size INTEGER NOT NULL,
    indexed_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_path ON graph_files(path);

-- 2. Entitas Simbol Kode (Nodes)
CREATE TABLE IF NOT EXISTS code_symbols (
    id INTEGER PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES graph_files(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL, -- 'function', 'method', 'class', 'interface', 'type', 'variable'
    signature TEXT,     -- e.g. "func StreamChat(ctx context.Context) error"
    scope TEXT,         -- package / namespace / class container
    doc_comment TEXT,   -- komentar dokumentasi simbol
    line_start INTEGER NOT NULL,
    line_end INTEGER NOT NULL,
    col_start INTEGER NOT NULL,
    col_end INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_symbols_name ON code_symbols(name);
CREATE INDEX IF NOT EXISTS idx_symbols_file ON code_symbols(file_id);
CREATE INDEX IF NOT EXISTS idx_symbols_kind ON code_symbols(kind);

-- 3. Relasi Ketergantungan Simbol (Edges)
CREATE TABLE IF NOT EXISTS code_edges (
    id INTEGER PRIMARY KEY,
    source_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
    target_symbol_id INTEGER REFERENCES code_symbols(id) ON DELETE CASCADE,
    target_raw_name TEXT, -- Fallback jika target simbol dari package external/stdlib
    relation TEXT NOT NULL, -- 'calls', 'imports', 'implements', 'extends', 'instantiates', 'references'
    line_number INTEGER NOT NULL,
    confidence REAL DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_edges_source ON code_edges(source_symbol_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON code_edges(target_symbol_id);
CREATE INDEX IF NOT EXISTS idx_edges_relation ON code_edges(relation);

-- 4. FTS5 Index Simbol Kode (Pencarian Cepat Simbol)
CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
    symbol_id UNINDEXED,
    name,
    signature,
    doc_comment,
    content='code_symbols',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS trg_code_symbols_ai AFTER INSERT ON code_symbols BEGIN
    INSERT INTO symbol_fts(rowid, symbol_id, name, signature, doc_comment)
    VALUES (new.id, new.id, new.name, coalesce(new.signature, ''), coalesce(new.doc_comment, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_code_symbols_ad AFTER DELETE ON code_symbols BEGIN
    INSERT INTO symbol_fts(symbol_fts, rowid, symbol_id, name, signature, doc_comment)
    VALUES ('delete', old.id, old.id, old.name, coalesce(old.signature, ''), coalesce(old.doc_comment, ''));
END;

```

---

## 3. Pipeline Ekstraksi & Indexing (*Zero-Lag Ingestion*)

* **Incremental Background Worker**:
* Menggunakan Go *Process Supervisor* dengan prioritas *idle/low-priority goroutine*.
* Memanfaatkan event dari *Real-Time Disk Watcher* (`/api/v1/events/workspace`).
* Saat file disimpan (`Ctrl+S`), Go hanya memvalidasi apakah `mtime` atau SHA-256 berubah. Jika berubah, Go menghapus record lama di `graph_files` (otomatis men-trigger `CASCADE DELETE` pada simbol dan edge terkait) lalu mem-parsing ulang hanya file tersebut dalam < 10 ms.


* **Parser Simbol Ringan**:
* **Go**: Menggunakan package bawaan `go/parser` dan `go/ast` (0 overhead eksternal).
* **TypeScript/JavaScript/Python**: Menggunakan ekstrasi berbasis tree-sitter atau memanfaatkan *LSP Document Symbols* (`textDocument/documentSymbol`) yang sudah terhubung di Go core server.



---

## 4. Spesifikasi Native MCP Server API

Backend Go AegisCode mengekspos endpoint **Model Context Protocol (JSON-RPC 2.0)** di `/api/v1/mcp` (mendukung transport HTTP/SSE dan Stdio runner):

### Daftar Tools yang Diberikan ke AI Agent:

#### 1. `get_symbol_definition`

* **Input**: `{ "name": "StreamChatAntigravity", "file_hint": "antigravity.go" }`
* **Output**: Lokasi file, signature, rentang baris, dan isi docstring.

#### 2. `find_callers` (Mencari Siapa yang Memanggil Fungsi)

* **Input**: `{ "function_name": "ResolveAntigravityBinary" }`
* **Query SQL di Balik Layar**:
```sql
SELECT s2.name, f2.path, e.line_number
FROM code_symbols s1
JOIN code_edges e ON e.target_symbol_id = s1.id
JOIN code_symbols s2 ON e.source_symbol_id = s2.id
JOIN graph_files f2 ON s2.file_id = f2.id
WHERE s1.name = ? AND e.relation = 'calls';

```


* **Output Ringkas (< 100 token)**:
```json
[
  { "caller": "ListAntigravityModels", "file": "server/internal/ai/antigravity.go", "line": 112 },
  { "caller": "probeAntigravity", "file": "server/internal/ai/probe.go", "line": 490 }
]

```



#### 3. `get_dependencies` (Mencari Ketergantungan File/Simbol)

* **Input**: `{ "file_path": "src/App.tsx" }`
* **Output**: Daftar komponen dan store yang diimpor oleh berkas tersebut.

#### 4. `query_subgraph` (Eksplorasi Relasi Bertingkat)

* **Input**: `{ "root_symbol": "createChatSlice", "depth": 2 }`
* **Output**: Peta node dan edge terkait dalam radius 2 hop ketergantungan.

---

## 5. Milestone Execution Checklist

* [ ] **Milestone 1: Pure-Go SQLite Driver & Core Store**
* Pasang dependensi `modernc.org/sqlite` di `server/go.mod`.
* Verifikasi build multi-target: `CGO_ENABLED=0 go build ./cmd/server`.
* Implementasikan koneksi WAL mode dan automigrasi skema `app_config`, `app_state`, `chat_sessions`, `chat_events`, `chat_fts`.


* [ ] **Milestone 2: Non-Destructive Flat-File Shadow Migration**
* Migrasikan data legacy `~/.aegis/config.json`, `state.json`, dan `chats/*.jsonl` ke `aegis.db` saat booting pertama kali tanpa menghapus berkas asal.


* [ ] **Milestone 3: CodeGraph Engine di Backend Go**
* Buat package `server/internal/codegraph/`.
* Implementasikan koneksi database per-workspace (`~/.aegis/graphs/<hash>.db`).
* Implementasikan AST extractor untuk Go (`go/ast`) dan TypeScript/JS (LSP symbols).
* Tautkan dengan *Workspace Disk Watcher* agar re-indexing berjalan otomatis saat file berubah.


* [ ] **Milestone 4: Native MCP Server Engine**
* Implementasikan protokol JSON-RPC 2.0 MCP di `server/internal/mcp/`.
* Daftarkan tools: `find_callers`, `get_symbol_definition`, `get_dependencies`, `query_subgraph`.
* Integrasikan tools ini langsung ke provider engine AegisCode (Antigravity/Gemini dan Claude).


* [ ] **Milestone 5: Pengujian & Benchmarking**
* **Uji Konkurensi**: Simulasi 50 concurrent query MCP sambil melakukan transaksi penyimpanan chat (target 0 database locked error).
* **Uji Efisiensi Token**: Bandingkan token prompt sebelum dan sesudah ada CodeGraph MCP (target penghematan token $\ge 80\%$ pada tugas refactoring kode).