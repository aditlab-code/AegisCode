package workspace

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
)

type DirectoryItem struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type DirectoryBrowseResult struct {
	CurrentPath string          `json:"currentPath"`
	ParentPath  string          `json:"parentPath"`
	HomePath    string          `json:"homePath"`
	RootPath    string          `json:"rootPath"`
	Directories []DirectoryItem `json:"directories"`
}

type FileNode struct {
	Path     string     `json:"path"`
	Name     string     `json:"name"`
	Type     string     `json:"type"` // "file" | "folder"
	Depth    int        `json:"depth"`
	Children []FileNode `json:"children,omitempty"`
}

type SearchMatch struct {
	LineNumber  int    `json:"lineNumber"`
	Column      int    `json:"column"`
	LineContent string `json:"lineContent"`
	MatchText   string `json:"matchText"`
}

type SearchResult struct {
	Filename string        `json:"filename"`
	Matches  []SearchMatch `json:"matches"`
}

type Manager struct {
	mu       sync.RWMutex
	rootPath string
}

func NewManager(initialRoot string) (*Manager, error) {
	if strings.TrimSpace(initialRoot) == "" {
		return &Manager{rootPath: ""}, nil
	}

	cleanPath := filepath.Clean(strings.TrimSpace(initialRoot))
	absPath, err := filepath.Abs(cleanPath)
	if err != nil {
		return nil, err
	}

	stat, err := os.Stat(absPath)
	if err != nil {
		return nil, err
	}
	if !stat.IsDir() {
		return nil, fmt.Errorf("root path '%s' is not a directory", absPath)
	}

	return &Manager{rootPath: absPath}, nil
}

func (m *Manager) SetRoot(newRoot string) (string, error) {
	trimmed := strings.TrimSpace(newRoot)
	if trimmed == "" {
		return "", errors.New("empty root path provided")
	}

	cleanPath := filepath.Clean(trimmed)
	absPath, err := filepath.Abs(cleanPath)
	if err != nil {
		return "", err
	}

	stat, err := os.Stat(absPath)
	if err != nil {
		return "", err
	}
	if !stat.IsDir() {
		return "", fmt.Errorf("path '%s' is not a directory", absPath)
	}

	m.mu.Lock()
	m.rootPath = absPath
	m.mu.Unlock()

	return absPath, nil
}

func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rootPath = ""
	return nil
}

func (m *Manager) GetRoot() (string, string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.rootPath == "" {
		return "", ""
	}
	return m.rootPath, filepath.Base(m.rootPath)
}

func (m *Manager) resolvePath(relPath string) (string, error) {
	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	if root == "" {
		return "", errors.New("no active workspace root")
	}

	cleaned := filepath.Clean(relPath)
	if filepath.IsAbs(cleaned) && strings.HasPrefix(cleaned, root) {
		return cleaned, nil
	}

	// Strip leading slashes so workspace-relative paths like "/App.tsx" resolve inside root
	rel := strings.TrimPrefix(cleaned, "/")
	rel = strings.TrimPrefix(rel, "\\")

	target := filepath.Join(root, rel)
	if !strings.HasPrefix(target, root) {
		return "", fmt.Errorf("path '%s' escapes root directory '%s'", relPath, root)
	}
	return target, nil
}

func (m *Manager) GetTree(maxDepth int, showHidden bool) ([]FileNode, error) {
	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	if root == "" {
		return []FileNode{}, nil
	}

	if maxDepth <= 0 {
		maxDepth = 8
	}

	return m.buildSubTree(root, 0, maxDepth, showHidden)
}

func (m *Manager) buildSubTree(dirPath string, currentDepth int, maxDepth int, showHidden bool) ([]FileNode, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	nodes := make([]FileNode, 0, len(entries))

	for _, entry := range entries {
		name := entry.Name()

		// Ignore version control internals and large dependencies by default
		if name == ".git" || name == "node_modules" {
			continue
		}
		if !showHidden && strings.HasPrefix(name, ".") {
			continue
		}

		fullPath := filepath.Join(dirPath, name)
		relPath, err := filepath.Rel(root, fullPath)
		if err != nil {
			return nil, err
		}

		isDir := entry.IsDir()
		node := FileNode{
			Path:  relPath,
			Name:  name,
			Type:  "file",
			Depth: currentDepth,
		}

		if isDir {
			node.Type = "folder"
			if currentDepth < maxDepth {
				children, err := m.buildSubTree(fullPath, currentDepth+1, maxDepth, showHidden)
				if err != nil {
					return nil, err
				}
				node.Children = children
			}
		}

		nodes = append(nodes, node)
	}

	return nodes, nil
}

func (m *Manager) GetFile(relPath string) (string, error) {
	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return "", err
	}

	stat, err := os.Stat(fullPath)
	if err != nil {
		return "", err
	}
	if stat.IsDir() {
		return "", fmt.Errorf("path '%s' is a directory, not a file", relPath)
	}

	bytes, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return string(bytes), nil
}

func (m *Manager) WriteFile(relPath string, content string, isFolder bool) error {
	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return err
	}

	if isFolder {
		return os.MkdirAll(fullPath, 0755)
	}

	parentDir := filepath.Dir(fullPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return err
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

func (m *Manager) DeleteFile(relPath string) error {
	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return err
	}

	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	if fullPath == root {
		return errors.New("cannot delete workspace root directory")
	}

	return os.RemoveAll(fullPath)
}

func (m *Manager) Rename(oldRelPath string, newRelPath string) error {
	oldFullPath, err := m.resolvePath(oldRelPath)
	if err != nil {
		return err
	}

	newFullPath, err := m.resolvePath(newRelPath)
	if err != nil {
		return err
	}

	newParent := filepath.Dir(newFullPath)
	if err := os.MkdirAll(newParent, 0755); err != nil {
		return err
	}

	return os.Rename(oldFullPath, newFullPath)
}

func (m *Manager) Move(sourceRelPath string, targetDirRelPath string) (string, error) {
	sourceFullPath, err := m.resolvePath(sourceRelPath)
	if err != nil {
		return "", err
	}

	targetDirFullPath, err := m.resolvePath(targetDirRelPath)
	if err != nil {
		return "", err
	}

	targetStat, err := os.Stat(targetDirFullPath)
	if err != nil {
		return "", err
	}
	if !targetStat.IsDir() {
		return "", fmt.Errorf("target '%s' is not a directory", targetDirRelPath)
	}

	baseName := filepath.Base(sourceFullPath)
	newFullPath := filepath.Join(targetDirFullPath, baseName)

	if err := os.Rename(sourceFullPath, newFullPath); err != nil {
		return "", err
	}

	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	return filepath.Rel(root, newFullPath)
}

func (m *Manager) Search(query string, isRegex bool, isMatchCase bool, isWholeWord bool) ([]SearchResult, error) {
	if strings.TrimSpace(query) == "" {
		return []SearchResult{}, nil
	}

	var pattern *regexp.Regexp
	var err error

	patternStr := query
	if !isRegex {
		patternStr = regexp.QuoteMeta(query)
	}
	if isWholeWord {
		patternStr = `\b` + patternStr + `\b`
	}
	if !isMatchCase {
		patternStr = "(?i)" + patternStr
	}

	pattern, err = regexp.Compile(patternStr)
	if err != nil {
		return nil, fmt.Errorf("invalid search pattern: %w", err)
	}

	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	results := make([]SearchResult, 0)

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "node_modules" || name == "dist" {
				return filepath.SkipDir
			}
			return nil
		}

		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}

		// Read file text
		data, err := os.ReadFile(path)
		if err != nil {
			return nil // Skip unreadable/binary files
		}

		// Skip binary files (check for null bytes)
		if len(data) > 512 {
			for _, b := range data[:512] {
				if b == 0 {
					return nil
				}
			}
		}

		lines := strings.Split(string(data), "\n")
		matches := make([]SearchMatch, 0)

		for lineIdx, line := range lines {
			lineNum := lineIdx + 1
			locs := pattern.FindAllStringIndex(line, -1)
			for _, loc := range locs {
				startCol := loc[0] + 1
				matchText := line[loc[0]:loc[1]]
				matches = append(matches, SearchMatch{
					LineNumber:  lineNum,
					Column:      startCol,
					LineContent: line,
					MatchText:   matchText,
				})
			}
		}

		if len(matches) > 0 {
			results = append(results, SearchResult{
				Filename: relPath,
				Matches:  matches,
			})
		}

		return nil
	})

	if walkErr != nil {
		return nil, walkErr
	}

	return results, nil
}

func (m *Manager) ReplaceAll(query string, replacement string, isRegex bool, isMatchCase bool, isWholeWord bool) (int, []string, error) {
	if strings.TrimSpace(query) == "" {
		return 0, nil, errors.New("search query cannot be empty")
	}

	patternStr := query
	if !isRegex {
		patternStr = regexp.QuoteMeta(query)
	}
	if isWholeWord {
		patternStr = `\b` + patternStr + `\b`
	}
	if !isMatchCase {
		patternStr = "(?i)" + patternStr
	}

	pattern, err := regexp.Compile(patternStr)
	if err != nil {
		return 0, nil, fmt.Errorf("invalid search pattern: %w", err)
	}

	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	totalReplacements := 0
	modifiedFiles := make([]string, 0)

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			name := d.Name()
			if name == ".git" || name == "node_modules" || name == "dist" {
				return filepath.SkipDir
			}
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}

		// Skip binary
		if len(data) > 512 {
			for _, b := range data[:512] {
				if b == 0 {
					return nil
				}
			}
		}

		content := string(data)
		matches := pattern.FindAllStringIndex(content, -1)
		if len(matches) == 0 {
			return nil
		}

		newContent := pattern.ReplaceAllString(content, replacement)
		if err := os.WriteFile(path, []byte(newContent), 0644); err != nil {
			return err
		}

		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}

		totalReplacements += len(matches)
		modifiedFiles = append(modifiedFiles, relPath)
		return nil
	})

	if walkErr != nil {
		return 0, nil, walkErr
	}

	return totalReplacements, modifiedFiles, nil
}

// BrowseDirectory lists subdirectories at dirPath. If dirPath is empty, defaults to the user's home directory.
func BrowseDirectory(dirPath string, showHidden bool) (*DirectoryBrowseResult, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "/"
	}

	target := dirPath
	if target == "" {
		target = homeDir
	}

	absTarget, err := filepath.Abs(target)
	if err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	stat, err := os.Stat(absTarget)
	if err != nil {
		return nil, fmt.Errorf("path does not exist: %w", err)
	}
	if !stat.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", absTarget)
	}

	entries, err := os.ReadDir(absTarget)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	parentPath := filepath.Dir(absTarget)
	if parentPath == absTarget {
		parentPath = ""
	}

	dirs := make([]DirectoryItem, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !showHidden && strings.HasPrefix(name, ".") {
			continue
		}
		dirs = append(dirs, DirectoryItem{
			Name: name,
			Path: filepath.Join(absTarget, name),
		})
	}

	return &DirectoryBrowseResult{
		CurrentPath: absTarget,
		ParentPath:  parentPath,
		HomePath:    homeDir,
		RootPath:    string(filepath.Separator),
		Directories: dirs,
	}, nil
}

// PickFolderNative opens the native OS directory picker dialog (Finder on macOS, File Explorer on Windows, zenity/kdialog on Linux).
func PickFolderNative(ctx context.Context) (string, bool, error) {
	switch runtime.GOOS {
	case "darwin":
		cmd := exec.CommandContext(ctx, "osascript", "-e", `POSIX path of (choose folder with prompt "Select Project Folder:")`)
		out, err := cmd.Output()
		if err != nil {
			var exitErr *exec.ExitError
			if errors.As(err, &exitErr) {
				combined := strings.ToLower(string(exitErr.Stderr) + " " + err.Error())
				if strings.Contains(combined, "user canceled") || strings.Contains(combined, "canceled") || exitErr.ExitCode() == 1 {
					return "", true, nil
				}
			}
			return "", false, fmt.Errorf("osascript dialog failed: %w", err)
		}
		chosen := strings.TrimSpace(string(out))
		if chosen == "" {
			return "", true, nil
		}
		return filepath.Clean(chosen), false, nil

	case "windows":
		psScript := `[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Project Folder'; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath } else { Write-Output 'CANCELLED' }`
		cmd := exec.CommandContext(ctx, "powershell", "-NoProfile", "-NonInteractive", "-Command", psScript)
		out, err := cmd.Output()
		if err != nil {
			return "", false, fmt.Errorf("powershell dialog failed: %w", err)
		}
		chosen := strings.TrimSpace(string(out))
		if chosen == "" || chosen == "CANCELLED" {
			return "", true, nil
		}
		return filepath.Clean(chosen), false, nil

	case "linux":
		if _, lookErr := exec.LookPath("zenity"); lookErr == nil {
			cmd := exec.CommandContext(ctx, "zenity", "--file-selection", "--directory", "--title=Select Project Folder")
			out, err := cmd.Output()
			if err != nil {
				return "", true, nil
			}
			chosen := strings.TrimSpace(string(out))
			if chosen == "" {
				return "", true, nil
			}
			return filepath.Clean(chosen), false, nil
		}
		if _, lookErr := exec.LookPath("kdialog"); lookErr == nil {
			cmd := exec.CommandContext(ctx, "kdialog", "--getexistingdirectory")
			out, err := cmd.Output()
			if err != nil {
				return "", true, nil
			}
			chosen := strings.TrimSpace(string(out))
			if chosen == "" {
				return "", true, nil
			}
			return filepath.Clean(chosen), false, nil
		}
		return "", false, errors.New("no native file dialog tool available on linux (zenity or kdialog required)")

	default:
		return "", false, fmt.Errorf("native file dialog is not supported on %s", runtime.GOOS)
	}
}
