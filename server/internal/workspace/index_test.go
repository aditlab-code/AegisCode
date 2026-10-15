package workspace

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestScoreFuzzy(t *testing.T) {
	file1 := IndexedFile{
		Path:      "src/components/layout/editor/viewers/CsvViewer.tsx",
		LowerPath: "src/components/layout/editor/viewers/csvviewer.tsx",
		BaseName:  "CsvViewer.tsx",
	}

	file2 := IndexedFile{
		Path:      "src/utils/workspaceApi.ts",
		LowerPath: "src/utils/workspaceapi.ts",
		BaseName:  "workspaceApi.ts",
	}

	score1, _ := ScoreFuzzy(file1, "csvw", "csvw")
	if score1 <= 0 {
		t.Fatalf("expected positive score for csvw on CsvViewer.tsx, got %d", score1)
	}

	score2, _ := ScoreFuzzy(file2, "wapi", "wapi")
	if score2 <= 0 {
		t.Fatalf("expected positive score for wapi on workspaceApi.ts, got %d", score2)
	}

	scoreNoMatch, _ := ScoreFuzzy(file2, "csvw", "csvw")
	if scoreNoMatch != 0 {
		t.Fatalf("expected 0 for csvw on workspaceApi.ts, got %d", scoreNoMatch)
	}
}

func TestWorkspaceIndex_CRUD(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis_idx_test_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Create test files
	_ = os.MkdirAll(filepath.Join(tempDir, "src", "editor"), 0755)
	fileA := filepath.Join(tempDir, "src", "editor", "Editor.tsx")
	fileB := filepath.Join(tempDir, "src", "editor", "Minimap.tsx")
	_ = os.WriteFile(fileA, []byte("// editor"), 0644)
	_ = os.WriteFile(fileB, []byte("// minimap"), 0644)

	idx := NewWorkspaceIndex(tempDir)
	stats := idx.Stats()
	if stats.TotalFiles != 2 {
		t.Fatalf("expected 2 files indexed, got %d", stats.TotalFiles)
	}

	matches := idx.FuzzyFind("mini", 10)
	if len(matches) != 1 || matches[0].Path != "src/editor/Minimap.tsx" {
		t.Fatalf("unexpected fuzzy matches: %+v", matches)
	}

	// Test Invalidate on Created
	fileC := filepath.Join(tempDir, "src", "editor", "Toolbar.tsx")
	_ = os.WriteFile(fileC, []byte("// toolbar"), 0644)
	idx.Invalidate(WorkspaceChangeEvent{
		Created: []string{fileC},
	})
	if idx.Stats().TotalFiles != 3 {
		t.Fatalf("expected 3 files after creation, got %d", idx.Stats().TotalFiles)
	}

	// Test Invalidate on Deleted
	_ = os.Remove(fileA)
	idx.Invalidate(WorkspaceChangeEvent{
		Deleted: []string{fileA},
	})
	if idx.Stats().TotalFiles != 2 {
		t.Fatalf("expected 2 files after deletion, got %d", idx.Stats().TotalFiles)
	}
}

func BenchmarkWorkspaceIndex_FuzzyFind50k(b *testing.B) {
	// Synthesize 50,000 files
	files := make([]IndexedFile, 50000)
	for i := 0; i < 50000; i++ {
		p := fmt.Sprintf("src/pkg%d/submodule%d/Component_%d.tsx", i%50, i%100, i)
		files[i] = IndexedFile{
			Path:      p,
			LowerPath: p,
			BaseName:  fmt.Sprintf("Component_%d.tsx", i),
			Ext:       ".tsx",
		}
	}

	idx := &WorkspaceIndex{
		files:       files,
		filesByPath: make(map[string]int),
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		res := idx.FuzzyFind("comp42", 20)
		if len(res) == 0 {
			b.Fatalf("expected matches for comp42")
		}
	}
}

func TestWorkspaceIndex_StatsStatus(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis_idx_status_*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	idx := NewWorkspaceIndex(tempDir)
	stats := idx.Stats()
	if stats.Status != "ready" {
		t.Fatalf("expected status 'ready', got %q", stats.Status)
	}
}

