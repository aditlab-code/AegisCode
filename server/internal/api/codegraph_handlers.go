package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
)

func (s *Server) handleCodeGraphStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonResponse(w, http.StatusOK, map[string]any{"status": "unindexed"})
		return
	}

	st, err := s.codegraph.Status(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, st)
}

func (s *Server) handleCodeGraphReindex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	if !s.codegraph.IsIndexed() {
		jsonError(w, http.StatusBadRequest, "workspace is not initialized. Run init first")
		return
	}

	if err := s.codegraph.Reindex(r.Context()); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleCodeGraphFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		jsonError(w, http.StatusBadRequest, "path parameter required")
		return
	}

	cleanPath := strings.TrimPrefix(path, "/")
	body, statusCode, err := s.codegraph.FetchAPI(r.Context(), "filecode/"+cleanPath)
	if err != nil {
		jsonError(w, statusCode, err.Error())
		return
	}
	if statusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write(body)
		return
	}

	var native struct {
		Outline struct {
			Total int `json:"total"`
			Items []struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				Kind      string `json:"kind"`
				File      string `json:"file"`
				Line      int    `json:"line"`
				EndLine   int    `json:"endLine"`
				Signature string `json:"signature"`
			} `json:"items"`
		} `json:"outline"`
		Calls struct {
			Total int `json:"total"`
			Items []struct {
				From string `json:"from"`
				To   string `json:"to"`
				Kind string `json:"kind"`
				Line int    `json:"line"`
			} `json:"items"`
		} `json:"calls"`
	}
	if err := json.Unmarshal(body, &native); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to parse codegraph filecode: "+err.Error())
		return
	}

	nodes := make([]map[string]any, 0, len(native.Outline.Items))
	for _, item := range native.Outline.Items {
		nodes = append(nodes, map[string]any{
			"id":        item.ID,
			"name":      item.Name,
			"kind":      item.Kind,
			"filePath":  item.File,
			"lineStart": item.Line,
			"lineEnd":   item.EndLine,
			"signature": item.Signature,
			"isActive":  false,
		})
	}

	edges := make([]map[string]any, 0, len(native.Calls.Items))
	for idx, call := range native.Calls.Items {
		edges = append(edges, map[string]any{
			"id":       idx + 1,
			"sourceId": call.From,
			"targetId": call.To,
			"relation": call.Kind,
			"line":     call.Line,
		})
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"rootId":    cleanPath,
		"nodes":     nodes,
		"edges":     edges,
		"truncated": false,
		"total":     len(nodes),
		"engine":    "colbymchenry/codegraph",
	})
}

func (s *Server) handleCodeGraphSymbolsSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		jsonError(w, http.StatusBadRequest, "q parameter required")
		return
	}

	body, statusCode, err := s.codegraph.FetchAPI(r.Context(), "search?q="+url.QueryEscape(query))
	if err != nil {
		jsonError(w, statusCode, err.Error())
		return
	}
	if statusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write(body)
		return
	}

	var nativeSearch struct {
		Results struct {
			Items []struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				Kind      string `json:"kind"`
				File      string `json:"file"`
				Line      int    `json:"line"`
				EndLine   int    `json:"endLine"`
				Signature string `json:"signature"`
			} `json:"items"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &nativeSearch); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to parse codegraph search results: "+err.Error())
		return
	}

	nodes := make([]map[string]any, 0, len(nativeSearch.Results.Items))
	for _, item := range nativeSearch.Results.Items {
		nodes = append(nodes, map[string]any{
			"id":        item.ID,
			"name":      item.Name,
			"kind":      item.Kind,
			"filePath":  item.File,
			"lineStart": item.Line,
			"lineEnd":   item.EndLine,
			"signature": item.Signature,
			"isActive":  false,
		})
	}
	jsonResponse(w, http.StatusOK, nodes)
}

func (s *Server) handleCodeGraphEntrypoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	workspacePath := strings.TrimSpace(r.URL.Query().Get("workspace"))
	if workspacePath == "" {
		workspacePath = strings.TrimSpace(r.URL.Query().Get("path"))
	}
	if workspacePath != "" && workspacePath != s.codegraph.Workspace() {
		s.codegraph.SetWorkspace(workspacePath)
		if s.mcp != nil {
			s.mcp.SetWorkspace(workspacePath)
		}
	}

	if !s.codegraph.IsIndexed() {
		jsonError(w, http.StatusServiceUnavailable, "workspace is not initialized with CodeGraph")
		return
	}

	body, statusCode, err := s.codegraph.FetchAPI(r.Context(), "entrypoints")
	if err != nil {
		// Attempt fallback via MCP bridge if daemon direct fetch fails
		if s.mcp != nil {
			result, mcpErr := s.mcp.CallTool(r.Context(), "codegraph_explore", map[string]any{
				"query": "entrypoints main server",
				"path":  s.codegraph.Workspace(),
			})
			if mcpErr == nil && result != nil && !result.IsError && len(result.Content) > 0 && result.Content[0].Type == "text" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(result.Content[0].Text))
				return
			}
		}
		jsonError(w, statusCode, fmt.Sprintf("failed to retrieve entrypoints from CodeGraph daemon: %v", err))
		return
	}

	if statusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write(body)
		return
	}

	// Unwrap MCP envelope if present in body
	var mcpEnvelope struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if err := json.Unmarshal(body, &mcpEnvelope); err == nil && len(mcpEnvelope.Content) > 0 && mcpEnvelope.Content[0].Type == "text" && mcpEnvelope.Content[0].Text != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(mcpEnvelope.Content[0].Text))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

