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
	shouldOpen := false
	for _, arg := range os.Args[1:] {
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

	picker := platform.NewNativeFolderPicker()
	server := api.NewServer(ws, picker, st)

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
	fmt.Println("AegisCode Go Core Server stopped cleanly.")
}
