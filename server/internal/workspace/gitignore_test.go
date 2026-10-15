package workspace

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestGitIgnoreMatcher_PureDotAndGitIgnore(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis-gitignore-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create .gitignore
	gitignoreContent := `
# Comment
node_modules/
dist/
custom_build/
*.log
`
	if err := os.WriteFile(filepath.Join(tempDir, ".gitignore"), []byte(gitignoreContent), 0644); err != nil {
		t.Fatalf("failed to write .gitignore: %v", err)
	}

	matcher := NewGitIgnoreMatcher(tempDir)

	// 1. Pure .* directory tests (Must be ignored)
	dotDirs := []string{".git", ".venv", ".pytest_cache", ".codegraph", ".next", ".custom_random_folder"}
	for _, d := range dotDirs {
		if !matcher.ShouldIgnore(d, true) {
			t.Errorf("expected directory '%s' to be ignored by pure .* rule", d)
		}
	}

	// 2. Pure .* file tests (Files starting with . should NOT be ignored unless in .gitignore)
	if matcher.ShouldIgnore(".env", false) {
		t.Errorf("expected file '.env' not to be ignored as it is a file and not in .gitignore")
	}

	// 3. .gitignore pattern matches
	if !matcher.ShouldIgnore("node_modules", true) {
		t.Errorf("expected 'node_modules' to be ignored via .gitignore")
	}
	if !matcher.ShouldIgnore("sub/node_modules/pkg", true) {
		t.Errorf("expected 'sub/node_modules/pkg' to be ignored via .gitignore")
	}
	if !matcher.ShouldIgnore("custom_build", true) {
		t.Errorf("expected 'custom_build' to be ignored via .gitignore")
	}
	if !matcher.ShouldIgnore("error.log", false) {
		t.Errorf("expected 'error.log' to be ignored via .gitignore wildcard")
	}

	// 4. Allowed files/dirs
	if matcher.ShouldIgnore("src/main.go", false) {
		t.Errorf("expected 'src/main.go' NOT to be ignored")
	}
	if matcher.ShouldIgnore("src", true) {
		t.Errorf("expected 'src' NOT to be ignored")
	}

	// 5. Anti-lock concurrency test
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				_ = matcher.ShouldIgnore("src/main.go", false)
				_ = matcher.ShouldIgnore(".random", true)
			}
		}()
	}
	wg.Wait()
}
