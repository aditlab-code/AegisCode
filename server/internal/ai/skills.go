package ai

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// SkillItem represents a slash command or skill.
type SkillItem struct {
	Command     string `json:"command"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Scope       string `json:"scope,omitempty"`  // "system" | "workspace"
	Source      string `json:"source,omitempty"` // path atau label sumber
}

// ListSkills returns all available slash commands and skills for the given provider and workspace.
func ListSkills(ctx context.Context, provider string, workspaceDir string) ([]SkillItem, error) {
	p := strings.ToLower(strings.TrimSpace(provider))
	if p == "" {
		p = "antigravity"
	}

	home, _ := os.UserHomeDir()

	var result []SkillItem
	switch p {
	case "claude":
		result = listClaudeSkills(home, workspaceDir)
	case "opencode":
		result = listOpenCodeSkills(home, workspaceDir)
	case "openrouter":
		result = listOpenRouterSkills(workspaceDir)
	default:
		result = listAntigravitySkills(home, workspaceDir)
	}

	for _, cgSkill := range codeGraphSkills() {
		if !hasCommand(result, cgSkill.Command) {
			result = append(result, cgSkill)
		}
	}
	return result, nil
}

func codeGraphSkills() []SkillItem {
	return []SkillItem{
		{Command: "/outline", Name: "Outline File Symbols", Description: "Retrieve compact outline of symbols in a file without bodies (< 150 tokens)", Scope: "system", Source: "CodeGraph · Native"},
		{Command: "/def", Name: "Symbol Definition", Description: "Look up symbol definition, signature, and docstrings (< 80 tokens)", Scope: "system", Source: "CodeGraph · Native"},
		{Command: "/callers", Name: "Find Callers", Description: "Find inbound callers across workspace (< 150 tokens)", Scope: "system", Source: "CodeGraph · Native"},
		{Command: "/subgraph", Name: "Dependency Subgraph", Description: "Explore surgical 2-hop dependency subgraph around a symbol (< 400 tokens)", Scope: "system", Source: "CodeGraph · Native"},
		{Command: "/impact", Name: "Git Diff Impact", Description: "Analyze git diff hunks and impacted caller topology", Scope: "system", Source: "CodeGraph · Native"},
	}
}

// listAntigravitySkills discovers skills for the Antigravity provider.
func listAntigravitySkills(home, workspaceDir string) []SkillItem {
	skills := []SkillItem{
		{Command: "/plan", Name: "Implementation Plan", Description: "Phased implementation task breakdown", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/spec", Name: "Specification", Description: "Create requirements specification & feature architecture", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/review", Name: "Code Review", Description: "Audit code quality, clean code standards, & security", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/debug", Name: "Debugging", Description: "Root cause analysis & bug fixing", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/simplify", Name: "Simplification", Description: "Refactoring & code structure simplification", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/goal", Name: "Autonomous Goal", Description: "Autonomous long-running task execution until completion", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/schedule", Name: "Scheduler", Description: "Run timer-based or cron-scheduled instructions", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/browser", Name: "Web Browser", Description: "Web browsing & live web interactions", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/grill-me", Name: "Interactive Interview", Description: "Interactive design interview and plan alignment", Scope: "system", Source: "Builtin · Antigravity"},
		{Command: "/boost", Name: "Deep Boost", Description: "Strategic planning & rigorous multi-perspective verification", Scope: "system", Source: "Builtin · Antigravity"},
	}

	// 1. System-level skills
	if home != "" {
		sysDirs := []string{
			filepath.Join(home, ".gemini", "antigravity-cli", "builtin", "skills"),
			filepath.Join(home, ".gemini", "antigravity-cli", "skills"),
			filepath.Join(home, ".gemini", "skills"),
		}
		for _, dir := range sysDirs {
			skills = scanSkillsFromDir(skills, dir, "system", "System · Antigravity")
		}
	}

	// 2. Workspace-level skills
	if workspaceDir != "" {
		wsDirs := []string{
			filepath.Join(workspaceDir, ".gemini", "skills"),
			filepath.Join(workspaceDir, ".agents", "skills"),
			filepath.Join(workspaceDir, ".agent", "skills"),
		}
		for _, dir := range wsDirs {
			skills = scanSkillsFromDir(skills, dir, "workspace", "Workspace · "+filepath.Base(dir))
		}
	}

	return skills
}

// listClaudeSkills discovers skills for Claude Code.
func listClaudeSkills(home, workspaceDir string) []SkillItem {
	skills := []SkillItem{
		{Command: "/help", Name: "Help & Commands", Description: "View all Claude Code commands and usage", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/compact", Name: "Compact Conversation", Description: "Clear conversation history but retain session context", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/clear", Name: "Clear History", Description: "Reset active conversation and clear context", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/init", Name: "Initialize Project", Description: "Analyze codebase and create project guide", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/cost", Name: "Cost & Token Usage", Description: "Display token usage statistics and cost", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/doctor", Name: "Health Check", Description: "Check Claude Code environment and health", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/review", Name: "Code Review", Description: "Review diffs and inspect code changes", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/bug", Name: "Bug Diagnostic", Description: "Investigate and report bugs with repro steps", Scope: "system", Source: "Builtin · Claude"},
		{Command: "/terminal-setup", Name: "Terminal Integration", Description: "Configure terminal emulator and keybindings", Scope: "system", Source: "Builtin · Claude"},
	}

	// 1. System-level commands (~/.claude/commands/*.md)
	if home != "" {
		sysCmdDir := filepath.Join(home, ".claude", "commands")
		skills = scanMarkdownCommandsFromDir(skills, sysCmdDir, "system", "System · Claude")
	}

	// 2. Workspace-level commands (.claude/commands/*.md or .claude/skills/*/SKILL.md)
	if workspaceDir != "" {
		wsCmdDir := filepath.Join(workspaceDir, ".claude", "commands")
		skills = scanMarkdownCommandsFromDir(skills, wsCmdDir, "workspace", "Workspace · .claude/commands")

		wsSkillDir := filepath.Join(workspaceDir, ".claude", "skills")
		skills = scanSkillsFromDir(skills, wsSkillDir, "workspace", "Workspace · .claude/skills")
	}

	return skills
}

// listOpenCodeSkills discovers skills for OpenCode.
func listOpenCodeSkills(home, workspaceDir string) []SkillItem {
	skills := []SkillItem{
		{Command: "/plan", Name: "Implementation Plan", Description: "Plan multi-step development tasks", Scope: "system", Source: "Builtin · OpenCode"},
		{Command: "/build", Name: "Build Project", Description: "Compile project and verify build artifacts", Scope: "system", Source: "Builtin · OpenCode"},
		{Command: "/test", Name: "Run Tests", Description: "Execute unit and integration test suites", Scope: "system", Source: "Builtin · OpenCode"},
		{Command: "/review", Name: "Code Review", Description: "Inspect changes and verify code standards", Scope: "system", Source: "Builtin · OpenCode"},
	}

	// 1. System-level skills
	if home != "" {
		sysDirs := []string{
			filepath.Join(home, ".opencode", "skills"),
			filepath.Join(home, ".config", "opencode", "skills"),
		}
		for _, dir := range sysDirs {
			skills = scanSkillsFromDir(skills, dir, "system", "System · OpenCode")
		}
	}

	// 2. Workspace-level skills
	if workspaceDir != "" {
		wsDirs := []string{
			filepath.Join(workspaceDir, ".opencode", "skills"),
		}
		for _, dir := range wsDirs {
			skills = scanSkillsFromDir(skills, dir, "workspace", "Workspace · .opencode/skills")
		}
		wsCmdDir := filepath.Join(workspaceDir, ".opencode", "commands")
		skills = scanMarkdownCommandsFromDir(skills, wsCmdDir, "workspace", "Workspace · .opencode/commands")
	}

	return skills
}

// listOpenRouterSkills discovers skills for OpenRouter.
func listOpenRouterSkills(workspaceDir string) []SkillItem {
	skills := []SkillItem{
		{Command: "/plan", Name: "Plan Architecture", Description: "Deconstruct requirements into actionable steps", Scope: "system", Source: "Builtin · OpenRouter"},
		{Command: "/review", Name: "Review Code", Description: "Audit code quality, performance, and best practices", Scope: "system", Source: "Builtin · OpenRouter"},
		{Command: "/debug", Name: "Debug Problem", Description: "Trace errors and isolate root cause", Scope: "system", Source: "Builtin · OpenRouter"},
		{Command: "/explain", Name: "Explain Codebase", Description: "Provide clear architectural explanation of code", Scope: "system", Source: "Builtin · OpenRouter"},
		{Command: "/refactor", Name: "Refactor Logic", Description: "Clean up code structure without behavior change", Scope: "system", Source: "Builtin · OpenRouter"},
	}

	// Workspace-level skills
	if workspaceDir != "" {
		wsSkillDir := filepath.Join(workspaceDir, ".skills")
		skills = scanSkillsFromDir(skills, wsSkillDir, "workspace", "Workspace · .skills")

		wsPromptDir := filepath.Join(workspaceDir, ".prompts")
		skills = scanMarkdownCommandsFromDir(skills, wsPromptDir, "workspace", "Workspace · .prompts")
	}

	return skills
}

// scanSkillsFromDir scans directories structured as <dir>/<skill-name>/SKILL.md or <dir>/<skill-name>.md.
func scanSkillsFromDir(existing []SkillItem, baseDir, scope, source string) []SkillItem {
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return existing
	}

	for _, entry := range entries {
		var skillFile string
		var rawName string

		if entry.IsDir() {
			rawName = entry.Name()
			candidate := filepath.Join(baseDir, rawName, "SKILL.md")
			if fi, err := os.Stat(candidate); err == nil && !fi.IsDir() {
				skillFile = candidate
			}
		} else if strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			rawName = strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
			skillFile = filepath.Join(baseDir, entry.Name())
		}

		if rawName == "" {
			continue
		}

		cmdName := "/" + strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(rawName, "_", "-"), " ", "-"))
		if hasCommand(existing, cmdName) {
			continue
		}

		name, desc := parseSkillMetadata(skillFile, rawName)
		existing = append(existing, SkillItem{
			Command:     cmdName,
			Name:        name,
			Description: desc,
			Scope:       scope,
			Source:      source,
		})
	}

	return existing
}

// scanMarkdownCommandsFromDir scans a flat directory of markdown files (e.g., commands/*.md).
func scanMarkdownCommandsFromDir(existing []SkillItem, dir, scope, source string) []SkillItem {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return existing
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
			continue
		}

		base := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		cmdName := "/" + strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(base, "_", "-"), " ", "-"))
		if hasCommand(existing, cmdName) {
			continue
		}

		filePath := filepath.Join(dir, entry.Name())
		name, desc := parseSkillMetadata(filePath, base)
		existing = append(existing, SkillItem{
			Command:     cmdName,
			Name:        name,
			Description: desc,
			Scope:       scope,
			Source:      source,
		})
	}

	return existing
}

// parseSkillMetadata reads YAML frontmatter or Markdown headers to extract name and description.
func parseSkillMetadata(filePath, fallbackName string) (string, string) {
	defaultName := strings.Title(strings.ReplaceAll(strings.ReplaceAll(fallbackName, "-", " "), "_", " "))
	defaultDesc := fmt.Sprintf("Skill %s", fallbackName)

	if filePath == "" {
		return defaultName, defaultDesc
	}

	file, err := os.Open(filePath)
	if err != nil {
		return defaultName, defaultDesc
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	inFrontmatter := false
	frontmatterChecked := false
	var parsedName, parsedDesc string

	lineCount := 0
	for scanner.Scan() && lineCount < 40 {
		line := strings.TrimSpace(scanner.Text())
		lineCount++

		if lineCount == 1 && line == "---" {
			inFrontmatter = true
			frontmatterChecked = true
			continue
		}

		if inFrontmatter {
			if line == "---" {
				inFrontmatter = false
				break
			}
			lower := strings.ToLower(line)
			if strings.HasPrefix(lower, "name:") {
				parsedName = strings.TrimSpace(strings.Trim(line[5:], `"'`))
			} else if strings.HasPrefix(lower, "description:") {
				parsedDesc = strings.TrimSpace(strings.Trim(line[12:], `"'`))
			}
			continue
		}

		// Non-frontmatter markdown header detection
		if !frontmatterChecked && strings.HasPrefix(line, "# ") {
			parsedName = strings.TrimSpace(strings.TrimPrefix(line, "# "))
		} else if parsedName != "" && parsedDesc == "" && line != "" && !strings.HasPrefix(line, "#") {
			parsedDesc = line
		}
	}

	if parsedName == "" {
		parsedName = defaultName
	}
	if parsedDesc == "" {
		parsedDesc = defaultDesc
	}

	return parsedName, parsedDesc
}

func hasCommand(items []SkillItem, cmd string) bool {
	for _, item := range items {
		if strings.EqualFold(item.Command, cmd) {
			return true
		}
	}
	return false
}
