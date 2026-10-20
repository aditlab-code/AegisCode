package latex

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRootResolver_MagicComment(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "latex-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Create main.tex
	mainPath := filepath.Join(tempDir, "main.tex")
	err = os.WriteFile(mainPath, []byte(`\documentclass{article}\begin{document}Hello\end{document}`), 0644)
	if err != nil {
		t.Fatal(err)
	}

	// Create chapters/ch1.tex with magic comment
	chapDir := filepath.Join(tempDir, "chapters")
	if err := os.MkdirAll(chapDir, 0755); err != nil {
		t.Fatal(err)
	}
	ch1Path := filepath.Join(chapDir, "ch1.tex")
	err = os.WriteFile(ch1Path, []byte("%! TeX root = ../main.tex\n\\section{Intro}\nText here"), 0644)
	if err != nil {
		t.Fatal(err)
	}

	resolver := NewRootResolver(tempDir)
	resolved, err := resolver.ResolveRoot(ch1Path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected, _ := filepath.EvalSymlinks(mainPath)
	actual, _ := filepath.EvalSymlinks(resolved)
	if actual != expected {
		t.Errorf("expected root %s, got %s", expected, actual)
	}
}

func TestRootResolver_ScanWorkspace(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "latex-test-scan-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	mainPath := filepath.Join(tempDir, "thesis.tex")
	_ = os.WriteFile(mainPath, []byte(`\documentclass{book}\begin{document}\input{chap}\end{document}`), 0644)

	subPath := filepath.Join(tempDir, "chap.tex")
	_ = os.WriteFile(subPath, []byte(`\chapter{One}`), 0644)

	resolver := NewRootResolver(tempDir)
	resolved, err := resolver.ResolveRoot(subPath)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected, _ := filepath.EvalSymlinks(mainPath)
	actual, _ := filepath.EvalSymlinks(resolved)
	if actual != expected {
		t.Errorf("expected root %s, got %s", expected, actual)
	}
}
