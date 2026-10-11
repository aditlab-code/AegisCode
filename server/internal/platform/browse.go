package platform

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

type DirectoryItem struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type DirectoryBrowseResult struct {
	CurrentPath string          `json:"currentPath"`
	ParentPath  string          `json:"parentPath"`
	HomePath    string          `json:"homePath"`
	RootPath    string          `json:"rootPath"`
	Directories []DirectoryItem `json:"directories"`
}

// BrowseDirectory lists subdirectories at dirPath across the host filesystem. If dirPath is empty, defaults to the user's home directory.
func BrowseDirectory(dirPath string, showHidden bool) (*DirectoryBrowseResult, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "/"
	}

	target := dirPath
	if target == "" {
		target = homeDir
	}

	absTarget, err := filepath.Abs(target)
	if err != nil {
		return nil, fmt.Errorf("invalid path: %w", err)
	}

	stat, err := os.Stat(absTarget)
	if err != nil {
		return nil, fmt.Errorf("path does not exist: %w", err)
	}
	if !stat.IsDir() {
		return nil, fmt.Errorf("path is not a directory: %s", absTarget)
	}

	entries, err := os.ReadDir(absTarget)
	if err != nil {
		return nil, fmt.Errorf("failed to read directory: %w", err)
	}

	parentPath := filepath.Dir(absTarget)
	if parentPath == absTarget {
		parentPath = ""
	}

	dirs := make([]DirectoryItem, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if !showHidden && strings.HasPrefix(name, ".") {
			continue
		}
		dirs = append(dirs, DirectoryItem{
			Name: name,
			Path: filepath.Join(absTarget, name),
		})
	}

	return &DirectoryBrowseResult{
		CurrentPath: absTarget,
		ParentPath:  parentPath,
		HomePath:    homeDir,
		RootPath:    string(filepath.Separator),
		Directories: dirs,
	}, nil
}
