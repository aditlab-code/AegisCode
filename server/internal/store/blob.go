package store

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// SaveBlob computes the SHA-256 hash of a payload and writes it to ~/.aegis/blobs/<sessionID>_<hash>.raw.
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

	if err := os.MkdirAll(s.blobsDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create blobs directory: %w", err)
	}

	blobPath := filepath.Join(s.blobsDir, fmt.Sprintf("%s_%s.raw", cleanID, hash))
	// If file already exists, it is content-addressed identical, no need to overwrite
	if _, err := os.Stat(blobPath); err == nil {
		return hash, nil
	}

	if err := atomicWrite(blobPath, payload); err != nil {
		return "", fmt.Errorf("failed to write blob %s: %w", hash, err)
	}

	return hash, nil
}

// GetBlob reads a content-addressed raw payload by its SHA-256 hash.
func (s *Store) GetBlob(hash string) ([]byte, error) {
	cleanHash := strings.TrimSpace(hash)
	if cleanHash == "" || strings.Contains(cleanHash, "..") || strings.Contains(cleanHash, "/") || strings.Contains(cleanHash, "\\") {
		return nil, fmt.Errorf("invalid blob hash: %q", hash)
	}

	// 1. Direct match: <sessionID>_<cleanHash>.raw
	matches, err := filepath.Glob(filepath.Join(s.blobsDir, "*_"+cleanHash+".raw"))
	if err == nil && len(matches) > 0 {
		return os.ReadFile(matches[0])
	}

	// 2. Fallback direct hash filename: <cleanHash>.raw
	directPath := filepath.Join(s.blobsDir, cleanHash+".raw")
	if data, err := os.ReadFile(directPath); err == nil {
		return data, nil
	}

	return nil, os.ErrNotExist
}

// DeleteSessionBlobs removes all content-addressed raw blobs belonging to a specific session.
func (s *Store) DeleteSessionBlobs(sessionID string) error {
	cleanID, err := sanitizeID(sessionID)
	if err != nil {
		return err
	}

	matches, err := filepath.Glob(filepath.Join(s.blobsDir, cleanID+"_*.raw"))
	if err != nil {
		return fmt.Errorf("failed to glob session blobs: %w", err)
	}

	for _, match := range matches {
		_ = os.Remove(match)
	}

	return nil
}
