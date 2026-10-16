package api

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

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

// Terminal returns the active terminal session manager.
func (s *Server) Terminal() *terminal.Manager {
	return s.terminal
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
	mux.HandleFunc("/api/v1/workspace/index/stats", s.handleWorkspaceIndexStats)
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
	mux.HandleFunc("/api/v1/git/stashes", s.handleGitStashes)
	mux.HandleFunc("/api/v1/git/stash/save", s.handleGitStashSave)
	mux.HandleFunc("/api/v1/git/stash/pop", s.handleGitStashPop)
	mux.HandleFunc("/api/v1/git/stash/apply", s.handleGitStashApply)
	mux.HandleFunc("/api/v1/git/stash/drop", s.handleGitStashDrop)
	mux.HandleFunc("/api/v1/git/cherry-pick", s.handleGitCherryPick)
	mux.HandleFunc("/api/v1/git/clone", s.handleGitClone)

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

	// Aegis Copilot Autonomous Orchestrator Endpoints
	mux.HandleFunc("/api/v1/agent/init-rules", s.handleAgentInitRules)
	mux.HandleFunc("/api/v1/agent/rules-status", s.handleAgentRulesStatus)
	mux.HandleFunc("/api/v1/agent/tasks", s.handleAgentTasks)
	mux.HandleFunc("/api/v1/agent/task/", s.handleAgentTaskDetail)

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
	mux.HandleFunc("/api/v1/events/mcp", s.handleMCPEventsIngest)
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

