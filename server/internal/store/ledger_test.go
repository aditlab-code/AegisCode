package store

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func setupTestStore(t *testing.T) (*Store, string) {
	tempDir, err := os.MkdirTemp("", "aegis-ledger-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	st, err := New(tempDir)
	if err != nil {
		os.RemoveAll(tempDir)
		t.Fatalf("failed to init store: %v", err)
	}

	return st, tempDir
}

func TestAppendEventNodeAndBlobOffload(t *testing.T) {
	st, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	sessionID := "ses-ledger-01"

	// 1. Append user node
	n1, err := st.AppendEventNode(sessionID, GraphNode{
		ID:   "n-1",
		Type: "user",
		Text: "Hello AegisCode",
		Meta: map[string]any{"provider": "antigravity", "model": "gemini-3.8-flash"},
	})
	if err != nil {
		t.Fatalf("failed to append n-1: %v", err)
	}
	if n1.ID != "n-1" {
		t.Errorf("expected ID 'n-1', got %s", n1.ID)
	}

	// 2. Append tool call node
	parent1 := "n-1"
	_, err = st.AppendEventNode(sessionID, GraphNode{
		ID:     "n-2",
		Parent: &parent1,
		Type:   "tool_call",
		Tool:   "run_command",
		Args:   map[string]any{"CommandLine": "cat large_log.txt"},
	})
	if err != nil {
		t.Fatalf("failed to append n-2: %v", err)
	}

	// 3. Append tool result with heavy payload (>4096 bytes)
	parent2 := "n-2"
	heavyOutput := strings.Repeat("AegisCode heavy log line with diagnostic trace data.\n", 120) // ~6,000 bytes
	if len(heavyOutput) <= 4096 {
		t.Fatalf("expected payload > 4096 bytes, got %d", len(heavyOutput))
	}

	n3, err := st.AppendEventNode(sessionID, GraphNode{
		ID:     "n-3",
		Parent: &parent2,
		Type:   "tool_result",
		Tool:   "run_command",
		Output: heavyOutput,
	})
	if err != nil {
		t.Fatalf("failed to append n-3: %v", err)
	}

	// Verify CAS blob offload
	if n3.BlobRef == "" {
		t.Fatalf("expected BlobRef to be populated for heavy output")
	}
	if len(n3.Preview) == 0 {
		t.Errorf("expected Preview to be populated")
	}
	if n3.Output != "" {
		t.Errorf("expected Output field to be emptied in graph node after blob offload")
	}

	// Retrieve blob content
	blobData, err := st.GetBlob(n3.BlobRef)
	if err != nil {
		t.Fatalf("failed to retrieve blob: %v", err)
	}
	if string(blobData) != heavyOutput {
		t.Errorf("retrieved blob content does not match original payload")
	}

	// 4. Verify nodes in ledger
	nodes, err := st.GetChatNodes(sessionID, 0)
	if err != nil {
		t.Fatalf("failed to read chat nodes: %v", err)
	}
	if len(nodes) != 3 {
		t.Fatalf("expected 3 nodes in ledger, got %d", len(nodes))
	}
}

func TestReverseSeekTail(t *testing.T) {
	st, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	sessionID := "ses-tail-test"

	var lastID *string
	for i := 1; i <= 25; i++ {
		nodeID := fmt.Sprintf("node-%d", i)
		n, err := st.AppendEventNode(sessionID, GraphNode{
			ID:     nodeID,
			Parent: lastID,
			Type:   "user",
			Text:   fmt.Sprintf("Message %d", i),
		})
		if err != nil {
			t.Fatalf("failed to append node %d: %v", i, err)
		}
		idCopy := n.ID
		lastID = &idCopy
	}

	// Read trailing 5 nodes
	tailNodes, err := st.GetChatNodes(sessionID, 5)
	if err != nil {
		t.Fatalf("failed to read tail nodes: %v", err)
	}
	if len(tailNodes) != 5 {
		t.Fatalf("expected 5 tail nodes, got %d", len(tailNodes))
	}

	if tailNodes[0].ID != "node-21" {
		t.Errorf("expected first tail node to be node-21, got %s", tailNodes[0].ID)
	}
	if tailNodes[4].ID != "node-25" {
		t.Errorf("expected last tail node to be node-25, got %s", tailNodes[4].ID)
	}
}

func TestReconstructChatAndBranching(t *testing.T) {
	st, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	sessionID := "ses-branch-test"

	// Root: n-1 (user)
	n1, _ := st.AppendEventNode(sessionID, GraphNode{
		ID:   "n-1",
		Type: "user",
		Text: "How do we implement CAS blobs?",
	})

	// Branch A: n-2 (thought) -> n-3 (agent response A)
	p1 := n1.ID
	n2, _ := st.AppendEventNode(sessionID, GraphNode{
		ID:      "n-2",
		Parent:  &p1,
		Type:    "thought",
		Content: "Thinking about SHA-256...",
	})

	p2 := n2.ID
	n3, _ := st.AppendEventNode(sessionID, GraphNode{
		ID:     "n-3",
		Parent: &p2,
		Type:   "agent",
		Text:   "Response A: Use sha256.New()",
	})

	// Branch B (alternative retry turn branching from n-1)
	n4, _ := st.AppendEventNode(sessionID, GraphNode{
		ID:     "n-4",
		Parent: &p1,
		Type:   "agent",
		Text:   "Response B: Use content-addressed storage in ~/.aegis/blobs",
	})

	// 1. Reconstruct Branch A (leaf n-3)
	chatA, err := st.ReconstructChat(sessionID, n3.ID)
	if err != nil {
		t.Fatalf("failed to reconstruct Branch A: %v", err)
	}
	if len(chatA.Messages) != 2 {
		t.Fatalf("expected 2 messages in Branch A, got %d", len(chatA.Messages))
	}
	if chatA.Messages[1].Text != "Response A: Use sha256.New()" {
		t.Errorf("expected Response A, got %q", chatA.Messages[1].Text)
	}
	if chatA.Messages[1].Thinking != "Thinking about SHA-256..." {
		t.Errorf("expected thinking trace in Branch A")
	}

	// 2. Reconstruct Branch B (leaf n-4)
	chatB, err := st.ReconstructChat(sessionID, n4.ID)
	if err != nil {
		t.Fatalf("failed to reconstruct Branch B: %v", err)
	}
	if len(chatB.Messages) != 2 {
		t.Fatalf("expected 2 messages in Branch B, got %d", len(chatB.Messages))
	}
	if chatB.Messages[1].Text != "Response B: Use content-addressed storage in ~/.aegis/blobs" {
		t.Errorf("expected Response B, got %q", chatB.Messages[1].Text)
	}
}

func TestDeleteSessionAndBlobs(t *testing.T) {
	st, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	sessionID := "ses-delete-test"

	heavy := strings.Repeat("Some large data to trigger CAS blob creation\n", 150)
	node, err := st.AppendEventNode(sessionID, GraphNode{
		ID:     "n-heavy",
		Type:   "tool_result",
		Tool:   "view_file",
		Output: heavy,
	})
	if err != nil {
		t.Fatalf("failed to append heavy node: %v", err)
	}
	blobHash := node.BlobRef

	// Verify blob exists
	if _, err := st.GetBlob(blobHash); err != nil {
		t.Fatalf("expected blob to exist before delete: %v", err)
	}

	// Delete session
	if err := st.DeleteChat(sessionID); err != nil {
		t.Fatalf("failed to delete chat: %v", err)
	}

	// Verify session is deleted
	_, err = st.GetChat(sessionID)
	if err == nil {
		t.Errorf("expected error getting deleted chat")
	}

	// Verify blob was purged
	_, err = st.GetBlob(blobHash)
	if err == nil {
		t.Errorf("expected blob to be deleted when session was deleted")
	}
}

func TestReconcileSessionsOnBoot(t *testing.T) {
	st, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	// Simulate an unindexed .jsonl file created externally or during a crash
	orphanID := "ses-unindexed"
	_ = os.MkdirAll(st.chatsDir, 0755)
	orphanPath := filepath.Join(st.chatsDir, orphanID+".jsonl")

	line1 := `{"id":"n-1","type":"user","text":"Unindexed session prompt","ts":1773000000,"meta":{"provider":"claude","model":"claude-3-7-sonnet"}}` + "\n"
	line2 := `{"id":"n-2","parent":"n-1","type":"agent","text":"Unindexed session answer","ts":1773000005}` + "\n"

	if err := os.WriteFile(orphanPath, []byte(line1+line2), 0644); err != nil {
		t.Fatalf("failed to write orphan .jsonl: %v", err)
	}

	// Run reconciliation
	if err := st.ReconcileSessionsOnBoot(); err != nil {
		t.Fatalf("reconciliation failed: %v", err)
	}

	idx, err := st.GetSessionsIndex()
	if err != nil {
		t.Fatalf("failed to get sessions index: %v", err)
	}

	found := false
	for _, sess := range idx.Sessions {
		if sess.ID == orphanID {
			found = true
			if sess.Title != "Unindexed session prompt" {
				t.Errorf("expected title 'Unindexed session prompt', got %q", sess.Title)
			}
			if sess.NodeCount != 2 {
				t.Errorf("expected nodeCount 2, got %d", sess.NodeCount)
			}
			if sess.ActiveLeafID != "n-2" {
				t.Errorf("expected ActiveLeafID 'n-2', got %q", sess.ActiveLeafID)
			}
			break
		}
	}

	if !found {
		t.Errorf("expected orphan session to be discovered and indexed in sessions.json")
	}
}
