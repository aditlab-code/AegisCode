package debug

import (
	"context"
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
