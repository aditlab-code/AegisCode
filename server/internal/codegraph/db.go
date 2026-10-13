package codegraph

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
	_ "modernc.org/sqlite"
)

// ComputeWorkspaceHash returns a 16-character hex string representing the SHA-256
// hash of the cleaned absolute workspace root path.
func ComputeWorkspaceHash(root string) string {
	clean := filepath.Clean(strings.TrimSpace(root))
	if clean == "" || clean == "." {
		return ""
	}
	h := sha256.Sum256([]byte(clean))
	return hex.EncodeToString(h[:])[:16]
}

// ResolveGraphDBPath determines the filesystem path for the workspace's SQLite database.
func ResolveGraphDBPath(workspaceRoot string) (string, error) {
	hash := ComputeWorkspaceHash(workspaceRoot)
	if hash == "" {
		return "", fmt.Errorf("workspace root cannot be empty")
	}

	dataDir, err := store.ResolveDataDir()
	if err != nil || dataDir == "" {
		home, hErr := os.UserHomeDir()
		if hErr != nil {
			dataDir = filepath.Join(os.TempDir(), "aegis")
		} else {
			dataDir = filepath.Join(home, ".aegis")
		}
	}

	graphsDir := filepath.Join(dataDir, "graphs")
	if err := os.MkdirAll(graphsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create graphs directory %s: %w", graphsDir, err)
	}

	return filepath.Join(graphsDir, fmt.Sprintf("%s.db", hash)), nil
}

// OpenGraphDB opens a connection to the SQLite database with high-concurrency PRAGMAs
// and performs initial schema migrations.
func OpenGraphDB(dbPath string) (*sql.DB, error) {
	if dbPath == "" {
		return nil, fmt.Errorf("database path cannot be empty")
	}

	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory for database: %w", err)
	}

	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=foreign_keys(ON)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=cache_size(-2000)&_pragma=recursive_triggers(ON)", dbPath)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite database %s: %w", dbPath, err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	pragmas := []string{
		"PRAGMA journal_mode = WAL;",
		"PRAGMA synchronous = NORMAL;",
		"PRAGMA busy_timeout = 5000;",
		"PRAGMA foreign_keys = ON;",
		"PRAGMA recursive_triggers = ON;",
	}
	for _, pragma := range pragmas {
		if _, err := db.Exec(pragma); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("failed to execute pragma %q: %w", pragma, err)
		}
	}

	if err := MigrateGraphSchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("failed to migrate graph schema: %w", err)
	}

	return db, nil
}

// MigrateGraphSchema creates graph_files, code_symbols, code_edges tables, indices, and FTS5 triggers.
func MigrateGraphSchema(db *sql.DB) error {
	schema := `
	-- 1. Tracked Files
	CREATE TABLE IF NOT EXISTS graph_files (
		id INTEGER PRIMARY KEY,
		path TEXT NOT NULL UNIQUE,
		hash TEXT NOT NULL,
		language TEXT NOT NULL,
		mtime INTEGER NOT NULL,
		size INTEGER NOT NULL,
		indexed_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_graph_files_path ON graph_files(path);

	-- 2. Code Symbols
	CREATE TABLE IF NOT EXISTS code_symbols (
		id INTEGER PRIMARY KEY,
		file_id INTEGER NOT NULL REFERENCES graph_files(id) ON DELETE CASCADE,
		name TEXT NOT NULL,
		kind TEXT NOT NULL,
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

	-- 3. Code Edges
	CREATE TABLE IF NOT EXISTS code_edges (
		id INTEGER PRIMARY KEY,
		source_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
		target_symbol_id INTEGER REFERENCES code_symbols(id) ON DELETE CASCADE,
		target_raw_name TEXT,
		relation TEXT NOT NULL,
		line_number INTEGER NOT NULL,
		confidence REAL DEFAULT 1.0
	);
	CREATE INDEX IF NOT EXISTS idx_code_edges_source ON code_edges(source_symbol_id);
	CREATE INDEX IF NOT EXISTS idx_code_edges_target ON code_edges(target_symbol_id);
	CREATE INDEX IF NOT EXISTS idx_code_edges_relation ON code_edges(relation);
	CREATE INDEX IF NOT EXISTS idx_code_edges_raw_name ON code_edges(target_raw_name);

	-- 4. Full-Text Search Virtual Table
	CREATE VIRTUAL TABLE IF NOT EXISTS symbol_fts USING fts5(
		name,
		signature,
		doc_comment,
		content='code_symbols',
		content_rowid='id'
	);

	-- 5. FTS Triggers
	CREATE TRIGGER IF NOT EXISTS trg_code_symbols_ai AFTER INSERT ON code_symbols BEGIN
		INSERT INTO symbol_fts(rowid, name, signature, doc_comment)
		VALUES (new.id, new.name, coalesce(new.signature, ''), coalesce(new.doc_comment, ''));
	END;

	CREATE TRIGGER IF NOT EXISTS trg_code_symbols_ad AFTER DELETE ON code_symbols BEGIN
		INSERT INTO symbol_fts(symbol_fts, rowid, name, signature, doc_comment)
		VALUES ('delete', old.id, old.name, coalesce(old.signature, ''), coalesce(old.doc_comment, ''));
	END;

	CREATE TRIGGER IF NOT EXISTS trg_code_symbols_au AFTER UPDATE ON code_symbols BEGIN
		INSERT INTO symbol_fts(symbol_fts, rowid, name, signature, doc_comment)
		VALUES ('delete', old.id, old.name, coalesce(old.signature, ''), coalesce(old.doc_comment, ''));
		INSERT INTO symbol_fts(rowid, name, signature, doc_comment)
		VALUES (new.id, new.name, coalesce(new.signature, ''), coalesce(new.doc_comment, ''));
	END;
	`

	_, err := db.Exec(schema)
	return err
}

// IngestExtractedFile writes an extracted file, symbols, and edges into the database
// inside a single transaction. Existing data for the path is overwritten cleanly.
func IngestExtractedFile(ctx context.Context, db *sql.DB, file *ExtractedFile, hash string, mtime, size int64) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	// Clean out existing file and symbols to ensure clean FTS and cascade
	var oldFileID int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM graph_files WHERE path = ?`, file.Path).Scan(&oldFileID)
	if err == nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM code_symbols WHERE file_id = ?`, oldFileID); err != nil {
			return fmt.Errorf("failed to delete old symbols for %s: %w", file.Path, err)
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM graph_files WHERE id = ?`, oldFileID); err != nil {
			return fmt.Errorf("failed to delete old file record for %s: %w", file.Path, err)
		}
	}

	now := time.Now().Unix()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO graph_files (path, hash, language, mtime, size, indexed_at) VALUES (?, ?, ?, ?, ?, ?)`,
		file.Path, hash, file.Language, mtime, size, now,
	)
	if err != nil {
		return fmt.Errorf("failed to insert graph_file for %s: %w", file.Path, err)
	}

	fileID, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get file ID for %s: %w", file.Path, err)
	}

	// Insert symbols
	symbolIDs := make([]int64, len(file.Symbols))
	nameToID := make(map[string]int64)

	stmtSym, err := tx.PrepareContext(ctx, `
		INSERT INTO code_symbols (file_id, name, kind, signature, scope, doc_comment, line_start, line_end, col_start, col_end)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return fmt.Errorf("failed to prepare symbol statement: %w", err)
	}
	defer stmtSym.Close()

	for i, s := range file.Symbols {
		sRes, err := stmtSym.ExecContext(ctx,
			fileID, s.Name, s.Kind, s.Signature, s.Scope, s.DocComment,
			s.LineStart, s.LineEnd, s.ColStart, s.ColEnd,
		)
		if err != nil {
			return fmt.Errorf("failed to insert symbol %s: %w", s.Name, err)
		}
		sID, err := sRes.LastInsertId()
		if err != nil {
			return fmt.Errorf("failed to get symbol id for %s: %w", s.Name, err)
		}
		symbolIDs[i] = sID
		nameToID[s.Name] = sID
	}

	// Insert edges
	if len(file.Edges) > 0 {
		stmtEdge, err := tx.PrepareContext(ctx, `
			INSERT INTO code_edges (source_symbol_id, target_symbol_id, target_raw_name, relation, line_number, confidence)
			VALUES (?, ?, ?, ?, ?, ?)
		`)
		if err != nil {
			return fmt.Errorf("failed to prepare edge statement: %w", err)
		}
		defer stmtEdge.Close()

		for _, e := range file.Edges {
			if e.SourceSymbolIndex < 0 || e.SourceSymbolIndex >= len(symbolIDs) {
				continue
			}
			sourceID := symbolIDs[e.SourceSymbolIndex]
			var targetID *int64
			if tID, ok := nameToID[e.TargetRawName]; ok {
				targetID = &tID
			} else {
				var existingID int64
				if err := tx.QueryRowContext(ctx, `SELECT id FROM code_symbols WHERE name = ? LIMIT 1`, e.TargetRawName).Scan(&existingID); err == nil {
					targetID = &existingID
				}
			}

			_, err := stmtEdge.ExecContext(ctx,
				sourceID, targetID, e.TargetRawName, e.Relation, e.LineNumber, e.Confidence,
			)
			if err != nil {
				return fmt.Errorf("failed to insert edge for %s: %w", e.TargetRawName, err)
			}
		}
	}
	// Backfill previously unresolved edges targeting symbols in this file
	for symName, symID := range nameToID {
		_, _ = tx.ExecContext(ctx, `UPDATE code_edges SET target_symbol_id = ? WHERE target_symbol_id IS NULL AND target_raw_name = ?`, symID, symName)
	}


	return tx.Commit()
}

// DeleteExtractedFile removes a file and its symbols/edges from the graph database.
func DeleteExtractedFile(ctx context.Context, db *sql.DB, path string) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var fileID int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM graph_files WHERE path = ?`, path).Scan(&fileID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM code_symbols WHERE file_id = ?`, fileID); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM graph_files WHERE id = ?`, fileID); err != nil {
		return err
	}

	return tx.Commit()
}

// QueryGraphStatus reads indexing statistics from the SQLite database.
func QueryGraphStatus(ctx context.Context, db *sql.DB, root, hash, dbPath string, isIndexing bool) (GraphStatus, error) {
	st := GraphStatus{
		WorkspaceRoot: root,
		WorkspaceHash: hash,
		DBPath:        dbPath,
		IsIndexing:    isIndexing,
	}

	if db == nil {
		return st, nil
	}

	var filesCount, symsCount, edgesCount int
	var maxIndexedAt sql.NullInt64

	_ = db.QueryRowContext(ctx, `SELECT count(*), max(indexed_at) FROM graph_files`).Scan(&filesCount, &maxIndexedAt)
	_ = db.QueryRowContext(ctx, `SELECT count(*) FROM code_symbols`).Scan(&symsCount)
	_ = db.QueryRowContext(ctx, `SELECT count(*) FROM code_edges`).Scan(&edgesCount)

	st.IndexedFiles = filesCount
	st.TotalSymbols = symsCount
	st.TotalEdges = edgesCount
	if maxIndexedAt.Valid {
		st.LastIndexedAt = maxIndexedAt.Int64
	}

	return st, nil
}
