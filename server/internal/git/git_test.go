package git

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectRepo(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "git-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Case 1: Non-repo
	status, err := DetectRepo(tempDir)
	if err != nil {
		t.Fatalf("unexpected error for non-repo: %v", err)
	}
	if status.IsRepo {
		t.Fatalf("expected isRepo false, got true")
	}

	// Case 2: Fake git repo with HEAD
	gitDir := filepath.Join(tempDir, ".git")
	if err := os.Mkdir(gitDir, 0755); err != nil {
		t.Fatalf("failed to create .git: %v", err)
	}
	headFile := filepath.Join(gitDir, "HEAD")
	if err := os.WriteFile(headFile, []byte("ref: refs/heads/main\n"), 0644); err != nil {
		t.Fatalf("failed to write HEAD: %v", err)
	}

	status, err = DetectRepo(tempDir)
	if err != nil {
		t.Fatalf("unexpected error for repo: %v", err)
	}
	if !status.IsRepo {
		t.Fatalf("expected isRepo true, got false")
	}
	if status.Branch != "main" {
		t.Fatalf("expected branch 'main', got '%s'", status.Branch)
	}
}
