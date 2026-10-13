package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aditwicaksono/aegiscode/server/internal/codegraph"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

func setupTestServer(t *testing.T) (*Server, *codegraph.Engine) {
	tmpDir := t.TempDir()
	ws, err := workspace.NewManager(tmpDir)
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	src := []byte(`package math

// Multiply returns product.
func Multiply(a, b int) int {
	return a * b
}

func Square(x int) int {
	return Multiply(x, x)
}
`)
	_ = os.WriteFile(filepath.Join(tmpDir, "math.go"), src, 0644)

	eng, err := codegraph.NewEngine(ws, nil)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	_ = eng.IndexFile(context.Background(), "math.go")

	srv := NewServer(eng)
	return srv, eng
}

func TestMCPInitializeAndToolsList(t *testing.T) {
	srv, eng := setupTestServer(t)
	defer eng.Close()

	ctx := context.Background()

	// 1. Initialize
	initReq := &JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "initialize",
	}
	initResp := srv.HandleRequest(ctx, initReq)
	if initResp.Error != nil {
		t.Fatalf("unexpected error on initialize: %v", initResp.Error)
	}
	initResult, ok := initResp.Result.(InitializeResult)
	if !ok || initResult.ProtocolVersion != "2024-11-05" {
		t.Errorf("unexpected initialize result: %+v", initResp.Result)
	}

	// 2. Tools List
	listReq := &JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      2,
		Method:  "tools/list",
	}
	listResp := srv.HandleRequest(ctx, listReq)
	if listResp.Error != nil {
		t.Fatalf("unexpected error on tools/list: %v", listResp.Error)
	}
	listResult, ok := listResp.Result.(ListToolsResult)
	if !ok || len(listResult.Tools) != 7 {
		t.Errorf("expected 7 registered tools, got %d", len(listResult.Tools))
	}
}

func TestMCPToolCalls(t *testing.T) {
	srv, eng := setupTestServer(t)
	defer eng.Close()

	ctx := context.Background()

	// 1. get_file_outline
	callOutline := &JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      10,
		Method:  "tools/call",
		Params:  json.RawMessage(`{"name": "get_file_outline", "arguments": {"file_path": "math.go"}}`),
	}
	resp := srv.HandleRequest(ctx, callOutline)
	if resp.Error != nil {
		t.Fatalf("tool call error: %v", resp.Error)
	}
	callResult := resp.Result.(*CallToolResult)
	if len(callResult.Content) == 0 || !strings.Contains(callResult.Content[0].Text, "Multiply") {
		t.Errorf("expected Multiply in outline output: %+v", callResult)
	}

	// 2. find_callers
	callCallers := &JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      11,
		Method:  "tools/call",
		Params:  json.RawMessage(`{"name": "find_callers", "arguments": {"function_name": "Multiply", "limit": 10}}`),
	}
	resp = srv.HandleRequest(ctx, callCallers)
	if resp.Error != nil {
		t.Fatalf("tool call error: %v", resp.Error)
	}
	callResult = resp.Result.(*CallToolResult)
	if len(callResult.Content) == 0 || !strings.Contains(callResult.Content[0].Text, "Square") {
		t.Errorf("expected Square in callers output: %+v", callResult)
	}
}

func TestRunStdio(t *testing.T) {
	srv, eng := setupTestServer(t)
	defer eng.Close()

	input := `{"jsonrpc": "2.0", "id": 1, "method": "initialize"}
{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
`
	inBuf := bytes.NewBufferString(input)
	var outBuf bytes.Buffer

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	err := RunStdio(ctx, srv, inBuf, &outBuf)
	if err != nil {
		t.Fatalf("RunStdio failed: %v", err)
	}

	output := outBuf.String()
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if len(lines) != 2 {
		t.Fatalf("expected 2 output lines from stdio, got %d: %s", len(lines), output)
	}

	var resp1 JSONRPCResponse
	if err := json.Unmarshal([]byte(lines[0]), &resp1); err != nil {
		t.Fatalf("failed to parse line 1: %v", err)
	}
	if resp1.Error != nil {
		t.Errorf("line 1 returned error: %v", resp1.Error)
	}
}
