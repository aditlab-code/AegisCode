package git

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

// GitChange represents a changed file in the working tree or index.
type GitChange struct {
	Code      string `json:"code"` // "M", "A", "D", "R", "?"
	File      string `json:"file"`
	Directory string `json:"directory,omitempty"`
	Status    string `json:"status"` // "modified", "added", "deleted", "renamed", "untracked"
	OldFile   string `json:"oldFile,omitempty"`
}

// GitUser represents the active Git user identity.
type GitUser struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

// RepoStatus models full git status including branch, tracking, ahead/behind, and changes.
type RepoStatus struct {
	IsRepo     bool        `json:"isRepo"`
	Branch     string      `json:"branch"`
	RepoName   string      `json:"repoName"`
	CommitHash string      `json:"commitHash"`
	Upstream   string      `json:"upstream"`
	Ahead      int         `json:"ahead"`
	Behind     int         `json:"behind"`
	Staged     []GitChange `json:"staged"`
	Unstaged   []GitChange `json:"unstaged"`
	User       GitUser     `json:"user"`
}

// BranchInfo models a local or remote git branch.
type BranchInfo struct {
	Name     string `json:"name"`
	IsHead   bool   `json:"isHead"`
	IsRemote bool   `json:"isRemote"`
	Upstream string `json:"upstream,omitempty"`
}

// CommitNode models a commit in the git history graph or timeline.
type CommitNode struct {
	ID        string   `json:"id"`
	Hash      string   `json:"hash"`
	ShortHash string   `json:"shortHash"`
	Author    string   `json:"author"`
	Email     string   `json:"email"`
	Message   string   `json:"message"`
	Timestamp string   `json:"timestamp"`
	UnixTime  int64    `json:"unixTime"`
	Branch    string   `json:"branch,omitempty"`
	IsHead    bool     `json:"isHead"`
	Tags      []string `json:"tags,omitempty"`
}

// UnlockResult models the outcome of a repository unlock attempt.
type UnlockResult struct {
	Unlocked bool     `json:"unlocked"`
	Removed  []string `json:"removed"`
	Message  string   `json:"message,omitempty"`
}

// StashEntry models a git stash record.
type StashEntry struct {
	Index     int    `json:"index"`
	Ref       string `json:"ref"`
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

// Service provides native Git CLI operations on the active workspace root.
type Service struct {
	ws *workspace.Manager
	mu sync.Mutex
}

// NewService creates a new Git service wrapping workspace Manager.
func NewService(ws *workspace.Manager) *Service {
	return &Service{ws: ws}
}

func (s *Service) root() (string, error) {
	if s.ws == nil {
		return "", errors.New("no active workspace root")
	}
	rootPath, _ := s.ws.GetRoot()
	clean := strings.TrimSpace(rootPath)
	if clean == "" {
		return "", errors.New("no active workspace root")
	}
	return clean, nil
}

func isReadCommand(arg string) bool {
	switch arg {
	case "status", "branch", "log", "diff", "show", "tag", "rev-parse", "config":
		return true
	default:
		return false
	}
}

func isIndexLockError(errStr string) bool {
	return strings.Contains(errStr, "index.lock") && strings.Contains(errStr, "File exists")
}

func (s *Service) runGit(ctx context.Context, args ...string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.root()
	if err != nil {
		return "", err
	}

	execute := func() (string, string, error) {
		cmd := exec.CommandContext(ctx, "git", args...)
		cmd.Dir = root
		if len(args) > 0 && isReadCommand(args[0]) {
			cmd.Env = append(os.Environ(), "GIT_OPTIONAL_LOCKS=0")
		}

		var stdout bytes.Buffer
		var stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		runErr := cmd.Run()
		return stdout.String(), strings.TrimSpace(stderr.String()), runErr
	}

	stdout, errOut, runErr := execute()
	if runErr == nil {
		return stdout, nil
	}

	// Automatic retry and recovery for index.lock conflicts
	if isIndexLockError(errOut) {
		// 1. Transient retry with exponential backoff (wait for any active git command to finish)
		delays := []time.Duration{50 * time.Millisecond, 150 * time.Millisecond, 300 * time.Millisecond}
		for _, delay := range delays {
			select {
			case <-ctx.Done():
				return "", ctx.Err()
			case <-time.After(delay):
			}
			stdout, errOut, runErr = execute()
			if runErr == nil {
				return stdout, nil
			}
			if !isIndexLockError(errOut) {
				break
			}
		}

		// 2. Stale lock auto-recovery (>2s old index.lock from a crashed process)
		lockPath := filepath.Join(root, ".git", "index.lock")
		if fi, statErr := os.Stat(lockPath); statErr == nil {
			if time.Since(fi.ModTime()) > 2*time.Second {
				if rErr := os.Remove(lockPath); rErr == nil {
					stdout, errOut, runErr = execute()
					if runErr == nil {
						return stdout, nil
					}
				}
			}
		}
	}

	if errOut != "" {
		return "", fmt.Errorf("git %s failed: %s", args[0], errOut)
	}
	return "", fmt.Errorf("git %s failed: %w", args[0], runErr)
}

// Unlock safely scans and clears any stale Git lock files (.git/*.lock, .git/refs/**/*.lock).
func (s *Service) Unlock(ctx context.Context) (UnlockResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	root, err := s.root()
	if err != nil {
		return UnlockResult{Unlocked: false, Message: err.Error()}, err
	}

	gitDir := filepath.Join(root, ".git")
	st, err := os.Stat(gitDir)
	if err != nil || !st.IsDir() {
		return UnlockResult{Unlocked: false, Message: "Not a git repository"}, nil
	}

	var removed []string
	knownLocks := []string{
		filepath.Join(gitDir, "index.lock"),
		filepath.Join(gitDir, "HEAD.lock"),
		filepath.Join(gitDir, "config.lock"),
		filepath.Join(gitDir, "packed-refs.lock"),
	}

	for _, lp := range knownLocks {
		if _, statErr := os.Stat(lp); statErr == nil {
			if rErr := os.Remove(lp); rErr == nil {
				removed = append(removed, filepath.Base(lp))
			}
		}
	}

	refsDir := filepath.Join(gitDir, "refs")
	_ = filepath.Walk(refsDir, func(path string, info os.FileInfo, err error) error {
		if err == nil && !info.IsDir() && strings.HasSuffix(info.Name(), ".lock") {
			if rErr := os.Remove(path); rErr == nil {
				rel, _ := filepath.Rel(gitDir, path)
				removed = append(removed, rel)
			}
		}
		return nil
	})

	if len(removed) > 0 {
		return UnlockResult{
			Unlocked: true,
			Removed:  removed,
			Message:  fmt.Sprintf("Successfully removed %d lock file(s)", len(removed)),
		}, nil
	}

	return UnlockResult{
		Unlocked: true,
		Removed:  []string{},
		Message:  "No lock files found in repository",
	}, nil
}

// IsRepo checks if the active workspace is a git repository.
func (s *Service) IsRepo(ctx context.Context) (bool, error) {
	root, err := s.root()
	if err != nil {
		return false, nil
	}

	gitDir := filepath.Join(root, ".git")
	st, err := os.Stat(gitDir)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	return st.IsDir() || st.Mode().IsRegular(), nil
}

// Init initializes a new git repository in the active workspace.
func (s *Service) Init(ctx context.Context) error {
	if _, err := s.runGit(ctx, "init", "-b", "main"); err == nil {
		return nil
	}
	_, err := s.runGit(ctx, "init")
	return err
}

// AddRemote registers a remote Git repository URL.
func (s *Service) AddRemote(ctx context.Context, name string, url string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "origin"
	}
	url = strings.TrimSpace(url)
	if url == "" {
		return errors.New("remote URL cannot be empty")
	}

	_, err := s.runGit(ctx, "remote", "add", name, url)
	return err
}

// GetUser returns configured git user name and email.
func (s *Service) GetUser(ctx context.Context) GitUser {
	name, _ := s.runGit(ctx, "config", "user.name")
	email, _ := s.runGit(ctx, "config", "user.email")
	return GitUser{
		Name:  strings.TrimSpace(name),
		Email: strings.TrimSpace(email),
	}
}

// GetStatus parses git status --porcelain=v2 --branch.
func (s *Service) GetStatus(ctx context.Context) (RepoStatus, error) {
	root, err := s.root()
	if err != nil {
		return RepoStatus{IsRepo: false}, nil
	}

	isRepo, _ := s.IsRepo(ctx)
	if !isRepo {
		return RepoStatus{
			IsRepo:   false,
			RepoName: filepath.Base(root),
			Staged:   []GitChange{},
			Unstaged: []GitChange{},
		}, nil
	}

	out, err := s.runGit(ctx, "status", "--porcelain=v2", "--branch", "--no-optional-locks", "-uall")
	if err != nil && strings.Contains(err.Error(), "unknown option") {
		out, err = s.runGit(ctx, "status", "--porcelain=v2", "--branch", "-uall")
	}
	if err != nil {
		headPath := filepath.Join(root, ".git", "HEAD")
		if headBytes, rErr := os.ReadFile(headPath); rErr == nil {
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
				RepoName: filepath.Base(root),
				Staged:   []GitChange{},
				Unstaged: []GitChange{},
			}, nil
		}
		return RepoStatus{}, err
	}

	user := s.GetUser(ctx)
	status := RepoStatus{
		IsRepo:   true,
		RepoName: filepath.Base(root),
		Staged:   make([]GitChange, 0),
		Unstaged: make([]GitChange, 0),
		User:     user,
	}

	lines := strings.Split(out, "\n")
	for _, rawLine := range lines {
		line := strings.TrimRight(rawLine, "\r")
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "# ") {
			parts := strings.Fields(line)
			if len(parts) >= 3 {
				switch parts[1] {
				case "branch.oid":
					if parts[2] != "(initial)" {
						status.CommitHash = parts[2]
					}
				case "branch.head":
					status.Branch = parts[2]
				case "branch.upstream":
					status.Upstream = parts[2]
				case "branch.ab":
					if len(parts) >= 4 {
						status.Ahead, _ = strconv.Atoi(strings.TrimPrefix(parts[2], "+"))
						status.Behind, _ = strconv.Atoi(strings.TrimPrefix(parts[3], "-"))
					}
				}
			}
			continue
		}

		// Ordinary changed entry: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
		if strings.HasPrefix(line, "1 ") {
			parts := strings.SplitN(line, " ", 9)
			if len(parts) >= 9 {
				xy := parts[1]
				filePath := parts[8]
				cleanPath := filepath.ToSlash(filePath)
				if cleanPath == ".codegraph" || strings.HasPrefix(cleanPath, ".codegraph/") ||
					cleanPath == ".aegis" || strings.HasPrefix(cleanPath, ".aegis/") {
					continue
				}
				dir := filepath.Dir(filePath)
				if dir == "." {
					dir = ""
				}

				stagedChar := xy[0]
				unstagedChar := xy[1]

				if stagedChar != '.' {
					status.Staged = append(status.Staged, GitChange{
						Code:      string(stagedChar),
						File:      filePath,
						Directory: dir,
						Status:    mapStatusCode(string(stagedChar)),
					})
				}
				if unstagedChar != '.' {
					status.Unstaged = append(status.Unstaged, GitChange{
						Code:      string(unstagedChar),
						File:      filePath,
						Directory: dir,
						Status:    mapStatusCode(string(unstagedChar)),
					})
				}
			}
			continue
		}

		// Renamed/copied entry: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><tab><origPath>
		if strings.HasPrefix(line, "2 ") {
			parts := strings.SplitN(line, " ", 10)
			if len(parts) >= 10 {
				xy := parts[1]
				rest := parts[9]
				pathParts := strings.Split(rest, "\t")
				filePath := pathParts[0]
				oldFile := ""
				if len(pathParts) > 1 {
					oldFile = pathParts[1]
				}

				dir := filepath.Dir(filePath)
				if dir == "." {
					dir = ""
				}

				stagedChar := xy[0]
				unstagedChar := xy[1]

				if stagedChar != '.' {
					status.Staged = append(status.Staged, GitChange{
						Code:      string(stagedChar),
						File:      filePath,
						Directory: dir,
						Status:    mapStatusCode(string(stagedChar)),
						OldFile:   oldFile,
					})
				}
				if unstagedChar != '.' {
					status.Unstaged = append(status.Unstaged, GitChange{
						Code:      string(unstagedChar),
						File:      filePath,
						Directory: dir,
						Status:    mapStatusCode(string(unstagedChar)),
						OldFile:   oldFile,
					})
				}
			}
			continue
		}

		// Untracked entry: ? <path>
		if strings.HasPrefix(line, "? ") {
			filePath := strings.TrimPrefix(line, "? ")
			cleanPath := filepath.ToSlash(filePath)
			if cleanPath == ".codegraph" || strings.HasPrefix(cleanPath, ".codegraph/") ||
				cleanPath == ".aegis" || strings.HasPrefix(cleanPath, ".aegis/") {
				continue
			}
			dir := filepath.Dir(filePath)
			if dir == "." {
				dir = ""
			}
			status.Unstaged = append(status.Unstaged, GitChange{
				Code:      "A",
				File:      filePath,
				Directory: dir,
				Status:    "untracked",
			})
			continue
		}
	}

	return status, nil
}

func mapStatusCode(code string) string {
	switch code {
	case "M":
		return "modified"
	case "A":
		return "added"
	case "D":
		return "deleted"
	case "R":
		return "renamed"
	case "C":
		return "copied"
	case "U":
		return "conflict"
	case "?":
		return "untracked"
	default:
		return "modified"
	}
}

// GetBranches returns all local and remote branches.
func (s *Service) GetBranches(ctx context.Context) ([]BranchInfo, error) {
	out, err := s.runGit(ctx, "branch", "-a", "--format=%(refname:short)|%(HEAD)|%(upstream:short)")
	if err != nil {
		return nil, err
	}

	branches := make([]BranchInfo, 0)
	lines := strings.Split(out, "\n")
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "" {
			continue
		}

		parts := strings.Split(trimmed, "|")
		if len(parts) >= 2 {
			name := parts[0]
			isHead := parts[1] == "*"
			upstream := ""
			if len(parts) >= 3 {
				upstream = parts[2]
			}

			isRemote := strings.HasPrefix(name, "origin/") || strings.Contains(name, "/")
			branches = append(branches, BranchInfo{
				Name:     name,
				IsHead:   isHead,
				IsRemote: isRemote,
				Upstream: upstream,
			})
		}
	}

	return branches, nil
}

// CheckoutBranch checks out the specified branch.
func (s *Service) CheckoutBranch(ctx context.Context, branch string) error {
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return errors.New("branch name cannot be empty")
	}

	// If remote branch, checkout local tracking branch
	if strings.HasPrefix(branch, "origin/") {
		localName := strings.TrimPrefix(branch, "origin/")
		_, err := s.runGit(ctx, "checkout", "-B", localName, branch)
		return err
	}

	_, err := s.runGit(ctx, "checkout", branch)
	return err
}

// CreateBranch creates a branch and optionally checks it out.
func (s *Service) CreateBranch(ctx context.Context, name string, checkout bool) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("branch name cannot be empty")
	}

	if checkout {
		_, err := s.runGit(ctx, "checkout", "-b", name)
		return err
	}

	_, err := s.runGit(ctx, "branch", name)
	return err
}

// GetLog returns commit nodes with hash, author, message, timestamp, branches, and tags.
func (s *Service) GetLog(ctx context.Context, limit int) ([]CommitNode, error) {
	if limit <= 0 {
		limit = 50
	}

	out, err := s.runGit(ctx, "log", fmt.Sprintf("-n%d", limit), "--pretty=format:%H|%h|%an|%ae|%at|%s|%D")
	if err != nil {
		// Fresh repo without commits yet
		if strings.Contains(err.Error(), "does not have any commits") || strings.Contains(err.Error(), "fatal: your current branch") {
			return []CommitNode{}, nil
		}
		return nil, err
	}

	activeBranch := ""
	if st, err := s.GetStatus(ctx); err == nil {
		activeBranch = st.Branch
	}

	nodes := make([]CommitNode, 0)
	lines := strings.Split(out, "\n")
	for idx, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "" {
			continue
		}

		parts := strings.Split(trimmed, "|")
		if len(parts) >= 6 {
			hash := parts[0]
			shortHash := parts[1]
			author := parts[2]
			email := parts[3]
			rawTime := parts[4]
			msg := parts[5]

			refString := ""
			if len(parts) >= 7 {
				refString = parts[6]
			}

			tags := make([]string, 0)
			commitBranch := ""

			if refString != "" {
				refs := strings.Split(refString, ",")
				for _, r := range refs {
					r = strings.TrimSpace(r)
					if strings.HasPrefix(r, "tag: ") {
						tags = append(tags, strings.TrimPrefix(r, "tag: "))
					} else if strings.HasPrefix(r, "HEAD -> ") {
						commitBranch = strings.TrimPrefix(r, "HEAD -> ")
					} else if commitBranch == "" && !strings.Contains(r, "/") && !strings.HasPrefix(r, "tag:") {
						commitBranch = r
					}
				}
			}

			if commitBranch == "" {
				commitBranch = activeBranch
			}

			unixSec, _ := strconv.ParseInt(rawTime, 10, 64)
			t := time.Unix(unixSec, 0)
			relTime := formatRelativeTime(t)

			nodes = append(nodes, CommitNode{
				ID:        shortHash,
				Hash:      hash,
				ShortHash: shortHash,
				Author:    author,
				Email:     email,
				Message:   msg,
				Timestamp: relTime,
				UnixTime:  unixSec,
				Branch:    commitBranch,
				IsHead:    idx == 0,
				Tags:      tags,
			})
		}
	}

	return nodes, nil
}

// GetTimeline returns commit history affecting a specific file.
func (s *Service) GetTimeline(ctx context.Context, relPath string, limit int) ([]CommitNode, error) {
	if limit <= 0 {
		limit = 30
	}

	args := []string{"log", fmt.Sprintf("-n%d", limit), "--pretty=format:%H|%h|%an|%ae|%at|%s"}
	if relPath != "" {
		args = append(args, "--follow", "--", relPath)
	}

	out, err := s.runGit(ctx, args...)
	if err != nil {
		if strings.Contains(err.Error(), "does not have any commits") {
			return []CommitNode{}, nil
		}
		return nil, err
	}

	nodes := make([]CommitNode, 0)
	lines := strings.Split(out, "\n")
	for idx, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed == "" {
			continue
		}

		parts := strings.Split(trimmed, "|")
		if len(parts) >= 6 {
			unixSec, _ := strconv.ParseInt(parts[4], 10, 64)
			t := time.Unix(unixSec, 0)
			relTime := formatRelativeTime(t)

			nodes = append(nodes, CommitNode{
				ID:        parts[1],
				Hash:      parts[0],
				ShortHash: parts[1],
				Author:    parts[2],
				Email:     parts[3],
				Message:   parts[5],
				Timestamp: relTime,
				UnixTime:  unixSec,
				IsHead:    idx == 0,
			})
		}
	}

	return nodes, nil
}

func formatRelativeTime(t time.Time) string {
	diff := time.Since(t)
	if diff < time.Minute {
		return "Just now"
	} else if diff < time.Hour {
		m := int(diff.Minutes())
		if m == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", m)
	} else if diff < 24*time.Hour {
		h := int(diff.Hours())
		if h == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", h)
	} else if diff < 30*24*time.Hour {
		d := int(diff.Hours() / 24)
		if d == 1 {
			return "Yesterday"
		}
		return fmt.Sprintf("%d days ago", d)
	}
	return t.Format("Jan 02, 2006")
}

// Stage stages specified files or all changes.
func (s *Service) Stage(ctx context.Context, files []string, all bool) error {
	if all || len(files) == 0 {
		_, err := s.runGit(ctx, "add", "-A")
		return err
	}

	args := append([]string{"add", "--"}, files...)
	_, err := s.runGit(ctx, args...)
	return err
}

// Unstage unstages specified files or all changes from the index.
func (s *Service) Unstage(ctx context.Context, files []string, all bool) error {
	hasHead := true
	if _, err := s.runGit(ctx, "rev-parse", "--verify", "HEAD"); err != nil {
		hasHead = false
	}

	if hasHead {
		var err error
		if all || len(files) == 0 {
			_, err = s.runGit(ctx, "restore", "--staged", ".")
		} else {
			args := append([]string{"restore", "--staged", "--"}, files...)
			_, err = s.runGit(ctx, args...)
		}
		if err == nil {
			return nil
		}
	}

	// When HEAD does not exist (initial commit state) or restore fails:
	if all || len(files) == 0 {
		_, err := s.runGit(ctx, "rm", "--cached", "-r", ".")
		return err
	}

	args := append([]string{"rm", "--cached", "-r", "--"}, files...)
	_, err := s.runGit(ctx, args...)
	return err
}

// Discard discards working tree changes for specified files or all.
func (s *Service) Discard(ctx context.Context, files []string, all bool) error {
	root, err := s.root()
	if err != nil {
		return err
	}

	if all || len(files) == 0 {
		_, _ = s.runGit(ctx, "restore", ".")
		_, _ = s.runGit(ctx, "clean", "-fd")
		return nil
	}

	// For specific files, restore tracked and remove untracked
	for _, f := range files {
		cleanPath := strings.TrimSpace(f)
		if cleanPath == "" {
			continue
		}

		fullPath, err := s.ws.ResolvePath(cleanPath)
		if err != nil {
			// Path traversal attempt or invalid path outside workspace root
			continue
		}

		// Check if file is untracked
		if _, err := s.runGit(ctx, "restore", "--", cleanPath); err != nil {
			// Might be untracked, remove directly only if within root and not root itself
			if fullPath != root {
				_ = os.RemoveAll(fullPath)
			}
		}
	}
	return nil
}

// Commit creates a git commit with the given message.
func (s *Service) Commit(ctx context.Context, message string, autoStage bool) (*CommitNode, error) {
	msg := strings.TrimSpace(message)
	if msg == "" {
		return nil, errors.New("commit message cannot be empty")
	}

	if autoStage {
		st, err := s.GetStatus(ctx)
		if err != nil {
			return nil, err
		}
		if len(st.Staged) == 0 && len(st.Unstaged) > 0 {
			if err := s.Stage(ctx, nil, true); err != nil {
				return nil, err
			}
		}
	}

	_, err := s.runGit(ctx, "commit", "-m", msg)
	if err != nil {
		return nil, err
	}

	// Return created commit node
	logNodes, err := s.GetLog(ctx, 1)
	if err != nil || len(logNodes) == 0 {
		return &CommitNode{Message: msg}, nil
	}

	return &logNodes[0], nil
}

// Push pushes commits to remote tracking branch.
func (s *Service) Push(ctx context.Context, setUpstream bool) error {
	if setUpstream {
		st, err := s.GetStatus(ctx)
		if err != nil {
			return err
		}
		branch := st.Branch
		if branch == "" {
			branch = "main"
		}
		_, err = s.runGit(ctx, "push", "-u", "origin", branch)
		return err
	}

	_, err := s.runGit(ctx, "push")
	if err != nil && strings.Contains(err.Error(), "--set-upstream") {
		// Retry with set upstream
		st, _ := s.GetStatus(ctx)
		branch := st.Branch
		if branch != "" {
			_, err = s.runGit(ctx, "push", "-u", "origin", branch)
		}
	}
	return err
}

// Pull pulls commits from remote tracking branch.
func (s *Service) Pull(ctx context.Context) error {
	_, err := s.runGit(ctx, "pull")
	return err
}

// Sync pulls then pushes commits.
func (s *Service) Sync(ctx context.Context) error {
	if err := s.Pull(ctx); err != nil {
		return fmt.Errorf("sync pull failed: %w", err)
	}
	if err := s.Push(ctx, false); err != nil {
		return fmt.Errorf("sync push failed: %w", err)
	}
	return nil
}

// GetTags returns all tags sorted by creation date.
func (s *Service) GetTags(ctx context.Context) ([]string, error) {
	out, err := s.runGit(ctx, "tag", "-l", "--sort=-creatordate")
	if err != nil {
		return nil, err
	}

	tags := make([]string, 0)
	lines := strings.Split(out, "\n")
	for _, l := range lines {
		trimmed := strings.TrimSpace(l)
		if trimmed != "" {
			tags = append(tags, trimmed)
		}
	}

	return tags, nil
}

// CreateTag creates a new git tag at HEAD or a specified commit.
func (s *Service) CreateTag(ctx context.Context, name string, message string, target ...string) error {
	name = strings.TrimSpace(name)
	if name == "" {
		return errors.New("tag name cannot be empty")
	}

	args := []string{"tag"}
	if message != "" {
		args = append(args, "-a", name, "-m", message)
	} else {
		args = append(args, name)
	}
	if len(target) > 0 && strings.TrimSpace(target[0]) != "" {
		args = append(args, strings.TrimSpace(target[0]))
	}

	_, err := s.runGit(ctx, args...)
	return err
}

// PushTags pushes all tags to remote origin.
func (s *Service) PushTags(ctx context.Context) error {
	_, err := s.runGit(ctx, "push", "origin", "--tags")
	return err
}

// DiffResult holds diff comparison data.
type DiffResult struct {
	File      string `json:"file"`
	Staged    bool   `json:"staged"`
	Diff      string `json:"diff"`
	Original  string `json:"original"`
	Modified  string `json:"modified"`
}

type GitFileChange struct {
	Status string `json:"status"` // "M", "A", "D", etc.
	File   string `json:"file"`
}

type CompareResult struct {
	BaseCommit   string          `json:"baseCommit"`
	TargetCommit string          `json:"targetCommit"`
	Files        []GitFileChange `json:"files"`
	TotalChanges int             `json:"totalChanges"`
}

// CompareCommits retrieves changed files between two commit hashes.
func (s *Service) CompareCommits(ctx context.Context, baseHash string, targetHash string) (*CompareResult, error) {
	baseHash = strings.TrimSpace(baseHash)
	targetHash = strings.TrimSpace(targetHash)
	if baseHash == "" || targetHash == "" {
		return nil, errors.New("both base and target commit hashes are required")
	}

	out, err := s.runGit(ctx, "diff", "--name-status", fmt.Sprintf("%s..%s", baseHash, targetHash))
	if err != nil {
		return nil, fmt.Errorf("failed to compare commits: %w", err)
	}

	var files []GitFileChange
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) >= 2 {
			files = append(files, GitFileChange{
				Status: strings.TrimSpace(parts[0]),
				File:   strings.TrimSpace(parts[len(parts)-1]),
			})
		}
	}

	if files == nil {
		files = []GitFileChange{}
	}

	return &CompareResult{
		BaseCommit:   baseHash,
		TargetCommit: targetHash,
		Files:        files,
		TotalChanges: len(files),
	}, nil
}

// GetDiff retrieves unified diff and original/modified file content for the diff viewer.
func (s *Service) GetDiff(ctx context.Context, relPath string, staged bool, commitHash string, baseHash string) (*DiffResult, error) {
	relPath = strings.TrimSpace(relPath)
	if relPath == "" {
		return nil, errors.New("file path cannot be empty")
	}

	fullPath, err := s.ws.ResolvePath(relPath)
	if err != nil {
		return nil, fmt.Errorf("invalid file path: %w", err)
	}

	var diffText string
	var origContent string
	var modContent string

	commitHash = strings.TrimSpace(commitHash)
	baseHash = strings.TrimSpace(baseHash)

	// 1. Get diff text
	if baseHash != "" && commitHash != "" {
		diffText, _ = s.runGit(ctx, "diff", fmt.Sprintf("%s..%s", baseHash, commitHash), "--", relPath)
		origContent, _ = s.runGit(ctx, "show", fmt.Sprintf("%s:%s", baseHash, relPath))
		modContent, _ = s.runGit(ctx, "show", fmt.Sprintf("%s:%s", commitHash, relPath))
	} else if commitHash != "" {
		diffText, _ = s.runGit(ctx, "diff", fmt.Sprintf("%s^!", commitHash), "--", relPath)
		origContent, _ = s.runGit(ctx, "show", fmt.Sprintf("%s^:%s", commitHash, relPath))
		modContent, _ = s.runGit(ctx, "show", fmt.Sprintf("%s:%s", commitHash, relPath))
	} else if staged {
		diffText, _ = s.runGit(ctx, "diff", "--cached", "--", relPath)
		origContent, _ = s.runGit(ctx, "show", fmt.Sprintf("HEAD:%s", relPath))
		modBytes, _ := os.ReadFile(fullPath)
		modContent = string(modBytes)
	} else {
		diffText, _ = s.runGit(ctx, "diff", "--", relPath)
		origContent, _ = s.runGit(ctx, "show", fmt.Sprintf("HEAD:%s", relPath))
		modBytes, _ := os.ReadFile(fullPath)
		modContent = string(modBytes)

		// Untracked file handling
		if diffText == "" && origContent == "" && modContent != "" {
			diffText = fmt.Sprintf("@@ -0,0 +1,%d @@\n+%s", len(strings.Split(modContent, "\n")), strings.ReplaceAll(modContent, "\n", "\n+"))
		}
	}

	return &DiffResult{
		File:     relPath,
		Staged:   staged,
		Diff:     diffText,
		Original: origContent,
		Modified: modContent,
	}, nil
}

// GetStashes returns all git stashes in the active repository.
func (s *Service) GetStashes(ctx context.Context) ([]StashEntry, error) {
	out, err := s.runGit(ctx, "stash", "list", "--pretty=format:%gd|%cr|%gs")
	if err != nil {
		if strings.Contains(err.Error(), "does not have any commits") || strings.Contains(err.Error(), "fatal:") {
			return []StashEntry{}, nil
		}
		return nil, err
	}

	stashes := make([]StashEntry, 0)
	lines := strings.Split(strings.TrimSpace(out), "\n")
	for idx, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Split(line, "|")
		ref := fmt.Sprintf("stash@{%d}", idx)
		timestamp := ""
		msg := line
		if len(parts) >= 1 && strings.TrimSpace(parts[0]) != "" {
			ref = strings.TrimSpace(parts[0])
		}
		if len(parts) >= 2 {
			timestamp = strings.TrimSpace(parts[1])
		}
		if len(parts) >= 3 {
			msg = strings.TrimSpace(parts[2])
		} else if len(parts) == 1 {
			msg = ref
		}
		stashes = append(stashes, StashEntry{
			Index:     idx,
			Ref:       ref,
			Message:   msg,
			Timestamp: timestamp,
		})
	}
	return stashes, nil
}

// StashSave saves current changes into a new stash with optional message.
func (s *Service) StashSave(ctx context.Context, message string, includeUntracked bool) error {
	args := []string{"stash", "push"}
	if includeUntracked {
		args = append(args, "-u")
	}
	message = strings.TrimSpace(message)
	if message != "" {
		args = append(args, "-m", message)
	}
	_, err := s.runGit(ctx, args...)
	return err
}

// StashPop pops changes from stash (defaults to stash@{0} if ref is empty).
func (s *Service) StashPop(ctx context.Context, ref string) error {
	ref = strings.TrimSpace(ref)
	args := []string{"stash", "pop"}
	if ref != "" {
		args = append(args, ref)
	}
	_, err := s.runGit(ctx, args...)
	return err
}

// StashApply applies changes from stash without dropping it.
func (s *Service) StashApply(ctx context.Context, ref string) error {
	ref = strings.TrimSpace(ref)
	args := []string{"stash", "apply"}
	if ref != "" {
		args = append(args, ref)
	}
	_, err := s.runGit(ctx, args...)
	return err
}

// StashDrop drops a specific stash.
func (s *Service) StashDrop(ctx context.Context, ref string) error {
	ref = strings.TrimSpace(ref)
	args := []string{"stash", "drop"}
	if ref != "" {
		args = append(args, ref)
	}
	_, err := s.runGit(ctx, args...)
	return err
}

// CherryPick applies the changes from an existing commit onto the current HEAD.
func (s *Service) CherryPick(ctx context.Context, hash string) error {
	hash = strings.TrimSpace(hash)
	if hash == "" {
		return errors.New("commit hash cannot be empty")
	}
	_, err := s.runGit(ctx, "cherry-pick", hash)
	return err
}

// Clone clones a git repository from url into targetDir and returns the absolute destination path.
func (s *Service) Clone(ctx context.Context, url string, targetDir string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	url = strings.TrimSpace(url)
	if url == "" {
		return "", errors.New("repository URL cannot be empty")
	}

	targetDir = strings.TrimSpace(targetDir)
	if targetDir == "" {
		base := filepath.Base(url)
		base = strings.TrimSuffix(base, ".git")
		if base == "" || base == "/" || base == "." {
			base = "cloned-repo"
		}
		root, err := s.root()
		if err == nil && root != "" {
			targetDir = filepath.Join(root, base)
		} else {
			targetDir = base
		}
	}

	absTarget, err := filepath.Abs(targetDir)
	if err != nil {
		return "", err
	}

	parentDir := filepath.Dir(absTarget)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return "", fmt.Errorf("failed to create destination directory: %w", err)
	}

	cmd := exec.CommandContext(ctx, "git", "clone", url, absTarget)
	cmd.Dir = parentDir
	var errBuf bytes.Buffer
	cmd.Stderr = &errBuf

	if err := cmd.Run(); err != nil {
		errMsg := strings.TrimSpace(errBuf.String())
		if errMsg != "" {
			return "", fmt.Errorf("git clone failed: %s", errMsg)
		}
		return "", fmt.Errorf("git clone failed: %w", err)
	}

	return absTarget, nil
}
