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
	if err := mgr.WriteFile("test.txt", "hello aegis world\nsecond line", false); err != nil {
		t.Fatalf("failed to write file: %v", err)
	}
	if err := mgr.WriteFile("/leading_slash.txt", "content from slash path", false); err != nil {
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

	// 3. Create folder and move
	if err := mgr.WriteFile("subfolder", "", true); err != nil {
		t.Fatalf("failed to create folder: %v", err)
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

func TestBrowseDirectory(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "browse-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	if err := os.Mkdir(filepath.Join(tempDir, "visible_dir"), 0755); err != nil {
		t.Fatalf("failed to create dir: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tempDir, ".hidden_dir"), 0755); err != nil {
		t.Fatalf("failed to create hidden dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "file.txt"), []byte("hi"), 0644); err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	// 1. Browse without hidden
	res, err := BrowseDirectory(tempDir, false)
	if err != nil {
		t.Fatalf("BrowseDirectory failed: %v", err)
	}
	if len(res.Directories) != 1 || res.Directories[0].Name != "visible_dir" {
		t.Fatalf("expected 1 visible dir, got: %+v", res.Directories)
	}

	// 2. Browse with hidden
	resHidden, err := BrowseDirectory(tempDir, true)
	if err != nil {
		t.Fatalf("BrowseDirectory with hidden failed: %v", err)
	}
	if len(resHidden.Directories) != 2 {
		t.Fatalf("expected 2 directories with hidden, got: %d", len(resHidden.Directories))
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
