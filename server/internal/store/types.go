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

// ChatMessage represents a single message in an AI conversation.
type ChatMessage struct {
	ID        string        `json:"id"`
	Role      string        `json:"role"` // "user" | "agent" | "system"
	Text      string        `json:"text"`
	Timestamp int64         `json:"timestamp,omitempty"`
	Context   []ContextItem `json:"context,omitempty"`
}

// ChatSession represents an isolated conversation thread in ~/.aegis/chats/<session_id>.json.
type ChatSession struct {
	ID        string        `json:"id"`
	Title     string        `json:"title"`
	Provider  string        `json:"provider"`
	Model     string        `json:"model"`
	Messages  []ChatMessage `json:"messages"`
	CreatedAt int64         `json:"createdAt"`
	UpdatedAt int64         `json:"updatedAt"`
}

// ChatSummary represents metadata of a session for quick listing without loading full message histories.
type ChatSummary struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Provider     string `json:"provider"`
	Model        string `json:"model"`
	MessageCount int    `json:"messageCount"`
	CreatedAt    int64  `json:"createdAt"`
	UpdatedAt    int64  `json:"updatedAt"`
}
