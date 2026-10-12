package terminal

import (
	"bytes"
	"fmt"
	"strings"
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

func TestZshSession(t *testing.T) {
	mgr := NewManager()
	sess, err := mgr.CreateSession("term-zsh", "zsh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create zsh session: %v", err)
	}
	defer func() { _ = mgr.CloseSession(sess.ID) }()

	sub, unsub, err := mgr.Subscribe("term-zsh")
	if err != nil {
		t.Fatalf("failed to subscribe to zsh: %v", err)
	}
	defer unsub()

	if err := mgr.WriteInput("term-zsh", []byte("echo ZSH_RUNNING_TEST\n")); err != nil {
		t.Fatalf("failed to write input: %v", err)
	}

	var output bytes.Buffer
	deadline := time.After(3 * time.Second)
	found := false

	for !found {
		select {
		case chunk, ok := <-sub:
			if !ok {
				t.Fatalf("subscription closed prematurely, output so far: %q", output.String())
			}
			output.Write(chunk)
			if bytes.Contains(output.Bytes(), []byte("ZSH_RUNNING_TEST")) {
				found = true
			}
		case <-deadline:
			t.Fatalf("timed out waiting for zsh output, received: %q", output.String())
		}
	}
}

func TestReplayHistoryBuffer(t *testing.T) {
	mgr := NewManager()
	sess, err := mgr.CreateSession("term-replay", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	defer func() { _ = mgr.CloseSession(sess.ID) }()

	// Write input BEFORE subscribing, simulating prompt/output before SSE connects
	if err := mgr.WriteInput("term-replay", []byte("echo REPLAYED_PROMPT_12345\n")); err != nil {
		t.Fatalf("failed to write input: %v", err)
	}

	// Give shell a brief moment to process and emit output into history buffer
	time.Sleep(100 * time.Millisecond)

	// Late subscriber joins now
	sub, unsub, err := mgr.Subscribe("term-replay")
	if err != nil {
		t.Fatalf("failed to subscribe: %v", err)
	}
	defer unsub()

	var output bytes.Buffer
	deadline := time.After(2 * time.Second)
	found := false

	for !found {
		select {
		case chunk, ok := <-sub:
			if !ok {
				t.Fatalf("subscription closed prematurely")
			}
			output.Write(chunk)
			if bytes.Contains(output.Bytes(), []byte("REPLAYED_PROMPT_12345")) {
				found = true
			}
		case <-deadline:
			t.Fatalf("timed out waiting for replayed output, received: %q", output.String())
		}
	}
}

func TestResolveShells(t *testing.T) {
	// 1. Preferred zsh
	pathZsh, argsZsh, err := resolveShell("zsh")
	if err != nil {
		t.Fatalf("resolve zsh failed: %v", err)
	}
	if pathZsh == "" || len(argsZsh) != 1 || argsZsh[0] != "-l" {
		t.Fatalf("expected zsh with [-l], got %s %v", pathZsh, argsZsh)
	}

	// 2. Preferred bash
	pathBash, argsBash, err := resolveShell("bash")
	if err != nil {
		t.Fatalf("resolve bash failed: %v", err)
	}
	if pathBash == "" || len(argsBash) != 1 || argsBash[0] != "-l" {
		t.Fatalf("expected bash with [-l], got %s %v", pathBash, argsBash)
	}

	// 3. Preferred sh
	pathSh, argsSh, err := resolveShell("sh")
	if err != nil {
		t.Fatalf("resolve sh failed: %v", err)
	}
	if pathSh == "" {
		t.Fatalf("expected valid sh path, got empty")
	}
	if len(argsSh) != 0 {
		t.Fatalf("expected sh with no args, got %v", argsSh)
	}
}

func TestLosslessHighThroughputBurst(t *testing.T) {
	mgr := NewManager()
	sess, err := mgr.CreateSession("term-burst", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	defer func() { _ = mgr.CloseSession(sess.ID) }()

	sub, unsub, err := mgr.Subscribe("term-burst")
	if err != nil {
		t.Fatalf("failed to subscribe: %v", err)
	}
	defer unsub()

	// Allow shell process to initialize and emit startup prompt
	time.Sleep(150 * time.Millisecond)

	// Generate 1000 sequential lines quickly using seq command
	// The completion marker is dynamically evaluated to avoid matching the echoed command text
	script := "seq 1 1000; echo DONE_$(echo BURST_FLAG)\n"
	if err := mgr.WriteInput("term-burst", []byte(script)); err != nil {
		t.Fatalf("failed to write input: %v", err)
	}

	var output bytes.Buffer
	deadline := time.After(10 * time.Second)
	done := false

	for !done {
		select {
		case chunk, ok := <-sub:
			if !ok {
				t.Fatalf("subscription closed before completion, output so far: %d bytes", output.Len())
			}
			output.Write(chunk)
			if bytes.Contains(output.Bytes(), []byte("DONE_BURST_FLAG")) {
				done = true
			}
		case <-deadline:
			t.Fatalf("timed out waiting for burst output completion, output size: %d bytes", output.Len())
		}
	}

	outStr := output.String()
	for i := 1; i <= 1000; i++ {
		// Verify every sequence number is present as a standalone line in terminal output
		if !strings.Contains(outStr, fmt.Sprintf("%d\r", i)) && !strings.Contains(outStr, fmt.Sprintf("%d\n", i)) {
			t.Fatalf("loss detected: missing expected sequence item %d in stream, total len: %d", i, len(outStr))
		}
	}
}

func TestAdaptiveBackpressurePacing(t *testing.T) {
	mgr := NewManager()
	sess, err := mgr.CreateSession("term-bp", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	defer func() { _ = mgr.CloseSession(sess.ID) }()

	sub, unsub, err := mgr.Subscribe("term-bp")
	if err != nil {
		t.Fatalf("failed to subscribe: %v", err)
	}
	defer unsub()

	// Locate the active subscriber
	sess.subMu.Lock()
	var targetSub *subscriber
	for s := range sess.subs {
		targetSub = s
		break
	}
	sess.subMu.Unlock()

	if targetSub == nil {
		t.Fatal("no subscriber found")
	}

	// Write 5 MB dummy data to cross highWaterMarkBytes (2 MB) even with out channel buffer
	dummyData := bytes.Repeat([]byte("X"), 5*1024*1024)
	targetSub.write(dummyData)

	bpTriggered := make(chan struct{})
	go func() {
		sess.waitBackpressure()
		close(bpTriggered)
	}()

	// waitBackpressure should NOT return immediately
	select {
	case <-bpTriggered:
		t.Fatal("expected waitBackpressure to pause when buffer > highWaterMarkBytes, but returned immediately")
	case <-time.After(50 * time.Millisecond):
		// Expected: it is paused
	}

	// Drain subscriber buffer below lowWaterMarkBytes
	targetSub.mu.Lock()
	_ = targetSub.buf.PopChunk(targetSub.buf.Len())
	targetSub.mu.Unlock()
	sess.notifyDrain()

	// Read from sub channel to keep pipe moving
	go func() {
		for len(sub) > 0 {
			<-sub
		}
	}()

	// waitBackpressure should now unblock promptly
	select {
	case <-bpTriggered:
		// Succeeded unblocking
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for waitBackpressure to unblock after drain")
	}
}

func TestStalledSubscriberEviction(t *testing.T) {
	mgr := NewManager()
	sess, err := mgr.CreateSession("term-stalled", "sh", "", 80, 24)
	if err != nil {
		t.Fatalf("failed to create session: %v", err)
	}
	defer func() { _ = mgr.CloseSession(sess.ID) }()

	_, unsub, err := mgr.Subscribe("term-stalled")
	if err != nil {
		t.Fatalf("failed to subscribe: %v", err)
	}
	defer unsub()

	sess.subMu.Lock()
	var targetSub *subscriber
	for s := range sess.subs {
		targetSub = s
		break
	}
	sess.subMu.Unlock()

	if targetSub == nil {
		t.Fatal("no subscriber found")
	}

	// Write data > highWaterMarkBytes and set lastActive to older than stalledTimeout
	dummyData := bytes.Repeat([]byte("Y"), 5*1024*1024)
	targetSub.write(dummyData)
	time.Sleep(50 * time.Millisecond) // wait for worker to fill out channel
	targetSub.mu.Lock()
	targetSub.lastActive = time.Now().Add(-20 * time.Second)
	targetSub.mu.Unlock()

	// waitBackpressure should evict the stalled subscriber without hanging
	done := make(chan struct{})
	go func() {
		sess.waitBackpressure()
		close(done)
	}()

	select {
	case <-done:
		// waitBackpressure finished by evicting the stalled sub
	case <-time.After(500 * time.Millisecond):
		t.Fatal("waitBackpressure timed out; stalled sub was not evicted")
	}

	// Verify subscriber was removed from sess.subs
	sess.subMu.Lock()
	_, exists := sess.subs[targetSub]
	sess.subMu.Unlock()

	if exists {
		t.Fatal("expected stalled subscriber to be evicted from sess.subs")
	}
}

