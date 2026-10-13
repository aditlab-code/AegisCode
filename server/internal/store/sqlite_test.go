package store

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestSQLiteFTS5Search(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer st.Close()

	session1 := "ses-fts-go"
	session2 := "ses-fts-react"

	// Session 1: Go discussion
	_, err = st.AppendEventNode(session1, GraphNode{
		ID:   "n-g1",
		Type: "user",
		Text: "How do we build a high performance compiler in Golang?",
	})
	if err != nil {
		t.Fatalf("failed to append n-g1: %v", err)
	}

	pG1 := "n-g1"
	_, err = st.AppendEventNode(session1, GraphNode{
		ID:      "n-g2",
		Parent:  &pG1,
		Type:    "thought",
		Content: "Analyzing Go compiler architecture, AST construction, and SSA optimizations...",
	})
	if err != nil {
		t.Fatalf("failed to append n-g2: %v", err)
	}

	pG2 := "n-g2"
	_, err = st.AppendEventNode(session1, GraphNode{
		ID:     "n-g3",
		Parent: &pG2,
		Type:   "agent",
		Text:   "To build a fast compiler in Go, leverage AST parser, SSA generation, and escape analysis.",
	})
	if err != nil {
		t.Fatalf("failed to append n-g3: %v", err)
	}

	// Session 2: React discussion
	_, err = st.AppendEventNode(session2, GraphNode{
		ID:   "n-r1",
		Type: "user",
		Text: "Explain React 19 concurrent mode and fiber reconciliation algorithm.",
	})
	if err != nil {
		t.Fatalf("failed to append n-r1: %v", err)
	}

	pR1 := "n-r1"
	_, err = st.AppendEventNode(session2, GraphNode{
		ID:     "n-r2",
		Parent: &pR1,
		Type:   "agent",
		Text:   "React 19 fiber reconciliation uses cooperative multitasking and time slicing for smooth rendering.",
	})
	if err != nil {
		t.Fatalf("failed to append n-r2: %v", err)
	}

	// 1. Search for Go compiler
	results, err := st.SearchChats("compiler", 10)
	if err != nil {
		t.Fatalf("search failed: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("expected matches for 'compiler', got 0")
	}

	foundGo := false
	for _, res := range results {
		if res.SessionID == session1 {
			foundGo = true
			if res.Snippet == "" {
				t.Errorf("expected snippet text with highlighting, got empty")
			}
		}
	}
	if !foundGo {
		t.Errorf("expected to find session1 in compiler search results")
	}

	// 2. Search for SSA in reasoning / thought
	resultsSSA, err := st.SearchChats("SSA", 10)
	if err != nil {
		t.Fatalf("search for SSA failed: %v", err)
	}
	if len(resultsSSA) == 0 {
		t.Fatalf("expected FTS match in thought reasoning for 'SSA'")
	}

	// 3. Search for React fiber
	resultsReact, err := st.SearchChats("reconciliation", 10)
	if err != nil {
		t.Fatalf("search for reconciliation failed: %v", err)
	}
	if len(resultsReact) == 0 {
		t.Fatalf("expected match for 'reconciliation'")
	}
	if resultsReact[0].SessionID != session2 {
		t.Errorf("expected session2, got %s", resultsReact[0].SessionID)
	}

	// 4. Test punctuation safety (no FTS syntax errors)
	resultsPunct, err := st.SearchChats("compiler: (Go)* && AST?", 10)
	if err != nil {
		t.Fatalf("search with punctuation should not error: %v", err)
	}
	if len(resultsPunct) == 0 {
		t.Errorf("expected search with punctuation to sanitize and find matches")
	}

	// 5. Empty query returns empty results
	emptyRes, err := st.SearchChats("", 10)
	if err != nil || len(emptyRes) != 0 {
		t.Errorf("expected empty results for empty query")
	}
}

func TestSQLiteHighConcurrency(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}
	defer st.Close()

	const workers = 20
	const iterations = 15

	var wg sync.WaitGroup
	wg.Add(workers)

	errCh := make(chan error, workers*iterations)

	for i := 0; i < workers; i++ {
		workerID := i
		go func() {
			defer wg.Done()
			sessionID := fmt.Sprintf("concur-ses-%d", workerID)

			for j := 0; j < iterations; j++ {
				// Reader operation
				if workerID%2 == 0 {
					_, _ = st.GetConfig()
					_, _ = st.GetState()
					_, _ = st.ListChats()
					_, _ = st.SearchChats("concurrent", 5)
				}

				// Writer operation
				_, wErr := st.AppendEventNode(sessionID, GraphNode{
					ID:   fmt.Sprintf("n-%d-%d", workerID, j),
					Type: "user",
					Text: fmt.Sprintf("Concurrent prompt from worker %d turn %d", workerID, j),
					Ts:   time.Now().UnixMilli(),
				})
				if wErr != nil {
					errCh <- fmt.Errorf("worker %d append error: %w", workerID, wErr)
					return
				}

				if j%5 == 0 {
					_ = st.AddRecentProject(fmt.Sprintf("/workspace/project-%d", workerID))
				}
			}
		}()
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Errorf("concurrency error encountered: %v", err)
	}

	// Verify all sessions were recorded
	list, err := st.ListChats()
	if err != nil {
		t.Fatalf("failed to list chats: %v", err)
	}
	if len(list) != workers {
		t.Errorf("expected %d sessions, got %d", workers, len(list))
	}
}

func TestSQLiteShadowMigrationE2E(t *testing.T) {
	tempDir := t.TempDir()

	// 1. Prepare legacy flat-files
	cfgData := `{"theme":"dark","defaultProvider":"antigravity","defaultModel":"gemini-3.8-flash","updatedAt":1773000000}`
	_ = os.WriteFile(filepath.Join(tempDir, "config.json"), []byte(cfgData), 0644)

	stateData := `{"recentProjects":["/legacy/project-a","/legacy/project-b"],"activeSessionId":"ses-legacy-1","updatedAt":1773000001}`
	_ = os.WriteFile(filepath.Join(tempDir, "state.json"), []byte(stateData), 0644)

	indexData := `{"version":2,"updatedAt":1773000002,"sessions":[{"id":"ses-legacy-1","title":"Legacy Session","provider":"antigravity","model":"gemini-3.8-flash","nodeCount":1,"createdAt":1773000000,"updatedAt":1773000002}]}`
	_ = os.WriteFile(filepath.Join(tempDir, "sessions.json"), []byte(indexData), 0644)

	chatsDir := filepath.Join(tempDir, "chats")
	_ = os.MkdirAll(chatsDir, 0755)
	jsonlContent := `{"id":"n-leg-1","type":"user","text":"Migrate this flat file to SQLite","ts":1773000000}` + "\n"
	_ = os.WriteFile(filepath.Join(chatsDir, "ses-legacy-1.jsonl"), []byte(jsonlContent), 0644)

	blobsDir := filepath.Join(tempDir, "blobs")
	_ = os.MkdirAll(blobsDir, 0755)
	_ = os.WriteFile(filepath.Join(blobsDir, "ses-legacy-1_deadbeef.raw"), []byte("large legacy output blob"), 0644)

	// 2. Boot store (triggers shadow migration)
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}
	defer st.Close()

	// 3. Verify SQLite has ingested the data
	cfg, err := st.GetConfig()
	if err != nil || cfg.Theme != "dark" {
		t.Errorf("expected migrated theme 'dark', got %v (err: %v)", cfg.Theme, err)
	}

	stState, err := st.GetState()
	if err != nil || len(stState.RecentProjects) != 2 || stState.RecentProjects[0] != "/legacy/project-a" {
		t.Errorf("expected migrated recent projects, got %v", stState.RecentProjects)
	}

	sess, err := st.GetChat("ses-legacy-1")
	if err != nil {
		t.Fatalf("failed to retrieve migrated chat: %v", err)
	}
	if len(sess.Messages) != 1 || sess.Messages[0].Text != "Migrate this flat file to SQLite" {
		t.Errorf("unexpected migrated messages: %+v", sess.Messages)
	}

	blobData, err := st.GetBlob("deadbeef")
	if err != nil || string(blobData) != "large legacy output blob" {
		t.Errorf("expected blob data 'large legacy output blob', got %s (%v)", string(blobData), err)
	}

	// 4. Verify backup folder was populated and marked
	backupDir := filepath.Join(tempDir, "legacy_backup")
	if fi, err := os.Stat(backupDir); err != nil || !fi.IsDir() {
		t.Errorf("expected legacy_backup directory to exist")
	}

	markerFile := filepath.Join(backupDir, ".migrated_at")
	if _, err := os.Stat(markerFile); err != nil {
		t.Errorf("expected .migrated_at timestamp marker")
	}
}

func TestSQLiteCASBlobIsolation(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}
	defer st.Close()

	payload := []byte("shared identical tool output payload across multiple sessions")

	// Session 1 saves payload
	hash1, err := st.SaveBlob("ses-blob-1", payload)
	if err != nil {
		t.Fatalf("failed to save blob for ses-blob-1: %v", err)
	}

	// Session 2 saves same payload
	hash2, err := st.SaveBlob("ses-blob-2", payload)
	if err != nil {
		t.Fatalf("failed to save blob for ses-blob-2: %v", err)
	}

	if hash1 != hash2 {
		t.Fatalf("expected identical hash, got %s vs %s", hash1, hash2)
	}

	// Delete Session 1
	if err := st.DeleteChat("ses-blob-1"); err != nil {
		t.Fatalf("failed to delete ses-blob-1: %v", err)
	}

	// Session 2's blob must still exist and be readable
	readData, err := st.GetBlob(hash1)
	if err != nil {
		t.Fatalf("blob should still be retrievable via ses-blob-2: %v", err)
	}
	if string(readData) != string(payload) {
		t.Errorf("blob data mismatch: expected %q, got %q", string(payload), string(readData))
	}

	// Delete Session 2
	if err := st.DeleteChat("ses-blob-2"); err != nil {
		t.Fatalf("failed to delete ses-blob-2: %v", err)
	}

	// Now both are deleted, blob should not be found
	_, err = st.GetBlob(hash1)
	if err == nil {
		t.Errorf("expected error reading blob after all owner sessions are deleted")
	}
}

func TestSQLiteFTS5PrefixMatch(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}
	defer st.Close()

	_, err = st.AppendEventNode("ses-prefix", GraphNode{
		ID:   "n-pfx-1",
		Type: "user",
		Text: "Architectural optimization for concurrent dispatchers",
	})
	if err != nil {
		t.Fatalf("append error: %v", err)
	}

	// Query with partial prefix "concurr" -> should match "concurrent"
	results, err := st.SearchChats("concurr", 10)
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("expected prefix search for 'concurr' to find 'concurrent', got 0 results")
	}
	if results[0].SessionID != "ses-prefix" {
		t.Errorf("expected session 'ses-prefix', got %s", results[0].SessionID)
	}

	// Query with partial prefix "optimiz" -> should match "optimization"
	resultsOpt, err := st.SearchChats("optimiz", 10)
	if err != nil {
		t.Fatalf("search error: %v", err)
	}
	if len(resultsOpt) == 0 {
		t.Fatalf("expected prefix search for 'optimiz' to find 'optimization'")
	}
}

func TestSQLiteSaveChatBlobOffloading(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}
	defer st.Close()

	largeOutput := make([]byte, 5000)
	for i := range largeOutput {
		largeOutput[i] = 'X'
	}

	session := &ChatSession{
		ID:       "ses-savechat-blob",
		Title:    "SaveChat Blob Test",
		Provider: "antigravity",
		Model:    "gemini-3.8-flash",
		Messages: []ChatMessage{
			{
				ID:   "msg-1",
				Role: "user",
				Text: "Run large query",
			},
			{
				ID:   "msg-2",
				Role: "agent",
				ToolCalls: []ToolCallItem{
					{
						ID:      "tc-large",
						Name:    "run_terminal",
						Status:  "success",
						Output:  string(largeOutput),
						Summary: "Executed bash command",
					},
				},
			},
		},
	}

	if err := st.SaveChat(session); err != nil {
		t.Fatalf("SaveChat failed: %v", err)
	}

	// Verify events in database have offloaded the output
	var storedOutput, blobRef, preview string
	err = st.DB().QueryRow(`SELECT tool_output, blob_ref, preview FROM chat_events WHERE session_id = ? AND type = 'tool_call'`, session.ID).Scan(&storedOutput, &blobRef, &preview)
	if err != nil {
		t.Fatalf("failed to query chat_event: %v", err)
	}

	if storedOutput != "" {
		t.Errorf("expected tool_output to be cleared, got length %d", len(storedOutput))
	}
	if blobRef == "" {
		t.Fatalf("expected non-empty blob_ref")
	}
	if len(preview) == 0 {
		t.Errorf("expected non-empty preview")
	}

	// Verify blob is stored and retrievable
	blobBytes, err := st.GetBlob(blobRef)
	if err != nil {
		t.Fatalf("failed to retrieve blob %s: %v", blobRef, err)
	}
	if len(blobBytes) != 5000 {
		t.Errorf("expected 5000 bytes, got %d", len(blobBytes))
	}
}

func TestSQLiteWorkspaceScopedSessions(t *testing.T) {
	tempDir := t.TempDir()
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}
	defer st.Close()

	wsA := filepath.Join(tempDir, "repo-alpha")
	wsB := filepath.Join(tempDir, "repo-beta")

	sessA := &ChatSession{
		ID:            "ses-alpha",
		Title:         "Alpha Pipeline Discussion",
		Provider:      "antigravity",
		Model:         "gemini-3.8-flash",
		WorkspacePath: wsA,
		Messages: []ChatMessage{
			{ID: "m-a1", Role: "user", Text: "Deploying alpha build container"},
		},
	}
	sessB := &ChatSession{
		ID:            "ses-beta",
		Title:         "Beta Architecture Discussion",
		Provider:      "antigravity",
		Model:         "gemini-3.8-flash",
		WorkspacePath: wsB,
		Messages: []ChatMessage{
			{ID: "m-b1", Role: "user", Text: "Refactoring beta database connection"},
		},
	}

	if err := st.SaveChat(sessA); err != nil {
		t.Fatalf("failed to save sessA: %v", err)
	}
	if err := st.SaveChat(sessB); err != nil {
		t.Fatalf("failed to save sessB: %v", err)
	}

	// 1. ListChats with wsA filter
	listA, err := st.ListChats(wsA)
	if err != nil {
		t.Fatalf("ListChats(wsA) failed: %v", err)
	}
	if len(listA) != 1 || listA[0].ID != "ses-alpha" {
		t.Fatalf("expected only ses-alpha for wsA, got %+v", listA)
	}
	if listA[0].WorkspacePath != wsA {
		t.Errorf("expected WorkspacePath %s, got %s", wsA, listA[0].WorkspacePath)
	}

	// 2. ListChats with wsB filter
	listB, err := st.ListChats(wsB)
	if err != nil {
		t.Fatalf("ListChats(wsB) failed: %v", err)
	}
	if len(listB) != 1 || listB[0].ID != "ses-beta" {
		t.Fatalf("expected only ses-beta for wsB, got %+v", listB)
	}

	// 3. ListChats without filter (Global / All Projects)
	listAll, err := st.ListChats()
	if err != nil {
		t.Fatalf("ListChats() failed: %v", err)
	}
	if len(listAll) != 2 {
		t.Fatalf("expected 2 sessions in global list, got %d", len(listAll))
	}

	// 4. SearchChats with workspace filter
	searchA, err := st.SearchChats("Discussion", 10, wsA)
	if err != nil {
		t.Fatalf("SearchChats for wsA failed: %v", err)
	}
	if len(searchA) != 1 || searchA[0].SessionID != "ses-alpha" {
		t.Fatalf("expected only ses-alpha in wsA search, got %+v", searchA)
	}

	searchAll, err := st.SearchChats("Discussion", 10)
	if err != nil {
		t.Fatalf("SearchChats global failed: %v", err)
	}
	if len(searchAll) != 2 {
		t.Fatalf("expected 2 sessions in global search, got %d", len(searchAll))
	}
}

func TestSQLiteAutoHealLegacySchema(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "aegis.db")

	// 1. Pre-create legacy database with old schema missing workspace_path,
	// single-PK blobs, and legacy chat_fts with event_id
	db, err := OpenDB(dbPath)
	if err != nil {
		t.Fatalf("initial OpenDB failed: %v", err)
	}

	// Drop and reconstruct legacy table without workspace_path
	_, err = db.Exec(`
		DROP TABLE IF EXISTS chat_sessions;
		CREATE TABLE chat_sessions (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			provider TEXT NOT NULL,
			model TEXT NOT NULL,
			root_node_id TEXT,
			active_leaf_id TEXT,
			node_count INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			is_archived INTEGER NOT NULL DEFAULT 0
		);
		CREATE INDEX idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
	`)
	if err != nil {
		t.Fatalf("failed to create simulated legacy table: %v", err)
	}
	db.Close()

	// 2. Open store with New(tempDir) which triggers migrateSchema
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("expected migrateSchema to auto-heal legacy table, but got error: %v", err)
	}
	defer st.Close()

	// 3. Verify workspace_path exists and can be queried
	var colCount int
	err = st.DB().QueryRow(`SELECT count(*) FROM pragma_table_info('chat_sessions') WHERE name = 'workspace_path'`).Scan(&colCount)
	if err != nil || colCount != 1 {
		t.Fatalf("expected workspace_path column to exist, count=%d, err=%v", colCount, err)
	}

	// Verify inserting and listing chats with workspacePath succeeds
	err = st.SaveChat(&ChatSession{
		ID:            "healed-ses",
		Title:         "Healed Session",
		Provider:      "antigravity",
		Model:         "flash",
		WorkspacePath: "/work/healed",
		CreatedAt:     time.Now().UnixMilli(),
		UpdatedAt:     time.Now().UnixMilli(),
	})
	if err != nil {
		t.Fatalf("SaveChat on healed DB failed: %v", err)
	}

	chats, err := st.ListChats("/work/healed")
	if err != nil || len(chats) != 1 {
		t.Fatalf("ListChats on healed DB failed: %v, len=%d", err, len(chats))
	}
	if chats[0].WorkspacePath != "/work/healed" {
		t.Errorf("expected WorkspacePath /work/healed, got %s", chats[0].WorkspacePath)
	}
}

func TestPurgeLegacyOrphans(t *testing.T) {
	tempDir := t.TempDir()

	// 1. Setup legacy files and backup
	legacyBackupDir := filepath.Join(tempDir, "legacy_backup")
	_ = os.MkdirAll(filepath.Join(legacyBackupDir, "chats"), 0755)
	_ = os.WriteFile(filepath.Join(legacyBackupDir, "config.json"), []byte("{}"), 0644)
	_ = os.WriteFile(filepath.Join(legacyBackupDir, "chats", "ses-1.json"), []byte(`{"id":"ses-1","title":"Test","provider":"antigravity","model":"flash","messages":[]}`), 0644)

	// Create empty legacy chats and blobs folders in baseDir
	_ = os.MkdirAll(filepath.Join(tempDir, "chats"), 0755)
	_ = os.MkdirAll(filepath.Join(tempDir, "blobs"), 0755)

	// 2. Open store - this will import ses-1 from legacy_backup/chats
	st, err := New(tempDir)
	if err != nil {
		t.Fatalf("failed to init store: %v", err)
	}
	defer st.Close()

	// Verify ses-1 was ingested
	chats, err := st.ListChats()
	if err != nil || len(chats) == 0 {
		t.Fatalf("expected ses-1 to be imported from legacy_backup, err=%v, count=%d", err, len(chats))
	}

	// 3. Purge legacy orphans
	if err := st.PurgeLegacyOrphans(); err != nil {
		t.Fatalf("PurgeLegacyOrphans failed: %v", err)
	}

	// Verify legacy_backup is gone
	if _, err := os.Stat(legacyBackupDir); !os.IsNotExist(err) {
		t.Errorf("expected legacy_backup to be removed, got err: %v", err)
	}

	// Verify empty chats and blobs folders in baseDir are gone
	if _, err := os.Stat(filepath.Join(tempDir, "chats")); !os.IsNotExist(err) {
		t.Errorf("expected empty chats folder to be removed")
	}
	if _, err := os.Stat(filepath.Join(tempDir, "blobs")); !os.IsNotExist(err) {
		t.Errorf("expected empty blobs folder to be removed")
	}
}


