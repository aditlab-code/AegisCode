package terminal

import (
	"bytes"
	"syscall"
	"testing"
	"time"
)

func TestCreateSessionAndInput(t *testing.T) {
	mgr := NewManager()

	sess, err := mgr.CreateSession("test-1", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	if sess.ID != "test-1" {
		t.Fatalf("expected ID test-1, got %s", sess.ID)
	}

	sub, unsub, err := mgr.Subscribe("test-1")
	if err != nil {
		t.Fatalf("failed to subscribe: %v", err)
	}
	defer unsub()

	// Write input
	err = mgr.WriteInput("test-1", []byte("echo HELLO_AEGIS_PTY\n"))
	if err != nil {
		t.Fatalf("failed to write input: %v", err)
	}

	// Read output with timeout
	var output bytes.Buffer
	deadline := time.After(3 * time.Second)
	found := false

	for !found {
		select {
		case chunk, ok := <-sub:
			if !ok {
				t.Fatalf("subscription closed prematurely")
			}
			output.Write(chunk)
			if bytes.Contains(output.Bytes(), []byte("HELLO_AEGIS_PTY")) {
				found = true
			}
		case <-deadline:
			t.Fatalf("timed out waiting for output, received: %q", output.String())
		}
	}

	// Test Resize
	if err := mgr.Resize("test-1", 120, 40); err != nil {
		t.Fatalf("failed to resize session: %v", err)
	}

	// Test Close
	if err := mgr.CloseSession("test-1"); err != nil {
		t.Fatalf("failed to close session: %v", err)
	}

	// Ensure closed
	_, _, err = mgr.Subscribe("test-1")
	if err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}

func TestSessionNotFound(t *testing.T) {
	mgr := NewManager()

	if err := mgr.WriteInput("nonexistent", []byte("test")); err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}

	if err := mgr.Resize("nonexistent", 80, 24); err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}

	if err := mgr.CloseSession("nonexistent"); err != ErrSessionNotFound {
		t.Fatalf("expected ErrSessionNotFound, got %v", err)
	}
}

func TestListSessions(t *testing.T) {
	mgr := NewManager()

	sess1, err := mgr.CreateSession("term-1", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create term-1: %v", err)
	}
	defer func() { _ = mgr.CloseSession("term-1") }()

	list := mgr.ListSessions()
	if len(list) != 1 || list[0].ID != sess1.ID {
		t.Fatalf("expected 1 session, got %v", list)
	}

	found, err := mgr.GetSession("term-1")
	if err != nil || found.ID != "term-1" {
		t.Fatalf("expected to find term-1: %v", err)
	}
}

func TestCloseClosesSubscribersAndPid(t *testing.T) {
	mgr := NewManager()

	sess, err := mgr.CreateSession("term-close", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	if sess.Pid() <= 0 {
		t.Fatalf("expected valid PID, got %d", sess.Pid())
	}

	sub, _, err := mgr.Subscribe("term-close")
	if err != nil {
		t.Fatalf("failed to subscribe: %v", err)
	}

	if err := mgr.CloseSession("term-close"); err != nil {
		t.Fatalf("failed to close session: %v", err)
	}

	// Channel must be closed promptly
	select {
	case _, ok := <-sub:
		if ok {
			t.Fatalf("expected sub channel to be closed")
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timed out waiting for sub channel close")
	}

	// sess.Wait() channel must be closed
	select {
	case <-sess.Wait():
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("timed out waiting for sess.Wait()")
	}
}

func TestProcessGroupTermination(t *testing.T) {
	mgr := NewManager()

	sess, err := mgr.CreateSession("term-pgid", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}

	pid := sess.Pid()
	if pid <= 0 {
		t.Fatalf("expected positive PID, got %d", pid)
	}

	// Write command that spawns a background child process
	err = mgr.WriteInput("term-pgid", []byte("sleep 10 &\n"))
	if err != nil {
		t.Fatalf("failed to write input: %v", err)
	}

	time.Sleep(100 * time.Millisecond)

	// Close session, which terminates the process group
	if err := mgr.CloseSession("term-pgid"); err != nil {
		t.Fatalf("failed to close session: %v", err)
	}

	// Verify session is closed cleanly
	select {
	case <-sess.Wait():
	case <-time.After(1 * time.Second):
		t.Fatal("session did not finish within timeout")
	}
}

func TestKillProcessGroupInvalidPid(t *testing.T) {
	if err := killProcessGroup(0, syscall.SIGTERM); err == nil {
		t.Fatal("expected error when killing process group with PID 0, got nil")
	}

	if err := killProcessGroup(-5, syscall.SIGTERM); err == nil {
		t.Fatal("expected error when killing process group with negative PID, got nil")
	}
}

func TestRecreateSessionAfterAllTerminated(t *testing.T) {
	mgr := NewManager()

	// 1. Create first session and terminate it
	sess1, err := mgr.CreateSession("term-alpha", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create term-alpha: %v", err)
	}

	if err := mgr.CloseSession(sess1.ID); err != nil {
		t.Fatalf("failed to close term-alpha: %v", err)
	}

	if len(mgr.ListSessions()) != 0 {
		t.Fatalf("expected 0 active sessions after terminating all, got %d", len(mgr.ListSessions()))
	}

	// 2. Re-create new session when all previous sessions are terminated
	sess2, err := mgr.CreateSession("term-beta", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to re-create term-beta after all sessions terminated: %v", err)
	}
	defer func() { _ = mgr.CloseSession(sess2.ID) }()

	sub, unsub, err := mgr.Subscribe("term-beta")
	if err != nil {
		t.Fatalf("failed to subscribe to re-created session: %v", err)
	}
	defer unsub()

	if err := mgr.WriteInput("term-beta", []byte("echo REACTIVATED_OK\n")); err != nil {
		t.Fatalf("failed to write input to re-created session: %v", err)
	}

	var output bytes.Buffer
	deadline := time.After(3 * time.Second)
	found := false

	for !found {
		select {
		case chunk, ok := <-sub:
			if !ok {
				t.Fatalf("subscription closed prematurely")
			}
			output.Write(chunk)
			if bytes.Contains(output.Bytes(), []byte("REACTIVATED_OK")) {
				found = true
			}
		case <-deadline:
			t.Fatalf("timed out waiting for output from re-created session, received: %q", output.String())
		}
	}
}
