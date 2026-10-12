package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

// EventSender is the callback function used to emit real-time SSE events.
type EventSender func(eventType string, data any) error

// StreamChatRequest holds parameters for an AI chat execution turn across providers.
type StreamChatRequest struct {
	WorkspaceDir   string `json:"workspaceDir,omitempty"`
	ConversationID string `json:"conversationId,omitempty"`
	Provider       string `json:"provider,omitempty"`
	Model          string `json:"model,omitempty"`
	Prompt         string `json:"prompt"`
	APIKey         string `json:"apiKey,omitempty"`
	BaseURL        string `json:"baseUrl,omitempty"`
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

// ProviderEngine abstracts the streaming dialogue execution for an AI model provider.
type ProviderEngine interface {
	StreamChat(ctx context.Context, req StreamChatRequest, sendEvent EventSender) error
}

// GetEngine resolves the ProviderEngine implementation for a given provider name.
func GetEngine(provider string) (ProviderEngine, error) {
	p := strings.ToLower(strings.TrimSpace(provider))
	switch p {
	case "", "antigravity", "agy":
		return &AntigravityEngine{}, nil
	case "opencode", "openrouter", "openai":
		return &OpenAIEngine{Provider: p}, nil
	case "claude", "anthropic":
		return &ClaudeEngine{}, nil
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", provider)
	}
}

// StreamChat is the unified top-level dispatcher that routes chat turns to matching ProviderEngines.
func StreamChat(ctx context.Context, req StreamChatRequest, sendEvent EventSender) error {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return fmt.Errorf("prompt cannot be empty")
	}

	provider := strings.TrimSpace(req.Provider)
	if provider == "" {
		provider = "antigravity"
	}

	engine, err := GetEngine(provider)
	if err != nil {
		convID := strings.TrimSpace(req.ConversationID)
		if convID == "" {
			convID = NewUUID()
		}
		_ = sendEvent("error", StreamEvent{
			Type:           "error",
			ConversationID: convID,
			Error:          err.Error(),
		})
		return err
	}

	return engine.StreamChat(ctx, req, sendEvent)
}
