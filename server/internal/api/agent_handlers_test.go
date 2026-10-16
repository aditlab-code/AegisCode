package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/aditwicaksono/aegiscode/server/internal/agent"
)

func TestAgentHandlers(t *testing.T) {
	_, routes, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)


	// 1. GET /api/v1/agent/rules-status initially false
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/agent/rules-status", nil)
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if res["hasWorkspaceRules"] != false {
			t.Errorf("expected hasWorkspaceRules false, got %v", res["hasWorkspaceRules"])
		}
		if res["activePersona"] != agent.PresetKanna {
			t.Errorf("expected activePersona '%s', got %v", agent.PresetKanna, res["activePersona"])
		}
	}

	// 2. POST /api/v1/agent/init-rules
	{
		body, _ := json.Marshal(map[string]string{"preset": "kanna"})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/agent/init-rules", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var res map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}
		if res["success"] != true {
			t.Errorf("expected success true, got %v", res["success"])
		}
	}

	// 2b. POST /api/v1/agent/init-rules with custom content
	{
		body, _ := json.Marshal(map[string]string{
			"preset":  "kanna",
			"content": "# Overridden Rules\nCustom test content",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/agent/init-rules", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK for custom content, got %d", rec.Code)
		}
		saved, _ := os.ReadFile(filepath.Join(tempDir, "AGENTS.md"))
		if !strings.Contains(string(saved), "Overridden Rules") {
			t.Errorf("expected AGENTS.md to have custom content, got %s", string(saved))
		}
	}

	// 3. GET /api/v1/agent/rules-status now true
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/agent/rules-status", nil)
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, req)

		var res map[string]any
		_ = json.Unmarshal(rec.Body.Bytes(), &res)
		if res["hasWorkspaceRules"] != true {
			t.Errorf("expected hasWorkspaceRules true after init, got %v", res["hasWorkspaceRules"])
		}
	}

	// 4. POST /api/v1/agent/tasks (create new task)
	{
		body, _ := json.Marshal(map[string]string{
			"slug":   "test-auth",
			"title":  "Test Auth Flow",
			"prompt": "Create JWT authentication endpoints",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/agent/tasks", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
		}
	}

	// 5. GET /api/v1/agent/tasks (list tasks)
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/agent/tasks", nil)
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, req)

		var res struct {
			Tasks []agent.TaskMetadata `json:"tasks"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to unmarshal tasks list: %v", err)
		}
		if len(res.Tasks) != 1 {
			t.Fatalf("expected 1 task, got %d", len(res.Tasks))
		}
		if res.Tasks[0].ID != "test-auth" {
			t.Errorf("expected task ID 'test-auth', got '%s'", res.Tasks[0].ID)
		}
	}

	// 6. GET /api/v1/agent/task/test-auth
	{
		req := httptest.NewRequest(http.MethodGet, "/api/v1/agent/task/test-auth", nil)
		rec := httptest.NewRecorder()
		routes.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", rec.Code)
		}

		var res struct {
			Slug  string             `json:"slug"`
			Spec  string             `json:"spec"`
			Plan  string             `json:"plan"`
			Log   string             `json:"log"`
			Waves []agent.WaveStatus `json:"waves"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &res); err != nil {
			t.Fatalf("failed to unmarshal task detail: %v", err)
		}
		if res.Slug != "test-auth" || len(res.Waves) == 0 {
			t.Errorf("unexpected task detail: %+v", res)
		}
	}
}
