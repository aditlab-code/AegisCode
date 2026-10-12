package debug

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
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
	doneChan chan struct{}
}

// StartDelve launches dlv in dap mode listening on an ephemeral port.
func StartDelve(ctx context.Context, cwd string) (*Runner, error) {
	dlvPath, err := FindDelve()
	if err != nil {
		return nil, err
	}

	port, err := AllocateFreePort()
	if err != nil {
		return nil, err
	}

	args := []string{
		"dap",
		"--listen=127.0.0.1:" + strconv.Itoa(port),
		"--check-go-version=false",
	}

	cmd := exec.CommandContext(ctx, dlvPath, args...)
	if cwd != "" {
		cmd.Dir = cwd
	}

	setProcessGroup(cmd)

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start delve: %w", err)
	}

	runner := &Runner{
		Path:     dlvPath,
		Port:     port,
		Cmd:      cmd,
		Cwd:      cwd,
		doneChan: make(chan struct{}),
	}

	go func() {
		_ = cmd.Wait()
		close(runner.doneChan)
	}()

	// Wait up to 5 seconds for DAP TCP listener to become available
	dialDeadline := time.Now().Add(5 * time.Second)
	ready := false
	for time.Now().Before(dialDeadline) {
		select {
		case <-runner.doneChan:
			return nil, fmt.Errorf("delve exited unexpectedly during startup")
		default:
		}

		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 100*time.Millisecond)
		if err == nil {
			_ = conn.Close()
			ready = true
			break
		}
		time.Sleep(50 * time.Millisecond)
	}

	if !ready {
		_ = runner.Close()
		return nil, fmt.Errorf("timed out waiting for delve dap to start on port %d", port)
	}

	return runner, nil
}

// Close gracefully terminates the Delve runner process group.
func (r *Runner) Close() error {
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
