package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
)

// Server coordinates MCP protocol request handling.
type Server struct {
	mu            sync.RWMutex
	workspaceRoot string
	tools         []Tool
	bridge        *Bridge
}

// NewServer creates a new MCP Server for the given workspace root.
func NewServer(workspaceRoot ...string) *Server {
	ws := ""
	if len(workspaceRoot) > 0 {
		ws = workspaceRoot[0]
	}
	s := &Server{
		workspaceRoot: ws,
		tools:         make([]Tool, 0),
	}
	if ws != "" {
		s.bridge = NewBridge(ws)
	}
	return s
}

// SetWorkspace updates the active workspace root and informs the underlying bridge.
func (s *Server) SetWorkspace(ws string) {
	s.mu.Lock()
	s.workspaceRoot = ws
	if s.bridge == nil && ws != "" {
		s.bridge = NewBridge(ws)
	}
	b := s.bridge
	s.mu.Unlock()

	if b != nil {
		b.SetWorkspace(ws)
	}
}

// Workspace returns the active workspace root.
func (s *Server) Workspace() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.workspaceRoot
}

// RegisterTool adds a tool to the server's local tool registry.
func (s *Server) RegisterTool(tool Tool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tools = append(s.tools, tool)
}

// Tools returns native bridge tools when available, falling back to local registry.
func (s *Server) Tools() []Tool {
	s.mu.RLock()
	b := s.bridge
	s.mu.RUnlock()

	if b != nil {
		bridgeTools := b.Tools()
		if len(bridgeTools) > 0 {
			return bridgeTools
		}
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	local := make([]Tool, len(s.tools))
	copy(local, s.tools)
	return local
}

// Close terminates the client bridge process if running.
func (s *Server) Close() error {
	s.mu.Lock()
	b := s.bridge
	s.bridge = nil
	s.mu.Unlock()

	if b != nil {
		return b.Close()
	}
	return nil
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
					Roots: &RootsCapability{ListChanged: true},
				},
				ServerInfo: ServerInfo{
					Name:    "aegiscode-mcp",
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

	case "roots/list":
		ws := s.Workspace()
		roots := make([]WorkspaceRoot, 0)
		if ws != "" {
			name := filepath.Base(ws)
			roots = append(roots, WorkspaceRoot{
				URI:  "file://" + ws,
				Name: name,
			})
		}
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: RootsListResult{
				Roots: roots,
			},
		}

	case "tools/list":
		return &JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: ListToolsResult{
				Tools: s.Tools(),
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

// callTool executes the specified tool against registered tool handlers or delegates to the bridge.
func (s *Server) callTool(ctx context.Context, name string, args map[string]any) (*CallToolResult, error) {
	if args == nil {
		args = make(map[string]any)
	}

	cleanName := strings.TrimPrefix(name, "mcp__codegraph__")
	cleanName = strings.TrimPrefix(cleanName, "codegraph:")

	// Auto-inject projectPath and path if omitted
	if ws := s.Workspace(); ws != "" {
		if _, ok := args["projectPath"]; !ok || args["projectPath"] == "" {
			args["projectPath"] = ws
		}
		if _, ok := args["path"]; !ok || args["path"] == "" {
			args["path"] = ws
		}
	}

	s.mu.RLock()
	b := s.bridge
	s.mu.RUnlock()

	if b != nil {
		return b.CallTool(ctx, cleanName, args)
	}

	return nil, fmt.Errorf("tool %q is unavailable (mcp bridge not initialized)", cleanName)
}
