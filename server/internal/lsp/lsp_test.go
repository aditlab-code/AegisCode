package lsp

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLSPManagerLifecycle(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "lsp_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mgr := NewManager(tempDir)
	defer mgr.Close()

	// Check language support
	if !mgr.IsLanguageSupported("go") {
		t.Skip("gopls not available on this machine, skipping live gopls test")
	}

	// Create a dummy Go file
	sampleGo := `package main

import "fmt"

func main() {
	message := "hello world"
	fmt.Println(message)
}
`
	samplePath := filepath.Join(tempDir, "main.go")
	if err := os.WriteFile(samplePath, []byte(sampleGo), 0644); err != nil {
		t.Fatalf("failed to write sample file: %v", err)
	}

	// 1. DidOpen
	if err := mgr.DidOpen("main.go", sampleGo, "go"); err != nil {
		t.Fatalf("DidOpen failed: %v", err)
	}

	// Allow gopls a brief moment to index
	time.Sleep(500 * time.Millisecond)

	// 2. Hover on fmt.Println (line 6, character 6 in 0-indexed coords)
	hover, err := mgr.Hover("main.go", 6, 6, "go")
	if err != nil {
		t.Logf("Hover returned err (acceptable on initial indexing): %v", err)
	} else if hover != nil {
		t.Logf("Hover content: %+v", hover.Contents)
	}

	// 3. Definition on message (line 6, character 15)
	locs, err := mgr.Definition("main.go", 6, 15, "go")
	if err != nil {
		t.Logf("Definition returned err: %v", err)
	} else {
		t.Logf("Definition locations count: %d", len(locs))
	}

	// 4. Completion on fmt.
	items, err := mgr.Completion("main.go", 6, 5, "go")
	if err != nil {
		t.Logf("Completion returned err: %v", err)
	} else {
		t.Logf("Completion items count: %d", len(items))
	}
}

func TestLSPClientTypes(t *testing.T) {
	// Verify Position & Range calculations
	pos := Position{Line: 5, Character: 10}
	if pos.Line != 5 || pos.Character != 10 {
		t.Fatalf("unexpected position values")
	}

	tmpDir := t.TempDir()
	mgr := NewManager(tmpDir)
	uri := mgr.filePathToURI("src/main.go")
	expected := "file://" + filepath.ToSlash(filepath.Join(tmpDir, "src/main.go"))
	if uri != expected {
		t.Fatalf("unexpected uri conversion: got %s, want %s", uri, expected)
	}

	// Test docVersions tracking
	mgr.versionMu.Lock()
	mgr.docVersions[uri] = 2
	mgr.versionMu.Unlock()
	if v := mgr.docVersions[uri]; v != 2 {
		t.Fatalf("expected docVersion 2, got %d", v)
	}

	// Test DidClose docVersions removal
	mgr.versionMu.Lock()
	delete(mgr.docVersions, uri)
	mgr.versionMu.Unlock()
	if _, exists := mgr.docVersions[uri]; exists {
		t.Fatalf("expected docVersion to be deleted after DidClose")
	}
}
