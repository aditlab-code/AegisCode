package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"github.com/aditwicaksono/aegiscode/server/internal/lsp"
)

// LSP Handlers (Core 2)

func (s *Server) handleLSPOpen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPOpenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		_ = s.lsp.DidOpen(req.Path, req.Content, req.Language)
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPChange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		_ = s.lsp.DidChange(req.Path, req.Content, req.Language)
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		if err := s.lsp.DidSave(req.Path, req.Content, req.Language); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to send didSave: "+err.Error())
			return
		}
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPClose(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPCloseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		if err := s.lsp.DidClose(req.Path, req.Language); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to send didClose: "+err.Error())
			return
		}
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPSymbols(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPSymbolsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, map[string]any{"symbols": []lsp.DocumentSymbol{}})
		return
	}
	symbols, err := s.lsp.DocumentSymbols(req.Path, req.Language)
	if err != nil {
		log.Printf("[LSP] DocumentSymbols for %s: %v", req.Path, err)
		jsonResponse(w, http.StatusOK, map[string]any{"symbols": []lsp.DocumentSymbol{}})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"symbols": symbols})
}

func (s *Server) handleLSPCompletion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPPositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPCompletionResponse{Items: []lsp.CompletionItem{}})
		return
	}
	items, err := s.lsp.Completion(req.Path, req.Line, req.Character, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPCompletionResponse{Items: []lsp.CompletionItem{}})
		return
	}
	jsonResponse(w, http.StatusOK, LSPCompletionResponse{Items: items})
}

func (s *Server) handleLSPHover(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPPositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPHoverResponse{})
		return
	}
	hover, err := s.lsp.Hover(req.Path, req.Line, req.Character, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPHoverResponse{})
		return
	}
	jsonResponse(w, http.StatusOK, LSPHoverResponse{Hover: hover})
}

func (s *Server) handleLSPDefinition(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPPositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPDefinitionResponse{Locations: []lsp.Location{}})
		return
	}
	locs, err := s.lsp.Definition(req.Path, req.Line, req.Character, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPDefinitionResponse{Locations: []lsp.Location{}})
		return
	}
	jsonResponse(w, http.StatusOK, LSPDefinitionResponse{Locations: locs})
}

func (s *Server) handleLSPFormatting(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPFormattingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPFormattingResponse{Edits: []lsp.TextEdit{}})
		return
	}
	tabSize := req.TabSize
	if tabSize <= 0 {
		tabSize = 2
	}
	edits, err := s.lsp.Formatting(req.Path, tabSize, req.InsertSpaces, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPFormattingResponse{Edits: []lsp.TextEdit{}})
		return
	}
	jsonResponse(w, http.StatusOK, LSPFormattingResponse{Edits: edits})
}

func (s *Server) handleLSPStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPStatusResponse{Servers: []lsp.LanguageServerStatus{}})
		return
	}
	servers := s.lsp.GetStatus()
	jsonResponse(w, http.StatusOK, LSPStatusResponse{Servers: servers})
}

func (s *Server) handleLSPEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	if s.lsp == nil {
		return
	}

	ch, unsubscribe := s.lsp.SubscribeDiagnostics()
	defer unsubscribe()

	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	notify := r.Context().Done()
	for {
		select {
		case <-notify:
			return
		case diag, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(diag)
			if err == nil {
				fmt.Fprintf(w, "data: %s\n\n", string(data))
				flusher.Flush()
			}
		}
	}
}

