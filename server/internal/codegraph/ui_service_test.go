package codegraph

import (
	"context"
	"path/filepath"
	"testing"
)

func setupTestGraph(t *testing.T) (*UIService, func()) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test_ui.db")

	db, err := OpenGraphDB(dbPath)
	if err != nil {
		t.Fatalf("OpenGraphDB failed: %v", err)
	}

	ctx := context.Background()

	// File 1: auth/session.go with ValidateSession and HandleLogin
	f1 := &ExtractedFile{
		Path:     "auth/session.go",
		Language: "go",
		Symbols: []ExtractedSymbol{
			{
				Name:       "ValidateSession",
				Kind:       KindFunction,
				Signature:  "func ValidateSession(token string) bool",
				LineStart:  10,
				LineEnd:    25,
				DocComment: "ValidateSession validates user auth token.",
			},
			{
				Name:       "HandleLogin",
				Kind:       KindFunction,
				Signature:  "func HandleLogin()",
				LineStart:  30,
				LineEnd:    45,
				DocComment: "HandleLogin processes login requests.",
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
	if err := IngestExtractedFile(ctx, db, f1, "hash1", 1000, 500); err != nil {
		t.Fatalf("IngestExtractedFile f1 failed: %v", err)
	}

	// File 2: api/routes.go with SetupRoutes calling HandleLogin
	f2 := &ExtractedFile{
		Path:     "api/routes.go",
		Language: "go",
		Symbols: []ExtractedSymbol{
			{
				Name:       "SetupRoutes",
				Kind:       KindFunction,
				Signature:  "func SetupRoutes()",
				LineStart:  5,
				LineEnd:    20,
				DocComment: "SetupRoutes registers all API routes.",
			},
		},
		Edges: []ExtractedEdge{
			{
				SourceSymbolIndex: 0, // SetupRoutes
				TargetRawName:     "HandleLogin",
				Relation:          RelCalls,
				LineNumber:        12,
				Confidence:        1.0,
			},
		},
	}
	if err := IngestExtractedFile(ctx, db, f2, "hash2", 1000, 400); err != nil {
		t.Fatalf("IngestExtractedFile f2 failed: %v", err)
	}

	svc := NewUIService(db, tmpDir)
	cleanup := func() {
		_ = db.Close()
	}
	return svc, cleanup
}

func TestUIServiceNeighborhood(t *testing.T) {
	svc, cleanup := setupTestGraph(t)
	defer cleanup()

	ctx := context.Background()

	// Find ID of HandleLogin
	var handleLoginID int64
	err := svc.db.QueryRowContext(ctx, `SELECT id FROM code_symbols WHERE name = 'HandleLogin'`).Scan(&handleLoginID)
	if err != nil {
		t.Fatalf("failed to query HandleLogin id: %v", err)
	}

	// 1-hop neighborhood from HandleLogin: should include HandleLogin, ValidateSession, SetupRoutes
	res1, err := svc.GetSymbolNeighborhood(ctx, handleLoginID, 1, 50)
	if err != nil {
		t.Fatalf("GetSymbolNeighborhood (1-hop) failed: %v", err)
	}
	if res1.RootID != handleLoginID {
		t.Errorf("expected rootID %d, got %d", handleLoginID, res1.RootID)
	}
	if len(res1.Nodes) < 2 {
		t.Errorf("expected at least 2 nodes in 1-hop, got %d", len(res1.Nodes))
	}
	if len(res1.Edges) == 0 {
		t.Errorf("expected at least 1 edge in 1-hop, got 0")
	}

	// Check IsActive flag on root node
	foundActive := false
	for _, n := range res1.Nodes {
		if n.ID == handleLoginID && n.IsActive {
			foundActive = true
		}
	}
	if !foundActive {
		t.Errorf("expected root node to have IsActive = true")
	}

	// 2-hop neighborhood from SetupRoutes (SetupRoutes -> HandleLogin -> ValidateSession)
	var setupRoutesID int64
	_ = svc.db.QueryRowContext(ctx, `SELECT id FROM code_symbols WHERE name = 'SetupRoutes'`).Scan(&setupRoutesID)
	res2, err := svc.GetSymbolNeighborhood(ctx, setupRoutesID, 2, 50)
	if err != nil {
		t.Fatalf("GetSymbolNeighborhood (2-hop) failed: %v", err)
	}
	if len(res2.Nodes) != 3 {
		t.Errorf("expected 3 nodes in 2-hop, got %d", len(res2.Nodes))
	}

	// Test depth clamping (depth 0 defaults to 1, depth 99 clamps to 2)
	resClamp, err := svc.GetSymbolNeighborhood(ctx, setupRoutesID, 99, 1)
	if err != nil {
		t.Fatalf("clamped query failed: %v", err)
	}
	if !resClamp.Truncated {
		t.Errorf("expected truncated to be true with limit 1")
	}
	if len(resClamp.Nodes) != 1 {
		t.Errorf("expected exactly 1 node with limit 1, got %d", len(resClamp.Nodes))
	}
}

func TestUIServiceActiveFileGraph(t *testing.T) {
	svc, cleanup := setupTestGraph(t)
	defer cleanup()

	ctx := context.Background()

	// File graph for auth/session.go
	res, err := svc.GetActiveFileGraph(ctx, "auth/session.go")
	if err != nil {
		t.Fatalf("GetActiveFileGraph failed: %v", err)
	}

	if len(res.Nodes) == 0 {
		t.Fatalf("expected nodes in auth/session.go, got 0")
	}

	// Verify symbol names present
	nodeNames := make(map[string]bool)
	for _, n := range res.Nodes {
		nodeNames[n.Name] = true
	}
	if !nodeNames["ValidateSession"] || !nodeNames["HandleLogin"] {
		t.Errorf("missing expected symbols in file graph: %v", nodeNames)
	}

	// Should contain the call edge
	if len(res.Edges) == 0 {
		t.Errorf("expected edges in file graph, got 0")
	}

	// Test non-existent file
	resEmpty, err := svc.GetActiveFileGraph(ctx, "nonexistent.go")
	if err != nil {
		t.Fatalf("nonexistent file failed: %v", err)
	}
	if len(resEmpty.Nodes) != 0 || len(resEmpty.Edges) != 0 {
		t.Errorf("expected empty payload for nonexistent file")
	}
}

func TestUIServiceWorkspaceGraph(t *testing.T) {
	svc, cleanup := setupTestGraph(t)
	defer cleanup()

	ctx := context.Background()

	res, err := svc.GetWorkspaceGraph(ctx, 50)
	if err != nil {
		t.Fatalf("GetWorkspaceGraph failed: %v", err)
	}

	if len(res.Nodes) != 3 {
		t.Errorf("expected 3 nodes in workspace, got %d", len(res.Nodes))
	}
	if len(res.Edges) != 2 {
		t.Errorf("expected 2 edges in workspace, got %d", len(res.Edges))
	}
	if res.Total != 3 {
		t.Errorf("expected total 3, got %d", res.Total)
	}
}

func TestUIServiceSearchSymbols(t *testing.T) {
	svc, cleanup := setupTestGraph(t)
	defer cleanup()

	ctx := context.Background()

	// Search matching 'Validate'
	matches, err := svc.SearchSymbols(ctx, "Validate", 10)
	if err != nil {
		t.Fatalf("SearchSymbols failed: %v", err)
	}
	if len(matches) == 0 {
		t.Fatalf("expected at least 1 match for 'Validate', got 0")
	}
	if matches[0].Name != "ValidateSession" {
		t.Errorf("expected match 'ValidateSession', got %s", matches[0].Name)
	}

	// Search empty string
	emptyMatches, err := svc.SearchSymbols(ctx, "", 10)
	if err != nil {
		t.Fatalf("SearchSymbols empty query failed: %v", err)
	}
	if len(emptyMatches) != 0 {
		t.Errorf("expected 0 matches for empty query, got %d", len(emptyMatches))
	}
}

func TestUIServiceNilDB(t *testing.T) {
	svc := NewUIService(nil, "")
	ctx := context.Background()

	resN, err := svc.GetSymbolNeighborhood(ctx, 1, 1, 50)
	if err != nil || len(resN.Nodes) != 0 {
		t.Errorf("nil db neighborhood should return empty, err=%v", err)
	}

	resF, err := svc.GetActiveFileGraph(ctx, "test.go")
	if err != nil || len(resF.Nodes) != 0 {
		t.Errorf("nil db file graph should return empty, err=%v", err)
	}

	resW, err := svc.GetWorkspaceGraph(ctx, 50)
	if err != nil || len(resW.Nodes) != 0 {
		t.Errorf("nil db workspace graph should return empty, err=%v", err)
	}

	resS, err := svc.SearchSymbols(ctx, "test", 10)
	if err != nil || len(resS) != 0 {
		t.Errorf("nil db search should return empty, err=%v", err)
	}
}

func TestUIServiceResolveSymbolIDAndSanitizedFTS(t *testing.T) {
	svc, cleanup := setupTestGraph(t)
	defer cleanup()

	ctx := context.Background()

	// 1. Resolve by symbol name
	id, err := svc.ResolveSymbolID(ctx, "ValidateSession")
	if err != nil {
		t.Fatalf("ResolveSymbolID failed for ValidateSession: %v", err)
	}
	if id <= 0 {
		t.Errorf("expected positive ID, got %d", id)
	}

	// 2. Resolve by file path
	idFile, err := svc.ResolveSymbolID(ctx, "auth/session.go")
	if err != nil {
		t.Fatalf("ResolveSymbolID failed for auth/session.go: %v", err)
	}
	if idFile <= 0 {
		t.Errorf("expected positive ID for file path, got %d", idFile)
	}

	// 3. Resolve non-existent symbol
	_, err = svc.ResolveSymbolID(ctx, "NonExistentSymbol123")
	if err == nil {
		t.Errorf("expected error resolving non-existent symbol")
	}

	// 4. Test FTS sanitization with punctuation and operator characters (SQL-06)
	matches, err := svc.SearchSymbols(ctx, "ValidateSession()", 10)
	if err != nil {
		t.Fatalf("SearchSymbols with parens failed: %v", err)
	}
	if len(matches) == 0 || matches[0].Name != "ValidateSession" {
		t.Errorf("expected to find ValidateSession despite parens, got %v", matches)
	}
}

func TestUIServiceColbyNativeSchema(t *testing.T) {
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "colby_test.db")

	db, err := OpenGraphDB(dbPath)
	if err != nil {
		t.Fatalf("OpenGraphDB failed: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// Seed native Colby nodes and edges
	_, err = db.ExecContext(ctx, `
		INSERT INTO nodes (id, kind, name, qualified_name, file_path, start_line, end_line, signature, docstring, is_exported)
		VALUES
			('node:server:main', 'function', 'main', 'main.main', 'server/main.go', 10, 30, 'func main()', 'entrypoint', 1),
			('node:server:NewServer', 'function', 'NewServer', 'server.NewServer', 'server/server.go', 15, 45, 'func NewServer() *Server', 'creates server', 1),
			('node:server:Server', 'struct', 'Server', 'server.Server', 'server/server.go', 5, 12, 'type Server struct', 'server struct', 1);

		INSERT INTO edges (source, target, kind, line)
		VALUES
			('node:server:main', 'node:server:NewServer', 'calls', 22),
			('node:server:NewServer', 'node:server:Server', 'instantiates', 35);
	`)
	if err != nil {
		t.Fatalf("failed to insert colby test data: %v", err)
	}

	svc := NewUIService(db, tmpDir)

	if !svc.hasColbyNodes(ctx) {
		t.Fatalf("expected hasColbyNodes to be true")
	}

	// 1. Workspace graph
	ws, err := svc.GetWorkspaceGraph(ctx, 10)
	if err != nil {
		t.Fatalf("GetWorkspaceGraph failed: %v", err)
	}
	if len(ws.Nodes) != 3 {
		t.Errorf("expected 3 nodes in workspace, got %d", len(ws.Nodes))
	}
	if len(ws.Edges) != 2 {
		t.Errorf("expected 2 edges in workspace, got %d", len(ws.Edges))
	}

	// 2. Active file graph
	fileRes, err := svc.GetActiveFileGraph(ctx, "server/server.go")
	if err != nil {
		t.Fatalf("GetActiveFileGraph failed: %v", err)
	}
	if len(fileRes.Nodes) != 2 {
		t.Errorf("expected 2 nodes for server/server.go, got %d", len(fileRes.Nodes))
	}

	// 3. Multi-token neighborhood query
	targetRes, err := svc.GetSymbolNeighborhoodByTarget(ctx, "NewServer Server", 2, 50)
	if err != nil {
		t.Fatalf("GetSymbolNeighborhoodByTarget failed: %v", err)
	}
	if len(targetRes.Nodes) < 2 {
		t.Errorf("expected at least 2 nodes connected to NewServer, got %d", len(targetRes.Nodes))
	}

	// 4. Search symbols
	searchRes, err := svc.SearchSymbols(ctx, "Server", 5)
	if err != nil {
		t.Fatalf("SearchSymbols failed: %v", err)
	}
	if len(searchRes) < 2 {
		t.Errorf("expected at least 2 symbols matching Server, got %d", len(searchRes))
	}
}

