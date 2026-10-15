package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/terminal"
)

// BroadcastLog dispatches an event to all active log subscribers.
func (s *Server) BroadcastLog(channel, message, level string) {
	evt := LogEvent{
		Channel:   channel,
		Message:   message,
		Timestamp: time.Now().Format("15:04:05"),
		Level:     level,
	}

	if s.eventHub != nil {
		s.eventHub.Publish("logs", "log", evt)
	}

	s.logMu.RLock()
	defer s.logMu.RUnlock()
	for ch := range s.logSubs {
		select {
		case ch <- evt:
		default:
		}
	}
}

// Terminal API Handlers

func (s *Server) handleTerminalCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CreateTerminalRequest
	if r.Body != nil && r.ContentLength > 0 {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
	}

	cwd := req.Cwd
	if cwd == "" {
		rootPath, _ := s.ws.GetRoot()
		cwd = rootPath
	}

	sessionID := fmt.Sprintf("term-%d", time.Now().UnixNano())
	sess, err := s.terminal.CreateSession(sessionID, req.Shell, cwd, req.Cols, req.Rows)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to create terminal: "+err.Error())
		return
	}

	// Register with process supervisor for fail-fast crash monitoring
	waitErr := make(chan error, 1)
	go func() {
		<-sess.Wait()
		waitErr <- nil
	}()
	_ = s.supervisor.RegisterRunner(
		"terminal-"+sess.ID,
		fmt.Sprintf("Terminal Shell (%s)", sess.Shell),
		sess.Shell,
		sess.Pid(),
		func() error { return s.terminal.CloseSession(sess.ID) },
		waitErr,
	)

	s.BroadcastLog("Tasks", fmt.Sprintf("Started terminal session %s (%s)", sess.ID, sess.Shell), "info")

	jsonResponse(w, http.StatusOK, CreateTerminalResponse{
		SessionId: sess.ID,
		Shell:     sess.Shell,
		Cwd:       sess.Cwd,
		Pid:       sess.Pid(),
	})
}

func (s *Server) handleTerminalSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	sessions := s.terminal.ListSessions()
	resp := make([]TerminalSessionInfo, 0, len(sessions))
	for _, sess := range sessions {
		resp = append(resp, TerminalSessionInfo{
			SessionId: sess.ID,
			Shell:     sess.Shell,
			Cwd:       sess.Cwd,
			Pid:       sess.Pid(),
			Running:   true,
		})
	}

	jsonResponse(w, http.StatusOK, TerminalSessionsResponse{
		Sessions: resp,
	})
}

func (s *Server) handleTerminalOperations(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/terminal/")
	parts := strings.Split(strings.Trim(rel, "/"), "/")

	if len(parts) == 1 && r.Method == http.MethodDelete {
		sessionID := parts[0]
		s.supervisor.UnregisterRunner("terminal-" + sessionID)
		if err := s.terminal.CloseSession(sessionID); err != nil {
			jsonError(w, http.StatusNotFound, err.Error())
			return
		}
		s.BroadcastLog("Tasks", fmt.Sprintf("Terminated terminal session %s", sessionID), "info")
		jsonResponse(w, http.StatusOK, map[string]string{"status": "closed"})
		return
	}

	if len(parts) == 2 {
		sessionID := parts[0]
		action := parts[1]

		if (action == "input" || action == "write") && r.Method == http.MethodPost {
			var req TerminalInputRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
				return
			}
			if err := s.terminal.WriteInput(sessionID, []byte(req.Data)); err != nil {
				if errors.Is(err, terminal.ErrSessionNotFound) || errors.Is(err, terminal.ErrSessionClosed) {
					jsonError(w, http.StatusNotFound, err.Error())
					return
				}
				jsonError(w, http.StatusInternalServerError, err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
			return
		}

		if action == "resize" && r.Method == http.MethodPost {
			var req TerminalResizeRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
				return
			}
			if err := s.terminal.Resize(sessionID, req.Cols, req.Rows); err != nil {
				if errors.Is(err, terminal.ErrSessionNotFound) || errors.Is(err, terminal.ErrSessionClosed) {
					jsonError(w, http.StatusNotFound, err.Error())
					return
				}
				jsonError(w, http.StatusInternalServerError, err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
			return
		}
	}

	jsonError(w, http.StatusNotFound, "endpoint not found")
}

func (s *Server) handleTerminalEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	sessionID := strings.TrimPrefix(r.URL.Path, "/api/v1/events/terminal/")
	sessionID = strings.TrimSpace(sessionID)
	if sessionID == "" {
		jsonError(w, http.StatusBadRequest, "session id required")
		return
	}

	sub, unsub, err := s.terminal.Subscribe(sessionID)
	if err != nil {
		jsonError(w, http.StatusNotFound, err.Error())
		return
	}
	defer unsub()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	// Initial connected event
	fmt.Fprintf(w, "event: connected\ndata: {\"sessionId\":%q}\n\n", sessionID)
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			// Client disconnected from SSE stream: unsub deferred cleanup runs,
			// PTY session remains alive for client re-subscription or tab navigation.
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case chunk, ok := <-sub:
			if !ok {
				fmt.Fprintf(w, "event: exit\ndata: {}\n\n")
				flusher.Flush()
				return
			}
			encoded := base64.StdEncoding.EncodeToString(chunk)
			fmt.Fprintf(w, "event: data\ndata: {\"payload\":%q}\n\n", encoded)
			flusher.Flush()
		}
	}
}

func (s *Server) handleLogsEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch := make(chan LogEvent, 64)
	s.logMu.Lock()
	s.logSubs[ch] = struct{}{}
	s.logMu.Unlock()

	defer func() {
		s.logMu.Lock()
		delete(s.logSubs, ch)
		s.logMu.Unlock()
	}()

	// Send initial greeting log using LogEvent struct
	root, name := s.ws.GetRoot()
	if name == "" {
		name = "Workspace"
	}
	initEvt := LogEvent{
		Channel:   "Server",
		Message:   fmt.Sprintf("AegisCode Core Server active (workspace: %s [%s])", name, root),
		Timestamp: time.Now().Format("15:04:05"),
		Level:     "info",
	}
	initBytes, _ := json.Marshal(initEvt)
	fmt.Fprintf(w, "event: log\ndata: %s\n\n", string(initBytes))
	flusher.Flush()

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(evt)
			if err == nil {
				fmt.Fprintf(w, "event: log\ndata: %s\n\n", string(data))
				flusher.Flush()
			}
		}
	}
}

func (s *Server) handleWorkspaceEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch, unsub := s.ws.SubscribeEvents()
	defer unsub()

	root, name := s.ws.GetRoot()
	initData, _ := json.Marshal(map[string]any{
		"status":   "connected",
		"rootPath": root,
		"name":     name,
	})
	fmt.Fprintf(w, "event: connected\ndata: %s\n\n", string(initData))
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(evt)
			if err == nil {
				fmt.Fprintf(w, "event: change\ndata: %s\n\n", string(data))
				flusher.Flush()
			}
		}
	}
}

