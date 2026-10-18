package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// WorkspaceCopilotStatus contains information on whether the current workspace is initialized for Aegis Copilot.
type WorkspaceCopilotStatus struct {
	IsInitialized bool   `json:"isInitialized"`
	HasAegisDir   bool   `json:"hasAegisDir"`
	HasTasksDir   bool   `json:"hasTasksDir"`
	HasAgentsMd   bool   `json:"hasAgentsMd"`
	RulesPath     string `json:"rulesPath"`
	ActivePersona string `json:"activePersona"`
	TaskCount     int    `json:"taskCount"`
}

// WorkspaceConfig represents local workspace configuration stored in .aegis/config.json.
type WorkspaceConfig struct {
	Version       string    `json:"version"`
	InitializedAt time.Time `json:"initializedAt"`
	DefaultPreset string    `json:"defaultPreset"`
	AutoInitTasks bool      `json:"autoInitTasks"`
}

// InitWorkspaceOptions represents options supplied when initializing a workspace for Aegis Copilot.
type InitWorkspaceOptions struct {
	Preset         string `json:"preset"`         // Persona preset, e.g. "kanna", "architect", "minimalist"
	AddToGitignore bool   `json:"addToGitignore"` // Whether to append .aegis/tasks/ to .gitignore
	CreateSample   bool   `json:"createSample"`   // Whether to scaffold a starter task
	CustomRules    string `json:"customRules"`    // Optional custom markdown for AGENTS.md
	OverwriteRules bool   `json:"overwriteRules"` // Force rewrite AGENTS.md with chosen preset/rules
}

// InitWorkspaceResult contains the outcome of workspace initialization.
type InitWorkspaceResult struct {
	Success    bool   `json:"success"`
	AegisPath  string `json:"aegisPath"`
	AgentsPath string `json:"agentsPath"`
	Gitignored bool   `json:"gitignored"`
	TaskSlug   string `json:"taskSlug,omitempty"`
}

// isDirectory returns true if the path exists and is a directory.
func isDirectory(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && fi.IsDir()
}

// isFile returns true if the path exists and is a regular file.
func isFile(path string) bool {
	fi, err := os.Stat(path)
	return err == nil && !fi.IsDir()
}

// GetWorkspaceCopilotStatus inspects the active workspace to detect Copilot readiness.
func GetWorkspaceCopilotStatus(workspaceRoot string) WorkspaceCopilotStatus {
	cleanRoot := filepath.Clean(workspaceRoot)
	if cleanRoot == "" || cleanRoot == "." {
		return WorkspaceCopilotStatus{
			IsInitialized: false,
			ActivePersona: PresetKanna,
		}
	}

	aegisDir := filepath.Join(cleanRoot, ".aegis")
	hasAegisDir := isDirectory(aegisDir)

	tasksDir := filepath.Join(aegisDir, "tasks")
	hasTasksDir := isDirectory(tasksDir)

	// Check AGENTS.md in workspace root first, then in .aegis/
	rulesStatus := GetRulesStatus(cleanRoot)
	hasAgentsMd := rulesStatus.HasWorkspaceRules
	rulesPath := rulesStatus.RulesPath
	activePersona := rulesStatus.ActivePersona

	if !hasAgentsMd {
		nestedAgents := filepath.Join(aegisDir, "AGENTS.md")
		if isFile(nestedAgents) {
			hasAgentsMd = true
			rulesPath = nestedAgents
			activePersona = "custom"
		}
	}

	taskCount := 0
	if hasTasksDir {
		if entries, err := os.ReadDir(tasksDir); err == nil {
			for _, entry := range entries {
				if entry.IsDir() && !strings.HasPrefix(entry.Name(), ".") {
					taskCount++
				}
			}
		}
	}

	// Workspace is considered initialized if .aegis and .aegis/tasks exist
	isInitialized := hasAegisDir && hasTasksDir

	return WorkspaceCopilotStatus{
		IsInitialized: isInitialized,
		HasAegisDir:   hasAegisDir,
		HasTasksDir:   hasTasksDir,
		HasAgentsMd:   hasAgentsMd,
		RulesPath:     rulesPath,
		ActivePersona: activePersona,
		TaskCount:     taskCount,
	}
}

// InitWorkspace scaffolds the required .aegis directory tree, config, and agent rules.
func InitWorkspace(workspaceRoot string, opts InitWorkspaceOptions) (*InitWorkspaceResult, error) {
	cleanRoot := filepath.Clean(workspaceRoot)
	if cleanRoot == "" || cleanRoot == "." {
		return nil, errors.New("workspace root path is empty or invalid")
	}

	// Guard against root path being a non-existent directory
	if !isDirectory(cleanRoot) {
		return nil, fmt.Errorf("workspace directory does not exist: %s", cleanRoot)
	}

	aegisDir := filepath.Join(cleanRoot, ".aegis")
	tasksDir := filepath.Join(aegisDir, "tasks")

	// 1. Create .aegis and .aegis/tasks
	if err := os.MkdirAll(tasksDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create copilot task directory: %w", err)
	}

	// 2. Initialize or rewrite AGENTS.md
	agentsPath := filepath.Join(cleanRoot, "AGENTS.md")
	preset := opts.Preset
	if preset == "" {
		preset = PresetKanna
	}

	shouldWrite := !isFile(agentsPath) || opts.OverwriteRules || opts.CustomRules != "" || opts.Preset != ""
	if shouldWrite {
		createdPath, err := InitWorkspaceRulesWithContent(cleanRoot, preset, opts.CustomRules)
		if err != nil {
			return nil, fmt.Errorf("failed to scaffold AGENTS.md: %w", err)
		}
		agentsPath = createdPath
	} else {
		nestedAgents := filepath.Join(aegisDir, "AGENTS.md")
		if isFile(nestedAgents) {
			agentsPath = nestedAgents
		}
	}

	// 3. Create .aegis/config.json if not present
	configPath := filepath.Join(aegisDir, "config.json")
	if !isFile(configPath) {
		cfg := WorkspaceConfig{
			Version:       "1.0.0",
			InitializedAt: time.Now(),
			DefaultPreset: opts.Preset,
			AutoInitTasks: true,
		}
		if data, err := json.MarshalIndent(cfg, "", "  "); err == nil {
			_ = os.WriteFile(configPath, data, 0644)
		}
	}

	// 4. Optionally update .gitignore
	gitignored := false
	if opts.AddToGitignore {
		gitignored = ensureGitignoreEntry(cleanRoot, ".aegis/tasks/")
	}

	// 5. Optionally scaffold a starter task
	taskSlug := ""
	if opts.CreateSample {
		tm := NewTaskManager(cleanRoot)
		meta, err := tm.InitTask("001-workspace-init", "Workspace Environment Verification", "Explore workspace and verify system setup")
		if err == nil && meta != nil {
			taskSlug = meta.ID
		}
	}

	return &InitWorkspaceResult{
		Success:    true,
		AegisPath:  aegisDir,
		AgentsPath: agentsPath,
		Gitignored: gitignored,
		TaskSlug:   taskSlug,
	}, nil
}

// ensureGitignoreEntry idempotently appends an entry to .gitignore in workspace root.
func ensureGitignoreEntry(workspaceRoot, entry string) bool {
	gitignorePath := filepath.Join(workspaceRoot, ".gitignore")
	var existingContent string

	if data, err := os.ReadFile(gitignorePath); err == nil {
		existingContent = string(data)
		lines := strings.Split(existingContent, "\n")
		for _, line := range lines {
			if strings.TrimSpace(line) == strings.TrimSpace(entry) {
				return true // Already present
			}
		}
	}

	var sb strings.Builder
	sb.WriteString(existingContent)
	if len(existingContent) > 0 && !strings.HasSuffix(existingContent, "\n") {
		sb.WriteString("\n")
	}
	sb.WriteString("\n# Aegis Copilot autonomous tasks\n")
	sb.WriteString(entry)
	sb.WriteString("\n")

	err := os.WriteFile(gitignorePath, []byte(sb.String()), 0644)
	return err == nil
}
