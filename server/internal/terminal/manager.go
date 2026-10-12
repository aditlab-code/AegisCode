package terminal

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

var (
	ErrSessionNotFound = errors.New("terminal session not found")
	ErrSessionClosed   = errors.New("terminal session already closed")
)

const maxHistoryBytes = 512 * 1024 // 512 KB ring buffer replay for reconnects & initial prompt

// Session represents an active interactive pseudo-terminal session.
type Session struct {
	ID        string
	Shell     string
	Cwd       string
	Cols      uint16
	Rows      uint16
	Cmd       *exec.Cmd
	Pty       *os.File
	Done      chan struct{}
	cancel    context.CancelFunc
	mu        sync.Mutex
	subMu     sync.RWMutex
	subs      map[chan []byte]struct{}
	history   []byte
	closed    bool
}

// Manager manages lifecycle and I/O routing for native PTY sessions.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewManager() *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
	}
}

// resolveShell determines the executable shell path and appropriate startup args (e.g. login shell).
func resolveShell(preferred string) (string, []string, error) {
	var shellPath string
	if preferred != "" && preferred != "default" {
		if path, err := exec.LookPath(preferred); err == nil {
			shellPath = path
		}
	}

	if shellPath == "" {
		envShell := os.Getenv("SHELL")
		if envShell != "" {
			if path, err := exec.LookPath(envShell); err == nil {
				shellPath = path
			}
		}
	}

	if shellPath == "" {
		// Standard paths across macOS and Linux for zsh, fish, bash, and sh
		for _, candidate := range []string{
			"/bin/zsh", "/usr/bin/zsh",
			"/usr/local/bin/fish", "/opt/homebrew/bin/fish", "/bin/fish", "/usr/bin/fish",
			"/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash", "/opt/homebrew/bin/bash",
			"/bin/sh", "/usr/bin/sh",
		} {
			if _, err := os.Stat(candidate); err == nil {
				shellPath = candidate
				break
			}
		}
	}

	if shellPath == "" {
		path, err := exec.LookPath("sh")
		if err != nil {
			return "", nil, fmt.Errorf("no suitable shell found: %w", err)
		}
		shellPath = path
	}

	// Determine startup args: interactive login shell for zsh, bash, fish
	base := filepath.Base(shellPath)
	var args []string
	switch base {
	case "zsh", "bash", "fish":
		args = []string{"-l"}
	default:
		args = []string{}
	}

	return shellPath, args, nil
}

// CreateSession allocates a new PTY and launches the specified shell process.
func (m *Manager) CreateSession(id, shellName, cwd string, cols, rows uint16) (*Session, error) {
	if id == "" {
		return nil, errors.New("session id must not be empty")
	}

	shellPath, shellArgs, err := resolveShell(shellName)
	if err != nil {
		return nil, fmt.Errorf("resolve shell: %w", err)
	}

	if cwd == "" {
		var err error
		cwd, err = os.Getwd()
		if err != nil {
			cwd = os.Getenv("HOME")
		}
	}

	if cols == 0 {
		cols = 120
	}
	if rows == 0 {
		rows = 32
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, shellPath, shellArgs...)
	cmd.Dir = cwd

	// Inherit environment and inject required terminal defaults
	cmd.Env = append(cmd.Env, os.Environ()...)
	cmd.Env = append(cmd.Env,
		fmt.Sprintf("SHELL=%s", shellPath),
		"TERM=xterm-256color",
		"COLORTERM=truecolor",
		"LANG=en_US.UTF-8",
		fmt.Sprintf("WORKSPACE_ROOT=%s", cwd),
	)

	// Ensure process is created as a process group leader (Setpgid)
	setProcessGroup(cmd)

	ptyMaster, err := pty.StartWithSize(cmd, &pty.Winsize{
		Rows: rows,
		Cols: cols,
	})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("start pty: %w", err)
	}

	sess := &Session{
		ID:      id,
		Shell:   shellPath,
		Cwd:     cwd,
		Cols:    cols,
		Rows:    rows,
		Cmd:     cmd,
		Pty:     ptyMaster,
		Done:    make(chan struct{}),
		cancel:  cancel,
		subs:    make(map[chan []byte]struct{}),
		history: make([]byte, 0, 4096),
	}

	m.mu.Lock()
	m.sessions[id] = sess
	m.mu.Unlock()

	// Start PTY read pumping routine
	go sess.readPump(m)

	return sess, nil
}

func (s *Session) readPump(mgr *Manager) {
	defer func() {
		if err := mgr.CloseSession(s.ID); err != nil && !errors.Is(err, ErrSessionNotFound) && !errors.Is(err, ErrSessionClosed) {
			log.Printf("[terminal] error closing session %s: %v", s.ID, err)
		}
	}()

	buf := make([]byte, 4096)
	for {
		n, err := s.Pty.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			s.broadcast(chunk)
		}
		if err != nil {
			if errors.Is(err, io.EOF) || errors.Is(err, os.ErrClosed) {
				return
			}
			return
		}
	}
}

func (s *Session) broadcast(chunk []byte) {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()

	s.subMu.Lock()
	defer s.subMu.Unlock()

	// Append to history buffer so reconnecting or late-joining clients can replay
	s.history = append(s.history, chunk...)
	if len(s.history) > maxHistoryBytes {
		s.history = s.history[len(s.history)-maxHistoryBytes:]
	}

	for ch := range s.subs {
		select {
		case ch <- chunk:
		default:
			// Non-blocking drop to prevent lagging subscribers from stalling PTY
		}
	}
}

// Pid returns the underlying process identifier.
func (s *Session) Pid() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.Cmd != nil && s.Cmd.Process != nil {
		return s.Cmd.Process.Pid
	}
	return 0
}

// Wait returns a channel that is closed when the session terminates.
func (s *Session) Wait() <-chan struct{} {
	return s.Done
}

// withSession executes fn with the locked active session, handling lookup and closed checks.
func (m *Manager) withSession(sessionID string, fn func(sess *Session) error) error {
	sess, err := m.GetSession(sessionID)
	if err != nil {
		return err
	}

	sess.mu.Lock()
	defer sess.mu.Unlock()

	if sess.closed {
		return ErrSessionClosed
	}

	return fn(sess)
}

// Subscribe returns a channel that receives raw PTY byte output chunks,
// immediately primed with any existing history buffer so late-joining
// clients (like SSE EventSource) receive initial prompt and prior output.
// Uses an elastic per-subscriber FIFO queue to absorb high bursts lossless.
func (m *Manager) Subscribe(sessionID string) (<-chan []byte, func(), error) {
	sess, err := m.GetSession(sessionID)
	if err != nil {
		return nil, nil, err
	}

	sess.mu.Lock()
	if sess.closed {
		sess.mu.Unlock()
		return nil, nil, ErrSessionClosed
	}

	in := make(chan []byte, 256)
	out := make(chan []byte, 256)
	done := make(chan struct{})

	sess.subMu.Lock()
	if len(sess.history) > 0 {
		initial := make([]byte, len(sess.history))
		copy(initial, sess.history)
		in <- initial
	}
	sess.subs[in] = struct{}{}
	sess.subMu.Unlock()
	sess.mu.Unlock()

	go func() {
		defer close(out)
		var queue [][]byte
		for {
			if len(queue) == 0 {
				select {
				case <-done:
					return
				case chunk, ok := <-in:
					if !ok {
						return
					}
					queue = append(queue, chunk)
				}
			}

			select {
			case <-done:
				return
			case chunk, ok := <-in:
				if !ok {
					for _, q := range queue {
						select {
						case <-done:
							return
						case out <- q:
						}
					}
					return
				}
				// Elastic queue guard up to 8192 chunks (~32MB) to prevent OOM
				if len(queue) < 8192 {
					queue = append(queue, chunk)
				}
			case out <- queue[0]:
				queue = queue[1:]
			}
		}
	}()

	unsubscribe := func() {
		sess.subMu.Lock()
		if _, exists := sess.subs[in]; exists {
			delete(sess.subs, in)
			close(in)
		}
		sess.subMu.Unlock()
		select {
		case <-done:
		default:
			close(done)
		}
	}

	return out, unsubscribe, nil
}

// WriteInput sends raw input bytes to the PTY master.
func (m *Manager) WriteInput(sessionID string, data []byte) error {
	return m.withSession(sessionID, func(sess *Session) error {
		_, err := sess.Pty.Write(data)
		if err != nil {
			return fmt.Errorf("write to pty: %w", err)
		}
		return nil
	})
}

// Resize changes the terminal window dimensions.
func (m *Manager) Resize(sessionID string, cols, rows uint16) error {
	return m.withSession(sessionID, func(sess *Session) error {
		sess.Cols = cols
		sess.Rows = rows

		err := pty.Setsize(sess.Pty, &pty.Winsize{
			Rows: rows,
			Cols: cols,
		})
		if err != nil {
			return fmt.Errorf("resize pty: %w", err)
		}
		return nil
	})
}

// CloseSession terminates the PTY process and releases resources cleanly.
func (m *Manager) CloseSession(sessionID string) error {
	m.mu.Lock()
	sess, ok := m.sessions[sessionID]
	if !ok {
		m.mu.Unlock()
		return ErrSessionNotFound
	}
	delete(m.sessions, sessionID)
	m.mu.Unlock()

	sess.mu.Lock()
	if sess.closed {
		sess.mu.Unlock()
		return nil
	}
	sess.closed = true

	// Close all subscriber channels to wake up active SSE streams
	sess.subMu.Lock()
	for ch := range sess.subs {
		delete(sess.subs, ch)
		close(ch)
	}
	sess.history = nil
	sess.subMu.Unlock()

	// Terminate process tree
	sess.cancel()
	if sess.Cmd != nil && sess.Cmd.Process != nil {
		pid := sess.Cmd.Process.Pid
		// Attempt graceful SIGTERM to process group
		if pid > 0 {
			if err := killProcessGroup(pid, syscall.SIGTERM); err != nil && !errors.Is(err, syscall.ESRCH) {
				log.Printf("[terminal] warning sending SIGTERM to process group %d: %v", pid, err)
			}
		}

		// Wait briefly for graceful shutdown before force killing
		done := make(chan struct{})
		go func() {
			if err := sess.Cmd.Wait(); err != nil && !errors.Is(err, os.ErrProcessDone) {
				// Normal on forced process termination
			}
			close(done)
		}()

		select {
		case <-done:
		case <-time.After(500 * time.Millisecond):
			if pid > 0 {
				if err := killProcessGroup(pid, syscall.SIGKILL); err != nil && !errors.Is(err, syscall.ESRCH) {
					log.Printf("[terminal] warning sending SIGKILL to process group %d: %v", pid, err)
				}
			}
			if sess.Cmd.Process != nil {
				if err := sess.Cmd.Process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) && !errors.Is(err, syscall.ESRCH) {
					log.Printf("[terminal] warning killing process %d: %v", pid, err)
				}
			}
		}

		// Close PTY master fd
		if sess.Pty != nil {
			if err := sess.Pty.Close(); err != nil && !errors.Is(err, os.ErrClosed) {
				log.Printf("[terminal] warning closing PTY fd: %v", err)
			}
		}
	} else if sess.Pty != nil {
		if err := sess.Pty.Close(); err != nil && !errors.Is(err, os.ErrClosed) {
			log.Printf("[terminal] warning closing PTY fd: %v", err)
		}
	}

	close(sess.Done)
	sess.mu.Unlock()

	return nil
}

// GetSession returns metadata for an active session.
func (m *Manager) GetSession(sessionID string) (*Session, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	sess, ok := m.sessions[sessionID]
	if !ok {
		return nil, ErrSessionNotFound
	}
	return sess, nil
}

// ListSessions returns IDs and details of all running sessions.
func (m *Manager) ListSessions() []*Session {
	m.mu.RLock()
	defer m.mu.RUnlock()

	list := make([]*Session, 0, len(m.sessions))
	for _, sess := range m.sessions {
		list = append(list, sess)
	}
	return list
}
