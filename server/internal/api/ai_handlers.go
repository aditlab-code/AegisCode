package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/ai"
)

func (s *Server) handleAITest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req ai.ProbeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	res := ai.ProbeProvider(r.Context(), req)
	jsonResponse(w, http.StatusOK, res)
}

func (s *Server) handleAIModels(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	models, err := ai.ListAntigravityModels(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to list models: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"models": models,
	})
}

func (s *Server) handleAISkills(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	provider := r.URL.Query().Get("provider")
	wsParam := r.URL.Query().Get("workspace")

	var rootPath string
	if wsParam != "" {
		rootPath = wsParam
	} else if s.ws != nil {
		rootPath, _ = s.ws.GetRoot()
	}

	skills, err := ai.ListSkills(r.Context(), provider, rootPath)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to list skills: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"skills": skills,
	})
}

func (s *Server) handleAITranscript(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	convID := strings.TrimPrefix(r.URL.Path, "/api/v1/ai/transcript/")
	convID = strings.TrimSpace(convID)
	if convID == "" {
		jsonError(w, http.StatusBadRequest, "conversation id is required")
		return
	}

	messages, err := ai.GetSessionTranscript(convID)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			jsonError(w, http.StatusNotFound, "transcript not found for conversation: "+convID)
			return
		}
		jsonError(w, http.StatusInternalServerError, "failed to load transcript: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"conversationId": convID,
		"messages":       messages,
	})
}

func (s *Server) handleAIChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported by server")
		return
	}

	var req ai.StreamChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if strings.TrimSpace(req.Prompt) == "" {
		jsonError(w, http.StatusBadRequest, "prompt cannot be empty")
		return
	}

	if req.WorkspaceDir == "" && s.ws != nil {
		req.WorkspaceDir, _ = s.ws.GetRoot()
	}

	if s.store != nil {
		if cfg, err := s.store.GetConfig(); err == nil && cfg != nil {
			if req.Provider == "" && cfg.DefaultProvider != "" {
				req.Provider = cfg.DefaultProvider
			}
			if req.Model == "" && cfg.DefaultModel != "" {
				req.Model = cfg.DefaultModel
			}
			provKey := strings.ToLower(strings.TrimSpace(req.Provider))
			if provKey == "" {
				provKey = "antigravity"
			}
			if req.APIKey == "" && cfg.ProviderKeys != nil {
				req.APIKey = cfg.ProviderKeys[provKey]
			}
			if req.BaseURL == "" && cfg.ProviderBaseURLs != nil {
				req.BaseURL = cfg.ProviderBaseURLs[provKey]
			}
			if req.Command == "" && cfg.BypassCommands != nil {
				req.Command = cfg.BypassCommands[provKey]
			}
		}
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	flusher.Flush()

	sendEvent := func(eventType string, data any) error {
		payload, err := json.Marshal(data)
		if err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", eventType, payload); err != nil {
			return err
		}
		flusher.Flush()
		return nil
	}

	if err := ai.StreamChat(r.Context(), req, sendEvent); err != nil {
		// Event error was already emitted by StreamChat if relevant
		return
	}
}

