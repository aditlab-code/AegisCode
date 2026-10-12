package debug

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// ErrDelveNotFound is returned when Delve (dlv) cannot be located on the system.
var ErrDelveNotFound = errors.New("delve debugger ('dlv') not found in PATH or GOPATH/bin. Run 'go install github.com/go-delve/delve/cmd/dlv@latest' to install.")

// ErrDebugpyNotFound is returned when debugpy cannot be located on the system.
var ErrDebugpyNotFound = errors.New("debugpy debugger not found. Run 'pip install debugpy' to install Python debugger.")

// FindBinary locates an executable on PATH, GOPATH/bin, HOME/go/bin, or standard macOS/Unix locations.
func FindBinary(name string) (string, error) {
	// 1. Check system PATH
	if p, err := exec.LookPath(name); err == nil && p != "" {
		return p, nil
	}
	if runtime.GOOS == "windows" {
		if p, err := exec.LookPath(name + ".exe"); err == nil && p != "" {
			return p, nil
		}
	}

	// 2. Check GOPATH/bin
	if gopath := os.Getenv("GOPATH"); gopath != "" {
		candidate := filepath.Join(gopath, "bin", name)
		if runtime.GOOS == "windows" {
			candidate += ".exe"
		}
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			return candidate, nil
		}
	}

	// 3. Check HOME/go/bin
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidate := filepath.Join(home, "go", "bin", name)
		if runtime.GOOS == "windows" {
			candidate += ".exe"
		}
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			return candidate, nil
		}
	}

	// 4. Check standard macOS Homebrew / Unix binary locations
	commonPaths := []string{
		"/opt/homebrew/bin/" + name,
		"/usr/local/bin/" + name,
		"/usr/bin/" + name,
	}
	for _, p := range commonPaths {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			return p, nil
		}
	}

	return "", fmt.Errorf("binary '%s' not found", name)
}

// FindDelve locates the delve binary on the host machine.
func FindDelve() (string, error) {
	p, err := FindBinary("dlv")
	if err != nil {
		return "", ErrDelveNotFound
	}
	return p, nil
}

// FindPython locates the python3 or python binary on the host machine.
func FindPython() (string, error) {
	if p, err := FindBinary("python3"); err == nil {
		return p, nil
	}
	if p, err := FindBinary("python"); err == nil {
		return p, nil
	}
	return "", errors.New("python3 executable not found in PATH or standard locations")
}

// AllocateFreePort binds to 127.0.0.1:0 temporarily to obtain a free ephemeral TCP port.
func AllocateFreePort() (int, error) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return 0, fmt.Errorf("failed to allocate free port: %w", err)
	}
	defer l.Close()
	addr := l.Addr().(*net.TCPAddr)
	return addr.Port, nil
}

// Runner supervises the out-of-process DAP adapter instance.
type Runner struct {
	Path     string
	Port     int
	Cmd      *exec.Cmd
	Cwd      string
	Client   *DAPClient
	cancel   context.CancelFunc
	doneChan chan struct{}
}

// StartAdapter spawns a debug adapter process according to its configuration and establishes the DAP client.
func StartAdapter(ctx context.Context, cfg DebugAdapterConfig, target, cwd string) (*Runner, *DAPClient, error) {
	var binPath string
	var err error

	if cfg.Language == "go" {
		binPath, err = FindDelve()
		if err != nil {
			return nil, nil, err
		}
	} else if cfg.Language == "python" {
		binPath, err = FindPython()
		if err != nil {
			return nil, nil, err
		}
		// Check that debugpy module is available
		checkCmd := exec.Command(binPath, "-m", "debugpy", "--version")
		if err := checkCmd.Run(); err != nil {
			return nil, nil, ErrDebugpyNotFound
		}
	} else {
		binPath, err = FindBinary(cfg.Binary)
		if err != nil {
			return nil, nil, fmt.Errorf("%s not found: %w. %s", cfg.Binary, err, cfg.InstallTip)
		}
	}

	sessionCtx, sessionCancel := context.WithCancel(context.Background())
	var port int
	var args []string

	if cfg.Transport == "tcp" {
		p, err := AllocateFreePort()
		if err != nil {
			sessionCancel()
			return nil, nil, err
		}
		port = p
		args = cfg.BuildArgs(target, port)
	} else {
		args = cfg.BuildArgs(target, 0)
	}

	cmd := exec.CommandContext(sessionCtx, binPath, args...)
	if cwd != "" {
		cmd.Dir = cwd
	}
	setProcessGroup(cmd)

	runner := &Runner{
		Path:     binPath,
		Port:     port,
		Cmd:      cmd,
		Cwd:      cwd,
		cancel:   sessionCancel,
		doneChan: make(chan struct{}),
	}

	var client *DAPClient

	if cfg.Transport == "stdio" {
		stdinPipe, err := cmd.StdinPipe()
		if err != nil {
			sessionCancel()
			return nil, nil, fmt.Errorf("failed to open stdin pipe: %w", err)
		}
		stdoutPipe, err := cmd.StdoutPipe()
		if err != nil {
			sessionCancel()
			return nil, nil, fmt.Errorf("failed to open stdout pipe: %w", err)
		}
		var stderrBuf bytes.Buffer
		cmd.Stderr = &stderrBuf

		if err := cmd.Start(); err != nil {
			sessionCancel()
			return nil, nil, fmt.Errorf("failed to start %s: %w", cfg.Binary, err)
		}

		go func() {
			_ = cmd.Wait()
			close(runner.doneChan)
		}()

		pair := &StdioPair{
			Reader:      stdoutPipe,
			WriteCloser: stdinPipe,
		}
		client = NewDAPClient(pair)

	} else {
		// TCP Transport
		var stdoutPipe io.ReadCloser
		pipe, err := cmd.StdoutPipe()
		if err == nil {
			stdoutPipe = pipe
		}

		var stderrBuf bytes.Buffer
		cmd.Stderr = &stderrBuf

		if err := cmd.Start(); err != nil {
			sessionCancel()
			return nil, nil, fmt.Errorf("failed to start %s: %w", cfg.Binary, err)
		}

		go func() {
			_ = cmd.Wait()
			close(runner.doneChan)
		}()

		if stdoutPipe != nil {
			// Drain stdout pipe to prevent child process stalling on full pipe buffer
			go io.Copy(io.Discard, stdoutPipe)
		}

		// Wait for adapter TCP port to accept connections
		addr := fmt.Sprintf("127.0.0.1:%d", port)
		deadline := time.Now().Add(5 * time.Second)
		connected := false

		for time.Now().Before(deadline) {
			select {
			case <-runner.doneChan:
				errMsg := strings.TrimSpace(stderrBuf.String())
				if errMsg != "" {
					return nil, nil, fmt.Errorf("%s exited during startup: %s", cfg.Binary, errMsg)
				}
				return nil, nil, fmt.Errorf("%s exited during startup", cfg.Binary)
			default:
			}

			conn, dialErr := net.DialTimeout("tcp", addr, 100*time.Millisecond)
			if dialErr == nil {
				client = NewDAPClient(conn)
				connected = true
				break
			}
			time.Sleep(50 * time.Millisecond)
		}

		if !connected {
			_ = runner.Close()
			errMsg := strings.TrimSpace(stderrBuf.String())
			if errMsg != "" {
				return nil, nil, fmt.Errorf("timed out connecting to %s: %s", cfg.Binary, errMsg)
			}
			return nil, nil, fmt.Errorf("timed out connecting to %s on %s", cfg.Binary, addr)
		}
	}

	runner.Client = client
	return runner, client, nil
}

// StartDelve launches dlv in dap mode listening on an ephemeral port (backward compatibility helper).
func StartDelve(ctx context.Context, cwd string) (*Runner, error) {
	runner, _, err := StartAdapter(ctx, Registry["go"], "", cwd)
	if err != nil {
		return nil, err
	}
	return runner, nil
}

// Close gracefully terminates the runner process group.
func (r *Runner) Close() error {
	if r.Client != nil {
		_ = r.Client.Close()
	}
	if r.cancel != nil {
		r.cancel()
	}

	if r.Cmd == nil || r.Cmd.Process == nil {
		return nil
	}

	select {
	case <-r.doneChan:
		return nil
	default:
	}

	// 1. Send SIGTERM to process group
	_ = terminateProcessGroup(r.Cmd)

	// 2. Watchdog 250ms -> escalate to SIGKILL
	select {
	case <-r.doneChan:
		return nil
	case <-time.After(250 * time.Millisecond):
		_ = killProcessGroup(r.Cmd)
	}

	<-r.doneChan
	return nil
}
