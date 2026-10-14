package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

// ClaudeBlockHandler tracks block-based tool state and streaming deltas according to the Anthropic specification.
type ClaudeBlockHandler struct {
	currentTool *InFlightToolState
}

// HandleEvent processes Anthropic block events and emits normalized tool call events.
func (c *ClaudeBlockHandler) HandleEvent(eventType string, data []byte, emit func(store.ToolCallItem)) error {
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
			emit(store.ToolCallItem{
				ID:      p.ContentBlock.ID,
				Name:    p.ContentBlock.Name,
				Summary: "Mempersiapkan " + p.ContentBlock.Name,
				Status:  "running",
				Args:    map[string]any{},
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
			if args == nil {
				args = make(map[string]any)
			}

			// Clean values
			for k, v := range args {
				if s, ok := v.(string); ok {
					args[k] = SanitizeString(s)
				}
			}

			targetFile := ExtractTargetFile(c.currentTool.Name, args)
			summary := GenerateSummary(c.currentTool.Name, targetFile, args)

			emit(store.ToolCallItem{
				ID:         c.currentTool.ID,
				Name:       c.currentTool.Name,
				Summary:    summary,
				Status:     "success",
				TargetFile: targetFile,
				Args:       args,
			})
			c.currentTool = nil
		}
	}
	return nil
}

// ClaudeEngine implements ProviderEngine for Anthropic Claude via direct HTTP streaming.
type ClaudeEngine struct{}

func (e *ClaudeEngine) StreamChat(ctx context.Context, req StreamChatRequest, sendEvent EventSender) error {
	convID := strings.TrimSpace(req.ConversationID)
	if convID == "" {
		convID = NewUUID()
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return fmt.Errorf("prompt cannot be empty")
	}

	// 1. Resolve model
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "claude-3-5-sonnet-20241022"
	}

	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		if cliBin := resolveClaudeBinary(req.Command); cliBin != "" {
			return streamClaudeCLI(ctx, cliBin, convID, model, prompt, req.WorkspaceDir, sendEvent)
		}
		errEvt := StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          "Claude API key is required (or install 'claude' CLI). Please set it in Settings -> AI Providers.",
		}
		_ = sendEvent("error", errEvt)
		return fmt.Errorf("claude api key is missing")
	}

	// 2. Resolve endpoint
	baseURL := strings.TrimSpace(req.BaseURL)
	if baseURL == "" {
		baseURL = "https://api.anthropic.com/v1"
	}
	endpoint := fmt.Sprintf("%s/messages", strings.TrimRight(baseURL, "/"))

	// 3. Emit initial start event
	_ = sendEvent("start", StreamEvent{
		Type:           "start",
		ConversationID: convID,
	})

	// 4. Construct conversation messages history and multi-turn execution loop
	messages := []map[string]any{
		{"role": "user", "content": prompt},
	}

	const maxTurns = 5
	var totalAccumulatedText strings.Builder
	var totalAccumulatedThinking strings.Builder
	var allToolCalls []store.ToolCallItem

	client := &http.Client{Timeout: 0}

	for turn := 0; turn < maxTurns; turn++ {
		reqBody := map[string]any{
			"model":      model,
			"messages":   messages,
			"system":     FormatCodeGraphSystemInstruction(),
			"max_tokens": 4096,
			"stream":     true,
			"tools":      GetCodeGraphClaudeTools(),
		}

		payloadBytes, err := json.Marshal(reqBody)
		if err != nil {
			errEvt := StreamEvent{
				Type:           "error",
				ConversationID: convID,
				Error:          fmt.Sprintf("failed to encode request: %v", err),
			}
			_ = sendEvent("error", errEvt)
			return err
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payloadBytes))
		if err != nil {
			errEvt := StreamEvent{
				Type:           "error",
				ConversationID: convID,
				Error:          fmt.Sprintf("failed to create HTTP request: %v", err),
			}
			_ = sendEvent("error", errEvt)
			return err
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("x-api-key", apiKey)
		httpReq.Header.Set("anthropic-version", "2023-06-01")

		resp, err := client.Do(httpReq)
		if err != nil {
			if ctx.Err() != nil {
				_ = sendEvent("error", StreamEvent{
					Type:           "error",
					ConversationID: convID,
					Error:          "Generation stopped by user.",
				})
				return ctx.Err()
			}
			errMsg := fmt.Sprintf("Claude connection failed: %v", err)
			_ = sendEvent("error", StreamEvent{
				Type:           "error",
				ConversationID: convID,
				Error:          errMsg,
			})
			return err
		}

		if resp.StatusCode != http.StatusOK {
			respBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			errMsg := fmt.Sprintf("Claude returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
			_ = sendEvent("error", StreamEvent{
				Type:           "error",
				ConversationID: convID,
				Error:          errMsg,
			})
			return fmt.Errorf("%s", errMsg)
		}

		// Parse Anthropic SSE Stream for this turn
		scanner := bufio.NewScanner(resp.Body)
		buf := make([]byte, 1024*1024)
		scanner.Buffer(buf, 10*1024*1024)
		var currentEventType string
		var turnText strings.Builder
		var turnThinking strings.Builder
		var turnToolCalls []store.ToolCallItem
		blockHandler := &ClaudeBlockHandler{}

		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, ":") {
				continue
			}

			if strings.HasPrefix(line, "event:") {
				currentEventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
				continue
			}

			if strings.HasPrefix(line, "data:") {
				rawJSON := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
				if rawJSON == "[DONE]" {
					break
				}

				if currentEventType == "content_block_delta" {
					var deltaPayload struct {
						Delta struct {
							Type     string `json:"type"`
							Text     string `json:"text"`
							Thinking string `json:"thinking"`
						} `json:"delta"`
					}
					if err := json.Unmarshal([]byte(rawJSON), &deltaPayload); err == nil {
						if deltaPayload.Delta.Type == "text_delta" && deltaPayload.Delta.Text != "" {
							turnText.WriteString(deltaPayload.Delta.Text)
							totalAccumulatedText.WriteString(deltaPayload.Delta.Text)
							_ = sendEvent("chunk", StreamEvent{
								Type:           "chunk",
								ConversationID: convID,
								Delta:          deltaPayload.Delta.Text,
							})
						} else if deltaPayload.Delta.Type == "thinking_delta" && deltaPayload.Delta.Thinking != "" {
							turnThinking.WriteString(deltaPayload.Delta.Thinking)
							totalAccumulatedThinking.WriteString(deltaPayload.Delta.Thinking)
							_ = sendEvent("thinking", StreamEvent{
								Type:           "thinking",
								ConversationID: convID,
								Thinking:       totalAccumulatedThinking.String(),
							})
						}
					}
				}

				_ = blockHandler.HandleEvent(currentEventType, []byte(rawJSON), func(tc store.ToolCallItem) {
					foundIdx := -1
					for i, existing := range turnToolCalls {
						if existing.ID == tc.ID {
							foundIdx = i
							break
						}
					}
					if foundIdx >= 0 {
						turnToolCalls[foundIdx] = tc
					} else {
						turnToolCalls = append(turnToolCalls, tc)
					}

					_ = sendEvent("tool_call", StreamEvent{
						Type:           "tool_call",
						ConversationID: convID,
						ToolCall:       &tc,
					})
				})

				if currentEventType == "message_stop" {
					break
				}
			}
		}
		resp.Body.Close()

		if err := scanner.Err(); err != nil && !errors.Is(err, context.Canceled) {
			_ = sendEvent("error", StreamEvent{
				Type:           "error",
				ConversationID: convID,
				Error:          fmt.Sprintf("Claude stream error: %v", err),
			})
			return err
		}

		if ctx.Err() != nil {
			_ = sendEvent("error", StreamEvent{
				Type:           "error",
				ConversationID: convID,
				Error:          "Generation stopped by user.",
			})
			return ctx.Err()
		}

		// If no tool calls occurred, we reached final answer
		if len(turnToolCalls) == 0 {
			break
		}

		// Execute tool calls and prepare assistant & user message blocks for next turn
		var assistantContent []map[string]any
		if turnText.Len() > 0 {
			assistantContent = append(assistantContent, map[string]any{
				"type": "text",
				"text": turnText.String(),
			})
		}

		var toolResults []map[string]any
		for i := range turnToolCalls {
			tc := &turnToolCalls[i]
			tc.Status = "running"
			_ = sendEvent("tool_call", StreamEvent{
				Type:           "tool_call",
				ConversationID: convID,
				ToolCall:       tc,
			})

			var output string
			var execErr error
			if req.ToolExecutor != nil {
				output, execErr = req.ToolExecutor(ctx, tc.Name, tc.Args)
			} else {
				execErr = fmt.Errorf("no tool executor configured on server")
			}

			if execErr != nil {
				tc.Status = "failed"
				tc.Output = fmt.Sprintf("Error executing tool %s: %v", tc.Name, execErr)
			} else {
				tc.Status = "success"
				tc.Output = output
			}

			_ = sendEvent("tool_call", StreamEvent{
				Type:           "tool_call",
				ConversationID: convID,
				ToolCall:       tc,
			})

			assistantContent = append(assistantContent, map[string]any{
				"type":  "tool_use",
				"id":    tc.ID,
				"name":  tc.Name,
				"input": tc.Args,
			})

			toolResults = append(toolResults, map[string]any{
				"type":        "tool_result",
				"tool_use_id": tc.ID,
				"content":     tc.Output,
				"is_error":    tc.Status == "failed",
			})

			allToolCalls = append(allToolCalls, *tc)
		}

		messages = append(messages, map[string]any{
			"role":    "assistant",
			"content": assistantContent,
		})
		messages = append(messages, map[string]any{
			"role":    "user",
			"content": toolResults,
		})
	}

	finalText := totalAccumulatedText.String()
	if strings.TrimSpace(finalText) == "" && len(allToolCalls) == 0 {
		finalText = "Selesai tanpa respons teks tambahan."
	}

	finalMsg := store.ChatMessage{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixMilli()),
		Role:      "agent",
		Text:      finalText,
		Thinking:  totalAccumulatedThinking.String(),
		ToolCalls: allToolCalls,
		Timestamp: time.Now().UnixMilli(),
		Provider:  "claude",
		Model:     model,
	}

	_ = sendEvent("done", StreamEvent{
		Type:           "done",
		ConversationID: convID,
		Message:        &finalMsg,
	})

	return nil
}

func resolveClaudeBinary(customCmd string) string {
	cmdStr := strings.TrimSpace(customCmd)
	if cmdStr == "" {
		cmdStr = "claude"
	}
	parts := strings.Fields(cmdStr)
	binary := parts[0]
	if p, err := exec.LookPath(binary); err == nil {
		return p
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		for _, cand := range []string{
			filepath.Join(home, ".local", "bin", binary),
			filepath.Join(home, ".local", "bin", "claude"),
		} {
			if fi, statErr := os.Stat(cand); statErr == nil && !fi.IsDir() {
				return cand
			}
		}
	}
	return ""
}

func streamClaudeCLI(ctx context.Context, binary, convID, model, prompt, workspaceDir string, sendEvent EventSender) error {
	_ = sendEvent("start", StreamEvent{
		Type:           "start",
		ConversationID: convID,
	})
	effectivePrompt := WrapPromptWithSystemContext(prompt)
	args := []string{"-p", effectivePrompt, "--output-format", "stream-json", "--verbose"}
	if model != "" {
		args = append(args, "--model", model)
	}
	cmd := exec.CommandContext(ctx, binary, args...)
	if workspaceDir != "" {
		if fi, err := os.Stat(workspaceDir); err == nil && fi.IsDir() {
			cmd.Dir = workspaceDir
			cmd.Env = append(os.Environ(), "WORKSPACE_ROOT="+workspaceDir)
		}
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          fmt.Sprintf("Failed to start Claude CLI: %v", err),
		})
		return err
	}
	var accumulatedText strings.Builder
	scanner := bufio.NewScanner(stdout)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var raw map[string]any
		if json.Unmarshal([]byte(line), &raw) == nil {
			if res, ok := raw["result"].(string); ok && res != "" && accumulatedText.Len() == 0 {
				accumulatedText.WriteString(res)
				_ = sendEvent("chunk", StreamEvent{Type: "chunk", ConversationID: convID, Delta: res})
			}
		}
	}
	_ = cmd.Wait()
	_ = sendEvent("done", StreamEvent{
		Type:           "done",
		ConversationID: convID,
		Message: &store.ChatMessage{
			ID:        fmt.Sprintf("msg-%d", time.Now().UnixMilli()),
			Role:      "agent",
			Text:      accumulatedText.String(),
			Timestamp: time.Now().UnixMilli(),
			Provider:  "claude",
			Model:     model,
		},
	})
	return nil
}
