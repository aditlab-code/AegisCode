package debug

import (
	"encoding/json"
)

// ProtocolMessage is the base DAP message structure.
type ProtocolMessage struct {
	Seq  int    `json:"seq"`
	Type string `json:"type"` // "request", "response", "event"
}

// Request represents a DAP request message from client to adapter.
type Request struct {
	Seq       int             `json:"seq"`
	Type      string          `json:"type"` // "request"
	Command   string          `json:"command"`
	Arguments json.RawMessage `json:"arguments,omitempty"`
}

// Response represents a DAP response message from adapter to client.
type Response struct {
	Seq        int             `json:"seq"`
	Type       string          `json:"type"` // "response"
	RequestSeq int             `json:"request_seq"`
	Success    bool            `json:"success"`
	Command    string          `json:"command"`
	Message    string          `json:"message,omitempty"`
	Body       json.RawMessage `json:"body,omitempty"`
}

// Event represents a DAP event message pushed by adapter.
type Event struct {
	Seq   int             `json:"seq"`
	Type  string          `json:"type"` // "event"
	Event string          `json:"event"`
	Body  json.RawMessage `json:"body,omitempty"`
}

// --- High-Level AegisCode Domain Models ---

// StartDebugRequest holds parameters for launching a debug session.
type StartDebugRequest struct {
	Program string            `json:"program"`          // e.g. "./cmd/server" or workspace root
	Args    []string          `json:"args,omitempty"`    // CLI args for program
	Env     map[string]string `json:"env,omitempty"`     // Custom environment variables
	Mode    string            `json:"mode,omitempty"`    // "debug" | "test" | "exec" (default: "debug")
	Cwd     string            `json:"cwd,omitempty"`     // Working directory
}

// Breakpoint represents a source file breakpoint.
type Breakpoint struct {
	ID       int    `json:"id,omitempty"`
	File     string `json:"file"`
	Line     int    `json:"line"`
	Verified bool   `json:"verified"`
	Message  string `json:"message,omitempty"`
}

// SetBreakpointsRequest payload for setting breakpoints in a file.
type SetBreakpointsRequest struct {
	File  string `json:"file"`
	Lines []int  `json:"lines"`
}

// StepRequest payload for controlling execution flow.
type StepRequest struct {
	Action string `json:"action"` // "continue" | "stepOver" | "stepIn" | "stepOut" | "pause"
}

// StackFrame represents a call stack frame.
type StackFrame struct {
	ID     int    `json:"id"`
	Name   string `json:"name"`
	File   string `json:"file"`
	Line   int    `json:"line"`
	Column int    `json:"column"`
}

// VariableItem represents an evaluated variable in a scope.
type VariableItem struct {
	Name               string `json:"name"`
	Value              string `json:"value"`
	Type               string `json:"type"`
	VariablesReference int    `json:"variablesReference,omitempty"`
}

// ThreadItem represents a runtime goroutine or thread.
type ThreadItem struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

// DebugState captures the current runtime debugging state.
type DebugState struct {
	Active      bool           `json:"active"`
	Status      string         `json:"status"` // "idle" | "running" | "stopped" | "terminated"
	CurrentFile string         `json:"currentFile,omitempty"`
	CurrentLine int            `json:"currentLine,omitempty"`
	StopReason  string         `json:"stopReason,omitempty"`
	StackFrames []StackFrame   `json:"stackFrames,omitempty"`
	Variables   []VariableItem `json:"variables,omitempty"`
	Threads     []ThreadItem   `json:"threads,omitempty"`
}

// StreamDebugEvent represents an SSE event pushed to the UI Shell.
type StreamDebugEvent struct {
	Type        string         `json:"type"` // "debug:started" | "debug:stopped" | "debug:continued" | "debug:output" | "debug:terminated"
	Status      string         `json:"status"`
	CurrentFile string         `json:"currentFile,omitempty"`
	CurrentLine int            `json:"currentLine,omitempty"`
	Reason      string         `json:"reason,omitempty"`
	Output      string         `json:"output,omitempty"`
	Category    string         `json:"category,omitempty"` // "stdout" | "stderr" | "console"
	State       *DebugState    `json:"state,omitempty"`
}
