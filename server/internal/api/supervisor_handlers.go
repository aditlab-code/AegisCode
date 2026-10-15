package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/supervisor"
)

// BroadcastWorkerCrash dispatches a structured crash event to worker event subscribers.
func (s *Server) BroadcastWorkerCrash(evt supervisor.CrashEvent) {
	if s.eventHub != nil {
		s.eventHub.Publish("workers", "crash", evt)
	}

	s.workerMu.RLock()
	defer s.workerMu.RUnlock()

	for ch := range s.workerSubs {
		select {
		case ch <- evt:
		default:
		}
	}
}

func (s *Server) handleWorkersList(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		workers := s.supervisor.ListWorkers()
		jsonResponse(w, http.StatusOK, map[string]any{"workers": workers})
	case http.MethodPost:
		var cfg supervisor.WorkerConfig
		if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
		if cfg.ID == "" || cfg.Command == "" {
			jsonError(w, http.StatusBadRequest, "worker id and command are required")
			return
		}
		if cfg.Dir == "" {
			root, _ := s.ws.GetRoot()
			cfg.Dir = root
		}
		worker, err := s.supervisor.StartWorker(cfg)
		if err != nil {
			if errors.Is(err, supervisor.ErrWorkerAlreadyExists) {
				jsonError(w, http.StatusConflict, err.Error())
				return
			}
			jsonError(w, http.StatusInternalServerError, "failed to start worker: "+err.Error())
			return
		}
		info := worker.Info()
		s.BroadcastLog("Tasks", fmt.Sprintf("[Supervisor] Started worker %s (%s)", info.Name, info.ID), "info")
		jsonResponse(w, http.StatusOK, map[string]any{"status": "started", "worker": info})
	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleWorkerOperations(w http.ResponseWriter, r *http.Request) {
	rel := strings.TrimPrefix(r.URL.Path, "/api/v1/workers/")
	rel = strings.Trim(rel, "/")
	if rel == "" {
		jsonError(w, http.StatusBadRequest, "worker id required")
		return
	}
	parts := strings.Split(rel, "/")
	workerID := parts[0]

	if len(parts) == 1 {
		switch r.Method {
		case http.MethodGet:
			info, err := s.supervisor.GetWorker(workerID)
			if err != nil {
				jsonError(w, http.StatusNotFound, err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]any{"worker": info})
		case http.MethodDelete:
			if err := s.supervisor.DeleteWorker(workerID); err != nil {
				jsonError(w, http.StatusNotFound, err.Error())
				return
			}
			s.BroadcastLog("Tasks", fmt.Sprintf("[Supervisor] Deleted worker %s", workerID), "info")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
		default:
			jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}

	if len(parts) == 2 {
		action := parts[1]
		switch action {
		case "stop":
			if r.Method != http.MethodPost {
				jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
				return
			}
			if err := s.supervisor.StopWorker(workerID); err != nil {
				jsonError(w, http.StatusNotFound, err.Error())
				return
			}
			s.BroadcastLog("Tasks", fmt.Sprintf("[Supervisor] Stopped worker %s", workerID), "info")
			jsonResponse(w, http.StatusOK, map[string]string{"status": "stopped"})
		case "logs":
			if r.Method != http.MethodGet {
				jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
				return
			}
			logs, err := s.supervisor.GetWorkerLogs(workerID)
			if err != nil {
				jsonError(w, http.StatusNotFound, err.Error())
				return
			}
			jsonResponse(w, http.StatusOK, map[string]string{"id": workerID, "logs": logs})
		default:
			jsonError(w, http.StatusNotFound, "unknown worker action")
		}
		return
	}

	jsonError(w, http.StatusBadRequest, "invalid worker path")
}

func (s *Server) handleWorkerEvents(w http.ResponseWriter, r *http.Request) {
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

	ch := make(chan supervisor.CrashEvent, 32)
	s.workerMu.Lock()
	s.workerSubs[ch] = struct{}{}
	s.workerMu.Unlock()

	defer func() {
		s.workerMu.Lock()
		delete(s.workerSubs, ch)
		s.workerMu.Unlock()
	}()

	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\"}\n\n")
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
				fmt.Fprintf(w, "event: worker:crash\ndata: %s\n\n", string(data))
				flusher.Flush()
			}
		}
	}
}

