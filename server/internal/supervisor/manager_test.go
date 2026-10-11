package supervisor

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRingBuffer(t *testing.T) {
	rb := NewRingBuffer(16)

	// Write smaller than capacity
	n, err := rb.Write([]byte("hello"))
	if err != nil || n != 5 {
		t.Fatalf("unexpected write result: n=%d, err=%v", n, err)
	}
	if rb.String() != "hello" {
		t.Fatalf("expected 'hello', got %q", rb.String())
	}

	// Append up to capacity
	_, _ = rb.Write([]byte(" world!"))
	if rb.String() != "hello world!" {
		t.Fatalf("expected 'hello world!', got %q", rb.String())
	}

	// Overwrite beyond capacity
	_, _ = rb.Write([]byte(" 12345678"))
	out := rb.String()
	if len(out) != 16 {
		t.Fatalf("expected buffer length 16, got %d (%q)", len(out), out)
	}
	if !strings.HasSuffix(out, "12345678") {
		t.Fatalf("expected suffix '12345678', got %q", out)
	}

	// Large write exceeds full capacity in single call
	_, _ = rb.Write([]byte("0123456789abcdefghijklmnopqrstuvwxyz"))
	out2 := rb.String()
	if len(out2) != 16 {
		t.Fatalf("expected len 16, got %d", len(out2))
	}
	if out2 != "klmnopqrstuvwxyz" {
		t.Fatalf("expected tail 'klmnopqrstuvwxyz', got %q", out2)
	}
}

func TestWorkerNormalStartAndStop(t *testing.T) {
	mgr := NewManager(nil)

	_, err := mgr.StartWorker(WorkerConfig{
		ID:            "sleep-worker",
		Name:          "Sleep Test Worker",
		Command:       "sleep",
		Args:          []string{"10"},
		RestartPolicy: RestartNever,
	})
	if err != nil {
		t.Fatalf("failed to start worker: %v", err)
	}

	// Give a moment to transition to running
	time.Sleep(50 * time.Millisecond)

	info, err := mgr.GetWorker("sleep-worker")
	if err != nil {
		t.Fatalf("failed to get worker info: %v", err)
	}
	if info.Status != StatusRunning {
		t.Fatalf("expected StatusRunning, got %s", info.Status)
	}
	if info.PID <= 0 {
		t.Fatalf("expected valid PID, got %d", info.PID)
	}

	// Stop worker
	if err := mgr.StopWorker("sleep-worker"); err != nil {
		t.Fatalf("failed to stop worker: %v", err)
	}

	infoAfter, err := mgr.GetWorker("sleep-worker")
	if err != nil {
		t.Fatalf("failed to get worker info after stop: %v", err)
	}
	if infoAfter.Status != StatusStopped {
		t.Fatalf("expected StatusStopped, got %s", infoAfter.Status)
	}
}

func TestWorkerCrashIsolation(t *testing.T) {
	var crashReceived bool
	var crashMu sync.Mutex
	var capturedEvent CrashEvent

	mgr := NewManager(func(evt CrashEvent) {
		crashMu.Lock()
		crashReceived = true
		capturedEvent = evt
		crashMu.Unlock()
	})

	// Start a worker that immediately exits with error code 42
	_, err := mgr.StartWorker(WorkerConfig{
		ID:            "failing-worker",
		Name:          "Failing Worker",
		Command:       "sh",
		Args:          []string{"-c", "echo 'critical error' >&2; exit 42"},
		RestartPolicy: RestartNever,
	})
	if err != nil {
		t.Fatalf("failed to start failing worker: %v", err)
	}

	// Wait briefly for process to exit and supervisor to catch it
	time.Sleep(200 * time.Millisecond)

	crashMu.Lock()
	received := crashReceived
	evt := capturedEvent
	crashMu.Unlock()

	if !received {
		t.Fatalf("expected crash event to be received by supervisor")
	}
	if evt.WorkerID != "failing-worker" {
		t.Fatalf("expected WorkerID 'failing-worker', got %s", evt.WorkerID)
	}
	if evt.ExitCode != 42 {
		t.Fatalf("expected ExitCode 42, got %d", evt.ExitCode)
	}
	if !strings.Contains(evt.TailLogs, "critical error") {
		t.Fatalf("expected tail logs to contain 'critical error', got %q", evt.TailLogs)
	}

	info, err := mgr.GetWorker("failing-worker")
	if err != nil {
		t.Fatalf("failed to get worker info: %v", err)
	}
	if info.Status != StatusCrashed {
		t.Fatalf("expected StatusCrashed, got %s", info.Status)
	}
}

func TestWorkerRestartOnFailureQuota(t *testing.T) {
	crashCount := 0
	var crashMu sync.Mutex

	mgr := NewManager(func(evt CrashEvent) {
		crashMu.Lock()
		crashCount++
		crashMu.Unlock()
	})

	// Worker restarts on failure up to max 2 retries
	_, err := mgr.StartWorker(WorkerConfig{
		ID:            "restarting-worker",
		Name:          "Restarting Worker",
		Command:       "sh",
		Args:          []string{"-c", "exit 1"},
		RestartPolicy: RestartOnFailure,
		MaxRetries:    2,
		RetryWindow:   2 * time.Second,
	})
	if err != nil {
		t.Fatalf("failed to start worker: %v", err)
	}

	// Wait for retries to exhaust (each backoff is ~100ms, 200ms)
	time.Sleep(800 * time.Millisecond)

	info, err := mgr.GetWorker("restarting-worker")
	if err != nil {
		t.Fatalf("failed to get worker info: %v", err)
	}
	if info.Status != StatusCrashed {
		t.Fatalf("expected StatusCrashed after exhausting retries, got %s", info.Status)
	}
	if info.RestartCount < 2 {
		t.Fatalf("expected at least 2 restarts, got %d", info.RestartCount)
	}

	crashMu.Lock()
	count := crashCount
	crashMu.Unlock()
	if count < 2 {
		t.Fatalf("expected at least 2 crash events, got %d", count)
	}
}

func TestStopAll(t *testing.T) {
	mgr := NewManager(nil)

	_, err1 := mgr.StartWorker(WorkerConfig{
		ID:      "w1",
		Command: "sleep",
		Args:    []string{"10"},
	})
	if err1 != nil {
		t.Fatalf("failed to start w1: %v", err1)
	}

	_, err2 := mgr.StartWorker(WorkerConfig{
		ID:      "w2",
		Command: "sleep",
		Args:    []string{"10"},
	})
	if err2 != nil {
		t.Fatalf("failed to start w2: %v", err2)
	}

	time.Sleep(50 * time.Millisecond)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := mgr.StopAll(ctx); err != nil {
		t.Fatalf("failed to stop all workers: %v", err)
	}

	for _, w := range mgr.ListWorkers() {
		if w.Status != StatusStopped {
			t.Fatalf("expected worker %s to be stopped, got %s", w.ID, w.Status)
		}
	}
}

func TestDeleteWorker(t *testing.T) {
	mgr := NewManager(nil)

	_, err := mgr.StartWorker(WorkerConfig{
		ID:      "to-delete",
		Command: "sleep",
		Args:    []string{"10"},
	})
	if err != nil {
		t.Fatalf("failed to start worker: %v", err)
	}

	time.Sleep(50 * time.Millisecond)

	if err := mgr.DeleteWorker("to-delete"); err != nil {
		t.Fatalf("failed to delete worker: %v", err)
	}

	_, err = mgr.GetWorker("to-delete")
	if err != ErrWorkerNotFound {
		t.Fatalf("expected ErrWorkerNotFound after delete, got %v", err)
	}
}

func TestRegisterRunner(t *testing.T) {
	mgr := NewManager(nil)

	waitDone := make(chan error, 1)
	stopCalled := false
	err := mgr.RegisterRunner("runner-1", "Mock Runner", "mock", 1234, func() error {
		stopCalled = true
		return nil
	}, waitDone)
	if err != nil {
		t.Fatalf("failed to register runner: %v", err)
	}

	info, err := mgr.GetWorker("runner-1")
	if err != nil {
		t.Fatalf("failed to get runner: %v", err)
	}
	if info.Status != StatusRunning || info.PID != 1234 {
		t.Fatalf("expected running with PID 1234, got %+v", info)
	}

	// Stop runner
	if err := mgr.StopWorker("runner-1"); err != nil {
		t.Fatalf("failed to stop runner: %v", err)
	}
	if !stopCalled {
		t.Fatalf("expected stopFn to be invoked")
	}

	mgr.UnregisterRunner("runner-1")
	_, err = mgr.GetWorker("runner-1")
	if err != ErrWorkerNotFound {
		t.Fatalf("expected ErrWorkerNotFound, got %v", err)
	}
}
