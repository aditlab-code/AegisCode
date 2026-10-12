package ai

import (
	"context"
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
