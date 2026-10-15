package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

// --- Flat-File Storage & App State Handlers (Sub-Phase 6.4) ---

func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}

	switch r.Method {
	case http.MethodGet:
		cfg, err := s.store.GetConfig()
		if err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to read config: "+err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, cfg)

	case http.MethodPost:
		var cfg store.Config
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
		if err := s.store.SaveConfig(&cfg); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to save config: "+err.Error())
			return
		}
		if s.lsp != nil && cfg.LspServers != nil {
			s.lsp.SetCustomServers(cfg.LspServers)
		}
		jsonResponse(w, http.StatusOK, map[string]any{
			"status": "ok",
			"config": cfg,
		})

	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleState(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}

	switch r.Method {
	case http.MethodGet:
		st, err := s.store.GetState()
		if err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to read state: "+err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, st)

	case http.MethodPost:
		var st store.AppState
		if err := json.NewDecoder(r.Body).Decode(&st); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
		if err := s.store.SaveState(&st); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to save state: "+err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{
			"status": "ok",
			"state":  st,
		})

	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

type AddRecentProjectRequest struct {
	Path string `json:"path"`
}

func (s *Server) handleStateRecent(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}

	switch r.Method {
	case http.MethodPost:
		var req AddRecentProjectRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
		if strings.TrimSpace(req.Path) == "" {
			jsonError(w, http.StatusBadRequest, "path cannot be empty")
			return
		}
		if err := s.store.AddRecentProject(req.Path); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to add recent project: "+err.Error())
			return
		}
		st, _ := s.store.GetState()
		jsonResponse(w, http.StatusOK, st)

	case http.MethodDelete:
		if r.URL.Query().Get("all") == "true" {
			if err := s.store.ClearRecentProjects(); err != nil {
				jsonError(w, http.StatusInternalServerError, "failed to clear recent projects: "+err.Error())
				return
			}
		} else {
			targetPath := r.URL.Query().Get("path")
			if strings.TrimSpace(targetPath) == "" {
				jsonError(w, http.StatusBadRequest, "path query parameter is required")
				return
			}
			if err := s.store.RemoveRecentProject(targetPath); err != nil {
				jsonError(w, http.StatusInternalServerError, "failed to remove recent project: "+err.Error())
				return
			}
		}
		st, _ := s.store.GetState()
		jsonResponse(w, http.StatusOK, st)

	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleChatsList(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}

	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	ws := r.URL.Query().Get("workspace")
	chats, err := s.store.ListChats(ws)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to list chats: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"chats": chats,
	})
}

func (s *Server) handleChatSearch(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if q == "" {
		jsonResponse(w, http.StatusOK, map[string]any{
			"query":   "",
			"total":   0,
			"results": []store.SearchResult{},
		})
		return
	}

	limit := 30
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if parsed, err := strconv.Atoi(lStr); err == nil && parsed > 0 {
			if parsed > 100 {
				parsed = 100
			}
			limit = parsed
		}
	}

	ws := r.URL.Query().Get("workspace")
	results, err := s.store.SearchChats(q, limit, ws)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "search failed: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"query":   q,
		"total":   len(results),
		"results": results,
	})
}

func (s *Server) handleChatOperations(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}

	subPath := strings.TrimPrefix(r.URL.Path, "/api/v1/chats/")
	subPath = strings.TrimSpace(subPath)
	if subPath == "" {
		jsonError(w, http.StatusBadRequest, "chat session id is required")
		return
	}

	if subPath == "search" {
		s.handleChatSearch(w, r)
		return
	}

	// Handle POST /api/v1/chats/:id/events (Append-Only Event Ledger)
	if strings.HasSuffix(subPath, "/events") {
		sessionID := strings.TrimSuffix(subPath, "/events")
		sessionID = strings.Trim(sessionID, "/")
		if sessionID == "" {
			jsonError(w, http.StatusBadRequest, "chat session id is required")
			return
		}
		if r.Method != http.MethodPost {
			jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}

		var node store.GraphNode
		if err := json.NewDecoder(r.Body).Decode(&node); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}

		savedNode, err := s.store.AppendEventNode(sessionID, node)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to append event node: "+err.Error())
			return
		}

		jsonResponse(w, http.StatusOK, map[string]any{
			"status": "ok",
			"nodeId": savedNode.ID,
			"node":   savedNode,
		})
		return
	}

	id := subPath

	switch r.Method {
	case http.MethodGet:
		// Check for ?format=graph or ?tail=<n>
		q := r.URL.Query()
		if q.Get("format") == "graph" {
			tail := 0
			if tStr := q.Get("tail"); tStr != "" {
				if parsed, err := strconv.Atoi(tStr); err == nil && parsed > 0 {
					tail = parsed
				}
			}
			nodes, err := s.store.GetChatNodes(id, tail)
			if err != nil {
				jsonError(w, http.StatusInternalServerError, "failed to get chat nodes: "+err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{
				"id":    id,
				"nodes": nodes,
			})
			return
		}

		sess, err := s.store.GetChat(id)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				jsonError(w, http.StatusNotFound, "chat session not found")
				return
			}
			jsonError(w, http.StatusInternalServerError, "failed to get chat: "+err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, sess)

	case http.MethodPost:
		var sess store.ChatSession
		if err := json.NewDecoder(r.Body).Decode(&sess); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
		if sess.ID == "" {
			sess.ID = id
		}
		if err := s.store.SaveChat(&sess); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to save chat: "+err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{
			"status":  "ok",
			"session": sess,
		})

	case http.MethodDelete:
		if err := s.store.DeleteChat(id); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to delete chat: "+err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{
			"status": "ok",
			"id":     id,
		})

	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleBlob(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	hash := strings.TrimPrefix(r.URL.Path, "/api/v1/blobs/")
	hash = strings.TrimSpace(hash)
	if hash == "" {
		jsonError(w, http.StatusBadRequest, "blob hash is required")
		return
	}

	data, err := s.store.GetBlob(hash)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			jsonError(w, http.StatusNotFound, "blob not found")
			return
		}
		jsonError(w, http.StatusInternalServerError, "failed to read blob: "+err.Error())
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

