package codegraph

import (
	"context"
	"path/filepath"
	"testing"
)

func TestDBInitializationAndTriggers(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_graph.db")

	db, err := OpenGraphDB(dbPath)
	if err != nil {
		t.Fatalf("OpenGraphDB failed: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// Ingest sample file
	file := &ExtractedFile{
		Path:     "auth/session.go",
		Language: "go",
		Symbols: []ExtractedSymbol{
			{
				Name:       "ValidateSession",
				Kind:       KindFunction,
				Signature:  "func ValidateSession(token string) bool",
				LineStart:  10,
				LineEnd:    25,
				ColStart:   1,
				ColEnd:     2,
				DocComment: "ValidateSession validates user auth token.",
			},
			{
				Name:      "HandleLogin",
				Kind:      KindFunction,
				Signature: "func HandleLogin()",
				LineStart: 30,
				LineEnd:   45,
				ColStart:  1,
				ColEnd:    2,
			},
		},
		Edges: []ExtractedEdge{
			{
				SourceSymbolIndex: 1, // HandleLogin
				TargetRawName:     "ValidateSession",
				Relation:          RelCalls,
				LineNumber:        35,
				Confidence:        1.0,
			},
		},
	}

	err = IngestExtractedFile(ctx, db, file, "dummyhash1", 1000, 500)
	if err != nil {
		t.Fatalf("IngestExtractedFile failed: %v", err)
	}

	// Verify FTS query
	var matchName string
	err = db.QueryRowContext(ctx, `SELECT name FROM symbol_fts WHERE symbol_fts MATCH 'ValidateSession'`).Scan(&matchName)
	if err != nil {
		t.Fatalf("FTS match query failed: %v", err)
	}
	if matchName != "ValidateSession" {
		t.Errorf("expected match ValidateSession, got %s", matchName)
	}

	// Verify status
	status, err := QueryGraphStatus(ctx, db, "/workspace", "wshash", dbPath, false)
	if err != nil {
		t.Fatalf("QueryGraphStatus failed: %v", err)
	}
	if status.IndexedFiles != 1 || status.TotalSymbols != 2 || status.TotalEdges != 1 {
		t.Errorf("unexpected status: %+v", status)
	}

	// Verify deletion and cascade
	err = DeleteExtractedFile(ctx, db, "auth/session.go")
	if err != nil {
		t.Fatalf("DeleteExtractedFile failed: %v", err)
	}

	var ftsCount int
	_ = db.QueryRowContext(ctx, `SELECT count(*) FROM symbol_fts`).Scan(&ftsCount)
	if ftsCount != 0 {
		t.Errorf("expected 0 FTS entries after delete, got %d", ftsCount)
	}
}
