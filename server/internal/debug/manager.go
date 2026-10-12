package debug

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

// Manager coordinates the Delve runner, DAP client connection, active breakpoints, and UI state synchronization.
type Manager struct {
	mu             sync.RWMutex
	runner         *Runner
	client         *DAPClient
	state          DebugState
	breakpoints    map[string][]int
	activeThreadID int
	subs           map[chan StreamDebugEvent]struct{}
	stopUnsub      func()
}

// NewManager creates a new debug session manager.
func NewManager() *Manager {
	return &Manager{
		breakpoints: make(map[string][]int),
		subs:        make(map[chan StreamDebugEvent]struct{}),
		state: DebugState{
			Active: false,
			Status: "idle",
		},
	}
}

// Subscribe attaches a channel to receive real-time debug events for SSE streaming.
func (m *Manager) Subscribe() (chan StreamDebugEvent, func()) {
	ch := make(chan StreamDebugEvent, 64)
	m.mu.Lock()
	m.subs[ch] = struct{}{}
	m.mu.Unlock()

	unsub := func() {
		m.mu.Lock()
		delete(m.subs, ch)
		m.mu.Unlock()
	}
	return ch, unsub
}

func (m *Manager) broadcast(evt StreamDebugEvent) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for ch := range m.subs {
		select {
		case ch <- evt:
		default:
		}
	}
}

// GetState returns the current debug session snapshot.
func (m *Manager) GetState() DebugState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state
}

// IsActive returns whether a debug session is currently running.
func (m *Manager) IsActive() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state.Active
}

// Start launches a new debugging session.
func (m *Manager) Start(ctx context.Context, req StartDebugRequest) error {
	m.mu.Lock()
	if m.state.Active {
		m.mu.Unlock()
		return errors.New("a debug session is already active; terminate it first")
	}
	m.mu.Unlock()

	// 1. Start Delve DAP runner
	runner, err := StartDelve(ctx, req.Cwd)
	if err != nil {
		return err
	}

	// 2. Dial DAP client
	dapAddr := fmt.Sprintf("127.0.0.1:%d", runner.Port)
	client, err := DialDAP(ctx, dapAddr)
	if err != nil {
		_ = runner.Close()
		return fmt.Errorf("failed to connect to delve DAP: %w", err)
	}

	// 3. Initialize DAP
	initCtx, initCancel := context.WithTimeout(ctx, 5*time.Second)
	_, err = client.Initialize(initCtx)
	initCancel()
	if err != nil {
		_ = client.Close()
		_ = runner.Close()
		return fmt.Errorf("DAP initialize failed: %w", err)
	}

	// 4. Launch target
	launchCtx, launchCancel := context.WithTimeout(ctx, 15*time.Second)
	_, err = client.Launch(launchCtx, req.Program, req.Args, req.Env, req.Cwd, req.Mode)
	launchCancel()
	if err != nil {
		_ = client.Close()
		_ = runner.Close()
		return fmt.Errorf("DAP launch failed: %w", err)
	}

	// 5. Send existing registered breakpoints
	m.mu.RLock()
	bpsToSet := make(map[string][]int, len(m.breakpoints))
	for f, lines := range m.breakpoints {
		bpsToSet[f] = append([]int(nil), lines...)
	}
	m.mu.RUnlock()

	for f, lines := range bpsToSet {
		bpCtx, bpCancel := context.WithTimeout(ctx, 3*time.Second)
		_, _ = client.SetBreakpoints(bpCtx, f, lines)
		bpCancel()
	}

	// 6. Configuration Done
	cfgCtx, cfgCancel := context.WithTimeout(ctx, 3*time.Second)
	_ = client.ConfigurationDone(cfgCtx)
	cfgCancel()

	// 7. Subscribe to DAP events
	evtCh, unsub := client.SubscribeEvents()

	m.mu.Lock()
	m.runner = runner
	m.client = client
	m.stopUnsub = unsub
	m.activeThreadID = 1
	m.state = DebugState{
		Active: true,
		Status: "running",
	}
	m.mu.Unlock()

	m.broadcast(StreamDebugEvent{
		Type:   "debug:started",
		Status: "running",
	})

	go m.eventLoop(evtCh)

	return nil
}

// eventLoop handles events pushed by Delve DAP.
func (m *Manager) eventLoop(evtCh chan *Event) {
	for evt := range evtCh {
		if evt == nil {
			return
		}
		switch evt.Event {
		case "stopped":
			var body struct {
				Reason            string `json:"reason"`
				ThreadID          int    `json:"threadId"`
				AllThreadsStopped bool   `json:"allThreadsStopped"`
			}
			_ = json.Unmarshal(evt.Body, &body)

			m.mu.Lock()
			m.state.Status = "stopped"
			m.state.StopReason = body.Reason
			if body.ThreadID > 0 {
				m.activeThreadID = body.ThreadID
			}
			threadID := m.activeThreadID
			client := m.client
			m.mu.Unlock()

			// Hydrate stack trace and variables
			var currentFile string
			var currentLine int
			var frames []StackFrame
			var vars []VariableItem

			if client != nil {
				ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
				if sf, err := client.StackTrace(ctx, threadID); err == nil && len(sf) > 0 {
					frames = sf
					currentFile = sf[0].File
					currentLine = sf[0].Line

					if scopes, err := client.Scopes(ctx, sf[0].ID); err == nil && len(scopes) > 0 {
						if vList, err := client.Variables(ctx, scopes[0]); err == nil {
							vars = vList
						}
					}
				}
				cancel()
			}

			m.mu.Lock()
			m.state.CurrentFile = currentFile
			m.state.CurrentLine = currentLine
			m.state.StackFrames = frames
			m.state.Variables = vars
			stateSnapshot := m.state
			m.mu.Unlock()

			m.broadcast(StreamDebugEvent{
				Type:        "debug:stopped",
				Status:      "stopped",
				CurrentFile: currentFile,
				CurrentLine: currentLine,
				Reason:      body.Reason,
				State:       &stateSnapshot,
			})

		case "continued":
			m.mu.Lock()
			m.state.Status = "running"
			m.state.CurrentFile = ""
			m.state.CurrentLine = 0
			m.state.StackFrames = nil
			m.state.Variables = nil
			m.mu.Unlock()

			m.broadcast(StreamDebugEvent{
				Type:   "debug:continued",
				Status: "running",
			})

		case "output":
			var body struct {
				Category string `json:"category"`
				Output   string `json:"output"`
			}
			if err := json.Unmarshal(evt.Body, &body); err == nil {
				m.broadcast(StreamDebugEvent{
					Type:     "debug:output",
					Category: body.Category,
					Output:   body.Output,
				})
			}

		case "terminated", "exited":
			_ = m.Terminate()
			return
		}
	}
}

// SetBreakpoints registers or updates breakpoints for a file.
func (m *Manager) SetBreakpoints(ctx context.Context, file string, lines []int) ([]Breakpoint, error) {
	m.mu.Lock()
	m.breakpoints[file] = lines
	client := m.client
	isActive := m.state.Active
	m.mu.Unlock()

	if isActive && client != nil {
		return client.SetBreakpoints(ctx, file, lines)
	}

	result := make([]Breakpoint, len(lines))
	for i, l := range lines {
		result[i] = Breakpoint{
			File:     file,
			Line:     l,
			Verified: true,
		}
	}
	return result, nil
}

// Step dispatches execution control commands.
func (m *Manager) Step(ctx context.Context, action string) error {
	m.mu.RLock()
	client := m.client
	threadID := m.activeThreadID
	isActive := m.state.Active
	m.mu.RUnlock()

	if !isActive || client == nil {
		return errors.New("no active debug session")
	}

	switch action {
	case "continue":
		return client.Continue(ctx, threadID)
	case "stepOver", "next":
		return client.Next(ctx, threadID)
	case "stepIn":
		return client.StepIn(ctx, threadID)
	case "stepOut":
		return client.StepOut(ctx, threadID)
	case "pause":
		return client.Pause(ctx, threadID)
	default:
		return fmt.Errorf("unknown debug step action: %s", action)
	}
}

// Terminate cleanly halts the debugging session and tears down all child processes.
func (m *Manager) Terminate() error {
	m.mu.Lock()
	if !m.state.Active {
		m.mu.Unlock()
		return nil
	}

	client := m.client
	runner := m.runner
	unsub := m.stopUnsub

	m.client = nil
	m.runner = nil
	m.stopUnsub = nil
	m.state.Active = false
	m.state.Status = "idle"
	m.state.CurrentFile = ""
	m.state.CurrentLine = 0
	m.state.StackFrames = nil
	m.state.Variables = nil
	m.mu.Unlock()

	if unsub != nil {
		unsub()
	}

	if client != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
		_ = client.Disconnect(ctx, true)
		cancel()
		_ = client.Close()
	}

	if runner != nil {
		_ = runner.Close()
	}

	m.broadcast(StreamDebugEvent{
		Type:   "debug:terminated",
		Status: "idle",
	})

	return nil
}
