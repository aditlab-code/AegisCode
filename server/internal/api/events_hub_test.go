package api

import (
	"bufio"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/supervisor"
)

func TestEventHubBasic(t *testing.T) {
	h := NewEventHub()
	if h.SubscriberCount() != 0 {
		t.Fatalf("expected 0 subscribers, got %d", h.SubscriberCount())
	}

	ch, unsub := h.Subscribe()
	if h.SubscriberCount() != 1 {
		t.Fatalf("expected 1 subscriber, got %d", h.SubscriberCount())
	}

	// Publish an event
	h.Publish("logs", "log", map[string]string{"msg": "test-log"})

	select {
	case evt := <-ch:
		if evt.Channel != "logs" {
			t.Errorf("expected channel logs, got %s", evt.Channel)
		}
		if evt.Type != "log" {
			t.Errorf("expected type log, got %s", evt.Type)
		}
		if evt.Timestamp <= 0 {
			t.Errorf("expected valid timestamp > 0, got %d", evt.Timestamp)
		}
		payloadMap, ok := evt.Payload.(map[string]string)
		if !ok || payloadMap["msg"] != "test-log" {
			t.Errorf("unexpected payload: %v", evt.Payload)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timed out waiting for event")
	}

	// Test non-blocking drop: flood subscriber buffer (size 128)
	for i := 0; i < 200; i++ {
		h.Publish("test", "flood", i)
	}

	// Unsubscribe
	unsub()
	if h.SubscriberCount() != 0 {
		t.Fatalf("expected 0 subscribers after unsub, got %d", h.SubscriberCount())
	}
}

func TestUnifiedEventsHTTP(t *testing.T) {
	srv, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)
	defer func() { _ = srv.ws.Close() }()

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. Non-GET method should return 405
	postReq, err := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/events", nil)
	if err != nil {
		t.Fatalf("failed to create POST request: %v", err)
	}
	postResp, err := http.DefaultClient.Do(postReq)
	if err != nil {
		t.Fatalf("failed to execute POST request: %v", err)
	}
	_ = postResp.Body.Close()
	if postResp.StatusCode != http.StatusMethodNotAllowed {
		t.Fatalf("expected 405 Method Not Allowed, got %d", postResp.StatusCode)
	}

	// 2. GET /api/v1/events SSE stream
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, ts.URL+"/api/v1/events", nil)
	if err != nil {
		t.Fatalf("failed to create GET request: %v", err)
	}

	resp, err := http.DefaultClient.Do(getReq)
	if err != nil {
		t.Fatalf("failed to connect to SSE: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.Contains(ct, "text/event-stream") {
		t.Fatalf("expected text/event-stream, got %s", ct)
	}

	reader := bufio.NewReader(resp.Body)

	// Helper to read next SSE message (event and data)
	readSSE := func(timeout time.Duration) (string, string) {
		type result struct {
			evt  string
			data string
		}
		ch := make(chan result, 1)

		go func() {
			var currentEvt string
			var currentData string
			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					return
				}
				line = strings.TrimSpace(line)
				if strings.HasPrefix(line, "event:") {
					currentEvt = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
				} else if strings.HasPrefix(line, "data:") {
					currentData = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
				} else if line == "" && (currentEvt != "" || currentData != "") {
					ch <- result{evt: currentEvt, data: currentData}
					return
				}
			}
		}()

		select {
		case r := <-ch:
			return r.evt, r.data
		case <-time.After(timeout):
			return "", ""
		}
	}

	// Verify initial connected event
	evt, data := readSSE(2 * time.Second)
	if evt != "connected" {
		t.Fatalf("expected initial event: connected, got '%s'", evt)
	}
	if !strings.Contains(data, `"status":"connected"`) {
		t.Fatalf("expected data containing status:connected, got '%s'", data)
	}

	// 3. Test BroadcastLog -> multiplexed "logs" channel
	srv.BroadcastLog("System", "Service online", "info")
	evt, data = readSSE(2 * time.Second)
	if evt != "message" {
		t.Fatalf("expected event: message, got '%s'", evt)
	}
	var hubEvt HubEvent
	if err := json.Unmarshal([]byte(data), &hubEvt); err != nil {
		t.Fatalf("failed to unmarshal hub event: %v", err)
	}
	if hubEvt.Channel != "logs" || hubEvt.Type != "log" {
		t.Errorf("expected channel logs and type log, got %s / %s", hubEvt.Channel, hubEvt.Type)
	}

	// 4. Test BroadcastWorkerCrash -> multiplexed "workers" channel
	srv.BroadcastWorkerCrash(supervisor.CrashEvent{
		WorkerID: "w-test-1",
		Name:     "Test Worker",
		Error:    "out of memory",
	})
	evt, data = readSSE(2 * time.Second)
	if evt != "message" {
		t.Fatalf("expected event: message, got '%s'", evt)
	}
	if err := json.Unmarshal([]byte(data), &hubEvt); err != nil {
		t.Fatalf("failed to unmarshal worker crash hub event: %v", err)
	}
	if hubEvt.Channel != "workers" || hubEvt.Type != "crash" {
		t.Errorf("expected channel workers and type crash, got %s / %s", hubEvt.Channel, hubEvt.Type)
	}

	// 5. Test Workspace change bridge -> multiplexed "workspace" channel
	_ = srv.ws.WriteFile("hub_test.txt", "hello hub")
	evt, data = readSSE(2 * time.Second)
	if evt != "message" {
		t.Fatalf("expected event: message, got '%s'", evt)
	}
	if err := json.Unmarshal([]byte(data), &hubEvt); err != nil {
		t.Fatalf("failed to unmarshal workspace hub event: %v", err)
	}
	if hubEvt.Channel != "workspace" || hubEvt.Type != "change" {
		t.Errorf("expected channel workspace and type change, got %s / %s", hubEvt.Channel, hubEvt.Type)
	}
}

