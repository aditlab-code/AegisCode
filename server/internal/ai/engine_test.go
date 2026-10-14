package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

func TestGetEngine(t *testing.T) {
	tests := []struct {
		provider string
		expected string
		wantErr  bool
	}{
		{"", "*ai.AntigravityEngine", false},
		{"antigravity", "*ai.AntigravityEngine", false},
		{"agy", "*ai.AntigravityEngine", false},
		{"opencode", "*ai.OpenAIEngine", false},
		{"openrouter", "*ai.OpenAIEngine", false},
		{"openai", "*ai.OpenAIEngine", false},
		{"claude", "*ai.ClaudeEngine", false},
		{"anthropic", "*ai.ClaudeEngine", false},
		{"unknown_provider", "", true},
	}

	for _, tt := range tests {
		engine, err := GetEngine(tt.provider)
		if tt.wantErr {
			if err == nil {
				t.Errorf("GetEngine(%q) expected error, got nil", tt.provider)
			}
		} else {
			if err != nil {
				t.Errorf("GetEngine(%q) unexpected error: %v", tt.provider, err)
			}
			typeName := fmt.Sprintf("%T", engine)
			if typeName != tt.expected {
				t.Errorf("GetEngine(%q) = %s, want %s", tt.provider, typeName, tt.expected)
			}
		}
	}
}

func TestOpenAIAggregator(t *testing.T) {
	aggregator := NewOpenAIAggregator()
	var emittedRunning []store.ToolCallItem

	chunk1 := []OpenAIToolChunk{
		{
			Index: 0,
			ID:    "call_123",
			Type:  "function",
			Function: struct {
				Name      string `json:"name"`
				Arguments string `json:"arguments"`
			}{
				Name:      "edit_file",
				Arguments: `{"path": "src/App.tsx",`,
			},
		},
	}

	aggregator.IngestChunk(chunk1, func(tc store.ToolCallItem) {
		emittedRunning = append(emittedRunning, tc)
	})

	if len(emittedRunning) != 1 {
		t.Fatalf("expected 1 running tool call, got %d", len(emittedRunning))
	}
	if emittedRunning[0].Status != "running" {
		t.Errorf("expected status 'running', got %s", emittedRunning[0].Status)
	}

	chunk2 := []OpenAIToolChunk{
		{
			Index: 0,
			Function: struct {
				Name      string `json:"name"`
				Arguments string `json:"arguments"`
			}{
				Arguments: ` "content": "console.log('test')"}`,
			},
		},
	}

	aggregator.IngestChunk(chunk2, func(tc store.ToolCallItem) {
		t.Errorf("did not expect running emit for continuation chunk")
	})

	var finalizedEmitted []store.ToolCallItem
	finalized := aggregator.Finalize(func(tc store.ToolCallItem) {
		finalizedEmitted = append(finalizedEmitted, tc)
	})

	if len(finalized) != 1 {
		t.Fatalf("expected 1 finalized tool call, got %d", len(finalized))
	}
	if finalized[0].TargetFile != "src/App.tsx" {
		t.Errorf("expected TargetFile 'src/App.tsx', got %q", finalized[0].TargetFile)
	}
	if finalized[0].Status != "success" {
		t.Errorf("expected status 'success', got %s", finalized[0].Status)
	}
	if !strings.Contains(finalized[0].Summary, "App.tsx") {
		t.Errorf("expected summary to contain 'App.tsx', got %q", finalized[0].Summary)
	}
}

func TestClaudeBlockHandler(t *testing.T) {
	handler := &ClaudeBlockHandler{}
	var events []store.ToolCallItem

	emit := func(tc store.ToolCallItem) {
		events = append(events, tc)
	}

	// 1. content_block_start
	startData := []byte(`{"index": 0, "content_block": {"type": "tool_use", "id": "toolu_01", "name": "run_command"}}`)
	if err := handler.HandleEvent("content_block_start", startData, emit); err != nil {
		t.Fatalf("HandleEvent start error: %v", err)
	}
	if len(events) != 1 || events[0].Status != "running" {
		t.Fatalf("expected running event on start, got: %+v", events)
	}

	// 2. content_block_delta
	deltaData := []byte(`{"delta": {"type": "input_json_delta", "partial_json": "{\"command\": \"rtk git status\"}"}}`)
	if err := handler.HandleEvent("content_block_delta", deltaData, emit); err != nil {
		t.Fatalf("HandleEvent delta error: %v", err)
	}

	// 3. content_block_stop
	if err := handler.HandleEvent("content_block_stop", []byte(`{}`), emit); err != nil {
		t.Fatalf("HandleEvent stop error: %v", err)
	}

	if len(events) != 2 {
		t.Fatalf("expected 2 events total, got %d", len(events))
	}
	lastEvent := events[1]
	if lastEvent.Status != "success" {
		t.Errorf("expected status 'success', got %s", lastEvent.Status)
	}
	if lastEvent.Args["command"] != "rtk git status" {
		t.Errorf("expected command 'rtk git status', got %v", lastEvent.Args["command"])
	}
}

func TestOpenAIEngineStreaming(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}

		fmt.Fprintf(w, "data: {\"choices\": [{\"delta\": {\"reasoning_content\": \"Thinking step\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprintf(w, "data: {\"choices\": [{\"delta\": {\"content\": \"Hello world\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
	}))
	defer server.Close()

	engine := &OpenAIEngine{Provider: "opencode"}
	req := StreamChatRequest{
		Prompt:  "Hi",
		BaseURL: server.URL,
		Model:   "test-model",
	}

	var receivedEvents []string
	var receivedText string
	var receivedThinking string

	err := engine.StreamChat(context.Background(), req, func(eventType string, data any) error {
		receivedEvents = append(receivedEvents, eventType)
		if evt, ok := data.(StreamEvent); ok {
			if evt.Delta != "" {
				receivedText += evt.Delta
			}
			if evt.Thinking != "" {
				receivedThinking = evt.Thinking
			}
		}
		return nil
	})

	if err != nil {
		t.Fatalf("StreamChat unexpected error: %v", err)
	}

	if receivedText != "Hello world" {
		t.Errorf("expected receivedText 'Hello world', got %q", receivedText)
	}
	if receivedThinking != "Thinking step" {
		t.Errorf("expected receivedThinking 'Thinking step', got %q", receivedThinking)
	}

	hasStart := false
	hasDone := false
	for _, e := range receivedEvents {
		if e == "start" {
			hasStart = true
		}
		if e == "done" {
			hasDone = true
		}
	}
	if !hasStart || !hasDone {
		t.Errorf("expected start and done events, got: %v", receivedEvents)
	}
}

func TestClaudeEngineStreaming(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}

		fmt.Fprintf(w, "event: content_block_delta\n")
		fmt.Fprintf(w, "data: {\"delta\": {\"type\": \"text_delta\", \"text\": \"Claude reply\"}}\n\n")
		flusher.Flush()

		fmt.Fprintf(w, "event: message_stop\n")
		fmt.Fprintf(w, "data: {}\n\n")
		flusher.Flush()
	}))
	defer server.Close()

	engine := &ClaudeEngine{}
	req := StreamChatRequest{
		Prompt:  "Test prompt",
		BaseURL: server.URL,
		APIKey:  "sk-ant-test-key",
	}

	var receivedText string
	var receivedEvents []string

	err := engine.StreamChat(context.Background(), req, func(eventType string, data any) error {
		receivedEvents = append(receivedEvents, eventType)
		if evt, ok := data.(StreamEvent); ok {
			if evt.Delta != "" {
				receivedText += evt.Delta
			}
		}
		return nil
	})

	if err != nil {
		t.Fatalf("StreamChat unexpected error: %v", err)
	}

	if receivedText != "Claude reply" {
		t.Errorf("expected receivedText 'Claude reply', got %q", receivedText)
	}
}

func TestClaudeEngineMultiTurnToolExecution(t *testing.T) {
	turnCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		turnCount++
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}

		if turnCount == 1 {
			// Turn 1: model returns tool_use block
			fmt.Fprintf(w, "event: content_block_start\n")
			fmt.Fprintf(w, "data: {\"index\": 0, \"content_block\": {\"type\": \"tool_use\", \"id\": \"toolu_test\", \"name\": \"codegraph_explore\"}}\n\n")
			flusher.Flush()

			fmt.Fprintf(w, "event: content_block_delta\n")
			fmt.Fprintf(w, "data: {\"delta\": {\"type\": \"input_json_delta\", \"partial_json\": \"{\\\"query\\\": \\\"main.go\\\"}\"}}\n\n")
			flusher.Flush()

			fmt.Fprintf(w, "event: content_block_stop\n")
			fmt.Fprintf(w, "data: {}\n\n")
			flusher.Flush()

			fmt.Fprintf(w, "event: message_stop\n")
			fmt.Fprintf(w, "data: {}\n\n")
			flusher.Flush()
		} else {
			// Turn 2: model sees tool_result and outputs final answer
			fmt.Fprintf(w, "event: content_block_delta\n")
			fmt.Fprintf(w, "data: {\"delta\": {\"type\": \"text_delta\", \"text\": \"Outline for main.go analyzed successfully.\"}}\n\n")
			flusher.Flush()

			fmt.Fprintf(w, "event: message_stop\n")
			fmt.Fprintf(w, "data: {}\n\n")
			flusher.Flush()
		}
	}))
	defer server.Close()

	toolExecuted := false
	engine := &ClaudeEngine{}
	req := StreamChatRequest{
		Prompt:  "Outline main.go",
		BaseURL: server.URL,
		APIKey:  "sk-ant-test-key",
		ToolExecutor: func(ctx context.Context, name string, args map[string]any) (string, error) {
			if name == "codegraph_explore" && args["query"] == "main.go" {
				toolExecuted = true
				return `{"symbols": ["main"]}`, nil
			}
			return "", fmt.Errorf("unexpected tool %s", name)
		},
	}

	var finalMessageText string
	var finalToolCallCount int
	err := engine.StreamChat(context.Background(), req, func(eventType string, data any) error {
		if eventType == "done" {
			if evt, ok := data.(StreamEvent); ok && evt.Message != nil {
				finalMessageText = evt.Message.Text
				finalToolCallCount = len(evt.Message.ToolCalls)
			}
		}
		return nil
	})

	if err != nil {
		t.Fatalf("StreamChat unexpected error: %v", err)
	}

	if !toolExecuted {
		t.Errorf("expected ToolExecutor to be called by agentic loop")
	}
	if turnCount != 2 {
		t.Errorf("expected 2 turns, got %d", turnCount)
	}
	if !strings.Contains(finalMessageText, "analyzed successfully") {
		t.Errorf("unexpected final text: %q", finalMessageText)
	}
	if finalToolCallCount != 1 {
		t.Errorf("expected 1 final tool call in message, got %d", finalToolCallCount)
	}
}

func TestFormatCodeGraphSystemInstruction(t *testing.T) {
	instruction := FormatCodeGraphSystemInstruction()
	if instruction == "" {
		t.Fatalf("expected non-empty instruction")
	}
	if !strings.Contains(instruction, "CodeGraph") {
		t.Errorf("expected instruction to mention CodeGraph")
	}
	if !strings.Contains(instruction, "codegraph_explore") {
		t.Errorf("expected instruction to mention codegraph_explore")
	}
	if !strings.Contains(instruction, "Progressive Disclosure") {
		t.Errorf("expected instruction to mention Progressive Disclosure")
	}
}

func TestWrapPromptWithSystemContext(t *testing.T) {
	// Empty prompt
	if got := WrapPromptWithSystemContext(""); got != "" {
		t.Errorf("expected empty string for empty prompt, got %q", got)
	}

	// Normal prompt
	userPrompt := "Explain how the router works"
	wrapped := WrapPromptWithSystemContext(userPrompt)
	if !strings.HasPrefix(wrapped, "<system_context>\n") {
		t.Errorf("expected wrapped prompt to start with <system_context>, got: %q", wrapped)
	}
	if !strings.Contains(wrapped, "<user_request>\n"+userPrompt+"\n</user_request>") {
		t.Errorf("expected wrapped prompt to contain <user_request> block with prompt")
	}

	// Avoid double-wrapping
	doubleWrapped := WrapPromptWithSystemContext(wrapped)
	if doubleWrapped != wrapped {
		t.Errorf("expected double wrapping to be a no-op")
	}
}

func TestUnwrapUserPrompt(t *testing.T) {
	rawPrompt := "Refactor auth middleware"
	wrapped := WrapPromptWithSystemContext(rawPrompt)
	unwrapped := UnwrapUserPrompt(wrapped)
	if unwrapped != rawPrompt {
		t.Errorf("expected %q, got %q", rawPrompt, unwrapped)
	}

	// Already clean prompt
	if UnwrapUserPrompt(rawPrompt) != rawPrompt {
		t.Errorf("expected clean prompt to be unchanged")
	}
}

func TestOpenAISystemInstructionInjection(t *testing.T) {
	var capturedMessages []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			if msgs, ok := body["messages"].([]any); ok {
				for _, m := range msgs {
					if mm, ok := m.(map[string]any); ok {
						capturedMessages = append(capturedMessages, mm)
					}
				}
			}
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		fmt.Fprintf(w, "data: {\"choices\": [{\"delta\": {\"content\": \"Done\"}}]}\n\n")
		flusher.Flush()
		fmt.Fprintf(w, "data: [DONE]\n\n")
		flusher.Flush()
	}))
	defer server.Close()

	engine := &OpenAIEngine{Provider: "openai"}
	req := StreamChatRequest{
		Prompt:  "Analyze code",
		BaseURL: server.URL,
		Model:   "gpt-4o-mini",
	}

	err := engine.StreamChat(context.Background(), req, func(string, any) error { return nil })
	if err != nil {
		t.Fatalf("StreamChat unexpected error: %v", err)
	}

	if len(capturedMessages) < 2 {
		t.Fatalf("expected at least 2 messages, got %d", len(capturedMessages))
	}
	if capturedMessages[0]["role"] != "system" {
		t.Errorf("expected first message role to be system, got %v", capturedMessages[0]["role"])
	}
	content, _ := capturedMessages[0]["content"].(string)
	if !strings.Contains(content, "CodeGraph") {
		t.Errorf("expected system content to mention CodeGraph, got %q", content)
	}
	if capturedMessages[1]["role"] != "user" || capturedMessages[1]["content"] != "Analyze code" {
		t.Errorf("expected second message to be user prompt, got: %+v", capturedMessages[1])
	}
}

func TestClaudeSystemInstructionInjection(t *testing.T) {
	var capturedSystem string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil {
			if sys, ok := body["system"].(string); ok {
				capturedSystem = sys
			}
		}
		w.Header().Set("Content-Type", "text/event-stream")
		flusher, _ := w.(http.Flusher)
		fmt.Fprintf(w, "event: content_block_delta\n")
		fmt.Fprintf(w, "data: {\"delta\": {\"type\": \"text_delta\", \"text\": \"Done\"}}\n\n")
		flusher.Flush()
		fmt.Fprintf(w, "event: message_stop\n")
		fmt.Fprintf(w, "data: {}\n\n")
		flusher.Flush()
	}))
	defer server.Close()

	engine := &ClaudeEngine{}
	req := StreamChatRequest{
		Prompt:  "Analyze code",
		BaseURL: server.URL,
		APIKey:  "sk-ant-test",
	}

	err := engine.StreamChat(context.Background(), req, func(string, any) error { return nil })
	if err != nil {
		t.Fatalf("StreamChat unexpected error: %v", err)
	}

	if capturedSystem == "" {
		t.Fatalf("expected non-empty system prompt in Claude request")
	}
	if !strings.Contains(capturedSystem, "CodeGraph") {
		t.Errorf("expected Claude system parameter to mention CodeGraph, got %q", capturedSystem)
	}
}

