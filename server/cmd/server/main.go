package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/api"
	"github.com/aditwicaksono/aegiscode/server/internal/platform"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

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

	picker := platform.NewNativeFolderPicker()
	server := api.NewServer(ws, picker)

	rootPath, name := ws.GetRoot()
	fmt.Printf("AegisCode Go Core Server listening on http://localhost:%s\n", port)
	if rootPath == "" {
		fmt.Println("Active Workspace: None (Awaiting folder)")
	} else {
		fmt.Printf("Active Workspace: %s (%s)\n", name, rootPath)
	}

	httpServer := &http.Server{
		Addr:    ":" + port,
		Handler: server.Routes(),
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	serverErr := make(chan error, 1)
	go func() {
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case sig := <-stop:
		fmt.Printf("\nReceived signal %s, shutting down gracefully...\n", sig)
	case err := <-serverErr:
		log.Fatalf("server exited with error: %v", err)
	}

	for _, sess := range server.Terminal().ListSessions() {
		_ = server.Terminal().CloseSession(sess.ID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}
	fmt.Println("AegisCode Go Core Server stopped cleanly.")
}
