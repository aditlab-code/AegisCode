package store

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
)

// Store coordinates persistence in the user app data directory via pure-Go SQLite (~/.aegis/aegis.db).
type Store struct {
	baseDir  string
	chatsDir string
	blobsDir string
	dbPath   string
	db       *sql.DB
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

// New initializes a Store backed by pure-Go SQLite at baseDir/aegis.db.
// If baseDir is empty, resolves the platform default directory.
func New(baseDir string) (*Store, error) {
	if baseDir == "" {
		resolved, err := ResolveDataDir()
		if err != nil {
			return nil, err
		}
		baseDir = resolved
	}

	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create storage directory %s: %w", baseDir, err)
	}

	chatsDir := filepath.Join(baseDir, "chats")
	blobsDir := filepath.Join(baseDir, "blobs")
	dbPath := filepath.Join(baseDir, "aegis.db")
	db, err := OpenDB(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize sqlite storage: %w", err)
	}

	st := &Store{
		baseDir:  baseDir,
		chatsDir: chatsDir,
		blobsDir: blobsDir,
		dbPath:   dbPath,
		db:       db,
	}

	// 1. Non-destructive shadow migration of legacy flat-files into SQLite
	if err := MigrateFlatFilesToSQLite(baseDir, db); err != nil {
		// Log or return error if migration fails
		_ = db.Close()
		return nil, fmt.Errorf("failed during shadow migration to sqlite: %w", err)
	}

	// Clean up empty legacy folders in baseDir if they exist
	cleanEmptyDir(chatsDir)
	cleanEmptyDir(blobsDir)

	// 2. If app_config table is still empty, check for legacy v1 artifacts (ADR 0007)
	var configCount int
	if err := db.QueryRow(`SELECT count(*) FROM app_config WHERE id = 1`).Scan(&configCount); err == nil && configCount == 0 {
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

// DB returns the underlying *sql.DB handle.
func (s *Store) DB() *sql.DB {
	return s.db
}

// Close gracefully closes the SQLite database connection pool.
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db != nil {
		return s.db.Close()
	}
	return nil
}

func sanitizeID(id string) (string, error) {
	clean := filepath.Base(strings.TrimSpace(id))
	clean = strings.TrimSuffix(clean, ".json")
	clean = strings.TrimSuffix(clean, ".jsonl")
	if clean == "" || clean == "." || clean == "/" || clean == "\\" || strings.Contains(clean, "..") {
		return "", errors.New("invalid or empty identifier")
	}
	return clean, nil
}

// --- Config Operations ---

// GetConfig reads the user configuration from the SQLite app_config table.
func (s *Store) GetConfig() (*Config, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var dataJSON string
	err := s.db.QueryRow(`SELECT data_json FROM app_config WHERE id = 1`).Scan(&dataJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return &Config{
			BypassTokens:     make(map[string]string),
			ProviderKeys:     make(map[string]string),
			ProviderBaseURLs: make(map[string]string),
			BypassCommands:   make(map[string]string),
			CustomModels:     make(map[string][]string),
			Settings:         make(map[string]any),
			UpdatedAt:        time.Now().UnixMilli(),
		}, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to query config from sqlite: %w", err)
	}

	var cfg Config
	if err := json.Unmarshal([]byte(dataJSON), &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config JSON: %w", err)
	}

	if cfg.BypassTokens == nil {
		cfg.BypassTokens = make(map[string]string)
	}
	if cfg.ProviderKeys == nil {
		cfg.ProviderKeys = make(map[string]string)
	}
	if cfg.ProviderBaseURLs == nil {
		cfg.ProviderBaseURLs = make(map[string]string)
	}
	if cfg.BypassCommands == nil {
		cfg.BypassCommands = make(map[string]string)
	}
	if cfg.CustomModels == nil {
		cfg.CustomModels = make(map[string][]string)
	}
	if cfg.Settings == nil {
		cfg.Settings = make(map[string]any)
	}

	return &cfg, nil
}

// SaveConfig persists the user configuration atomically to SQLite.
func (s *Store) SaveConfig(cfg *Config) error {
	if cfg == nil {
		return errors.New("cannot save nil config")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cfg.UpdatedAt = time.Now().UnixMilli()
	data, err := json.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("failed to serialize config: %w", err)
	}

	query := `
		INSERT INTO app_config (id, data_json, updated_at)
		VALUES (1, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			data_json = excluded.data_json,
			updated_at = excluded.updated_at
	`
	_, err = s.db.Exec(query, string(data), cfg.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to save config to sqlite: %w", err)
	}

	return nil
}

// --- AppState Operations ---

func (s *Store) getStateUnlocked() (*AppState, error) {
	var activeSessionID sql.NullString
	var recJSON string
	var updatedAt int64

	err := s.db.QueryRow(`
		SELECT active_session_id, recent_projects_json, updated_at
		FROM app_state
		WHERE id = 1
	`).Scan(&activeSessionID, &recJSON, &updatedAt)

	if errors.Is(err, sql.ErrNoRows) {
		return &AppState{
			RecentProjects: []string{},
			UpdatedAt:      time.Now().UnixMilli(),
		}, nil
	} else if err != nil {
		return nil, fmt.Errorf("failed to query app state: %w", err)
	}

	st := AppState{
		RecentProjects: []string{},
		UpdatedAt:      updatedAt,
	}
	if activeSessionID.Valid {
		st.ActiveSessionID = activeSessionID.String
	}
	if recJSON != "" && recJSON != "[]" {
		_ = json.Unmarshal([]byte(recJSON), &st.RecentProjects)
	}
	if len(st.RecentProjects) > 0 {
		st.LastWorkspace = st.RecentProjects[0]
	}

	return &st, nil
}

func (s *Store) saveStateUnlocked(st *AppState) error {
	if st == nil {
		return errors.New("cannot save nil state")
	}
	if st.RecentProjects == nil {
		st.RecentProjects = []string{}
	}
	st.UpdatedAt = time.Now().UnixMilli()

	recJSON, err := json.Marshal(st.RecentProjects)
	if err != nil {
		return fmt.Errorf("failed to serialize recent projects: %w", err)
	}

	query := `
		INSERT INTO app_state (id, active_session_id, recent_projects_json, updated_at)
		VALUES (1, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			active_session_id = excluded.active_session_id,
			recent_projects_json = excluded.recent_projects_json,
			updated_at = excluded.updated_at
	`
	_, err = s.db.Exec(query, st.ActiveSessionID, string(recJSON), st.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to save state to sqlite: %w", err)
	}

	return nil
}

// GetState reads application state from SQLite.
func (s *Store) GetState() (*AppState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.getStateUnlocked()
}

// SaveState persists application state atomically to SQLite.
func (s *Store) SaveState(st *AppState) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveStateUnlocked(st)
}

// AddRecentProject adds a workspace path to the recent list atomically under a single write lock.
func (s *Store) AddRecentProject(rawPath string) error {
	cleaned := filepath.Clean(strings.TrimSpace(rawPath))
	if cleaned == "" || cleaned == "." {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	st, err := s.getStateUnlocked()
	if err != nil {
		st = &AppState{RecentProjects: []string{}}
	}

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
	return s.saveStateUnlocked(st)
}

// RemoveRecentProject removes a workspace path from the recent list atomically under a single write lock.
func (s *Store) RemoveRecentProject(rawPath string) error {
	cleaned := filepath.Clean(strings.TrimSpace(rawPath))
	if cleaned == "" {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	st, err := s.getStateUnlocked()
	if err != nil {
		return nil
	}

	var filtered []string
	for _, p := range st.RecentProjects {
		if filepath.Clean(p) != cleaned {
			filtered = append(filtered, p)
		}
	}
	st.RecentProjects = filtered
	return s.saveStateUnlocked(st)
}

// ClearRecentProjects empties the recent projects list atomically under a single write lock.
func (s *Store) ClearRecentProjects() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	st, err := s.getStateUnlocked()
	if err != nil {
		st = &AppState{}
	}
	st.RecentProjects = []string{}
	return s.saveStateUnlocked(st)
}

// --- Chat Operations ---

// ListChats reads all session summaries from SQLite chat_sessions in O(1) time,
// optionally filtering by workspacePath if specified.
func (s *Store) ListChats(workspacePath ...string) ([]ChatSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var rows *sql.Rows
	var err error

	targetWS := ""
	if len(workspacePath) > 0 {
		targetWS = strings.TrimSpace(workspacePath[0])
	}

	if targetWS != "" {
		rows, err = s.db.Query(`
			SELECT id, title, provider, model, coalesce(workspace_path, ''), node_count, created_at, updated_at
			FROM chat_sessions
			WHERE workspace_path = ?
			ORDER BY updated_at DESC
		`, targetWS)
	} else {
		rows, err = s.db.Query(`
			SELECT id, title, provider, model, coalesce(workspace_path, ''), node_count, created_at, updated_at
			FROM chat_sessions
			ORDER BY updated_at DESC
		`)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to list chats: %w", err)
	}
	defer rows.Close()

	var summaries []ChatSummary
	for rows.Next() {
		var cs ChatSummary
		if err := rows.Scan(
			&cs.ID, &cs.Title, &cs.Provider, &cs.Model, &cs.WorkspacePath,
			&cs.MessageCount, &cs.CreatedAt, &cs.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan chat summary: %w", err)
		}
		summaries = append(summaries, cs)
	}

	if summaries == nil {
		summaries = []ChatSummary{}
	}

	return summaries, nil
}

// GetChat loads a specific chat session by its ID, reconstructing from the event graph.
func (s *Store) GetChat(id string) (*ChatSession, error) {
	return s.ReconstructChat(id, "")
}

// SaveChat persists a chat session atomically into SQLite.
func (s *Store) SaveChat(session *ChatSession) error {
	if session == nil {
		return errors.New("cannot save nil session")
	}

	cleanID, err := sanitizeID(session.ID)
	if err != nil {
		return err
	}
	session.ID = cleanID

	if session.CreatedAt == 0 {
		session.CreatedAt = time.Now().UnixMilli()
	}
	session.UpdatedAt = time.Now().UnixMilli()
	if session.Messages == nil {
		session.Messages = []ChatMessage{}
	}

	nodes := ConvertMessagesToGraphNodes(cleanID, session.Provider, session.Model, session.Messages)
	rootID := ""
	leafID := ""
	if len(nodes) > 0 {
		rootID = nodes[0].ID
		leafID = nodes[len(nodes)-1].ID
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// 1. Upsert session master record (including conversation_id)
	_, err = tx.Exec(`
		INSERT INTO chat_sessions (
			id, title, provider, model, workspace_path, conversation_id, root_node_id, active_leaf_id, node_count, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title=excluded.title,
			provider=excluded.provider,
			model=excluded.model,
			workspace_path=CASE WHEN excluded.workspace_path != '' THEN excluded.workspace_path ELSE chat_sessions.workspace_path END,
			conversation_id=CASE WHEN excluded.conversation_id != '' THEN excluded.conversation_id ELSE chat_sessions.conversation_id END,
			root_node_id=excluded.root_node_id,
			active_leaf_id=excluded.active_leaf_id,
			node_count=excluded.node_count,
			updated_at=excluded.updated_at
	`, cleanID, session.Title, session.Provider, session.Model, session.WorkspacePath, session.ConversationID, rootID, leafID, len(nodes), session.CreatedAt, session.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to upsert chat session: %w", err)
	}

	// 2. Clear previous events for session and insert new nodes
	_, err = tx.Exec(`DELETE FROM chat_events WHERE session_id = ?`, cleanID)
	if err != nil {
		return fmt.Errorf("failed to clear old chat events: %w", err)
	}

	for i := range nodes {
		node := &nodes[i]
		if len(node.Output) > 4096 {
			hasher := sha256.New()
			hasher.Write([]byte(node.Output))
			hash := hex.EncodeToString(hasher.Sum(nil))

			_, bErr := tx.Exec(`
				INSERT INTO blobs (hash, session_id, data, size, created_at)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT(session_id, hash) DO NOTHING
			`, hash, cleanID, []byte(node.Output), len(node.Output), time.Now().UnixMilli())
			if bErr == nil {
				node.BlobRef = hash
				previewRunes := []rune(node.Output)
				if len(previewRunes) > 200 {
					node.Preview = string(previewRunes[:200]) + "..."
				} else {
					node.Preview = node.Output
				}
				node.Output = ""
			}
		}

		var parentID *string
		if node.Parent != nil && *node.Parent != "" {
			parentID = node.Parent
		}

		argsJSON := "{}"
		if node.Args != nil {
			if ab, mErr := json.Marshal(node.Args); mErr == nil {
				argsJSON = string(ab)
			}
		}

		metaJSON := "{}"
		if node.Meta != nil {
			if mb, mErr := json.Marshal(node.Meta); mErr == nil {
				metaJSON = string(mb)
			}
		}

		role := node.Type
		if role == "thought" || role == "tool_call" || role == "tool_result" {
			role = "agent"
		}

		reasoning := ""
		if node.Type == "thought" {
			reasoning = node.Content
		}

		_, err = tx.Exec(`
			INSERT OR REPLACE INTO chat_events (
				id, session_id, parent_id, type, role, text, content, reasoning,
				tool_name, tool_args_json, tool_output, blob_ref, preview,
				provider, model, meta_json, created_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`,
			node.ID, cleanID, parentID, node.Type, role, node.Text, node.Content, reasoning,
			node.Tool, argsJSON, node.Output, node.BlobRef, node.Preview,
			session.Provider, session.Model, metaJSON, node.Ts,
		)
		if err != nil {
			return fmt.Errorf("failed to insert chat event: %w", err)
		}
	}

	return tx.Commit()
}

// DeleteChat removes a chat session and all associated events, FTS entries, and CAS blobs.
func (s *Store) DeleteChat(id string) error {
	cleanID, err := sanitizeID(id)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin delete transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// Deleting chat_sessions cascades to chat_events via foreign key
	_, _ = tx.Exec(`DELETE FROM chat_events WHERE session_id = ?`, cleanID)
	_, _ = tx.Exec(`DELETE FROM chat_sessions WHERE id = ?`, cleanID)
	_, _ = tx.Exec(`DELETE FROM blobs WHERE session_id = ?`, cleanID)

	return tx.Commit()
}

// SearchChats executes a high-speed SQLite hybrid search (session title matching + FTS5 event search),
// optionally filtering by workspacePath if specified.
func (s *Store) SearchChats(query string, limit int, workspacePath ...string) ([]SearchResult, error) {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return []SearchResult{}, nil
	}

	if limit <= 0 {
		limit = 30
	} else if limit > 100 {
		limit = 100
	}

	targetWS := ""
	if len(workspacePath) > 0 {
		targetWS = strings.TrimSpace(workspacePath[0])
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	var results []SearchResult
	seenEvents := make(map[string]bool)

	// 1. Session Title Search (matches if user searches for session title keywords)
	likePattern := "%" + trimmed + "%"
	var titleRows *sql.Rows
	var tErr error
	if targetWS != "" {
		titleRows, tErr = s.db.Query(`
			SELECT
				id,
				title,
				coalesce(root_node_id, ''),
				title,
				'session',
				coalesce(workspace_path, ''),
				created_at
			FROM chat_sessions
			WHERE title LIKE ? AND workspace_path = ?
			ORDER BY updated_at DESC
			LIMIT ?;
		`, likePattern, targetWS, limit)
	} else {
		titleRows, tErr = s.db.Query(`
			SELECT
				id,
				title,
				coalesce(root_node_id, ''),
				title,
				'session',
				coalesce(workspace_path, ''),
				created_at
			FROM chat_sessions
			WHERE title LIKE ?
			ORDER BY updated_at DESC
			LIMIT ?;
		`, likePattern, limit)
	}
	if tErr == nil {
		defer titleRows.Close()
		for titleRows.Next() {
			var r SearchResult
			if err := titleRows.Scan(
				&r.SessionID,
				&r.SessionTitle,
				&r.EventID,
				&r.Snippet,
				&r.Role,
				&r.WorkspacePath,
				&r.CreatedAt,
			); err == nil {
				key := r.SessionID + ":" + r.EventID
				seenEvents[key] = true
				results = append(results, r)
			}
		}
	}

	// 2. FTS5 Deep Search (across text and reasoning in chat_events)
	ftsQuery := sanitizeFTSQuery(trimmed)
	if ftsQuery != "" {
		var rows *sql.Rows
		var err error
		if targetWS != "" {
			sqlQuery := `
				SELECT
					f.session_id,
					coalesce(s.title, 'Chat Session') AS session_title,
					f.id,
					coalesce(nullif(snippet(chat_fts, -1, '<b>', '</b>', '...', 15), ''), e.text, e.content, '') AS snippet_text,
					coalesce(e.role, e.type, 'user') AS role_name,
					coalesce(s.workspace_path, '') AS workspace_path,
					coalesce(e.created_at, 0) AS created_at
				FROM chat_fts f
				LEFT JOIN chat_sessions s ON s.id = f.session_id
				LEFT JOIN chat_events e ON e.id = f.id
				WHERE chat_fts MATCH ? AND s.workspace_path = ?
				ORDER BY rank
				LIMIT ?;
			`
			rows, err = s.db.Query(sqlQuery, ftsQuery, targetWS, limit)
		} else {
			sqlQuery := `
				SELECT
					f.session_id,
					coalesce(s.title, 'Chat Session') AS session_title,
					f.id,
					coalesce(nullif(snippet(chat_fts, -1, '<b>', '</b>', '...', 15), ''), e.text, e.content, '') AS snippet_text,
					coalesce(e.role, e.type, 'user') AS role_name,
					coalesce(s.workspace_path, '') AS workspace_path,
					coalesce(e.created_at, 0) AS created_at
				FROM chat_fts f
				LEFT JOIN chat_sessions s ON s.id = f.session_id
				LEFT JOIN chat_events e ON e.id = f.id
				WHERE chat_fts MATCH ?
				ORDER BY rank
				LIMIT ?;
			`
			rows, err = s.db.Query(sqlQuery, ftsQuery, limit)
		}
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var r SearchResult
				if err := rows.Scan(
					&r.SessionID,
					&r.SessionTitle,
					&r.EventID,
					&r.Snippet,
					&r.Role,
					&r.WorkspacePath,
					&r.CreatedAt,
				); err == nil {
					key := r.SessionID + ":" + r.EventID
					if !seenEvents[key] {
						seenEvents[key] = true
						results = append(results, r)
					}
				}
			}
		}
	}

	if len(results) > limit {
		results = results[:limit]
	}

	if results == nil {
		results = []SearchResult{}
	}

	return results, nil
}

// sanitizeFTSQuery wraps individual alphanumeric tokens in quotes with wildcard suffix to support prefix search.
func sanitizeFTSQuery(q string) string {
	terms := strings.Fields(q)
	var cleaned []string
	for _, t := range terms {
		t = strings.ReplaceAll(t, `"`, "")
		t = strings.Trim(t, "*?:;,.-_()[]{}!&|")
		if t != "" {
			cleaned = append(cleaned, fmt.Sprintf(`"%s"*`, t))
		}
	}
	if len(cleaned) == 0 {
		return ""
	}
	return strings.Join(cleaned, " ")
}

// PurgeLegacyOrphans removes legacy flat-file backup directory and empty storage folders.
func (s *Store) PurgeLegacyOrphans() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return PurgeLegacyOrphans(s.baseDir)
}

