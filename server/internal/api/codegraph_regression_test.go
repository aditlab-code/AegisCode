package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCodeGraphAndMCPRegressionEndToEnd(t *testing.T) {
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get cwd: %v", err)
	}
	repoRoot := filepath.Clean(filepath.Join(cwd, "..", "..", ".."))
	if fi, err := os.Stat(filepath.Join(repoRoot, ".codegraph")); err != nil || !fi.IsDir() {
		t.Skip("repository root does not have .codegraph index, skipping e2e regression test")
	}

	srv, handler, _ := setupTestServer(t, repoRoot)
	defer srv.Codegraph().Close()

	// Ensure codegraph manager starts
	if err := srv.Codegraph().EnsureRunning(); err != nil {
		t.Fatalf("EnsureRunning failed: %v", err)
	}

	// 1. GET /api/codegraph/ui/stats (VantageCraft Status)
	t.Run("GET /api/codegraph/ui/stats", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/stats", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		graph, ok := payload["graph"].(map[string]any)
		if !ok || graph["nodes"] == nil {
			t.Fatalf("expected graph.nodes in stats payload, got: %+v", payload)
		}
	})

	// 2. GET /api/codegraph/ui/entrypoints (Entrypoints view)
	t.Run("GET /api/codegraph/ui/entrypoints", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/entrypoints", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if payload["routes"] == nil {
			t.Errorf("expected routes in entrypoints payload")
		}
	})

	// 3. GET /api/codegraph/ui/map (Architecture Map view)
	t.Run("GET /api/codegraph/ui/map", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/map", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		var payload map[string]any
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if payload["roots"] == nil {
			t.Errorf("expected roots in map payload")
		}
	})

	// 4. GET /api/codegraph/ui/flow (Flow Trails view)
	t.Run("GET /api/codegraph/ui/flow", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/flow?symbols=Server", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 5. GET /api/codegraph/ui/screens (Screens view)
	t.Run("GET /api/codegraph/ui/screens", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/screens", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 6. GET /api/codegraph/ui/filecode/:path (File Code Drawer)
	t.Run("GET /api/codegraph/ui/filecode", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/filecode/server/cmd/server/main.go", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		var payload struct {
			Outline struct {
				Total int `json:"total"`
				Items []any `json:"items"`
			} `json:"outline"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if payload.Outline.Total == 0 {
			t.Errorf("expected symbols in outline for server/cmd/server/main.go")
		}
	})

	// 7. GET /api/codegraph/ui/search (Symbol Search)
	t.Run("GET /api/codegraph/ui/search", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/search?q=Server", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		var payload struct {
			Results struct {
				Total int   `json:"total"`
				Items []any `json:"items"`
			} `json:"results"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if payload.Results.Total == 0 {
			t.Errorf("expected search results for query 'Server'")
		}
	})

	// 8. POST /api/codegraph/ui/sync
	t.Run("POST /api/codegraph/ui/sync", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/codegraph/ui/sync", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 9. MCP JSON-RPC Endpoints: Tools List must NOT contain legacy tools
	t.Run("POST /api/v1/mcp tools/list", func(t *testing.T) {
		body := `{"jsonrpc":"2.0","id":100,"method":"tools/list"}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/mcp", strings.NewReader(body))
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var resp struct {
			Result struct {
				Tools []struct {
					Name        string `json:"name"`
					Description string `json:"description"`
				} `json:"tools"`
			} `json:"result"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
			t.Fatalf("invalid json: %v", err)
		}

		legacyTools := map[string]bool{
			"get_file_outline":      true,
			"get_symbol_definition": true,
			"find_callers":          true,
			"find_callees":          true,
			"query_subgraph":        true,
			"read_symbol_body":      true,
			"get_diff_impact":       true,
		}

		hasExplore := false
		for _, tool := range resp.Result.Tools {
			if legacyTools[tool.Name] {
				t.Errorf("found legacy tool '%s' in MCP tools list", tool.Name)
			}
			if tool.Name == "codegraph_explore" {
				hasExplore = true
			}
		}
		if !hasExplore {
			t.Errorf("expected native 'codegraph_explore' in tools list")
		}
	})

	// 10. MCP Tool Execution: codegraph_status
	t.Run("POST /api/v1/mcp call codegraph_status", func(t *testing.T) {
		body := `{"jsonrpc":"2.0","id":101,"method":"tools/call","params":{"name":"codegraph_status","arguments":{}}}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/mcp", strings.NewReader(body))
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		if !strings.Contains(rr.Body.String(), "CodeGraph Status") {
			t.Errorf("expected 'CodeGraph Status' in output: %s", rr.Body.String())
		}
	})

	// 11. MCP Tool Execution: codegraph_explore
	t.Run("POST /api/v1/mcp call codegraph_explore", func(t *testing.T) {
		body := `{"jsonrpc":"2.0","id":102,"method":"tools/call","params":{"name":"codegraph_explore","arguments":{"query":"Server"}}}`
		req := httptest.NewRequest(http.MethodPost, "/api/v1/mcp", strings.NewReader(body))
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		if strings.Contains(rr.Body.String(), `"isError":true`) {
			t.Errorf("codegraph_explore returned error: %s", rr.Body.String())
		}
	})

	// 12. GET /api/v1/codegraph/file (Real outline extraction)
	t.Run("GET /api/v1/codegraph/file", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/codegraph/file?path=server/cmd/server/main.go", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}

		var payload struct {
			RootID string `json:"rootId"`
			Nodes  []struct {
				Name      string `json:"name"`
				Kind      string `json:"kind"`
				LineStart int    `json:"lineStart"`
			} `json:"nodes"`
			Edges []any `json:"edges"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &payload); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if len(payload.Nodes) == 0 {
			t.Errorf("expected nodes in payload for server/cmd/server/main.go")
		}
		foundMain := false
		for _, n := range payload.Nodes {
			if n.Name == "main" {
				foundMain = true
				break
			}
		}
		if !foundMain {
			t.Errorf("expected 'main' function symbol in nodes")
		}
	})

	// 13. Fail-fast on nonexistent file (NO silent fallback)
	t.Run("GET /api/v1/codegraph/file nonexistent (no silent fallback)", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/codegraph/file?path=nonexistent_file_xyz.go", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusNotFound {
			t.Fatalf("expected 404 Not Found for nonexistent file, got %d: %s", rr.Code, rr.Body.String())
		}
	})

	// 14. GET /api/v1/codegraph/symbols/search
	t.Run("GET /api/v1/codegraph/symbols/search", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/codegraph/symbols/search?q=Server&limit=10", nil)
		rr := executeRequest(handler, req)
		if rr.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rr.Code, rr.Body.String())
		}
		var nodes []struct {
			Name string `json:"name"`
		}
		if err := json.Unmarshal(rr.Body.Bytes(), &nodes); err != nil {
			t.Fatalf("invalid json: %v", err)
		}
		if len(nodes) == 0 {
			t.Errorf("expected search symbols for 'Server'")
		}
	})
}
