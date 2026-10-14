package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"time"
)

// AppendEventNode appends a single atomic interaction event into SQLite chat_events and updates chat_sessions.
func (s *Store) AppendEventNode(sessionID string, node GraphNode) (*GraphNode, error) {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return nil, err
	}

	if node.ID == "" {
		node.ID = fmt.Sprintf("n-%d", time.Now().UnixNano())
	}
	if node.Ts == 0 {
		node.Ts = time.Now().UnixMilli()
	}

	// Offload heavy tool output to CAS blob if > 4096 bytes
	if len(node.Output) > 4096 {
		hash, bErr := s.SaveBlob(cleanID, []byte(node.Output))
		if bErr == nil {
			node.BlobRef = hash
			previewRunes := []rune(node.Output)
			if len(previewRunes) > 200 {
				node.Preview = string(previewRunes[:200]) + "..."
			} else {
				node.Preview = node.Output
			}
			node.Output = "" // payload is offloaded to blob
		}
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

	provider := "antigravity"
	model := "gemini-3.8-flash"
	if node.Meta != nil {
		if p, ok := node.Meta["provider"].(string); ok && p != "" {
			provider = p
		}
		if m, ok := node.Meta["model"].(string); ok && m != "" {
			model = m
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	wsPath := ""
	if node.Meta != nil {
		if w, ok := node.Meta["workspacePath"].(string); ok && w != "" {
			wsPath = w
		}
	}

	// 1. Ensure master chat_sessions record exists first (to satisfy FOREIGN KEY constraint)
	var existingRoot string
	qErr := tx.QueryRow(`SELECT coalesce(root_node_id, '') FROM chat_sessions WHERE id = ?`, cleanID).Scan(&existingRoot)
	if errors.Is(qErr, sql.ErrNoRows) {
		title := "New Session"
		if node.Type == "user" && node.Text != "" {
			t := strings.TrimSpace(node.Text)
			if len(t) > 30 {
				t = t[:30] + "..."
			}
			title = t
		}
		_, err = tx.Exec(`
			INSERT INTO chat_sessions (
				id, title, provider, model, workspace_path, root_node_id, active_leaf_id, node_count, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
		`, cleanID, title, provider, model, wsPath, node.ID, node.ID, node.Ts, node.Ts)
		if err != nil {
			return nil, fmt.Errorf("failed to insert chat session: %w", err)
		}
	} else if qErr == nil {
		var newRoot *string
		if existingRoot == "" && node.Parent == nil {
			nodeIDCopy := node.ID
			newRoot = &nodeIDCopy
		}
		_, err = tx.Exec(`
			UPDATE chat_sessions
			SET updated_at = ?, active_leaf_id = ?, node_count = node_count + 1,
			    root_node_id = CASE WHEN ? IS NOT NULL THEN ? ELSE root_node_id END,
			    workspace_path = CASE WHEN workspace_path = '' AND ? != '' THEN ? ELSE workspace_path END
			WHERE id = ?
		`, node.Ts, node.ID, newRoot, newRoot, wsPath, wsPath, cleanID)
		if err != nil {
			return nil, fmt.Errorf("failed to update chat session: %w", err)
		}
	} else {
		return nil, fmt.Errorf("failed to query chat session: %w", qErr)
	}

	// 2. Now insert into chat_events with FOREIGN KEY satisfied
	var parentID *string
	if node.Parent != nil && *node.Parent != "" {
		parentID = node.Parent
	}

	_, err = tx.Exec(`
		INSERT INTO chat_events (
			id, session_id, parent_id, type, role, text, content, reasoning,
			tool_name, tool_args_json, tool_output, blob_ref, preview,
			provider, model, meta_json, created_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`,
		node.ID, cleanID, parentID, node.Type, role, node.Text, node.Content, reasoning,
		node.Tool, argsJSON, node.Output, node.BlobRef, node.Preview,
		provider, model, metaJSON, node.Ts,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to insert chat event: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit event node transaction: %w", err)
	}

	return &node, nil
}

// GetChatNodes reads event nodes from SQLite chat_events for sessionID.
// If tail > 0, returns only the trailing `tail` nodes in chronological order.
func (s *Store) GetChatNodes(sessionID string, tail int) ([]GraphNode, error) {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	var rows *sql.Rows
	if tail > 0 {
		rows, err = s.db.Query(`
			SELECT id, parent_id, type, text, content, tool_name, tool_args_json,
			       tool_output, blob_ref, preview, meta_json, created_at
			FROM chat_events
			WHERE session_id = ?
			ORDER BY created_at DESC
			LIMIT ?
		`, cleanID, tail)
	} else {
		rows, err = s.db.Query(`
			SELECT id, parent_id, type, text, content, tool_name, tool_args_json,
			       tool_output, blob_ref, preview, meta_json, created_at
			FROM chat_events
			WHERE session_id = ?
			ORDER BY created_at ASC
		`, cleanID)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to query chat nodes: %w", err)
	}
	defer rows.Close()

	var nodes []GraphNode
	for rows.Next() {
		var n GraphNode
		var parentID sql.NullString
		var argsJSON, metaJSON string
		if err := rows.Scan(
			&n.ID, &parentID, &n.Type, &n.Text, &n.Content, &n.Tool,
			&argsJSON, &n.Output, &n.BlobRef, &n.Preview, &metaJSON, &n.Ts,
		); err != nil {
			return nil, fmt.Errorf("failed to scan chat node: %w", err)
		}
		if parentID.Valid && parentID.String != "" {
			val := parentID.String
			n.Parent = &val
		}
		if argsJSON != "" && argsJSON != "{}" {
			_ = json.Unmarshal([]byte(argsJSON), &n.Args)
		}
		if metaJSON != "" && metaJSON != "{}" {
			_ = json.Unmarshal([]byte(metaJSON), &n.Meta)
		}
		nodes = append(nodes, n)
	}

	// Reverse if tail > 0 because query was ordered by created_at DESC
	if tail > 0 && len(nodes) > 1 {
		for i, j := 0, len(nodes)-1; i < j; i, j = i+1, j-1 {
			nodes[i], nodes[j] = nodes[j], nodes[i]
		}
	}

	if nodes == nil {
		nodes = []GraphNode{}
	}
	return nodes, nil
}

// ReverseSeekTail reads up to `count` lines from the end of the file backwards.
// Maintained for backward compatibility with existing tests.
func ReverseSeekTail(f *os.File, count int) ([]GraphNode, error) {
	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}

	fileSize := stat.Size()
	if fileSize == 0 {
		return []GraphNode{}, nil
	}

	var rawLines []string
	var buffer []byte
	chunkSize := int64(4096)
	cursor := fileSize
	leftover := ""

	for cursor > 0 && len(rawLines) < count {
		toRead := chunkSize
		if cursor < toRead {
			toRead = cursor
		}
		cursor -= toRead

		_, err := f.Seek(cursor, io.SeekStart)
		if err != nil {
			return nil, err
		}

		buf := make([]byte, toRead)
		if _, err := io.ReadFull(f, buf); err != nil {
			return nil, err
		}

		buffer = append(buf, buffer...)
		combined := string(buf) + leftover
		lines := strings.Split(combined, "\n")

		if cursor > 0 {
			leftover = lines[0]
			lines = lines[1:]
		} else {
			leftover = ""
		}

		for i := len(lines) - 1; i >= 0; i-- {
			line := strings.TrimSpace(lines[i])
			if line != "" {
				rawLines = append([]string{line}, rawLines...)
				if len(rawLines) >= count {
					break
				}
			}
		}
	}

	if leftover != "" && len(rawLines) < count {
		trimmed := strings.TrimSpace(leftover)
		if trimmed != "" {
			rawLines = append([]string{trimmed}, rawLines...)
		}
	}

	var nodes []GraphNode
	for _, l := range rawLines {
		var node GraphNode
		if err := json.Unmarshal([]byte(l), &node); err == nil {
			nodes = append(nodes, node)
		}
	}

	if nodes == nil {
		nodes = []GraphNode{}
	}
	return nodes, nil
}

// ReconstructChat builds a linear ChatSession from the graph ledger by traversing backwards from leaf to root.
func (s *Store) ReconstructChat(sessionID string, leafID string) (*ChatSession, error) {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return nil, err
	}

	s.mu.RLock()
	var title, provider, model, workspacePath, conversationID string
	var createdAt, updatedAt int64
	var activeLeafID string
	err = s.db.QueryRow(`
		SELECT title, provider, model, coalesce(active_leaf_id, ''), coalesce(workspace_path, ''), coalesce(conversation_id, ''), created_at, updated_at
		FROM chat_sessions
		WHERE id = ?
	`, cleanID).Scan(&title, &provider, &model, &activeLeafID, &workspacePath, &conversationID, &createdAt, &updatedAt)
	s.mu.RUnlock()

	if errors.Is(err, sql.ErrNoRows) {
		return nil, os.ErrNotExist
	} else if err != nil {
		return nil, fmt.Errorf("failed to query session: %w", err)
	}

	allNodes, err := s.GetChatNodes(cleanID, 0)
	if err != nil {
		return nil, err
	}

	if len(allNodes) == 0 {
		return &ChatSession{
			ID:             cleanID,
			Title:          title,
			Provider:       provider,
			Model:          model,
			WorkspacePath:  workspacePath,
			ConversationID: conversationID,
			Messages:       []ChatMessage{},
			CreatedAt:      createdAt,
			UpdatedAt:      updatedAt,
		}, nil
	}

	nodeMap := make(map[string]GraphNode, len(allNodes))
	for _, n := range allNodes {
		nodeMap[n.ID] = n
	}

	targetLeaf := leafID
	if targetLeaf == "" {
		if activeLeafID != "" && nodeMap[activeLeafID].ID != "" {
			targetLeaf = activeLeafID
		} else {
			targetLeaf = allNodes[len(allNodes)-1].ID
		}
	}

	// Backtracking traversal from targetLeaf -> root
	var path []GraphNode
	currID := targetLeaf
	visited := make(map[string]bool)

	for currID != "" && !visited[currID] {
		visited[currID] = true
		node, ok := nodeMap[currID]
		if !ok {
			break
		}
		path = append([]GraphNode{node}, path...) // prepend
		if node.Parent == nil || *node.Parent == "" {
			break
		}
		currID = *node.Parent
	}

	// Linearize path into ChatMessage slice
	var messages []ChatMessage
	var currentAgentMsg *ChatMessage

	for _, n := range path {
		switch n.Type {
		case "user":
			if currentAgentMsg != nil {
				messages = append(messages, *currentAgentMsg)
				currentAgentMsg = nil
			}
			if title == "New Session" && n.Text != "" {
				t := strings.TrimSpace(n.Text)
				if len(t) > 30 {
					t = t[:30] + "..."
				}
				title = t
			}
			if n.Meta != nil {
				if p, ok := n.Meta["provider"].(string); ok && p != "" {
					provider = p
				}
				if m, ok := n.Meta["model"].(string); ok && m != "" {
					model = m
				}
			}
			messages = append(messages, ChatMessage{
				ID:        n.ID,
				Role:      "user",
				Text:      n.Text,
				Timestamp: n.Ts,
			})

		case "thought":
			if currentAgentMsg == nil {
				currentAgentMsg = &ChatMessage{
					ID:        n.ID,
					Role:      "agent",
					Timestamp: n.Ts,
					Provider:  provider,
					Model:     model,
				}
			}
			currentAgentMsg.Thinking = n.Content

		case "tool_call":
			if currentAgentMsg == nil {
				currentAgentMsg = &ChatMessage{
					ID:        n.ID,
					Role:      "agent",
					Timestamp: n.Ts,
					Provider:  provider,
					Model:     model,
				}
			}
			output := n.Output
			if output == "" && n.Preview != "" {
				output = n.Preview
			}
			tcID := n.ID
			summary := "Menjalankan " + n.Tool
			status := "success"
			targetFile := ""
			if n.Meta != nil {
				if orig, ok := n.Meta["origId"].(string); ok && orig != "" {
					tcID = orig
				}
				if sum, ok := n.Meta["summary"].(string); ok && sum != "" {
					summary = sum
				}
				if st, ok := n.Meta["status"].(string); ok && st != "" {
					status = st
				}
				if tf, ok := n.Meta["targetFile"].(string); ok && tf != "" {
					targetFile = tf
				}
			}
			currentAgentMsg.ToolCalls = append(currentAgentMsg.ToolCalls, ToolCallItem{
				ID:         tcID,
				Name:       n.Tool,
				Summary:    summary,
				Status:     status,
				TargetFile: targetFile,
				Args:       n.Args,
				Output:     output,
				BlobRef:    n.BlobRef,
				Preview:    n.Preview,
			})

		case "tool_result":
			if currentAgentMsg != nil && len(currentAgentMsg.ToolCalls) > 0 {
				lastIdx := len(currentAgentMsg.ToolCalls) - 1
				out := n.Output
				if out == "" && n.Preview != "" {
					out = n.Preview
				}
				currentAgentMsg.ToolCalls[lastIdx].Output = out
			}

		case "agent":
			if currentAgentMsg == nil {
				currentAgentMsg = &ChatMessage{
					ID:        n.ID,
					Role:      "agent",
					Timestamp: n.Ts,
					Provider:  provider,
					Model:     model,
				}
			}
			currentAgentMsg.Text = n.Text
			if n.Meta != nil {
				if p, ok := n.Meta["provider"].(string); ok && p != "" {
					currentAgentMsg.Provider = p
				}
				if m, ok := n.Meta["model"].(string); ok && m != "" {
					currentAgentMsg.Model = m
				}
				if errStr, ok := n.Meta["error"].(string); ok && errStr != "" {
					currentAgentMsg.Error = errStr
				}
			}
			messages = append(messages, *currentAgentMsg)
			currentAgentMsg = nil
		}
	}

	if currentAgentMsg != nil {
		messages = append(messages, *currentAgentMsg)
	}

	if messages == nil {
		messages = []ChatMessage{}
	}

	return &ChatSession{
		ID:             cleanID,
		Title:          title,
		Provider:       provider,
		Model:          model,
		WorkspacePath:  workspacePath,
		ConversationID: conversationID,
		Messages:       messages,
		CreatedAt:      createdAt,
		UpdatedAt:      updatedAt,
	}, nil
}
