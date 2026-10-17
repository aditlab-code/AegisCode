package workspace

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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
	LineNumber      int    `json:"lineNumber"`
	Column          int    `json:"column"`
	LineContent     string `json:"lineContent"`
	MatchText       string `json:"matchText"`
	IsFilenameMatch bool   `json:"isFilenameMatch,omitempty"`
}

type SearchResult struct {
	Filename string        `json:"filename"`
	Matches  []SearchMatch `json:"matches"`
}

type SearchOutcome struct {
	Results      []SearchResult `json:"results"`
	IsCapped     bool           `json:"isCapped"`
	TotalMatches int            `json:"totalMatches"`
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
	index         *WorkspaceIndex
	gitignore     *GitIgnoreMatcher

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
	m.gitignore = NewGitIgnoreMatcher(absPath)
	m.index = NewWorkspaceIndex(absPath)
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
	m.gitignore = NewGitIgnoreMatcher(absPath)
	m.index = NewWorkspaceIndex(absPath)
	m.startWatcherLocked(absPath)
	m.mu.Unlock()

	return absPath, nil
}

func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopWatcherLocked()
	m.rootPath = ""
	m.index = nil
	m.gitignore = nil
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
				m.mu.RLock()
				idx := m.index
				gi := m.gitignore
				root := m.rootPath
				m.mu.RUnlock()
				if idx != nil {
					idx.Invalidate(evt)
				}
				if gi != nil && root != "" {
					for _, p := range append(append(evt.Created, evt.Modified...), evt.Deleted...) {
						if strings.HasSuffix(p, ".gitignore") {
							gi.Load(root)
							break
						}
					}
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

// GetIndex returns the active IndexProvider interface.
func (m *Manager) GetIndex() IndexProvider {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.index
}

// FuzzyFind runs fuzzy matching on the active workspace index.
func (m *Manager) FuzzyFind(query string, limit int) []FuzzyMatch {
	m.mu.RLock()
	idx := m.index
	m.mu.RUnlock()

	if idx == nil {
		return []FuzzyMatch{}
	}
	return idx.FuzzyFind(query, limit)
}

// IndexStats returns telemetry metrics about the active in-memory index.
func (m *Manager) IndexStats() IndexStats {
	m.mu.RLock()
	idx := m.index
	m.mu.RUnlock()

	if idx == nil {
		return IndexStats{Status: "unindexed"}
	}
	return idx.Stats()
}

func (m *Manager) GetRoot() (string, string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.rootPath == "" {
		return "", ""
	}
	return m.rootPath, filepath.Base(m.rootPath)
}

// ErrProtectedPath is returned when attempting to access or modify protected VCS internal paths.
var ErrProtectedPath = errors.New("forbidden: cannot access or modify .git internal files or directories")

// IsProtectedPath checks if a relative or absolute path targets protected VCS internals like .git
func (m *Manager) IsProtectedPath(path string) bool {
	clean := filepath.ToSlash(filepath.Clean(strings.TrimSpace(path)))
	clean = strings.TrimPrefix(clean, "/")
	clean = strings.TrimPrefix(clean, "./")

	if clean == ".git" || strings.HasPrefix(clean, ".git/") {
		return true
	}

	m.mu.RLock()
	root := m.rootPath
	m.mu.RUnlock()

	if root != "" && filepath.IsAbs(path) {
		rel, err := filepath.Rel(root, path)
		if err == nil {
			slashRel := filepath.ToSlash(rel)
			if slashRel == ".git" || strings.HasPrefix(slashRel, ".git/") {
				return true
			}
		}
	}
	return false
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
		if !isDir && entry.Type()&os.ModeSymlink != 0 {
			if fi, err := os.Stat(fullPath); err == nil && fi.IsDir() {
				// Verify symlinked target directory stays within allowed workspace boundaries
				if _, err := m.resolvePath(relPath); err == nil {
					isDir = true
				}
			}
		}

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

	// Sort nodes: folders first, then alphabetical (case-insensitive)
	sort.SliceStable(nodes, func(i, j int) bool {
		iFolder := nodes[i].Type == "folder"
		jFolder := nodes[j].Type == "folder"
		if iFolder != jFolder {
			return iFolder
		}
		return strings.ToLower(nodes[i].Name) < strings.ToLower(nodes[j].Name)
	})

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
	if m.IsProtectedPath(relPath) {
		return nil, ErrProtectedPath
	}

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
	if m.IsProtectedPath(relPath) {
		return "", ErrProtectedPath
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
	if m.IsProtectedPath(relPath) {
		return ErrProtectedPath
	}

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
	if m.IsProtectedPath(relPath) {
		return ErrProtectedPath
	}

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
	if m.IsProtectedPath(relPath) {
		return ErrProtectedPath
	}

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
	if m.IsProtectedPath(oldRelPath) || m.IsProtectedPath(newRelPath) {
		return ErrProtectedPath
	}

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
	if m.IsProtectedPath(sourceRelPath) || m.IsProtectedPath(targetDirRelPath) {
		return "", ErrProtectedPath
	}

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
	outcome, err := m.SearchWithContext(context.Background(), query, isRegex, isMatchCase, isWholeWord)
	return outcome.Results, err
}

func (m *Manager) SearchWithContext(ctx context.Context, query string, isRegex bool, isMatchCase bool, isWholeWord bool) (SearchOutcome, error) {
	if strings.TrimSpace(query) == "" {
		return SearchOutcome{Results: []SearchResult{}}, nil
	}

	if ctx == nil {
		ctx = context.Background()
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
		return SearchOutcome{}, fmt.Errorf("invalid search pattern: %w", err)
	}

	m.mu.RLock()
	root := m.rootPath
	gi := m.gitignore
	m.mu.RUnlock()

	if root == "" {
		return SearchOutcome{Results: []SearchResult{}}, nil
	}

	results := make([]SearchResult, 0)
	totalMatches := 0
	isCapped := false

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		if err != nil {
			return err
		}

		if path == root {
			return nil
		}

		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}

		isDir := d.IsDir()

		// Pure .* and .gitignore rules
		if gi != nil && gi.ShouldIgnore(relPath, isDir) {
			if isDir {
				return filepath.SkipDir
			}
			return nil
		}

		if isDir {
			return nil
		}

		if totalMatches >= MaxSearchMatches {
			isCapped = true
			return filepath.SkipAll
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.Size() == 0 || info.Size() > MaxSearchFileSize {
			return nil
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
				totalMatches++
				if totalMatches >= MaxSearchMatches {
					isCapped = true
					break
				}
			}
			if totalMatches >= MaxSearchMatches {
				break
			}
		}

		if len(matches) > 0 {
			results = append(results, SearchResult{
				Filename: filepath.ToSlash(relPath),
				Matches:  matches,
			})
		} else if pattern.MatchString(d.Name()) || pattern.MatchString(relPath) {
			if totalMatches < MaxSearchMatches {
				totalMatches++
				results = append(results, SearchResult{
					Filename: filepath.ToSlash(relPath),
					Matches: []SearchMatch{
						{
							LineNumber:      1,
							Column:          1,
							LineContent:     d.Name(),
							MatchText:       d.Name(),
							IsFilenameMatch: true,
						},
					},
				})
			} else {
				isCapped = true
			}
		}

		if totalMatches >= MaxSearchMatches {
			isCapped = true
			return filepath.SkipAll
		}

		return nil
	})

	if walkErr != nil && !errors.Is(walkErr, filepath.SkipAll) {
		return SearchOutcome{}, walkErr
	}

	return SearchOutcome{
		Results:      results,
		IsCapped:     isCapped,
		TotalMatches: totalMatches,
	}, nil
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
	gi := m.gitignore
	m.mu.RUnlock()

	totalReplacements := 0
	modifiedFiles := make([]string, 0)

	walkErr := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		if path == root {
			return nil
		}

		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}

		isDir := d.IsDir()
		if gi != nil && gi.ShouldIgnore(relPath, isDir) {
			if isDir {
				return filepath.SkipDir
			}
			return nil
		}

		if isDir {
			return nil
		}

		info, err := d.Info()
		if err != nil {
			return nil
		}
		if info.Size() == 0 || info.Size() > MaxSearchFileSize {
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

