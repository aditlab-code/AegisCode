package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestWatcher_BasicLifecycleAndFilter(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "aegis-watcher-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	w, err := NewWatcher(tmpDir)
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Stop()

	// Shorten debounce for fast testing
	w.debounceDuration = 50 * time.Millisecond

	events, unsub := w.Subscribe()
	defer unsub()

	// 1. Create ignored folder and file
	ignoredDir := filepath.Join(tmpDir, "node_modules")
	if err := os.Mkdir(ignoredDir, 0755); err != nil {
		t.Fatalf("failed to create ignored dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(ignoredDir, "pkg.json"), []byte("{}"), 0644); err != nil {
		t.Fatalf("failed to write ignored file: %v", err)
	}

	// 2. Create valid file
	validFile := filepath.Join(tmpDir, "main.go")
	if err := os.WriteFile(validFile, []byte("package main"), 0644); err != nil {
		t.Fatalf("failed to write valid file: %v", err)
	}

	select {
	case evt := <-events:
		foundValid := false
		for _, c := range evt.Created {
			if c == "main.go" {
				foundValid = true
			}
			if c == "node_modules" || filepath.Base(c) == "pkg.json" {
				t.Fatalf("received event for ignored path: %s", c)
			}
		}
		if !foundValid {
			// In some OSes, creation or initial write may show up in modified
			foundModified := false
			for _, m := range evt.Modified {
				if m == "main.go" {
					foundModified = true
				}
			}
			if !foundModified {
				t.Fatalf("expected main.go in created or modified, got %+v", evt)
			}
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for workspace event")
	}
}

func TestWatcher_DynamicSubdirectoryRegistration(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "aegis-watcher-sub-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	w, err := NewWatcher(tmpDir)
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Stop()
	w.debounceDuration = 50 * time.Millisecond

	events, unsub := w.Subscribe()
	defer unsub()

	// Create dynamic subfolder
	subDir := filepath.Join(tmpDir, "pkg", "utils")
	if err := os.MkdirAll(subDir, 0755); err != nil {
		t.Fatalf("failed to create subDir: %v", err)
	}

	// Allow dynamic watcher registration to settle
	time.Sleep(100 * time.Millisecond)

	// Drain any folder create events
	select {
	case <-events:
	default:
	}

	// Write file in newly created subfolder
	nestedFile := filepath.Join(subDir, "helper.go")
	if err := os.WriteFile(nestedFile, []byte("package utils"), 0644); err != nil {
		t.Fatalf("failed to write nested file: %v", err)
	}

	select {
	case evt := <-events:
		found := false
		target := filepath.ToSlash(filepath.Join("pkg", "utils", "helper.go"))
		for _, c := range evt.Created {
			if c == target {
				found = true
				break
			}
		}
		for _, m := range evt.Modified {
			if m == target {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("expected nested file %s in event, got %+v", target, evt)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for nested file event")
	}
}

func TestWatcher_IgnoreNestedDirectoriesAndDotfiles(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "aegis-watcher-ignore-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	w, err := NewWatcher(tmpDir)
	if err != nil {
		t.Fatalf("NewWatcher failed: %v", err)
	}
	defer w.Stop()
	w.debounceDuration = 50 * time.Millisecond

	events, unsub := w.Subscribe()
	defer unsub()

	// Create nested structure in ignored folders
	scratchSub := filepath.Join(tmpDir, ".scratch", "feature", "issues")
	if err := os.MkdirAll(scratchSub, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(scratchSub, "spec.md"), []byte("# Spec"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create temp dotfiles and editor backups in root
	if err := os.WriteFile(filepath.Join(tmpDir, ".test.tmp"), []byte("tmp"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "backup.go~"), []byte("backup"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, ".#swapfile"), []byte("swap"), 0644); err != nil {
		t.Fatal(err)
	}

	// Create one valid file
	validFile := filepath.Join(tmpDir, "valid.go")
	if err := os.WriteFile(validFile, []byte("package main"), 0644); err != nil {
		t.Fatal(err)
	}

	select {
	case evt := <-events:
		for _, c := range evt.Created {
			if strings.Contains(c, ".scratch") || strings.Contains(c, ".tmp") || strings.Contains(c, "~") || strings.Contains(c, ".#") {
				t.Fatalf("unexpected ignored file in created: %s", c)
			}
		}
		for _, m := range evt.Modified {
			if strings.Contains(m, ".scratch") || strings.Contains(m, ".tmp") || strings.Contains(m, "~") || strings.Contains(m, ".#") {
				t.Fatalf("unexpected ignored file in modified: %s", m)
			}
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for event")
	}
}
