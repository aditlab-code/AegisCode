package platform

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestStubFolderPicker(t *testing.T) {
	picker := &StubFolderPicker{
		Path:      "/test/folder",
		Cancelled: false,
		Err:       nil,
	}

	path, cancelled, err := picker.PickFolder(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cancelled {
		t.Fatalf("expected cancelled false")
	}
	if path != "/test/folder" {
		t.Fatalf("expected /test/folder, got %s", path)
	}

	// Cancelled case
	cancelPicker := &StubFolderPicker{Cancelled: true}
	_, cancelled, _ = cancelPicker.PickFolder(context.Background())
	if !cancelled {
		t.Fatalf("expected cancelled true")
	}

	// Error case
	errPicker := &StubFolderPicker{Err: errors.New("picker failure")}
	_, _, err = errPicker.PickFolder(context.Background())
	if err == nil || err.Error() != "picker failure" {
		t.Fatalf("expected picker failure error")
	}
}

func TestBrowseDirectory(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "platform-browse-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	if err := os.Mkdir(filepath.Join(tempDir, "alpha"), 0755); err != nil {
		t.Fatalf("failed to create dir: %v", err)
	}
	if err := os.Mkdir(filepath.Join(tempDir, ".beta_hidden"), 0755); err != nil {
		t.Fatalf("failed to create hidden dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, "file.txt"), []byte("data"), 0644); err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	// 1. Without hidden
	res, err := BrowseDirectory(tempDir, false)
	if err != nil {
		t.Fatalf("BrowseDirectory failed: %v", err)
	}
	if len(res.Directories) != 1 || res.Directories[0].Name != "alpha" {
		t.Fatalf("expected 1 visible dir 'alpha', got: %+v", res.Directories)
	}

	// 2. With hidden
	resHidden, err := BrowseDirectory(tempDir, true)
	if err != nil {
		t.Fatalf("BrowseDirectory with hidden failed: %v", err)
	}
	if len(resHidden.Directories) != 2 {
		t.Fatalf("expected 2 directories with hidden, got: %d", len(resHidden.Directories))
	}
}
