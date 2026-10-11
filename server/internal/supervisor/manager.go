package supervisor

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
)

var (
	ErrWorkerNotFound      = errors.New("worker not found")
	ErrWorkerAlreadyExists = errors.New("worker already exists and is active")
)

// Manager coordinates the lifecycle of external child worker processes.
type Manager struct {
	mu      sync.RWMutex
	workers map[string]*Worker
	onCrash func(evt CrashEvent)
}

// NewManager initializes a new supervisor manager.
func NewManager(onCrash func(evt CrashEvent)) *Manager {
	return &Manager{
		workers: make(map[string]*Worker),
		onCrash: onCrash,
	}
}

// StartWorker validates configuration, registers the worker, and begins supervision.
func (m *Manager) StartWorker(cfg WorkerConfig) (*Worker, error) {
	if cfg.ID == "" {
		return nil, errors.New("worker id must not be empty")
	}
	if cfg.Command == "" {
		return nil, errors.New("worker command must not be empty")
	}
	if cfg.Name == "" {
		cfg.Name = cfg.ID
	}

	m.mu.Lock()
	if existing, ok := m.workers[cfg.ID]; ok {
		info := existing.Info()
		if info.Status == StatusRunning || info.Status == StatusStarting || info.Status == StatusBackoff {
			m.mu.Unlock()
			return nil, ErrWorkerAlreadyExists
		}
	}

	w := newWorker(cfg, m.onCrash)
	m.workers[cfg.ID] = w
	m.mu.Unlock()

	if err := w.Start(); err != nil {
		return nil, fmt.Errorf("start worker: %w", err)
	}

	return w, nil
}

// StopWorker gracefully terminates a specific worker by ID.
func (m *Manager) StopWorker(id string) error {
	m.mu.RLock()
	w, ok := m.workers[id]
	m.mu.RUnlock()

	if !ok {
		return ErrWorkerNotFound
	}

	return w.Stop(1 * time.Second)
}

// DeleteWorker stops and removes a worker from the supervisor.
func (m *Manager) DeleteWorker(id string) error {
	m.mu.Lock()
	w, ok := m.workers[id]
	if !ok {
		m.mu.Unlock()
		return ErrWorkerNotFound
	}
	delete(m.workers, id)
	m.mu.Unlock()

	return w.Stop(1 * time.Second)
}

// RegisterRunner registers an active external process (such as a PTY terminal shell or LSP) under supervisor observation.
func (m *Manager) RegisterRunner(id, name, command string, pid int, stopFn func() error, waitDone <-chan error) error {
	if id == "" {
		return errors.New("runner id must not be empty")
	}

	m.mu.Lock()
	if existing, ok := m.workers[id]; ok {
		info := existing.Info()
		if info.Status == StatusRunning || info.Status == StatusStarting {
			m.mu.Unlock()
			return ErrWorkerAlreadyExists
		}
	}

	w := &Worker{
		cfg: WorkerConfig{
			ID:            id,
			Name:          name,
			Command:       command,
			RestartPolicy: RestartNever,
		},
		status:    StatusRunning,
		pid:       pid,
		startTime: time.Now(),
		logs:      NewRingBuffer(64 * 1024),
		stopChan:  make(chan struct{}),
		doneChan:  make(chan struct{}),
		onCrash:   m.onCrash,
	}
	m.workers[id] = w
	m.mu.Unlock()

	go func() {
		defer close(w.doneChan)
		select {
		case err := <-waitDone:
			w.mu.Lock()
			w.pid = 0
			if err != nil {
				w.status = StatusCrashed
				w.lastError = err.Error()
				w.mu.Unlock()
				if w.onCrash != nil {
					w.onCrash(CrashEvent{
						WorkerID:  id,
						Name:      name,
						ExitCode:  -1,
						Error:     err.Error(),
						TailLogs:  w.logs.String(),
						Timestamp: time.Now(),
					})
				}
			} else {
				w.status = StatusStopped
				w.mu.Unlock()
			}
		case <-w.stopChan:
			if stopFn != nil {
				if err := stopFn(); err != nil {
					log.Printf("[supervisor] error stopping runner %s: %v", id, err)
				}
			}
			w.setStatus(StatusStopped, 0)
		}
	}()

	return nil
}

// UnregisterRunner removes a completed external runner from the supervisor.
func (m *Manager) UnregisterRunner(id string) {
	m.mu.Lock()
	delete(m.workers, id)
	m.mu.Unlock()
}

// GetWorker retrieves live metadata for a specific worker.
func (m *Manager) GetWorker(id string) (*WorkerInfo, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	w, ok := m.workers[id]
	if !ok {
		return nil, ErrWorkerNotFound
	}

	info := w.Info()
	return &info, nil
}

// ListWorkers returns status snapshots for all registered workers.
func (m *Manager) ListWorkers() []*WorkerInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]*WorkerInfo, 0, len(m.workers))
	for _, w := range m.workers {
		info := w.Info()
		list = append(list, &info)
	}
	return list
}

// GetWorkerLogs retrieves stdout/stderr captured in the worker's ring buffer.
func (m *Manager) GetWorkerLogs(id string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	w, ok := m.workers[id]
	if !ok {
		return "", ErrWorkerNotFound
	}

	return w.Logs(), nil
}

// StopAll terminates all active workers cleanly within the context deadline.
func (m *Manager) StopAll(ctx context.Context) error {
	m.mu.RLock()
	workers := make([]*Worker, 0, len(m.workers))
	for _, w := range m.workers {
		workers = append(workers, w)
	}
	m.mu.RUnlock()

	var wg sync.WaitGroup
	for _, w := range workers {
		wg.Add(1)
		go func(target *Worker) {
			defer wg.Done()
			if err := target.Stop(1 * time.Second); err != nil {
				log.Printf("[supervisor] warning stopping worker %s: %v", target.cfg.ID, err)
			}
		}(w)
	}

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
