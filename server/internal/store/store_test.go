package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestStoreInitialization(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("unexpected error creating store: %v", err)
	}

	if st.BaseDir() != tempDir {
		t.Errorf("expected baseDir %s, got %s", tempDir, st.BaseDir())
	}

	chatsDir := filepath.Join(tempDir, "chats")
	if info, err := os.Stat(chatsDir); err != nil || !info.IsDir() {
		t.Errorf("chats directory was not properly initialized: %v", err)
	}
}

func TestConfigPersistence(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	// 1. Initial read should return clean defaults
	cfg, err := st.GetConfig()
	if err != nil {
		t.Fatalf("failed to get default config: %v", err)
	}
	if len(cfg.BypassTokens) != 0 || len(cfg.ProviderKeys) != 0 {
		t.Errorf("expected empty maps in default config")
	}

	// 2. Save config
	cfg.Theme = "light"
	cfg.DefaultProvider = "openrouter"
	cfg.DefaultModel = "claude-3-7-sonnet"
	cfg.BypassTokens["antigravity"] = "test-token-123"
	cfg.ProviderKeys["openrouter"] = "sk-or-test"
	cfg.ProviderBaseURLs["opencode"] = "https://custom.opencode.ai/v1"
	cfg.BypassCommands["claude"] = "claude auth status"
	cfg.CustomModels["openrouter"] = []string{"meta-llama/llama-3.3-70b", "deepseek/deepseek-chat"}
	cfg.Settings["editor.tabSize"] = 4

	if err := st.SaveConfig(cfg); err != nil {
		t.Fatalf("failed to save config: %v", err)
	}

	// 3. Re-read and verify values
	loaded, err := st.GetConfig()
	if err != nil {
		t.Fatalf("failed to re-read config: %v", err)
	}
	if loaded.Theme != "light" {
		t.Errorf("expected theme 'light', got %s", loaded.Theme)
	}
	if loaded.DefaultProvider != "openrouter" {
		t.Errorf("expected defaultProvider 'openrouter', got %s", loaded.DefaultProvider)
	}
	if loaded.DefaultModel != "claude-3-7-sonnet" {
		t.Errorf("expected defaultModel 'claude-3-7-sonnet', got %s", loaded.DefaultModel)
	}
	if loaded.BypassTokens["antigravity"] != "test-token-123" {
		t.Errorf("expected bypass token 'test-token-123', got %s", loaded.BypassTokens["antigravity"])
	}
	if loaded.ProviderKeys["openrouter"] != "sk-or-test" {
		t.Errorf("expected provider key 'sk-or-test', got %s", loaded.ProviderKeys["openrouter"])
	}
	if loaded.ProviderBaseURLs["opencode"] != "https://custom.opencode.ai/v1" {
		t.Errorf("expected provider baseURL, got %s", loaded.ProviderBaseURLs["opencode"])
	}
	if loaded.BypassCommands["claude"] != "claude auth status" {
		t.Errorf("expected bypass command, got %s", loaded.BypassCommands["claude"])
	}
	if len(loaded.CustomModels["openrouter"]) != 2 || loaded.CustomModels["openrouter"][0] != "meta-llama/llama-3.3-70b" {
		t.Errorf("expected custom models array, got %v", loaded.CustomModels["openrouter"])
	}
}

func TestAppStateAndRecentProjects(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	// Initial state
	state, err := st.GetState()
	if err != nil {
		t.Fatalf("failed to get state: %v", err)
	}
	if len(state.RecentProjects) != 0 {
		t.Errorf("expected 0 recent projects initially")
	}

	// Add recent projects
	p1 := filepath.Join(tempDir, "proj1")
	p2 := filepath.Join(tempDir, "proj2")
	p3 := filepath.Join(tempDir, "proj3")

	if err := st.AddRecentProject(p1); err != nil {
		t.Fatalf("failed to add p1: %v", err)
	}
	if err := st.AddRecentProject(p2); err != nil {
		t.Fatalf("failed to add p2: %v", err)
	}
	// Re-add p1 to verify deduplication and head positioning
	if err := st.AddRecentProject(p1); err != nil {
		t.Fatalf("failed to re-add p1: %v", err)
	}
	if err := st.AddRecentProject(p3); err != nil {
		t.Fatalf("failed to add p3: %v", err)
	}

	state, err = st.GetState()
	if err != nil {
		t.Fatalf("failed to get state: %v", err)
	}
	if len(state.RecentProjects) != 3 {
		t.Fatalf("expected 3 recent projects, got %d", len(state.RecentProjects))
	}
	if state.RecentProjects[0] != p3 || state.RecentProjects[1] != p1 || state.RecentProjects[2] != p2 {
		t.Errorf("unexpected recent projects order: %v", state.RecentProjects)
	}
	if state.LastWorkspace != p3 {
		t.Errorf("expected LastWorkspace %s, got %s", p3, state.LastWorkspace)
	}

	// Remove project
	if err := st.RemoveRecentProject(p1); err != nil {
		t.Fatalf("failed to remove p1: %v", err)
	}
	state, _ = st.GetState()
	if len(state.RecentProjects) != 2 {
		t.Errorf("expected 2 recent projects after removal, got %d", len(state.RecentProjects))
	}

	// Clear projects
	if err := st.ClearRecentProjects(); err != nil {
		t.Fatalf("failed to clear projects: %v", err)
	}
	state, _ = st.GetState()
	if len(state.RecentProjects) != 0 {
		t.Errorf("expected 0 recent projects after clear, got %d", len(state.RecentProjects))
	}
}

func TestChatSessionsCRUD(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	// 1. Initial list should be empty
	chats, err := st.ListChats()
	if err != nil {
		t.Fatalf("failed to list chats: %v", err)
	}
	if len(chats) != 0 {
		t.Errorf("expected 0 chats, got %d", len(chats))
	}

	// 2. Save new chat session
	session1 := &ChatSession{
		ID:       "session-alpha",
		Title:    "Refactor Store",
		Provider: "antigravity",
		Model:    "gemini-3.8-flash",
		Messages: []ChatMessage{
			{ID: "m1", Role: "user", Text: "Can we use flat files?"},
			{ID: "m2", Role: "agent", Text: "Yes, flat files are lean and zero-CGO."},
		},
	}
	if err := st.SaveChat(session1); err != nil {
		t.Fatalf("failed to save session1: %v", err)
	}

	session2 := &ChatSession{
		ID:       "session-beta",
		Title:    "Terminal Runner",
		Provider: "claude",
		Model:    "claude-3-7-sonnet",
		Messages: []ChatMessage{
			{ID: "m3", Role: "user", Text: "Help with PTY"},
		},
	}
	if err := st.SaveChat(session2); err != nil {
		t.Fatalf("failed to save session2: %v", err)
	}

	// 3. List chats
	list, err := st.ListChats()
	if err != nil {
		t.Fatalf("failed to list chats: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 chat sessions, got %d", len(list))
	}

	// 4. Retrieve single chat
	retrieved, err := st.GetChat("session-alpha")
	if err != nil {
		t.Fatalf("failed to get session-alpha: %v", err)
	}
	if retrieved.Title != "Refactor Store" {
		t.Errorf("expected title 'Refactor Store', got %s", retrieved.Title)
	}
	if len(retrieved.Messages) != 2 {
		t.Errorf("expected 2 messages, got %d", len(retrieved.Messages))
	}

	// 5. Delete chat
	if err := st.DeleteChat("session-alpha"); err != nil {
		t.Fatalf("failed to delete session-alpha: %v", err)
	}
	_, err = st.GetChat("session-alpha")
	if err == nil {
		t.Errorf("expected error getting deleted chat")
	}

	listAfter, _ := st.ListChats()
	if len(listAfter) != 1 {
		t.Errorf("expected 1 chat session remaining, got %d", len(listAfter))
	}
}

func TestSanitizeIDTraversalGuard(t *testing.T) {
	clean, err := sanitizeID("../../etc/passwd")
	if err != nil || clean != "passwd" {
		t.Errorf("expected clean base 'passwd', got %s (%v)", clean, err)
	}
	if _, err := sanitizeID(""); err == nil {
		t.Errorf("expected error for empty ID")
	}
	if _, err := sanitizeID(".. "); err == nil {
		t.Errorf("expected error for .. ID")
	}
}

func TestLegacyMigration(t *testing.T) {
	tempDir := t.TempDir()

	// Create legacy data/settings.json
	legacyDataDir := filepath.Join(tempDir, "data")
	_ = os.MkdirAll(legacyDataDir, 0755)
	legacySettingsJSON := `{"theme":"synthwave","editor.fontSize":16}`
	_ = os.WriteFile(filepath.Join(legacyDataDir, "settings.json"), []byte(legacySettingsJSON), 0644)

	// Create legacy auth.json
	legacyAuthJSON := `{"antigravity":"legacy-token-xyz","opencode":"sk-legacy"}`
	_ = os.WriteFile(filepath.Join(tempDir, "auth.json"), []byte(legacyAuthJSON), 0644)

	// Init store pointing to tempDir
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}

	cfg, err := st.GetConfig()
	if err != nil {
		t.Fatalf("failed to get config: %v", err)
	}

	if cfg.Theme != "synthwave" {
		t.Errorf("expected migrated theme 'synthwave', got %s", cfg.Theme)
	}
	if cfg.BypassTokens["antigravity"] != "legacy-token-xyz" {
		t.Errorf("expected migrated bypass token, got %v", cfg.BypassTokens)
	}

	// Verify legacy files were NOT deleted (non-destructive shadow migration)
	if _, err := os.Stat(filepath.Join(legacyDataDir, "settings.json")); err != nil {
		t.Errorf("legacy settings.json was modified or deleted")
	}
	if _, err := os.Stat(filepath.Join(tempDir, "auth.json")); err != nil {
		t.Errorf("legacy auth.json was modified or deleted")
	}
}
