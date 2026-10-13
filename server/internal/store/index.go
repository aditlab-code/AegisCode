package store

import (
	"fmt"
	"time"
)

// GetSessionsIndex reads all session descriptors from the SQLite chat_sessions table.
func (s *Store) GetSessionsIndex() (*SessionsIndex, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query(`
		SELECT id, title, provider, model, coalesce(root_node_id, ''), coalesce(active_leaf_id, ''),
		       node_count, created_at, updated_at
		FROM chat_sessions
		ORDER BY updated_at DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("failed to query sessions index: %w", err)
	}
	defer rows.Close()

	var sessions []SessionDescriptor
	for rows.Next() {
		var desc SessionDescriptor
		if err := rows.Scan(
			&desc.ID, &desc.Title, &desc.Provider, &desc.Model,
			&desc.RootNodeID, &desc.ActiveLeafID, &desc.NodeCount,
			&desc.CreatedAt, &desc.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan session descriptor: %w", err)
		}
		sessions = append(sessions, desc)
	}

	if sessions == nil {
		sessions = []SessionDescriptor{}
	}

	return &SessionsIndex{
		Version:   2,
		UpdatedAt: time.Now().UnixMilli(),
		Sessions:  sessions,
	}, nil
}

// SaveSessionsIndex persists session descriptors into the SQLite chat_sessions table.
func (s *Store) SaveSessionsIndex(idx *SessionsIndex) error {
	if idx == nil {
		return fmt.Errorf("cannot save nil sessions index")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	stmt, err := tx.Prepare(`
		INSERT INTO chat_sessions (
			id, title, provider, model, root_node_id, active_leaf_id, node_count, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title=excluded.title,
			provider=excluded.provider,
			model=excluded.model,
			root_node_id=excluded.root_node_id,
			active_leaf_id=excluded.active_leaf_id,
			node_count=excluded.node_count,
			updated_at=excluded.updated_at
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, d := range idx.Sessions {
		cleanID, sErr := sanitizeID(d.ID)
		if sErr != nil {
			continue
		}
		_, err := stmt.Exec(
			cleanID, d.Title, d.Provider, d.Model,
			d.RootNodeID, d.ActiveLeafID, d.NodeCount,
			d.CreatedAt, d.UpdatedAt,
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// UpdateSessionDescriptor updates an existing session entry or inserts a new one in SQLite.
func (s *Store) UpdateSessionDescriptor(desc SessionDescriptor) error {
	cleanID, err := sanitizeID(desc.ID)
	if err != nil {
		return err
	}
	desc.ID = cleanID

	s.mu.Lock()
	defer s.mu.Unlock()

	if desc.CreatedAt == 0 {
		desc.CreatedAt = time.Now().UnixMilli()
	}
	if desc.UpdatedAt == 0 {
		desc.UpdatedAt = time.Now().UnixMilli()
	}

	query := `
		INSERT INTO chat_sessions (
			id, title, provider, model, root_node_id, active_leaf_id, node_count, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title=CASE WHEN excluded.title != '' THEN excluded.title ELSE chat_sessions.title END,
			provider=CASE WHEN excluded.provider != '' THEN excluded.provider ELSE chat_sessions.provider END,
			model=CASE WHEN excluded.model != '' THEN excluded.model ELSE chat_sessions.model END,
			root_node_id=CASE WHEN excluded.root_node_id != '' THEN excluded.root_node_id ELSE chat_sessions.root_node_id END,
			active_leaf_id=CASE WHEN excluded.active_leaf_id != '' THEN excluded.active_leaf_id ELSE chat_sessions.active_leaf_id END,
			node_count=CASE WHEN excluded.node_count > 0 THEN excluded.node_count ELSE chat_sessions.node_count END,
			updated_at=excluded.updated_at
	`
	_, err = s.db.Exec(
		query,
		desc.ID, desc.Title, desc.Provider, desc.Model,
		desc.RootNodeID, desc.ActiveLeafID, desc.NodeCount,
		desc.CreatedAt, desc.UpdatedAt,
	)
	return err
}

// RemoveSessionDescriptor removes a session entry from SQLite.
func (s *Store) RemoveSessionDescriptor(sessionID string) error {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err = s.db.Exec(`DELETE FROM chat_sessions WHERE id = ?`, cleanID)
	return err
}

// ReconcileSessionsOnBoot triggers shadow migration if any flat-files remain.
func (s *Store) ReconcileSessionsOnBoot() error {
	return MigrateFlatFilesToSQLite(s.baseDir, s.db)
}

// MigrateLegacyJSONChats is preserved for contract backwards compatibility.
func (s *Store) MigrateLegacyJSONChats() error {
	return MigrateFlatFilesToSQLite(s.baseDir, s.db)
}

// ConvertMessagesToGraphNodes converts a linear slice of ChatMessages into a parent-linked GraphNode chain.
func ConvertMessagesToGraphNodes(sessionID, provider, model string, messages []ChatMessage) []GraphNode {
	var nodes []GraphNode
	var lastNodeID *string

	for idx, msg := range messages {
		nodeTs := msg.Timestamp
		if nodeTs == 0 {
			nodeTs = time.Now().UnixMilli()
		}

		if msg.Role == "user" {
			uID := msg.ID
			if uID == "" {
				uID = fmt.Sprintf("n-%s-u%d", sessionID, idx)
			}
			uNode := GraphNode{
				ID:     uID,
				Parent: lastNodeID,
				Type:   "user",
				Text:   msg.Text,
				Ts:     nodeTs,
				Meta: map[string]any{
					"provider": provider,
					"model":    model,
				},
			}
			nodes = append(nodes, uNode)
			idCopy := uID
			lastNodeID = &idCopy
		} else if msg.Role == "agent" {
			// Thought node if reasoning exists
			if msg.Thinking != "" {
				thID := fmt.Sprintf("n-%s-th%d", sessionID, idx)
				thNode := GraphNode{
					ID:      thID,
					Parent:  lastNodeID,
					Type:    "thought",
					Content: msg.Thinking,
					Ts:      nodeTs,
				}
				nodes = append(nodes, thNode)
				idCopy := thID
				lastNodeID = &idCopy
			}

			// Tool call nodes
			for tIdx, tc := range msg.ToolCalls {
				tcID := tc.ID
				if tcID == "" {
					tcID = fmt.Sprintf("n-%s-tc%d-%d", sessionID, idx, tIdx)
				}
				tcNode := GraphNode{
					ID:     tcID,
					Parent: lastNodeID,
					Type:   "tool_call",
					Tool:   tc.Name,
					Args:   tc.Args,
					Ts:     nodeTs,
					Output: tc.Output,
				}
				nodes = append(nodes, tcNode)
				idCopy := tcID
				lastNodeID = &idCopy
			}

			// Agent final text node
			agID := msg.ID
			if agID == "" {
				agID = fmt.Sprintf("n-%s-a%d", sessionID, idx)
			}
			agNode := GraphNode{
				ID:     agID,
				Parent: lastNodeID,
				Type:   "agent",
				Text:   msg.Text,
				Ts:     nodeTs,
				Meta: map[string]any{
					"provider": msg.Provider,
					"model":    msg.Model,
				},
			}
			nodes = append(nodes, agNode)
			idCopy := agID
			lastNodeID = &idCopy
		}
	}

	return nodes
}
