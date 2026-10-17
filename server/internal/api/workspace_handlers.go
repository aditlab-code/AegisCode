package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/platform"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

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

func isForbiddenWorkspaceRoot(path string) bool {
	clean := filepath.Clean(strings.TrimSpace(path))
	if clean == "/" || clean == "\\" || clean == "." {
		return true
	}
	if vol := filepath.VolumeName(clean); vol != "" {
		rest := strings.TrimPrefix(clean, vol)
		if rest == "" || rest == "\\" || rest == "/" {
			return true
		}
	}
	lower := strings.ToLower(filepath.ToSlash(clean))
	forbidden := []string{
		"/etc", "/usr", "/bin", "/sbin", "/var", "/dev", "/proc", "/sys",
		"/system", "/library", "/windows", "/winnt", "/program files", "/program files (x86)",
	}
	for _, f := range forbidden {
		if lower == f {
			return true
		}
	}
	return false
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
	if isForbiddenWorkspaceRoot(cleanedPath) {
		jsonError(w, http.StatusBadRequest, fmt.Sprintf("forbidden: '%s' cannot be mounted as workspace root", cleanedPath))
		return
	}
	absPath, err := s.ws.SetRoot(cleanedPath)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	_, name := s.ws.GetRoot()
	s.BroadcastLog("Server", fmt.Sprintf("Mounted workspace root: %s (%s)", absPath, name), "info")
	if s.store != nil {
		_ = s.store.AddRecentProject(absPath)
	}
	if s.lsp != nil {
		s.lsp.SetWorkspace(absPath)
	}
	if s.codegraph != nil {
		_ = s.codegraph.SetWorkspace(absPath)
	}
	if s.mcp != nil {
		s.mcp.SetWorkspace(absPath)
	}
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

	s.BroadcastLog("Server", "Unmounted active workspace", "info")
	if s.lsp != nil {
		s.lsp.SetWorkspace("")
	}
	if s.codegraph != nil {
		_ = s.codegraph.SetWorkspace("")
	}
	if s.mcp != nil {
		s.mcp.SetWorkspace("")
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
	if s.lsp != nil {
		s.lsp.SetWorkspace(absPath)
	}
	if s.codegraph != nil {
		_ = s.codegraph.SetWorkspace(absPath)
	}
	if s.mcp != nil {
		s.mcp.SetWorkspace(absPath)
	}
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

	// Restrict filesystem browsing to authenticated sessions when accessed remotely (ADR 0017)
	if !IsLoopbackRemote(r) {
		token := ExtractToken(r)
		if s.pairing == nil || !s.pairing.ValidateToken(token) {
			jsonError(w, http.StatusUnauthorized, "unauthorized: valid session or pairing token required to browse filesystem")
			return
		}
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
	if s.ws.IsProtectedPath(target) {
		jsonError(w, http.StatusForbidden, "forbidden: cannot modify .git internal directory")
		return
	}

	absPath, err := s.ws.CreateFolder(target)
	if err != nil {
		if errors.Is(err, workspace.ErrProtectedPath) || strings.Contains(err.Error(), "forbidden") {
			jsonError(w, http.StatusForbidden, err.Error())
		} else {
			jsonError(w, http.StatusBadRequest, err.Error())
		}
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
		if s.ws.IsProtectedPath(path) {
			jsonError(w, http.StatusForbidden, "forbidden: cannot access .git internal files")
			return
		}

		payload, err := s.ws.GetFileWithGuard(path)
		if err != nil {
			if errors.Is(err, workspace.ErrProtectedPath) || strings.Contains(err.Error(), "forbidden") {
				jsonError(w, http.StatusForbidden, err.Error())
			} else if strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
				jsonError(w, http.StatusBadRequest, err.Error())
			} else {
				jsonError(w, http.StatusNotFound, err.Error())
			}
			return
		}

		jsonResponse(w, http.StatusOK, FileResponse{
			Path:     path,
			Content:  payload.Content,
			IsLarge:  payload.IsLarge,
			IsBinary: payload.IsBinary,
			Size:     payload.Size,
		})

	case http.MethodPost:
		var req WriteFileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}
		if s.ws.IsProtectedPath(req.Path) {
			jsonError(w, http.StatusForbidden, "forbidden: cannot modify .git internal files")
			return
		}

		var opErr error
		if req.IsFolder {
			_, opErr = s.ws.CreateFolder(req.Path)
		} else if req.Exclusive {
			opErr = s.ws.WriteFileExclusive(req.Path, req.Content)
		} else {
			opErr = s.ws.WriteFile(req.Path, req.Content)
		}

		if opErr != nil {
			if errors.Is(opErr, workspace.ErrProtectedPath) || strings.Contains(opErr.Error(), "forbidden") {
				jsonError(w, http.StatusForbidden, opErr.Error())
			} else if strings.Contains(opErr.Error(), "already exists") {
				jsonError(w, http.StatusConflict, opErr.Error())
			} else if strings.Contains(opErr.Error(), "escapes root directory") || strings.Contains(opErr.Error(), "empty path") {
				jsonError(w, http.StatusBadRequest, opErr.Error())
			} else {
				jsonError(w, http.StatusInternalServerError, opErr.Error())
			}
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
		if s.ws.IsProtectedPath(path) {
			jsonError(w, http.StatusForbidden, "forbidden: cannot delete .git internal files")
			return
		}

		if err := s.ws.DeleteFile(path); err != nil {
			if errors.Is(err, workspace.ErrProtectedPath) || strings.Contains(err.Error(), "forbidden") {
				jsonError(w, http.StatusForbidden, err.Error())
			} else if strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
				jsonError(w, http.StatusBadRequest, err.Error())
			} else {
				jsonError(w, http.StatusInternalServerError, err.Error())
			}
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

func (s *Server) handleWorkspaceFileRaw(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	path := r.URL.Query().Get("path")
	if strings.TrimSpace(path) == "" {
		jsonError(w, http.StatusBadRequest, "missing path query parameter")
		return
	}
	if s.ws.IsProtectedPath(path) {
		jsonError(w, http.StatusForbidden, "forbidden: cannot access .git internal files")
		return
	}

	fullPath, err := s.ws.ResolvePath(path)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	stat, err := os.Stat(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			jsonError(w, http.StatusNotFound, "file not found")
		} else {
			jsonError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	if stat.IsDir() {
		jsonError(w, http.StatusBadRequest, "path is a directory, not a file")
		return
	}

	http.ServeFile(w, r, fullPath)
}

func (s *Server) handleWorkspaceCsvQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	path := r.URL.Query().Get("path")
	if strings.TrimSpace(path) == "" {
		jsonError(w, http.StatusBadRequest, "missing path query parameter")
		return
	}

	page := 1
	if pStr := r.URL.Query().Get("page"); pStr != "" {
		if p, err := strconv.Atoi(pStr); err == nil && p > 0 {
			page = p
		}
	}

	pageSize := 10
	if psStr := r.URL.Query().Get("pageSize"); psStr != "" {
		if ps, err := strconv.Atoi(psStr); err == nil && ps > 0 {
			pageSize = ps
		}
	}

	colOffset := 0
	if coStr := r.URL.Query().Get("colOffset"); coStr != "" {
		if co, err := strconv.Atoi(coStr); err == nil && co >= 0 {
			colOffset = co
		}
	}

	colLimit := 25
	if clStr := r.URL.Query().Get("colLimit"); clStr != "" {
		if cl, err := strconv.Atoi(clStr); err == nil {
			colLimit = cl
		}
	}

	search := r.URL.Query().Get("search")

	result, err := s.ws.QueryCsv(path, workspace.CsvQueryOptions{
		Page:      page,
		PageSize:  pageSize,
		ColOffset: colOffset,
		ColLimit:  colLimit,
		Search:    search,
	})
	if err != nil {
		if strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
			jsonError(w, http.StatusBadRequest, err.Error())
		} else if strings.Contains(err.Error(), "not found") || os.IsNotExist(err) {
			jsonError(w, http.StatusNotFound, err.Error())
		} else {
			jsonError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}

	jsonResponse(w, http.StatusOK, result)
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

	if strings.TrimSpace(req.OldPath) == "" || strings.TrimSpace(req.NewPath) == "" {
		jsonError(w, http.StatusBadRequest, "oldPath and newPath cannot be empty")
		return
	}
	if s.ws.IsProtectedPath(req.OldPath) || s.ws.IsProtectedPath(req.NewPath) {
		jsonError(w, http.StatusForbidden, "forbidden: cannot rename .git internal files or directories")
		return
	}

	if err := s.ws.Rename(req.OldPath, req.NewPath); err != nil {
		if errors.Is(err, workspace.ErrProtectedPath) || strings.Contains(err.Error(), "forbidden") {
			jsonError(w, http.StatusForbidden, err.Error())
		} else if strings.Contains(err.Error(), "already exists") {
			jsonError(w, http.StatusConflict, err.Error())
		} else if strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
			jsonError(w, http.StatusBadRequest, err.Error())
		} else if os.IsNotExist(err) || errors.Is(err, os.ErrNotExist) || strings.Contains(err.Error(), "no such file") {
			jsonError(w, http.StatusNotFound, err.Error())
		} else {
			jsonError(w, http.StatusInternalServerError, err.Error())
		}
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

	if strings.TrimSpace(req.SourcePath) == "" {
		jsonError(w, http.StatusBadRequest, "sourcePath cannot be empty")
		return
	}
	if s.ws.IsProtectedPath(req.SourcePath) || s.ws.IsProtectedPath(req.TargetDirectory) {
		jsonError(w, http.StatusForbidden, "forbidden: cannot move .git internal files or directories")
		return
	}

	newRelPath, err := s.ws.Move(req.SourcePath, req.TargetDirectory)
	if err != nil {
		if errors.Is(err, workspace.ErrProtectedPath) || strings.Contains(err.Error(), "forbidden") {
			jsonError(w, http.StatusForbidden, err.Error())
		} else if strings.Contains(err.Error(), "is not a directory") || strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
			jsonError(w, http.StatusBadRequest, err.Error())
		} else if strings.Contains(err.Error(), "already exists") {
			jsonError(w, http.StatusConflict, err.Error())
		} else if os.IsNotExist(err) || errors.Is(err, os.ErrNotExist) || strings.Contains(err.Error(), "no such file") {
			jsonError(w, http.StatusNotFound, err.Error())
		} else {
			jsonError(w, http.StatusInternalServerError, err.Error())
		}
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

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	outcome, err := s.ws.SearchWithContext(ctx, req.Query, req.IsRegex, req.IsMatchCase, req.IsWholeWord)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			jsonError(w, http.StatusRequestTimeout, "search timed out (workspace might be too large)")
			return
		}
		if errors.Is(err, context.Canceled) {
			return
		}
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	warning := ""
	if outcome.IsCapped {
		warning = "Results are capped at 100 matches for performance. Narrow your query if target files are not found."
	}

	jsonResponse(w, http.StatusOK, SearchResponse{
		Results:      outcome.Results,
		IsCapped:     outcome.IsCapped,
		TotalMatches: outcome.TotalMatches,
		Warning:      warning,
	})
}

// FilesFindResponse models the JSON payload returned by /api/v1/workspace/files/find.
type FilesFindResponse struct {
	Query      string                 `json:"query"`
	Matches    []workspace.FuzzyMatch `json:"matches"`
	Total      int                    `json:"total"`
	DurationMs int64                  `json:"durationMs"`
}

func (s *Server) handleWorkspaceFilesFind(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	start := time.Now()
	q := r.URL.Query().Get("q")
	limitStr := r.URL.Query().Get("limit")
	limit := 20
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
			if limit > 200 {
				limit = 200
			}
		}
	}

	matches := s.ws.FuzzyFind(q, limit)
	dur := time.Since(start).Milliseconds()

	jsonResponse(w, http.StatusOK, FilesFindResponse{
		Query:      q,
		Matches:    matches,
		Total:      len(matches),
		DurationMs: dur,
	})
}

func (s *Server) handleWorkspaceIndexStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if s.ws == nil {
		jsonResponse(w, http.StatusOK, workspace.IndexStats{Status: "unindexed"})
		return
	}

	jsonResponse(w, http.StatusOK, s.ws.IndexStats())
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

