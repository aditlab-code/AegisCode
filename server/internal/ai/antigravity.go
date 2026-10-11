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

// SkillItem represents a slash command or skill.
type SkillItem struct {
	Command     string `json:"command"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

// StreamChatRequest holds parameters for an AI chat execution turn.
type StreamChatRequest struct {
	WorkspaceDir   string `json:"workspaceDir,omitempty"`
	ConversationID string `json:"conversationId,omitempty"`
	Model          string `json:"model,omitempty"`
	Prompt         string `json:"prompt"`
}

// StreamEvent represents a real-time event sent over SSE.
type StreamEvent struct {
	Type           string              `json:"type"` // "start" | "thinking" | "tool_call" | "chunk" | "done" | "error"
	ConversationID string              `json:"conversationId,omitempty"`
	Delta          string              `json:"delta,omitempty"`
	Thinking       string              `json:"thinking,omitempty"`
	ToolCall       *store.ToolCallItem `json:"toolCall,omitempty"`
	Message        *store.ChatMessage  `json:"message,omitempty"`
	Error          string              `json:"error,omitempty"`
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

// ListSkills returns all available Antigravity slash commands and skills.
func ListSkills(ctx context.Context, workspaceDir string) ([]SkillItem, error) {
	skills := []SkillItem{
		{Command: "/plan", Name: "Implementation Plan", Description: "Breakdown task implementasi bertahap"},
		{Command: "/spec", Name: "Specification", Description: "Buat spesifikasi kebutuhan & arsitektur fitur"},
		{Command: "/review", Name: "Code Review", Description: "Audit kualitas, clean code, & keamanan kode"},
		{Command: "/debug", Name: "Debugging", Description: "Analisis akar masalah & perbaikan bug"},
		{Command: "/simplify", Name: "Simplification", Description: "Refaktorisasi & penyederhanaan struktur kode"},
		{Command: "/goal", Name: "Autonomous Goal", Description: "Eksekusi task jangka panjang hingga tuntas"},
		{Command: "/schedule", Name: "Scheduler", Description: "Jalankan instruksi berbasis timer atau cron"},
		{Command: "/browser", Name: "Web Browser", Description: "Pencarian web & interaksi situs"},
		{Command: "/grill-me", Name: "Interactive Interview", Description: "Selaraskan rencana desain secara interaktif"},
		{Command: "/boost", Name: "Deep Boost", Description: "Perencanaan strategis & verifikasi ketat"},
	}

	home, _ := os.UserHomeDir()
	if home != "" {
		builtinDir := filepath.Join(home, ".gemini", "antigravity-cli", "builtin", "skills")
		if entries, err := os.ReadDir(builtinDir); err == nil {
			for _, entry := range entries {
				if entry.IsDir() {
					name := entry.Name()
					cmdName := "/" + strings.ReplaceAll(name, "_", "-")
					exists := false
					for _, s := range skills {
						if s.Command == cmdName {
							exists = true
							break
						}
					}
					if !exists {
						skills = append(skills, SkillItem{
							Command:     cmdName,
							Name:        strings.Title(strings.ReplaceAll(name, "-", " ")),
							Description: fmt.Sprintf("Antigravity skill: %s", name),
						})
					}
				}
			}
		}
	}

	return skills, nil
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
				Text:      entry.Content,
				Timestamp: parseTimestamp(entry.CreatedAt),
			})
		} else if entry.Type == "PLANNER_RESPONSE" {
			var toolCalls []store.ToolCallItem
			for idx, tc := range entry.ToolCalls {
				summary := tc.Name
				if s, ok := tc.Args["toolSummary"].(string); ok && s != "" {
					summary = s
				}
				toolCalls = append(toolCalls, store.ToolCallItem{
					ID:      fmt.Sprintf("tc-%d-%d", entry.StepIndex, idx),
					Name:    tc.Name,
					Summary: summary,
					Status:  "success",
					Args:    tc.Args,
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

// StreamChat executes an Antigravity turn and writes events via sendEvent.
func StreamChat(ctx context.Context, req StreamChatRequest, sendEvent func(eventType string, data any) error) error {
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

	args = append(args, "-p", prompt)

	cmd := exec.CommandContext(ctx, binary, args...)
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
						args, _ := step["tool_args"].(map[string]any)
						summary := toolName
						if s, ok := args["toolSummary"].(string); ok && s != "" {
							summary = s
						}
						tcItem := store.ToolCallItem{
							ID:      fmt.Sprintf("tc-%d", time.Now().UnixMilli()),
							Name:    toolName,
							Summary: summary,
							Status:  "running",
							Args:    args,
						}
						toolCalls = append(toolCalls, tcItem)
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
						args, _ := tcMap["args"].(map[string]any)
						summary := name
						if s, ok := args["toolSummary"].(string); ok && s != "" {
							summary = s
						}
						tcItem := store.ToolCallItem{
							ID:      fmt.Sprintf("tc-%d-%d", time.Now().UnixMilli(), tcIdx),
							Name:    name,
							Summary: summary,
							Status:  "running",
							Args:    args,
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
