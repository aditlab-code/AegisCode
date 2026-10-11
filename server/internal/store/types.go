package store

// Config represents persistent user preferences, theme overrides, model configurations,
// and bypassed auth/API tokens stored in ~/.aegis/config.json.
type Config struct {
	Theme        string            `json:"theme,omitempty"`
	DefaultModel string            `json:"defaultModel,omitempty"`
	BypassTokens map[string]string `json:"bypassTokens,omitempty"`
	ProviderKeys map[string]string `json:"providerKeys,omitempty"`
	Settings     map[string]any    `json:"settings,omitempty"`
	UpdatedAt    int64             `json:"updatedAt"`
}

// AppState represents lightweight application lifecycle state in ~/.aegis/state.json.
type AppState struct {
	RecentProjects  []string `json:"recentProjects"`
	LastWorkspace   string   `json:"lastWorkspace,omitempty"`
	ActiveSessionID string   `json:"activeSessionId,omitempty"`
	UpdatedAt       int64    `json:"updatedAt"`
}

// ChatMessage represents a single message in an AI conversation.
type ChatMessage struct {
	ID        string `json:"id"`
	Role      string `json:"role"` // "user" | "agent" | "system"
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp,omitempty"`
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
