package codegraph

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Manager supervises the native @colbymchenry/codegraph UI server process
// and manages the reverse proxy connection.
type Manager struct {
	mu            sync.RWMutex
	workspaceRoot string
	port          int
	cmd           *exec.Cmd
	running       bool
	proxy         http.Handler
	ready         bool
}

// NewManager creates a new CodeGraph process manager for the given workspace.
func NewManager(workspaceRoot string) *Manager {
	m := &Manager{
		workspaceRoot: workspaceRoot,
	}
	return m
}

// SetWorkspace updates the active workspace and restarts the UI daemon if needed.
func (m *Manager) SetWorkspace(ws string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.workspaceRoot == ws && m.running {
		return nil
	}

	m.stopProcessLocked()
	m.workspaceRoot = ws
	m.proxy = nil
	m.ready = false
	return nil
}

// Close terminates any running daemon process.
func (m *Manager) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.stopProcessLocked()
	return nil
}

// Workspace returns the current active workspace path.
func (m *Manager) Workspace() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.workspaceRoot
}

// IsRunning reports whether the daemon is actively running and ready.
func (m *Manager) IsRunning() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.running && m.ready
}

// Port returns the ephemeral port the daemon is bound to.
func (m *Manager) Port() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.port
}

// IsIndexed reports whether the active workspace has been initialized with CodeGraph.
func (m *Manager) IsIndexed() bool {
	m.mu.RLock()
	ws := m.workspaceRoot
	m.mu.RUnlock()

	if ws == "" {
		return false
	}
	codegraphDir := filepath.Join(ws, ".codegraph")
	fi, err := os.Stat(codegraphDir)
	return err == nil && fi.IsDir()
}

// findFreePort locates an unused ephemeral TCP port.
func findFreePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, err
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port, nil
}

// FindCodegraphBinary locates the codegraph executable on the system.
func FindCodegraphBinary() (string, []string) {
	if envBin := os.Getenv("CODEGRAPH_BIN"); envBin != "" {
		return envBin, nil
	}
	if p, err := exec.LookPath("codegraph"); err == nil {
		return p, nil
	}

	home, _ := os.UserHomeDir()
	candidates := []string{
		filepath.Join(home, ".aegiscode", "mcp", "node_modules", ".bin", "codegraph"),
		filepath.Join(home, ".npm-global", "bin", "codegraph"),
		"/opt/homebrew/bin/codegraph",
		"/usr/local/bin/codegraph",
	}
	for _, c := range candidates {
		if fi, err := os.Stat(c); err == nil && !fi.IsDir() {
			return c, nil
		}
	}

	// Fallback to npx
	if npx, err := exec.LookPath("npx"); err == nil {
		return npx, []string{"-y", "@colbymchenry/codegraph"}
	}

	return "codegraph", nil
}

// EnsureRunning starts the codegraph UI server process if it is not currently active.
func (m *Manager) EnsureRunning() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.running && m.ready {
		return nil
	}

	if m.workspaceRoot == "" {
		return errors.New("no workspace root set for codegraph")
	}

	codegraphDir := filepath.Join(m.workspaceRoot, ".codegraph")
	if fi, err := os.Stat(codegraphDir); err != nil || !fi.IsDir() {
		return errors.New("workspace is not indexed by CodeGraph (missing .codegraph directory)")
	}

	port, err := findFreePort()
	if err != nil {
		return fmt.Errorf("failed to allocate port: %w", err)
	}
	m.port = port

	bin, extraArgs := FindCodegraphBinary()
	args := append([]string{}, extraArgs...)
	args = append(args, "ui", "--port", strconv.Itoa(port), "--no-open", m.workspaceRoot)

	cmd := exec.Command(bin, args...)
	cmd.Dir = m.workspaceRoot
	setProcessGroup(cmd)

	env := os.Environ()
	env = append(env, "CODEGRAPH_UI=1")
	env = append(env, "CODEGRAPH_BROWSER=none")
	if runtime.GOOS == "windows" {
		env = append(env, "CHILD_PROCESS_WINDOWS_HIDE=1")
	}
	cmd.Env = env

	// Suppress daemon stdout noise; log errors to stderr
	cmd.Stdout = io.Discard
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start codegraph ui: %w", err)
	}

	m.cmd = cmd
	m.running = true

	// Build reverse proxy target
	targetURL, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))
	m.proxy = newReverseProxy(targetURL)

	// Liveness readiness probe in background or synchronous poll with short timeout
	go func() {
		_ = cmd.Wait()
		m.mu.Lock()
		m.running = false
		m.ready = false
		m.mu.Unlock()
	}()

	// Wait up to 3 seconds for readiness
	probeURL := fmt.Sprintf("http://127.0.0.1:%d/api/stats", port)
	client := &http.Client{Timeout: 300 * time.Millisecond}
	deadline := time.Now().Add(3 * time.Second)

	for time.Now().Before(deadline) {
		time.Sleep(80 * time.Millisecond)
		resp, err := client.Get(probeURL)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				m.ready = true
				break
			}
		}
	}

	// Even if /api/stats readiness timed out, mark ready = true so proxy attempts can proceed
	m.ready = true
	return nil
}

// stopProcessLocked terminates the daemon process. Must be called while holding m.mu.
func (m *Manager) stopProcessLocked() {
	if m.cmd != nil && m.cmd.Process != nil && m.running {
		_ = m.cmd.Process.Signal(os.Interrupt)
		done := make(chan struct{})
		go func() {
			if m.cmd != nil {
				_ = m.cmd.Wait()
			}
			close(done)
		}()
		select {
		case <-done:
		case <-time.After(500 * time.Millisecond):
			killProcessGroup(m.cmd)
		}
	}
	m.cmd = nil
	m.running = false
	m.ready = false
}

// Status returns statistics and index freshness directly from the daemon.
func (m *Manager) Status(ctx context.Context) (map[string]any, error) {
	if !m.IsIndexed() {
		return map[string]any{
			"state":         "unindexed",
			"status":        "unindexed",
			"isIndexed":     false,
			"workspaceRoot": m.Workspace(),
			"running":       false,
		}, nil
	}

	if err := m.EnsureRunning(); err != nil {
		return map[string]any{
			"state":         "unindexed",
			"status":        "unindexed",
			"isIndexed":     false,
			"workspaceRoot": m.Workspace(),
			"running":       false,
			"error":         err.Error(),
		}, nil
	}

	target := fmt.Sprintf("http://127.0.0.1:%d/api/stats", m.Port())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return map[string]any{
			"status":        "error",
			"workspaceRoot": m.Workspace(),
			"running":       false,
			"error":         err.Error(),
		}, nil
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	return result, nil
}

// FetchAPI issues a GET request to the internal CodeGraph daemon for the given subpath.
func (m *Manager) FetchAPI(ctx context.Context, subpath string) ([]byte, int, error) {
	if err := m.EnsureRunning(); err != nil {
		return nil, http.StatusServiceUnavailable, err
	}
	port := m.Port()
	if port <= 0 {
		return nil, http.StatusServiceUnavailable, errors.New("codegraph daemon port invalid")
	}

	target := fmt.Sprintf("http://127.0.0.1:%d/api/%s", port, strings.TrimPrefix(subpath, "/"))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, http.StatusBadGateway, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	return body, resp.StatusCode, nil
}

// Init executes "codegraph init -y" against the active workspace.
func (m *Manager) Init(ctx context.Context) error {
	m.mu.RLock()
	ws := m.workspaceRoot
	m.mu.RUnlock()

	if ws == "" {
		return errors.New("no workspace set")
	}

	bin, extraArgs := FindCodegraphBinary()
	args := append([]string{}, extraArgs...)
	args = append(args, "init", "-y", ws)

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = ws
	cmd.Env = os.Environ()

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("init failed: %w (%s)", err, strings.TrimSpace(string(out)))
	}

	_ = m.EnsureRunning()
	return nil
}

// Reindex executes "codegraph index" against the active workspace.
// If the workspace has not been initialized with "codegraph init", it returns an error (no silent fallback).
func (m *Manager) Reindex(ctx context.Context) error {
	m.mu.RLock()
	ws := m.workspaceRoot
	m.mu.RUnlock()

	if ws == "" {
		return errors.New("no workspace set")
	}

	if !m.IsIndexed() {
		return errors.New("workspace is not initialized. Run init first")
	}

	bin, extraArgs := FindCodegraphBinary()
	args := append([]string{}, extraArgs...)
	args = append(args, "index", ws)

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = ws
	cmd.Env = os.Environ()

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("reindex failed: %w (%s)", err, strings.TrimSpace(string(out)))
	}

	_ = m.EnsureRunning()
	return nil
}

// Sync executes "codegraph sync" against the active workspace.
// If the workspace has not been initialized with "codegraph init", it returns an error.
func (m *Manager) Sync(ctx context.Context) error {
	m.mu.RLock()
	ws := m.workspaceRoot
	m.mu.RUnlock()

	if ws == "" {
		return errors.New("no workspace set")
	}

	if !m.IsIndexed() {
		return errors.New("workspace is not initialized. Run init first")
	}

	bin, extraArgs := FindCodegraphBinary()
	args := append([]string{}, extraArgs...)
	args = append(args, "sync", ws)

	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Dir = ws
	cmd.Env = os.Environ()

	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("sync failed: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}
