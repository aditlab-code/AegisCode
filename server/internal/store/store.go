package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

// Store coordinates flat-file persistence in the user app data directory (~/.aegis/).
type Store struct {
	baseDir  string
	chatsDir string
	mu       sync.RWMutex
}

// ResolveDataDir resolves the canonical storage directory for AegisCode.
// 1. Checks $AEGIS_DATA_DIR override.
// 2. On Windows: %APPDATA%\AegisCode (or ~/.aegis fallback).
// 3. On Darwin/Linux: ~/.aegis.
func ResolveDataDir() (string, error) {
	if custom := os.Getenv("AEGIS_DATA_DIR"); custom != "" {
		return filepath.Clean(custom), nil
	}

	if runtime.GOOS == "windows" {
		if appData := os.Getenv("APPDATA"); appData != "" {
			return filepath.Join(appData, "AegisCode"), nil
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("failed to locate user home directory: %w", err)
	}

	return filepath.Join(home, ".aegis"), nil
}

// New initializes a Store with the given directory, or resolves the default if empty.
func New(baseDir string) (*Store, error) {
	if baseDir == "" {
		resolved, err := ResolveDataDir()
		if err != nil {
			return nil, err
		}
		baseDir = resolved
	}

	chatsDir := filepath.Join(baseDir, "chats")
	if err := os.MkdirAll(chatsDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage directories: %w", err)
	}

	st := &Store{
		baseDir:  baseDir,
		chatsDir: chatsDir,
	}

	// Non-destructive shadow migration check:
	// If config.json does not exist, look for legacy v1 artifacts.
	configPath := filepath.Join(baseDir, "config.json")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		if migratedCfg, mErr := RunLegacyMigration(baseDir); mErr == nil && migratedCfg != nil {
			_ = st.SaveConfig(migratedCfg)
		}
	}

	return st, nil
}

// BaseDir returns the root storage directory path.
func (s *Store) BaseDir() string {
	return s.baseDir
}

// atomicWrite writes data to a temporary file in the same directory and renames it atomically.
func atomicWrite(destPath string, data []byte) error {
	dir := filepath.Dir(destPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory %s: %w", dir, err)
	}

	tmpFile := filepath.Join(dir, fmt.Sprintf(".%s.%d.tmp", filepath.Base(destPath), time.Now().UnixNano()))
	f, err := os.OpenFile(tmpFile, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("failed to create temporary file: %w", err)
	}

	if _, err := f.Write(data); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpFile)
		return fmt.Errorf("failed to write data: %w", err)
	}

	if err := f.Sync(); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpFile)
		return fmt.Errorf("failed to sync data: %w", err)
	}

	if err := f.Close(); err != nil {
		_ = os.Remove(tmpFile)
		return fmt.Errorf("failed to close temporary file: %w", err)
	}

	if err := os.Rename(tmpFile, destPath); err != nil {
		_ = os.Remove(destPath)
		if retryErr := os.Rename(tmpFile, destPath); retryErr != nil {
			_ = os.Remove(tmpFile)
			return fmt.Errorf("failed to atomically replace file: %w", retryErr)
		}
	}

	return nil
}

func sanitizeID(id string) (string, error) {
	clean := filepath.Base(strings.TrimSpace(id))
	clean = strings.TrimSuffix(clean, ".json")
	if clean == "" || clean == "." || clean == "/" || clean == "\\" || strings.Contains(clean, "..") {
		return "", errors.New("invalid or empty identifier")
	}
	return clean, nil
}

// --- Config Operations ---

// GetConfig reads the user configuration from ~/.aegis/config.json.
func (s *Store) GetConfig() (*Config, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	cfgPath := filepath.Join(s.baseDir, "config.json")
	b, err := os.ReadFile(cfgPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{
				BypassTokens: make(map[string]string),
				ProviderKeys: make(map[string]string),
				Settings:     make(map[string]any),
				UpdatedAt:    time.Now().UnixMilli(),
			}, nil
		}
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal(b, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config JSON: %w", err)
	}

	if cfg.BypassTokens == nil {
		cfg.BypassTokens = make(map[string]string)
	}
	if cfg.ProviderKeys == nil {
		cfg.ProviderKeys = make(map[string]string)
	}
	if cfg.Settings == nil {
		cfg.Settings = make(map[string]any)
	}

	return &cfg, nil
}

// SaveConfig persists the user configuration atomically to ~/.aegis/config.json.
func (s *Store) SaveConfig(cfg *Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if cfg == nil {
		return errors.New("cannot save nil config")
	}

	cfg.UpdatedAt = time.Now().UnixMilli()
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize config: %w", err)
	}

	return atomicWrite(filepath.Join(s.baseDir, "config.json"), data)
}

// --- AppState Operations ---

// GetState reads application state from ~/.aegis/state.json.
func (s *Store) GetState() (*AppState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	statePath := filepath.Join(s.baseDir, "state.json")
	b, err := os.ReadFile(statePath)
	if err != nil {
		if os.IsNotExist(err) {
			return &AppState{
				RecentProjects: []string{},
				UpdatedAt:      time.Now().UnixMilli(),
			}, nil
		}
		return nil, fmt.Errorf("failed to read state file: %w", err)
	}

	var st AppState
	if err := json.Unmarshal(b, &st); err != nil {
		return nil, fmt.Errorf("failed to parse state JSON: %w", err)
	}

	if st.RecentProjects == nil {
		st.RecentProjects = []string{}
	}

	return &st, nil
}

// SaveState persists application state atomically to ~/.aegis/state.json.
func (s *Store) SaveState(st *AppState) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if st == nil {
		return errors.New("cannot save nil state")
	}

	if st.RecentProjects == nil {
		st.RecentProjects = []string{}
	}
	st.UpdatedAt = time.Now().UnixMilli()

	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize state: %w", err)
	}

	return atomicWrite(filepath.Join(s.baseDir, "state.json"), data)
}

// AddRecentProject adds a workspace path to the recent list, deduplicating and limiting to 20 items.
func (s *Store) AddRecentProject(rawPath string) error {
	cleaned := filepath.Clean(strings.TrimSpace(rawPath))
	if cleaned == "" || cleaned == "." {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	st := &AppState{
		RecentProjects: []string{},
		UpdatedAt:      time.Now().UnixMilli(),
	}

	statePath := filepath.Join(s.baseDir, "state.json")
	if b, err := os.ReadFile(statePath); err == nil {
		_ = json.Unmarshal(b, st)
	}

	// Deduplicate and move to head
	var updated []string
	updated = append(updated, cleaned)
	for _, p := range st.RecentProjects {
		if filepath.Clean(p) != cleaned {
			updated = append(updated, p)
		}
	}
	if len(updated) > 20 {
		updated = updated[:20]
	}

	st.RecentProjects = updated
	st.LastWorkspace = cleaned
	st.UpdatedAt = time.Now().UnixMilli()

	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize state: %w", err)
	}

	return atomicWrite(statePath, data)
}

// RemoveRecentProject removes a workspace path from the recent list.
func (s *Store) RemoveRecentProject(rawPath string) error {
	cleaned := filepath.Clean(strings.TrimSpace(rawPath))
	if cleaned == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	st := &AppState{
		RecentProjects: []string{},
		UpdatedAt:      time.Now().UnixMilli(),
	}

	statePath := filepath.Join(s.baseDir, "state.json")
	if b, err := os.ReadFile(statePath); err == nil {
		_ = json.Unmarshal(b, st)
	}

	var filtered []string
	for _, p := range st.RecentProjects {
		if filepath.Clean(p) != cleaned {
			filtered = append(filtered, p)
		}
	}
	st.RecentProjects = filtered
	st.UpdatedAt = time.Now().UnixMilli()

	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize state: %w", err)
	}

	return atomicWrite(statePath, data)
}

// ClearRecentProjects empties the recent projects list.
func (s *Store) ClearRecentProjects() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	st := &AppState{
		RecentProjects: []string{},
		UpdatedAt:      time.Now().UnixMilli(),
	}

	statePath := filepath.Join(s.baseDir, "state.json")
	if b, err := os.ReadFile(statePath); err == nil {
		_ = json.Unmarshal(b, st)
	}

	st.RecentProjects = []string{}
	st.UpdatedAt = time.Now().UnixMilli()

	data, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize state: %w", err)
	}

	return atomicWrite(statePath, data)
}

// --- Chat Operations ---

// ListChats reads all session summaries from ~/.aegis/chats/*.json, sorted by UpdatedAt desc.
func (s *Store) ListChats() ([]ChatSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.chatsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []ChatSummary{}, nil
		}
		return nil, fmt.Errorf("failed to read chats directory: %w", err)
	}

	var summaries []ChatSummary
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		filePath := filepath.Join(s.chatsDir, entry.Name())
		data, rErr := os.ReadFile(filePath)
		if rErr != nil {
			continue
		}

		var session ChatSession
		if uErr := json.Unmarshal(data, &session); uErr != nil {
			continue
		}

		summaries = append(summaries, ChatSummary{
			ID:           session.ID,
			Title:        session.Title,
			Provider:     session.Provider,
			Model:        session.Model,
			MessageCount: len(session.Messages),
			CreatedAt:    session.CreatedAt,
			UpdatedAt:    session.UpdatedAt,
		})
	}

	sort.Slice(summaries, func(i, j int) bool {
		ti := summaries[i].UpdatedAt
		if ti == 0 {
			ti = summaries[i].CreatedAt
		}
		tj := summaries[j].UpdatedAt
		if tj == 0 {
			tj = summaries[j].CreatedAt
		}
		return ti > tj
	})

	if summaries == nil {
		summaries = []ChatSummary{}
	}

	return summaries, nil
}

// GetChat loads a specific chat session by its ID.
func (s *Store) GetChat(id string) (*ChatSession, error) {
	cleanID, err := sanitizeID(id)
	if err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	filePath := filepath.Join(s.chatsDir, cleanID+".json")
	data, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, os.ErrNotExist
		}
		return nil, fmt.Errorf("failed to read chat session: %w", err)
	}

	var session ChatSession
	if err := json.Unmarshal(data, &session); err != nil {
		return nil, fmt.Errorf("failed to parse chat session: %w", err)
	}

	if session.Messages == nil {
		session.Messages = []ChatMessage{}
	}

	return &session, nil
}

// SaveChat atomically persists a chat session to ~/.aegis/chats/<session_id>.json.
func (s *Store) SaveChat(session *ChatSession) error {
	if session == nil {
		return errors.New("cannot save nil session")
	}

	cleanID, err := sanitizeID(session.ID)
	if err != nil {
		return err
	}
	session.ID = cleanID

	s.mu.Lock()
	defer s.mu.Unlock()

	if session.CreatedAt == 0 {
		session.CreatedAt = time.Now().UnixMilli()
	}
	session.UpdatedAt = time.Now().UnixMilli()
	if session.Messages == nil {
		session.Messages = []ChatMessage{}
	}

	data, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize chat session: %w", err)
	}

	filePath := filepath.Join(s.chatsDir, cleanID+".json")
	return atomicWrite(filePath, data)
}

// DeleteChat removes a chat session file.
func (s *Store) DeleteChat(id string) error {
	cleanID, err := sanitizeID(id)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	filePath := filepath.Join(s.chatsDir, cleanID+".json")
	if err := os.Remove(filePath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to remove chat session file: %w", err)
	}

	return nil
}
