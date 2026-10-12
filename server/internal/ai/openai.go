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

// OpenAIToolChunk represents a streaming tool call delta chunk in the OpenAI specification.
type OpenAIToolChunk struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

// InFlightToolState accumulates streaming arguments before they become valid JSON.
type InFlightToolState struct {
	Index       int
	ID          string
	Name        string
	ArgsBuilder strings.Builder
	ParsedArgs  map[string]any
	Status      string
	Output      string
}

// OpenAIAggregator groups partial streaming argument chunks into complete tool calls.
type OpenAIAggregator struct {
	tools map[int]*InFlightToolState
}

// NewOpenAIAggregator creates a new in-flight tool call aggregator.
func NewOpenAIAggregator() *OpenAIAggregator {
	return &OpenAIAggregator{tools: make(map[int]*InFlightToolState)}
}

// IngestChunk ingests incoming argument fragments and emits a running tool call on start.
func (a *OpenAIAggregator) IngestChunk(chunks []OpenAIToolChunk, emit func(store.ToolCallItem)) {
	for _, chunk := range chunks {
		tool, exists := a.tools[chunk.Index]
		if !exists {
			toolID := chunk.ID
			if toolID == "" {
				toolID = fmt.Sprintf("tc-oa-%d-%d", time.Now().UnixMilli(), chunk.Index)
			}
			tool = &InFlightToolState{
				Index:  chunk.Index,
				ID:     toolID,
				Name:   chunk.Function.Name,
				Status: "running",
			}
			a.tools[chunk.Index] = tool

			// Emit initial running signal
			emit(store.ToolCallItem{
				ID:      tool.ID,
				Name:    tool.Name,
				Summary: "Menyiapkan " + tool.Name,
				Status:  "running",
				Args:    map[string]any{},
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

// Finalize parses accumulated JSON strings and emits finalized tool call items.
func (a *OpenAIAggregator) Finalize(emit func(store.ToolCallItem)) []store.ToolCallItem {
	var finalized []store.ToolCallItem
	for _, tool := range a.tools {
		var parsedArgs map[string]any
		rawJSON := strings.TrimSpace(tool.ArgsBuilder.String())

		if rawJSON != "" {
			if err := json.Unmarshal([]byte(rawJSON), &parsedArgs); err != nil {
				parsedArgs = map[string]any{"raw": rawJSON}
			}
		} else {
			parsedArgs = make(map[string]any)
		}

		// Sanitize string values
		for k, v := range parsedArgs {
			if s, ok := v.(string); ok {
				parsedArgs[k] = SanitizeString(s)
			}
		}

		targetFile := ExtractTargetFile(tool.Name, parsedArgs)
		summary := GenerateSummary(tool.Name, targetFile, parsedArgs)

		item := store.ToolCallItem{
			ID:         tool.ID,
			Name:       tool.Name,
			Summary:    summary,
			Status:     "success",
			TargetFile: targetFile,
			Args:       parsedArgs,
		}

		finalized = append(finalized, item)
		emit(item)
	}
	return finalized
}

// OpenAIEngine implements ProviderEngine for OpenAI-compatible HTTP streaming gateways
// including OpenCode and OpenRouter.
type OpenAIEngine struct {
	Provider string // "opencode" | "openrouter" | "openai"
}

func (e *OpenAIEngine) StreamChat(ctx context.Context, req StreamChatRequest, sendEvent EventSender) error {
	convID := strings.TrimSpace(req.ConversationID)
	if convID == "" {
		convID = NewUUID()
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return fmt.Errorf("prompt cannot be empty")
	}

	provider := strings.ToLower(strings.TrimSpace(e.Provider))
	if provider == "" {
		provider = "openrouter"
	}

	// 1. Resolve endpoint BaseURL
	baseURL := strings.TrimSpace(req.BaseURL)
	if baseURL == "" {
		if provider == "openrouter" {
			baseURL = "https://openrouter.ai/api/v1"
		} else {
			baseURL = "http://localhost:11434/v1"
		}
	}
	endpoint := fmt.Sprintf("%s/chat/completions", strings.TrimRight(baseURL, "/"))

	// 2. Resolve default model
	model := strings.TrimSpace(req.Model)
	if model == "" {
		if provider == "openrouter" {
			model = "google/gemini-2.5-flash"
		} else {
			model = "gpt-4o-mini"
		}
	}

	// 3. Emit initial start event
	_ = sendEvent("start", StreamEvent{
		Type:           "start",
		ConversationID: convID,
	})

	// 4. Construct request payload
	reqBody := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"stream": true,
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
	if req.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+strings.TrimSpace(req.APIKey))
	}
	if provider == "openrouter" {
		httpReq.Header.Set("HTTP-Referer", "https://aegiscode.dev")
		httpReq.Header.Set("X-Title", "AegisCode")
	}

	client := &http.Client{Timeout: 0} // No overall timeout; streaming is controlled by ctx
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
		errMsg := fmt.Sprintf("%s connection failed: %v", strings.Title(provider), err)
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
		errMsg := fmt.Sprintf("%s returned HTTP %d: %s", strings.Title(provider), resp.StatusCode, strings.TrimSpace(string(respBody)))
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          errMsg,
		})
		return fmt.Errorf("%s", errMsg)
	}

	// 5. Stream response chunks via SSE
	scanner := bufio.NewScanner(resp.Body)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)
	var accumulatedText strings.Builder
	var accumulatedThinking strings.Builder
	aggregator := NewOpenAIAggregator()
	var emittedTools []store.ToolCallItem

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ":") {
			continue
		}

		if !strings.HasPrefix(line, "data:") {
			continue
		}

		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content          string            `json:"content"`
					ReasoningContent string            `json:"reasoning_content"`
					Thought          string            `json:"thought"`
					Reasoning        string            `json:"reasoning"`
					ToolCalls        []OpenAIToolChunk `json:"tool_calls"`
				} `json:"delta"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) == 0 {
			continue
		}

		delta := chunk.Choices[0].Delta

		// Handle text tokens
		if delta.Content != "" {
			accumulatedText.WriteString(delta.Content)
			_ = sendEvent("chunk", StreamEvent{
				Type:           "chunk",
				ConversationID: convID,
				Delta:          delta.Content,
			})
		}

		// Handle thinking / reasoning tokens
		reasoning := delta.ReasoningContent
		if reasoning == "" {
			reasoning = delta.Thought
		}
		if reasoning == "" {
			reasoning = delta.Reasoning
		}
		if reasoning != "" {
			accumulatedThinking.WriteString(reasoning)
			_ = sendEvent("thinking", StreamEvent{
				Type:           "thinking",
				ConversationID: convID,
				Thinking:       accumulatedThinking.String(),
			})
		}

		// Handle tool call chunks
		if len(delta.ToolCalls) > 0 {
			aggregator.IngestChunk(delta.ToolCalls, func(tc store.ToolCallItem) {
				_ = sendEvent("tool_call", StreamEvent{
					Type:           "tool_call",
					ConversationID: convID,
					ToolCall:       &tc,
				})
			})
		}
	}

	// 6. Finalize tool calls
	finalTools := aggregator.Finalize(func(tc store.ToolCallItem) {
		_ = sendEvent("tool_call", StreamEvent{
			Type:           "tool_call",
			ConversationID: convID,
			ToolCall:       &tc,
		})
	})
	emittedTools = append(emittedTools, finalTools...)

	if err := scanner.Err(); err != nil && !errors.Is(err, context.Canceled) {
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          fmt.Sprintf("%s stream error: %v", provider, err),
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
	if strings.TrimSpace(finalText) == "" && len(emittedTools) == 0 {
		finalText = "Selesai tanpa respons teks tambahan."
	}

	finalMsg := store.ChatMessage{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixMilli()),
		Role:      "agent",
		Text:      finalText,
		Thinking:  accumulatedThinking.String(),
		ToolCalls: emittedTools,
		Timestamp: time.Now().UnixMilli(),
		Provider:  provider,
		Model:     model,
	}

	_ = sendEvent("done", StreamEvent{
		Type:           "done",
		ConversationID: convID,
		Message:        &finalMsg,
	})

	return nil
}
