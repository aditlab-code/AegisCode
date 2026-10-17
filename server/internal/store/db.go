package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

// OpenDB opens a connection to the SQLite database with WAL pragma settings
// and executes initial schema migrations.
func OpenDB(dbPath string) (*sql.DB, error) {
	if dbPath == "" {
		return nil, fmt.Errorf("database path cannot be empty")
	}

	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create directory for database: %w", err)
	}
	_ = os.Chmod(dir, 0700)

	// Open connection with pure-Go modernc.org/sqlite driver, ensuring every connection
	// in the pool inherits WAL, foreign_keys, busy_timeout, and immediate tx lock via DSN URI parameters.
	cleanDSNPath := filepath.ToSlash(dbPath)
	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=cache_size(-2000)&_pragma=temp_store(MEMORY)&_txlock=immediate", cleanDSNPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database %s: %w", dbPath, err)
	}

	// Restrict database file permissions to user-only (0600) (ADR 0017)
	if stat, sErr := os.Stat(dbPath); sErr == nil && !stat.IsDir() {
		_ = os.Chmod(dbPath, 0600)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	// Set high-concurrency PRAGMAs on initial connection
	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA busy_timeout = 5000;",
		"PRAGMA cache_size = -2000;", // ~2MB cache
	}
	for _, pragma := range pragmas {
		if _, pErr := db.Exec(pragma); pErr != nil {
			_ = db.Close()
			return nil, fmt.Errorf("failed to execute %s: %w", pragma, pErr)
		}
	}

	// Restrict newly created WAL/shm files if present
	if stat, sErr := os.Stat(dbPath); sErr == nil && !stat.IsDir() {
		_ = os.Chmod(dbPath, 0600)
	}

	// Execute initial schema DDL migrations
	if err := migrateSchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to migrate database schema: %w", err)
	}

	return db, nil
}

// migrateSchema executes table, index, and FTS5 triggers creation.
func migrateSchema(db *sql.DB) error {
	// Auto-heal legacy chat_sessions table if missing 'workspace_path' or 'conversation_id' columns
	var hasSessionsTable int
	_ = db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='chat_sessions'`).Scan(&hasSessionsTable)
	if hasSessionsTable > 0 {
		var hasWorkspaceCol int
		_ = db.QueryRow(`SELECT count(*) FROM pragma_table_info('chat_sessions') WHERE name = 'workspace_path'`).Scan(&hasWorkspaceCol)
		if hasWorkspaceCol == 0 {
			if _, err := db.Exec(`ALTER TABLE chat_sessions ADD COLUMN workspace_path TEXT NOT NULL DEFAULT ''`); err != nil {
				return fmt.Errorf("failed to add workspace_path column to chat_sessions: %w", err)
			}
		}
		var hasConvIDCol int
		_ = db.QueryRow(`SELECT count(*) FROM pragma_table_info('chat_sessions') WHERE name = 'conversation_id'`).Scan(&hasConvIDCol)
		if hasConvIDCol == 0 {
			if _, err := db.Exec(`ALTER TABLE chat_sessions ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''`); err != nil {
				return fmt.Errorf("failed to add conversation_id column to chat_sessions: %w", err)
			}
		}
	}

	// Auto-heal legacy blobs table if session_id is not part of primary key
	var blobSessionPK int
	_ = db.QueryRow(`SELECT pk FROM pragma_table_info('blobs') WHERE name = 'session_id'`).Scan(&blobSessionPK)
	if blobSessionPK == 0 {
		var hasBlobsTable int
		_ = db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name='blobs'`).Scan(&hasBlobsTable)
		if hasBlobsTable > 0 {
			_, _ = db.Exec(`
				CREATE TABLE IF NOT EXISTS blobs_new (
					hash TEXT NOT NULL,
					session_id TEXT NOT NULL,
					data BLOB NOT NULL,
					size INTEGER NOT NULL,
					created_at INTEGER NOT NULL,
					PRIMARY KEY (session_id, hash)
				);
				INSERT OR IGNORE INTO blobs_new SELECT hash, coalesce(session_id, ''), data, size, created_at FROM blobs;
				DROP TABLE blobs;
				ALTER TABLE blobs_new RENAME TO blobs;
				CREATE INDEX IF NOT EXISTS idx_blobs_hash ON blobs(hash);
				CREATE INDEX IF NOT EXISTS idx_blobs_session ON blobs(session_id);
			`)
		}
	}

	// Auto-heal legacy chat_fts virtual table if created with old 'event_id' column
	var hasLegacyCol int
	_ = db.QueryRow(`SELECT count(*) FROM pragma_table_info('chat_fts') WHERE name = 'event_id'`).Scan(&hasLegacyCol)
	if hasLegacyCol > 0 {
		_, _ = db.Exec(`
			DROP TRIGGER IF EXISTS trg_chat_events_ai;
			DROP TRIGGER IF EXISTS trg_chat_events_ad;
			DROP TRIGGER IF EXISTS trg_chat_events_au;
			DROP TABLE IF EXISTS chat_fts;
		`)
	}

	schema := `
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

	-- 4. Chat Conversation Event Graph (Unified Graph-First Node Ledger)
	CREATE TABLE IF NOT EXISTS chat_events (
		id TEXT PRIMARY KEY,
		session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
		parent_id TEXT,
		type TEXT NOT NULL,
		role TEXT,
		text TEXT NOT NULL DEFAULT '',
		content TEXT NOT NULL DEFAULT '',
		reasoning TEXT NOT NULL DEFAULT '',
		tool_name TEXT NOT NULL DEFAULT '',
		tool_args_json TEXT NOT NULL DEFAULT '',
		tool_output TEXT NOT NULL DEFAULT '',
		blob_ref TEXT NOT NULL DEFAULT '',
		preview TEXT NOT NULL DEFAULT '',
		provider TEXT NOT NULL DEFAULT '',
		model TEXT NOT NULL DEFAULT '',
		meta_json TEXT NOT NULL DEFAULT '{}',
		created_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_chat_events_session ON chat_events(session_id, created_at ASC);
	CREATE INDEX IF NOT EXISTS idx_chat_events_parent ON chat_events(parent_id);

	-- 5. Content-Addressed Blob Storage (CAS Payloads > 4KB, scoped per session)
	CREATE TABLE IF NOT EXISTS blobs (
		hash TEXT NOT NULL,
		session_id TEXT NOT NULL,
		data BLOB NOT NULL,
		size INTEGER NOT NULL,
		created_at INTEGER NOT NULL,
		PRIMARY KEY (session_id, hash)
	);
	CREATE INDEX IF NOT EXISTS idx_blobs_hash ON blobs(hash);
	CREATE INDEX IF NOT EXISTS idx_blobs_session ON blobs(session_id);

	-- 6. Full-Text Search (FTS5) Virtual Table
	CREATE VIRTUAL TABLE IF NOT EXISTS chat_fts USING fts5(
		session_id UNINDEXED,
		id UNINDEXED,
		text,
		reasoning,
		content='chat_events',
		content_rowid='rowid'
	);

	-- Triggers for automatic FTS synchronization
	CREATE TRIGGER IF NOT EXISTS trg_chat_events_ai AFTER INSERT ON chat_events BEGIN
		INSERT INTO chat_fts(rowid, session_id, id, text, reasoning)
		VALUES (new.rowid, new.session_id, new.id, new.text, coalesce(new.reasoning, ''));
	END;

	CREATE TRIGGER IF NOT EXISTS trg_chat_events_ad AFTER DELETE ON chat_events BEGIN
		INSERT INTO chat_fts(chat_fts, rowid, session_id, id, text, reasoning)
		VALUES ('delete', old.rowid, old.session_id, old.id, old.text, coalesce(old.reasoning, ''));
	END;

	CREATE TRIGGER IF NOT EXISTS trg_chat_events_au AFTER UPDATE ON chat_events BEGIN
		INSERT INTO chat_fts(chat_fts, rowid, session_id, id, text, reasoning)
		VALUES ('delete', old.rowid, old.session_id, old.id, old.text, coalesce(old.reasoning, ''));
		INSERT INTO chat_fts(rowid, session_id, id, text, reasoning)
		VALUES (new.rowid, new.session_id, new.id, new.text, coalesce(new.reasoning, ''));
	END;

	-- 7. Master Vault & Quarantine Deadlock State
	CREATE TABLE IF NOT EXISTS master_vault (
		id INTEGER PRIMARY KEY CHECK (id = 1),
		is_initialized INTEGER NOT NULL DEFAULT 0,
		master_salt TEXT NOT NULL DEFAULT '',
		master_hash TEXT NOT NULL DEFAULT '',
		recovery_salt TEXT NOT NULL DEFAULT '',
		recovery_hash TEXT NOT NULL DEFAULT '',
		deadlock_quarantine INTEGER NOT NULL DEFAULT 0,
		failed_attempts INTEGER NOT NULL DEFAULT 0,
		lockout_until INTEGER NOT NULL DEFAULT 0,
		encrypted_secrets_json TEXT NOT NULL DEFAULT '{}',
		updated_at INTEGER NOT NULL
	);
	INSERT OR IGNORE INTO master_vault (id, is_initialized, master_salt, master_hash, recovery_salt, recovery_hash, deadlock_quarantine, failed_attempts, lockout_until, encrypted_secrets_json, updated_at)
	VALUES (1, 0, '', '', '', '', 0, 0, 0, '{}', 0);
	`

	_, err := db.Exec(schema)
	if err != nil {
		return err
	}

	// Backfill chat_fts if virtual table is empty while events exist
	var ftsCount, eventCount int
	_ = db.QueryRow(`SELECT count(*) FROM chat_fts`).Scan(&ftsCount)
	_ = db.QueryRow(`SELECT count(*) FROM chat_events`).Scan(&eventCount)
	if ftsCount == 0 && eventCount > 0 {
		_, _ = db.Exec(`
			INSERT INTO chat_fts(rowid, session_id, id, text, reasoning)
			SELECT rowid, session_id, id, text, coalesce(reasoning, '') FROM chat_events;
		`)
	}

	return nil
}
