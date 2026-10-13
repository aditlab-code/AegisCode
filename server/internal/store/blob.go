package store

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SaveBlob computes the SHA-256 hash of a payload and persists it to the SQLite blobs table.
func (s *Store) SaveBlob(sessionID string, payload []byte) (string, error) {
	if len(payload) == 0 {
		return "", nil
	}

	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return "", err
	}

	hasher := sha256.New()
	hasher.Write(payload)
	hash := hex.EncodeToString(hasher.Sum(nil))

	s.mu.Lock()
	defer s.mu.Unlock()

	query := `INSERT INTO blobs (hash, session_id, data, size, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(session_id, hash) DO NOTHING;`
	_, err = s.db.Exec(query, hash, cleanID, payload, len(payload), time.Now().UnixMilli())
	if err != nil {
		return "", fmt.Errorf("failed to save blob %s: %w", hash, err)
	}

	return hash, nil
}

// GetBlob reads a content-addressed raw payload by its SHA-256 hash from SQLite,
// with graceful fallback to disk if legacy files exist.
func (s *Store) GetBlob(hash string) ([]byte, error) {
	cleanHash := strings.TrimSpace(hash)
	if cleanHash == "" || strings.Contains(cleanHash, "..") || strings.Contains(cleanHash, "/") || strings.Contains(cleanHash, "\\") {
		return nil, fmt.Errorf("invalid blob hash: %q", hash)
	}

	s.mu.RLock()
	var data []byte
	err := s.db.QueryRow(`SELECT data FROM blobs WHERE hash = ? LIMIT 1`, cleanHash).Scan(&data)
	s.mu.RUnlock()

	if err == nil {
		return data, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, fmt.Errorf("failed to query blob: %w", err)
	}

	// Fallback to legacy filesystem locations
	searchDirs := []string{
		filepath.Join(s.baseDir, "blobs"),
		filepath.Join(s.baseDir, "legacy_backup", "blobs"),
	}

	for _, dir := range searchDirs {
		matches, gErr := filepath.Glob(filepath.Join(dir, "*_"+cleanHash+".raw"))
		if gErr == nil && len(matches) > 0 {
			return os.ReadFile(matches[0])
		}
		directPath := filepath.Join(dir, cleanHash+".raw")
		if d, rErr := os.ReadFile(directPath); rErr == nil {
			return d, nil
		}
	}

	return nil, os.ErrNotExist
}

// DeleteSessionBlobs removes all content-addressed raw blobs belonging to a specific session.
func (s *Store) DeleteSessionBlobs(sessionID string) error {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	_, err = s.db.Exec(`DELETE FROM blobs WHERE session_id = ?`, cleanID)
	if err != nil {
		return fmt.Errorf("failed to delete session blobs: %w", err)
	}

	// Also clean up any lingering legacy files
	legacyDirs := []string{
		filepath.Join(s.baseDir, "blobs"),
		filepath.Join(s.baseDir, "legacy_backup", "blobs"),
	}
	for _, dir := range legacyDirs {
		matches, gErr := filepath.Glob(filepath.Join(dir, cleanID+"_*.raw"))
		if gErr == nil {
			for _, match := range matches {
				_ = os.Remove(match)
			}
		}
	}

	return nil
}
