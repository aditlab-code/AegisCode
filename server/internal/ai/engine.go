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

// GetCodeGraphOpenAITools returns native @colbymchenry/codegraph tool specifications in OpenAI function calling format.
func GetCodeGraphOpenAITools() []map[string]any {
	return []map[string]any{
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_explore",
				"description": "Proportional token codebase exploration and call graph discovery across symbols, files, or questions.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"query": map[string]any{
							"type":        "string",
							"description": "Natural language question, file name, or symbol names to explore",
						},
						"depth": map[string]any{
							"type":        "integer",
							"description": "Exploration traversal depth (default 3)",
						},
					},
					"required": []string{"query"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_node",
				"description": "Retrieve full symbol definition, qualified name, hierarchy, and 3-hop blast radius.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"nodeId": map[string]any{
							"type":        "string",
							"description": "Symbol node identifier",
						},
					},
					"required": []string{"nodeId"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_search",
				"description": "Search symbols and identifiers across the workspace using BM25 / FTS5 ranking.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"query": map[string]any{
							"type":        "string",
							"description": "Symbol search query",
						},
						"limit": map[string]any{
							"type":        "integer",
							"description": "Max results to return (default 20)",
						},
					},
					"required": []string{"query"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_callers",
				"description": "Find all direct and indirect upstream callers reaching a target function or method.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"symbol": map[string]any{
							"type":        "string",
							"description": "Target symbol name",
						},
						"limit": map[string]any{
							"type":        "integer",
							"description": "Max callers to return (default 20)",
						},
					},
					"required": []string{"symbol"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_callees",
				"description": "Find all direct downstream functions and dependencies called by a target symbol.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"symbol": map[string]any{
							"type":        "string",
							"description": "Target symbol name",
						},
						"limit": map[string]any{
							"type":        "integer",
							"description": "Max callees to return (default 20)",
						},
					},
					"required": []string{"symbol"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_flow",
				"description": "Analyze directed call paths between symbols with dynamic dispatch detection.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"from": map[string]any{
							"type":        "string",
							"description": "Source symbol name",
						},
						"to": map[string]any{
							"type":        "string",
							"description": "Target destination symbol name",
						},
						"symbols": map[string]any{
							"type":        "array",
							"items":       map[string]any{"type": "string"},
							"description": "Ordered symbols along the flow path",
						},
					},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_impact",
				"description": "Analyze blast radius of symbol changes across files and dependent modules.",
				"parameters": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"symbol": map[string]any{
							"type":        "string",
							"description": "Modified symbol name",
						},
						"depth": map[string]any{
							"type":        "integer",
							"description": "Impact traversal depth (default 2)",
						},
					},
					"required": []string{"symbol"},
				},
			},
		},
		{
			"type": "function",
			"function": map[string]any{
				"name":        "codegraph_status",
				"description": "Retrieve CodeGraph SQLite WAL database index status, language breakdown, and freshness.",
				"parameters": map[string]any{
					"type":       "object",
					"properties": map[string]any{},
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

// FormatCodeGraphSystemInstruction returns runtime guidance for AI models on using CodeGraph tools.
func FormatCodeGraphSystemInstruction() string {
	return `## CodeGraph Exploration Protocol

In repositories indexed by CodeGraph (where a .codegraph/ directory exists at the repo root), prioritize CodeGraph tools before using grep/find/cat or reading entire source files:
- Use codegraph_explore with symbol names, file paths, or architectural questions to retrieve verbatim source and call graphs in one turn.
- Apply Progressive Disclosure: examine outlines/signatures first, assess caller/callee blast radius, and view full function bodies only when actively refactoring.
- Maintain surgical, minimal changes and preserve existing codebase conventions.`
}

// WrapPromptWithSystemContext wraps a user prompt with CodeGraph system instructions in-memory, avoiding repo pollution.
func WrapPromptWithSystemContext(userPrompt string) string {
	trimmed := strings.TrimSpace(userPrompt)
	if trimmed == "" {
		return ""
	}
	// Avoid double-wrapping if already present
	if strings.Contains(trimmed, "<system_context>") {
		return trimmed
	}
	return fmt.Sprintf("<system_context>\n%s\n</system_context>\n\n<user_request>\n%s\n</user_request>", FormatCodeGraphSystemInstruction(), trimmed)
}

// UnwrapUserPrompt extracts the original user prompt if it was wrapped in <user_request>...</user_request>.
func UnwrapUserPrompt(text string) string {
	const startTag = "<user_request>\n"
	const endTag = "\n</user_request>"
	startIdx := strings.Index(text, startTag)
	if startIdx != -1 {
		rest := text[startIdx+len(startTag):]
		endIdx := strings.LastIndex(rest, endTag)
		if endIdx != -1 {
			return strings.TrimSpace(rest[:endIdx])
		}
		if simpleEnd := strings.LastIndex(rest, "</user_request>"); simpleEnd != -1 {
			return strings.TrimSpace(rest[:simpleEnd])
		}
	}
	return text
}

