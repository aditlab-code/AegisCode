package debug

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"
)

// mockDAPServer spins up an in-memory TCP server speaking DAP framing.
func mockDAPServer(t *testing.T, handler func(req Request, w io.Writer)) (string, func()) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen on mock DAP server: %v", err)
	}

	done := make(chan struct{})

	go func() {
		defer close(done)
		for {
			conn, err := l.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				reader := bufio.NewReader(c)
				for {
					contentLen := -1
					for {
						line, err := reader.ReadString('\n')
						if err != nil {
							return
						}
						line = strings.TrimSpace(line)
						if line == "" {
							break
						}
						if strings.HasPrefix(strings.ToLower(line), "content-length:") {
							parts := strings.SplitN(line, ":", 2)
							if len(parts) == 2 {
								contentLen, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
							}
						}
					}
					if contentLen <= 0 {
						continue
					}
					body := make([]byte, contentLen)
					if _, err := io.ReadFull(reader, body); err != nil {
						return
					}
					var req Request
					if err := json.Unmarshal(body, &req); err == nil {
						handler(req, c)
					}
				}
			}(conn)
		}
	}()

	teardown := func() {
		_ = l.Close()
		<-done
	}

	return l.Addr().String(), teardown
}

func sendDAPFrame(w io.Writer, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	frame := fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(data), string(data))
	_, err = w.Write([]byte(frame))
	return err
}

func TestDAPClientRequestResponse(t *testing.T) {
	addr, teardown := mockDAPServer(t, func(req Request, w io.Writer) {
		switch req.Command {
		case "initialize":
			resp := Response{
				Seq:        100,
				Type:       "response",
				RequestSeq: req.Seq,
				Success:    true,
				Command:    req.Command,
				Body:       json.RawMessage(`{"supportsConfigurationDoneRequest": true}`),
			}
			_ = sendDAPFrame(w, resp)
		case "setBreakpoints":
			resp := Response{
				Seq:        101,
				Type:       "response",
				RequestSeq: req.Seq,
				Success:    true,
				Command:    req.Command,
				Body:       json.RawMessage(`{"breakpoints": [{"id": 1, "verified": true, "line": 42}]}`),
			}
			_ = sendDAPFrame(w, resp)
		}
	})
	defer teardown()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	client, err := DialDAP(ctx, addr)
	if err != nil {
		t.Fatalf("DialDAP failed: %v", err)
	}
	defer client.Close()

	// 1. Initialize
	initResp, err := client.Initialize(ctx)
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}
	if !initResp.Success {
		t.Fatalf("expected successful initialize")
	}

	// 2. SetBreakpoints
	bps, err := client.SetBreakpoints(ctx, "main.go", []int{42})
	if err != nil {
		t.Fatalf("SetBreakpoints failed: %v", err)
	}
	if len(bps) != 1 || bps[0].Line != 42 || !bps[0].Verified {
		t.Fatalf("unexpected breakpoints response: %+v", bps)
	}
}

func TestDAPClientEventStreaming(t *testing.T) {
	var connWriter io.Writer
	connReady := make(chan struct{})

	addr, teardown := mockDAPServer(t, func(req Request, w io.Writer) {
		connWriter = w
		select {
		case <-connReady:
		default:
			close(connReady)
		}
		// Send standard response
		resp := Response{
			Seq:        200,
			Type:       "response",
			RequestSeq: req.Seq,
			Success:    true,
			Command:    req.Command,
		}
		_ = sendDAPFrame(w, resp)
	})
	defer teardown()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	client, err := DialDAP(ctx, addr)
	if err != nil {
		t.Fatalf("DialDAP failed: %v", err)
	}
	defer client.Close()

	eventCh, unsubscribe := client.SubscribeEvents()
	defer unsubscribe()

	// Trigger a dummy request so mock captures writer
	_, _ = client.SendRequest(ctx, "test", nil)
	<-connReady

	// Simulate Delve sending "stopped" event
	evt := Event{
		Seq:   300,
		Type:  "event",
		Event: "stopped",
		Body:  json.RawMessage(`{"reason": "breakpoint", "threadId": 1}`),
	}
	if err := sendDAPFrame(connWriter, evt); err != nil {
		t.Fatalf("failed to send mock event: %v", err)
	}

	select {
	case received := <-eventCh:
		if received.Event != "stopped" {
			t.Fatalf("expected stopped event, got %s", received.Event)
		}
	case <-time.After(1 * time.Second):
		t.Fatalf("timed out waiting for event")
	}
}

func TestDAPClientConnectionDropResilience(t *testing.T) {
	// Mock server that abruptly closes connection as soon as a request starts
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer l.Close()

	go func() {
		conn, err := l.Accept()
		if err == nil {
			_ = conn.Close()
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	client, err := DialDAP(ctx, l.Addr().String())
	if err != nil {
		t.Fatalf("DialDAP failed: %v", err)
	}
	defer client.Close()

	// Ensure calling SendRequest after drop returns an error cleanly without panicking
	_, err = client.Initialize(ctx)
	if err == nil {
		t.Fatalf("expected error from abruptly closed DAP server, got nil")
	}
}

func TestDAPClientErrorFormat(t *testing.T) {
	addr, teardown := mockDAPServer(t, func(req Request, w io.Writer) {
		resp := Response{
			Seq:        500,
			Type:       "response",
			RequestSeq: req.Seq,
			Success:    false,
			Message:    "Failed to launch",
			Body:       json.RawMessage(`{"error": {"id": 3000, "format": "Build error: package not found"}}`),
		}
		_ = sendDAPFrame(w, resp)
	})
	defer teardown()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	client, err := DialDAP(ctx, addr)
	if err != nil {
		t.Fatalf("DialDAP failed: %v", err)
	}
	defer client.Close()

	_, err = client.Launch(ctx, "./nonexistent", nil, nil, "", "debug")
	if err == nil {
		t.Fatalf("expected error from failed launch")
	}
	if !strings.Contains(err.Error(), "Build error: package not found") {
		t.Fatalf("expected error message to contain detailed format, got: %v", err)
	}
}

