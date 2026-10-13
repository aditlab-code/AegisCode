package codegraph

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestQueryEngine(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_query.db")

	db, err := OpenGraphDB(dbPath)
	if err != nil {
		t.Fatalf("OpenGraphDB failed: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// Ingest sample files
	fileA := &ExtractedFile{
		Path:     "auth/session.go",
		Language: "go",
		Symbols: []ExtractedSymbol{
			{
				Name:       "ValidateSession",
				Kind:       KindFunction,
				Signature:  "func ValidateSession(token string) bool",
				DocComment: "ValidateSession verifies auth tokens.",
				LineStart:  10,
				LineEnd:    20,
			},
		},
	}
	_ = IngestExtractedFile(ctx, db, fileA, "hashA", 100, 100)

	fileB := &ExtractedFile{
		Path:     "routes/login.go",
		Language: "go",
		Symbols: []ExtractedSymbol{
			{
				Name:       "HandleLogin",
				Kind:       KindFunction,
				Signature:  "func HandleLogin()",
				DocComment: "HandleLogin processes login requests.",
				LineStart:  15,
				LineEnd:    30,
			},
		},
		Edges: []ExtractedEdge{
			{
				SourceSymbolIndex: 0,
				TargetRawName:     "ValidateSession",
				Relation:          RelCalls,
				LineNumber:        22,
				Confidence:        1.0,
			},
		},
	}
	_ = IngestExtractedFile(ctx, db, fileB, "hashB", 100, 100)

	fileC := &ExtractedFile{
		Path:     "middleware/auth.go",
		Language: "go",
		Symbols: []ExtractedSymbol{
			{
				Name:       "AuthMiddleware",
				Kind:       KindFunction,
				Signature:  "func AuthMiddleware()",
				LineStart:  5,
				LineEnd:    18,
			},
		},
		Edges: []ExtractedEdge{
			{
				SourceSymbolIndex: 0,
				TargetRawName:     "ValidateSession",
				Relation:          RelCalls,
				LineNumber:        12,
				Confidence:        1.0,
			},
		},
	}
	_ = IngestExtractedFile(ctx, db, fileC, "hashC", 100, 100)

	qe := NewQueryEngine(db, tmpDir)

	// L0: GetFileOutline
	outline, err := qe.GetFileOutline(ctx, "auth/session.go")
	if err != nil {
		t.Fatalf("GetFileOutline failed: %v", err)
	}
	if len(outline.Symbols) != 1 || outline.Symbols[0].Name != "ValidateSession" {
		t.Errorf("unexpected outline: %+v", outline)
	}

	// L1: GetSymbolDefinition
	def, err := qe.GetSymbolDefinition(ctx, "ValidateSession", "auth")
	if err != nil {
		t.Fatalf("GetSymbolDefinition failed: %v", err)
	}
	if def.Name != "ValidateSession" || def.LineStart != 10 || def.DocComment != "ValidateSession verifies auth tokens." {
		t.Errorf("unexpected definition: %+v", def)
	}

	// L2: FindCallers
	callersRes, err := qe.FindCallers(ctx, "ValidateSession", 1)
	if err != nil {
		t.Fatalf("FindCallers failed: %v", err)
	}
	if len(callersRes.Callers) != 1 {
		t.Errorf("expected 1 caller due to limit, got %d", len(callersRes.Callers))
	}
	if !callersRes.Truncated {
		t.Errorf("expected Truncated=true when total callers (2) > limit (1)")
	}

	// L2: FindCallees
	calleesRes, err := qe.FindCallees(ctx, "HandleLogin", "", 10)
	if err != nil {
		t.Fatalf("FindCallees failed: %v", err)
	}
	if len(calleesRes.Callees) != 1 || calleesRes.Callees[0].CalleeName != "ValidateSession" {
		t.Errorf("unexpected callees: %+v", calleesRes)
	}

	// L3: QuerySubgraph (depth clamped to 2)
	subgraph, err := qe.QuerySubgraph(ctx, "ValidateSession", 5)
	if err != nil {
		t.Fatalf("QuerySubgraph failed: %v", err)
	}
	if subgraph.Depth != 2 {
		t.Errorf("expected clamped depth 2, got %d", subgraph.Depth)
	}
	if len(subgraph.Edges) < 2 {
		t.Errorf("expected at least 2 edges in subgraph, got %d: %+v", len(subgraph.Edges), subgraph.Edges)
	}

	// L4: ReadSymbolBody
	testSrc := "line 1\nline 2\nfunc ValidateSession() {\n\treturn true\n}\nline 6\n"
	authDir := filepath.Join(tmpDir, "auth")
	_ = os.MkdirAll(authDir, 0755)
	_ = os.WriteFile(filepath.Join(authDir, "session.go"), []byte(testSrc), 0644)

	// Update symbol to match lines in testSrc
	_, _ = db.Exec(`UPDATE code_symbols SET line_start = 3, line_end = 5 WHERE name = 'ValidateSession'`)
	body, err := qe.ReadSymbolBody(ctx, "ValidateSession", "auth/session.go")
	if err != nil {
		t.Fatalf("ReadSymbolBody failed: %v", err)
	}
	expectedBody := "func ValidateSession() {\n\treturn true\n}"
	if body != expectedBody {
		t.Errorf("expected body %q, got %q", expectedBody, body)
	}

	// Test ignore paths
	if !isIgnoredDiffPath("vendor/pkg/foo.go") {
		t.Errorf("vendor should be ignored")
	}
	if !isIgnoredDiffPath("package-lock.json") {
		t.Errorf("package-lock.json should be ignored")
	}
	if isIgnoredDiffPath("src/components/App.tsx") {
		t.Errorf("App.tsx should not be ignored")
	}
}
