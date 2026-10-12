package store

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// AppendEventNode appends a single atomic interaction event to ~/.aegis/chats/<sessionID>.jsonl in O(1) time.
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

	lineBytes, err := json.Marshal(node)
	if err != nil {
		return nil, fmt.Errorf("failed to encode graph node: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	jsonlPath := filepath.Join(s.chatsDir, cleanID+".jsonl")
	f, err := os.OpenFile(jsonlPath, os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
	if err != nil {
		return nil, fmt.Errorf("failed to open chat ledger %s: %w", cleanID, err)
	}

	if _, err := f.Write(append(lineBytes, '\n')); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("failed to append graph node: %w", err)
	}
	_ = f.Close()

	// Update sessions.json descriptor
	indexPath := filepath.Join(s.baseDir, "sessions.json")
	var idx SessionsIndex
	if data, err := os.ReadFile(indexPath); err == nil {
		_ = json.Unmarshal(data, &idx)
	}
	if idx.Sessions == nil {
		idx.Sessions = []SessionDescriptor{}
	}

	found := false
	for i := range idx.Sessions {
		if idx.Sessions[i].ID == cleanID {
			idx.Sessions[i].UpdatedAt = node.Ts
			idx.Sessions[i].ActiveLeafID = node.ID
			idx.Sessions[i].NodeCount++
			if idx.Sessions[i].RootNodeID == "" && node.Parent == nil {
				idx.Sessions[i].RootNodeID = node.ID
			}
			found = true
			break
		}
	}

	if !found {
		title := "New Session"
		if node.Type == "user" && node.Text != "" {
			t := strings.TrimSpace(node.Text)
			if len(t) > 30 {
				t = t[:30] + "..."
			}
			title = t
		}
		newDesc := SessionDescriptor{
			ID:           cleanID,
			Title:        title,
			Provider:     "antigravity",
			Model:        "gemini-3.8-flash",
			CreatedAt:    node.Ts,
			UpdatedAt:    node.Ts,
			RootNodeID:   node.ID,
			ActiveLeafID: node.ID,
			NodeCount:    1,
		}
		if node.Meta != nil {
			if p, ok := node.Meta["provider"].(string); ok && p != "" {
				newDesc.Provider = p
			}
			if m, ok := node.Meta["model"].(string); ok && m != "" {
				newDesc.Model = m
			}
		}
		idx.Sessions = append(idx.Sessions, newDesc)
	}

	idx.UpdatedAt = time.Now().UnixMilli()
	if out, mErr := json.MarshalIndent(&idx, "", "  "); mErr == nil {
		_ = atomicWrite(indexPath, out)
	}

	return &node, nil
}

// GetChatNodes reads event nodes from ~/.aegis/chats/<sessionID>.jsonl.
// If tail > 0, reads only the trailing `tail` nodes via reverse seek.
func (s *Store) GetChatNodes(sessionID string, tail int) ([]GraphNode, error) {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return nil, err
	}

	s.mu.RLock()
	defer s.mu.RUnlock()

	jsonlPath := filepath.Join(s.chatsDir, cleanID+".jsonl")
	f, err := os.Open(jsonlPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []GraphNode{}, nil
		}
		return nil, fmt.Errorf("failed to open chat ledger: %w", err)
	}
	defer f.Close()

	if tail > 0 {
		return ReverseSeekTail(f, tail)
	}

	var nodes []GraphNode
	scanner := bufio.NewScanner(f)
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 10*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var node GraphNode
		if err := json.Unmarshal([]byte(line), &node); err == nil {
			nodes = append(nodes, node)
		}
	}

	if nodes == nil {
		nodes = []GraphNode{}
	}
	return nodes, nil
}

// ReverseSeekTail reads up to `count` lines from the end of the file backwards.
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

	allNodes, err := s.GetChatNodes(cleanID, 0)
	if err != nil {
		return nil, err
	}

	if len(allNodes) == 0 {
		return nil, os.ErrNotExist
	}

	nodeMap := make(map[string]GraphNode, len(allNodes))
	for _, n := range allNodes {
		nodeMap[n.ID] = n
	}

	targetLeaf := leafID
	if targetLeaf == "" {
		// Use the last recorded node as active leaf
		targetLeaf = allNodes[len(allNodes)-1].ID
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

	title := "New Session"
	provider := "antigravity"
	model := "gemini-3.8-flash"
	createdAt := allNodes[0].Ts
	updatedAt := allNodes[len(allNodes)-1].Ts

	if idx, err := s.GetSessionsIndex(); err == nil {
		for _, desc := range idx.Sessions {
			if desc.ID == cleanID {
				if desc.Title != "" {
					title = desc.Title
				}
				if desc.Provider != "" {
					provider = desc.Provider
				}
				if desc.Model != "" {
					model = desc.Model
				}
				if desc.CreatedAt > 0 {
					createdAt = desc.CreatedAt
				}
				if desc.UpdatedAt > 0 {
					updatedAt = desc.UpdatedAt
				}
				break
			}
		}
	}

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
			currentAgentMsg.ToolCalls = append(currentAgentMsg.ToolCalls, ToolCallItem{
				ID:      n.ID,
				Name:    n.Tool,
				Summary: "Menjalankan " + n.Tool,
				Status:  "success",
				Args:    n.Args,
				Output:  output,
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
		ID:        cleanID,
		Title:     title,
		Provider:  provider,
		Model:     model,
		Messages:  messages,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}, nil
}
