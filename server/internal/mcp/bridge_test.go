package mcp

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/codegraph"
)

func TestBridgeLifecycleAndToolCalls(t *testing.T) {
	bin, _ := codegraph.FindCodegraphBinary()
	if _, err := exec.LookPath(bin); err != nil {
		t.Skip("codegraph binary not found in environment, skipping native integration test")
	}

	// Determine workspace root (the repository root)
	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get cwd: %v", err)
	}
	// cwd is typically server/internal/mcp during test execution
	repoRoot := filepath.Clean(filepath.Join(cwd, "..", "..", ".."))
	if _, err := os.Stat(filepath.Join(repoRoot, "package.json")); err != nil {
		repoRoot = cwd
	}

	bridge := NewBridge(repoRoot)
	defer bridge.Close()

	if err := bridge.EnsureRunning(); err != nil {
		t.Fatalf("failed to start bridge daemon: %v", err)
	}

	// 1. Verify tools advertised
	tools := bridge.Tools()
	if len(tools) == 0 {
		t.Fatalf("expected tools from codegraph daemon, got none")
	}
	hasExplore := false
	for _, tool := range tools {
		if tool.Name == "codegraph_explore" {
			hasExplore = true
			break
		}
	}
	if !hasExplore {
		t.Errorf("expected codegraph_explore in advertised tools")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 2. Test status tool (auto-injection of projectPath)
	resStatus, err := bridge.CallTool(ctx, "codegraph_status", nil)
	if err != nil {
		t.Fatalf("call to codegraph_status failed: %v", err)
	}
	if resStatus.IsError {
		t.Fatalf("codegraph_status returned error: %+v", resStatus.Content)
	}
	if len(resStatus.Content) == 0 || !strings.Contains(resStatus.Content[0].Text, "CodeGraph Status") {
		t.Errorf("expected CodeGraph Status in status response, got %+v", resStatus.Content)
	}

	// 3. Test explore tool
	resExplore, err := bridge.CallTool(ctx, "codegraph_explore", map[string]any{
		"query": "Server",
	})
	if err != nil {
		t.Fatalf("call to codegraph_explore failed: %v", err)
	}
	if resExplore.IsError {
		t.Fatalf("codegraph_explore returned error: %+v", resExplore.Content)
	}
	if len(resExplore.Content) == 0 {
		t.Errorf("expected content from codegraph_explore")
	}

	// 4. Test workspace change notification
	bridge.SetWorkspace(repoRoot)
}

func TestServerWithBridge(t *testing.T) {
	bin, _ := codegraph.FindCodegraphBinary()
	if _, err := exec.LookPath(bin); err != nil {
		t.Skip("codegraph binary not found in environment, skipping native integration test")
	}

	cwd, _ := os.Getwd()
	repoRoot := filepath.Clean(filepath.Join(cwd, "..", "..", ".."))

	srv := NewServer(repoRoot)
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Call tool through server
	res, err := srv.CallTool(ctx, "codegraph_status", nil)
	if err != nil {
		t.Fatalf("srv.CallTool failed: %v", err)
	}
	if res.IsError {
		t.Fatalf("srv.CallTool returned error: %+v", res.Content)
	}
}
