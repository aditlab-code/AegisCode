package workspace

import (
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

// FuzzyMatch represents a scored match from the in-memory index.
type FuzzyMatch struct {
	Path      string `json:"path"`
	Score     int    `json:"score"`
	Positions []int  `json:"positions,omitempty"`
}

// IndexedFile contains cached metadata for a file in the workspace index.
type IndexedFile struct {
	Path      string `json:"path"`
	LowerPath string `json:"lowerPath"`
	BaseName  string `json:"baseName"`
	Ext       string `json:"ext"`
	ModTime   int64  `json:"modTime"`
	Size      int64  `json:"size"`
}

// IndexStats provides diagnostic telemetry about the index.
type IndexStats struct {
	TotalFiles      int       `json:"totalFiles"`
	LastIndexedAt   time.Time `json:"lastIndexedAt"`
	IndexDurationMs int64     `json:"indexDurationMs"`
	Status          string    `json:"status"`
}

// IndexProvider defines the capability contract for the workspace in-memory index.
type IndexProvider interface {
	FuzzyFind(query string, limit int) []FuzzyMatch
	ListFiles() []IndexedFile
	Invalidate(event WorkspaceChangeEvent)
	Stats() IndexStats
}

// WorkspaceIndex is the concrete in-memory index.
type WorkspaceIndex struct {
	mu            sync.RWMutex
	rootPath      string
	files         []IndexedFile
	filesByPath   map[string]int // relative path -> index in files slice
	lastIndexedAt time.Time
	indexDurMs    int64
	status        string
}

var ignoredDirNames = map[string]struct{}{
	".git":         {},
	"node_modules": {},
	"dist":         {},
	".next":        {},
	"vendor":       {},
	".scratch":     {},
	".gemini":      {},
	"bin":          {},
	"obj":          {},
}

// NewWorkspaceIndex scans rootPath and constructs the in-memory index.
func NewWorkspaceIndex(rootPath string) *WorkspaceIndex {
	idx := &WorkspaceIndex{
		rootPath:    rootPath,
		files:       make([]IndexedFile, 0, 1024),
		filesByPath: make(map[string]int),
		status:      "idle",
	}

	if rootPath == "" {
		return idx
	}

	idx.rebuild()
	return idx
}

func (idx *WorkspaceIndex) rebuild() {
	idx.mu.Lock()
	idx.status = "indexing"
	idx.mu.Unlock()

	start := time.Now()
	files := make([]IndexedFile, 0, 1024)
	filesByPath := make(map[string]int)

	cleanRoot := filepath.Clean(idx.rootPath)

	_ = filepath.WalkDir(cleanRoot, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}

		name := d.Name()
		if d.IsDir() {
			if _, ignored := ignoredDirNames[name]; ignored && p != cleanRoot {
				return filepath.SkipDir
			}
			return nil
		}

		rel, err := filepath.Rel(cleanRoot, p)
		if err != nil {
			return nil
		}
		rel = filepath.ToSlash(rel)

		info, err := d.Info()
		var modTime int64
		var size int64
		if err == nil {
			modTime = info.ModTime().Unix()
			size = info.Size()
		}

		item := IndexedFile{
			Path:      rel,
			LowerPath: strings.ToLower(rel),
			BaseName:  name,
			Ext:       strings.ToLower(filepath.Ext(name)),
			ModTime:   modTime,
			Size:      size,
		}

		filesByPath[rel] = len(files)
		files = append(files, item)
		return nil
	})

	idx.mu.Lock()
	idx.files = files
	idx.filesByPath = filesByPath
	idx.lastIndexedAt = time.Now()
	idx.indexDurMs = time.Since(start).Milliseconds()
	idx.status = "ready"
	idx.mu.Unlock()
}

// Stats returns diagnostic telemetry about the index.
func (idx *WorkspaceIndex) Stats() IndexStats {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	status := idx.status
	if status == "" {
		status = "ready"
	}
	return IndexStats{
		TotalFiles:      len(idx.files),
		LastIndexedAt:   idx.lastIndexedAt,
		IndexDurationMs: idx.indexDurMs,
		Status:          status,
	}
}

// ListFiles returns a shallow clone of the indexed files slice.
func (idx *WorkspaceIndex) ListFiles() []IndexedFile {
	idx.mu.RLock()
	defer idx.mu.RUnlock()
	res := make([]IndexedFile, len(idx.files))
	copy(res, idx.files)
	return res
}

// Invalidate updates the index incrementally when watcher events fire.
func (idx *WorkspaceIndex) Invalidate(event WorkspaceChangeEvent) {
	idx.mu.Lock()
	defer idx.mu.Unlock()

	cleanRoot := filepath.Clean(idx.rootPath)

	// Handle deleted files
	for _, delPath := range event.Deleted {
		rel := idx.toRelPath(delPath, cleanRoot)
		if pos, ok := idx.filesByPath[rel]; ok {
			// Swap remove
			lastIdx := len(idx.files) - 1
			if pos != lastIdx {
				idx.files[pos] = idx.files[lastIdx]
				idx.filesByPath[idx.files[pos].Path] = pos
			}
			idx.files = idx.files[:lastIdx]
			delete(idx.filesByPath, rel)
		}
	}

	// Handle created files
	for _, crPath := range event.Created {
		rel := idx.toRelPath(crPath, cleanRoot)
		if idx.isIgnoredPath(rel) {
			continue
		}

		abs := crPath
		if !filepath.IsAbs(abs) {
			abs = filepath.Join(cleanRoot, crPath)
		}

		info, err := os.Stat(abs)
		if err != nil || info.IsDir() {
			continue
		}

		baseName := filepath.Base(rel)
		item := IndexedFile{
			Path:      rel,
			LowerPath: strings.ToLower(rel),
			BaseName:  baseName,
			Ext:       strings.ToLower(filepath.Ext(baseName)),
			ModTime:   info.ModTime().Unix(),
			Size:      info.Size(),
		}

		if pos, ok := idx.filesByPath[rel]; ok {
			idx.files[pos] = item
		} else {
			idx.filesByPath[rel] = len(idx.files)
			idx.files = append(idx.files, item)
		}
	}

	// Handle modified files
	for _, modPath := range event.Modified {
		rel := idx.toRelPath(modPath, cleanRoot)
		if pos, ok := idx.filesByPath[rel]; ok {
			abs := modPath
			if !filepath.IsAbs(abs) {
				abs = filepath.Join(cleanRoot, modPath)
			}
			if info, err := os.Stat(abs); err == nil && !info.IsDir() {
				idx.files[pos].ModTime = info.ModTime().Unix()
				idx.files[pos].Size = info.Size()
			}
		}
	}
}

func (idx *WorkspaceIndex) toRelPath(p, cleanRoot string) string {
	if filepath.IsAbs(p) {
		if rel, err := filepath.Rel(cleanRoot, p); err == nil {
			return filepath.ToSlash(rel)
		}
	}
	return filepath.ToSlash(filepath.Clean(p))
}

func (idx *WorkspaceIndex) isIgnoredPath(rel string) bool {
	parts := strings.Split(rel, "/")
	for _, part := range parts {
		if _, ok := ignoredDirNames[part]; ok {
			return true
		}
	}
	return false
}

// FuzzyFind runs weighted subsequence matching against indexed files.
func (idx *WorkspaceIndex) FuzzyFind(query string, limit int) []FuzzyMatch {
	if limit <= 0 {
		limit = 20
	}

	idx.mu.RLock()
	files := idx.files
	totalFiles := len(files)
	idx.mu.RUnlock()

	if totalFiles == 0 {
		return []FuzzyMatch{}
	}

	trimmedQuery := strings.TrimSpace(query)
	if trimmedQuery == "" {
		maxCount := limit
		if maxCount > totalFiles {
			maxCount = totalFiles
		}
		res := make([]FuzzyMatch, maxCount)
		for i := 0; i < maxCount; i++ {
			res[i] = FuzzyMatch{
				Path:  files[i].Path,
				Score: 1,
			}
		}
		return res
	}

	queryLower := strings.ToLower(trimmedQuery)

	// Single-threaded path for small repositories (< 2000 files)
	if totalFiles <= 2000 {
		return matchSlice(files, queryLower, trimmedQuery, limit)
	}

	// Parallel multi-core path for large repositories (> 2000 files)
	numCPU := runtime.NumCPU() - 1
	if numCPU < 1 {
		numCPU = 1
	}

	chunkSize := (totalFiles + numCPU - 1) / numCPU
	resultsChan := make(chan []FuzzyMatch, numCPU)
	var wg sync.WaitGroup

	for i := 0; i < numCPU; i++ {
		start := i * chunkSize
		if start >= totalFiles {
			break
		}
		end := start + chunkSize
		if end > totalFiles {
			end = totalFiles
		}

		wg.Add(1)
		go func(subSlice []IndexedFile) {
			defer wg.Done()
			resultsChan <- matchSlice(subSlice, queryLower, trimmedQuery, limit)
		}(files[start:end])
	}

	wg.Wait()
	close(resultsChan)

	var combined []FuzzyMatch
	for subMatches := range resultsChan {
		combined = append(combined, subMatches...)
	}

	sort.Slice(combined, func(i, j int) bool {
		if combined[i].Score == combined[j].Score {
			return len(combined[i].Path) < len(combined[j].Path)
		}
		return combined[i].Score > combined[j].Score
	})

	if len(combined) > limit {
		combined = combined[:limit]
	}

	return combined
}

func matchSlice(files []IndexedFile, queryLower, queryOriginal string, limit int) []FuzzyMatch {
	matches := make([]FuzzyMatch, 0, limit*2)

	for _, file := range files {
		score, positions := ScoreFuzzy(file, queryLower, queryOriginal)
		if score > 0 {
			matches = append(matches, FuzzyMatch{
				Path:      file.Path,
				Score:     score,
				Positions: positions,
			})
		}
	}

	sort.Slice(matches, func(i, j int) bool {
		if matches[i].Score == matches[j].Score {
			return len(matches[i].Path) < len(matches[j].Path)
		}
		return matches[i].Score > matches[j].Score
	})

	if len(matches) > limit {
		matches = matches[:limit]
	}

	return matches
}

// ScoreFuzzy computes weighted subsequence match score between query and file.
// Returns (score, positions). Score <= 0 means not a match.
func ScoreFuzzy(file IndexedFile, queryLower, queryOriginal string) (int, []int) {
	qLen := len(queryLower)
	tLen := len(file.LowerPath)

	if qLen == 0 || tLen == 0 || qLen > tLen {
		return 0, nil
	}

	// Exact basename match shortcut
	if strings.EqualFold(file.BaseName, queryOriginal) {
		return 1000 - len(file.Path)/2, nil
	}

	// First verify subsequence existence
	qIdx := 0
	positions := make([]int, qLen)
	target := file.LowerPath
	original := file.Path

	lastMatchIdx := -1
	consecutiveBonus := 0
	score := 100

	baseNameStart := strings.LastIndex(target, "/") + 1

	for tIdx := 0; tIdx < tLen && qIdx < qLen; tIdx++ {
		if target[tIdx] == queryLower[qIdx] {
			positions[qIdx] = tIdx

			// Basename match bonus
			if tIdx >= baseNameStart {
				score += 60
			}

			// Prefix match bonus
			if tIdx == baseNameStart {
				score += 50
			} else if tIdx == 0 {
				score += 40
			}

			// Boundary match bonus (following /, _, -, .)
			if tIdx > 0 {
				prev := target[tIdx-1]
				if prev == '/' || prev == '_' || prev == '-' || prev == '.' {
					score += 35
				}
			}

			// CamelCase bonus
			if unicode.IsUpper(rune(original[tIdx])) && (tIdx == 0 || !unicode.IsUpper(rune(original[tIdx-1]))) {
				score += 30
			}

			// Consecutive character bonus
			if lastMatchIdx != -1 && tIdx == lastMatchIdx+1 {
				consecutiveBonus += 20
				score += consecutiveBonus
			} else {
				consecutiveBonus = 0
			}

			lastMatchIdx = tIdx
			qIdx++
		}
	}

	// Not all query characters matched
	if qIdx < qLen {
		return 0, nil
	}

	// Shorter path penalty
	score -= tLen / 3

	if score < 1 {
		score = 1
	}

	return score, positions
}
