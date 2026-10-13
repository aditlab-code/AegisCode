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

	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		errEvt := StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          "Claude API key is required. Please set it in Settings -> AI Providers.",
		}
		_ = sendEvent("error", errEvt)
		return fmt.Errorf("claude api key is missing")
	}

	// 1. Resolve model
	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = "claude-3-5-sonnet-20241022"
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

	// 4. Construct Anthropic payload
	reqBody := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
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

	client := &http.Client{Timeout: 0}
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
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("Claude returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          errMsg,
		})
		return fmt.Errorf("%s", errMsg)
	}

	// 5. Parse Anthropic SSE Stream
	scanner := bufio.NewScanner(resp.Body)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)
	var currentEventType string
	var accumulatedText strings.Builder
	var accumulatedThinking strings.Builder
	var toolCalls []store.ToolCallItem
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

			// Handle text deltas and thinking deltas
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
						accumulatedText.WriteString(deltaPayload.Delta.Text)
						_ = sendEvent("chunk", StreamEvent{
							Type:           "chunk",
							ConversationID: convID,
							Delta:          deltaPayload.Delta.Text,
						})
					} else if deltaPayload.Delta.Type == "thinking_delta" && deltaPayload.Delta.Thinking != "" {
						accumulatedThinking.WriteString(deltaPayload.Delta.Thinking)
						_ = sendEvent("thinking", StreamEvent{
							Type:           "thinking",
							ConversationID: convID,
							Thinking:       accumulatedThinking.String(),
						})
					}
				}
			}

			// Handle tool block events
			_ = blockHandler.HandleEvent(currentEventType, []byte(rawJSON), func(tc store.ToolCallItem) {
				foundIdx := -1
				for i, existing := range toolCalls {
					if existing.ID == tc.ID {
						foundIdx = i
						break
					}
				}
				if foundIdx >= 0 {
					toolCalls[foundIdx] = tc
				} else {
					toolCalls = append(toolCalls, tc)
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

	finalText := accumulatedText.String()
	if strings.TrimSpace(finalText) == "" && len(toolCalls) == 0 {
		finalText = "Selesai tanpa respons teks tambahan."
	}

	finalMsg := store.ChatMessage{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixMilli()),
		Role:      "agent",
		Text:      finalText,
		Thinking:  accumulatedThinking.String(),
		ToolCalls: toolCalls,
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
