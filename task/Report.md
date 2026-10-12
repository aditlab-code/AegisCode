# Cross-Provider Tool Call Comparison & Idiomatic Normalizer Architecture

The following provides a comprehensive comparison table of tool call structures across AI providers and their idiomatic aggregator and normalizer implementation in Go.

---

### 1. Cross-Provider Tool Call Comparison Table

| Aspect / Characteristic | Antigravity CLI (`agy`) | Claude (Anthropic API / CLI) | OpenCode / OpenRouter (OpenAI Spec) | AegisCode Target Standard (`SSE`) |
| --- | --- | --- | --- | --- |
| **Streaming Mechanism** | NDJSON line-by-line via CLI process `stdout` | HTTP SSE (`event:` + `data: JSON`) | HTTP SSE (`data: JSON`) with delta fragments | `event: tool_call` via Go HTTP SSE |
| **Unique Identity (ID)** | Step-based: integer `step_index` (e.g., `1`, `2`) | Random unique string: `id: "toolu_01AbC..."` | Random string: `id: "call_abc..."` per object in `tool_calls` array | Unified into `tc-<id>` or `tc-<stepIdx>` |
| **Argument Transmission** | Direct JSON object in `tool_info.parameters` / `tool_args` | Partial string chunks in `content_block_delta` (`input_json_delta`) | Incremental partial string chunks in `choices[0].delta.tool_calls[i].function.arguments` | Clean, validated, and fully parsed map (`map[string]any`) |
| **Status Tracking** | Explicit: `step_update.state` (`ACTIVE` $\rightarrow$ `DONE`) | Block event driven: `content_block_start` $\rightarrow$ `content_block_stop` | Implicit: detected when `finish_reason: "tool_calls"` | `status: "running"` $\rightarrow$ `status: "success"` |
| **Output / Return** | Directly bundled in `step_update.tool_info.output` | Distinct message turn (`role: "user"`, `type: "tool_result"`) | Distinct message turn (`role: "tool"`, `tool_call_id: "..."`) | Text output (capped at max 2,500 characters in UI preview) |
| **Path Key Variants** | `AbsolutePath`, `filePath`, `path` | `path`, `file_path` | `path`, `filename`, `file_path` | Normalized to single canonical `targetFile` |
| **Shell Command Variants** | `command`, `cmd` | `command` | `cmd`, `command` | Normalized to single canonical `command` |

---

### 2. Contract & Data Type Definitions in Go

Retain this unified contract in the internal AI package (`server/internal/ai/types.go`):

```go
package ai

import (
	"strings"
	"time"
)

// ToolCallEvent represents a single payload broadcast to the frontend via SSE
type ToolCallEvent struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Summary    string         `json:"summary"`
	Status     string         `json:"status"` // "running" | "success" | "error"
	TargetFile string         `json:"targetFile,omitempty"`
	Args       map[string]any `json:"args"`
	Output     string         `json:"output,omitempty"`
	Timestamp  int64          `json:"timestamp"`
}

// InFlightToolState buffers streaming argument fragments until valid JSON is assembled
type InFlightToolState struct {
	Index       int
	ID          string
	Name        string
	ArgsBuilder strings.Builder
	ParsedArgs  map[string]any
	Status      string
	Output      string
}
```

---

### 3. Normalization Helper: Key Sanitization & Anti-Ghost Tab Guard

To prevent ghost tab anomalies (empty tabs opened due to invalid file paths or paths matching tool names):

```go
package ai

import "strings"

// SanitizeString strips whitespace and surrounding quotes/backticks
func SanitizeString(s string) string {
	return strings.Trim(s, "\"'` \t\r\n")
}

// ExtractTargetFile resolves target file paths across diverse parameter key conventions
func ExtractTargetFile(toolName string, args map[string]any) string {
	candidateKeys := []string{"AbsolutePath", "filePath", "path", "targetFile", "TargetFile", "filename"}
	for _, k := range candidateKeys {
		if raw, ok := args[k].(string); ok {
			clean := SanitizeString(raw)
			// Guard: Path must not be empty and must not match the tool name itself
			if clean != "" && clean != toolName {
				return clean
			}
		}
	}
	return ""
}

// GenerateSummary constructs concise human-readable summaries for user interface display
func GenerateSummary(name, targetFile string, args map[string]any) string {
	if rawSummary, ok := args["toolSummary"].(string); ok && rawSummary != "" {
		return SanitizeString(rawSummary)
	}
	if rawAction, ok := args["toolAction"].(string); ok && rawAction != "" {
		return SanitizeString(rawAction)
	}

	switch name {
	case "view_file", "Read", "read_file":
		if targetFile != "" {
			return "Reading " + targetFile
		}
		return "Reading file"
	case "write_to_file", "Write", "replace_file_content", "create_file":
		if targetFile != "" {
			return "Writing " + targetFile
		}
		return "Modifying file"
	case "run_command", "bash", "execute":
		if cmd, ok := args["command"].(string); ok {
			return "Running: " + SanitizeString(cmd)
		}
		return "Running terminal command"
	default:
		return name
	}
}
```

---

### 4. Provider-Specific Handlers in Go

#### A. Antigravity CLI Handler (`agy` NDJSON)

Antigravity streams events line by line. Extraction targets `step_update.tool_info`:

```go
package ai

import (
	"encoding/json"
	"fmt"
	"time"
)

type AGYStepUpdate struct {
	StepIndex int `json:"step_index"`
	ToolInfo  struct {
		Name       string         `json:"name"`
		Parameters map[string]any `json:"parameters"`
		Output     string         `json:"output"`
	} `json:"tool_info"`
	ToolArgs map[string]any `json:"tool_args"` // Fallback
	State    string         `json:"state"`     // "ACTIVE" | "DONE"
}

func HandleAntigravityLine(rawJSON []byte, emit func(ToolCallEvent)) error {
	var payload struct {
		Event      string         `json:"event"`
		StepUpdate *AGYStepUpdate `json:"step_update"`
	}
	if err := json.Unmarshal(rawJSON, &payload); err != nil {
		return err
	}

	su := payload.StepUpdate
	if su == nil || su.ToolInfo.Name == "" {
		return nil
	}

	args := su.ToolInfo.Parameters
	if len(args) == 0 && len(su.ToolArgs) > 0 {
		args = su.ToolArgs
	}

	for k, v := range args {
		if s, ok := v.(string); ok {
			args[k] = SanitizeString(s)
		}
	}

	status := "running"
	if su.State == "DONE" {
		status = "success"
	}

	toolID := fmt.Sprintf("tc-%d", su.StepIndex)
	targetFile := ExtractTargetFile(su.ToolInfo.Name, args)

	outputPreview := su.ToolInfo.Output
	if len(outputPreview) > 2500 {
		outputPreview = outputPreview[:2500] + "\n... (output truncated)"
	}

	event := ToolCallEvent{
		ID:         toolID,
		Name:       su.ToolInfo.Name,
		Summary:    GenerateSummary(su.ToolInfo.Name, targetFile, args),
		Status:     status,
		TargetFile: targetFile,
		Args:       args,
		Output:     outputPreview,
		Timestamp:  time.Now().Unix(),
	}

	emit(event)
	return nil
}
```

---

#### B. OpenCode / OpenRouter (OpenAI-Compatible Delta Aggregator)

OpenAI streams fragmented argument tokens per chunk. String accumulation is buffered in-memory until completion:

```go
package ai

import (
	"encoding/json"
	"fmt"
	"time"
)

type OpenAIToolChunk struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type OpenAIAggregator struct {
	tools map[int]*InFlightToolState
}

func NewOpenAIAggregator() *OpenAIAggregator {
	return &OpenAIAggregator{tools: make(map[int]*InFlightToolState)}
}

func (a *OpenAIAggregator) IngestChunk(chunks []OpenAIToolChunk, emit func(ToolCallEvent)) {
	for _, chunk := range chunks {
		tool, exists := a.tools[chunk.Index]
		if !exists {
			toolID := chunk.ID
			if toolID == "" {
				toolID = fmt.Sprintf("tc-oa-%d", chunk.Index)
			}
			tool = &InFlightToolState{
				Index:  chunk.Index,
				ID:     toolID,
				Name:   chunk.Function.Name,
				Status: "running",
			}
			a.tools[chunk.Index] = tool

			emit(ToolCallEvent{
				ID:        tool.ID,
				Name:      tool.Name,
				Summary:   "Preparing " + tool.Name,
				Status:    "running",
				Args:      map[string]any{},
				Timestamp: time.Now().Unix(),
			})
		}

		if chunk.Function.Name != "" && tool.Name == "" {
			tool.Name = chunk.Function.Name
		}
		if chunk.Function.Arguments != "" {
			tool.ArgsBuilder.WriteString(chunk.Function.Arguments)
		}
	}
}

func (a *OpenAIAggregator) Finalize(emit func(ToolCallEvent)) {
	for _, tool := range a.tools {
		var parsedArgs map[string]any
		rawJSON := tool.ArgsBuilder.String()

		if err := json.Unmarshal([]byte(rawJSON), &parsedArgs); err != nil {
			parsedArgs = map[string]any{"raw": rawJSON}
		}

		targetFile := ExtractTargetFile(tool.Name, parsedArgs)

		emit(ToolCallEvent{
			ID:         tool.ID,
			Name:       tool.Name,
			Summary:    GenerateSummary(tool.Name, targetFile, parsedArgs),
			Status:     "success",
			TargetFile: targetFile,
			Args:       parsedArgs,
			Timestamp:  time.Now().Unix(),
		})
	}
}
```

---

#### C. Claude Handler (Anthropic Content Blocks)

Claude streams explicit block open, JSON delta fragments, and block stop signals:

```go
package ai

import (
	"encoding/json"
	"strings"
	"time"
)

type ClaudeBlockHandler struct {
	currentTool *InFlightToolState
}

func (c *ClaudeBlockHandler) HandleEvent(eventType string, data []byte, emit func(ToolCallEvent)) error {
	switch eventType {
	case "content_block_start":
		var p struct {
			Index        int `json:"index"`
			ContentBlock struct {
				Type string `json:"type"` // "tool_use"
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
		}
		if err := json.Unmarshal(data, &p); err == nil && p.ContentBlock.Type == "tool_use" {
			c.currentTool = &InFlightToolState{
				Index:  p.Index,
				ID:     p.ContentBlock.ID,
				Name:   p.ContentBlock.Name,
				Status: "running",
			}
			emit(ToolCallEvent{
				ID:        p.ContentBlock.ID,
				Name:      p.ContentBlock.Name,
				Summary:   "Preparing " + p.ContentBlock.Name,
				Status:    "running",
				Args:      map[string]any{},
				Timestamp: time.Now().Unix(),
			})
		}

	case "content_block_delta":
		var p struct {
			Delta struct {
				Type        string `json:"type"` // "input_json_delta"
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
		}
		if err := json.Unmarshal(data, &p); err == nil && c.currentTool != nil {
			if p.Delta.Type == "input_json_delta" {
				c.currentTool.ArgsBuilder.WriteString(p.Delta.PartialJSON)
			}
		}

	case "content_block_stop":
		if c.currentTool != nil {
			var args map[string]any
			raw := strings.TrimSpace(c.currentTool.ArgsBuilder.String())
			if raw != "" {
				_ = json.Unmarshal([]byte(raw), &args)
			}

			targetFile := ExtractTargetFile(c.currentTool.Name, args)

			emit(ToolCallEvent{
				ID:         c.currentTool.ID,
				Name:       c.currentTool.Name,
				Summary:    GenerateSummary(c.currentTool.Name, targetFile, args),
				Status:     "success",
				TargetFile: targetFile,
				Args:       args,
				Timestamp:  time.Now().Unix(),
			})
			c.currentTool = nil
		}
	}
	return nil
}
```

---

### Unified End-to-End Pipeline

```
[Antigravity NDJSON]       -> HandleAntigravityLine()    \
[OpenAI/OpenRouter Delta]  -> OpenAIAggregator            +-> [Sanitizer & Anti-Ghost Guard] -> emit(ToolCallEvent) -> Frontend SSE
[Claude Content Block]     -> ClaudeBlockHandler         /
```

Through this abstraction, each provider is handled by an isolated adapter in the Go backend, while the React frontend consumes a unified, clean, and normalized data structure free from partial text anomalies.