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
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

var (
	ErrSessionNotFound = errors.New("terminal session not found")
	ErrSessionClosed   = errors.New("terminal session already closed")
)

const (
	maxHistoryBytes      = 512 * 1024       // 512 KB ring buffer replay for reconnects & initial prompt
	defaultInitialBufCap = 64 * 1024        // 64 KB initial dynamic ring buffer size
	defaultMaxBufCap     = 8 * 1024 * 1024  // 8 MB max dynamic ring buffer size per subscriber
	highWaterMarkBytes   = 2 * 1024 * 1024  // 2 MB threshold: triggers PTY readPump backpressure
	lowWaterMarkBytes    = 512 * 1024       // 512 KB threshold: releases PTY readPump backpressure
	stalledTimeout       = 15 * time.Second // timeout to evict unresponsive stalled subscribers
	maxChunkReadBytes    = 32 * 1024        // 32 KB chunk size for SSE batching during bursts
)

// subscriber manages buffered byte streaming to a client using an elastic circular buffer.
type subscriber struct {
	mu         sync.Mutex
	buf        *dynamicRingBuffer
	notify     chan struct{}
	out        chan []byte
	done       chan struct{}
	closed     bool
	lastActive time.Time
}

func newSubscriber(initialCap, maxCap int) *subscriber {
	return &subscriber{
		buf:        newDynamicRingBuffer(initialCap, maxCap),
		notify:     make(chan struct{}, 1),
		out:        make(chan []byte, 16),
		done:       make(chan struct{}),
		lastActive: time.Now(),
	}
}

func (sub *subscriber) write(chunk []byte) {
	sub.mu.Lock()
	defer sub.mu.Unlock()

	if sub.closed {
		return
	}

	_, _ = sub.buf.Write(chunk)

	select {
	case sub.notify <- struct{}{}:
	default:
	}
}

func (sub *subscriber) close() {
	sub.mu.Lock()
	if sub.closed {
		sub.mu.Unlock()
		return
	}
	sub.closed = true
	sub.mu.Unlock()

	select {
	case <-sub.done:
	default:
		close(sub.done)
	}
}

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
	subs      map[*subscriber]struct{}
	drainCh   chan struct{}
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

var allowedShells = map[string]struct{}{
	"zsh":        {},
	"bash":       {},
	"sh":         {},
	"fish":       {},
	"pwsh":       {},
	"powershell": {},
	"cmd":        {},
	"cmd.exe":    {},
}

func isAllowedShell(preferred string) bool {
	clean := strings.ToLower(filepath.Base(strings.TrimSpace(preferred)))
	clean = strings.TrimSuffix(clean, ".exe")
	_, ok := allowedShells[clean]
	return ok
}

// resolveShell determines the executable shell path and appropriate startup args (e.g. login shell).
func resolveShell(preferred string) (string, []string, error) {
	var shellPath string
	if preferred != "" && preferred != "default" {
		if !isAllowedShell(preferred) {
			return "", nil, fmt.Errorf("disallowed shell '%s': shell must be one of zsh, bash, sh, fish, powershell, or cmd", preferred)
		}
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
		subs:    make(map[*subscriber]struct{}),
		drainCh: make(chan struct{}, 1),
		history: make([]byte, 0, 4096),
	}

	m.mu.Lock()
	m.sessions[id] = sess
	m.mu.Unlock()

	// Start PTY read pumping routine
	go sess.readPump(m)

	return sess, nil
}

func (s *Session) notifyDrain() {
	select {
	case s.drainCh <- struct{}{}:
	default:
	}
}

func (s *Session) waitBackpressure() {
	for {
		s.mu.Lock()
		closed := s.closed
		s.mu.Unlock()
		if closed {
			return
		}

		s.subMu.Lock()
		if len(s.subs) == 0 {
			s.subMu.Unlock()
			return
		}

		now := time.Now()
		var congestedSubs []*subscriber
		var stalledSubs []*subscriber

		for sub := range s.subs {
			sub.mu.Lock()
			buffered := sub.buf.Len()
			lastActive := sub.lastActive
			sub.mu.Unlock()

			if buffered >= highWaterMarkBytes {
				if now.Sub(lastActive) > stalledTimeout {
					stalledSubs = append(stalledSubs, sub)
				} else {
					congestedSubs = append(congestedSubs, sub)
				}
			}
		}

		// Evict any dead / unresponsive subscribers that exceeded stalledTimeout
		for _, sub := range stalledSubs {
			log.Printf("[terminal] evicting stalled subscriber for session %s (stalled for %v)", s.ID, now.Sub(sub.lastActive))
			delete(s.subs, sub)
			sub.close()
		}

		if len(congestedSubs) == 0 {
			s.subMu.Unlock()
			return
		}

		drainCh := s.drainCh
		s.subMu.Unlock()

		select {
		case <-s.Done:
			return
		case <-drainCh:
			// Woken up by a subscriber draining below lowWaterMark
		case <-time.After(10 * time.Millisecond):
			// Adaptive backpressure polling fallback
		}
	}
}

func (s *Session) readPump(mgr *Manager) {
	defer func() {
		if err := mgr.CloseSession(s.ID); err != nil && !errors.Is(err, ErrSessionNotFound) && !errors.Is(err, ErrSessionClosed) {
			log.Printf("[terminal] error closing session %s: %v", s.ID, err)
		}
	}()

	buf := make([]byte, 4096)
	for {
		s.waitBackpressure()

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

	for sub := range s.subs {
		sub.write(chunk)
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

	sub := newSubscriber(defaultInitialBufCap, defaultMaxBufCap)

	sess.subMu.Lock()
	if len(sess.history) > 0 {
		initial := make([]byte, len(sess.history))
		copy(initial, sess.history)
		sub.write(initial)
	}
	sess.subs[sub] = struct{}{}
	sess.subMu.Unlock()
	sess.mu.Unlock()

	go func() {
		defer close(sub.out)
		for {
			sub.mu.Lock()
			if sub.buf.Len() > 0 {
				chunk := sub.buf.PopChunk(maxChunkReadBytes)
				remaining := sub.buf.Len()
				sub.lastActive = time.Now()
				sub.mu.Unlock()

				if remaining <= lowWaterMarkBytes {
					sess.notifyDrain()
				}

				select {
				case <-sub.done:
					return
				case sub.out <- chunk:
				}
				continue
			}

			if sub.closed {
				sub.mu.Unlock()
				return
			}
			sub.mu.Unlock()

			select {
			case <-sub.done:
				return
			case <-sub.notify:
			}
		}
	}()

	unsubscribe := func() {
		sess.subMu.Lock()
		if _, exists := sess.subs[sub]; exists {
			delete(sess.subs, sub)
		}
		sess.subMu.Unlock()

		sub.close()
		sess.notifyDrain()
	}

	return sub.out, unsubscribe, nil
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
	for sub := range sess.subs {
		delete(sess.subs, sub)
		sub.close()
	}
	sess.history = nil
	sess.subMu.Unlock()
	sess.notifyDrain()

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
