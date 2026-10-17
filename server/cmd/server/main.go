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

func resolvePort(flagPort, aegisPort, envPort string) (int, error) {
	target := flagPort
	if target == "" {
		target = aegisPort
	}
	if target == "" {
		target = envPort
	}
	if target == "" {
		return 0, nil
	}
	p, err := strconv.Atoi(target)
	if err != nil || p < 1 || p > 65535 {
		return 0, fmt.Errorf("invalid port %q: must be an integer between 1 and 65535", target)
	}
	return p, nil
}

func createListener(host string, explicitPort int) (net.Listener, int, string, error) {
	if host == "" {
		host = "127.0.0.1"
	}

	if explicitPort > 0 {
		l, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, explicitPort))
		return l, explicitPort, host, err
	}

	for p := 8080; p <= 8095; p++ {
		l, err := net.Listen("tcp", fmt.Sprintf("%s:%d", host, p))
		if err == nil {
			return l, p, host, nil
		}
	}
	return nil, 0, host, errors.New("no available ports between 8080 and 8095")
}

func main() {
	if len(os.Args) > 1 && os.Args[1] == "mcp" {
		runMCPServer(os.Args[2:])
		return
	}

	shouldOpen := false
	host := os.Getenv("AEGIS_HOST")
	var flagPort string
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--version" || arg == "-v" {
			fmt.Printf("AegisCode %s\n", Version)
			return
		}
		if arg == "--help" || arg == "-h" {
			fmt.Printf("AegisCode %s\nUsage:\n  aegiscode [options]                Start Web-based IDE Core Server\n  aegiscode mcp [--workspace <path>] Run native MCP server over stdio\n\nOptions:\n  -p, --port <port> Bind port (default: auto-allocated, or via AEGIS_PORT / PORT)\n  --host <addr>     Bind address (default: 127.0.0.1, use 0.0.0.0 for LAN)\n  -o, --open        Open default browser on startup\n  -v, --version     Print version and exit\n  -h, --help        Print help and exit\n", Version)
			return
		}
		if arg == "--open" || arg == "-o" {
			shouldOpen = true
		}
		if (arg == "--port" || arg == "-p") && i+1 < len(args) {
			flagPort = args[i+1]
			i++
		} else if strings.HasPrefix(arg, "--port=") {
			flagPort = strings.TrimPrefix(arg, "--port=")
		}
		if arg == "--host" && i+1 < len(args) {
			host = args[i+1]
			i++
		} else if strings.HasPrefix(arg, "--host=") {
			host = strings.TrimPrefix(arg, "--host=")
		}
	}
	if os.Getenv("AEGIS_OPEN") == "1" || os.Getenv("AEGIS_OPEN") == "true" {
		shouldOpen = true
	}

	targetPort, err := resolvePort(flagPort, os.Getenv("AEGIS_PORT"), os.Getenv("PORT"))
	if err != nil {
		log.Fatalf("failed to resolve port: %v", err)
	}

	listener, activePort, boundHost, err := createListener(host, targetPort)
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
	serverHost := "localhost"
	if boundHost != "127.0.0.1" && boundHost != "" {
		serverHost = boundHost
	}
	serverURL := fmt.Sprintf("http://%s:%d", serverHost, activePort)
	fmt.Printf("AegisCode %s Go Core Server listening on %s\n", Version, serverURL)
	if activePort != 8080 && targetPort == 0 {
		fmt.Printf("⚠️  WARNING: Port 8080 was occupied. Server dynamically bound to %s instead.\n", serverURL)
		fmt.Println("   To specify a custom port, use: aegiscode --port <port> or set AEGIS_PORT=<port>")
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
	sessionToken := server.SessionToken()
	spaHandler := web.NewSPAHandler(web.GetEmbeddedFS(), sessionToken)

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

	if server.Supervisor().StopAll(ctx); err != nil {
		log.Printf("Supervisor StopAll error: %v", err)
	}

	if server.Codegraph() != nil {
		_ = server.Codegraph().Close()
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

	if _, err := workspace.NewManager(absWs); err != nil {
		fmt.Fprintf(os.Stderr, "failed to initialize workspace: %v\n", err)
		os.Exit(1)
	}
	srv := mcp.NewServer(absWs)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := mcp.RunStdio(ctx, srv, os.Stdin, os.Stdout); err != nil && !errors.Is(err, context.Canceled) {
		fmt.Fprintf(os.Stderr, "mcp server error: %v\n", err)
	}
}
