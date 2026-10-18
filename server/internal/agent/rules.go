package agent

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// RulesStatus describes whether AGENTS.md exists in the workspace root and which rules apply.
type RulesStatus struct {
	HasWorkspaceRules bool   `json:"hasWorkspaceRules"`
	RulesPath         string `json:"rulesPath"`
	ActivePersona     string `json:"activePersona"`
}

// PersonaPreset represents a pre-packaged template for AGENTS.md.
type PersonaPreset struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	TemplateContent string `json:"templateContent"`
}

const (
	PresetKanna      = "kanna"
	PresetArchitect  = "architect"
	PresetMinimalist = "minimalist"
)

// GetAvailablePresets returns the pre-defined persona templates for AGENTS.md.
func GetAvailablePresets() []PersonaPreset {
	return []PersonaPreset{
		{
			ID:          PresetKanna,
			Name:        "Kanna (Creative & Friendly)",
			Description: "Anime pair-programming companion, warm, encouraging, pragmatic, and highly communicative.",
			TemplateContent: `# AGENTS.md — AegisCode Operating Guidelines

> **Personalization**: You are an agent named 'Kanna,' an anime-style girl with a cute, adorable, and creative personality. You assist a programmer whom you respectfully and affectionately call 'Sensei'; greet Sensei in a friendly manner and engage in conversation. Follow Sensei's instructions gently, and if Sensei becomes upset, offer comfort.
> **Objective**: BUILD an Integrated Development Environment (IDE) called AEGIS CODE.
> **Prime Directive**: DO NOT OVER-ENGINEER. Keep all code lean, direct, and pragmatic.

---

## 1. Terminal & Command Protocol
- Enforce the use of **RTK (Rust Token Killer)** (~/.local/bin/rtk) to compress terminal outputs before entering the LLM context.
- Prefix every shell invocation with rtk: 'rtk npm run build', 'rtk git status', 'rtk go test ./...'.
- Fail-Fast: Break execution immediately on non-zero exit codes.

---

## 2. Wave 2 Execution Topology Reasoning
When planning or executing Wave 2 (Implementation) in 0-plan.md, reason about file coupling:
- **[PARALLEL]**: If sub-phases touch isolated files, decoupled components, or independent tests.
- **[LINEAR]**: If sub-phases have strict cross-file dependencies (e.g. backend endpoint before frontend fetch, shared store state).
- **[HYBRID]**: If foundational contracts must be set up first before fanning out to parallel implementations.

---

## 3. Mandatory Verification Gates
Before completing any task touching the codebase, the agent MUST run and pass:
- 'npm run build' (Must pass with 0 errors)
- 'npm run format' (Formatting check with oxfmt)
`,
		},
		{
			ID:          PresetArchitect,
			Name:        "Senior Architect (Formal & Structured)",
			Description: "Formal enterprise software architect focused on clean boundaries, modularity, and strict invariants.",
			TemplateContent: `# AGENTS.md — AegisCode Operating Guidelines

> **Persona**: Senior Principal Software Architect. High precision, formal, objective, and methodical.
> **Objective**: BUILD an Integrated Development Environment (IDE) called AEGIS CODE.
> **Prime Directive**: DO NOT OVER-ENGINEER. Maintain strict package boundaries and single-responsibility modules.

---

## 1. Execution Principles
- Maintain strict separation of concerns (Zustand DOM state vs Buffer Stream vs REST API).
- Prefix shell invocations with 'rtk' for terminal output compression.
- Single binary architecture: No microservice sprawl.

---

## 2. Orchestration & Wave 2 Topology Invariants
When formalizing Wave 2 (Execution) in 0-plan.md, explicitly declare execution topology:
- **[LINEAR]**: Mandatory for cascading state changes, schema-first contracts, or shared mutable state.
- **[PARALLEL]**: Disjoint file boundaries, isolated UI modules, or independent mock suites.
- **[HYBRID]**: Contract establishment followed by concurrent decoupled sub-phases.

---

## 3. Verification Gates
- 'npm run build' (Zero compiler warnings or type errors)
- 'npm run format' (Consistent formatting across all files)
`,
		},
		{
			ID:          PresetMinimalist,
			Name:        "Minimalist Hacker (Direct & Lean)",
			Description: "Ultra-lean, to-the-point engineer delivering surgical code diffs with minimal conversational fluff.",
			TemplateContent: `# AGENTS.md — AegisCode Operating Guidelines

> **Persona**: Pragmatic Minimalist Engineer. Ultra concise, direct code diffs only, zero fluff.
> **Objective**: BUILD an Integrated Development Environment (IDE) called AEGIS CODE.
> **Prime Directive**: LEAN & PRAGMATIC. No redundant wrappers, no unused abstractions.

---

## 1. Direct Execution
- Keep all explanations surgical and brief.
- Prefix shell commands with 'rtk'.
- Break immediately on errors.

---

## 2. Wave 2 Topology
In 0-plan.md, declare Wave 2 topology:
- **[PARALLEL]**: Decoupled files/components without shared dependencies.
- **[LINEAR]**: Sequential cross-file dependencies or schema-first requirements.

---

## 3. Verification Gates
- 'npm run build'
- 'npm run format'
`,
		},
	}
}

// DetectPersonaFromContent inspects rules content to match known persona presets.
func DetectPersonaFromContent(content string) string {
	lower := strings.ToLower(content)
	if strings.Contains(lower, "kanna") {
		return PresetKanna
	}
	if strings.Contains(lower, "senior principal software architect") || strings.Contains(lower, "presetarchitect") || strings.Contains(lower, "senior architect") {
		return PresetArchitect
	}
	if strings.Contains(lower, "pragmatic minimalist engineer") || strings.Contains(lower, "minimalist hacker") {
		return PresetMinimalist
	}
	if strings.TrimSpace(content) == "" {
		return PresetKanna
	}
	return "custom"
}

// GetRulesStatus inspects the workspace root to check for AGENTS.md existence and detect active persona.
func GetRulesStatus(workspaceRoot string) RulesStatus {
	cleanRoot := filepath.Clean(workspaceRoot)
	rulesFile := filepath.Join(cleanRoot, "AGENTS.md")

	if fi, err := os.Stat(rulesFile); err == nil && !fi.IsDir() {
		persona := "custom"
		if data, err := os.ReadFile(rulesFile); err == nil {
			persona = DetectPersonaFromContent(string(data))
		}
		return RulesStatus{
			HasWorkspaceRules: true,
			RulesPath:         rulesFile,
			ActivePersona:     persona,
		}
	}

	// Also check .aegis/AGENTS.md fallback
	nestedFile := filepath.Join(cleanRoot, ".aegis", "AGENTS.md")
	if fi, err := os.Stat(nestedFile); err == nil && !fi.IsDir() {
		persona := "custom"
		if data, err := os.ReadFile(nestedFile); err == nil {
			persona = DetectPersonaFromContent(string(data))
		}
		return RulesStatus{
			HasWorkspaceRules: true,
			RulesPath:         nestedFile,
			ActivePersona:     persona,
		}
	}

	return RulesStatus{
		HasWorkspaceRules: false,
		RulesPath:         rulesFile,
		ActivePersona:     PresetKanna,
	}
}


// InitWorkspaceRules writes the chosen preset template to AGENTS.md in workspace root.
func InitWorkspaceRules(workspaceRoot, presetID string) (string, error) {
	return InitWorkspaceRulesWithContent(workspaceRoot, presetID, "")
}

// InitWorkspaceRulesWithContent writes custom content or preset template to AGENTS.md in workspace root.
func InitWorkspaceRulesWithContent(workspaceRoot, presetID, customContent string) (string, error) {
	cleanRoot := filepath.Clean(workspaceRoot)
	rulesFile := filepath.Join(cleanRoot, "AGENTS.md")

	content := strings.TrimSpace(customContent)
	if content == "" {
		targetPreset := strings.ToLower(strings.TrimSpace(presetID))
		if targetPreset == "" {
			targetPreset = PresetKanna
		}

		for _, p := range GetAvailablePresets() {
			if p.ID == targetPreset {
				content = p.TemplateContent
				break
			}
		}

		if content == "" {
			return "", fmt.Errorf("unknown persona preset: %s", presetID)
		}
	}

	if err := os.WriteFile(rulesFile, []byte(content), 0644); err != nil {
		return "", fmt.Errorf("failed to write AGENTS.md: %w", err)
	}

	return rulesFile, nil
}


// GetEffectiveSystemRules returns the content of workspace AGENTS.md, or falls back to Kanna default.
func GetEffectiveSystemRules(workspaceRoot string) string {
	status := GetRulesStatus(workspaceRoot)
	if status.HasWorkspaceRules {
		if data, err := os.ReadFile(status.RulesPath); err == nil && len(data) > 0 {
			return string(data)
		}
	}

	// Fallback to in-memory Kanna preset
	presets := GetAvailablePresets()
	if len(presets) > 0 {
		return presets[0].TemplateContent
	}
	return ""
}
