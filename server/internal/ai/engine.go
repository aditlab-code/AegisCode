package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

// EventSender is the callback function used to emit real-time SSE events.
type EventSender func(eventType string, data any) error

// ToolExecutor is a callback function invoked to execute tools on behalf of an agentic model turn.
type ToolExecutor func(ctx context.Context, name string, args map[string]any) (string, error)

// StreamChatRequest holds parameters for an AI chat execution turn across providers.
type StreamChatRequest struct {
	WorkspaceDir   string       `json:"workspaceDir,omitempty"`
	ConversationID string       `json:"conversationId,omitempty"`
	Provider       string       `json:"provider,omitempty"`
	Model          string       `json:"model,omitempty"`
	Prompt         string       `json:"prompt"`
	APIKey         string       `json:"apiKey,omitempty"`
	BaseURL        string       `json:"baseUrl,omitempty"`
	Command        string       `json:"command,omitempty"`
	ToolExecutor   ToolExecutor `json:"-"`
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

// GetCodeGraphOpenAITools returns CodeGraph tool specifications in OpenAI function calling format.
func GetCodeGraphOpenAITools() []map[string]any {
	return []map[string]any{
		{
			"type": "function",
			"function": map[string]any{
				"name":        "get_file_outline",
				"description": "Retrieve compact outline of all functions, classes, interfaces, and methods in a file without bodies (< 150 tokens).",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"file_path": map[string]any{
							"type":        "string",
							"description": "Relative workspace file path",
						},
					},
					"required": []string{"file_path"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "get_symbol_definition",
				"description": "Retrieve symbol signature, line range, and docstrings (< 80 tokens).",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"name": map[string]any{
							"type":        "string",
							"description": "Symbol name",
						},
						"file_hint": map[string]any{
							"type":        "string",
							"description": "Optional file path substring",
						},
					},
					"required": []string{"name"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "find_callers",
				"description": "Find all inbound callers of a function or method across the workspace (< 150 tokens).",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"function_name": map[string]any{
							"type":        "string",
							"description": "Function or method name",
						},
						"limit": map[string]any{
							"type":        "integer",
							"description": "Max callers to return (default 15)",
						},
					},
					"required": []string{"function_name"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "find_callees",
				"description": "Find all outbound functions called by a function or method.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"function_name": map[string]any{
							"type":        "string",
							"description": "Function name",
						},
						"file_hint": map[string]any{
							"type":        "string",
							"description": "Optional file path substring",
						},
					},
					"required": []string{"function_name"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "query_subgraph",
				"description": "Execute a surgical 2-hop BFS dependency subgraph exploration around a symbol (< 400 tokens).",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"root_symbol": map[string]any{
							"type":        "string",
							"description": "Root symbol name",
						},
						"depth": map[string]any{
							"type":        "integer",
							"description": "Traversal depth (clamped to max 2 hops)",
						},
					},
					"required": []string{"root_symbol"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "read_symbol_body",
				"description": "Read the exact source implementation body lines of a symbol from disk.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"name": map[string]any{
							"type":        "string",
							"description": "Symbol name",
						},
						"file_path": map[string]any{
							"type":        "string",
							"description": "Relative file path",
						},
					},
					"required": []string{"name", "file_path"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "get_diff_impact",
				"description": "Graph-augmented Git diff impact analysis: maps modified line hunks to changed symbols and caller topology.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"staged": map[string]any{
							"type":        "boolean",
							"description": "Analyze staged changes if true, unstaged if false",
						},
					},
				},
			},
		},
	}
}

// GetCodeGraphClaudeTools returns CodeGraph tool specifications in Anthropic Claude format.
func GetCodeGraphClaudeTools() []map[string]any {
	openAITools := GetCodeGraphOpenAITools()
	claudeTools := make([]map[string]any, 0, len(openAITools))
	for _, t := range openAITools {
		fn := t["function"].(map[string]any)
		claudeTools = append(claudeTools, map[string]any{
			"name":         fn["name"],
			"description":  fn["description"],
			"input_schema": fn["parameters"],
		})
	}
	return claudeTools
}
