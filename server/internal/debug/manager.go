package debug

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
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

// Runner returns the active debug adapter runner, if any.
func (m *Manager) Runner() *Runner {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.runner
}


// Start launches a new debugging session.
func (m *Manager) Start(ctx context.Context, req StartDebugRequest) error {
	m.mu.RLock()
	isActive := m.state.Active
	m.mu.RUnlock()
	if isActive {
		_ = m.Terminate()
	}

	// Merge initial breakpoints from request if provided
	if len(req.Breakpoints) > 0 {
		m.mu.Lock()
		for f, lines := range req.Breakpoints {
			m.breakpoints[f] = lines
		}
		m.mu.Unlock()
	}

	lang := DetectLanguage(req.Language, req.Program)
	cfg, ok := GetAdapter(lang)
	if !ok {
		cfg = Registry["go"]
	}

	// 1. Start runner and DAP client via Adapter Registry
	runner, client, err := StartAdapter(ctx, cfg, req.Program, req.Cwd)
	if err != nil {
		return err
	}

	// 2. Subscribe to DAP events early to capture compiler/runtime outputs during Launch
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

	go m.eventLoop(evtCh)

	go func() {
		<-runner.doneChan
		_ = m.Terminate()
	}()

	// 3. Initialize DAP specifying adapter ID
	initCtx, initCancel := context.WithTimeout(ctx, 5*time.Second)
	_, err = client.InitializeWithAdapter(initCtx, cfg.AdapterID)
	initCancel()
	if err != nil {
		_ = m.Terminate()
		return fmt.Errorf("DAP initialize failed: %w", err)
	}

	// 4. Launch target asynchronously
	targetProgram := req.Program
	if runner != nil && runner.Target != "" {
		targetProgram = runner.Target
	}
	launchArgs := cfg.LaunchArgs(targetProgram, req.Args, req.Env, req.Cwd)
	launchSeq, launchRespCh, err := client.SendRequestAsync("launch", launchArgs)
	if err != nil {
		_ = m.Terminate()
		return fmt.Errorf("DAP launch request failed: %w", err)
	}

	// 5. Send existing registered breakpoints
	m.mu.RLock()
	bpsToSet := make(map[string][]int, len(m.breakpoints))
	for f, lines := range m.breakpoints {
		bpsToSet[f] = append([]int(nil), lines...)
	}
	m.mu.RUnlock()

	for f, lines := range bpsToSet {
		targetFile := f
		if !filepath.IsAbs(targetFile) && req.Cwd != "" {
			targetFile = filepath.Join(req.Cwd, targetFile)
		}
		bpCtx, bpCancel := context.WithTimeout(ctx, 3*time.Second)
		_, _ = client.SetBreakpoints(bpCtx, targetFile, lines)
		bpCancel()
	}

	// 6. Configuration Done
	cfgCtx, cfgCancel := context.WithTimeout(ctx, 3*time.Second)
	_ = client.ConfigurationDone(cfgCtx)
	cfgCancel()

	// 7. Await launch response
	launchCtx, launchCancel := context.WithTimeout(ctx, 30*time.Second)
	_, err = client.WaitResponse(launchCtx, launchSeq, launchRespCh, "launch")
	launchCancel()
	if err != nil {
		_ = m.Terminate()
		return fmt.Errorf("DAP launch failed: %w", err)
	}

	m.broadcast(StreamDebugEvent{
		Type:   "debug:started",
		Status: "running",
	})

	return nil
}

// eventLoop handles events pushed by Delve DAP.
func (m *Manager) eventLoop(evtCh chan *Event) {
	defer func() {
		_ = m.Terminate()
	}()

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
	runner := m.runner
	m.mu.Unlock()

	targetFile := file
	if !filepath.IsAbs(targetFile) && runner != nil && runner.Cwd != "" {
		targetFile = filepath.Join(runner.Cwd, targetFile)
	}

	if isActive && client != nil {
		return client.SetBreakpoints(ctx, targetFile, lines)
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
