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

		payload, err := s.ws.GetFileWithGuard(path)
		if err != nil {
			if strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
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

		var opErr error
		if req.IsFolder {
			_, opErr = s.ws.CreateFolder(req.Path)
		} else if req.Exclusive {
			opErr = s.ws.WriteFileExclusive(req.Path, req.Content)
		} else {
			opErr = s.ws.WriteFile(req.Path, req.Content)
		}

		if opErr != nil {
			if strings.Contains(opErr.Error(), "already exists") {
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

		if err := s.ws.DeleteFile(path); err != nil {
			if strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
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

	if err := s.ws.Rename(req.OldPath, req.NewPath); err != nil {
		if strings.Contains(err.Error(), "already exists") {
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

	newRelPath, err := s.ws.Move(req.SourcePath, req.TargetDirectory)
	if err != nil {
		if strings.Contains(err.Error(), "is not a directory") || strings.Contains(err.Error(), "escapes root directory") || strings.Contains(err.Error(), "empty path") {
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
		warning = "Hasil dibatasi maksimal 100 matches demi performa. Persempit kata kunci jika file belum ditemukan."
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

