Berikut adalah rancangan spesifikasi fase migrasi dari **Flat-File JSON/JSONL** ke **Pure-Go SQLite Engine**, yang dapat langsung diadopsi ke dalam `docs/internal/roadmap.md` (misalnya sebagai **Sub-Phase 6.12: Embedded SQLite Storage & Full-Text Search Engine**):

---

# Sub-Phase 6.12: Embedded Pure-Go SQLite Engine & FTS5 Search

> **Objective**: Menggantikan persistensi *flat-file* terfragmentasi (`config.json`, `state.json`, `sessions.json`, `chats/*.jsonl`) dengan engine database tertanam (*embedded database*) berbasis **Pure-Go SQLite** (`modernc.org/sqlite`). Menjamin transaksi ACID, konkurensi aman multi-perangkat (persiapan Tablet Companion Phase 9), dan fitur *Full-Text Search* (FTS5) riwayat AI berkecepatan tinggi tanpa merusak prinsip *CGO-Free* (`CGO_ENABLED=0`).

---

### 1. Architectural Decisions & Constraints

1. **Strict Zero-CGO Constraint (`modernc.org/sqlite`)**:
* Menolak driver standar seperti `mattn/go-sqlite3` karena mewajibkan CGO (butuh GCC/Clang eksternal yang merusak matriks cross-compile).
* Standarisasi pada **`modernc.org/sqlite`** (SQLite3 yang ditranspilasi ke pure Go murni). Menjaga status kompilasi `CGO_ENABLED=0` tetap 100% portabel di macOS (Apple Silicon/Intel), Linux (amd64/arm64), dan Windows.
* Dampak binary: Penambahan ukuran binary hanya ~2.5 MB (tetap di kisaran ~10–11 MB setelah kompresi UPX).


2. **High-Concurrency PRAGMA Configuration (WAL Mode)**:
* Mengaktifkan Write-Ahead Logging untuk mengizinkan banyak *concurrent readers* bersamaan dengan satu *writer* tanpa *database lock*:
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -2000; -- ~2MB cache

```




3. **Storage Boundary**:
* Seluruh database tersimpan di satu berkas lokal: `~/.aegis/aegis.db` (atau `%APPDATA%\AegisCode\aegis.db` di Windows).
* Project repository tetap bersih (**Zero Repo Pollution**).



---

### 2. Database Schema Specification

```sql
-- 1. Global User Configuration
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. Workspace State & Window Pointers
CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    active_session_id TEXT,
    recent_projects_json TEXT NOT NULL DEFAULT '[]',
    window_state_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
);

-- 3. AI Chat Sessions (Master Index)
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

-- 4. Chat Conversation Event Graph (Node Ledger)
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

-- 5. Full-Text Search (FTS5) Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS chat_fts USING fts5(
    session_id UNINDEXED,
    event_id UNINDEXED,
    text,
    reasoning,
    content='chat_events',
    content_rowid='rowid'
);

-- Triggers untuk sinkronisasi FTS otomatis
CREATE TRIGGER IF NOT EXISTS trg_chat_events_ai AFTER INSERT ON chat_events BEGIN
    INSERT INTO chat_fts(rowid, session_id, event_id, text, reasoning)
    VALUES (new.rowid, new.session_id, new.id, new.text, coalesce(new.reasoning, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_chat_events_ad AFTER DELETE ON chat_events BEGIN
    INSERT INTO chat_fts(chat_fts, rowid, session_id, event_id, text, reasoning)
    VALUES ('delete', old.rowid, old.session_id, old.id, old.text, coalesce(old.reasoning, ''));
END;

-- 6. Content-Addressed Blob Storage (Tool Outputs & Terminal Dumps > 4KB)
CREATE TABLE IF NOT EXISTS blobs (
    hash TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);

```

---

### 3. Non-Destructive Shadow Migration Strategy (ADR 0007 Compliance)

Agar data pengguna yang sudah ada tidak hilang:

1. **Detection on Boot**:
* Saat `store.New()` dieksekusi di `server/internal/store/store.go`:
* Periksa apakah `aegis.db` sudah ada. Jika belum ada, buat skema tabel baru.


2. **Shadow Ingestion**:
* Jika direktori flat-file legacy (`~/.aegis/config.json`, `~/.aegis/state.json`, `~/.aegis/chats/*.jsonl`) ditemukan:
* Buka transaksi SQLite: `tx, _ := db.Begin()`.
* Migrasikan data config dan app state.
* Baca setiap berkas `.jsonl` di `chats/`, parsing event node, dan masukkan ke tabel `chat_sessions` dan `chat_events`.
* Salin berkas blob mentah dari `~/.aegis/blobs/` ke tabel `blobs`.
* Eksekusi `tx.Commit()`.




3. **Zero Data Loss**:
* Berkas flat-file lama **tidak dihapus** (hanya di-*rename* menjadi `~/.aegis/legacy_backup/` atau dibiarkan sebagai cadangan) untuk menjamin rasa aman bagi pengguna.



---

### 4. API & Feature Upgrades yang Terbuka

Dengan migrasi ke SQLite, dua kapabilitas besar langsung aktif:

1. **Endpoint Full-Text Search Baru (`GET /api/v1/chats/search?q=<keyword>`)**:
* Pengguna bisa mencari percakapan masa lalu berdasarkan kata kunci.
* Query FTS5 berjalan dalam **< 3 ms** melintasi ribuan giliran chat:
```sql
SELECT session_id, event_id, snippet(chat_fts, 2, '<b>', '</b>', '...', 15)
FROM chat_fts WHERE chat_fts MATCH ? ORDER BY rank LIMIT 30;

```




2. **Atomic Session Branching**:
* Mengganti atau mencoba ulang prompt (retry turn) cukup melakukan *insert* event baru dengan `parent_id` spesifik tanpa khawatir menimpa data file teks yang sedang dibuka.


3. **Multi-Client Concurrency (Persiapan Phase 9)**:
* Menghilangkan risiko *last-write-wins* saat Tablet Companion dan Desktop menulis sesi secara bersamaan.



---

### 5. Milestone Execution Checklist

* [x] **Step 1: Driver Integration**
* Pasang dependensi `modernc.org/sqlite` di `server/go.mod`.
* Verifikasi bahwa `go -C server build` tetap berhasil dengan `CGO_ENABLED=0`.


* [x] **Step 2: Database Layer (`server/internal/store/db.go`)**
* Implementasikan inisialisasi koneksi dengan WAL PRAGMAs dan pool koneksi (`SetMaxOpenConns(25)`, connection pooling, busy timeout).
* Buat automigrasi DDL schema di atas.

* [x] **Step 3: Refactor Store Interface (`store.go`)**
* Ganti pembacaan/penulisan file JSON pada method `GetConfig`, `SaveConfig`, `GetState`, `SaveState`, `ListChats`, `GetChat`, `AppendEventNode` menjadi query SQL.
* Pertahankan signature fungsi 100% sama agar `server/internal/api/api.go` tidak mengalami breaking change.

* [x] **Step 4: Legacy Shadow Migrator (`migrate_sqlite.go`)**
* Buat modul pembaca flat-file lama ke SQLite saat pertama kali booting dan backup aman ke `legacy_backup/`.

* [x] **Step 5: FTS API Endpoint**
* Tambahkan route `GET /api/v1/chats/search` di handler API.

* [x] **Step 6: Unit & Integration Tests**
* Buat `sqlite_test.go` untuk memverifikasi konkurensi, ACID rollback, FTS matching, dan migrasi tanpa data korup.