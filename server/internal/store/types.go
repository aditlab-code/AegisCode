package store

// Config represents persistent user preferences, theme overrides, model configurations,
// and bypassed auth/API tokens stored in ~/.aegis/config.json.
type Config struct {
	Theme            string              `json:"theme,omitempty"`
	DefaultProvider  string              `json:"defaultProvider,omitempty"`
	DefaultModel     string              `json:"defaultModel,omitempty"`
	ProviderBaseURLs map[string]string   `json:"providerBaseUrls,omitempty"`
	ProviderKeys     map[string]string   `json:"providerKeys,omitempty"`
	BypassCommands   map[string]string   `json:"bypassCommands,omitempty"`
	BypassTokens     map[string]string   `json:"bypassTokens,omitempty"`
	CustomModels     map[string][]string `json:"customModels,omitempty"`
	LspServers       map[string]string   `json:"lspServers,omitempty"`
	Settings         map[string]any      `json:"settings,omitempty"`
	UpdatedAt        int64               `json:"updatedAt"`
}

// AppState represents lightweight application lifecycle state in ~/.aegis/state.json.
type AppState struct {
	RecentProjects  []string `json:"recentProjects"`
	LastWorkspace   string   `json:"lastWorkspace,omitempty"`
	ActiveSessionID string   `json:"activeSessionId,omitempty"`
	UpdatedAt       int64    `json:"updatedAt"`
}

// ContextItem represents structured code or selection context attached to a chat prompt.
type ContextItem struct {
	ID              string `json:"id"`
	Type            string `json:"type"` // "file" | "selection"
	Path            string `json:"path"`
	LineRange       string `json:"lineRange,omitempty"`
	Content         string `json:"content"`
	CharCount       int    `json:"charCount"`
	EstimatedTokens int    `json:"estimatedTokens"`
	IsTruncated     bool   `json:"isTruncated,omitempty"`
	Mode            string `json:"mode,omitempty"`
}

// ToolCallItem represents an action taken by the AI agent during turn execution.
type ToolCallItem struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Summary    string         `json:"summary,omitempty"`
	Status     string         `json:"status"` // "running" | "success" | "error"
	TargetFile string         `json:"targetFile,omitempty"`
	Args       map[string]any `json:"args,omitempty"`
	Output     string         `json:"output,omitempty"`
}

// ChatMessage represents a single message in an AI conversation.
type ChatMessage struct {
	ID        string         `json:"id"`
	Role      string         `json:"role"` // "user" | "agent" | "system"
	Text      string         `json:"text"`
	Timestamp int64          `json:"timestamp,omitempty"`
	Context   []ContextItem  `json:"context,omitempty"`
	Provider  string         `json:"provider,omitempty"`
	Model     string         `json:"model,omitempty"`
	Thinking  string         `json:"thinking,omitempty"`
	ToolCalls []ToolCallItem `json:"toolCalls,omitempty"`
	Error     string         `json:"error,omitempty"`
}

// ChatSession represents an isolated conversation thread in ~/.aegis/chats/<session_id>.json.
type ChatSession struct {
	ID             string        `json:"id"`
	Title          string        `json:"title"`
	Provider       string        `json:"provider"`
	Model          string        `json:"model"`
	Messages       []ChatMessage `json:"messages"`
	CreatedAt      int64         `json:"createdAt"`
	UpdatedAt      int64         `json:"updatedAt"`
	WorkspacePath  string        `json:"workspacePath,omitempty"`
	ConversationID string        `json:"conversationId,omitempty"`
}

// ChatSummary represents metadata of a session for quick listing without loading full message histories.
type ChatSummary struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	MessageCount  int    `json:"messageCount"`
	WorkspacePath string `json:"workspacePath,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	UpdatedAt     int64  `json:"updatedAt"`
}

// SessionDescriptor represents high-performance session metadata stored in ~/.aegis/sessions.json.
type SessionDescriptor struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	WorkspacePath string `json:"workspacePath,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
	UpdatedAt     int64  `json:"updatedAt"`
	RootNodeID    string `json:"rootNodeId,omitempty"`
	ActiveLeafID  string `json:"activeLeafId,omitempty"`
	NodeCount     int    `json:"nodeCount"`
	TotalTokens   int    `json:"totalTokens,omitempty"`
}

// SessionsIndex represents the global session metadata index in ~/.aegis/sessions.json.
type SessionsIndex struct {
	Version   int                 `json:"version"`
	UpdatedAt int64               `json:"updatedAt"`
	Sessions  []SessionDescriptor `json:"sessions"`
}

// GraphNode represents an atomic interaction event in the append-only ledger (~/.aegis/chats/<id>.jsonl).
type GraphNode struct {
	ID      string         `json:"id"`
	Parent  *string        `json:"parent"` // nil for root node
	Type    string         `json:"type"`   // "user" | "thought" | "tool_call" | "tool_result" | "agent" | "checkpoint"
	Text    string         `json:"text,omitempty"`
	Content string         `json:"content,omitempty"`
	Tool    string         `json:"tool,omitempty"`
	Args    map[string]any `json:"args,omitempty"`
	Output  string         `json:"output,omitempty"`
	BlobRef string         `json:"blobRef,omitempty"`
	Preview string         `json:"preview,omitempty"`
	Ts      int64          `json:"ts"`
	Meta    map[string]any `json:"meta,omitempty"`
}

// SearchResult represents a matching snippet found via SQLite FTS5 search across chat history.
type SearchResult struct {
	SessionID     string `json:"sessionId"`
	SessionTitle  string `json:"sessionTitle"`
	EventID       string `json:"eventId"`
	Snippet       string `json:"snippet"`
	Role          string `json:"role"`
	WorkspacePath string `json:"workspacePath,omitempty"`
	CreatedAt     int64  `json:"createdAt"`
}

