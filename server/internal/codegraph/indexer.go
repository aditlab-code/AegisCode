package codegraph

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/lsp"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

const maxFileSize = 2 * 1024 * 1024 // 2 MB guardrail

// Engine coordinates AST extractors, SQLite persistence, LRU caching,
// and dual-path workspace file ingestion.
type Engine struct {
	mu            sync.RWMutex
	workspaceRoot string
	workspaceHash string
	dbPath        string
	db            *sql.DB
	query         *QueryEngine
	uiService     *UIService
	extractor     *LSPExtractor
	cache         *LRUCache
	ws            *workspace.Manager
	lspMgr        *lsp.Manager

	fileHashes map[string]string // relPath -> sha256 hex
	hashesMu   sync.RWMutex
	writeMu    sync.Mutex        // serializes SQLite write transactions

	isIndexing  atomic.Bool
	unsubEvents func()
	stopChan    chan struct{}
	closeOnce   sync.Once
}

// NewEngine initializes the CodeGraph Knowledge Engine for the active workspace.
func NewEngine(ws *workspace.Manager, lspMgr *lsp.Manager) (*Engine, error) {
	eng := &Engine{
		ws:         ws,
		lspMgr:     lspMgr,
		extractor:  NewLSPExtractor(lspMgr),
		cache:      NewLRUCache(500),
		fileHashes: make(map[string]string),
		stopChan:   make(chan struct{}),
	}

	var root string
	if ws != nil {
		root, _ = ws.GetRoot()
	}

	if root != "" {
		if err := eng.initWorkspace(root); err != nil {
			return nil, err
		}
	}

	return eng, nil
}

// initWorkspace sets up SQLite database and begins file watching and indexing.
func (e *Engine) initWorkspace(root string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	cleanRoot := filepath.Clean(strings.TrimSpace(root))
	if cleanRoot == "" {
		return nil
	}

	hash := ComputeWorkspaceHash(cleanRoot)
	dbPath, err := ResolveGraphDBPath(cleanRoot)
	if err != nil {
		return fmt.Errorf("failed to resolve graph db path: %w", err)
	}

	db, err := OpenGraphDB(dbPath)
	if err != nil {
		return fmt.Errorf("failed to open graph db: %w", err)
	}

	e.workspaceRoot = cleanRoot
	e.workspaceHash = hash
	e.dbPath = dbPath
	e.db = db
	e.query = NewQueryEngine(db, cleanRoot)
	e.uiService = NewUIService(db, cleanRoot)
	// Clean out any historical files in ignored paths (e.g. .venv, node_modules) and orphaned symbols
	e.writeMu.Lock()
	_, _ = db.Exec(`
		DELETE FROM graph_files 
		WHERE path LIKE '%.venv%' 
		   OR path LIKE '%/venv/%' 
		   OR path LIKE 'venv/%'
		   OR path LIKE '%.venv/%'
		   OR path LIKE '%/site-packages/%' 
		   OR path LIKE 'site-packages/%'
		   OR path LIKE '%/__pycache__/%'
		   OR path LIKE '__pycache__/%'
		   OR path LIKE '%node_modules%';
		DELETE FROM code_symbols WHERE file_id NOT IN (SELECT id FROM graph_files);
		DELETE FROM code_edges WHERE source_symbol_id NOT IN (SELECT id FROM code_symbols) 
		   OR (target_symbol_id IS NOT NULL AND target_symbol_id NOT IN (SELECT id FROM code_symbols));
	`)
	e.writeMu.Unlock()
	// Preload existing file hashes from DB into memory
	e.hashesMu.Lock()
	e.fileHashes = make(map[string]string)
	rows, err := db.Query(`SELECT path, hash FROM graph_files`)
	if err == nil {
		for rows.Next() {
			var p, h string
			if rows.Scan(&p, &h) == nil {
				e.fileHashes[p] = h
			}
		}
		rows.Close()
	}
	e.hashesMu.Unlock()

	// Clear LRU cache
	e.cache.Clear()

	// Subscribe to workspace events if manager is provided
	if e.ws != nil {
		if e.unsubEvents != nil {
			e.unsubEvents()
		}
		events, unsub := e.ws.SubscribeEvents()
		e.unsubEvents = unsub
		go e.eventLoop(events)
	}

	// Trigger background cold-start initial scan
	go e.startColdScan()

	return nil
}

// SetWorkspace reconfigures the engine for a newly loaded workspace directory.
func (e *Engine) SetWorkspace(newRoot string) error {
	if e.unsubEvents != nil {
		e.unsubEvents()
		e.unsubEvents = nil
	}

	e.mu.Lock()
	if e.db != nil {
		_ = e.db.Close()
		e.db = nil
	}
	e.workspaceRoot = ""
	e.workspaceHash = ""
	e.dbPath = ""
	e.query = nil
	e.uiService = nil
	e.mu.Unlock()

	if strings.TrimSpace(newRoot) == "" {
		return nil
	}

	return e.initWorkspace(newRoot)
}

// isSupportedSourceFile checks if the path has a supported source code extension.
func isSupportedSourceFile(path string) bool {
	norm := filepath.ToSlash(strings.ToLower(path))
	// Skip any file inside virtual environments, dependencies, or cache directories
	if strings.Contains(norm, "/.venv/") || strings.HasPrefix(norm, ".venv/") ||
		strings.Contains(norm, "/venv/") || strings.HasPrefix(norm, "venv/") ||
		strings.Contains(norm, "/site-packages/") || strings.HasPrefix(norm, "site-packages/") ||
		strings.Contains(norm, "/__pycache__/") || strings.HasPrefix(norm, "__pycache__/") ||
		strings.Contains(norm, "/node_modules/") || strings.HasPrefix(norm, "node_modules/") ||
		strings.Contains(norm, "/vendor/") || strings.HasPrefix(norm, "vendor/") {
		return false
	}
	switch {
	case strings.HasSuffix(norm, ".go"):
		return true
	case strings.HasSuffix(norm, ".ts"), strings.HasSuffix(norm, ".tsx"):
		return true
	case strings.HasSuffix(norm, ".js"), strings.HasSuffix(norm, ".jsx"):
		return true
	case strings.HasSuffix(norm, ".py"):
		return true
	default:
		return false
	}
}

// isIgnoredDir checks if a directory path should be skipped during walk.
func isIgnoredDir(name string) bool {
	lower := strings.ToLower(name)
	switch lower {
	case ".git", "node_modules", "vendor", "dist", "build", ".next", ".cache", "out", "bin",
		".venv", "venv", "env", ".env", "__pycache__", "site-packages", ".tox", ".pytest_cache",
		".mypy_cache", ".idea", ".vscode", "target", ".eggs", "eggs":
		return true
	default:
		if strings.HasPrefix(lower, ".venv") || strings.HasPrefix(lower, "__pycache__") {
			return true
		}
		return false
	}
}

// IndexFile indexes or updates a single file inside the graph database.
func (e *Engine) IndexFile(ctx context.Context, relPath string) error {
	e.mu.RLock()
	db := e.db
	root := e.workspaceRoot
	e.mu.RUnlock()

	if db == nil || root == "" {
		return nil
	}

	if !isSupportedSourceFile(relPath) {
		return nil
	}

	absPath := filepath.Join(root, relPath)
	info, err := os.Stat(absPath)
	if err != nil {
		if os.IsNotExist(err) {
			// File was deleted
			e.hashesMu.Lock()
			delete(e.fileHashes, relPath)
			e.hashesMu.Unlock()
			e.cache.InvalidatePath(relPath)
			e.writeMu.Lock()
			defer e.writeMu.Unlock()
			return DeleteExtractedFile(ctx, db, relPath)
		}
	}

	if info.IsDir() || info.Size() > maxFileSize {
		return nil
	}

	content, err := os.ReadFile(absPath)
	if err != nil {
		return err
	}

	// Hot-Path SHA-256 check (< 0.1 ms)
	h := sha256.Sum256(content)
	contentHash := hex.EncodeToString(h[:])

	e.hashesMu.RLock()
	existingHash := e.fileHashes[relPath]
	e.hashesMu.RUnlock()

	if existingHash == contentHash {
		// Content unchanged, skip parsing
		return nil
	}

	// Parse file AST
	extracted, err := e.extractor.Extract(relPath, content)
	if err != nil {
		return fmt.Errorf("failed to extract symbols from %s: %w", relPath, err)
	}
	if extracted == nil {
		return nil
	}

	// Write into SQLite in a single transaction (< 5 ms)
	mtime := info.ModTime().Unix()
	size := info.Size()
	e.writeMu.Lock()
	err = IngestExtractedFile(ctx, db, extracted, contentHash, mtime, size)
	e.writeMu.Unlock()
	if err != nil {
		return err
	}

	// Update in-memory state and invalidate cached entries
	e.hashesMu.Lock()
	e.fileHashes[relPath] = contentHash
	e.hashesMu.Unlock()

	e.cache.InvalidatePath(relPath)
	return nil
}

// eventLoop handles real-time workspace file modification events.
func (e *Engine) eventLoop(events <-chan workspace.WorkspaceChangeEvent) {
	for {
		select {
		case <-e.stopChan:
			return
		case evt, ok := <-events:
			if !ok {
				return
			}
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			// Handle Deleted
			for _, p := range evt.Deleted {
				if isSupportedSourceFile(p) {
					e.mu.RLock()
					db := e.db
					e.mu.RUnlock()
					if db != nil {
						e.writeMu.Lock()
						_ = DeleteExtractedFile(ctx, db, p)
						e.writeMu.Unlock()
						e.hashesMu.Lock()
						delete(e.fileHashes, p)
						e.hashesMu.Unlock()
						e.cache.InvalidatePath(p)
					}
				}
			}

			// Handle Created & Modified
			toIndex := append(evt.Created, evt.Modified...)
			for _, p := range toIndex {
				if isSupportedSourceFile(p) {
					_ = e.IndexFile(ctx, p)
				}
			}
			cancel()
		}
	}
}

// startColdScan walks the workspace directory and indexes supported source files.
func (e *Engine) startColdScan() {
	if !e.isIndexing.CompareAndSwap(false, true) {
		return
	}
	defer e.isIndexing.Store(false)

	e.mu.RLock()
	root := e.workspaceRoot
	db := e.db
	e.mu.RUnlock()

	if root == "" || db == nil {
		return
	}

	// Purge any previously indexed files in ignored paths
	e.writeMu.Lock()
	_, _ = db.Exec(`
		DELETE FROM graph_files 
		WHERE path LIKE '%.venv%' 
		   OR path LIKE '%/venv/%' 
		   OR path LIKE 'venv/%'
		   OR path LIKE '%.venv/%'
		   OR path LIKE '%/site-packages/%' 
		   OR path LIKE 'site-packages/%'
		   OR path LIKE '%/__pycache__/%'
		   OR path LIKE '__pycache__/%'
		   OR path LIKE '%node_modules%'
	`)
	e.writeMu.Unlock()

	var filesToIndex []string
	_ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if isIgnoredDir(d.Name()) {
				return filepath.SkipDir
			}
			return nil
		}
		if isSupportedSourceFile(path) {
			rel, rErr := filepath.Rel(root, path)
			if rErr == nil {
				filesToIndex = append(filesToIndex, rel)
			}
		}
		return nil
	})

	if len(filesToIndex) == 0 {
		return
	}

	// Worker pool up to NumCPU
	numWorkers := runtime.NumCPU()
	if numWorkers < 1 {
		numWorkers = 1
	}
	if numWorkers > 8 {
		numWorkers = 8
	}

	jobs := make(chan string, len(filesToIndex))
	var wg sync.WaitGroup

	for w := 0; w < numWorkers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for relPath := range jobs {
				select {
				case <-e.stopChan:
					return
				default:
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					_ = e.IndexFile(ctx, relPath)
					cancel()
				}
			}
		}()
	}

	for _, f := range filesToIndex {
		jobs <- f
	}
	close(jobs)

	wg.Wait()
}

// Reindex forces a full re-scan and re-index of the active workspace.
func (e *Engine) Reindex(ctx context.Context) error {
	e.cache.Clear()
	e.hashesMu.Lock()
	e.fileHashes = make(map[string]string)
	e.hashesMu.Unlock()

	e.mu.RLock()
	db := e.db
	e.mu.RUnlock()
	if db != nil {
		e.writeMu.Lock()
		_, _ = db.Exec(`
			DELETE FROM code_edges;
			DELETE FROM code_symbols;
			DELETE FROM graph_files;
			INSERT INTO symbol_fts(symbol_fts) VALUES('rebuild');
		`)
		e.writeMu.Unlock()
	}

	e.startColdScan()
	return nil
}

// Status returns current indexing statistics for the active workspace.
func (e *Engine) Status(ctx context.Context) (GraphStatus, error) {
	e.mu.RLock()
	root := e.workspaceRoot
	hash := e.workspaceHash
	dbPath := e.dbPath
	db := e.db
	isIndexing := e.isIndexing.Load()
	e.mu.RUnlock()

	return QueryGraphStatus(ctx, db, root, hash, dbPath, isIndexing)
}

// GetFileOutline retrieves file outline with LRU caching.
func (e *Engine) GetFileOutline(ctx context.Context, relPath string) (*FileOutlineResult, error) {
	cacheKey := fmt.Sprintf("outline:%s", relPath)
	if val, ok := e.cache.Get(cacheKey); ok {
		if res, castOk := val.(*FileOutlineResult); castOk {
			return res, nil
		}
	}

	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()
	if q == nil {
		return nil, fmt.Errorf("codegraph engine is dormant (no active workspace)")
	}

	res, err := q.GetFileOutline(ctx, relPath)
	if err != nil {
		return nil, err
	}

	e.cache.Set(cacheKey, res, relPath)
	return res, nil
}

// GetSymbolDefinition retrieves symbol definition with LRU caching.
func (e *Engine) GetSymbolDefinition(ctx context.Context, name, fileHint string) (*SymbolDefinition, error) {
	cacheKey := fmt.Sprintf("def:%s:%s", name, fileHint)
	if val, ok := e.cache.Get(cacheKey); ok {
		if res, castOk := val.(*SymbolDefinition); castOk {
			return res, nil
		}
	}

	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()
	if q == nil {
		return nil, fmt.Errorf("codegraph engine is dormant")
	}

	res, err := q.GetSymbolDefinition(ctx, name, fileHint)
	if err != nil {
		return nil, err
	}

	e.cache.Set(cacheKey, res, res.FilePath)
	return res, nil
}

// FindCallers locates inbound callers with LRU caching.
func (e *Engine) FindCallers(ctx context.Context, functionName string, limit int) (*FindCallersResult, error) {
	cacheKey := fmt.Sprintf("callers:%s:%d", functionName, limit)
	if val, ok := e.cache.Get(cacheKey); ok {
		if res, castOk := val.(*FindCallersResult); castOk {
			return res, nil
		}
	}

	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()
	if q == nil {
		return nil, fmt.Errorf("codegraph engine is dormant")
	}

	res, err := q.FindCallers(ctx, functionName, limit)
	if err != nil {
		return nil, err
	}

	e.cache.Set(cacheKey, res, "")
	return res, nil
}

// FindCallees delegates to QueryEngine.
func (e *Engine) FindCallees(ctx context.Context, functionName, fileHint string, limit int) (*FindCalleesResult, error) {
	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()
	if q == nil {
		return nil, fmt.Errorf("codegraph engine is dormant")
	}
	return q.FindCallees(ctx, functionName, fileHint, limit)
}

// QuerySubgraph delegates to QueryEngine.
func (e *Engine) QuerySubgraph(ctx context.Context, rootSymbol string, depth int) (*SubgraphResult, error) {
	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()
	if q == nil {
		return nil, fmt.Errorf("codegraph engine is dormant")
	}
	return q.QuerySubgraph(ctx, rootSymbol, depth)
}

// ReadSymbolBody delegates to QueryEngine.
func (e *Engine) ReadSymbolBody(ctx context.Context, name, relPath string) (string, error) {
	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()
	if q == nil {
		return "", fmt.Errorf("codegraph engine is dormant")
	}
	return q.ReadSymbolBody(ctx, name, relPath)
}

// GetDiffImpact delegates to QueryEngine.
func (e *Engine) GetDiffImpact(ctx context.Context, staged bool) (*DiffImpactResult, error) {
	e.mu.RLock()
	q := e.query
	e.mu.RUnlock()
	if q == nil {
		return nil, fmt.Errorf("codegraph engine is dormant")
	}
	return q.GetDiffImpact(ctx, staged)
}

// Close terminates event watching and closes database connections.
// UIService returns the active UIService for graph visualization queries.
func (e *Engine) UIService() *UIService {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.uiService
}

func (e *Engine) Close() error {
	var err error
	e.closeOnce.Do(func() {
		close(e.stopChan)
		if e.unsubEvents != nil {
			e.unsubEvents()
		}
		e.mu.Lock()
		if e.db != nil {
			err = e.db.Close()
			e.db = nil
		}
		e.mu.Unlock()
	})
	return err
}
