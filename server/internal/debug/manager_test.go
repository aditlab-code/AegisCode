package debug

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestDebugManagerInitialState(t *testing.T) {
	mgr := NewManager()
	if mgr.IsActive() {
		t.Fatalf("expected manager to be initially inactive")
	}

	st := mgr.GetState()
	if st.Status != "idle" || st.Active {
		t.Fatalf("unexpected state: %+v", st)
	}

	// Setting breakpoints when idle
	bps, err := mgr.SetBreakpoints(context.Background(), "main.go", []int{10, 25})
	if err != nil {
		t.Fatalf("SetBreakpoints failed: %v", err)
	}
	if len(bps) != 2 || bps[0].Line != 10 || bps[1].Line != 25 {
		t.Fatalf("unexpected breakpoints returned: %+v", bps)
	}

	// Step when inactive returns error
	err = mgr.Step(context.Background(), "continue")
	if err == nil {
		t.Fatalf("expected error when stepping inactive manager")
	}

	// Terminate when inactive is a safe no-op
	if err := mgr.Terminate(); err != nil {
		t.Fatalf("terminate error: %v", err)
	}
}

func TestDebugManagerSubscribe(t *testing.T) {
	mgr := NewManager()
	ch, unsub := mgr.Subscribe()
	defer unsub()

	// Broadcast dummy event
	mgr.broadcast(StreamDebugEvent{
		Type:   "debug:started",
		Status: "running",
	})

	select {
	case evt := <-ch:
		if evt.Type != "debug:started" || evt.Status != "running" {
			t.Fatalf("unexpected event: %+v", evt)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timed out waiting for broadcast event")
	}
}

func TestDebugManagerStartFailureHandling(t *testing.T) {
	_, err := FindDelve()
	if err != nil {
		t.Skip("skipping TestDebugManagerStartFailureHandling because dlv is not installed")
	}

	mgr := NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Starting with a non-existent package path should fail at launch, cleanly terminate, and leave manager idle
	err = mgr.Start(ctx, StartDebugRequest{
		Program: "./nonexistent_package_that_does_not_exist",
	})
	if err == nil {
		_ = mgr.Terminate()
		t.Fatalf("expected Start to fail for nonexistent program")
	}

	if mgr.IsActive() {
		t.Fatalf("manager should not be active after failed start")
	}

	st := mgr.GetState()
	if st.Active || st.Status != "idle" {
		t.Fatalf("expected state to reset to idle, got: %+v", st)
	}
}

func TestDebugManagerRealLifecycle(t *testing.T) {
	_, err := FindDelve()
	if err != nil {
		t.Skip("skipping TestDebugManagerRealLifecycle because dlv is not installed")
	}

	mgr := NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	serverRoot, err := filepath.Abs("../..")
	if err != nil {
		t.Fatalf("failed to determine serverRoot: %v", err)
	}
	programPath := filepath.Join(serverRoot, "cmd", "server")

	// Launch cmd/server
	err = mgr.Start(ctx, StartDebugRequest{
		Program: programPath,
		Cwd:     serverRoot,
	})
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if !mgr.IsActive() {
		t.Fatalf("expected manager to be active after start")
	}

	st := mgr.GetState()
	if !st.Active {
		t.Fatalf("expected active state, got: %+v", st)
	}

	// Cleanly terminate
	if err := mgr.Terminate(); err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}

	if mgr.IsActive() {
		t.Fatalf("expected manager to be inactive after terminate")
	}
}

func TestDebugManagerPythonLifecycle(t *testing.T) {
	pyBin, err := FindPython()
	if err != nil {
		t.Skip("skipping TestDebugManagerPythonLifecycle: python3 not found")
	}
	if err := exec.Command(pyBin, "-m", "debugpy", "--version").Run(); err != nil {
		t.Skip("skipping TestDebugManagerPythonLifecycle: debugpy not installed")
	}

	tmpDir := t.TempDir()
	scriptPath := filepath.Join(tmpDir, "test_debug.py")
	scriptContent := "import time\nx = 42\nprint('Python debug test running')\ntime.sleep(2)\n"
	if err := os.WriteFile(scriptPath, []byte(scriptContent), 0644); err != nil {
		t.Fatalf("failed to write test python file: %v", err)
	}

	mgr := NewManager()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	err = mgr.Start(ctx, StartDebugRequest{
		Program:  scriptPath,
		Cwd:      tmpDir,
		Language: "python",
	})
	if err != nil {
		t.Fatalf("Start python debug failed: %v", err)
	}

	if !mgr.IsActive() {
		t.Fatalf("expected manager to be active after start")
	}

	st := mgr.GetState()
	if !st.Active {
		t.Fatalf("expected active state, got: %+v", st)
	}

	// Cleanly terminate
	if err := mgr.Terminate(); err != nil {
		t.Fatalf("Terminate failed: %v", err)
	}

	if mgr.IsActive() {
		t.Fatalf("expected manager to be inactive after terminate")
	}
}

