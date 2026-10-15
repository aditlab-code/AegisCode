package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/debug"
)

// resolveGoProgram locates an executable Go package or main entrypoint if the specified target lacks Go files.
func resolveGoProgram(program, cwd string) string {
	target := strings.TrimSpace(program)
	if target == "" || target == "." {
		if cwd != "" {
			target = cwd
		} else {
			target = "."
		}
	}

	// 1. Direct .go file
	if strings.HasSuffix(target, ".go") {
		if fi, err := os.Stat(target); err == nil && !fi.IsDir() {
			return target
		}
		if cwd != "" && !filepath.IsAbs(target) {
			absTarget := filepath.Join(cwd, target)
			if fi, err := os.Stat(absTarget); err == nil && !fi.IsDir() {
				return absTarget
			}
		}
		return target
	}

	// 2. Directory check
	checkDir := target
	if !filepath.IsAbs(checkDir) && cwd != "" {
		checkDir = filepath.Join(cwd, checkDir)
	}

	if fi, err := os.Stat(checkDir); err == nil && fi.IsDir() {
		// Does this directory directly contain any .go files?
		if entries, err := os.ReadDir(checkDir); err == nil {
			for _, e := range entries {
				if !e.IsDir() && strings.HasSuffix(e.Name(), ".go") {
					return checkDir
				}
			}
		}

		// Look for common main entrypoints under checkDir
		candidates := []string{
			filepath.Join(checkDir, "main.go"),
			filepath.Join(checkDir, "cmd", "server", "main.go"),
			filepath.Join(checkDir, "server", "cmd", "server", "main.go"),
		}
		for _, c := range candidates {
			if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
				return filepath.Dir(c)
			}
		}

		// Check subdirectories in cmd/
		cmdDir := filepath.Join(checkDir, "cmd")
		if cmdEntries, err := os.ReadDir(cmdDir); err == nil {
			for _, entry := range cmdEntries {
				if entry.IsDir() {
					mainFile := filepath.Join(cmdDir, entry.Name(), "main.go")
					if fi, err := os.Stat(mainFile); err == nil && !fi.IsDir() {
						return filepath.Dir(mainFile)
					}
				}
			}
		}

		// Check subdirectories in server/cmd/
		serverCmdDir := filepath.Join(checkDir, "server", "cmd")
		if cmdEntries, err := os.ReadDir(serverCmdDir); err == nil {
			for _, entry := range cmdEntries {
				if entry.IsDir() {
					mainFile := filepath.Join(serverCmdDir, entry.Name(), "main.go")
					if fi, err := os.Stat(mainFile); err == nil && !fi.IsDir() {
						return filepath.Dir(mainFile)
					}
				}
			}
		}
	}

	return target
}

func (s *Server) handleDebugStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req debug.StartDebugRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.Cwd == "" && s.ws != nil {
		req.Cwd, _ = s.ws.GetRoot()
	}

	lang := debug.DetectLanguage(req.Language, req.Program)

	if lang == "python" {
		targetFile := req.Program
		if !filepath.IsAbs(targetFile) && req.Cwd != "" {
			targetFile = filepath.Join(req.Cwd, targetFile)
		}
		if fi, err := os.Stat(targetFile); err != nil || fi.IsDir() {
			jsonResponse(w, http.StatusBadRequest, map[string]any{
				"status":  "error",
				"code":    "file_not_found",
				"message": fmt.Sprintf("Python file not found: %s. Please open or specify an existing .py file.", req.Program),
			})
			return
		}
		req.Program = targetFile
	} else if lang == "cpp" {
		targetFile := req.Program
		if !filepath.IsAbs(targetFile) && req.Cwd != "" {
			targetFile = filepath.Join(req.Cwd, targetFile)
		}
		if fi, err := os.Stat(targetFile); err != nil || fi.IsDir() {
			jsonResponse(w, http.StatusBadRequest, map[string]any{
				"status":  "error",
				"code":    "file_not_found",
				"message": fmt.Sprintf("Target source or executable not found: %s", req.Program),
			})
			return
		}
		req.Program = targetFile
	} else {
		req.Program = resolveGoProgram(req.Program, req.Cwd)

		// Validate whether target or its folder contains Go files
		checkTarget := req.Program
		if !filepath.IsAbs(checkTarget) && req.Cwd != "" {
			checkTarget = filepath.Join(req.Cwd, checkTarget)
		}

		if fi, err := os.Stat(checkTarget); err == nil && fi.IsDir() {
			entries, _ := os.ReadDir(checkTarget)
			hasGo := false
			for _, e := range entries {
				if !e.IsDir() && strings.HasSuffix(e.Name(), ".go") {
					hasGo = true
					break
				}
			}
			if !hasGo {
				jsonResponse(w, http.StatusBadRequest, map[string]any{
					"status":  "error",
					"code":    "no_go_files",
					"message": "No Go files found in target directory. Please open a .go file or specify an entrypoint package.",
				})
				return
			}
		}
	}

	if err := s.debug.Start(r.Context(), req); err != nil {
		if errors.Is(err, debug.ErrDelveNotFound) {
			jsonResponse(w, http.StatusNotFound, map[string]any{
				"status":  "error",
				"code":    "delve_not_found",
				"message": err.Error(),
			})
			return
		}
		if errors.Is(err, debug.ErrDebugpyNotFound) || strings.Contains(err.Error(), "debugpy") {
			jsonResponse(w, http.StatusNotFound, map[string]any{
				"status":  "error",
				"code":    "debugpy_not_found",
				"message": err.Error(),
			})
			return
		}
		jsonResponse(w, http.StatusBadRequest, map[string]any{
			"status":  "error",
			"code":    "launch_failed",
			"message": "failed to start debug session: " + err.Error(),
		})
		return
	}
	if s.supervisor != nil {
		if r := s.debug.Runner(); r != nil && r.Cmd != nil && r.Cmd.Process != nil {
			waitDone := make(chan error, 1)
			go func() {
				<-r.Done()
				waitDone <- nil
			}()
			_ = s.supervisor.RegisterRunner(
				"debug-adapter",
				fmt.Sprintf("Debug Adapter (%s)", lang),
				r.Path,
				r.Cmd.Process.Pid,
				func() error {
					return s.debug.Terminate()
				},
				waitDone,
			)
		}
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"status": "ok",
		"state":  s.debug.GetState(),
	})
}

func (s *Server) handleDebugBreakpoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req debug.SetBreakpointsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.File == "" {
		jsonError(w, http.StatusBadRequest, "file parameter is required")
		return
	}
	file := req.File
	if !filepath.IsAbs(file) && s.ws != nil {
		if root, _ := s.ws.GetRoot(); root != "" {
			file = filepath.Join(root, file)
		}
	}
	bps, err := s.debug.SetBreakpoints(r.Context(), file, req.Lines)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to set breakpoints: "+err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"file":        req.File,
		"breakpoints": bps,
	})
}

func (s *Server) handleDebugStep(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req debug.StepRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.Action == "" {
		jsonError(w, http.StatusBadRequest, "action parameter is required")
		return
	}
	if err := s.debug.Step(r.Context(), req.Action); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to execute debug step: "+err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{
		"status": "ok",
		"action": req.Action,
	})
}

func (s *Server) handleDebugState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	jsonResponse(w, http.StatusOK, s.debug.GetState())
}

func (s *Server) handleDebugTerminate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if err := s.debug.Terminate(); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to terminate debug session: "+err.Error())
		return
	}
	if s.supervisor != nil {
		s.supervisor.UnregisterRunner("debug-adapter")
	}
	jsonResponse(w, http.StatusOK, map[string]string{
		"status": "ok",
	})
}

func (s *Server) handleDebugEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported by server")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch, unsub := s.debug.Subscribe()
	defer unsub()

	// Initial connected event
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
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.Type, string(data))
				flusher.Flush()
			}
		}
	}
}

// handleSystemShutdown triggers clean asynchronous server process termination.
func (s *Server) handleSystemShutdown(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{
		"status":  "shutting_down",
		"message": "AegisCode Go Core Server shutting down cleanly",
	})
	go func() {
		time.Sleep(100 * time.Millisecond)
		if s.shutdownChan != nil {
			select {
			case s.shutdownChan <- struct{}{}:
			default:
			}
			return
		}
		p, err := os.FindProcess(os.Getpid())
		if err == nil {
			_ = p.Signal(syscall.SIGTERM)
		}
	}()
}

