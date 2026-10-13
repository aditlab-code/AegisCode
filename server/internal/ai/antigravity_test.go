package ai

import (
	"context"
	"strings"
	"testing"
)

func TestNewUUID(t *testing.T) {
	u1 := NewUUID()
	u2 := NewUUID()

	if u1 == "" || u2 == "" {
		t.Fatalf("expected non-empty UUID, got %q, %q", u1, u2)
	}
	if u1 == u2 {
		t.Fatalf("expected unique UUIDs, got duplicates: %q", u1)
	}
	parts := strings.Split(u1, "-")
	if len(parts) != 5 {
		t.Fatalf("expected 5 segments in UUID, got %d in %q", len(parts), u1)
	}
}

func TestListAntigravityModels(t *testing.T) {
	ctx := context.Background()
	models, err := ListAntigravityModels(ctx)
	if err != nil {
		t.Fatalf("unexpected error listing models: %v", err)
	}
	if len(models) == 0 {
		t.Fatalf("expected at least 1 model, got 0")
	}

	foundGemini := false
	for _, m := range models {
		if strings.Contains(m.ID, "gemini") || strings.Contains(m.ID, "claude") {
			foundGemini = true
			break
		}
	}
	if !foundGemini {
		t.Errorf("expected to find gemini or claude model, got: %+v", models)
	}
}

func TestListSkills(t *testing.T) {
	ctx := context.Background()

	// 1. Antigravity skills
	skills, err := ListSkills(ctx, "antigravity", "")
	if err != nil {
		t.Fatalf("unexpected error listing antigravity skills: %v", err)
	}
	if len(skills) < 5 {
		t.Fatalf("expected at least 5 skills, got %d", len(skills))
	}
	hasPlan := false
	for _, s := range skills {
		if s.Command == "/plan" {
			hasPlan = true
			break
		}
	}
	if !hasPlan {
		t.Errorf("expected /plan in antigravity skills list, got: %+v", skills)
	}

	// 2. Claude skills
	claudeSkills, err := ListSkills(ctx, "claude", "")
	if err != nil {
		t.Fatalf("unexpected error listing claude skills: %v", err)
	}
	hasCompact := false
	for _, s := range claudeSkills {
		if s.Command == "/compact" {
			hasCompact = true
			break
		}
	}
	if !hasCompact {
		t.Errorf("expected /compact in claude skills list, got: %+v", claudeSkills)
	}

	// 3. OpenCode skills
	opencodeSkills, err := ListSkills(ctx, "opencode", "")
	if err != nil {
		t.Fatalf("unexpected error listing opencode skills: %v", err)
	}
	hasBuild := false
	for _, s := range opencodeSkills {
		if s.Command == "/build" {
			hasBuild = true
			break
		}
	}
	if !hasBuild {
		t.Errorf("expected /build in opencode skills list, got: %+v", opencodeSkills)
	}
}

func TestStreamChatValidation(t *testing.T) {
	ctx := context.Background()
	err := StreamChat(ctx, StreamChatRequest{Prompt: ""}, func(string, any) error {
		return nil
	})
	if err == nil {
		t.Fatalf("expected error for empty prompt, got nil")
	}
}
