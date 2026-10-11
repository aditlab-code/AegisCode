package workspace

import (
	"errors"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// WorkspaceChangeEvent contains batched changes across the workspace.
type WorkspaceChangeEvent struct {
	Created  []string `json:"created"`
	Modified []string `json:"modified"`
	Deleted  []string `json:"deleted"`
}

// Watcher manages recursive filesystem watching with filtering, dynamic subfolder
// registration, and a 200ms debounce batching window.
type Watcher struct {
	rootPath string

	mu       sync.Mutex
	fsw      *fsnotify.Watcher
	stopChan chan struct{}
	stopped  bool

	subMu sync.RWMutex
	subs  map[chan WorkspaceChangeEvent]struct{}

	debounceDuration time.Duration
}

// NewWatcher instantiates a workspace Watcher configured with the 200ms debounce window.
func NewWatcher(rootPath string) (*Watcher, error) {
	if strings.TrimSpace(rootPath) == "" {
		return nil, errors.New("empty root path for watcher")
	}

	cleanRoot, err := filepath.Abs(filepath.Clean(rootPath))
	if err != nil {
		return nil, err
	}

	stat, err := os.Stat(cleanRoot)
	if err != nil {
		return nil, err
	}
	if !stat.IsDir() {
		return nil, errors.New("root path is not a directory")
	}

	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &Watcher{
		rootPath:         cleanRoot,
		fsw:              fsw,
		stopChan:         make(chan struct{}),
		subs:             make(map[chan WorkspaceChangeEvent]struct{}),
		debounceDuration: 200 * time.Millisecond,
	}

	if err := w.watchRecursive(cleanRoot); err != nil {
		_ = fsw.Close()
		return nil, err
	}

	go w.eventLoop()

	return w, nil
}

// Subscribe registers an event channel receiving batched workspace changes.
func (w *Watcher) Subscribe() (<-chan WorkspaceChangeEvent, func()) {
	ch := make(chan WorkspaceChangeEvent, 64)
	w.subMu.Lock()
	w.subs[ch] = struct{}{}
	w.subMu.Unlock()

	unsubscribe := func() {
		w.subMu.Lock()
		delete(w.subs, ch)
		w.subMu.Unlock()
	}

	return ch, unsubscribe
}

// Stop cleanly terminates the watcher and background goroutines.
func (w *Watcher) Stop() error {
	w.mu.Lock()
	defer w.mu.Unlock()

	if w.stopped {
		return nil
	}
	w.stopped = true
	close(w.stopChan)
	return w.fsw.Close()
}

// isIgnored checks if an isolated file or directory name should be skipped.
func isIgnored(name string) bool {
	base := filepath.Base(name)

	// Blacklisted directories
	switch base {
	case ".git", "node_modules", "dist", "dist-server", ".scratch", ".idea", ".vscode", "bin", ".DS_Store":
		return true
	}

	// Temporary files, editor backups, swap files
	if strings.HasPrefix(base, ".goutputstream-") ||
		strings.HasPrefix(base, ".#") ||
		strings.HasPrefix(base, "#") ||
		strings.HasSuffix(base, ".swp") ||
		strings.HasSuffix(base, ".tmp") ||
		strings.HasSuffix(base, "~") {
		return true
	}

	return false
}

// isIgnoredPath checks if any segment of the relative path or the file itself should be ignored.
func (w *Watcher) isIgnoredPath(fullPath string) bool {
	if isIgnored(fullPath) {
		return true
	}

	rel, err := filepath.Rel(w.rootPath, fullPath)
	if err != nil {
		return false
	}

	parts := strings.Split(filepath.ToSlash(rel), "/")
	for _, part := range parts {
		if part != "" && part != "." && isIgnored(part) {
			return true
		}
	}

	return false
}

func (w *Watcher) watchRecursive(dirPath string) error {
	return filepath.WalkDir(dirPath, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if w.isIgnoredPath(path) {
				return filepath.SkipDir
			}
			if err := w.fsw.Add(path); err != nil {
				log.Printf("warning: failed to watch path %s: %v", path, err)
			}
		}
		return nil
	})
}

func (w *Watcher) broadcast(evt WorkspaceChangeEvent) {
	if len(evt.Created) == 0 && len(evt.Modified) == 0 && len(evt.Deleted) == 0 {
		return
	}

	w.subMu.RLock()
	defer w.subMu.RUnlock()

	for ch := range w.subs {
		select {
		case ch <- evt:
		default:
			// Non-blocking drop if consumer buffer is full
		}
	}
}

func (w *Watcher) eventLoop() {
	var (
		timer       *time.Timer
		timerChan   <-chan time.Time
		createdMap  = make(map[string]struct{})
		modifiedMap = make(map[string]struct{})
		deletedMap  = make(map[string]struct{})
	)

	flushBatch := func() {
		created := make([]string, 0, len(createdMap))
		for p := range createdMap {
			created = append(created, p)
		}
		modified := make([]string, 0, len(modifiedMap))
		for p := range modifiedMap {
			modified = append(modified, p)
		}
		deleted := make([]string, 0, len(deletedMap))
		for p := range deletedMap {
			deleted = append(deleted, p)
		}

		clear(createdMap)
		clear(modifiedMap)
		clear(deletedMap)
		timerChan = nil

		w.broadcast(WorkspaceChangeEvent{
			Created:  created,
			Modified: modified,
			Deleted:  deleted,
		})
	}

	for {
		select {
		case <-w.stopChan:
			if timer != nil {
				timer.Stop()
			}
			return

		case <-timerChan:
			flushBatch()

		case err, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)

		case event, ok := <-w.fsw.Events:
			if !ok {
				return
			}

			// Check ignored paths (checking all path segments & temp extensions)
			if w.isIgnoredPath(event.Name) {
				continue
			}

			relPath, err := filepath.Rel(w.rootPath, event.Name)
			if err != nil {
				continue
			}
			relSlash := filepath.ToSlash(relPath)

			// Dynamic directory registration on Create
			if event.Has(fsnotify.Create) {
				if stat, err := os.Stat(event.Name); err == nil && stat.IsDir() {
					if !w.isIgnoredPath(event.Name) {
						if err := w.watchRecursive(event.Name); err != nil {
							log.Printf("[watcher] warning: failed to watch dynamic dir %s: %v", event.Name, err)
						}
					}
				}
			}

			// Aggregate event ops into relative path buckets
			if event.Has(fsnotify.Remove) {
				delete(createdMap, relSlash)
				delete(modifiedMap, relSlash)
				deletedMap[relSlash] = struct{}{}
			} else if event.Has(fsnotify.Rename) {
				// On rename, file might no longer exist at this path
				if _, err := os.Stat(event.Name); os.IsNotExist(err) {
					delete(createdMap, relSlash)
					delete(modifiedMap, relSlash)
					deletedMap[relSlash] = struct{}{}
				} else {
					modifiedMap[relSlash] = struct{}{}
				}
			} else if event.Has(fsnotify.Create) {
				delete(deletedMap, relSlash)
				createdMap[relSlash] = struct{}{}
			} else if event.Has(fsnotify.Write) {
				if _, isNew := createdMap[relSlash]; !isNew {
					modifiedMap[relSlash] = struct{}{}
				}
			}

			// Reset / start debounce timer (200ms)
			if timer == nil {
				timer = time.NewTimer(w.debounceDuration)
				timerChan = timer.C
			} else {
				if !timer.Stop() {
					select {
					case <-timer.C:
					default:
					}
				}
				timer.Reset(w.debounceDuration)
				timerChan = timer.C
			}
		}
	}
}
