package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Client represents a JSON-RPC 2.0 client managing an out-of-process LSP server.
type Client struct {
	cmd          *exec.Cmd
	stdin        io.WriteCloser
	stdout       io.ReadCloser
	reader       *bufio.Reader
	nextID       atomic.Int64
	pendingMu    sync.Mutex
	pending      map[int64]chan *Response
	onDiagnostic func(PublishDiagnosticsParams)
	writeMu      sync.Mutex
	closeOnce    sync.Once
	ctx          context.Context
	cancel       context.CancelFunc
}

// StartClient spawns an LSP process and initializes reader/writer loops.
func StartClient(binaryPath string, args []string, onDiag func(PublishDiagnosticsParams)) (*Client, error) {
	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, binaryPath, args...)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		cancel()
		return nil, fmt.Errorf("failed to open stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		cancel()
		return nil, fmt.Errorf("failed to open stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		stdin.Close()
		stdout.Close()
		cancel()
		return nil, fmt.Errorf("failed to start LSP binary '%s': %w", binaryPath, err)
	}

	c := &Client{
		cmd:          cmd,
		stdin:        stdin,
		stdout:       stdout,
		reader:       bufio.NewReader(stdout),
		pending:      make(map[int64]chan *Response),
		onDiagnostic: onDiag,
		ctx:          ctx,
		cancel:       cancel,
	}

	go c.readLoop()

	return c, nil
}

// readLoop listens for incoming JSON-RPC messages framed with Content-Length headers.
func (c *Client) readLoop() {
	defer c.Close()

	for {
		// Read headers until empty line
		contentLength := -1
		for {
			line, err := c.reader.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimRight(line, "\r\n")
			if line == "" {
				// Blank line indicates end of headers
				break
			}
			if strings.HasPrefix(strings.ToLower(line), "content-length:") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					val, _ := strconv.Atoi(strings.TrimSpace(parts[1]))
					contentLength = val
				}
			}
		}

		if contentLength <= 0 {
			continue
		}

		// Read exact body payload
		body := make([]byte, contentLength)
		if _, err := io.ReadFull(c.reader, body); err != nil {
			return
		}

		// Check if message is a response or a notification
		var raw map[string]json.RawMessage
		if err := json.Unmarshal(body, &raw); err != nil {
			continue
		}

		// Check for ID (Request/Response)
		if idRaw, ok := raw["id"]; ok && len(idRaw) > 0 {
			var resp Response
			if err := json.Unmarshal(body, &resp); err == nil {
				c.pendingMu.Lock()
				ch, exists := c.pending[resp.ID]
				if exists {
					delete(c.pending, resp.ID)
				}
				c.pendingMu.Unlock()

				if exists && ch != nil {
					select {
					case ch <- &resp:
					default:
					}
				}
			}
			continue
		}

		// Check for Notification
		if methodRaw, ok := raw["method"]; ok {
			var method string
			_ = json.Unmarshal(methodRaw, &method)
			if method == "textDocument/publishDiagnostics" && c.onDiagnostic != nil {
				var notif struct {
					Params PublishDiagnosticsParams `json:"params"`
				}
				if err := json.Unmarshal(body, &notif); err == nil {
					c.onDiagnostic(notif.Params)
				}
			}
		}
	}
}

// Call sends a JSON-RPC request and awaits the response with a timeout.
func (c *Client) Call(ctx context.Context, method string, params any) (*Response, error) {
	id := c.nextID.Add(1)

	var rawParams json.RawMessage
	if params != nil {
		b, err := json.Marshal(params)
		if err != nil {
			return nil, err
		}
		rawParams = b
	}

	req := Request{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  rawParams,
	}

	payload, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	respChan := make(chan *Response, 1)
	c.pendingMu.Lock()
	c.pending[id] = respChan
	c.pendingMu.Unlock()

	defer func() {
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
	}()

	if err := c.sendFramed(payload); err != nil {
		return nil, err
	}

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case resp, ok := <-respChan:
		if !ok || resp == nil {
			return nil, errors.New("lsp client closed while waiting for response")
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("lsp error (%d): %s", resp.Error.Code, resp.Error.Message)
		}
		return resp, nil
	}
}

// Notify sends a JSON-RPC notification (no response expected).
func (c *Client) Notify(method string, params any) error {
	var rawParams json.RawMessage
	if params != nil {
		b, err := json.Marshal(params)
		if err != nil {
			return err
		}
		rawParams = b
	}

	notif := Notification{
		JSONRPC: "2.0",
		Method:  method,
		Params:  rawParams,
	}

	payload, err := json.Marshal(notif)
	if err != nil {
		return err
	}

	return c.sendFramed(payload)
}

func (c *Client) sendFramed(data []byte) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()

	header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(data))
	if _, err := io.WriteString(c.stdin, header); err != nil {
		return err
	}
	if _, err := c.stdin.Write(data); err != nil {
		return err
	}
	return nil
}

// Close gracefully terminates the subprocess.
func (c *Client) Close() error {
	var closeErr error
	c.closeOnce.Do(func() {
		// Attempt graceful LSP shutdown
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		_, _ = c.Call(shutdownCtx, "shutdown", nil)
		cancel()
		_ = c.Notify("exit", nil)

		_ = c.stdin.Close()
		_ = c.stdout.Close()
		c.cancel()

		if c.cmd.Process != nil {
			_ = c.cmd.Process.Kill()
		}
	})
	return closeErr
}
