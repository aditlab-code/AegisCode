package codegraph

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

func TestLRUCache(t *testing.T) {
	cache := NewLRUCache(2)

	cache.Set("outline:a.go", "valA", "a.go")
	cache.Set("outline:b.go", "valB", "b.go")

	if v, ok := cache.Get("outline:a.go"); !ok || v != "valA" {
		t.Fatalf("expected valA in cache")
	}

	// Add 3rd item to evict oldest (which is now b.go)
	cache.Set("outline:c.go", "valC", "c.go")

	if _, ok := cache.Get("outline:b.go"); ok {
		t.Errorf("expected b.go to be evicted")
	}
	if _, ok := cache.Get("outline:a.go"); !ok {
		t.Errorf("expected a.go to still be present")
	}

	// Test InvalidatePath
	cache.InvalidatePath("a.go")
	if _, ok := cache.Get("outline:a.go"); ok {
		t.Errorf("expected a.go to be invalidated")
	}
}

func TestEngineIndexingAndHotPath(t *testing.T) {
	tmpDir := t.TempDir()
	ws, err := workspace.NewManager(tmpDir)
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	// Create test Go file
	srcPath := filepath.Join(tmpDir, "calculator.go")
	srcContent := []byte(`package main

// Add returns sum of two integers.
func Add(a, b int) int {
	return a + b
}

func Compute() int {
	return Add(1, 2)
}
`)
	if err := os.WriteFile(srcPath, srcContent, 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	eng, err := NewEngine(ws, nil)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	defer eng.Close()

	ctx := context.Background()

	// Wait briefly for initial cold scan or explicitly index
	err = eng.IndexFile(ctx, "calculator.go")
	if err != nil {
		t.Fatalf("IndexFile failed: %v", err)
	}

	// Verify outline
	outline, err := eng.GetFileOutline(ctx, "calculator.go")
	if err != nil {
		t.Fatalf("GetFileOutline failed: %v", err)
	}
	if len(outline.Symbols) != 2 {
		t.Errorf("expected 2 symbols, got %d", len(outline.Symbols))
	}

	// Verify status
	status, err := eng.Status(ctx)
	if err != nil {
		t.Fatalf("Status failed: %v", err)
	}
	if status.IndexedFiles != 1 || status.TotalSymbols != 2 {
		t.Errorf("unexpected status: %+v", status)
	}

	// Verify second index call skips re-parse (hot path)
	start := time.Now()
	err = eng.IndexFile(ctx, "calculator.go")
	elapsed := time.Since(start)
	if err != nil {
		t.Fatalf("second IndexFile failed: %v", err)
	}
	if elapsed > 10*time.Millisecond {
		t.Errorf("hot path took unexpectedly long: %v", elapsed)
	}

	// Update file
	updatedContent := []byte(`package main

func Add(a, b int) int {
	return a + b
}

func Subtract(a, b int) int {
	return a - b
}
`)
	if err := os.WriteFile(srcPath, updatedContent, 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	err = eng.IndexFile(ctx, "calculator.go")
	if err != nil {
		t.Fatalf("IndexFile on modified content failed: %v", err)
	}

	// Check updated symbols
	updatedOutline, err := eng.GetFileOutline(ctx, "calculator.go")
	if err != nil {
		t.Fatalf("GetFileOutline after update failed: %v", err)
	}
	foundSubtract := false
	for _, s := range updatedOutline.Symbols {
		if s.Name == "Subtract" {
			foundSubtract = true
		}
	}
	if !foundSubtract {
		t.Errorf("expected Subtract symbol in updated outline")
	}
}

func TestEngineSetWorkspaceDeadlock(t *testing.T) {
	tmpDir1 := t.TempDir()
	ws, err := workspace.NewManager(tmpDir1)
	if err != nil {
		t.Fatalf("NewManager failed: %v", err)
	}

	eng, err := NewEngine(ws, nil)
	if err != nil {
		t.Fatalf("NewEngine failed: %v", err)
	}
	defer eng.Close()

	tmpDir2 := t.TempDir()
	// Switching workspace to another path must not deadlock
	done := make(chan struct{})
	go func() {
		_ = eng.SetWorkspace(tmpDir2)
		_ = eng.SetWorkspace("")
		_ = eng.SetWorkspace(tmpDir1)
		close(done)
	}()

	select {
	case <-done:
		// Passed without deadlock
	case <-time.After(3 * time.Second):
		t.Fatal("SetWorkspace deadlocked!")
	}
}
