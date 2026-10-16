package agent

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// TaskMetadata contains summary information of a task residing in .aegis/tasks/<slug>.
type TaskMetadata struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Status    string    `json:"status"` // "PENDING" | "IN_PROGRESS" | "PASSED" | "BLOCKED"
	CreatedAt time.Time `json:"createdAt"`
	Path      string    `json:"path"` // Relative path: .aegis/tasks/<slug>
}

// WaveStatus captures the status of an execution wave extracted from 0-plan.md.
type WaveStatus struct {
	WaveNumber int    `json:"waveNumber"`
	Name       string `json:"name"`
	TotalSteps int    `json:"totalSteps"`
	PassedStep int    `json:"passedSteps"`
	Status     string `json:"status"` // "PENDING" | "IN_PROGRESS" | "PASSED" | "BLOCKED"
}

// TaskManager coordinates thread-safe file operations for workspace tasks in .aegis/tasks/.
type TaskManager struct {
	workspaceRoot string
	mu            sync.RWMutex
}

// NewTaskManager creates a new TaskManager anchored to a workspace root directory.
func NewTaskManager(workspaceRoot string) *TaskManager {
	return &TaskManager{
		workspaceRoot: filepath.Clean(workspaceRoot),
	}
}

var safeSlugRegex = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// SanitizeSlug normalizes and validates a task slug to prevent path traversal.
func SanitizeSlug(raw string) string {
	trimmed := strings.TrimSpace(raw)
	trimmed = strings.ToLower(trimmed)
	// Replace spaces and special characters with dash
	safe := regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(trimmed, "-")
	safe = strings.Trim(safe, "-")
	if safe == "" {
		safe = fmt.Sprintf("task-%s", time.Now().Format("20060102-150405"))
	}
	return safe
}

// TasksDir returns the absolute path to .aegis/tasks.
func (tm *TaskManager) TasksDir() string {
	return filepath.Join(tm.workspaceRoot, ".aegis", "tasks")
}

// TaskDir returns the absolute path to a specific task folder.
func (tm *TaskManager) TaskDir(slug string) (string, error) {
	cleanSlug := SanitizeSlug(slug)
	if !safeSlugRegex.MatchString(cleanSlug) {
		return "", fmt.Errorf("invalid task slug: %s", slug)
	}
	taskPath := filepath.Join(tm.TasksDir(), cleanSlug)
	// Guard against traversal
	rel, err := filepath.Rel(tm.TasksDir(), taskPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return "", errors.New("path traversal detected in task slug")
	}
	return taskPath, nil
}

// InitTask scaffolds a new task folder and generates initial 0-spec.md, 0-plan.md, and 0-log.md.
func (tm *TaskManager) InitTask(slug, title, prompt string) (*TaskMetadata, error) {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	cleanSlug := SanitizeSlug(slug)
	taskDir, err := tm.TaskDir(cleanSlug)
	if err != nil {
		return nil, err
	}

	cleanTitle := strings.TrimSpace(title)
	if cleanTitle == "" {
		cleanTitle = cleanSlug
	}

	if err := os.MkdirAll(taskDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create task directory: %w", err)
	}

	specPath := filepath.Join(taskDir, "0-spec.md")
	planPath := filepath.Join(taskDir, "0-plan.md")
	logPath := filepath.Join(taskDir, "0-log.md")

	createdAt := time.Now()

	// 1. Generate 0-spec.md if not exists
	if _, err := os.Stat(specPath); os.IsNotExist(err) {
		specContent := fmt.Sprintf(`# Task Specification: %s

> **Task ID**: %s  
> **Created At**: %s  
> **Initial Prompt**: %s  
> **Protocol**: Aegis Copilot Autonomous Orchestrator

---

## 1. Scope & Objective
- %s

## 2. Invariants & Boundaries
- All modifications must strictly adhere to existing project design tokens and UI primitives.
- Zero raw unicode emojis in TSX/CSS code.
- Mandatory gate verification: 'npm run build' and 'npm run format'.
`, cleanTitle, cleanSlug, createdAt.Format(time.RFC3339), strings.TrimSpace(prompt), strings.TrimSpace(prompt))
		if err := os.WriteFile(specPath, []byte(specContent), 0644); err != nil {
			return nil, fmt.Errorf("failed to write 0-spec.md: %w", err)
		}
	}

	// 2. Generate 0-plan.md if not exists
	if _, err := os.Stat(planPath); os.IsNotExist(err) {
		planContent := fmt.Sprintf(`# Execution Plan: %s

> **Task ID**: %s  
> **Status**: PENDING

---

## Waves & Micro-Phases

### Wave 1: Analyze & Discovery
- [ ] MP-1.1: Codebase exploration and dependency mapping
- [ ] MP-1.2: Specification contract validation

### Wave 2: Execution & Implementation
- [ ] MP-2.1: Atomic core modifications
- [ ] MP-2.2: Unit test coverage

### Wave 3: Validation & Gates
- [ ] MP-3.1: Full compiler build check ('npm run build')
- [ ] MP-3.2: Formatting verification ('npm run format')
`, cleanTitle, cleanSlug)
		if err := os.WriteFile(planPath, []byte(planContent), 0644); err != nil {
			return nil, fmt.Errorf("failed to write 0-plan.md: %w", err)
		}
	}

	// 3. Generate 0-log.md if not exists
	if _, err := os.Stat(logPath); os.IsNotExist(err) {
		logContent := fmt.Sprintf(`# Runtime Log & 4-Step CoT: %s

> **Task ID**: %s  
> **Initialized**: %s

---

## Step Execution History
- Task initialized and workspace scaffolding ready.
`, cleanTitle, cleanSlug, createdAt.Format(time.RFC3339))
		if err := os.WriteFile(logPath, []byte(logContent), 0644); err != nil {
			return nil, fmt.Errorf("failed to write 0-log.md: %w", err)
		}
	}

	relPath, _ := filepath.Rel(tm.workspaceRoot, taskDir)
	return &TaskMetadata{
		ID:        cleanSlug,
		Title:     cleanTitle,
		Status:    "PENDING",
		CreatedAt: createdAt,
		Path:      relPath,
	}, nil
}

// ListTasks scans .aegis/tasks and returns all available tasks sorted by modification time.
func (tm *TaskManager) ListTasks() ([]TaskMetadata, error) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	tasksDir := tm.TasksDir()
	entries, err := os.ReadDir(tasksDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []TaskMetadata{}, nil
		}
		return nil, fmt.Errorf("failed to read tasks directory: %w", err)
	}

	var results []TaskMetadata
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		slug := entry.Name()
		taskDir := filepath.Join(tasksDir, slug)

		// Parse plan.md for status and title if available
		planPath := filepath.Join(taskDir, "0-plan.md")
		title := slug
		status := "PENDING"

		if data, err := os.ReadFile(planPath); err == nil {
			text := string(data)
			for _, line := range strings.Split(text, "\n") {
				if strings.HasPrefix(line, "# Execution Plan:") {
					title = strings.TrimSpace(strings.TrimPrefix(line, "# Execution Plan:"))
				}
				if strings.Contains(line, "**Status**:") {
					parts := strings.Split(line, ":")
					if len(parts) >= 2 {
						status = strings.TrimSpace(parts[1])
					}
				}
			}
		}

		info, err := entry.Info()
		createdAt := time.Now()
		if err == nil {
			createdAt = info.ModTime()
		}

		relPath, _ := filepath.Rel(tm.workspaceRoot, taskDir)
		results = append(results, TaskMetadata{
			ID:        slug,
			Title:     title,
			Status:    status,
			CreatedAt: createdAt,
			Path:      relPath,
		})
	}

	// Sort descending by creation / modification time
	sort.Slice(results, func(i, j int) bool {
		return results[i].CreatedAt.After(results[j].CreatedAt)
	})

	return results, nil
}

// GetTaskFiles returns the contents of 0-spec.md, 0-plan.md, and 0-log.md for a given slug.
func (tm *TaskManager) GetTaskFiles(slug string) (spec, plan, log string, err error) {
	tm.mu.RLock()
	defer tm.mu.RUnlock()

	taskDir, err := tm.TaskDir(slug)
	if err != nil {
		return "", "", "", err
	}

	readSafe := func(filename string) string {
		data, _ := os.ReadFile(filepath.Join(taskDir, filename))
		return string(data)
	}

	spec = readSafe("0-spec.md")
	plan = readSafe("0-plan.md")
	log = readSafe("0-log.md")

	if spec == "" && plan == "" && log == "" {
		return "", "", "", fmt.Errorf("task '%s' not found or empty", slug)
	}

	return spec, plan, log, nil
}

// UpdateTaskFile updates one of the standard task files safely.
func (tm *TaskManager) UpdateTaskFile(slug, filename, content string) error {
	tm.mu.Lock()
	defer tm.mu.Unlock()

	taskDir, err := tm.TaskDir(slug)
	if err != nil {
		return err
	}

	cleanFilename := filepath.Base(filename)
	switch cleanFilename {
	case "0-spec.md", "0-plan.md", "0-log.md":
		// Allowed file names
	default:
		return fmt.Errorf("unsupported task file: %s (must be 0-spec.md, 0-plan.md, or 0-log.md)", filename)
	}

	targetPath := filepath.Join(taskDir, cleanFilename)
	return os.WriteFile(targetPath, []byte(content), 0644)
}

// ExtractWaveStatus parses lines in 0-plan.md to determine the progress and status of each wave.
func ExtractWaveStatus(planContent string) []WaveStatus {
	lines := strings.Split(planContent, "\n")
	var waves []WaveStatus
	var currentWave *WaveStatus

	waveRegex := regexp.MustCompile(`(?i)^###\s*Wave\s*(\d+)[:\s]*(.*)`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if matches := waveRegex.FindStringSubmatch(trimmed); len(matches) >= 3 {
			if currentWave != nil {
				finalizeWave(currentWave)
				waves = append(waves, *currentWave)
			}
			var waveNum int
			fmt.Sscanf(matches[1], "%d", &waveNum)
			currentWave = &WaveStatus{
				WaveNumber: waveNum,
				Name:       strings.TrimSpace(matches[2]),
				Status:     "PENDING",
			}
			continue
		}

		if currentWave != nil {
			if strings.HasPrefix(trimmed, "- [x]") || strings.HasPrefix(trimmed, "- [X]") {
				currentWave.TotalSteps++
				currentWave.PassedStep++
			} else if strings.HasPrefix(trimmed, "- [ ]") {
				currentWave.TotalSteps++
			}
		}
	}

	if currentWave != nil {
		finalizeWave(currentWave)
		waves = append(waves, *currentWave)
	}

	return waves
}

func finalizeWave(w *WaveStatus) {
	if w.TotalSteps == 0 {
		w.Status = "PENDING"
		return
	}
	if w.PassedStep == w.TotalSteps {
		w.Status = "PASSED"
	} else if w.PassedStep > 0 {
		w.Status = "IN_PROGRESS"
	} else {
		w.Status = "PENDING"
	}
}
