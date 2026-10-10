package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/git"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

type Server struct {
	ws *workspace.Manager
}

func jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, map[string]string{"error": message})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleWorkspaceInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rootPath, name := s.ws.GetRoot()
	jsonResponse(w, http.StatusOK, map[string]string{
		"rootPath": rootPath,
		"name":     name,
	})
}

func (s *Server) handleWorkspaceOpen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	cleanedPath := filepath.Clean(strings.TrimSpace(req.Path))
	absPath, err := s.ws.SetRoot(cleanedPath)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, name := s.ws.GetRoot()
	jsonResponse(w, http.StatusOK, map[string]string{
		"status":   "ok",
		"rootPath": absPath,
		"name":     name,
	})
}

func (s *Server) handleWorkspaceClose(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.ws.Close(); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"status": "closed",
	})
}

func (s *Server) handleWorkspacePickFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	chosenPath, cancelled, err := workspace.PickFolderNative(r.Context())
	if err != nil {
		jsonResponse(w, http.StatusOK, map[string]any{
			"status":      "unsupported",
			"error":       err.Error(),
			"unsupported": true,
		})
		return
	}

	if cancelled {
		jsonResponse(w, http.StatusOK, map[string]any{
			"status":    "cancelled",
			"cancelled": true,
		})
		return
	}

	absPath, err := s.ws.SetRoot(chosenPath)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, name := s.ws.GetRoot()
	jsonResponse(w, http.StatusOK, map[string]any{
		"status":   "ok",
		"path":     absPath,
		"name":     name,
		"rootPath": absPath,
	})
}

func (s *Server) handleWorkspaceBrowse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	targetPath := r.URL.Query().Get("path")
	showHidden := r.URL.Query().Get("showHidden") == "true"

	res, err := workspace.BrowseDirectory(targetPath, showHidden)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, res)
}

func (s *Server) handleWorkspaceCreateFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	target := strings.TrimSpace(req.Path)
	if target == "" {
		jsonError(w, http.StatusBadRequest, "path cannot be empty")
		return
	}

	var absPath string
	if filepath.IsAbs(target) {
		absPath = target
	} else {
		root, _ := s.ws.GetRoot()
		absPath = filepath.Join(root, target)
	}

	if err := os.MkdirAll(absPath, 0755); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"status": "ok",
		"path":   absPath,
	})
}

func (s *Server) handleWorkspaceTree(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	depth := 8
	if dStr := r.URL.Query().Get("depth"); dStr != "" {
		if d, err := strconv.Atoi(dStr); err == nil {
			depth = d
		}
	}

	showHidden := r.URL.Query().Get("showHidden") == "true"

	tree, err := s.ws.GetTree(depth, showHidden)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"tree": tree,
	})
}

func (s *Server) handleWorkspaceFile(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		path := r.URL.Query().Get("path")
		if strings.TrimSpace(path) == "" {
			jsonError(w, http.StatusBadRequest, "missing path query parameter")
			return
		}

		content, err := s.ws.GetFile(path)
		if err != nil {
			jsonError(w, http.StatusNotFound, err.Error())
			return
		}

		jsonResponse(w, http.StatusOK, map[string]string{
			"path":    path,
			"content": content,
		})

	case http.MethodPost:
		var req struct {
			Path     string `json:"path"`
			Content  string `json:"content"`
			IsFolder bool   `json:"isFolder"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}

		if err := s.ws.WriteFile(req.Path, req.Content, req.IsFolder); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}

		jsonResponse(w, http.StatusOK, map[string]string{
			"status": "ok",
			"path":   req.Path,
		})

	case http.MethodDelete:
		path := r.URL.Query().Get("path")
		if strings.TrimSpace(path) == "" {
			jsonError(w, http.StatusBadRequest, "missing path query parameter")
			return
		}

		if err := s.ws.DeleteFile(path); err != nil {
			jsonError(w, http.StatusInternalServerError, err.Error())
			return
		}

		jsonResponse(w, http.StatusOK, map[string]string{
			"status": "deleted",
			"path":   path,
		})

	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) handleWorkspaceRename(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		OldPath string `json:"oldPath"`
		NewPath string `json:"newPath"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.ws.Rename(req.OldPath, req.NewPath); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"status":  "renamed",
		"oldPath": req.OldPath,
		"newPath": req.NewPath,
	})
}

func (s *Server) handleWorkspaceMove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		SourcePath      string `json:"sourcePath"`
		TargetDirectory string `json:"targetDirectory"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	newRelPath, err := s.ws.Move(req.SourcePath, req.TargetDirectory)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"status":     "moved",
		"sourcePath": req.SourcePath,
		"newPath":    newRelPath,
	})
}

func (s *Server) handleWorkspaceSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Query       string `json:"query"`
		IsRegex     bool   `json:"isRegex"`
		IsMatchCase bool   `json:"isMatchCase"`
		IsWholeWord bool   `json:"isWholeWord"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	results, err := s.ws.Search(req.Query, req.IsRegex, req.IsMatchCase, req.IsWholeWord)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"results": results,
	})
}

func (s *Server) handleWorkspaceReplaceAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req struct {
		Query       string `json:"query"`
		Replacement string `json:"replacement"`
		IsRegex     bool   `json:"isRegex"`
		IsMatchCase bool   `json:"isMatchCase"`
		IsWholeWord bool   `json:"isWholeWord"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	count, modified, err := s.ws.ReplaceAll(req.Query, req.Replacement, req.IsRegex, req.IsMatchCase, req.IsWholeWord)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"status":        "ok",
		"replacements":  count,
		"modifiedFiles": modified,
	})
}

func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rootPath, _ := s.ws.GetRoot()
	if strings.TrimSpace(rootPath) == "" {
		jsonResponse(w, http.StatusOK, git.RepoStatus{
			IsRepo:   false,
			Branch:   "",
			RepoName: "",
		})
		return
	}

	status, err := git.DetectRepo(rootPath)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, status)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	initialDir := os.Getenv("WORKSPACE_ROOT")
	ws, err := workspace.NewManager(initialDir)
	if err != nil {
		log.Fatalf("failed to initialize workspace manager: %v", err)
	}

	server := &Server{ws: ws}
	mux := http.NewServeMux()

	// Workspace API endpoints
	mux.HandleFunc("/api/v1/workspace/info", server.handleWorkspaceInfo)
	mux.HandleFunc("/api/v1/workspace/open", server.handleWorkspaceOpen)
	mux.HandleFunc("/api/v1/workspace/close", server.handleWorkspaceClose)
	mux.HandleFunc("/api/v1/workspace/pick-folder", server.handleWorkspacePickFolder)
	mux.HandleFunc("/api/v1/workspace/browse", server.handleWorkspaceBrowse)
	mux.HandleFunc("/api/v1/workspace/folder", server.handleWorkspaceCreateFolder)
	mux.HandleFunc("/api/v1/workspace/tree", server.handleWorkspaceTree)
	mux.HandleFunc("/api/v1/workspace/file", server.handleWorkspaceFile)
	mux.HandleFunc("/api/v1/workspace/rename", server.handleWorkspaceRename)
	mux.HandleFunc("/api/v1/workspace/move", server.handleWorkspaceMove)
	mux.HandleFunc("/api/v1/workspace/search", server.handleWorkspaceSearch)
	mux.HandleFunc("/api/v1/workspace/replace-all", server.handleWorkspaceReplaceAll)

	// Git API endpoint
	mux.HandleFunc("/api/v1/git/status", server.handleGitStatus)

	handler := corsMiddleware(mux)

	rootPath, name := ws.GetRoot()
	fmt.Printf("AegisCode Go Core Server listening on http://localhost:%s\n", port)
	if rootPath == "" {
		fmt.Println("Active Workspace: None (Awaiting folder)")
	} else {
		fmt.Printf("Active Workspace: %s (%s)\n", name, rootPath)
	}

	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
