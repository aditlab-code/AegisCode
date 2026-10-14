package ai

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

// ModelItem represents an AI model available through Antigravity.
type ModelItem struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Provider    string `json:"provider"`
	Description string `json:"description,omitempty"`
}

// AntigravityEngine implements ProviderEngine using the out-of-process Antigravity CLI ('agy').
type AntigravityEngine struct{}

func (e *AntigravityEngine) StreamChat(ctx context.Context, req StreamChatRequest, sendEvent EventSender) error {
	return StreamChatAntigravity(ctx, req, sendEvent)
}

// TranscriptEntry represents a single step in Antigravity transcript.jsonl.
type TranscriptEntry struct {
	StepIndex int            `json:"step_index"`
	Source    string         `json:"source"`
	Type      string         `json:"type"`
	Status    string         `json:"status"`
	CreatedAt string         `json:"created_at"`
	Content   string         `json:"content,omitempty"`
	Thinking  string         `json:"thinking,omitempty"`
	ToolCalls []ToolCallData `json:"tool_calls,omitempty"`
}

// ToolCallData matches the JSON structure of tool_calls in transcript.jsonl.
type ToolCallData struct {
	Name string         `json:"name"`
	Args map[string]any `json:"args,omitempty"`
}

var (
	modelCacheMu    sync.RWMutex
	cachedModels    []ModelItem
	modelCacheTime  time.Time
	defaultCacheTTL = 5 * time.Minute
)

// NewUUID generates a version 4 UUID.
func NewUUID() string {
	var uuid [16]byte
	_, _ = rand.Read(uuid[:])
	uuid[6] = (uuid[6] & 0x0f) | 0x40
	uuid[8] = (uuid[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", uuid[0:4], uuid[4:6], uuid[6:8], uuid[8:10], uuid[10:16])
}

// ResolveAntigravityBinary finds the path to the 'agy' or 'antigravity' CLI binary.
func ResolveAntigravityBinary() string {
	home, _ := os.UserHomeDir()
	candidates := []string{
		"agy",
		"antigravity",
	}
	if home != "" {
		candidates = append(candidates,
			filepath.Join(home, ".local", "bin", "agy"),
			filepath.Join(home, ".local", "bin", "antigravity"),
			filepath.Join(home, ".gemini", "antigravity-cli", "bin", "agy"),
		)
	}

	for _, cand := range candidates {
		if p, err := exec.LookPath(cand); err == nil {
			return p
		}
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			return cand
		}
	}
	return ""
}

// ListAntigravityModels probes available models from 'agy models' with caching.
func ListAntigravityModels(ctx context.Context) ([]ModelItem, error) {
	modelCacheMu.RLock()
	if len(cachedModels) > 0 && time.Since(modelCacheTime) < defaultCacheTTL {
		res := make([]ModelItem, len(cachedModels))
		copy(res, cachedModels)
		modelCacheMu.RUnlock()
		return res, nil
	}
	modelCacheMu.RUnlock()

	binary := ResolveAntigravityBinary()
	if binary == "" {
		return fallbackModels(), nil
	}

	probeCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	cmd := exec.CommandContext(probeCtx, binary, "models")
	out, err := cmd.Output()
	if err != nil {
		return fallbackModels(), nil
	}

	var parsed []ModelItem
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.Contains(line, "Fetching") || strings.HasPrefix(line, "⠋") || strings.HasPrefix(line, "⠙") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 1 {
			modelID := fields[0]
			displayName := strings.TrimSpace(line[len(modelID):])
			if displayName == "" {
				displayName = modelID
			}
			parsed = append(parsed, ModelItem{
				ID:          modelID,
				Name:        displayName,
				Provider:    "antigravity",
				Description: fmt.Sprintf("%s via local Antigravity runtime", displayName),
			})
		}
	}

	if len(parsed) == 0 {
		parsed = fallbackModels()
	}

	modelCacheMu.Lock()
	cachedModels = parsed
	modelCacheTime = time.Now()
	modelCacheMu.Unlock()

	res := make([]ModelItem, len(parsed))
	copy(res, parsed)
	return res, nil
}

func fallbackModels() []ModelItem {
	return []ModelItem{
		{ID: "gemini-3.8-flash-high", Name: "Gemini 3.8 Flash (High)", Provider: "antigravity", Description: "Flagship high-speed reasoning"},
		{ID: "gemini-3.8-flash-medium", Name: "Gemini 3.8 Flash (Medium)", Provider: "antigravity", Description: "Balanced speed and code generation"},
		{ID: "gemini-3.8-flash-low", Name: "Gemini 3.8 Flash (Low)", Provider: "antigravity", Description: "Ultra low-latency iterations"},
		{ID: "gemini-3.7-flash-high", Name: "Gemini 3.7 Flash (High)", Provider: "antigravity", Description: "Proven stable multi-turn coding"},
		{ID: "gemini-3.1-pro-high", Name: "Gemini 3.1 Pro (High)", Provider: "antigravity", Description: "Deep architectural reasoning"},
		{ID: "claude-sonnet-4-6", Name: "Claude Sonnet 4.6 (Thinking)", Provider: "antigravity", Description: "Claude Sonnet 4.6 via Antigravity"},
		{ID: "claude-opus-4-6-thinking", Name: "Claude Opus 4.6 (Thinking)", Provider: "antigravity", Description: "Maximum reasoning capacity"},
	}
}

// GetSessionTranscript reads Antigravity transcript.jsonl and returns chat messages.
func GetSessionTranscript(conversationID string) ([]store.ChatMessage, error) {
	if strings.TrimSpace(conversationID) == "" {
		return nil, fmt.Errorf("empty conversation id")
	}

	home, _ := os.UserHomeDir()
	if home == "" {
		return nil, fmt.Errorf("user home directory not found")
	}

	candidates := []string{
		filepath.Join(home, ".gemini", "antigravity-cli", "brain", conversationID, ".system_generated", "logs", "transcript.jsonl"),
		filepath.Join(home, ".gemini", "antigravity", "brain", conversationID, ".system_generated", "logs", "transcript.jsonl"),
	}

	var targetPath string
	for _, cand := range candidates {
		if fi, err := os.Stat(cand); err == nil && !fi.IsDir() {
			targetPath = cand
			break
		}
	}

	if targetPath == "" {
		return nil, os.ErrNotExist
	}

	file, err := os.Open(targetPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open transcript: %w", err)
	}
	defer file.Close()

	var messages []store.ChatMessage
	scanner := bufio.NewScanner(file)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		var entry TranscriptEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			continue
		}

		if entry.Type == "USER_INPUT" && strings.TrimSpace(entry.Content) != "" {
			messages = append(messages, store.ChatMessage{
				ID:        fmt.Sprintf("msg-%d", entry.StepIndex),
				Role:      "user",
				Text:      UnwrapUserPrompt(entry.Content),
				Timestamp: parseTimestamp(entry.CreatedAt),
			})
		} else if entry.Type == "PLANNER_RESPONSE" {
			var toolCalls []store.ToolCallItem
			for idx, tc := range entry.ToolCalls {
				cleanArgs := make(map[string]any, len(tc.Args))
				for k, v := range tc.Args {
					if strVal, ok := v.(string); ok {
						cleanArgs[k] = SanitizeString(strVal)
					} else {
						cleanArgs[k] = v
					}
				}

				targetFile := ExtractTargetFile(tc.Name, cleanArgs)
				summary := GenerateSummary(tc.Name, targetFile, cleanArgs)
				toolCalls = append(toolCalls, store.ToolCallItem{
					ID:         fmt.Sprintf("tc-%d-%d", entry.StepIndex, idx),
					Name:       tc.Name,
					Summary:    summary,
					Status:     "success",
					TargetFile: targetFile,
					Args:       cleanArgs,
				})
			}

			if strings.TrimSpace(entry.Content) != "" || strings.TrimSpace(entry.Thinking) != "" || len(toolCalls) > 0 {
				messages = append(messages, store.ChatMessage{
					ID:        fmt.Sprintf("msg-%d", entry.StepIndex),
					Role:      "agent",
					Text:      entry.Content,
					Thinking:  entry.Thinking,
					ToolCalls: toolCalls,
					Timestamp: parseTimestamp(entry.CreatedAt),
				})
			}
		} else if (entry.Type == "GENERIC" || entry.Type == "TOOL_OUTPUT") && strings.TrimSpace(entry.Content) != "" {
			if len(messages) > 0 {
				lastMsg := &messages[len(messages)-1]
				if lastMsg.Role == "agent" && len(lastMsg.ToolCalls) > 0 {
					lastTC := &lastMsg.ToolCalls[len(lastMsg.ToolCalls)-1]
					if lastTC.Output == "" {
						lastTC.Output = CapOutput(entry.Content, 2500)
					}
				}
			}
		}
	}

	return messages, nil
}

func parseTimestamp(ts string) int64 {
	if ts == "" {
		return time.Now().UnixMilli()
	}
	t, err := time.Parse(time.RFC3339, ts)
	if err != nil {
		return time.Now().UnixMilli()
	}
	return t.UnixMilli()
}

func normalizeAntigravityModel(model string) string {
	m := strings.TrimSpace(model)
	switch m {
	case "", "gemini-3.8-flash":
		return "gemini-3.8-flash-high"
	case "gemini-3.8-medium":
		return "gemini-3.8-flash-medium"
	case "gemini-3.7-flash":
		return "gemini-3.7-flash-high"
	case "gemini-3.1-pro":
		return "gemini-3.1-pro-high"
	default:
		return m
	}
}

func conversationExists(convID string) bool {
	if strings.TrimSpace(convID) == "" {
		return false
	}
	home, _ := os.UserHomeDir()
	if home == "" {
		return false
	}
	candidates := []string{
		filepath.Join(home, ".gemini", "antigravity-cli", "brain", convID),
		filepath.Join(home, ".gemini", "antigravity", "brain", convID),
	}
	for _, cand := range candidates {
		if fi, err := os.Stat(cand); err == nil && fi.IsDir() {
			return true
		}
	}
	return false
}

// StreamChatAntigravity executes an Antigravity turn and writes events via sendEvent.
func StreamChatAntigravity(ctx context.Context, req StreamChatRequest, sendEvent EventSender) error {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return fmt.Errorf("prompt cannot be empty")
	}

	convID := strings.TrimSpace(req.ConversationID)
	if convID == "" {
		convID = NewUUID()
	}

	binary := ResolveAntigravityBinary()
	if binary == "" {
		errEvt := StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          "Antigravity CLI ('agy') not found in PATH or ~/.local/bin. Please ensure Antigravity is installed.",
		}
		_ = sendEvent("error", errEvt)
		return fmt.Errorf("antigravity binary not found")
	}

	// Send initial start event
	_ = sendEvent("start", StreamEvent{
		Type:           "start",
		ConversationID: convID,
	})

	args := []string{
		"--dangerously-skip-permissions",
		"--output-format", "stream-json",
	}

	if conversationExists(convID) {
		args = append(args, "--conversation", convID)
	}

	effectiveModel := normalizeAntigravityModel(req.Model)
	if effectiveModel != "" {
		args = append(args, "--model", effectiveModel)
	}

	effectivePrompt := WrapPromptWithSystemContext(prompt)
	args = append(args, "-p", effectivePrompt)

	cmd := exec.CommandContext(ctx, binary, args...)

	// Ensure user's local bin directory is present in PATH for MCP tools (cross-platform)
	home, _ := os.UserHomeDir()
	env := os.Environ()
	sep := string(os.PathListSeparator)
	var localBins []string
	if home != "" {
		localBins = append(localBins, filepath.Join(home, ".local", "bin"))
	}
	pathUpdated := false
	for i, e := range env {
		if strings.HasPrefix(strings.ToUpper(e), "PATH=") {
			currentPath := e[5:]
			var toPrepend []string
			for _, lb := range localBins {
				if !strings.Contains(currentPath, lb) {
					toPrepend = append(toPrepend, lb)
				}
			}
			if len(toPrepend) > 0 {
				env[i] = "PATH=" + strings.Join(toPrepend, sep) + sep + currentPath
			}
			pathUpdated = true
			break
		}
	}
	if !pathUpdated && len(localBins) > 0 {
		env = append(env, "PATH="+strings.Join(localBins, sep))
	}
	if req.WorkspaceDir != "" {
		env = append(env, "WORKSPACE_ROOT="+req.WorkspaceDir)
	}
	cmd.Env = env

	if req.WorkspaceDir != "" {
		if fi, err := os.Stat(req.WorkspaceDir); err == nil && fi.IsDir() {
			cmd.Dir = req.WorkspaceDir
		}
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          fmt.Sprintf("Failed to open stdout pipe: %v", err),
		})
		return err
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          fmt.Sprintf("Failed to open stderr pipe: %v", err),
		})
		return err
	}

	if err := cmd.Start(); err != nil {
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          fmt.Sprintf("Failed to start Antigravity process: %v", err),
		})
		return err
	}

	var wg sync.WaitGroup
	var accumulatedText strings.Builder
	var accumulatedThinking strings.Builder
	var toolCalls []store.ToolCallItem
	var stderrOutput strings.Builder

	// Read stderr in background
	wg.Add(1)
	go func() {
		defer wg.Done()
		s := bufio.NewScanner(stderr)
		for s.Scan() {
			line := s.Text()
			stderrOutput.WriteString(line + "\n")
		}
	}()

	// Read stdout line by line
	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		// Try parsing stream-json line
		var rawMap map[string]any
		if jsonErr := json.Unmarshal([]byte(trimmed), &rawMap); jsonErr == nil {
			evt, _ := rawMap["event"].(string)

			// 1. Antigravity init event: capture actual conversation ID
			if evt == "init" {
				if actualID, ok := rawMap["conversation_id"].(string); ok && actualID != "" {
					convID = actualID
					_ = sendEvent("start", StreamEvent{
						Type:           "start",
						ConversationID: convID,
					})
				}
				continue
			}

			// 2. Antigravity step_update event: text_delta, thinking, tools
			if evt == "step_update" {
				if step, ok := rawMap["step_update"].(map[string]any); ok {
					if delta, ok := step["text_delta"].(string); ok && delta != "" {
						accumulatedText.WriteString(delta)
						_ = sendEvent("chunk", StreamEvent{
							Type:           "chunk",
							ConversationID: convID,
							Delta:          delta,
						})
					}
					if thinking, ok := step["thinking_delta"].(string); ok && thinking != "" {
						accumulatedThinking.WriteString(thinking)
						_ = sendEvent("thinking", StreamEvent{
							Type:           "thinking",
							ConversationID: convID,
							Thinking:       accumulatedThinking.String(),
						})
					}
					if toolName, ok := step["tool_name"].(string); ok && toolName != "" {
						var args map[string]any
						var output string
						if toolInfo, ok := step["tool_info"].(map[string]any); ok {
							if params, ok := toolInfo["parameters"].(map[string]any); ok {
								args = params
							}
							if out, ok := toolInfo["output"].(string); ok {
								output = out
							}
						}
						if args == nil {
							args, _ = step["tool_args"].(map[string]any)
						}

						cleanArgs := make(map[string]any, len(args))
						for k, v := range args {
							if strVal, ok := v.(string); ok {
								cleanArgs[k] = SanitizeString(strVal)
							} else {
								cleanArgs[k] = v
							}
						}

						targetFile := ExtractTargetFile(toolName, cleanArgs)
						summary := GenerateSummary(toolName, targetFile, cleanArgs)

						status := "running"
						if state, ok := step["state"].(string); ok && state == "DONE" {
							status = "success"
						}

						stepIdxVal := step["step_index"]
						tcID := fmt.Sprintf("tc-%v", stepIdxVal)
						if stepIdxVal == nil {
							tcID = fmt.Sprintf("tc-%d", time.Now().UnixMilli())
						}

						outputPreview := CapOutput(output, 2500)

						tcItem := store.ToolCallItem{
							ID:         tcID,
							Name:       toolName,
							Summary:    summary,
							Status:     status,
							TargetFile: targetFile,
							Args:       cleanArgs,
							Output:     outputPreview,
						}

						foundIdx := -1
						for idx, existing := range toolCalls {
							if existing.ID == tcID {
								foundIdx = idx
								break
							}
						}
						if foundIdx >= 0 {
							if len(cleanArgs) > 0 {
								toolCalls[foundIdx].Args = cleanArgs
							}
							if outputPreview != "" {
								toolCalls[foundIdx].Output = outputPreview
							}
							if targetFile != "" {
								toolCalls[foundIdx].TargetFile = targetFile
							}
							toolCalls[foundIdx].Status = status
							if summary != "" && summary != toolName {
								toolCalls[foundIdx].Summary = summary
							}
							tcItem = toolCalls[foundIdx]
						} else {
							toolCalls = append(toolCalls, tcItem)
						}

						_ = sendEvent("tool_call", StreamEvent{
							Type:           "tool_call",
							ConversationID: convID,
							ToolCall:       &tcItem,
						})
					}
				}
				continue
			}

			// 3. Antigravity result event: final full response
			if evt == "result" {
				if res, ok := rawMap["result"].(map[string]any); ok {
					if resp, ok := res["response"].(string); ok && resp != "" {
						if accumulatedText.Len() == 0 {
							accumulatedText.WriteString(resp)
							_ = sendEvent("chunk", StreamEvent{
								Type:           "chunk",
								ConversationID: convID,
								Delta:          resp,
							})
						}
					}
				}
				continue
			}

			// Generic fallback JSON keys:
			if thinking, ok := rawMap["thinking"].(string); ok && thinking != "" {
				accumulatedThinking.WriteString(thinking)
				_ = sendEvent("thinking", StreamEvent{
					Type:           "thinking",
					ConversationID: convID,
					Thinking:       accumulatedThinking.String(),
				})
			}

			if rawTCs, ok := rawMap["tool_calls"].([]any); ok && len(rawTCs) > 0 {
				for tcIdx, r := range rawTCs {
					if tcMap, ok := r.(map[string]any); ok {
						name, _ := tcMap["name"].(string)
						rawArgs, _ := tcMap["args"].(map[string]any)
						cleanArgs := make(map[string]any, len(rawArgs))
						for k, v := range rawArgs {
							if strVal, ok := v.(string); ok {
								cleanArgs[k] = SanitizeString(strVal)
							} else {
								cleanArgs[k] = v
							}
						}
						targetFile := ExtractTargetFile(name, cleanArgs)
						summary := GenerateSummary(name, targetFile, cleanArgs)
						tcItem := store.ToolCallItem{
							ID:         fmt.Sprintf("tc-%d-%d", time.Now().UnixMilli(), tcIdx),
							Name:       name,
							Summary:    summary,
							Status:     "running",
							TargetFile: targetFile,
							Args:       cleanArgs,
						}
						toolCalls = append(toolCalls, tcItem)
						_ = sendEvent("tool_call", StreamEvent{
							Type:           "tool_call",
							ConversationID: convID,
							ToolCall:       &tcItem,
						})
					}
				}
			}

			if content, ok := rawMap["content"].(string); ok && content != "" {
				accumulatedText.WriteString(content)
				_ = sendEvent("chunk", StreamEvent{
					Type:           "chunk",
					ConversationID: convID,
					Delta:          content,
				})
			} else if delta, ok := rawMap["delta"].(string); ok && delta != "" {
				accumulatedText.WriteString(delta)
				_ = sendEvent("chunk", StreamEvent{
					Type:           "chunk",
					ConversationID: convID,
					Delta:          delta,
				})
			}
			continue
		}

		// Fallback: non-JSON lines are streamed as text chunks
		accumulatedText.WriteString(line + "\n")
		_ = sendEvent("chunk", StreamEvent{
			Type:           "chunk",
			ConversationID: convID,
			Delta:          line + "\n",
		})
	}

	cmdErr := cmd.Wait()
	wg.Wait()

	if ctx.Err() != nil {
		// Context was canceled by user abort
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          "Generation stopped by user.",
		})
		return ctx.Err()
	}

	if cmdErr != nil && accumulatedText.Len() == 0 {
		errMsg := fmt.Sprintf("Antigravity process exited with error: %v", cmdErr)
		if stderrOutput.Len() > 0 {
			errMsg = fmt.Sprintf("%s\n%s", errMsg, strings.TrimSpace(stderrOutput.String()))
		}
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          errMsg,
		})
		return cmdErr
	}

	// Update any running tool calls to success
	for i := range toolCalls {
		toolCalls[i].Status = "success"
	}

	finalText := accumulatedText.String()
	if strings.TrimSpace(finalText) == "" {
		finalText = "Selesai tanpa respons teks tambahan."
	}

	finalMsg := store.ChatMessage{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixMilli()),
		Role:      "agent",
		Text:      finalText,
		Thinking:  accumulatedThinking.String(),
		ToolCalls: toolCalls,
		Timestamp: time.Now().UnixMilli(),
		Provider:  "antigravity",
		Model:     effectiveModel,
	}

	_ = sendEvent("done", StreamEvent{
		Type:           "done",
		ConversationID: convID,
		Message:        &finalMsg,
	})

	return nil
}
