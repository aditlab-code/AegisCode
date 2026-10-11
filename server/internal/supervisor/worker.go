package supervisor

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// Worker supervises a single external child process with crash isolation and restart management.
type Worker struct {
	cfg          WorkerConfig
	status       WorkerStatus
	cmd          *exec.Cmd
	pid          int
	restartCount int
	restartTimes []time.Time
	startTime    time.Time
	lastError    string
	logs         *RingBuffer
	mu           sync.RWMutex
	stopChan     chan struct{}
	doneChan     chan struct{}
	cancel       context.CancelFunc
	stopped      bool
	onCrash      func(evt CrashEvent)
}

func newWorker(cfg WorkerConfig, onCrash func(evt CrashEvent)) *Worker {
	if cfg.MaxRetries <= 0 {
		cfg.MaxRetries = 3
	}
	if cfg.RetryWindow <= 0 {
		cfg.RetryWindow = 30 * time.Second
	}
	if cfg.RestartPolicy == "" {
		cfg.RestartPolicy = RestartNever
	}

	return &Worker{
		cfg:      cfg,
		status:   StatusStarting,
		logs:     NewRingBuffer(64 * 1024),
		stopChan: make(chan struct{}),
		doneChan: make(chan struct{}),
		onCrash:  onCrash,
	}
}

// Start launches the supervisor lifecycle goroutine for the worker.
func (w *Worker) Start() error {
	w.mu.Lock()
	if w.stopped {
		w.mu.Unlock()
		return errors.New("cannot start a stopped worker")
	}
	w.mu.Unlock()

	go w.runSupervisedLoop()
	return nil
}

func (w *Worker) isStopped() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.stopped
}

func (w *Worker) runSupervisedLoop() {
	defer close(w.doneChan)

	for {
		if w.isStopped() {
			w.setStatus(StatusStopped, 0)
			return
		}

		// Check restart policy and retry limit window
		w.mu.Lock()
		if w.restartCount > 0 {
			now := time.Now()
			cutoff := now.Add(-w.cfg.RetryWindow)
			validTimes := make([]time.Time, 0, len(w.restartTimes))
			for _, t := range w.restartTimes {
				if t.After(cutoff) {
					validTimes = append(validTimes, t)
				}
			}
			w.restartTimes = validTimes

			if len(w.restartTimes) >= w.cfg.MaxRetries {
				w.status = StatusCrashed
				w.lastError = fmt.Sprintf("exceeded max retries (%d in %v)", w.cfg.MaxRetries, w.cfg.RetryWindow)
				w.mu.Unlock()
				return
			}
		}
		w.mu.Unlock()

		ctx, cancel := context.WithCancel(context.Background())
		cmd := exec.CommandContext(ctx, w.cfg.Command, w.cfg.Args...)
		cmd.Env = append(os.Environ(), w.cfg.Env...)
		if w.cfg.Dir != "" {
			cmd.Dir = w.cfg.Dir
		}
		setProcessGroup(cmd)
		cmd.Stdout = w.logs
		cmd.Stderr = w.logs

		w.mu.Lock()
		w.cmd = cmd
		w.cancel = cancel
		w.mu.Unlock()

		if err := cmd.Start(); err != nil {
			cancel()
			w.mu.Lock()
			w.status = StatusCrashed
			w.lastError = fmt.Sprintf("start failed: %v", err)
			w.mu.Unlock()

			if w.onCrash != nil {
				w.onCrash(CrashEvent{
					WorkerID:  w.cfg.ID,
					Name:      w.cfg.Name,
					ExitCode:  -1,
					Error:     err.Error(),
					TailLogs:  w.logs.String(),
					Timestamp: time.Now(),
				})
			}
			return
		}

		pid := cmd.Process.Pid
		w.mu.Lock()
		w.pid = pid
		w.startTime = time.Now()
		w.status = StatusRunning
		w.mu.Unlock()

		waitDone := make(chan error, 1)
		go func() {
			waitDone <- cmd.Wait()
		}()

		select {
		case err := <-waitDone:
			cancel()
			if w.isStopped() {
				w.setStatus(StatusStopped, 0)
				return
			}

			if err != nil {
				exitCode := -1
				var exitErr *exec.ExitError
				if errors.As(err, &exitErr) {
					exitCode = exitErr.ExitCode()
				}

				w.mu.Lock()
				w.lastError = err.Error()
				w.pid = 0
				w.mu.Unlock()

				if w.onCrash != nil {
					w.onCrash(CrashEvent{
						WorkerID:  w.cfg.ID,
						Name:      w.cfg.Name,
						ExitCode:  exitCode,
						Error:     err.Error(),
						TailLogs:  w.logs.String(),
						Timestamp: time.Now(),
					})
				}

				if w.cfg.RestartPolicy == RestartOnFailure {
					w.mu.Lock()
					now := time.Now()
					cutoff := now.Add(-w.cfg.RetryWindow)
					validTimes := make([]time.Time, 0, len(w.restartTimes)+1)
					for _, t := range w.restartTimes {
						if t.After(cutoff) {
							validTimes = append(validTimes, t)
						}
					}
					validTimes = append(validTimes, now)
					w.restartTimes = validTimes
					w.restartCount++

					// Fail-fast: if quota exhausted, transition to crashed without sleeping backoff
					if len(w.restartTimes) > w.cfg.MaxRetries {
						w.status = StatusCrashed
						w.lastError = fmt.Sprintf("exceeded max retries (%d in %v)", w.cfg.MaxRetries, w.cfg.RetryWindow)
						w.mu.Unlock()
						return
					}

					w.status = StatusBackoff
					count := w.restartCount
					w.mu.Unlock()

					// Exponential backoff capped at 2s
					backoff := time.Duration(100*(1<<(count-1))) * time.Millisecond
					if backoff > 2*time.Second {
						backoff = 2 * time.Second
					}

					select {
					case <-time.After(backoff):
						continue
					case <-w.stopChan:
						w.setStatus(StatusStopped, 0)
						return
					}
				}

				w.setStatus(StatusCrashed, 0)
				return
			}

			// Clean exit (exit code 0)
			w.setStatus(StatusStopped, 0)
			return

		case <-w.stopChan:
			w.mu.Lock()
			activePid := w.pid
			w.mu.Unlock()

			if activePid > 0 {
				if err := killProcessGroup(activePid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
					log.Printf("[supervisor] warning sending SIGTERM to process group %d: %v", activePid, err)
				}
				select {
				case <-waitDone:
				case <-time.After(250 * time.Millisecond):
					if err := killProcessGroup(activePid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
						log.Printf("[supervisor] warning sending SIGKILL to process group %d: %v", activePid, err)
					}
					if cmd.Process != nil {
						if err := cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) && !errors.Is(err, syscall.ESRCH) {
							log.Printf("[supervisor] warning killing process %d: %v", activePid, err)
						}
					}
					<-waitDone
				}
			}
			cancel()
			w.setStatus(StatusStopped, 0)
			return
		}
	}
}

func (w *Worker) setStatus(st WorkerStatus, pid int) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.status = st
	w.pid = pid
}

// Stop gracefully shuts down the worker process within the provided timeout.
func (w *Worker) Stop(timeout time.Duration) error {
	w.mu.Lock()
	if w.stopped {
		w.mu.Unlock()
		return nil
	}
	w.stopped = true
	close(w.stopChan)
	w.mu.Unlock()

	select {
	case <-w.doneChan:
		return nil
	case <-time.After(timeout):
		w.mu.RLock()
		pid := w.pid
		w.mu.RUnlock()
		if pid > 0 {
			if err := killProcessGroup(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
				log.Printf("[supervisor] warning force killing process group %d: %v", pid, err)
			}
		}
		select {
		case <-w.doneChan:
			return nil
		case <-time.After(500 * time.Millisecond):
			return fmt.Errorf("worker %s did not terminate cleanly within timeout", w.cfg.ID)
		}
	}
}

// Info returns a snapshot of worker runtime metadata.
func (w *Worker) Info() WorkerInfo {
	w.mu.RLock()
	defer w.mu.RUnlock()

	var uptime int64
	if w.status == StatusRunning && !w.startTime.IsZero() {
		uptime = int64(time.Since(w.startTime).Seconds())
	}

	return WorkerInfo{
		ID:           w.cfg.ID,
		Name:         w.cfg.Name,
		Command:      w.cfg.Command,
		Status:       w.status,
		PID:          w.pid,
		RestartCount: w.restartCount,
		Uptime:       uptime,
		LastError:    w.lastError,
	}
}

// Logs returns combined stdout/stderr history from the internal ring buffer.
func (w *Worker) Logs() string {
	return w.logs.String()
}
