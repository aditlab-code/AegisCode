package workspace

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// GitIgnoreMatcher parses .gitignore patterns dynamically without hardcoding directory or file names.
type GitIgnoreMatcher struct {
	mu       sync.RWMutex
	patterns []string
}

// NewGitIgnoreMatcher initializes and loads .gitignore from root if present.
func NewGitIgnoreMatcher(root string) *GitIgnoreMatcher {
	m := &GitIgnoreMatcher{
		patterns: make([]string, 0),
	}
	m.Load(root)
	return m
}

// Load reads and parses .gitignore from the workspace root.
func (m *GitIgnoreMatcher) Load(root string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.patterns = make([]string, 0)
	if strings.TrimSpace(root) == "" {
		return
	}

	ignoreFile := filepath.Join(root, ".gitignore")
	f, err := os.Open(ignoreFile)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Normalize gitignore pattern
		line = strings.TrimPrefix(line, "/")
		line = strings.TrimSuffix(line, "/")
		if line != "" {
			m.patterns = append(m.patterns, filepath.ToSlash(line))
		}
	}
}

// ShouldIgnore evaluates if a path should be skipped based purely on:
// 1. Directory starting with "." (pure .* rule)
// 2. Patterns loaded from .gitignore
func (m *GitIgnoreMatcher) ShouldIgnore(relPath string, isDir bool) bool {
	// Rule 1: Pure .* directory rule (e.g. .git, .codegraph, .venv, .pytest_cache, .next, etc.)
	base := filepath.Base(relPath)
	if isDir && strings.HasPrefix(base, ".") {
		return true
	}

	cleanRel := filepath.ToSlash(filepath.Clean(relPath))
	if cleanRel == "." || cleanRel == "" {
		return false
	}

	m.mu.RLock()
	patterns := m.patterns
	m.mu.RUnlock()

	if len(patterns) == 0 {
		return false
	}

	parts := strings.Split(cleanRel, "/")

	// Rule 2: Pure .gitignore pattern matching
	for _, p := range patterns {
		// Exact segment match (e.g. "node_modules", "dist")
		for _, part := range parts {
			if part == p {
				return true
			}
			if matched, _ := filepath.Match(p, part); matched {
				return true
			}
		}

		// Path-level matching (e.g. "server/bin" or "src/generated")
		if cleanRel == p || strings.HasPrefix(cleanRel, p+"/") {
			return true
		}
		if matched, _ := filepath.Match(p, cleanRel); matched {
			return true
		}
	}

	return false
}
