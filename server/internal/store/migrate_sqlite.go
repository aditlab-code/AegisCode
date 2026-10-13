package store

import (
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// MigrateFlatFilesToSQLite detects existing flat-file storage artifacts in baseDir
// (or in legacy_backup/) and transactionally imports them into the pure-Go SQLite database.
// After successful transaction commit, legacy flat-files are moved to ~/.aegis/legacy_backup/.
func MigrateFlatFilesToSQLite(baseDir string, db *sql.DB) error {
	configPath := filepath.Join(baseDir, "config.json")
	statePath := filepath.Join(baseDir, "state.json")
	indexPath := filepath.Join(baseDir, "sessions.json")
	chatsDir := filepath.Join(baseDir, "chats")
	blobsDir := filepath.Join(baseDir, "blobs")
	backupDir := filepath.Join(baseDir, "legacy_backup")

	backupConfigPath := filepath.Join(backupDir, "config.json")
	backupStatePath := filepath.Join(backupDir, "state.json")
	backupIndexPath := filepath.Join(backupDir, "sessions.json")
	backupChatsDir := filepath.Join(backupDir, "chats")
	backupBlobsDir := filepath.Join(backupDir, "blobs")

	hasConfig := fileExists(configPath)
	hasState := fileExists(statePath)
	hasIndex := fileExists(indexPath)
	hasChats := dirHasFiles(chatsDir)
	hasBlobs := dirHasFiles(blobsDir)

	hasBackupConfig := fileExists(backupConfigPath)
	hasBackupState := fileExists(backupStatePath)
	hasBackupIndex := fileExists(backupIndexPath)
	hasBackupChats := dirHasFiles(backupChatsDir)
	hasBackupBlobs := dirHasFiles(backupBlobsDir)

	if !hasConfig && !hasState && !hasIndex && !hasChats && !hasBlobs &&
		!hasBackupConfig && !hasBackupState && !hasBackupIndex && !hasBackupChats && !hasBackupBlobs {
		// No legacy flat-files to migrate
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to start migration transaction: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	// 1. Ingest config.json if app_config is empty
	var configCount int
	_ = tx.QueryRow(`SELECT count(*) FROM app_config WHERE id = 1`).Scan(&configCount)
	if configCount == 0 {
		cPath := ""
		if hasConfig {
			cPath = configPath
		} else if hasBackupConfig {
			cPath = backupConfigPath
		}
		if cPath != "" {
			if data, rErr := os.ReadFile(cPath); rErr == nil {
				var cfg Config
				if jErr := json.Unmarshal(data, &cfg); jErr == nil {
					cfg.UpdatedAt = time.Now().UnixMilli()
					cfgJSON, _ := json.Marshal(cfg)
					_, _ = tx.Exec(
						`INSERT OR IGNORE INTO app_config (id, data_json, updated_at) VALUES (1, ?, ?)`,
						string(cfgJSON), cfg.UpdatedAt,
					)
				}
			}
		}
	}

	// 2. Ingest state.json if app_state is empty
	var stateCount int
	_ = tx.QueryRow(`SELECT count(*) FROM app_state WHERE id = 1`).Scan(&stateCount)
	if stateCount == 0 {
		sPath := ""
		if hasState {
			sPath = statePath
		} else if hasBackupState {
			sPath = backupStatePath
		}
		if sPath != "" {
			if data, rErr := os.ReadFile(sPath); rErr == nil {
				var st AppState
				if jErr := json.Unmarshal(data, &st); jErr == nil {
					recJSON, _ := json.Marshal(st.RecentProjects)
					_, _ = tx.Exec(
						`INSERT OR IGNORE INTO app_state (id, active_session_id, recent_projects_json, window_state_json, updated_at) VALUES (1, ?, ?, '{}', ?)`,
						st.ActiveSessionID, string(recJSON), st.UpdatedAt,
					)
				}
			}
		}
	}

	// Pre-load sessions.json metadata map if available
	descMap := make(map[string]SessionDescriptor)
	idxPath := ""
	if hasIndex {
		idxPath = indexPath
	} else if hasBackupIndex {
		idxPath = backupIndexPath
	}
	if idxPath != "" {
		if data, rErr := os.ReadFile(idxPath); rErr == nil {
			var idx SessionsIndex
			if jErr := json.Unmarshal(data, &idx); jErr == nil {
				for _, d := range idx.Sessions {
					descMap[d.ID] = d
				}
			}
		}
	}

	// 3. Ingest chats from baseDir/chats and backupDir/chats
	if hasChats {
		ingestChatsFromDir(tx, chatsDir, descMap)
	}
	if hasBackupChats {
		ingestChatsFromDir(tx, backupChatsDir, descMap)
	}

	// 4. Ingest blobs from baseDir/blobs and backupDir/blobs
	if hasBlobs {
		ingestBlobsFromDir(tx, blobsDir)
	}
	if hasBackupBlobs {
		ingestBlobsFromDir(tx, backupBlobsDir)
	}

	// Commit database transaction
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit migration transaction: %w", err)
	}

	// 5. Safe non-destructive backup: move any unbacked-up legacy flat-files to legacy_backup/
	if hasConfig || hasState || hasIndex || hasChats || hasBlobs {
		_ = os.MkdirAll(backupDir, 0755)

		moveFileIfExists(configPath, filepath.Join(backupDir, "config.json"))
		moveFileIfExists(statePath, filepath.Join(backupDir, "state.json"))
		moveFileIfExists(indexPath, filepath.Join(backupDir, "sessions.json"))

		if hasChats {
			backupChatsSubDir := filepath.Join(backupDir, "chats")
			_ = os.MkdirAll(backupChatsSubDir, 0755)
			moveDirectoryContents(chatsDir, backupChatsSubDir)
			cleanEmptyDir(chatsDir)
		}

		if hasBlobs {
			backupBlobsSubDir := filepath.Join(backupDir, "blobs")
			_ = os.MkdirAll(backupBlobsSubDir, 0755)
			moveDirectoryContents(blobsDir, backupBlobsSubDir)
			cleanEmptyDir(blobsDir)
		}

		marker := filepath.Join(backupDir, ".migrated_at")
		_ = os.WriteFile(marker, []byte(fmt.Sprintf("%d", time.Now().UnixMilli())), 0644)
	}

	return nil
}

func ingestChatsFromDir(tx *sql.Tx, dir string, descMap map[string]SessionDescriptor) {
	entries, rErr := os.ReadDir(dir)
	if rErr != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		name := entry.Name()
		if strings.HasSuffix(name, ".jsonl") {
			sessionID := strings.TrimSuffix(name, ".jsonl")
			filePath := filepath.Join(dir, name)

			f, oErr := os.Open(filePath)
			if oErr != nil {
				continue
			}

			scanner := bufio.NewScanner(f)
			buf := make([]byte, 1024*1024)
			scanner.Buffer(buf, 10*1024*1024)

			var fileNodes []GraphNode
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line == "" {
					continue
				}
				var node GraphNode
				if uErr := json.Unmarshal([]byte(line), &node); uErr != nil {
					continue
				}
				fileNodes = append(fileNodes, node)
			}
			_ = f.Close()

			if len(fileNodes) > 0 {
				firstNode := &fileNodes[0]
				lastNode := &fileNodes[len(fileNodes)-1]

				desc, exists := descMap[sessionID]
				title := "New Session"
				provider := "antigravity"
				model := "gemini-3.8-flash"
				createdAt := firstNode.Ts
				updatedAt := lastNode.Ts
				rootID := firstNode.ID
				leafID := lastNode.ID

				if exists {
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
					if desc.RootNodeID != "" {
						rootID = desc.RootNodeID
					}
					if desc.ActiveLeafID != "" {
						leafID = desc.ActiveLeafID
					}
				} else if firstNode.Text != "" {
					t := strings.TrimSpace(firstNode.Text)
					if len(t) > 30 {
						t = t[:30] + "..."
					}
					title = t
				}

				// 1. Insert chat_sessions record first to satisfy FOREIGN KEY
				_, _ = tx.Exec(
					`INSERT OR IGNORE INTO chat_sessions (
						id, title, provider, model, root_node_id, active_leaf_id, node_count, created_at, updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					sessionID, title, provider, model, rootID, leafID, len(fileNodes), createdAt, updatedAt,
				)

				// 2. Insert chat_events nodes
				for _, node := range fileNodes {
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

					_, _ = tx.Exec(
						`INSERT OR IGNORE INTO chat_events (
							id, session_id, parent_id, type, role, text, content, reasoning,
							tool_name, tool_args_json, tool_output, blob_ref, preview,
							provider, model, meta_json, created_at
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
						node.ID, sessionID, parentID, node.Type, role, node.Text, node.Content, reasoning,
						node.Tool, argsJSON, node.Output, node.BlobRef, node.Preview,
						"", "", metaJSON, node.Ts,
					)
				}
			}
		} else if strings.HasSuffix(name, ".json") {
			sessionID := strings.TrimSuffix(name, ".json")
			jsonlPath := filepath.Join(dir, sessionID+".jsonl")
			if fileExists(jsonlPath) {
				// Already processed via .jsonl
				continue
			}

			filePath := filepath.Join(dir, name)
			data, rErr := os.ReadFile(filePath)
			if rErr != nil {
				continue
			}

			var sess ChatSession
			if uErr := json.Unmarshal(data, &sess); uErr != nil {
				continue
			}

			nodes := ConvertMessagesToGraphNodes(sess.ID, sess.Provider, sess.Model, sess.Messages)
			rootID := ""
			leafID := ""
			if len(nodes) > 0 {
				rootID = nodes[0].ID
				leafID = nodes[len(nodes)-1].ID
			}

			_, _ = tx.Exec(
				`INSERT OR IGNORE INTO chat_sessions (
					id, title, provider, model, root_node_id, active_leaf_id, node_count, created_at, updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				sess.ID, sess.Title, sess.Provider, sess.Model, rootID, leafID, len(nodes), sess.CreatedAt, sess.UpdatedAt,
			)

			for _, node := range nodes {
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
				_, _ = tx.Exec(
					`INSERT OR IGNORE INTO chat_events (
						id, session_id, parent_id, type, role, text, content, reasoning,
						tool_name, tool_args_json, tool_output, blob_ref, preview,
						provider, model, meta_json, created_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
					node.ID, sess.ID, parentID, node.Type, role, node.Text, node.Content, reasoning,
					node.Tool, argsJSON, node.Output, node.BlobRef, node.Preview,
					sess.Provider, sess.Model, metaJSON, node.Ts,
				)
			}
		}
	}
}

func ingestBlobsFromDir(tx *sql.Tx, dir string) {
	entries, rErr := os.ReadDir(dir)
	if rErr != nil {
		return
	}
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		name := entry.Name()
		filePath := filepath.Join(dir, name)
		data, rErr := os.ReadFile(filePath)
		if rErr != nil {
			continue
		}

		hash := strings.TrimSuffix(name, ".raw")
		sessionID := ""
		if parts := strings.SplitN(hash, "_", 2); len(parts) == 2 {
			sessionID = parts[0]
			hash = parts[1]
		}

		_, _ = tx.Exec(
			`INSERT OR IGNORE INTO blobs (hash, session_id, data, size, created_at) VALUES (?, ?, ?, ?, ?)`,
			hash, sessionID, data, len(data), time.Now().UnixMilli(),
		)
	}
}

// PurgeLegacyOrphans safely removes empty legacy directories and legacy_backup
// once all data has been completely imported into SQLite.
func PurgeLegacyOrphans(baseDir string) error {
	backupDir := filepath.Join(baseDir, "legacy_backup")
	_ = os.RemoveAll(backupDir)

	chatsDir := filepath.Join(baseDir, "chats")
	if dirIsEmpty(chatsDir) {
		_ = os.Remove(chatsDir)
	}

	blobsDir := filepath.Join(baseDir, "blobs")
	if dirIsEmpty(blobsDir) {
		_ = os.Remove(blobsDir)
	}

	for _, f := range []string{"config.json", "state.json", "sessions.json"} {
		p := filepath.Join(baseDir, f)
		if fileExists(p) {
			_ = os.Remove(p)
		}
	}

	return nil
}

func fileExists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && !fi.IsDir()
}

func dirExists(p string) bool {
	fi, err := os.Stat(p)
	return err == nil && fi.IsDir()
}

func dirHasFiles(p string) bool {
	entries, err := os.ReadDir(p)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			return true
		}
	}
	return false
}

func dirIsEmpty(p string) bool {
	entries, err := os.ReadDir(p)
	if err != nil {
		return false
	}
	for _, e := range entries {
		if !strings.HasPrefix(e.Name(), ".") {
			return false
		}
	}
	return true
}

func cleanEmptyDir(p string) {
	if dirIsEmpty(p) {
		_ = os.Remove(p)
	}
}

func moveFileIfExists(src, dst string) {
	if fileExists(src) {
		_ = os.Remove(dst) // remove destination first for Windows compatibility
		_ = os.Rename(src, dst)
	}
}

func moveDirectoryContents(srcDir, dstDir string) {
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return
	}
	for _, entry := range entries {
		srcFile := filepath.Join(srcDir, entry.Name())
		dstFile := filepath.Join(dstDir, entry.Name())
		_ = os.Remove(dstFile) // remove destination first for Windows compatibility
		_ = os.Rename(srcFile, dstFile)
	}
}
