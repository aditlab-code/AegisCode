package store

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// GetSessionsIndex reads ~/.aegis/sessions.json or returns a fresh index if it doesn't exist.
func (s *Store) GetSessionsIndex() (*SessionsIndex, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	indexPath := filepath.Join(s.baseDir, "sessions.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		if os.IsNotExist(err) {
			return &SessionsIndex{
				Version:   2,
				UpdatedAt: time.Now().UnixMilli(),
				Sessions:  []SessionDescriptor{},
			}, nil
		}
		return nil, fmt.Errorf("failed to read sessions index: %w", err)
	}

	var idx SessionsIndex
	if err := json.Unmarshal(data, &idx); err != nil {
		return nil, fmt.Errorf("failed to parse sessions index: %w", err)
	}

	if idx.Sessions == nil {
		idx.Sessions = []SessionDescriptor{}
	}

	return &idx, nil
}

// SaveSessionsIndex atomically writes ~/.aegis/sessions.json.
func (s *Store) SaveSessionsIndex(idx *SessionsIndex) error {
	if idx == nil {
		return fmt.Errorf("cannot save nil sessions index")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	idx.UpdatedAt = time.Now().UnixMilli()
	if idx.Sessions == nil {
		idx.Sessions = []SessionDescriptor{}
	}

	data, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize sessions index: %w", err)
	}

	indexPath := filepath.Join(s.baseDir, "sessions.json")
	return atomicWrite(indexPath, data)
}

// UpdateSessionDescriptor updates an existing session entry or inserts a new one in ~/.aegis/sessions.json.
func (s *Store) UpdateSessionDescriptor(desc SessionDescriptor) error {
	cleanID, err := sanitizeID(desc.ID)
	if err != nil {
		return err
	}
	desc.ID = cleanID

	s.mu.Lock()
	defer s.mu.Unlock()

	indexPath := filepath.Join(s.baseDir, "sessions.json")
	idx := &SessionsIndex{
		Version:   2,
		UpdatedAt: time.Now().UnixMilli(),
		Sessions:  []SessionDescriptor{},
	}

	if data, err := os.ReadFile(indexPath); err == nil {
		_ = json.Unmarshal(data, idx)
	}

	found := false
	for i, existing := range idx.Sessions {
		if existing.ID == desc.ID {
			if desc.CreatedAt == 0 {
				desc.CreatedAt = existing.CreatedAt
			}
			if desc.Title == "" {
				desc.Title = existing.Title
			}
			if desc.Provider == "" {
				desc.Provider = existing.Provider
			}
			if desc.Model == "" {
				desc.Model = existing.Model
			}
			if desc.RootNodeID == "" {
				desc.RootNodeID = existing.RootNodeID
			}
			if desc.NodeCount == 0 && existing.NodeCount > 0 {
				desc.NodeCount = existing.NodeCount
			}
			idx.Sessions[i] = desc
			found = true
			break
		}
	}

	if !found {
		if desc.CreatedAt == 0 {
			desc.CreatedAt = time.Now().UnixMilli()
		}
		if desc.UpdatedAt == 0 {
			desc.UpdatedAt = time.Now().UnixMilli()
		}
		idx.Sessions = append(idx.Sessions, desc)
	}

	idx.UpdatedAt = time.Now().UnixMilli()

	// Sort sessions by UpdatedAt desc
	sort.Slice(idx.Sessions, func(i, j int) bool {
		return idx.Sessions[i].UpdatedAt > idx.Sessions[j].UpdatedAt
	})

	data, err := json.MarshalIndent(idx, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to serialize sessions index: %w", err)
	}

	return atomicWrite(indexPath, data)
}

// RemoveSessionDescriptor removes a session entry from ~/.aegis/sessions.json.
func (s *Store) RemoveSessionDescriptor(sessionID string) error {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	indexPath := filepath.Join(s.baseDir, "sessions.json")
	data, err := os.ReadFile(indexPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var idx SessionsIndex
	if err := json.Unmarshal(data, &idx); err != nil {
		return err
	}

	var filtered []SessionDescriptor
	for _, sess := range idx.Sessions {
		if sess.ID != cleanID {
			filtered = append(filtered, sess)
		}
	}

	idx.Sessions = filtered
	idx.UpdatedAt = time.Now().UnixMilli()

	out, err := json.MarshalIndent(&idx, "", "  ")
	if err != nil {
		return err
	}

	return atomicWrite(indexPath, out)
}

// ReconcileSessionsOnBoot scans for .jsonl ledger files that are missing from sessions.json or have newer modifications.
func (s *Store) ReconcileSessionsOnBoot() error {
	entries, err := os.ReadDir(s.chatsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	idx, err := s.GetSessionsIndex()
	if err != nil {
		idx = &SessionsIndex{
			Version:   2,
			UpdatedAt: time.Now().UnixMilli(),
			Sessions:  []SessionDescriptor{},
		}
	}

	sessionMap := make(map[string]*SessionDescriptor)
	for i := range idx.Sessions {
		sessionMap[idx.Sessions[i].ID] = &idx.Sessions[i]
	}

	dirty := false

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		sessionID := strings.TrimSuffix(entry.Name(), ".jsonl")
		filePath := filepath.Join(s.chatsDir, entry.Name())
		fi, err := entry.Info()
		if err != nil {
			continue
		}

		desc, exists := sessionMap[sessionID]
		// If missing or if file mod time is newer than recorded index
		if !exists || (fi.ModTime().UnixMilli() > desc.UpdatedAt) {
			firstNode, lastNode, count, err := readFirstAndLastNodes(filePath)
			if err != nil || firstNode == nil {
				continue
			}

			title := "New Session"
			if firstNode.Text != "" {
				title = strings.TrimSpace(firstNode.Text)
				if len(title) > 30 {
					title = title[:30] + "..."
				}
			}

			activeLeaf := firstNode.ID
			lastTs := fi.ModTime().UnixMilli()
			if lastNode != nil {
				activeLeaf = lastNode.ID
				if lastNode.Ts > 0 {
					lastTs = lastNode.Ts
				}
			}

			provider := "antigravity"
			model := "gemini-3.8-flash"
			if firstNode.Meta != nil {
				if p, ok := firstNode.Meta["provider"].(string); ok && p != "" {
					provider = p
				}
				if m, ok := firstNode.Meta["model"].(string); ok && m != "" {
					model = m
				}
			}

			newDesc := SessionDescriptor{
				ID:           sessionID,
				Title:        title,
				Provider:     provider,
				Model:        model,
				CreatedAt:    firstNode.Ts,
				UpdatedAt:    lastTs,
				RootNodeID:   firstNode.ID,
				ActiveLeafID: activeLeaf,
				NodeCount:    count,
			}

			if exists {
				*desc = newDesc
			} else {
				idx.Sessions = append(idx.Sessions, newDesc)
				sessionMap[sessionID] = &newDesc
			}
			dirty = true
		}
	}

	if dirty {
		sort.Slice(idx.Sessions, func(i, j int) bool {
			return idx.Sessions[i].UpdatedAt > idx.Sessions[j].UpdatedAt
		})
		return s.SaveSessionsIndex(idx)
	}

	return nil
}

// readFirstAndLastNodes quickly inspects the first node and trailing node in a .jsonl file.
func readFirstAndLastNodes(filePath string) (*GraphNode, *GraphNode, int, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, nil, 0, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var first *GraphNode
	var last *GraphNode
	count := 0

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var node GraphNode
		if err := json.Unmarshal([]byte(line), &node); err != nil {
			continue
		}
		count++
		if first == nil {
			first = &node
		}
		last = &node
	}

	return first, last, count, nil
}

// MigrateLegacyJSONChats performs non-destructive shadow migration from legacy chats/*.json to .jsonl and sessions.json.
func (s *Store) MigrateLegacyJSONChats() error {
	entries, err := os.ReadDir(s.chatsDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		sessionID := strings.TrimSuffix(entry.Name(), ".json")
		jsonlPath := filepath.Join(s.chatsDir, sessionID+".jsonl")
		if _, err := os.Stat(jsonlPath); err == nil {
			// Already migrated to .jsonl
			continue
		}

		jsonPath := filepath.Join(s.chatsDir, entry.Name())
		data, err := os.ReadFile(jsonPath)
		if err != nil {
			continue
		}

		var legacy ChatSession
		if err := json.Unmarshal(data, &legacy); err != nil {
			continue
		}

		// Convert linear messages to sequential graph nodes
		nodes := ConvertMessagesToGraphNodes(legacy.ID, legacy.Provider, legacy.Model, legacy.Messages)
		if len(nodes) == 0 {
			continue
		}

		// Write to .jsonl
		f, err := os.OpenFile(jsonlPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0644)
		if err != nil {
			continue
		}

		writer := bufio.NewWriter(f)
		for _, node := range nodes {
			line, mErr := json.Marshal(node)
			if mErr == nil {
				_, _ = writer.Write(line)
				_, _ = writer.WriteString("\n")
			}
		}
		_ = writer.Flush()
		_ = f.Close()

		// Update sessions.json
		rootID := nodes[0].ID
		leafID := nodes[len(nodes)-1].ID
		_ = s.UpdateSessionDescriptor(SessionDescriptor{
			ID:           legacy.ID,
			Title:        legacy.Title,
			Provider:     legacy.Provider,
			Model:        legacy.Model,
			CreatedAt:    legacy.CreatedAt,
			UpdatedAt:    legacy.UpdatedAt,
			RootNodeID:   rootID,
			ActiveLeafID: leafID,
			NodeCount:    len(nodes),
		})
	}

	return nil
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
			if strings.TrimSpace(msg.Thinking) != "" {
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
