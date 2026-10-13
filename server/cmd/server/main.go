package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/api"
	"github.com/aditwicaksono/aegiscode/server/internal/codegraph"
	"github.com/aditwicaksono/aegiscode/server/internal/lsp"
	"github.com/aditwicaksono/aegiscode/server/internal/mcp"
	"github.com/aditwicaksono/aegiscode/server/internal/platform"
	"github.com/aditwicaksono/aegiscode/server/internal/store"
	"github.com/aditwicaksono/aegiscode/server/internal/web"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)
// Version is optionally injected via -ldflags during release binary compilation.
var Version = "dev"

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		// Launch in dedicated standalone desktop window via Microsoft Edge App Mode
		edgePaths := []string{
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft/Edge/Application/msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft/Edge/Application/msedge.exe"),
		}
		found := false
		for _, ep := range edgePaths {
			if _, err := os.Stat(ep); err == nil {
				cmd = exec.Command(ep, "--app="+url)
				found = true
				break
			}
		}
		if !found {
			cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
		}
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func createListener(envPort string) (net.Listener, int, error) {
	if envPort != "" {
		p, err := strconv.Atoi(envPort)
		if err != nil {
			return nil, 0, fmt.Errorf("invalid PORT environment variable: %w", err)
		}
		l, err := net.Listen("tcp", fmt.Sprintf(":%d", p))
		return l, p, err
	}

	for p := 8080; p <= 8095; p++ {
		l, err := net.Listen("tcp", fmt.Sprintf(":%d", p))
		if err == nil {
			return l, p, nil
		}
	}
	return nil, 0, errors.New("no available ports between 8080 and 8095")
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "mcp" {
		runMCPServer(os.Args[2:])
		return
	}

	shouldOpen := false
	for _, arg := range os.Args[1:] {
		if arg == "--version" || arg == "-v" {
			fmt.Printf("AegisCode %s\n", Version)
			return
		}
		if arg == "--help" || arg == "-h" {
			fmt.Printf("AegisCode %s\nUsage:\n  aegiscode [options]                Start Web-based IDE Core Server\n  aegiscode mcp [--workspace <path>] Run native MCP server over stdio\n\nOptions:\n  -o, --open       Open default browser on startup\n  -v, --version    Print version and exit\n  -h, --help       Print help and exit\n", Version)
			return
		}
		if arg == "--open" || arg == "-o" {
			shouldOpen = true
		}
	}
	if os.Getenv("AEGIS_OPEN") == "1" || os.Getenv("AEGIS_OPEN") == "true" {
		shouldOpen = true
	}

	listener, activePort, err := createListener(os.Getenv("PORT"))
	if err != nil {
		log.Fatalf("failed to start server listener: %v", err)
	}

	initialDir := os.Getenv("WORKSPACE_ROOT")
	ws, err := workspace.NewManager(initialDir)
	if err != nil {
		log.Fatalf("failed to initialize workspace manager: %v", err)
	}

	st, err := store.New("")
	if err != nil {
		log.Fatalf("failed to initialize store: %v", err)
	}
	defer func() { _ = st.Close() }()

	picker := platform.NewNativeFolderPicker()
	server := api.NewServer(ws, picker, st)
	if server.Pairing() != nil {
		server.Pairing().SetPort(activePort)
	}

	rootPath, name := ws.GetRoot()
	if rootPath != "" {
		_ = st.AddRecentProject(rootPath)
	}
	serverURL := fmt.Sprintf("http://localhost:%d", activePort)
	fmt.Printf("AegisCode %s Go Core Server listening on %s\n", Version, serverURL)
	if activePort != 8080 && os.Getenv("PORT") == "" {
		fmt.Printf("⚠️  WARNING: Default port 8080 was occupied. Server bound to %s instead.\n", serverURL)
		fmt.Println("   To free port 8080, run: npm run stop")
	}
	if server.Pairing() != nil {
		pInfo := server.Pairing().GetInfo()
		fmt.Printf("Companion Pairing: %s (Token: %s, TTL: 24h)\n", pInfo.PairingURL, pInfo.PairingToken)
	}
	if rootPath == "" {
		fmt.Println("Active Workspace: None (Awaiting folder)")
	} else {
		fmt.Printf("Active Workspace: %s (%s)\n", name, rootPath)
	}

	apiHandler := server.Routes()
	spaHandler := web.NewSPAHandler(web.GetEmbeddedFS())

	rootHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			apiHandler.ServeHTTP(w, r)
			return
		}
		spaHandler.ServeHTTP(w, r)
	})

	httpServer := &http.Server{
		Handler: rootHandler,
	}

	if shouldOpen {
		go func() {
			time.Sleep(100 * time.Millisecond)
			openBrowser(serverURL)
		}()
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	shutdownReq := make(chan struct{}, 1)
	server.SetShutdownChannel(shutdownReq)

	serverErr := make(chan error, 1)
	go func() {
		if err := httpServer.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case sig := <-stop:
		fmt.Printf("\nReceived signal %s, shutting down gracefully...\n", sig)
	case <-shutdownReq:
		fmt.Println("\nReceived shutdown API request, shutting down gracefully...")
	case err := <-serverErr:
		log.Fatalf("server exited with error: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	for _, sess := range server.Terminal().ListSessions() {
		_ = server.Terminal().CloseSession(sess.ID)
	}

	if server.Debug() != nil {
		_ = server.Debug().Terminate()
	}

	if err := server.Supervisor().StopAll(ctx); err != nil {
		log.Printf("Supervisor StopAll error: %v", err)
	}

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}

	_ = st.Close()
	fmt.Println("AegisCode Go Core Server stopped cleanly.")
}

func runMCPServer(args []string) {
	wsPath := "."
	for i := 0; i < len(args); i++ {
		if (args[i] == "--workspace" || args[i] == "-w") && i+1 < len(args) {
			wsPath = args[i+1]
			i++
		}
	}
	if envWs := os.Getenv("WORKSPACE_ROOT"); envWs != "" && wsPath == "." {
		wsPath = envWs
	}
	absWs, err := filepath.Abs(wsPath)
	if err != nil {
		absWs = wsPath
	}

	ws, err := workspace.NewManager(absWs)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize workspace: %v\n", err)
		os.Exit(1)
	}
	lspMgr := lsp.NewManager(absWs)
	defer lspMgr.Close()

	eng, err := codegraph.NewEngine(ws, lspMgr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize codegraph engine: %v\n", err)
		os.Exit(1)
	}
	defer eng.Close()

	srv := mcp.NewServer(eng)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := mcp.RunStdio(ctx, srv, os.Stdin, os.Stdout); err != nil && !errors.Is(err, context.Canceled) {
		fmt.Fprintf(os.Stderr, "mcp server error: %v\n", err)
	}
}
