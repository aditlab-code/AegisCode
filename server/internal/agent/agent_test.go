package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTaskManager(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis-task-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	tm := NewTaskManager(tempDir)

	// 1. InitTask
	meta, err := tm.InitTask("feat-auth", "User Authentication", "Build JWT login flow")
	if err != nil {
		t.Fatalf("InitTask failed: %v", err)
	}
	if meta.ID != "feat-auth" {
		t.Errorf("expected ID 'feat-auth', got '%s'", meta.ID)
	}
	if meta.Title != "User Authentication" {
		t.Errorf("expected Title 'User Authentication', got '%s'", meta.Title)
	}
	if meta.Status != "PENDING" {
		t.Errorf("expected Status 'PENDING', got '%s'", meta.Status)
	}

	// 2. Verify files created on disk
	spec, plan, log, err := tm.GetTaskFiles("feat-auth")
	if err != nil {
		t.Fatalf("GetTaskFiles failed: %v", err)
	}
	if !strings.Contains(spec, "User Authentication") {
		t.Errorf("expected spec to contain title, got: %s", spec)
	}
	if !strings.Contains(plan, "Wave 1: Analyze & Discovery") {
		t.Errorf("expected plan to contain waves, got: %s", plan)
	}
	if !strings.Contains(log, "Runtime Log") {
		t.Errorf("expected log to contain runtime log header, got: %s", log)
	}

	// 3. UpdateTaskFile
	updatedPlan := `# Execution Plan: User Authentication

> **Task ID**: feat-auth  
> **Status**: IN_PROGRESS

---

### Wave 1: Analyze
- [x] MP-1.1: Codebase exploration
- [x] MP-1.2: Spec review

### Wave 2: Implementation
- [ ] MP-2.1: Implement handlers
`
	if err := tm.UpdateTaskFile("feat-auth", "0-plan.md", updatedPlan); err != nil {
		t.Fatalf("UpdateTaskFile failed: %v", err)
	}

	// 4. ExtractWaveStatus
	waves := ExtractWaveStatus(updatedPlan)
	if len(waves) != 2 {
		t.Fatalf("expected 2 waves, got %d", len(waves))
	}
	if waves[0].Status != "PASSED" || waves[0].PassedStep != 2 {
		t.Errorf("expected Wave 1 to be PASSED with 2/2 steps, got %+v", waves[0])
	}
	if waves[1].Status != "PENDING" || waves[1].TotalSteps != 1 {
		t.Errorf("expected Wave 2 to be PENDING with 0/1 steps, got %+v", waves[1])
	}

	// 5. ListTasks
	tasks, err := tm.ListTasks()
	if err != nil {
		t.Fatalf("ListTasks failed: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected 1 task in list, got %d", len(tasks))
	}
	if tasks[0].Status != "IN_PROGRESS" {
		t.Errorf("expected updated status 'IN_PROGRESS', got '%s'", tasks[0].Status)
	}
}

func TestRulesManager(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis-rules-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// 1. Initial status: No workspace rules
	status := GetRulesStatus(tempDir)
	if status.HasWorkspaceRules {
		t.Errorf("expected HasWorkspaceRules false in empty tempDir")
	}
	if status.ActivePersona != PresetKanna {
		t.Errorf("expected fallback persona '%s', got '%s'", PresetKanna, status.ActivePersona)
	}

	// 2. GetEffectiveSystemRules fallback
	defaultRules := GetEffectiveSystemRules(tempDir)
	if !strings.Contains(defaultRules, "Kanna") {
		t.Errorf("expected default rules to contain 'Kanna', got: %s", defaultRules)
	}

	// 3. InitWorkspaceRules with PresetArchitect
	filePath, err := InitWorkspaceRules(tempDir, PresetArchitect)
	if err != nil {
		t.Fatalf("InitWorkspaceRules failed: %v", err)
	}
	if filepath.Base(filePath) != "AGENTS.md" {
		t.Errorf("expected AGENTS.md, got %s", filePath)
	}

	// 4. Verify updated status
	statusAfter := GetRulesStatus(tempDir)
	if !statusAfter.HasWorkspaceRules {
		t.Errorf("expected HasWorkspaceRules true after init")
	}
	if statusAfter.ActivePersona != PresetArchitect {
		t.Errorf("expected ActivePersona '%s', got '%s'", PresetArchitect, statusAfter.ActivePersona)
	}

	// 5. GetEffectiveSystemRules should now return Architect content
	effective := GetEffectiveSystemRules(tempDir)
	if !strings.Contains(effective, "Senior Principal Software Architect") {
		t.Errorf("expected effective rules to contain Architect persona, got: %s", effective)
	}

	// 6. InitWorkspaceRulesWithContent overrides with custom content
	customContent := "# Custom Directives\nCustom rules for testing."
	customFile, err := InitWorkspaceRulesWithContent(tempDir, PresetKanna, customContent)
	if err != nil {
		t.Fatalf("InitWorkspaceRulesWithContent failed: %v", err)
	}
	data, _ := os.ReadFile(customFile)
	if string(data) != customContent {
		t.Errorf("expected custom content '%s', got '%s'", customContent, string(data))
	}
}

func TestWorkspaceInit(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis-ws-init-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// 1. Uninitialized status
	initialStatus := GetWorkspaceCopilotStatus(tempDir)
	if initialStatus.IsInitialized {
		t.Errorf("expected IsInitialized=false for empty directory")
	}
	if initialStatus.HasAegisDir {
		t.Errorf("expected HasAegisDir=false for empty directory")
	}

	// 2. Run InitWorkspace
	opts := InitWorkspaceOptions{
		Preset:         PresetMinimalist,
		AddToGitignore: true,
		CreateSample:   true,
	}
	result, err := InitWorkspace(tempDir, opts)
	if err != nil {
		t.Fatalf("InitWorkspace failed: %v", err)
	}
	if !result.Success {
		t.Errorf("expected result.Success=true")
	}
	if result.TaskSlug != "001-welcome" {
		t.Errorf("expected TaskSlug '001-welcome', got '%s'", result.TaskSlug)
	}
	if !result.Gitignored {
		t.Errorf("expected Gitignored=true")
	}

	// 3. Verify status after initialization
	afterStatus := GetWorkspaceCopilotStatus(tempDir)
	if !afterStatus.IsInitialized {
		t.Errorf("expected IsInitialized=true after InitWorkspace")
	}
	if !afterStatus.HasAegisDir {
		t.Errorf("expected HasAegisDir=true after InitWorkspace")
	}
	if !afterStatus.HasTasksDir {
		t.Errorf("expected HasTasksDir=true after InitWorkspace")
	}
	if !afterStatus.HasAgentsMd {
		t.Errorf("expected HasAgentsMd=true after InitWorkspace")
	}
	if afterStatus.TaskCount != 1 {
		t.Errorf("expected TaskCount=1, got %d", afterStatus.TaskCount)
	}

	// 4. Verify config.json exists
	cfgPath := filepath.Join(tempDir, ".aegis", "config.json")
	if _, err := os.Stat(cfgPath); os.IsNotExist(err) {
		t.Errorf("expected config.json to exist at %s", cfgPath)
	}

	// 5. Verify .gitignore content
	gitContent, err := os.ReadFile(filepath.Join(tempDir, ".gitignore"))
	if err != nil {
		t.Fatalf("failed to read .gitignore: %v", err)
	}
	if !strings.Contains(string(gitContent), ".aegis/tasks/") {
		t.Errorf("expected .gitignore to contain '.aegis/tasks/', got: %s", string(gitContent))
	}

	// 6. Test idempotent gitignore
	addedAgain := ensureGitignoreEntry(tempDir, ".aegis/tasks/")
	if !addedAgain {
		t.Errorf("expected ensureGitignoreEntry to return true for existing entry")
	}
}


