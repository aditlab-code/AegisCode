package debug

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// ErrDelveNotFound is returned when Delve (dlv) cannot be located on the system.
var ErrDelveNotFound = errors.New("delve debugger ('dlv') not found in PATH or GOPATH/bin. Run 'go install github.com/go-delve/delve/cmd/dlv@latest' to install.")

// FindDelve locates the delve binary on the host machine.
func FindDelve() (string, error) {
	// 1. Check system PATH
	if p, err := exec.LookPath("dlv"); err == nil && p != "" {
		return p, nil
	}
	if runtime.GOOS == "windows" {
		if p, err := exec.LookPath("dlv.exe"); err == nil && p != "" {
			return p, nil
		}
	}

	// 2. Check GOPATH/bin
	if gopath := os.Getenv("GOPATH"); gopath != "" {
		candidate := filepath.Join(gopath, "bin", "dlv")
		if runtime.GOOS == "windows" {
			candidate += ".exe"
		}
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			return candidate, nil
		}
	}

	// 3. Check HOME/go/bin
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		candidate := filepath.Join(home, "go", "bin", "dlv")
		if runtime.GOOS == "windows" {
			candidate += ".exe"
		}
		if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
			return candidate, nil
		}
	}

	// 4. Check standard macOS Homebrew / Unix binary locations
	commonPaths := []string{
		"/opt/homebrew/bin/dlv",
		"/usr/local/bin/dlv",
	}
	for _, p := range commonPaths {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			return p, nil
		}
	}

	return "", ErrDelveNotFound
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

// Runner supervises the out-of-process Delve DAP instance.
type Runner struct {
	Path     string
	Port     int
	Cmd      *exec.Cmd
	Cwd      string
	cancel   context.CancelFunc
	doneChan chan struct{}
}

// StartDelve launches dlv in dap mode listening on an ephemeral port.
func StartDelve(ctx context.Context, cwd string) (*Runner, error) {
	dlvPath, err := FindDelve()
	if err != nil {
		return nil, err
	}

	sessionCtx, sessionCancel := context.WithCancel(context.Background())

	args := []string{
		"dap",
		"--listen=127.0.0.1:0",
		"--check-go-version=false",
	}

	cmd := exec.CommandContext(sessionCtx, dlvPath, args...)
	if cwd != "" {
		cmd.Dir = cwd
	}

	setProcessGroup(cmd)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		sessionCancel()
		return nil, fmt.Errorf("failed to create delve stdout pipe: %w", err)
	}

	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	if err := cmd.Start(); err != nil {
		sessionCancel()
		return nil, fmt.Errorf("failed to start delve: %w", err)
	}

	runner := &Runner{
		Path:     dlvPath,
		Cmd:      cmd,
		Cwd:      cwd,
		cancel:   sessionCancel,
		doneChan: make(chan struct{}),
	}

	go func() {
		_ = cmd.Wait()
		close(runner.doneChan)
	}()

	type portResult struct {
		port int
		err  error
	}
	portCh := make(chan portResult, 1)

	go func() {
		scanner := bufio.NewScanner(stdoutPipe)
		found := false
		for scanner.Scan() {
			line := scanner.Text()
			if !found {
				if idx := strings.Index(line, "listening at:"); idx != -1 {
					addrPart := strings.TrimSpace(line[idx+len("listening at:"):])
					_, portStr, splitErr := net.SplitHostPort(addrPart)
					if splitErr == nil {
						if p, pErr := strconv.Atoi(portStr); pErr == nil && p > 0 {
							found = true
							portCh <- portResult{port: p}
						}
					}
				}
			}
		}
		if !found {
			portCh <- portResult{err: errors.New("delve exited without reporting listening address")}
		}
	}()

	select {
	case <-ctx.Done():
		_ = runner.Close()
		return nil, ctx.Err()
	case <-runner.doneChan:
		errMsg := strings.TrimSpace(stderrBuf.String())
		if errMsg != "" {
			return nil, fmt.Errorf("delve exited unexpectedly during startup: %s", errMsg)
		}
		return nil, fmt.Errorf("delve exited unexpectedly during startup")
	case res := <-portCh:
		if res.err != nil {
			_ = runner.Close()
			errMsg := strings.TrimSpace(stderrBuf.String())
			if errMsg != "" {
				return nil, fmt.Errorf("delve startup failed: %s", errMsg)
			}
			return nil, res.err
		}
		runner.Port = res.port
		return runner, nil
	case <-time.After(5 * time.Second):
		_ = runner.Close()
		errMsg := strings.TrimSpace(stderrBuf.String())
		if errMsg != "" {
			return nil, fmt.Errorf("timed out waiting for delve dap to start: %s", errMsg)
		}
		return nil, errors.New("timed out waiting for delve dap to start")
	}
}

// Close gracefully terminates the Delve runner process group.
func (r *Runner) Close() error {
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
