package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/codegraph"
)

// Bridge manages a stdio JSON-RPC connection to native `codegraph serve --mcp`.
type Bridge struct {
	mu            sync.RWMutex
	writeMu       sync.Mutex
	workspaceRoot string
	cmd           *exec.Cmd
	stdin         io.WriteCloser
	pending       map[any]chan *JSONRPCResponse
	tools         []Tool
	reqSeq        int64
	running       bool
	closed        bool
}

// NewBridge creates a new client bridge targeting the given workspace.
func NewBridge(workspaceRoot string) *Bridge {
	return &Bridge{
		workspaceRoot: workspaceRoot,
		pending:       make(map[any]chan *JSONRPCResponse),
		tools:         make([]Tool, 0),
	}
}

func (b *Bridge) nextID() int64 {
	return atomic.AddInt64(&b.reqSeq, 1)
}

func (b *Bridge) getWorkspace() string {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return b.workspaceRoot
}

// SetWorkspace updates the active workspace and notifies the subprocess.
func (b *Bridge) SetWorkspace(ws string) {
	b.mu.Lock()
	if b.workspaceRoot == ws {
		b.mu.Unlock()
		return
	}
	b.workspaceRoot = ws
	running := b.running
	b.mu.Unlock()

	if running {
		_ = b.sendNotification("notifications/roots/list_changed", map[string]any{})
	}
}

// EnsureRunning launches the `codegraph serve --mcp` daemon and performs handshake if needed.
func (b *Bridge) EnsureRunning() error {
	b.mu.Lock()
	if b.running && b.cmd != nil {
		b.mu.Unlock()
		return nil
	}
	if b.closed {
		b.mu.Unlock()
		return errors.New("bridge is closed")
	}

	bin, extraArgs := codegraph.FindCodegraphBinary()
	args := append([]string{}, extraArgs...)
	args = append(args, "serve", "--mcp")

	cmd := exec.Command(bin, args...)
	ws := b.workspaceRoot
	if ws != "" {
		cmd.Dir = ws
	}

	setProcessGroup(cmd)

	env := os.Environ()
	env = append(env, "CODEGRAPH_MCP_TOOLS=explore,context,node,callers,callees,impact,affected,search,flow,status")
	if runtime.GOOS == "windows" {
		env = append(env, "CHILD_PROCESS_WINDOWS_HIDE=1")
	}
	cmd.Env = env

	stdin, err := cmd.StdinPipe()
	if err != nil {
		b.mu.Unlock()
		return fmt.Errorf("failed to create stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		stdin.Close()
		b.mu.Unlock()
		return fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		stdin.Close()
		stdout.Close()
		b.mu.Unlock()
		return fmt.Errorf("failed to start codegraph serve --mcp: %w", err)
	}

	b.cmd = cmd
	b.stdin = stdin
	b.running = true
	b.mu.Unlock()

	// Start reader goroutine
	go b.readLoop(stdout)

	// Perform initialize handshake
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	initResp, err := b.callRPC(ctx, "initialize", map[string]any{
		"protocolVersion": "2024-11-05",
		"capabilities": map[string]any{
			"roots": map[string]any{"listChanged": true},
		},
		"clientInfo": map[string]any{
			"name":    "aegiscode",
			"version": "1.0.0",
		},
	})
	if err != nil {
		return fmt.Errorf("codegraph mcp initialize failed: %w", err)
	}
	if initResp.Error != nil {
		return fmt.Errorf("codegraph mcp initialize error: %s", initResp.Error.Message)
	}

	_ = b.sendNotification("notifications/initialized", map[string]any{})

	// Cache tools list
	listResp, err := b.callRPC(ctx, "tools/list", map[string]any{})
	if err == nil && listResp.Result != nil {
		if rawBytes, mErr := json.Marshal(listResp.Result); mErr == nil {
			var listRes ListToolsResult
			if uErr := json.Unmarshal(rawBytes, &listRes); uErr == nil {
				b.mu.Lock()
				b.tools = listRes.Tools
				b.mu.Unlock()
			}
		}
	}

	return nil
}

func (b *Bridge) readLoop(r io.Reader) {
	reader := bufio.NewReader(r)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			b.mu.Lock()
			b.running = false
			// Drain any pending callers with EOF error
			for _, ch := range b.pending {
				select {
				case ch <- &JSONRPCResponse{
					JSONRPC: "2.0",
					Error: &JSONRPCError{
						Code:    CodeInternalError,
						Message: "mcp bridge process exited: " + err.Error(),
					},
				}:
				default:
				}
			}
			b.pending = make(map[any]chan *JSONRPCResponse)
			b.mu.Unlock()
			return
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse JSON-RPC frame
		var raw map[string]json.RawMessage
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}

		// 1. Is it a request from the server? (e.g. roots/list)
		if methodRaw, hasMethod := raw["method"]; hasMethod {
			var method string
			_ = json.Unmarshal(methodRaw, &method)

			if idRaw, hasID := raw["id"]; hasID {
				var id any
				_ = json.Unmarshal(idRaw, &id)

				if method == "roots/list" {
					b.handleInboundRootsList(id)
				}
			}
			continue
		}

		// 2. Is it a response to one of our requests?
		if idRaw, hasID := raw["id"]; hasID {
			var id any
			_ = json.Unmarshal(idRaw, &id)

			// Normalize float to int64 if applicable
			if f, ok := id.(float64); ok {
				id = int64(f)
			}

			var resp JSONRPCResponse
			if err := json.Unmarshal([]byte(line), &resp); err == nil {
				b.mu.Lock()
				ch, exists := b.pending[id]
				if exists {
					delete(b.pending, id)
				}
				b.mu.Unlock()

				if exists && ch != nil {
					select {
					case ch <- &resp:
					default:
					}
				}
			}
		}
	}
}

func (b *Bridge) handleInboundRootsList(reqID any) {
	ws := b.getWorkspace()
	roots := make([]WorkspaceRoot, 0)
	if ws != "" {
		name := filepath.Base(ws)
		roots = append(roots, WorkspaceRoot{
			URI:  "file://" + ws,
			Name: name,
		})
	}
	resp := map[string]any{
		"jsonrpc": "2.0",
		"id":      reqID,
		"result": RootsListResult{
			Roots: roots,
		},
	}
	_ = b.writeRaw(resp)
}

func (b *Bridge) writeRaw(payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	data = append(data, '\n')

	b.writeMu.Lock()
	defer b.writeMu.Unlock()

	b.mu.RLock()
	stdin := b.stdin
	b.mu.RUnlock()

	if stdin == nil {
		return errors.New("stdin closed")
	}
	_, err = stdin.Write(data)
	return err
}

func (b *Bridge) sendNotification(method string, params any) error {
	notif := map[string]any{
		"jsonrpc": "2.0",
		"method":  method,
		"params":  params,
	}
	return b.writeRaw(notif)
}

func (b *Bridge) callRPC(ctx context.Context, method string, params any) (*JSONRPCResponse, error) {
	id := b.nextID()
	req := map[string]any{
		"jsonrpc": "2.0",
		"id":      id,
		"method":  method,
		"params":  params,
	}

	respChan := make(chan *JSONRPCResponse, 1)
	b.mu.Lock()
	b.pending[id] = respChan
	b.mu.Unlock()

	if err := b.writeRaw(req); err != nil {
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		return nil, err
	}

	select {
	case <-ctx.Done():
		b.mu.Lock()
		delete(b.pending, id)
		b.mu.Unlock()
		return nil, ctx.Err()
	case resp := <-respChan:
		return resp, nil
	}
}

// CallTool invokes a tool against the native codegraph MCP daemon with projectPath auto-injection.
func (b *Bridge) CallTool(ctx context.Context, name string, args map[string]any) (*CallToolResult, error) {
	if err := b.EnsureRunning(); err != nil {
		return nil, err
	}

	if args == nil {
		args = make(map[string]any)
	}

	// Clean prefix: if client used "mcp__codegraph__explore" or "codegraph_explore", map to target name
	cleanName := strings.TrimPrefix(name, "mcp__codegraph__")
	cleanName = strings.TrimPrefix(cleanName, "codegraph:")

	// Auto-inject projectPath if not provided
	if _, ok := args["projectPath"]; !ok || args["projectPath"] == "" {
		if ws := b.getWorkspace(); ws != "" {
			args["projectPath"] = ws
		}
	}

	// Target tool name
	toolTarget := cleanName
	if !strings.HasPrefix(toolTarget, "codegraph_") {
		toolTarget = "codegraph_" + toolTarget
	}

	resp, err := b.callRPC(ctx, "tools/call", map[string]any{
		"name":      toolTarget,
		"arguments": args,
	})
	if err != nil {
		return nil, err
	}
	if resp.Error != nil {
		return &CallToolResult{
			Content: []ContentItem{{Type: "text", Text: resp.Error.Message}},
			IsError: true,
		}, nil
	}

	var callRes CallToolResult
	if resp.Result != nil {
		rawBytes, _ := json.Marshal(resp.Result)
		_ = json.Unmarshal(rawBytes, &callRes)
	}
	return &callRes, nil
}

// Tools returns the list of tools advertised by the native MCP daemon.
func (b *Bridge) Tools() []Tool {
	_ = b.EnsureRunning()
	b.mu.RLock()
	defer b.mu.RUnlock()
	out := make([]Tool, len(b.tools))
	copy(out, b.tools)
	return out
}

// Close gracefully terminates the subprocess.
func (b *Bridge) Close() error {
	b.mu.Lock()
	b.closed = true
	cmd := b.cmd
	stdin := b.stdin
	b.mu.Unlock()

	if stdin != nil {
		_ = stdin.Close()
	}
	if cmd != nil {
		killProcessGroup(cmd)
	}
	return nil
}
