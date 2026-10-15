package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func setupTestServer(t *testing.T) *Server {
	srv := NewServer()
	srv.RegisterTool(Tool{
		Name:        "codegraph_explore",
		Description: "Explore an area: relevant symbols' source + call paths in one shot",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"query": {
					Type:        "string",
					Description: "Area, symbol, or concept to explore",
				},
			},
			Required: []string{"query"},
		},
	})
	return srv
}

func TestMCPInitializeAndToolsList(t *testing.T) {
	srv := setupTestServer(t)
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
	if !ok || len(listResult.Tools) != 1 {
		t.Errorf("expected 1 registered tool, got %d", len(listResult.Tools))
	}
}

func TestRunStdio(t *testing.T) {
	srv := setupTestServer(t)

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

func TestMCPRootsList(t *testing.T) {
	srv := NewServer("/tmp/project-alpha")
	ctx := context.Background()

	// 1. Initialize declares roots capability
	initReq := &JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      1,
		Method:  "initialize",
	}
	initResp := srv.HandleRequest(ctx, initReq)
	if initResp.Error != nil {
		t.Fatalf("unexpected error on initialize: %v", initResp.Error)
	}
	initResult := initResp.Result.(InitializeResult)
	if initResult.Capabilities.Roots == nil || !initResult.Capabilities.Roots.ListChanged {
		t.Errorf("expected roots capability with listChanged: true, got %+v", initResult.Capabilities.Roots)
	}

	// 2. roots/list returns the configured workspace root
	rootsReq := &JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      2,
		Method:  "roots/list",
	}
	rootsResp := srv.HandleRequest(ctx, rootsReq)
	if rootsResp.Error != nil {
		t.Fatalf("unexpected error on roots/list: %v", rootsResp.Error)
	}
	rootsResult, ok := rootsResp.Result.(RootsListResult)
	if !ok || len(rootsResult.Roots) != 1 {
		t.Fatalf("expected 1 root, got: %+v", rootsResp.Result)
	}
	if rootsResult.Roots[0].URI != "file:///tmp/project-alpha" {
		t.Errorf("expected URI file:///tmp/project-alpha, got %s", rootsResult.Roots[0].URI)
	}
	if rootsResult.Roots[0].Name != "project-alpha" {
		t.Errorf("expected Name project-alpha, got %s", rootsResult.Roots[0].Name)
	}
}

func TestMCPNotifications(t *testing.T) {
	srv := setupTestServer(t)
	ctx := context.Background()

	// 1. notifications/initialized (notification with ID nil)
	notifReq := &JSONRPCRequest{
		JSONRPC: "2.0",
		Method:  "notifications/initialized",
	}
	resp := srv.HandleRequest(ctx, notifReq)
	if resp != nil {
		t.Errorf("expected nil response for notification, got %+v", resp)
	}

	// 2. Notification with nil ID for any other notification
	customNotif := &JSONRPCRequest{
		JSONRPC: "2.0",
		Method:  "notifications/roots/list_changed",
	}
	respCustom := srv.HandleRequest(ctx, customNotif)
	if respCustom != nil {
		t.Errorf("expected nil response for custom notification, got %+v", respCustom)
	}
}

func TestLocalRegisteredToolExecution(t *testing.T) {
	srv := NewServer()
	ctx := context.Background()

	srv.RegisterTool(Tool{
		Name:        "custom_calc",
		Description: "Simple test tool",
		InputSchema: ToolInputSchema{
			Type: "object",
			Properties: map[string]PropertyDef{
				"value": {Type: "string"},
			},
		},
	}, func(ctx context.Context, args map[string]any) (*CallToolResult, error) {
		return &CallToolResult{
			Content: []ContentItem{
				{Type: "text", Text: "calc_ok:" + args["value"].(string)},
			},
		}, nil
	})

	// Call via HandleRequest tools/call
	callReq := &JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      10,
		Method:  "tools/call",
		Params:  json.RawMessage(`{"name":"custom_calc","arguments":{"value":"42"}}`),
	}
	callResp := srv.HandleRequest(ctx, callReq)
	if callResp.Error != nil {
		t.Fatalf("unexpected error on custom_calc: %v", callResp.Error)
	}
	res, ok := callResp.Result.(*CallToolResult)
	if !ok || len(res.Content) == 0 || res.Content[0].Text != "calc_ok:42" {
		t.Fatalf("unexpected result payload: %+v", callResp.Result)
	}
}

