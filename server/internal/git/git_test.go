package git_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/aditwicaksono/aegiscode/server/internal/git"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

func setupTestGitRepo(t *testing.T) (string, *workspace.Manager, *git.Service) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "aegis-git-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	// Init git repo
	cmd := exec.Command("git", "init", "-b", "main")
	cmd.Dir = tempDir
	if err := cmd.Run(); err != nil {
		// Fallback for older git
		fallback := exec.Command("git", "init")
		fallback.Dir = tempDir
		_ = fallback.Run()
	}

	// Config test user
	_ = exec.Command("git", "-C", tempDir, "config", "user.name", "Test User").Run()
	_ = exec.Command("git", "-C", tempDir, "config", "user.email", "test@example.com").Run()

	ws, err := workspace.NewManager(tempDir)
	if err != nil {
		t.Fatalf("failed to create workspace: %v", err)
	}

	svc := git.NewService(ws)
	return tempDir, ws, svc
}

func TestGitService_StatusAndCommit(t *testing.T) {
	tempDir, _, svc := setupTestGitRepo(t)
	defer os.RemoveAll(tempDir)

	ctx := context.Background()

	// Initial check
	isRepo, err := svc.IsRepo(ctx)
	if err != nil || !isRepo {
		t.Fatalf("expected isRepo true, got %v (err: %v)", isRepo, err)
	}

	user := svc.GetUser(ctx)
	if user.Name != "Test User" || user.Email != "test@example.com" {
		t.Errorf("unexpected user: %+v", user)
	}

	// Create test file
	testFile := filepath.Join(tempDir, "hello.txt")
	if err := os.WriteFile(testFile, []byte("hello world\n"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// Check status
	st, err := svc.GetStatus(ctx)
	if err != nil {
		t.Fatalf("failed to get status: %v", err)
	}
	if len(st.Unstaged) != 1 {
		t.Fatalf("expected 1 unstaged file, got %d", len(st.Unstaged))
	}
	if st.Unstaged[0].File != "hello.txt" {
		t.Errorf("expected file hello.txt, got %s", st.Unstaged[0].File)
	}

	// Stage file
	if err := svc.Stage(ctx, []string{"hello.txt"}, false); err != nil {
		t.Fatalf("failed to stage: %v", err)
	}

	st, err = svc.GetStatus(ctx)
	if err != nil {
		t.Fatalf("failed to get status after stage: %v", err)
	}
	if len(st.Staged) != 1 {
		t.Fatalf("expected 1 staged file, got %d", len(st.Staged))
	}

	// Commit
	commit, err := svc.Commit(ctx, "feat: initial commit", false)
	if err != nil {
		t.Fatalf("failed to commit: %v", err)
	}
	if commit.Message != "feat: initial commit" {
		t.Errorf("unexpected commit message: %s", commit.Message)
	}

	// Verify log
	log, err := svc.GetLog(ctx, 10)
	if err != nil {
		t.Fatalf("failed to get log: %v", err)
	}
	if len(log) != 1 {
		t.Fatalf("expected 1 commit node, got %d", len(log))
	}

	// Verify timeline
	timeline, err := svc.GetTimeline(ctx, "hello.txt", 10)
	if err != nil {
		t.Fatalf("failed to get timeline: %v", err)
	}
	if len(timeline) != 1 {
		t.Fatalf("expected 1 timeline node, got %d", len(timeline))
	}
}

func TestGitService_BranchesAndTags(t *testing.T) {
	tempDir, _, svc := setupTestGitRepo(t)
	defer os.RemoveAll(tempDir)

	ctx := context.Background()

	// Create and commit a file first
	testFile := filepath.Join(tempDir, "file.txt")
	_ = os.WriteFile(testFile, []byte("content"), 0644)
	_ = svc.Stage(ctx, nil, true)
	_, _ = svc.Commit(ctx, "initial", false)

	// Create branch
	if err := svc.CreateBranch(ctx, "feature-test", true); err != nil {
		t.Fatalf("failed to create branch: %v", err)
	}

	branches, err := svc.GetBranches(ctx)
	if err != nil {
		t.Fatalf("failed to get branches: %v", err)
	}
	if len(branches) < 2 {
		t.Fatalf("expected at least 2 branches, got %d", len(branches))
	}

	// Create tag
	if err := svc.CreateTag(ctx, "v1.0.0", "Release 1.0.0"); err != nil {
		t.Fatalf("failed to create tag: %v", err)
	}

	tags, err := svc.GetTags(ctx)
	if err != nil {
		t.Fatalf("failed to get tags: %v", err)
	}
	if len(tags) != 1 || tags[0] != "v1.0.0" {
		t.Fatalf("expected tag v1.0.0, got %+v", tags)
	}
}

func TestGitService_InitAndAddRemote(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis-git-init-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	ws, err := workspace.NewManager(tempDir)
	if err != nil {
		t.Fatalf("failed to create workspace: %v", err)
	}
	svc := git.NewService(ws)
	ctx := context.Background()

	// 1. Verify not a repo initially
	isRepo, _ := svc.IsRepo(ctx)
	if isRepo {
		t.Fatalf("expected isRepo false before init")
	}

	// 2. Init repo
	if err := svc.Init(ctx); err != nil {
		t.Fatalf("failed to init repo: %v", err)
	}

	isRepoAfter, _ := svc.IsRepo(ctx)
	if !isRepoAfter {
		t.Fatalf("expected isRepo true after init")
	}

	// 3. Add remote
	if err := svc.AddRemote(ctx, "origin", "https://github.com/example/test.git"); err != nil {
		t.Fatalf("failed to add remote: %v", err)
	}
}

func TestGitService_Unstage(t *testing.T) {
	tempDir, _, svc := setupTestGitRepo(t)
	defer os.RemoveAll(tempDir)

	ctx := context.Background()

	// 1. Fresh repo without commits (no HEAD)
	fileA := filepath.Join(tempDir, "fileA.txt")
	fileB := filepath.Join(tempDir, "fileB.txt")
	_ = os.WriteFile(fileA, []byte("content A"), 0644)
	_ = os.WriteFile(fileB, []byte("content B"), 0644)

	// Stage both
	if err := svc.Stage(ctx, nil, true); err != nil {
		t.Fatalf("failed to stage all: %v", err)
	}
	st, err := svc.GetStatus(ctx)
	if err != nil || len(st.Staged) != 2 {
		t.Fatalf("expected 2 staged files, got %d (err: %v)", len(st.Staged), err)
	}

	// Unstage specific file without HEAD
	if err := svc.Unstage(ctx, []string{"fileA.txt"}, false); err != nil {
		t.Fatalf("failed to unstage fileA without HEAD: %v", err)
	}
	st, _ = svc.GetStatus(ctx)
	if len(st.Staged) != 1 || st.Staged[0].File != "fileB.txt" {
		t.Fatalf("expected 1 staged file (fileB.txt), got %+v", st.Staged)
	}

	// Unstage all remaining without HEAD
	if err := svc.Unstage(ctx, nil, true); err != nil {
		t.Fatalf("failed to unstage all without HEAD: %v", err)
	}
	st, _ = svc.GetStatus(ctx)
	if len(st.Staged) != 0 {
		t.Fatalf("expected 0 staged files, got %d", len(st.Staged))
	}

	// 2. Commit initial files so HEAD exists
	_ = svc.Stage(ctx, nil, true)
	if _, err := svc.Commit(ctx, "initial commit", false); err != nil {
		t.Fatalf("failed to commit: %v", err)
	}

	// Modify fileA and stage it
	_ = os.WriteFile(fileA, []byte("modified A"), 0644)
	if err := svc.Stage(ctx, []string{"fileA.txt"}, false); err != nil {
		t.Fatalf("failed to stage fileA with HEAD: %v", err)
	}
	st, _ = svc.GetStatus(ctx)
	if len(st.Staged) != 1 {
		t.Fatalf("expected 1 staged file with HEAD, got %d", len(st.Staged))
	}

	// Unstage fileA with HEAD
	if err := svc.Unstage(ctx, []string{"fileA.txt"}, false); err != nil {
		t.Fatalf("failed to unstage fileA with HEAD: %v", err)
	}
	st, _ = svc.GetStatus(ctx)
	if len(st.Staged) != 0 {
		t.Fatalf("expected 0 staged files after unstage with HEAD, got %d", len(st.Staged))
	}
}

