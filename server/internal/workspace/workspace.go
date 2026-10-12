package workspace

import (
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

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

type RepoStatus struct {
	IsRepo   bool   `json:"isRepo"`
	Branch   string `json:"branch"`
	RepoName string `json:"repoName"`
}

type Manager struct {
	mu            sync.RWMutex
	rootPath      string
	watcher       *Watcher
	watcherCancel func()

	subMu sync.RWMutex
	subs  map[chan WorkspaceChangeEvent]struct{}
}

func NewManager(initialRoot string) (*Manager, error) {
	m := &Manager{
		rootPath: "",
		subs:     make(map[chan WorkspaceChangeEvent]struct{}),
	}

	if strings.TrimSpace(initialRoot) == "" {
		return m, nil
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

	m.rootPath = absPath
	m.startWatcherLocked(absPath)

	return m, nil
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
	m.stopWatcherLocked()
	m.rootPath = absPath
	m.startWatcherLocked(absPath)
	m.mu.Unlock()

	return absPath, nil
}

func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopWatcherLocked()
	m.rootPath = ""
	return nil
}

// SubscribeEvents provides a listener channel for aggregated workspace file changes.
func (m *Manager) SubscribeEvents() (<-chan WorkspaceChangeEvent, func()) {
	ch := make(chan WorkspaceChangeEvent, 64)
	m.subMu.Lock()
	m.subs[ch] = struct{}{}
	m.subMu.Unlock()

	unsubscribe := func() {
		m.subMu.Lock()
		delete(m.subs, ch)
		m.subMu.Unlock()
	}

	return ch, unsubscribe
}

func (m *Manager) broadcastEvent(evt WorkspaceChangeEvent) {
	m.subMu.RLock()
	defer m.subMu.RUnlock()

	for ch := range m.subs {
		select {
		case ch <- evt:
		default:
		}
	}
}

func (m *Manager) startWatcherLocked(root string) {
	if root == "" {
		return
	}
	w, err := NewWatcher(root)
	if err != nil {
		return
	}
	m.watcher = w

	events, unsub := w.Subscribe()
	stopChan := make(chan struct{})

	m.watcherCancel = func() {
		close(stopChan)
		unsub()
		_ = w.Stop()
	}

	go func() {
		for {
			select {
			case <-stopChan:
				return
			case evt, ok := <-events:
				if !ok {
					return
				}
				m.broadcastEvent(evt)
			}
		}
	}()
}

func (m *Manager) stopWatcherLocked() {
	if m.watcherCancel != nil {
		m.watcherCancel()
		m.watcherCancel = nil
	}
	m.watcher = nil
}

func (m *Manager) GetRoot() (string, string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.rootPath == "" {
		return "", ""
	}
	return m.rootPath, filepath.Base(m.rootPath)
}

// ResolvePath resolves and validates a workspace-relative or absolute path within the workspace root.
func (m *Manager) ResolvePath(relPath string) (string, error) {
	return m.resolvePath(relPath)
}

func (m *Manager) resolvePath(relPath string) (string, error) {
	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	if root == "" {
		return "", errors.New("no active workspace root")
	}

	trimmed := strings.TrimSpace(relPath)
	trimmed = strings.Trim(trimmed, "\"'`")
	if trimmed == "" {
		return "", errors.New("empty path provided")
	}

	cleaned := filepath.Clean(trimmed)

	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		realRoot = root
	}

	if filepath.IsAbs(cleaned) {
		// Clean absolute path residing inside root
		relToRoot, err := filepath.Rel(root, cleaned)
		if err == nil && relToRoot != ".." && !strings.HasPrefix(relToRoot, ".."+string(filepath.Separator)) {
			// Check symlink escape
			if realCleaned, err := filepath.EvalSymlinks(cleaned); err == nil {
				relToReal, err := filepath.Rel(realRoot, realCleaned)
				if err != nil || relToReal == ".." || strings.HasPrefix(relToReal, ".."+string(filepath.Separator)) {
					return "", fmt.Errorf("path '%s' escapes root directory via symlink", relPath)
				}
			}
			return cleaned, nil
		}

		// Reject absolute path targeting an existing file or directory outside root
		if _, err := os.Stat(cleaned); err == nil {
			return "", fmt.Errorf("path '%s' escapes root directory '%s'", relPath, root)
		}
		if dirStat, err := os.Stat(filepath.Dir(cleaned)); err == nil && dirStat.IsDir() && filepath.Dir(cleaned) != string(filepath.Separator) {
			return "", fmt.Errorf("path '%s' escapes root directory '%s'", relPath, root)
		}
	}

	// Strip leading slashes so workspace-relative paths like "/App.tsx" resolve inside root
	rel := strings.TrimPrefix(cleaned, "/")
	rel = strings.TrimPrefix(rel, "\\")

	target := filepath.Join(root, rel)
	relToRoot, err := filepath.Rel(root, target)
	if err != nil || relToRoot == ".." || strings.HasPrefix(relToRoot, ".."+string(filepath.Separator)) {
		return "", fmt.Errorf("path '%s' escapes root directory '%s'", relPath, root)
	}

	// Evaluate physical symlinks
	if _, err := os.Stat(target); err == nil {
		realTarget, err := filepath.EvalSymlinks(target)
		if err == nil {
			relToReal, err := filepath.Rel(realRoot, realTarget)
			if err != nil || relToReal == ".." || strings.HasPrefix(relToReal, ".."+string(filepath.Separator)) {
				return "", fmt.Errorf("path '%s' escapes root directory via symlink", relPath)
			}
		}
	} else {
		// Check existing parent directory chain for symlink escapes
		parent := filepath.Dir(target)
		for parent != "" && parent != root && parent != filepath.Dir(parent) {
			if _, err := os.Stat(parent); err == nil {
				realParent, err := filepath.EvalSymlinks(parent)
				if err == nil {
					relParent, err := filepath.Rel(realRoot, realParent)
					if err != nil || relParent == ".." || strings.HasPrefix(relParent, ".."+string(filepath.Separator)) {
						return "", fmt.Errorf("path '%s' escapes root directory via symlink", relPath)
					}
				}
				break
			}
			parent = filepath.Dir(parent)
		}
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

// MaxEditableFileSize defines the threshold beyond which files are served in read-only preview mode (5MB).
const MaxEditableFileSize = 5 * 1024 * 1024

// PreviewSampleSize defines the bytes read for large file preview (64KB).
const PreviewSampleSize = 64 * 1024

// FilePayload holds the file content and detection flags.
type FilePayload struct {
	Content  string `json:"content"`
	IsLarge  bool   `json:"isLarge"`
	IsBinary bool   `json:"isBinary"`
	Size     int64  `json:"size"`
}

func isBinaryContent(sample []byte) bool {
	if len(sample) == 0 {
		return false
	}
	checkLen := len(sample)
	if checkLen > 512 {
		checkLen = 512
	}
	for i := 0; i < checkLen; i++ {
		if sample[i] == 0 {
			return true
		}
	}
	return false
}

// GetFileWithGuard inspects file size and binary markers before reading.
// For files exceeding MaxEditableFileSize, it returns the first PreviewSampleSize bytes with IsLarge=true.
func (m *Manager) GetFileWithGuard(relPath string) (*FilePayload, error) {
	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return nil, err
	}

	stat, err := os.Stat(fullPath)
	if err != nil {
		return nil, err
	}
	if stat.IsDir() {
		return nil, fmt.Errorf("path '%s' is a directory, not a file", relPath)
	}

	size := stat.Size()
	if size > MaxEditableFileSize {
		f, err := os.Open(fullPath)
		if err != nil {
			return nil, err
		}
		defer f.Close()

		buf := make([]byte, PreviewSampleSize)
		n, err := f.Read(buf)
		if err != nil && err != io.EOF {
			return nil, err
		}
		sample := buf[:n]
		return &FilePayload{
			Content:  string(sample),
			IsLarge:  true,
			IsBinary: isBinaryContent(sample),
			Size:     size,
		}, nil
	}

	bytes, err := os.ReadFile(fullPath)
	if err != nil {
		return nil, err
	}

	return &FilePayload{
		Content:  string(bytes),
		IsLarge:  false,
		IsBinary: isBinaryContent(bytes),
		Size:     size,
	}, nil
}

func (m *Manager) GetFile(relPath string) (string, error) {
	payload, err := m.GetFileWithGuard(relPath)
	if err != nil {
		return "", err
	}
	return payload.Content, nil
}

func (m *Manager) CreateFolder(relPath string) (string, error) {
	if strings.TrimSpace(relPath) == "" {
		return "", errors.New("folder path cannot be empty")
	}

	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(fullPath, 0755); err != nil {
		return "", err
	}

	return fullPath, nil
}

func (m *Manager) WriteFile(relPath string, content string) error {
	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return err
	}

	parentDir := filepath.Dir(fullPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return err
	}

	return os.WriteFile(fullPath, []byte(content), 0644)
}

// WriteFileExclusive writes file content only if the target file does not already exist.
func (m *Manager) WriteFileExclusive(relPath string, content string) error {
	fullPath, err := m.resolvePath(relPath)
	if err != nil {
		return err
	}

	if _, err := os.Stat(fullPath); err == nil {
		return fmt.Errorf("file already exists: %s", relPath)
	}

	parentDir := filepath.Dir(fullPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return err
	}

	f, err := os.OpenFile(fullPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
	if err != nil {
		return err
	}
	defer f.Close()

	_, err = f.WriteString(content)
	return err
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

	if _, err := os.Stat(newFullPath); err == nil {
		return fmt.Errorf("destination file already exists: %s", newRelPath)
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
		} else if pattern.MatchString(d.Name()) || pattern.MatchString(relPath) {
			results = append(results, SearchResult{
				Filename: relPath,
				Matches: []SearchMatch{
					{
						LineNumber:  1,
						Column:      1,
						LineContent: d.Name(),
						MatchText:   d.Name(),
					},
				},
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

// GetGitStatus detects the active Git repository status within the active workspace root.
func (m *Manager) GetGitStatus() (RepoStatus, error) {
	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	if strings.TrimSpace(root) == "" {
		return RepoStatus{
			IsRepo:   false,
			Branch:   "",
			RepoName: "",
		}, nil
	}

	gitDir := filepath.Join(root, ".git")
	stat, err := os.Stat(gitDir)
	if err != nil {
		if os.IsNotExist(err) {
			return RepoStatus{
				IsRepo:   false,
				Branch:   "",
				RepoName: filepath.Base(root),
			}, nil
		}
		return RepoStatus{}, err
	}

	if !stat.IsDir() {
		return RepoStatus{
			IsRepo:   false,
			Branch:   "",
			RepoName: filepath.Base(root),
		}, nil
	}

	headPath := filepath.Join(gitDir, "HEAD")
	headBytes, err := os.ReadFile(headPath)
	if err != nil {
		return RepoStatus{}, err
	}

	headContent := strings.TrimSpace(string(headBytes))
	branch := ""
	if strings.HasPrefix(headContent, "ref: refs/heads/") {
		branch = strings.TrimPrefix(headContent, "ref: refs/heads/")
	} else if len(headContent) >= 7 {
		branch = headContent[:7]
	}

	return RepoStatus{
		IsRepo:   true,
		Branch:   branch,
		RepoName: filepath.Base(root),
	}, nil
}

