package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/platform"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

// Server coordinates HTTP transport over Core Server domain modules.
type Server struct {
	ws     *workspace.Manager
	picker platform.FolderPicker
}

func NewServer(ws *workspace.Manager, picker platform.FolderPicker) *Server {
	return &Server{
		ws:     ws,
		picker: picker,
	}
}

func jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, ErrorResponse{Error: message})
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

// Routes constructs the HTTP handler mux mapping all 13 workspace and vcs endpoints.
func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	// Workspace API endpoints
	mux.HandleFunc("/api/v1/workspace/info", s.handleWorkspaceInfo)
	mux.HandleFunc("/api/v1/workspace/open", s.handleWorkspaceOpen)
	mux.HandleFunc("/api/v1/workspace/close", s.handleWorkspaceClose)
	mux.HandleFunc("/api/v1/workspace/pick-folder", s.handleWorkspacePickFolder)
	mux.HandleFunc("/api/v1/workspace/browse", s.handleWorkspaceBrowse)
	mux.HandleFunc("/api/v1/workspace/folder", s.handleWorkspaceCreateFolder)
	mux.HandleFunc("/api/v1/workspace/tree", s.handleWorkspaceTree)
	mux.HandleFunc("/api/v1/workspace/file", s.handleWorkspaceFile)
	mux.HandleFunc("/api/v1/workspace/rename", s.handleWorkspaceRename)
	mux.HandleFunc("/api/v1/workspace/move", s.handleWorkspaceMove)
	mux.HandleFunc("/api/v1/workspace/search", s.handleWorkspaceSearch)
	mux.HandleFunc("/api/v1/workspace/replace-all", s.handleWorkspaceReplaceAll)

	// Git API endpoint
	mux.HandleFunc("/api/v1/git/status", s.handleGitStatus)

	return corsMiddleware(mux)
}

func (s *Server) handleWorkspaceInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	rootPath, name := s.ws.GetRoot()
	jsonResponse(w, http.StatusOK, WorkspaceInfoResponse{
		RootPath: rootPath,
		Name:     name,
	})
}

func (s *Server) handleWorkspaceOpen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req OpenWorkspaceRequest
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
	jsonResponse(w, http.StatusOK, OpenWorkspaceResponse{
		Status:   "ok",
		RootPath: absPath,
		Name:     name,
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

	jsonResponse(w, http.StatusOK, CloseWorkspaceResponse{
		Status: "closed",
	})
}

func (s *Server) handleWorkspacePickFolder(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	chosenPath, cancelled, err := s.picker.PickFolder(r.Context())
	if err != nil {
		jsonResponse(w, http.StatusOK, PickFolderResponse{
			Status:      "unsupported",
			Error:       err.Error(),
			Unsupported: true,
		})
		return
	}

	if cancelled {
		jsonResponse(w, http.StatusOK, PickFolderResponse{
			Status:    "cancelled",
			Cancelled: true,
		})
		return
	}

	absPath, err := s.ws.SetRoot(chosenPath)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, name := s.ws.GetRoot()
	jsonResponse(w, http.StatusOK, PickFolderResponse{
		Status:   "ok",
		Path:     absPath,
		Name:     name,
		RootPath: absPath,
	})
}

func (s *Server) handleWorkspaceBrowse(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	targetPath := r.URL.Query().Get("path")
	showHidden := r.URL.Query().Get("showHidden") == "true"

	res, err := platform.BrowseDirectory(targetPath, showHidden)
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

	var req CreateFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	target := strings.TrimSpace(req.Path)
	if target == "" {
		jsonError(w, http.StatusBadRequest, "path cannot be empty")
		return
	}

	absPath, err := s.ws.CreateFolder(target)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, CreateFolderResponse{
		Status: "ok",
		Path:   absPath,
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

	jsonResponse(w, http.StatusOK, TreeResponse{
		Tree: tree,
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

		jsonResponse(w, http.StatusOK, FileResponse{
			Path:    path,
			Content: content,
		})

	case http.MethodPost:
		var req WriteFileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}

		var opErr error
		if req.IsFolder {
			_, opErr = s.ws.CreateFolder(req.Path)
		} else {
			opErr = s.ws.WriteFile(req.Path, req.Content)
		}

		if opErr != nil {
			jsonError(w, http.StatusInternalServerError, opErr.Error())
			return
		}

		jsonResponse(w, http.StatusOK, FileOperationResponse{
			Status: "ok",
			Path:   req.Path,
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

		jsonResponse(w, http.StatusOK, FileOperationResponse{
			Status: "deleted",
			Path:   path,
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

	var req RenameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.ws.Rename(req.OldPath, req.NewPath); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, FileOperationResponse{
		Status:  "renamed",
		OldPath: req.OldPath,
		NewPath: req.NewPath,
	})
}

func (s *Server) handleWorkspaceMove(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req MoveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	newRelPath, err := s.ws.Move(req.SourcePath, req.TargetDirectory)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, FileOperationResponse{
		Status:          "moved",
		SourcePath:      req.SourcePath,
		NewPath:         newRelPath,
		TargetDirectory: req.TargetDirectory,
	})
}

func (s *Server) handleWorkspaceSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	results, err := s.ws.Search(req.Query, req.IsRegex, req.IsMatchCase, req.IsWholeWord)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, SearchResponse{
		Results: results,
	})
}

func (s *Server) handleWorkspaceReplaceAll(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req ReplaceAllRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	count, modified, err := s.ws.ReplaceAll(req.Query, req.Replacement, req.IsRegex, req.IsMatchCase, req.IsWholeWord)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, ReplaceAllResponse{
		Status:        "ok",
		Replacements:  count,
		ModifiedFiles: modified,
	})
}

func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	status, err := s.ws.GetGitStatus()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, status)
}
