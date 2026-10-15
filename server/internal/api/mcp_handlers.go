package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/mcp"
)

func (s *Server) handleMCPEventsIngest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var evt map[string]any
	if err := json.NewDecoder(r.Body).Decode(&evt); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	tool, _ := evt["tool"].(string)
	args, _ := evt["args"].(map[string]any)
	status, _ := evt["status"].(string)
	if status == "" {
		status = "running"
	}
	s.broadcastMCPEventStatus(tool, args, status)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.mcp == nil {
		jsonError(w, http.StatusServiceUnavailable, "mcp server not initialized")
		return
	}

	var req mcp.JSONRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		resp := &mcp.JSONRPCResponse{
			JSONRPC: "2.0",
			Error: &mcp.JSONRPCError{
				Code:    mcp.CodeParseError,
				Message: "invalid json: " + err.Error(),
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	var callName string
	var callArgs map[string]any
	if req.Method == "tools/call" {
		var callParams mcp.CallToolParams
		if err := json.Unmarshal(req.Params, &callParams); err == nil {
			callName = callParams.Name
			callArgs = callParams.Arguments
			s.broadcastMCPEventStatus(callName, callArgs, "running")
		}
	}

	resp := s.mcp.HandleRequest(r.Context(), &req)

	if callName != "" {
		if resp != nil && resp.Error != nil {
			s.broadcastMCPEventStatus(callName, callArgs, "error")
		} else if resp != nil {
			if callRes, ok := resp.Result.(*mcp.CallToolResult); ok && callRes != nil && callRes.IsError {
				s.broadcastMCPEventStatus(callName, callArgs, "error")
			} else if callRes, ok := resp.Result.(mcp.CallToolResult); ok && callRes.IsError {
				s.broadcastMCPEventStatus(callName, callArgs, "error")
			} else {
				s.broadcastMCPEventStatus(callName, callArgs, "completed")
			}
		}
	}

	if resp == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) broadcastMCPEvent(tool string, args map[string]any) {
	s.broadcastMCPEventStatus(tool, args, "running")
}

func (s *Server) broadcastMCPEventStatus(tool string, args map[string]any, status string) {
	actualTool := tool
	actualArgs := args

	// Unwrap Antigravity / Gemini CLI call_mcp_tool
	if tool == "call_mcp_tool" && args != nil {
		if tn, ok := args["ToolName"].(string); ok && tn != "" {
			actualTool = tn
		}
		if a, ok := args["Arguments"].(map[string]any); ok && a != nil {
			actualArgs = a
		}
	}

	sym := ""
	if actualArgs != nil {
		if v, ok := actualArgs["query"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["symbol"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["name"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["nodeId"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["symbol_name"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["function_name"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["root_symbol"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["file"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["file_path"].(string); ok && v != "" {
			sym = v
		} else if v, ok := actualArgs["rel_path"].(string); ok && v != "" {
			sym = v
		}
	}
	if status == "" {
		status = "running"
	}

	evt := map[string]any{
		"event":     "mcp_tool_invoked",
		"tool":      actualTool,
		"symbol":    sym,
		"status":    status,
		"args":      actualArgs,
		"timestamp": time.Now().Unix(),
	}

	if s.eventHub != nil {
		s.eventHub.Publish("mcp", "tool_invoked", evt)
	}
}

// BroadcastMCPEvent dispatches an MCP tool call event to MCP subscribers and the unified event hub.
func (s *Server) BroadcastMCPEvent(tool string, args map[string]any) {
	s.broadcastMCPEventStatus(tool, args, "running")
}

// BroadcastMCPEventStatus dispatches an MCP tool event with explicit execution lifecycle status.
func (s *Server) BroadcastMCPEventStatus(tool string, args map[string]any, status string) {
	s.broadcastMCPEventStatus(tool, args, status)
}

// initEventHubBridges connects workspace changes, debug events, and LSP diagnostics to the unified event hub.
func (s *Server) initEventHubBridges() {
	if s.eventHub == nil {
		return
	}

	if s.ws != nil {
		wsCh, _ := s.ws.SubscribeEvents()
		go func() {
			for evt := range wsCh {
				if s.eventHub != nil {
					s.eventHub.Publish("workspace", "change", evt)
				}
			}
		}()
	}

	if s.debug != nil {
		dbgCh, _ := s.debug.Subscribe()
		go func() {
			for evt := range dbgCh {
				if s.eventHub != nil {
					s.eventHub.Publish("debug", evt.Type, evt)
				}
			}
		}()
	}

	if s.lsp != nil {
		lspCh, _ := s.lsp.SubscribeDiagnostics()
		go func() {
			for diag := range lspCh {
				if s.eventHub != nil {
					s.eventHub.Publish("lsp", "diagnostics", diag)
				}
			}
		}()
	}
}

