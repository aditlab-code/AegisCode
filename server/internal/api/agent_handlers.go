package api

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/agent"
)

// getTaskManager returns the synchronized agent.TaskManager anchored to the active workspace.
func (s *Server) getTaskManager() *agent.TaskManager {
	var rootPath string
	if s.ws != nil {
		rootPath, _ = s.ws.GetRoot()
	}
	cleanRoot := filepath.Clean(rootPath)

	s.taskMu.Lock()
	defer s.taskMu.Unlock()

	if s.taskManager == nil || s.taskManager.WorkspaceRoot() != cleanRoot {
		s.taskManager = agent.NewTaskManager(cleanRoot)
	}
	return s.taskManager
}

// BroadcastCopilotEvent publishes an agent / copilot event to the central EventHub.
func (s *Server) BroadcastCopilotEvent(eventType string, payload any) {
	if s.eventHub != nil {
		s.eventHub.Publish("copilot", eventType, payload)
	}
}

type InitRulesRequest struct {
	Preset  string `json:"preset"`
	Content string `json:"content,omitempty"`
}

func (s *Server) handleAgentInitRules(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var rootPath string
	if s.ws != nil {
		rootPath, _ = s.ws.GetRoot()
	}
	if rootPath == "" {
		jsonError(w, http.StatusBadRequest, "no active workspace opened")
		return
	}

	var req InitRulesRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	filePath, err := agent.InitWorkspaceRulesWithContent(rootPath, req.Preset, req.Content)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to initialize rules: "+err.Error())
		return
	}

	s.BroadcastCopilotEvent("rules_updated", map[string]any{
		"path":   filePath,
		"preset": req.Preset,
	})

	jsonResponse(w, http.StatusOK, map[string]any{
		"success": true,
		"path":    filePath,
	})
}

func (s *Server) handleAgentRulesStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var rootPath string
	if s.ws != nil {
		rootPath, _ = s.ws.GetRoot()
	}

	status := agent.GetRulesStatus(rootPath)
	presets := agent.GetAvailablePresets()

	jsonResponse(w, http.StatusOK, map[string]any{
		"hasWorkspaceRules": status.HasWorkspaceRules,
		"rulesPath":         status.RulesPath,
		"activePersona":     status.ActivePersona,
		"presets":           presets,
	})
}

func (s *Server) handleAgentWorkspaceStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var rootPath string
	if s.ws != nil {
		rootPath, _ = s.ws.GetRoot()
	}

	status := agent.GetWorkspaceCopilotStatus(rootPath)
	presets := agent.GetAvailablePresets()

	jsonResponse(w, http.StatusOK, map[string]any{
		"isInitialized": status.IsInitialized,
		"hasAegisDir":   status.HasAegisDir,
		"hasTasksDir":   status.HasTasksDir,
		"hasAgentsMd":   status.HasAgentsMd,
		"rulesPath":     status.RulesPath,
		"activePersona": status.ActivePersona,
		"taskCount":     status.TaskCount,
		"presets":       presets,
	})
}

func (s *Server) handleAgentInitWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var rootPath string
	if s.ws != nil {
		rootPath, _ = s.ws.GetRoot()
	}
	if rootPath == "" {
		jsonError(w, http.StatusBadRequest, "no active workspace opened")
		return
	}

	var req agent.InitWorkspaceOptions
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	res, err := agent.InitWorkspace(rootPath, req)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to initialize copilot workspace: "+err.Error())
		return
	}

	s.BroadcastCopilotEvent("workspace_initialized", res)
	jsonResponse(w, http.StatusOK, res)
}

type CreateTaskRequest struct {
	Slug   string `json:"slug"`
	Title  string `json:"title"`
	Prompt string `json:"prompt"`
}

func (s *Server) handleAgentTasks(w http.ResponseWriter, r *http.Request) {
	tm := s.getTaskManager()

	switch r.Method {
	case http.MethodGet:
		tasks, err := tm.ListTasks()
		if err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to list tasks: "+err.Error())
			return
		}
		jsonResponse(w, http.StatusOK, map[string]any{
			"tasks": tasks,
		})

	case http.MethodPost:
		var req CreateTaskRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}

		meta, err := tm.InitTask(req.Slug, req.Title, req.Prompt)
		if err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to initialize task: "+err.Error())
			return
		}

		s.BroadcastCopilotEvent("task_created", meta)

		jsonResponse(w, http.StatusOK, meta)

	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

type UpdateTaskFileRequest struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
}

func (s *Server) handleAgentTaskDetail(w http.ResponseWriter, r *http.Request) {
	tm := s.getTaskManager()
	slug := strings.TrimPrefix(r.URL.Path, "/api/v1/agent/task/")
	slug = strings.TrimSpace(slug)
	if slug == "" {
		jsonError(w, http.StatusBadRequest, "task slug is required")
		return
	}

	switch r.Method {
	case http.MethodGet:
		spec, plan, log, err := tm.GetTaskFiles(slug)
		if err != nil {
			jsonError(w, http.StatusNotFound, err.Error())
			return
		}

		waves := agent.ExtractWaveStatus(plan)

		jsonResponse(w, http.StatusOK, map[string]any{
			"slug":  slug,
			"spec":  spec,
			"plan":  plan,
			"log":   log,
			"waves": waves,
		})

	case http.MethodPut:
		var req UpdateTaskFileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
			return
		}

		if err := tm.UpdateTaskFile(slug, req.Filename, req.Content); err != nil {
			jsonError(w, http.StatusInternalServerError, "failed to update task file: "+err.Error())
			return
		}

		// If plan was updated, broadcast new wave status
		if req.Filename == "0-plan.md" {
			waves := agent.ExtractWaveStatus(req.Content)
			s.BroadcastCopilotEvent("waves_updated", map[string]any{
				"slug":  slug,
				"waves": waves,
			})
		}

		jsonResponse(w, http.StatusOK, map[string]any{
			"success": true,
		})

	default:
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}
