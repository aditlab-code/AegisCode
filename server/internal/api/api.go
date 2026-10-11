package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/git"
	"github.com/aditwicaksono/aegiscode/server/internal/platform"
	"github.com/aditwicaksono/aegiscode/server/internal/store"
	"github.com/aditwicaksono/aegiscode/server/internal/supervisor"
	"github.com/aditwicaksono/aegiscode/server/internal/terminal"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

// Server coordinates HTTP transport over Core Server domain modules.
type Server struct {
	ws         *workspace.Manager
	picker     platform.FolderPicker
	git        *git.Service
	terminal   *terminal.Manager
	supervisor *supervisor.Manager
	store      *store.Store
	logMu      sync.RWMutex
	logSubs    map[chan LogEvent]struct{}
	workerMu   sync.RWMutex
	workerSubs map[chan supervisor.CrashEvent]struct{}
}

func NewServer(ws *workspace.Manager, picker platform.FolderPicker, customStore ...*store.Store) *Server {
	var st *store.Store
	if len(customStore) > 0 && customStore[0] != nil {
		st = customStore[0]
	} else {
		var err error
		st, err = store.New("")
		if err != nil {
			st, _ = store.New(filepath.Join(os.TempDir(), "aegiscode-store"))
		}
	}

	s := &Server{
		ws:         ws,
		picker:     picker,
		git:        git.NewService(ws),
		terminal:   terminal.NewManager(),
		store:      st,
		logSubs:    make(map[chan LogEvent]struct{}),
		workerSubs: make(map[chan supervisor.CrashEvent]struct{}),
	}
	s.supervisor = supervisor.NewManager(func(evt supervisor.CrashEvent) {
		s.BroadcastLog("Tasks", fmt.Sprintf("[Supervisor] Worker %s (%s) crashed: %v", evt.Name, evt.WorkerID, evt.Error), "error")
		s.BroadcastWorkerCrash(evt)
	})
	return s
}

// Store returns the active flat-file persistence store.
func (s *Server) Store() *store.Store {
	return s.store
}

// Supervisor returns the active process supervisor manager.
func (s *Server) Supervisor() *supervisor.Manager {
	return s.supervisor
}

// BroadcastWorkerCrash dispatches a structured crash event to worker event subscribers.
func (s *Server) BroadcastWorkerCrash(evt supervisor.CrashEvent) {
	s.workerMu.RLock()
	defer s.workerMu.RUnlock()

	for ch := range s.workerSubs {
		select {
		case ch <- evt:
		default:
		}
	}
}

// Terminal returns the active terminal session manager.
func (s *Server) Terminal() *terminal.Manager {
	return s.terminal
}

// BroadcastLog dispatches an event to all active log subscribers.
func (s *Server) BroadcastLog(channel, message, level string) {
	evt := LogEvent{
		Channel:   channel,
		Message:   message,
		Timestamp: time.Now().Format("15:04:05"),
		Level:     level,
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

	// Git API endpoints
	mux.HandleFunc("/api/v1/git/status", s.handleGitStatus)
	mux.HandleFunc("/api/v1/git/init", s.handleGitInit)
	mux.HandleFunc("/api/v1/git/branches", s.handleGitBranches)
	mux.HandleFunc("/api/v1/git/branch/checkout", s.handleGitBranchCheckout)
	mux.HandleFunc("/api/v1/git/branch/create", s.handleGitBranchCreate)
	mux.HandleFunc("/api/v1/git/log", s.handleGitLog)
	mux.HandleFunc("/api/v1/git/timeline", s.handleGitTimeline)
	mux.HandleFunc("/api/v1/git/stage", s.handleGitStage)
	mux.HandleFunc("/api/v1/git/unstage", s.handleGitUnstage)
	mux.HandleFunc("/api/v1/git/discard", s.handleGitDiscard)
	mux.HandleFunc("/api/v1/git/commit", s.handleGitCommit)
	mux.HandleFunc("/api/v1/git/push", s.handleGitPush)
	mux.HandleFunc("/api/v1/git/pull", s.handleGitPull)
	mux.HandleFunc("/api/v1/git/sync", s.handleGitSync)
	mux.HandleFunc("/api/v1/git/tags", s.handleGitTags)
	mux.HandleFunc("/api/v1/git/tag", s.handleGitTagCreate)
	mux.HandleFunc("/api/v1/git/tag/push", s.handleGitTagPush)
	mux.HandleFunc("/api/v1/git/remote/add", s.handleGitAddRemote)
	mux.HandleFunc("/api/v1/git/diff", s.handleGitDiff)

	// Terminal API endpoints
	mux.HandleFunc("/api/v1/terminal/create", s.handleTerminalCreate)
	mux.HandleFunc("/api/v1/terminal/sessions", s.handleTerminalSessions)
	mux.HandleFunc("/api/v1/terminal/", s.handleTerminalOperations)
	mux.HandleFunc("/api/v1/events/terminal/", s.handleTerminalEvents)
	mux.HandleFunc("/api/v1/events/logs", s.handleLogsEvents)
	mux.HandleFunc("/api/v1/events/workspace", s.handleWorkspaceEvents)
	mux.HandleFunc("/api/v1/events/workers", s.handleWorkerEvents)

	// Worker Supervisor API endpoints
	mux.HandleFunc("/api/v1/workers", s.handleWorkersList)
	mux.HandleFunc("/api/v1/workers/", s.handleWorkerOperations)

	// Flat-File Storage & App State API endpoints (Sub-Phase 6.4)
	mux.HandleFunc("/api/v1/config", s.handleConfig)
	mux.HandleFunc("/api/v1/state", s.handleState)
	mux.HandleFunc("/api/v1/state/recent", s.handleStateRecent)
	mux.HandleFunc("/api/v1/chats", s.handleChatsList)
	mux.HandleFunc("/api/v1/chats/", s.handleChatOperations)

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
	s.BroadcastLog("Server", fmt.Sprintf("Mounted workspace root: %s (%s)", absPath, name), "info")
	if s.store != nil {
		_ = s.store.AddRecentProject(absPath)
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

	status, err := s.git.GetStatus(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, status)
}

func (s *Server) handleGitInit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.Init(r.Context()); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitBranches(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	branches, err := s.git.GetBranches(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, BranchesResponse{Branches: branches})
}

func (s *Server) handleGitBranchCheckout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CheckoutBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.CheckoutBranch(r.Context(), req.Branch); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitBranchCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CreateBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.CreateBranch(r.Context(), req.Name, req.Checkout); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	limit := 50
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	commits, err := s.git.GetLog(r.Context(), limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, LogResponse{Commits: commits})
}

func (s *Server) handleGitTimeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	filePath := r.URL.Query().Get("file")
	limit := 30
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	commits, err := s.git.GetTimeline(r.Context(), filePath, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, TimelineResponse{Commits: commits})
}

func (s *Server) handleGitStage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req StageFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.Stage(r.Context(), req.Files, req.All); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitUnstage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req UnstageFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.Unstage(r.Context(), req.Files, req.All); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitDiscard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req DiscardFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.Discard(r.Context(), req.Files, req.All); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitCommit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CommitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	node, err := s.git.Commit(r.Context(), req.Message, req.AutoStage)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, CommitResponse{
		Status: "ok",
		Commit: node,
	})
}

func (s *Server) handleGitPush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req PushRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	if err := s.git.Push(r.Context(), req.SetUpstream); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitPull(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.Pull(r.Context()); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.Sync(r.Context()); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitTags(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	tags, err := s.git.GetTags(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, TagsResponse{Tags: tags})
}

func (s *Server) handleGitTagCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CreateTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.CreateTag(r.Context(), req.Name, req.Message); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitTagPush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.PushTags(r.Context()); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitDiff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	file := r.URL.Query().Get("file")
	staged := r.URL.Query().Get("staged") == "true"
	commit := r.URL.Query().Get("commit")

	res, err := s.git.GetDiff(r.Context(), file, staged, commit)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, res)
}

func (s *Server) handleGitAddRemote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req AddRemoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.AddRemote(r.Context(), req.Name, req.URL); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
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

		if action == "input" && r.Method == http.MethodPost {
			var req TerminalInputRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
				return
			}
			if err := s.terminal.WriteInput(sessionID, []byte(req.Data)); err != nil {
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
			// Stateless policy: client disconnected, terminate PTY process tree cleanly
			_ = s.terminal.CloseSession(sessionID)
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

	chats, err := s.store.ListChats()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to list chats: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"chats": chats,
	})
}

func (s *Server) handleChatOperations(w http.ResponseWriter, r *http.Request) {
	if s.store == nil {
		jsonError(w, http.StatusServiceUnavailable, "store unavailable")
		return
	}

	id := strings.TrimPrefix(r.URL.Path, "/api/v1/chats/")
	id = strings.TrimSpace(id)
	if id == "" {
		jsonError(w, http.StatusBadRequest, "chat session id is required")
		return
	}

	switch r.Method {
	case http.MethodGet:
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

