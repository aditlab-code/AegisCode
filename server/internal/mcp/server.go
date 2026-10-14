package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/codegraph"
)

// Server coordinates MCP protocol request handling against the CodeGraph engine.
type Server struct {
	engine *codegraph.Engine
	tools  []Tool
}

// NewServer creates a new MCP Server backed by the given CodeGraph engine.
func NewServer(engine *codegraph.Engine) *Server {
	s := &Server{
		engine: engine,
	}
	s.registerTools()
	return s
}

// registerTools defines the 7 progressive disclosure tools exposed to MCP clients.
func (s *Server) registerTools() {
	s.tools = []Tool{
		{
			Name:        "get_file_outline",
			Description: "Retrieve compact outline of all functions, classes, interfaces, and methods in a file without bodies (< 150 tokens).",
			InputSchema: ToolInputSchema{
				Type: "object",
				Properties: map[string]PropertyDef{
					"file_path": {
						Type:        "string",
						Description: "Relative workspace file path (e.g. 'server/internal/api/api.go')",
					},
				},
				Required: []string{"file_path"},
			},
		},
		{
			Name:        "get_symbol_definition",
			Description: "Retrieve symbol signature, line range, and docstrings (< 80 tokens).",
			InputSchema: ToolInputSchema{
				Type: "object",
				Properties: map[string]PropertyDef{
					"name": {
						Type:        "string",
						Description: "Symbol name to look up",
					},
					"file_hint": {
						Type:        "string",
						Description: "Optional file path substring to disambiguate identical symbol names",
					},
				},
				Required: []string{"name"},
			},
		},
		{
			Name:        "find_callers",
			Description: "Find all inbound callers of a function or method across the workspace (default limit 15, guardrailed against high-fanout bloat).",
			InputSchema: ToolInputSchema{
				Type: "object",
				Properties: map[string]PropertyDef{
					"function_name": {
						Type:        "string",
						Description: "Target function or method name",
					},
					"limit": {
						Type:        "integer",
						Description: "Maximum callers to return (default 15, max 100)",
					},
				},
				Required: []string{"function_name"},
			},
		},
		{
			Name:        "find_callees",
			Description: "Find all outbound functions called by a function or method.",
			InputSchema: ToolInputSchema{
				Type: "object",
				Properties: map[string]PropertyDef{
					"function_name": {
						Type:        "string",
						Description: "Source function name",
					},
					"file_hint": {
						Type:        "string",
						Description: "Optional file path substring",
					},
					"limit": {
						Type:        "integer",
						Description: "Maximum callees to return (default 15)",
					},
				},
				Required: []string{"function_name"},
			},
		},
		{
			Name:        "query_subgraph",
			Description: "Execute a surgical 2-hop BFS dependency subgraph exploration around a symbol (< 400 tokens).",
			InputSchema: ToolInputSchema{
				Type: "object",
				Properties: map[string]PropertyDef{
					"root_symbol": {
						Type:        "string",
						Description: "Root symbol name",
					},
					"depth": {
						Type:        "integer",
						Description: "Traversal depth (clamped to max 2 hops)",
					},
				},
				Required: []string{"root_symbol"},
			},
		},
		{
			Name:        "read_symbol_body",
			Description: "Read the exact source implementation body lines of a symbol from disk.",
			InputSchema: ToolInputSchema{
				Type: "object",
				Properties: map[string]PropertyDef{
					"name": {
						Type:        "string",
						Description: "Symbol name",
					},
					"file_path": {
						Type:        "string",
						Description: "Relative file path containing the symbol",
					},
				},
				Required: []string{"name", "file_path"},
			},
		},
		{
			Name:        "get_diff_impact",
			Description: "Graph-augmented Git diff impact analysis: maps modified line hunks to changed symbols and all directly affected caller functions.",
			InputSchema: ToolInputSchema{
				Type: "object",
				Properties: map[string]PropertyDef{
					"staged": {
						Type:        "boolean",
						Description: "Analyze staged changes if true, unstaged if false",
					},
				},
			},
		},
	}
}

// HandleRequest processes a JSON-RPC request and returns the corresponding response.
func (s *Server) HandleRequest(ctx context.Context, req *JSONRPCRequest) *JSONRPCResponse {
	if req.JSONRPC != "2.0" && req.JSONRPC != "" {
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: &JSONRPCError{
				Code:    CodeInvalidRequest,
				Message: "jsonrpc version must be 2.0",
			},
		}
	}

	switch req.Method {
	case "initialize":
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: InitializeResult{
				ProtocolVersion: "2024-11-05",
				Capabilities: ServerCapabilities{
					Tools: &ToolsCapability{ListChanged: false},
				},
				ServerInfo: ServerInfo{
					Name:    "aegiscode-codegraph",
					Version: "1.0.0",
				},
			},
		}

	case "ping":
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  map[string]any{},
		}

	case "tools/list":
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: ListToolsResult{
				Tools: s.tools,
			},
		}

	case "tools/call":
		var params CallToolParams
		if len(req.Params) > 0 {
			if err := json.Unmarshal(req.Params, &params); err != nil {
				return &JSONRPCResponse{
					JSONRPC: "2.0",
					ID:      req.ID,
					Error: &JSONRPCError{
						Code:    CodeInvalidParams,
						Message: fmt.Sprintf("failed to parse call params: %v", err),
					},
				}
			}
		}

		res, err := s.callTool(ctx, params.Name, params.Arguments)
		if err != nil {
			return &JSONRPCResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result: CallToolResult{
					Content: []ContentItem{
						{Type: "text", Text: err.Error()},
					},
					IsError: true,
				},
			}
		}

		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  res,
		}

	default:
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error: &JSONRPCError{
				Code:    CodeMethodNotFound,
				Message: fmt.Sprintf("method not found: %s", req.Method),
			},
		}
	}
}

// CallTool runs the given tool and returns the CallToolResult.
func (s *Server) CallTool(ctx context.Context, name string, args map[string]any) (*CallToolResult, error) {
	return s.callTool(ctx, name, args)
}

// ExecuteTool executes a named tool and returns the textual representation of the output.
func (s *Server) ExecuteTool(ctx context.Context, name string, args map[string]any) (string, error) {
	res, err := s.callTool(ctx, name, args)
	if err != nil {
		return "", err
	}
	if res == nil || len(res.Content) == 0 {
		return "{}", nil
	}
	var sb strings.Builder
	for i, c := range res.Content {
		if i > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString(c.Text)
	}
	return sb.String(), nil
}

// callTool executes the specified tool against the CodeGraph engine.
func (s *Server) callTool(ctx context.Context, name string, args map[string]any) (*CallToolResult, error) {
	if s.engine == nil {
		return nil, fmt.Errorf("codegraph engine is dormant (no active workspace)")
	}

	if args == nil {
		args = make(map[string]any)
	}

	cleanName := strings.TrimPrefix(name, "mcp__codegraph__")
	cleanName = strings.TrimPrefix(cleanName, "codegraph:")
	cleanName = strings.TrimPrefix(cleanName, "codegraph_")

	var resultData any
	var err error

	switch cleanName {
	case "get_file_outline":
		filePath, _ := args["file_path"].(string)
		if filePath == "" {
			filePath, _ = args["rel_path"].(string)
		}
		if filePath == "" {
			filePath, _ = args["path"].(string)
		}
		if strings.TrimSpace(filePath) == "" {
			return nil, fmt.Errorf("argument 'file_path' is required")
		}
		resultData, err = s.engine.GetFileOutline(ctx, filePath)

	case "get_symbol_definition":
		symName, _ := args["name"].(string)
		if symName == "" {
			symName, _ = args["symbol_name"].(string)
		}
		fileHint, _ := args["file_hint"].(string)
		if strings.TrimSpace(symName) == "" {
			return nil, fmt.Errorf("argument 'name' is required")
		}
		resultData, err = s.engine.GetSymbolDefinition(ctx, symName, fileHint)

	case "find_callers":
		fnName, _ := args["function_name"].(string)
		limit := 15
		if lVal, ok := args["limit"].(float64); ok {
			limit = int(lVal)
		} else if lVal, ok := args["limit"].(int); ok {
			limit = lVal
		}
		if strings.TrimSpace(fnName) == "" {
			return nil, fmt.Errorf("argument 'function_name' is required")
		}
		resultData, err = s.engine.FindCallers(ctx, fnName, limit)

	case "find_callees", "get_dependencies":
		fnName, _ := args["function_name"].(string)
		fileHint, _ := args["file_hint"].(string)
		limit := 15
		if lVal, ok := args["limit"].(float64); ok {
			limit = int(lVal)
		} else if lVal, ok := args["limit"].(int); ok {
			limit = lVal
		}
		if strings.TrimSpace(fnName) == "" {
			return nil, fmt.Errorf("argument 'function_name' is required")
		}
		resultData, err = s.engine.FindCallees(ctx, fnName, fileHint, limit)

	case "query_subgraph":
		rootSym, _ := args["root_symbol"].(string)
		depth := 2
		if dVal, ok := args["depth"].(float64); ok {
			depth = int(dVal)
		} else if dVal, ok := args["depth"].(int); ok {
			depth = dVal
		}
		if strings.TrimSpace(rootSym) == "" {
			return nil, fmt.Errorf("argument 'root_symbol' is required")
		}
		resultData, err = s.engine.QuerySubgraph(ctx, rootSym, depth)

	case "read_symbol_body":
		symName, _ := args["name"].(string)
		if symName == "" {
			symName, _ = args["symbol_name"].(string)
		}
		filePath, _ := args["file_path"].(string)
		if filePath == "" {
			filePath, _ = args["rel_path"].(string)
		}
		if strings.TrimSpace(symName) == "" || strings.TrimSpace(filePath) == "" {
			return nil, fmt.Errorf("arguments 'name' and 'file_path' are required")
		}
		var body string
		body, err = s.engine.ReadSymbolBody(ctx, symName, filePath)
		if err == nil {
			return &CallToolResult{
				Content: []ContentItem{
					{Type: "text", Text: body},
				},
			}, nil
		}

	case "get_diff_impact":
		staged := false
		if sVal, ok := args["staged"].(bool); ok {
			staged = sVal
		}
		resultData, err = s.engine.GetDiffImpact(ctx, staged)

	default:
		return nil, fmt.Errorf("unknown tool: %s", name)
	}

	if err != nil {
		return nil, err
	}

	jsonBytes, mErr := json.Marshal(resultData)
	if mErr != nil {
		return nil, fmt.Errorf("failed to format result: %w", mErr)
	}

	return &CallToolResult{
		Content: []ContentItem{
			{Type: "text", Text: string(jsonBytes)},
		},
	}, nil
}
