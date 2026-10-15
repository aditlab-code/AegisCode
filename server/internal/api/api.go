package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/ai"
	"github.com/aditwicaksono/aegiscode/server/internal/codegraph"
	"github.com/aditwicaksono/aegiscode/server/internal/debug"
	"github.com/aditwicaksono/aegiscode/server/internal/git"
	"github.com/aditwicaksono/aegiscode/server/internal/lsp"
	"github.com/aditwicaksono/aegiscode/server/internal/mcp"
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
	debug      *debug.Manager
	lsp        *lsp.Manager
	codegraph  *codegraph.Manager
	mcp        *mcp.Server
	pairing      *PairingManager
	eventHub     *EventHub
	logMu        sync.RWMutex
	logSubs      map[chan LogEvent]struct{}
	workerMu     sync.RWMutex
	workerSubs   map[chan supervisor.CrashEvent]struct{}
	shutdownChan chan struct{}
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

	var rootPath string
	if ws != nil {
		rootPath, _ = ws.GetRoot()
	}

	s := &Server{
		ws:         ws,
		picker:     picker,
		git:        git.NewService(ws),
		terminal:   terminal.NewManager(),
		store:      st,
		debug:      debug.NewManager(),
		lsp:        lsp.NewManager(rootPath),
		codegraph:  codegraph.NewManager(rootPath),
		mcp:        mcp.NewServer(rootPath),
		pairing:    NewPairingManager(8080),
		eventHub:   NewEventHub(),
		logSubs:    make(map[chan LogEvent]struct{}),
		workerSubs: make(map[chan supervisor.CrashEvent]struct{}),
	}
	s.supervisor = supervisor.NewManager(func(evt supervisor.CrashEvent) {
		s.BroadcastLog("Tasks", fmt.Sprintf("[Supervisor] Worker %s (%s) crashed: %v", evt.Name, evt.WorkerID, evt.Error), "error")
		s.BroadcastWorkerCrash(evt)
	})
	if st != nil && s.lsp != nil {
		if cfg, err := st.GetConfig(); err == nil && cfg != nil && cfg.LspServers != nil {
			s.lsp.SetCustomServers(cfg.LspServers)
		}
	}
	s.initEventHubBridges()
	return s
}

// EventHub returns the active centralized event broker.
func (s *Server) EventHub() *EventHub {
	return s.eventHub
}

// Pairing returns the companion pairing and session manager.
func (s *Server) Pairing() *PairingManager {
	return s.pairing
}

// Codegraph returns the active CodeGraph Manager.
func (s *Server) Codegraph() *codegraph.Manager {
	return s.codegraph
}

// MCP returns the active native Model Context Protocol server.
func (s *Server) MCP() *mcp.Server {
	return s.mcp
}

// Debug returns the active debugger manager.
func (s *Server) Debug() *debug.Manager {
	return s.debug
}

// Store returns the active flat-file persistence store.
func (s *Server) Store() *store.Store {
	return s.store
}

// Supervisor returns the active process supervisor manager.
func (s *Server) Supervisor() *supervisor.Manager {
	return s.supervisor
}

// SetShutdownChannel sets the channel triggered on graceful system shutdown request.
func (s *Server) SetShutdownChannel(ch chan struct{}) {
	s.shutdownChan = ch
}

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

func jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}

func jsonError(w http.ResponseWriter, status int, message string) {
	jsonResponse(w, status, ErrorResponse{Error: message})
}

func (s *Server) isOriginAllowed(origin string, r *http.Request) bool {
	if origin == "" || origin == "null" {
		return true
	}

	// 1. Loopback origins
	if strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "https://localhost:") ||
		strings.HasPrefix(origin, "http://127.0.0.1:") || strings.HasPrefix(origin, "https://127.0.0.1:") ||
		strings.HasPrefix(origin, "http://[::1]:") || strings.HasPrefix(origin, "https://[::1]:") ||
		origin == "http://localhost" || origin == "https://localhost" ||
		origin == "http://127.0.0.1" || origin == "https://127.0.0.1" {
		return true
	}

	// 2. Custom allowed origins via environment variable
	if custom := os.Getenv("AEGIS_ALLOWED_ORIGINS"); custom != "" {
		for _, o := range strings.Split(custom, ",") {
			if strings.EqualFold(strings.TrimSpace(o), origin) {
				return true
			}
		}
	}

	// 3. Match server host or detected LAN IP
	host := r.Host
	if host != "" {
		if origin == "http://"+host || origin == "https://"+host {
			return true
		}
	}

	if s.pairing != nil {
		lanIP := s.pairing.DetectLANIP()
		if lanIP != "" {
			if strings.HasPrefix(origin, "http://"+lanIP+":") || strings.HasPrefix(origin, "https://"+lanIP+":") ||
				origin == "http://"+lanIP || origin == "https://"+lanIP {
				return true
			}
		}
	}

	// 4. Check if origin is private LAN subnet (RFC 1918)
	u, err := url.Parse(origin)
	if err == nil {
		hostOnly := u.Hostname()
		ip := net.ParseIP(hostOnly)
		if ip != nil && (strings.HasPrefix(ip.String(), "192.168.") || strings.HasPrefix(ip.String(), "10.") || isClassBPrivate(ip)) {
			return true
		}
	}

	return false
}

func (s *Server) isPublicEndpoint(path string) bool {
	return false
}

func (s *Server) corsAndAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		allowed := s.isOriginAllowed(origin, r)

		if allowed {
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			} else {
				w.Header().Set("Access-Control-Allow-Origin", "*")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Session-Token, X-Pairing-Token")
			w.Header().Set("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Non-loopback requests must present a valid, unexpired session or pairing token (except public discovery)
		if !IsLoopbackRemote(r) && !s.isPublicEndpoint(r.URL.Path) {
			token := ExtractToken(r)
			if s.pairing == nil || !s.pairing.ValidateToken(token) {
				jsonError(w, http.StatusUnauthorized, "unauthorized: valid session or pairing token required")
				return
			}
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
	mux.HandleFunc("/api/v1/workspace/files/find", s.handleWorkspaceFilesFind)
	mux.HandleFunc("/api/v1/workspace/file", s.handleWorkspaceFile)
	mux.HandleFunc("/api/v1/workspace/file/raw", s.handleWorkspaceFileRaw)
	mux.HandleFunc("/api/v1/workspace/csv/query", s.handleWorkspaceCsvQuery)
	mux.HandleFunc("/api/v1/workspace/rename", s.handleWorkspaceRename)
	mux.HandleFunc("/api/v1/workspace/move", s.handleWorkspaceMove)
	mux.HandleFunc("/api/v1/workspace/search", s.handleWorkspaceSearch)
	mux.HandleFunc("/api/v1/workspace/replace-all", s.handleWorkspaceReplaceAll)

	// Git API endpoints
	mux.HandleFunc("/api/v1/git/status", s.handleGitStatus)
	mux.HandleFunc("/api/v1/git/init", s.handleGitInit)
	mux.HandleFunc("/api/v1/git/unlock", s.handleGitUnlock)
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
	mux.HandleFunc("/api/v1/git/compare", s.handleGitCompare)

	// Terminal API endpoints
	mux.HandleFunc("/api/v1/terminal/create", s.handleTerminalCreate)
	mux.HandleFunc("/api/v1/terminal/sessions", s.handleTerminalSessions)
	mux.HandleFunc("/api/v1/terminal/", s.handleTerminalOperations)
	mux.HandleFunc("/api/v1/events/terminal/", s.handleTerminalEvents)
	mux.HandleFunc("/api/v1/events/logs", s.handleLogsEvents)
	mux.HandleFunc("/api/v1/events/workspace", s.handleWorkspaceEvents)
	mux.HandleFunc("/api/v1/events/workers", s.handleWorkerEvents)
	mux.HandleFunc("/api/v1/events", s.handleUnifiedEvents)

	// Worker Supervisor API endpoints
	mux.HandleFunc("/api/v1/workers", s.handleWorkersList)
	mux.HandleFunc("/api/v1/workers/", s.handleWorkerOperations)

	// Flat-File Storage & App State API endpoints (Sub-Phase 6.4)
	mux.HandleFunc("/api/v1/config", s.handleConfig)
	mux.HandleFunc("/api/v1/state", s.handleState)
	mux.HandleFunc("/api/v1/state/recent", s.handleStateRecent)
	mux.HandleFunc("/api/v1/chats/search", s.handleChatSearch)
	mux.HandleFunc("/api/v1/chats", s.handleChatsList)
	mux.HandleFunc("/api/v1/chats/", s.handleChatOperations)
	mux.HandleFunc("/api/v1/blobs/", s.handleBlob)

	// AI Provider Connection Probe & Antigravity Endpoints
	mux.HandleFunc("/api/v1/ai/test", s.handleAITest)
	mux.HandleFunc("/api/v1/ai/models", s.handleAIModels)
	mux.HandleFunc("/api/v1/ai/skills", s.handleAISkills)
	mux.HandleFunc("/api/v1/ai/transcript/", s.handleAITranscript)
	mux.HandleFunc("/api/v1/ai/chat", s.handleAIChatStream)

	// Bundled DAP Debugger (Delve) Endpoints (Sub-Phase 6.5)
	mux.HandleFunc("/api/v1/debug/start", s.handleDebugStart)
	mux.HandleFunc("/api/v1/debug/breakpoints", s.handleDebugBreakpoints)
	mux.HandleFunc("/api/v1/debug/step", s.handleDebugStep)
	mux.HandleFunc("/api/v1/debug/state", s.handleDebugState)
	mux.HandleFunc("/api/v1/debug/terminate", s.handleDebugTerminate)
	mux.HandleFunc("/api/v1/events/debug", s.handleDebugEvents)

	// Language Server Protocol (LSP) Endpoints (Core 2)
	mux.HandleFunc("/api/v1/lsp/open", s.handleLSPOpen)
	mux.HandleFunc("/api/v1/lsp/change", s.handleLSPChange)
	mux.HandleFunc("/api/v1/lsp/save", s.handleLSPSave)
	mux.HandleFunc("/api/v1/lsp/close", s.handleLSPClose)
	mux.HandleFunc("/api/v1/lsp/symbols", s.handleLSPSymbols)
	mux.HandleFunc("/api/v1/lsp/completion", s.handleLSPCompletion)
	mux.HandleFunc("/api/v1/lsp/hover", s.handleLSPHover)
	mux.HandleFunc("/api/v1/lsp/definition", s.handleLSPDefinition)
	mux.HandleFunc("/api/v1/lsp/formatting", s.handleLSPFormatting)
	mux.HandleFunc("/api/v1/lsp/status", s.handleLSPStatus)
	mux.HandleFunc("/api/v1/events/lsp", s.handleLSPEvents)

	// Model Context Protocol (MCP) & CodeGraph Endpoints
	mux.HandleFunc("/api/v1/mcp", s.handleMCP)
	mux.HandleFunc("/api/v1/codegraph/status", s.handleCodeGraphStatus)
	mux.HandleFunc("/api/v1/codegraph/reindex", s.handleCodeGraphReindex)
	mux.HandleFunc("/api/v1/codegraph/file", s.handleCodeGraphFile)
	mux.HandleFunc("/api/v1/codegraph/symbols/search", s.handleCodeGraphSymbolsSearch)
	mux.HandleFunc("/api/v1/codegraph/entrypoints", s.handleCodeGraphEntrypoints)
	if s.codegraph != nil {
		mux.Handle("/api/codegraph/ui/", s.codegraph.ProxyHandler())
		mux.Handle("/api/codegraph/", s.codegraph.ProxyHandler())
	}

	// System Management
	mux.HandleFunc("/api/v1/system/shutdown", s.handleSystemShutdown)

	return s.corsAndAuthMiddleware(mux)
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

	results, err := s.ws.Search(req.Query, req.IsRegex, req.IsMatchCase, req.IsWholeWord)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, SearchResponse{
		Results: results,
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

func (s *Server) handleGitUnlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	res, err := s.git.Unlock(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, UnlockResponse{
		Unlocked: res.Unlocked,
		Removed:  res.Removed,
		Message:  res.Message,
	})
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
	if filePath == "" {
		filePath = r.URL.Query().Get("path")
	}
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
	if len(req.Files) == 0 && len(req.Paths) > 0 {
		req.Files = req.Paths
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
	if len(req.Files) == 0 && len(req.Paths) > 0 {
		req.Files = req.Paths
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
	if len(req.Files) == 0 && len(req.Paths) > 0 {
		req.Files = req.Paths
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
	if file == "" {
		file = r.URL.Query().Get("path")
	}
	staged := r.URL.Query().Get("staged") == "true"
	commit := r.URL.Query().Get("commit")
	base := r.URL.Query().Get("base")

	res, err := s.git.GetDiff(r.Context(), file, staged, commit, base)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, res)
}

func (s *Server) handleGitCompare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	base := r.URL.Query().Get("base")
	target := r.URL.Query().Get("target")

	res, err := s.git.CompareCommits(r.Context(), base, target)
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

	if s.mcp != nil {
		req.ToolExecutor = func(ctx context.Context, name string, args map[string]any) (string, error) {
			s.broadcastMCPEvent(name, args)
			return s.mcp.ExecuteTool(ctx, name, args)
		}
	}

	if err := ai.StreamChat(r.Context(), req, sendEvent); err != nil {
		// Event error was already emitted by StreamChat if relevant
		return
	}
}

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

// LSP Handlers (Core 2)

func (s *Server) handleLSPOpen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPOpenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		_ = s.lsp.DidOpen(req.Path, req.Content, req.Language)
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPChange(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPChangeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		_ = s.lsp.DidChange(req.Path, req.Content, req.Language)
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPSaveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		if err := s.lsp.DidSave(req.Path, req.Content, req.Language); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to send didSave: "+err.Error())
			return
		}
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPClose(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPCloseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp != nil {
		if err := s.lsp.DidClose(req.Path, req.Language); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to send didClose: "+err.Error())
			return
		}
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleLSPSymbols(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPSymbolsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, map[string]any{"symbols": []lsp.DocumentSymbol{}})
		return
	}
	symbols, err := s.lsp.DocumentSymbols(req.Path, req.Language)
	if err != nil {
		log.Printf("[LSP] DocumentSymbols for %s: %v", req.Path, err)
		jsonResponse(w, http.StatusOK, map[string]any{"symbols": []lsp.DocumentSymbol{}})
		return
	}
	jsonResponse(w, http.StatusOK, map[string]any{"symbols": symbols})
}

func (s *Server) handleLSPCompletion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPPositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPCompletionResponse{Items: []lsp.CompletionItem{}})
		return
	}
	items, err := s.lsp.Completion(req.Path, req.Line, req.Character, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPCompletionResponse{Items: []lsp.CompletionItem{}})
		return
	}
	jsonResponse(w, http.StatusOK, LSPCompletionResponse{Items: items})
}

func (s *Server) handleLSPHover(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPPositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPHoverResponse{})
		return
	}
	hover, err := s.lsp.Hover(req.Path, req.Line, req.Character, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPHoverResponse{})
		return
	}
	jsonResponse(w, http.StatusOK, LSPHoverResponse{Hover: hover})
}

func (s *Server) handleLSPDefinition(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPPositionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPDefinitionResponse{Locations: []lsp.Location{}})
		return
	}
	locs, err := s.lsp.Definition(req.Path, req.Line, req.Character, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPDefinitionResponse{Locations: []lsp.Location{}})
		return
	}
	jsonResponse(w, http.StatusOK, LSPDefinitionResponse{Locations: locs})
}

func (s *Server) handleLSPFormatting(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LSPFormattingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request: "+err.Error())
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPFormattingResponse{Edits: []lsp.TextEdit{}})
		return
	}
	tabSize := req.TabSize
	if tabSize <= 0 {
		tabSize = 2
	}
	edits, err := s.lsp.Formatting(req.Path, tabSize, req.InsertSpaces, req.Language)
	if err != nil {
		jsonResponse(w, http.StatusOK, LSPFormattingResponse{Edits: []lsp.TextEdit{}})
		return
	}
	jsonResponse(w, http.StatusOK, LSPFormattingResponse{Edits: edits})
}

func (s *Server) handleLSPStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.lsp == nil {
		jsonResponse(w, http.StatusOK, LSPStatusResponse{Servers: []lsp.LanguageServerStatus{}})
		return
	}
	servers := s.lsp.GetStatus()
	jsonResponse(w, http.StatusOK, LSPStatusResponse{Servers: servers})
}

func (s *Server) handleLSPEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	if s.lsp == nil {
		return
	}

	ch, unsubscribe := s.lsp.SubscribeDiagnostics()
	defer unsubscribe()

	fmt.Fprintf(w, ": connected\n\n")
	flusher.Flush()

	notify := r.Context().Done()
	for {
		select {
		case <-notify:
			return
		case diag, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(diag)
			if err == nil {
				fmt.Fprintf(w, "data: %s\n\n", string(data))
				flusher.Flush()
			}
		}
	}
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.mcp == nil {
		jsonError(w, http.StatusServiceUnavailable, "mcp server not initialized")
		return
	}

	var req mcp.JSONRPCRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		resp := &mcp.JSONRPCResponse{
			JSONRPC: "2.0",
			Error: &mcp.JSONRPCError{
				Code:    mcp.CodeParseError,
				Message: "invalid json: " + err.Error(),
			},
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
		return
	}

	if req.Method == "tools/call" {
		var callParams mcp.CallToolParams
		if err := json.Unmarshal(req.Params, &callParams); err == nil {
			s.broadcastMCPEvent(callParams.Name, callParams.Arguments)
		}
	}

	resp := s.mcp.HandleRequest(r.Context(), &req)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func (s *Server) broadcastMCPEvent(tool string, args map[string]any) {
	sym := ""
	if args != nil {
		if v, ok := args["query"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["symbol"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["name"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["symbol_name"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["function_name"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["root_symbol"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["file"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["file_path"].(string); ok && v != "" {
			sym = v
		} else if v, ok := args["rel_path"].(string); ok && v != "" {
			sym = v
		}
	}
	evt := map[string]any{
		"event":     "mcp_tool_invoked",
		"tool":      tool,
		"symbol":    sym,
		"args":      args,
		"timestamp": time.Now().Unix(),
	}

	if s.eventHub != nil {
		s.eventHub.Publish("mcp", "tool_invoked", evt)
	}
}

// BroadcastMCPEvent dispatches an MCP tool call event to MCP subscribers and the unified event hub.
func (s *Server) BroadcastMCPEvent(tool string, args map[string]any) {
	s.broadcastMCPEvent(tool, args)
}

// initEventHubBridges connects workspace changes, debug events, and LSP diagnostics to the unified event hub.
func (s *Server) initEventHubBridges() {
	if s.eventHub == nil {
		return
	}

	if s.ws != nil {
		wsCh, _ := s.ws.SubscribeEvents()
		go func() {
			for evt := range wsCh {
				if s.eventHub != nil {
					s.eventHub.Publish("workspace", "change", evt)
				}
			}
		}()
	}

	if s.debug != nil {
		dbgCh, _ := s.debug.Subscribe()
		go func() {
			for evt := range dbgCh {
				if s.eventHub != nil {
					s.eventHub.Publish("debug", evt.Type, evt)
				}
			}
		}()
	}

	if s.lsp != nil {
		lspCh, _ := s.lsp.SubscribeDiagnostics()
		go func() {
			for diag := range lspCh {
				if s.eventHub != nil {
					s.eventHub.Publish("lsp", "diagnostics", diag)
				}
			}
		}()
	}
}

func (s *Server) handleCodeGraphStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonResponse(w, http.StatusOK, map[string]any{"status": "unindexed"})
		return
	}

	st, err := s.codegraph.Status(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, st)
}

func (s *Server) handleCodeGraphReindex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	if !s.codegraph.IsIndexed() {
		jsonError(w, http.StatusBadRequest, "workspace is not initialized. Run init first")
		return
	}

	if err := s.codegraph.Reindex(r.Context()); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleCodeGraphFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		jsonError(w, http.StatusBadRequest, "path parameter required")
		return
	}

	cleanPath := strings.TrimPrefix(path, "/")
	body, statusCode, err := s.codegraph.FetchAPI(r.Context(), "filecode/"+cleanPath)
	if err != nil {
		jsonError(w, statusCode, err.Error())
		return
	}
	if statusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write(body)
		return
	}

	var native struct {
		Outline struct {
			Total int `json:"total"`
			Items []struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				Kind      string `json:"kind"`
				File      string `json:"file"`
				Line      int    `json:"line"`
				EndLine   int    `json:"endLine"`
				Signature string `json:"signature"`
			} `json:"items"`
		} `json:"outline"`
		Calls struct {
			Total int `json:"total"`
			Items []struct {
				From string `json:"from"`
				To   string `json:"to"`
				Kind string `json:"kind"`
				Line int    `json:"line"`
			} `json:"items"`
		} `json:"calls"`
	}
	if err := json.Unmarshal(body, &native); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to parse codegraph filecode: "+err.Error())
		return
	}

	nodes := make([]map[string]any, 0, len(native.Outline.Items))
	for _, item := range native.Outline.Items {
		nodes = append(nodes, map[string]any{
			"id":        item.ID,
			"name":      item.Name,
			"kind":      item.Kind,
			"filePath":  item.File,
			"lineStart": item.Line,
			"lineEnd":   item.EndLine,
			"signature": item.Signature,
			"isActive":  false,
		})
	}

	edges := make([]map[string]any, 0, len(native.Calls.Items))
	for idx, call := range native.Calls.Items {
		edges = append(edges, map[string]any{
			"id":       idx + 1,
			"sourceId": call.From,
			"targetId": call.To,
			"relation": call.Kind,
			"line":     call.Line,
		})
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"rootId":    cleanPath,
		"nodes":     nodes,
		"edges":     edges,
		"truncated": false,
		"total":     len(nodes),
		"engine":    "colbymchenry/codegraph",
	})
}

func (s *Server) handleCodeGraphSymbolsSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		jsonError(w, http.StatusBadRequest, "q parameter required")
		return
	}

	body, statusCode, err := s.codegraph.FetchAPI(r.Context(), "search?q="+url.QueryEscape(query))
	if err != nil {
		jsonError(w, statusCode, err.Error())
		return
	}
	if statusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write(body)
		return
	}

	var nativeSearch struct {
		Results struct {
			Items []struct {
				ID        string `json:"id"`
				Name      string `json:"name"`
				Kind      string `json:"kind"`
				File      string `json:"file"`
				Line      int    `json:"line"`
				EndLine   int    `json:"endLine"`
				Signature string `json:"signature"`
			} `json:"items"`
		} `json:"results"`
	}
	if err := json.Unmarshal(body, &nativeSearch); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to parse codegraph search results: "+err.Error())
		return
	}

	nodes := make([]map[string]any, 0, len(nativeSearch.Results.Items))
	for _, item := range nativeSearch.Results.Items {
		nodes = append(nodes, map[string]any{
			"id":        item.ID,
			"name":      item.Name,
			"kind":      item.Kind,
			"filePath":  item.File,
			"lineStart": item.Line,
			"lineEnd":   item.EndLine,
			"signature": item.Signature,
			"isActive":  false,
		})
	}
	jsonResponse(w, http.StatusOK, nodes)
}

func (s *Server) handleCodeGraphEntrypoints(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.codegraph == nil {
		jsonError(w, http.StatusServiceUnavailable, "codegraph manager not initialized")
		return
	}

	workspacePath := strings.TrimSpace(r.URL.Query().Get("workspace"))
	if workspacePath == "" {
		workspacePath = strings.TrimSpace(r.URL.Query().Get("path"))
	}
	if workspacePath != "" && workspacePath != s.codegraph.Workspace() {
		s.codegraph.SetWorkspace(workspacePath)
		if s.mcp != nil {
			s.mcp.SetWorkspace(workspacePath)
		}
	}

	if !s.codegraph.IsIndexed() {
		jsonError(w, http.StatusServiceUnavailable, "workspace is not initialized with CodeGraph")
		return
	}

	body, statusCode, err := s.codegraph.FetchAPI(r.Context(), "entrypoints")
	if err != nil {
		// Attempt fallback via MCP bridge if daemon direct fetch fails
		if s.mcp != nil {
			result, mcpErr := s.mcp.CallTool(r.Context(), "codegraph_explore", map[string]any{
				"path": s.codegraph.Workspace(),
			})
			if mcpErr == nil && result != nil && !result.IsError && len(result.Content) > 0 && result.Content[0].Type == "text" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(result.Content[0].Text))
				return
			}
		}
		jsonError(w, statusCode, fmt.Sprintf("failed to retrieve entrypoints from CodeGraph daemon: %v", err))
		return
	}

	if statusCode != http.StatusOK {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write(body)
		return
	}

	// Unwrap MCP envelope if present in body
	var mcpEnvelope struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if err := json.Unmarshal(body, &mcpEnvelope); err == nil && len(mcpEnvelope.Content) > 0 && mcpEnvelope.Content[0].Type == "text" && mcpEnvelope.Content[0].Text != "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(mcpEnvelope.Content[0].Text))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}

