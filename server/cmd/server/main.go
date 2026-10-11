package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

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

	if err := http.ListenAndServe(":"+port, server.Routes()); err != nil {
		log.Fatalf("server exited with error: %v", err)
	}
}
