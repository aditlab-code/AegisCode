package workspace

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWorkspaceOperations(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ws-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mgr, err := NewManager(tempDir)
	if err != nil {
		t.Fatalf("failed to initialize manager: %v", err)
	}

	// 1. Write file (relative and with leading slash)
	if err := mgr.WriteFile("test.txt", "hello aegis world\nsecond line"); err != nil {
		t.Fatalf("failed to write file: %v", err)
	}
	if err := mgr.WriteFile("/leading_slash.txt", "content from slash path"); err != nil {
		t.Fatalf("failed to write file with leading slash: %v", err)
	}

	// 2. Read file
	content, err := mgr.GetFile("test.txt")
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}
	if content != "hello aegis world\nsecond line" {
		t.Fatalf("unexpected content: %s", content)
	}
	slashContent, err := mgr.GetFile("/leading_slash.txt")
	if err != nil {
		t.Fatalf("failed to read file with leading slash: %v", err)
	}
	if slashContent != "content from slash path" {
		t.Fatalf("unexpected slash content: %s", slashContent)
	}
	if err := mgr.DeleteFile("/leading_slash.txt"); err != nil {
		t.Fatalf("failed to delete file with leading slash: %v", err)
	}

	// 3. Create folder and containment verification
	createdPath, err := mgr.CreateFolder("subfolder")
	if err != nil {
		t.Fatalf("failed to create folder: %v", err)
	}
	if createdPath != filepath.Join(tempDir, "subfolder") {
		t.Fatalf("unexpected created folder path: %s", createdPath)
	}

	// Escape attempt must fail
	if _, err := mgr.CreateFolder("../../outside"); err == nil {
		t.Fatalf("expected error when folder escapes root, got nil")
	}
	if _, err := mgr.CreateFolder(""); err == nil {
		t.Fatalf("expected error for empty folder path, got nil")
	}
	newPath, err := mgr.Move("test.txt", "subfolder")
	if err != nil {
		t.Fatalf("failed to move file: %v", err)
	}
	if newPath != filepath.Join("subfolder", "test.txt") {
		t.Fatalf("unexpected new path: %s", newPath)
	}

	// 4. Tree verification
	tree, err := mgr.GetTree(4, false)
	if err != nil {
		t.Fatalf("failed to get tree: %v", err)
	}
	if len(tree) != 1 || tree[0].Name != "subfolder" || len(tree[0].Children) != 1 {
		t.Fatalf("unexpected tree structure: %+v", tree)
	}

	// 5. Search
	results, err := mgr.Search("aegis", false, false, false)
	if err != nil {
		t.Fatalf("failed to search: %v", err)
	}
	if len(results) != 1 || len(results[0].Matches) != 1 {
		t.Fatalf("unexpected search results: %+v", results)
	}

	// 6. Replace All
	count, modified, err := mgr.ReplaceAll("aegis", "code", false, false, false)
	if err != nil {
		t.Fatalf("failed to replace: %v", err)
	}
	if count != 1 || len(modified) != 1 {
		t.Fatalf("unexpected replace result: count=%d, modified=%v", count, modified)
	}

	replacedContent, err := mgr.GetFile("subfolder/test.txt")
	if err != nil {
		t.Fatalf("failed to read replaced file: %v", err)
	}
	if replacedContent != "hello code world\nsecond line" {
		t.Fatalf("unexpected replaced content: %s", replacedContent)
	}

	// 7. Delete file
	if err := mgr.DeleteFile("subfolder/test.txt"); err != nil {
		t.Fatalf("failed to delete file: %v", err)
	}
	_, err = mgr.GetFile("subfolder/test.txt")
	if err == nil {
		t.Fatalf("expected error reading deleted file, got nil")
	}
}

func TestWorkspaceClose(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ws-close-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mgr, err := NewManager(tempDir)
	if err != nil {
		t.Fatalf("failed to initialize manager: %v", err)
	}

	rootPath, _ := mgr.GetRoot()
	if rootPath == "" {
		t.Fatalf("expected non-empty root path before close")
	}

	if err := mgr.Close(); err != nil {
		t.Fatalf("failed to close workspace: %v", err)
	}

	closedPath, closedName := mgr.GetRoot()
	if closedPath != "" || closedName != "" {
		t.Fatalf("expected empty root after close, got path='%s', name='%s'", closedPath, closedName)
	}

	tree, err := mgr.GetTree(4, false)
	if err != nil {
		t.Fatalf("expected nil error for empty tree, got: %v", err)
	}
	if len(tree) != 0 {
		t.Fatalf("expected empty tree, got: %d", len(tree))
	}
}

func TestGetGitStatus(t *testing.T) {
	// Case 1: Empty / closed manager
	emptyMgr := &Manager{rootPath: ""}
	status, err := emptyMgr.GetGitStatus()
	if err != nil {
		t.Fatalf("unexpected error for empty manager: %v", err)
	}
	if status.IsRepo {
		t.Fatalf("expected isRepo false for empty manager, got true")
	}

	// Case 2: Non-repo workspace
	tempDir, err := os.MkdirTemp("", "ws-git-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mgr, err := NewManager(tempDir)
	if err != nil {
		t.Fatalf("failed to initialize manager: %v", err)
	}

	status, err = mgr.GetGitStatus()
	if err != nil {
		t.Fatalf("unexpected error for non-repo: %v", err)
	}
	if status.IsRepo {
		t.Fatalf("expected isRepo false, got true")
	}
	if status.RepoName != filepath.Base(tempDir) {
		t.Fatalf("expected repoName '%s', got '%s'", filepath.Base(tempDir), status.RepoName)
	}

	// Case 3: Repo with branch ref
	gitDir := filepath.Join(tempDir, ".git")
	if err := os.Mkdir(gitDir, 0755); err != nil {
		t.Fatalf("failed to create .git: %v", err)
	}
	headFile := filepath.Join(gitDir, "HEAD")
	if err := os.WriteFile(headFile, []byte("ref: refs/heads/main\n"), 0644); err != nil {
		t.Fatalf("failed to write HEAD: %v", err)
	}

	status, err = mgr.GetGitStatus()
	if err != nil {
		t.Fatalf("unexpected error for git repo: %v", err)
	}
	if !status.IsRepo {
		t.Fatalf("expected isRepo true, got false")
	}
	if status.Branch != "main" {
		t.Fatalf("expected branch 'main', got '%s'", status.Branch)
	}

	// Case 4: Detached HEAD
	if err := os.WriteFile(headFile, []byte("1234567890abcdef\n"), 0644); err != nil {
		t.Fatalf("failed to update HEAD: %v", err)
	}
	status, err = mgr.GetGitStatus()
	if err != nil {
		t.Fatalf("unexpected error for detached HEAD: %v", err)
	}
	if status.Branch != "1234567" {
		t.Fatalf("expected branch '1234567', got '%s'", status.Branch)
	}

	// Case 5: Workspace closed
	if err := mgr.Close(); err != nil {
		t.Fatalf("failed to close manager: %v", err)
	}
	status, err = mgr.GetGitStatus()
	if err != nil {
		t.Fatalf("unexpected error after close: %v", err)
	}
	if status.IsRepo {
		t.Fatalf("expected isRepo false after close, got true")
	}
}

func TestPathBoundarySecurity(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "ws-boundary-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mgr, err := NewManager(tempDir)
	if err != nil {
		t.Fatalf("failed to initialize manager: %v", err)
	}

	traversalCases := []string{
		"../../outside.txt",
		"sub/../../outside.txt",
		"/etc/passwd",
		"../" + filepath.Base(tempDir) + "-evil/file.txt",
	}

	for _, tc := range traversalCases {
		if err := mgr.WriteFile(tc, "malicious payload"); err == nil {
			t.Fatalf("expected error for traversal path '%s', got nil", tc)
		}
		if _, err := mgr.GetFile(tc); err == nil {
			t.Fatalf("expected error for reading traversal path '%s', got nil", tc)
		}
		if err := mgr.DeleteFile(tc); err == nil {
			t.Fatalf("expected error for deleting traversal path '%s', got nil", tc)
		}
	}
}
