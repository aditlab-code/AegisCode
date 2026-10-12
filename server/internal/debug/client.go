package debug

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"sync"
)

// StdioPair wraps an io.Reader and io.WriteCloser into a single io.ReadWriteCloser.
type StdioPair struct {
	io.Reader
	io.WriteCloser
}

func (s *StdioPair) Close() error {
	return s.WriteCloser.Close()
}

// DAPClient manages the low-level JSON-RPC connection to a DAP adapter over any io.ReadWriteCloser (TCP socket or stdio pipes).
type DAPClient struct {
	conn        io.ReadWriteCloser
	reader      *bufio.Reader
	writeMu     sync.Mutex
	mu          sync.Mutex
	seq         int
	pending     map[int]chan *Response
	subscribers map[chan *Event]struct{}
	closed      bool
	doneChan    chan struct{}
}

// NewDAPClient instantiates a DAPClient over any io.ReadWriteCloser transport (TCP or stdio).
func NewDAPClient(rw io.ReadWriteCloser) *DAPClient {
	client := &DAPClient{
		conn:        rw,
		reader:      bufio.NewReader(rw),
		pending:     make(map[int]chan *Response),
		subscribers: make(map[chan *Event]struct{}),
		doneChan:    make(chan struct{}),
	}
	go client.readLoop()
	return client
}

// DialDAP connects to the DAP adapter at the given TCP address.
func DialDAP(ctx context.Context, addr string) (*DAPClient, error) {
	var d net.Dialer
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("failed to dial DAP server at %s: %w", addr, err)
	}
	return NewDAPClient(conn), nil
}

// SubscribeEvents registers a channel to receive real-time DAP events.
func (c *DAPClient) SubscribeEvents() (chan *Event, func()) {
	ch := make(chan *Event, 64)
	c.mu.Lock()
	c.subscribers[ch] = struct{}{}
	c.mu.Unlock()

	unsubscribe := func() {
		c.mu.Lock()
		delete(c.subscribers, ch)
		c.mu.Unlock()
	}
	return ch, unsubscribe
}

// SendRequestAsync sends a DAP request and returns the sequence number and response channel.
func (c *DAPClient) SendRequestAsync(command string, args any) (int, <-chan *Response, error) {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return 0, nil, errors.New("DAP client connection is closed")
	}
	c.seq++
	seq := c.seq
	respCh := make(chan *Response, 1)
	c.pending[seq] = respCh
	c.mu.Unlock()

	var rawArgs json.RawMessage
	if args != nil {
		data, err := json.Marshal(args)
		if err != nil {
			c.mu.Lock()
			delete(c.pending, seq)
			c.mu.Unlock()
			return 0, nil, fmt.Errorf("failed to marshal request arguments: %w", err)
		}
		rawArgs = data
	}

	req := Request{
		Seq:       seq,
		Type:      "request",
		Command:   command,
		Arguments: rawArgs,
	}

	payload, err := json.Marshal(req)
	if err != nil {
		c.mu.Lock()
		delete(c.pending, seq)
		c.mu.Unlock()
		return 0, nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	frame := fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(payload), string(payload))

	c.writeMu.Lock()
	_, writeErr := c.conn.Write([]byte(frame))
	c.writeMu.Unlock()

	if writeErr != nil {
		c.mu.Lock()
		delete(c.pending, seq)
		c.mu.Unlock()
		_ = c.Close()
		return 0, nil, fmt.Errorf("failed to write DAP frame: %w", writeErr)
	}

	return seq, respCh, nil
}

// WaitResponse waits for a response for a specific sequence number.
func (c *DAPClient) WaitResponse(ctx context.Context, seq int, respCh <-chan *Response, command string) (*Response, error) {
	defer func() {
		c.mu.Lock()
		delete(c.pending, seq)
		c.mu.Unlock()
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-c.doneChan:
		return nil, errors.New("DAP connection terminated while waiting for response")
	case resp, ok := <-respCh:
		if !ok || resp == nil {
			return nil, errors.New("DAP connection terminated while waiting for response")
		}
		if !resp.Success {
			msg := resp.Message
			if len(resp.Body) > 0 {
				var errBody struct {
					Error struct {
						Format string `json:"format"`
					} `json:"error"`
				}
				if json.Unmarshal(resp.Body, &errBody) == nil && errBody.Error.Format != "" {
					msg = errBody.Error.Format
				}
			}
			if msg == "" {
				msg = fmt.Sprintf("DAP command '%s' failed", command)
			}
			return resp, errors.New(msg)
		}
		return resp, nil
	}
}

// SendRequest sends a DAP request and synchronously waits for matching response.
func (c *DAPClient) SendRequest(ctx context.Context, command string, args any) (*Response, error) {
	seq, respCh, err := c.SendRequestAsync(command, args)
	if err != nil {
		return nil, err
	}
	return c.WaitResponse(ctx, seq, respCh, command)
}

// readLoop reads Content-Length framed JSON messages.
func (c *DAPClient) readLoop() {
	defer func() {
		c.mu.Lock()
		c.closed = true
		for _, ch := range c.pending {
			close(ch)
		}
		c.pending = make(map[int]chan *Response)
		for ch := range c.subscribers {
			delete(c.subscribers, ch)
			close(ch)
		}
		c.mu.Unlock()
		close(c.doneChan)
		_ = c.conn.Close()
	}()

	for {
		contentLength := -1

		// Read headers until empty line
		for {
			line, err := c.reader.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimSpace(line)
			if line == "" {
				// Blank line marks end of headers
				break
			}
			if strings.HasPrefix(strings.ToLower(line), "content-length:") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					if l, err := strconv.Atoi(strings.TrimSpace(parts[1])); err == nil {
						contentLength = l
					}
				}
			}
		}

		if contentLength <= 0 {
			continue
		}

		body := make([]byte, contentLength)
		if _, err := io.ReadFull(c.reader, body); err != nil {
			return
		}

		var base ProtocolMessage
		if err := json.Unmarshal(body, &base); err != nil {
			continue
		}

		switch base.Type {
		case "response":
			var resp Response
			if err := json.Unmarshal(body, &resp); err == nil {
				c.mu.Lock()
				ch, ok := c.pending[resp.RequestSeq]
				c.mu.Unlock()
				if ok && ch != nil {
					ch <- &resp
				}
			}

		case "event":
			var evt Event
			if err := json.Unmarshal(body, &evt); err == nil {
				c.mu.Lock()
				for sub := range c.subscribers {
					select {
					case sub <- &evt:
					default:
					}
				}
				c.mu.Unlock()
			}
		}
	}
}

// Close terminates the client connection.
func (c *DAPClient) Close() error {
	c.mu.Lock()
	if c.closed {
		c.mu.Unlock()
		return nil
	}
	c.closed = true
	c.mu.Unlock()

	return c.conn.Close()
}

// --- High-Level DAP Helper Methods ---

// Initialize performs the standard DAP initialize handshake.
func (c *DAPClient) Initialize(ctx context.Context) (*Response, error) {
	return c.InitializeWithAdapter(ctx, "dlv-dap")
}

// InitializeWithAdapter performs the DAP initialize handshake with a specific adapter identifier.
func (c *DAPClient) InitializeWithAdapter(ctx context.Context, adapterID string) (*Response, error) {
	if adapterID == "" {
		adapterID = "dlv-dap"
	}
	args := map[string]any{
		"clientID":        "aegiscode",
		"clientName":      "AegisCode IDE",
		"adapterID":       adapterID,
		"linesStartAt1":   true,
		"columnsStartAt1": true,
		"pathFormat":      "path",
	}
	return c.SendRequest(ctx, "initialize", args)
}

func buildLaunchArgs(program string, args []string, env map[string]string, cwd string, mode string) map[string]any {
	launchArgs := map[string]any{
		"program": program,
	}
	if mode != "" && mode != "python" {
		launchArgs["mode"] = mode
	}
	if len(args) > 0 {
		launchArgs["args"] = args
	}
	if len(env) > 0 {
		launchArgs["env"] = env
	}
	if cwd != "" {
		launchArgs["cwd"] = cwd
	}
	return launchArgs
}

// Launch sends a launch request to compile and start a program.
func (c *DAPClient) Launch(ctx context.Context, program string, args []string, env map[string]string, cwd string, mode string) (*Response, error) {
	launchArgs := buildLaunchArgs(program, args, env, cwd, mode)
	return c.SendRequest(ctx, "launch", launchArgs)
}

// LaunchAsync sends a launch request asynchronously, returning seq and channel to await after configurationDone.
func (c *DAPClient) LaunchAsync(program string, args []string, env map[string]string, cwd string, mode string) (int, <-chan *Response, error) {
	launchArgs := buildLaunchArgs(program, args, env, cwd, mode)
	return c.SendRequestAsync("launch", launchArgs)
}

// SetBreakpoints registers breakpoints for a target file path.
func (c *DAPClient) SetBreakpoints(ctx context.Context, file string, lines []int) ([]Breakpoint, error) {
	bpList := make([]map[string]int, len(lines))
	for i, l := range lines {
		bpList[i] = map[string]int{"line": l}
	}

	args := map[string]any{
		"source": map[string]string{
			"path": file,
		},
		"lines":       lines,
		"breakpoints": bpList,
	}

	resp, err := c.SendRequest(ctx, "setBreakpoints", args)
	if err != nil {
		return nil, err
	}

	var body struct {
		Breakpoints []struct {
			ID       int    `json:"id"`
			Verified bool   `json:"verified"`
			Line     int    `json:"line"`
			Message  string `json:"message"`
		} `json:"breakpoints"`
	}

	if err := json.Unmarshal(resp.Body, &body); err != nil {
		return nil, fmt.Errorf("failed to parse setBreakpoints response: %w", err)
	}

	result := make([]Breakpoint, len(body.Breakpoints))
	for i, b := range body.Breakpoints {
		result[i] = Breakpoint{
			ID:       b.ID,
			File:     file,
			Line:     b.Line,
			Verified: b.Verified,
			Message:  b.Message,
		}
	}
	return result, nil
}

// ConfigurationDone informs the adapter that configuration is complete.
func (c *DAPClient) ConfigurationDone(ctx context.Context) error {
	_, err := c.SendRequest(ctx, "configurationDone", nil)
	return err
}

// Continue resumes program execution.
func (c *DAPClient) Continue(ctx context.Context, threadID int) error {
	args := map[string]any{"threadId": threadID}
	_, err := c.SendRequest(ctx, "continue", args)
	return err
}

// Next steps over the current line of code.
func (c *DAPClient) Next(ctx context.Context, threadID int) error {
	args := map[string]any{"threadId": threadID}
	_, err := c.SendRequest(ctx, "next", args)
	return err
}

// StepIn steps into the current function call.
func (c *DAPClient) StepIn(ctx context.Context, threadID int) error {
	args := map[string]any{"threadId": threadID}
	_, err := c.SendRequest(ctx, "stepIn", args)
	return err
}

// StepOut steps out of the current function call.
func (c *DAPClient) StepOut(ctx context.Context, threadID int) error {
	args := map[string]any{"threadId": threadID}
	_, err := c.SendRequest(ctx, "stepOut", args)
	return err
}

// Pause pauses running execution.
func (c *DAPClient) Pause(ctx context.Context, threadID int) error {
	args := map[string]any{"threadId": threadID}
	_, err := c.SendRequest(ctx, "pause", args)
	return err
}

// Threads retrieves active threads/goroutines.
func (c *DAPClient) Threads(ctx context.Context) ([]ThreadItem, error) {
	resp, err := c.SendRequest(ctx, "threads", nil)
	if err != nil {
		return nil, err
	}
	var body struct {
		Threads []struct {
			ID   int    `json:"id"`
			Name string `json:"name"`
		} `json:"threads"`
	}
	if err := json.Unmarshal(resp.Body, &body); err != nil {
		return nil, err
	}
	res := make([]ThreadItem, len(body.Threads))
	for i, t := range body.Threads {
		res[i] = ThreadItem{ID: t.ID, Name: t.Name}
	}
	return res, nil
}

// StackTrace retrieves the stack frames for a given thread.
func (c *DAPClient) StackTrace(ctx context.Context, threadID int) ([]StackFrame, error) {
	args := map[string]any{
		"threadId":   threadID,
		"startFrame": 0,
		"levels":     20,
	}
	resp, err := c.SendRequest(ctx, "stackTrace", args)
	if err != nil {
		return nil, err
	}
	var body struct {
		StackFrames []struct {
			ID     int    `json:"id"`
			Name   string `json:"name"`
			Line   int    `json:"line"`
			Column int    `json:"column"`
			Source struct {
				Path string `json:"path"`
			} `json:"source"`
		} `json:"stackFrames"`
	}
	if err := json.Unmarshal(resp.Body, &body); err != nil {
		return nil, err
	}
	res := make([]StackFrame, len(body.StackFrames))
	for i, f := range body.StackFrames {
		res[i] = StackFrame{
			ID:     f.ID,
			Name:   f.Name,
			File:   f.Source.Path,
			Line:   f.Line,
			Column: f.Column,
		}
	}
	return res, nil
}

// Scopes retrieves scopes for a given stack frame.
func (c *DAPClient) Scopes(ctx context.Context, frameID int) ([]int, error) {
	args := map[string]any{"frameId": frameID}
	resp, err := c.SendRequest(ctx, "scopes", args)
	if err != nil {
		return nil, err
	}
	var body struct {
		Scopes []struct {
			VariablesReference int `json:"variablesReference"`
		} `json:"scopes"`
	}
	if err := json.Unmarshal(resp.Body, &body); err != nil {
		return nil, err
	}
	refs := make([]int, len(body.Scopes))
	for i, s := range body.Scopes {
		refs[i] = s.VariablesReference
	}
	return refs, nil
}

// Variables retrieves variable values for a given scope reference ID.
func (c *DAPClient) Variables(ctx context.Context, variablesReference int) ([]VariableItem, error) {
	args := map[string]any{"variablesReference": variablesReference}
	resp, err := c.SendRequest(ctx, "variables", args)
	if err != nil {
		return nil, err
	}
	var body struct {
		Variables []struct {
			Name               string `json:"name"`
			Value              string `json:"value"`
			Type               string `json:"type"`
			VariablesReference int    `json:"variablesReference"`
		} `json:"variables"`
	}
	if err := json.Unmarshal(resp.Body, &body); err != nil {
		return nil, err
	}
	res := make([]VariableItem, len(body.Variables))
	for i, v := range body.Variables {
		res[i] = VariableItem{
			Name:               v.Name,
			Value:              v.Value,
			Type:               v.Type,
			VariablesReference: v.VariablesReference,
		}
	}
	return res, nil
}

// Disconnect informs the adapter to terminate debugging.
func (c *DAPClient) Disconnect(ctx context.Context, terminateTarget bool) error {
	args := map[string]any{
		"terminateDebuggee": terminateTarget,
	}
	_, err := c.SendRequest(ctx, "disconnect", args)
	return err
}
