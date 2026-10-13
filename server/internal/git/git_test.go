package git_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

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

func TestGitService_StaleLockRecovery(t *testing.T) {
	tempDir, _, svc := setupTestGitRepo(t)
	defer os.RemoveAll(tempDir)

	ctx := context.Background()

	testFile := filepath.Join(tempDir, "recover.txt")
	if err := os.WriteFile(testFile, []byte("data"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	// Create artificial stale index.lock file backdated by 5 seconds
	lockFile := filepath.Join(tempDir, ".git", "index.lock")
	if err := os.WriteFile(lockFile, []byte("artificial lock"), 0644); err != nil {
		t.Fatalf("failed to create lock file: %v", err)
	}
	oldTime := time.Now().Add(-5 * time.Second)
	_ = os.Chtimes(lockFile, oldTime, oldTime)

	// Stage should detect that index.lock is stale (>2s), remove it, and succeed!
	if err := svc.Stage(ctx, []string{"recover.txt"}, false); err != nil {
		t.Fatalf("expected Stage to recover from stale lock, but got error: %v", err)
	}

	// Lock should be gone
	if _, err := os.Stat(lockFile); !os.IsNotExist(err) {
		t.Errorf("expected lock file to be removed, but still exists")
	}

	st, err := svc.GetStatus(ctx)
	if err != nil || len(st.Staged) != 1 {
		t.Fatalf("expected file to be staged after auto-recovery, got %+v", st)
	}
}

func TestGitService_Unlock(t *testing.T) {
	tempDir, _, svc := setupTestGitRepo(t)
	defer os.RemoveAll(tempDir)

	ctx := context.Background()

	// Create artificial locks
	indexLock := filepath.Join(tempDir, ".git", "index.lock")
	headLock := filepath.Join(tempDir, ".git", "HEAD.lock")
	_ = os.WriteFile(indexLock, []byte("lock1"), 0644)
	_ = os.WriteFile(headLock, []byte("lock2"), 0644)

	res, err := svc.Unlock(ctx)
	if err != nil {
		t.Fatalf("Unlock returned error: %v", err)
	}
	if !res.Unlocked {
		t.Fatalf("expected Unlocked true, got false")
	}
	if len(res.Removed) < 2 {
		t.Fatalf("expected at least 2 removed locks, got %v", res.Removed)
	}

	if _, err := os.Stat(indexLock); !os.IsNotExist(err) {
		t.Errorf("index.lock still exists after Unlock")
	}
	if _, err := os.Stat(headLock); !os.IsNotExist(err) {
		t.Errorf("HEAD.lock still exists after Unlock")
	}

	// Second unlock when no locks exist
	res2, err := svc.Unlock(ctx)
	if err != nil {
		t.Fatalf("second Unlock returned error: %v", err)
	}
	if len(res2.Removed) != 0 {
		t.Errorf("expected 0 removed locks on clean repo, got %v", res2.Removed)
	}
}

func TestCompareCommits(t *testing.T) {
	tempDir, _, svc := setupTestGitRepo(t)
	ctx := context.Background()

	fileA := filepath.Join(tempDir, "fileA.txt")
	_ = os.WriteFile(fileA, []byte("version 1"), 0644)
	_ = svc.Stage(ctx, nil, true)
	c1, err := svc.Commit(ctx, "commit 1", false)
	if err != nil {
		t.Fatalf("commit 1 failed: %v", err)
	}

	_ = os.WriteFile(fileA, []byte("version 2"), 0644)
	fileB := filepath.Join(tempDir, "fileB.txt")
	_ = os.WriteFile(fileB, []byte("new file B"), 0644)
	_ = svc.Stage(ctx, nil, true)
	c2, err := svc.Commit(ctx, "commit 2", false)
	if err != nil {
		t.Fatalf("commit 2 failed: %v", err)
	}

	cmp, err := svc.CompareCommits(ctx, c1.Hash, c2.Hash)
	if err != nil {
		t.Fatalf("CompareCommits failed: %v", err)
	}
	if cmp.TotalChanges != 2 {
		t.Fatalf("expected 2 changes, got %d", cmp.TotalChanges)
	}

	diffRes, err := svc.GetDiff(ctx, "fileA.txt", false, c2.Hash, c1.Hash)
	if err != nil {
		t.Fatalf("GetDiff between commits failed: %v", err)
	}
	if diffRes.Original != "version 1" || diffRes.Modified != "version 2" {
		t.Fatalf("expected diff original 'version 1' and modified 'version 2', got %q and %q", diffRes.Original, diffRes.Modified)
	}
}

