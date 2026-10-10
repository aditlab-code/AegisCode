package git

import (
	"os"
	"path/filepath"
	"strings"
)

type RepoStatus struct {
	IsRepo   bool   `json:"isRepo"`
	Branch   string `json:"branch"`
	RepoName string `json:"repoName"`
}

func DetectRepo(rootPath string) (RepoStatus, error) {
	if strings.TrimSpace(rootPath) == "" {
		return RepoStatus{
			IsRepo:   false,
			Branch:   "",
			RepoName: "",
		}, nil
	}

	gitDir := filepath.Join(rootPath, ".git")
	stat, err := os.Stat(gitDir)
	if err != nil {
		if os.IsNotExist(err) {
			return RepoStatus{
				IsRepo:   false,
				Branch:   "",
				RepoName: filepath.Base(rootPath),
			}, nil
		}
		return RepoStatus{}, err
	}

	if !stat.IsDir() {
		return RepoStatus{
			IsRepo:   false,
			Branch:   "",
			RepoName: filepath.Base(rootPath),
		}, nil
	}

	headPath := filepath.Join(gitDir, "HEAD")
	headBytes, err := os.ReadFile(headPath)
	if err != nil {
		return RepoStatus{}, err
	}

	headContent := strings.TrimSpace(string(headBytes))
	branch := ""
	if strings.HasPrefix(headContent, "ref: refs/heads/") {
		branch = strings.TrimPrefix(headContent, "ref: refs/heads/")
	} else if len(headContent) >= 7 {
		branch = headContent[:7]
	}

	return RepoStatus{
		IsRepo:   true,
		Branch:   branch,
		RepoName: filepath.Base(rootPath),
	}, nil
}
