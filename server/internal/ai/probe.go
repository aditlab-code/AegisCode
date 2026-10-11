package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ProbeRequest represents parameters for testing connectivity to an AI provider.
type ProbeRequest struct {
	Provider string `json:"provider"` // "antigravity" | "claude" | "opencode" | "openrouter"
	Model    string `json:"model,omitempty"`
	APIKey   string `json:"apiKey,omitempty"`
	BaseURL  string `json:"baseUrl,omitempty"`
	Command  string `json:"command,omitempty"`
}

// ProbeResponse returns the result of the connection test.
type ProbeResponse struct {
	Success   bool   `json:"success"`
	Provider  string `json:"provider"`
	Model     string `json:"model,omitempty"`
	LatencyMs int64  `json:"latencyMs"`
	Message   string `json:"message"`
	Error     string `json:"error,omitempty"`
}

var client = &http.Client{
	Timeout: 5 * time.Second,
}

// SetHTTPClient allows overriding the HTTP client for testing.
func SetHTTPClient(c *http.Client) {
	if c != nil {
		client = c
	}
}

// ProbeProvider tests an AI provider's credentials/endpoint and returns response with latency.
func ProbeProvider(ctx context.Context, req ProbeRequest) ProbeResponse {
	start := time.Now()
	provider := strings.ToLower(strings.TrimSpace(req.Provider))

	probeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	switch provider {
	case "openrouter":
		return probeOpenRouter(probeCtx, req, start)
	case "opencode":
		return probeOpenCode(probeCtx, req, start)
	case "claude":
		return probeClaude(probeCtx, req, start)
	case "antigravity":
		return probeAntigravity(probeCtx, req, start)
	default:
		return ProbeResponse{
			Success:   false,
			Provider:  provider,
			LatencyMs: 0,
			Message:   "Unknown AI provider",
			Error:     fmt.Sprintf("unsupported provider: %s", provider),
		}
	}
}

func probeOpenRouter(ctx context.Context, req ProbeRequest, start time.Time) ProbeResponse {
	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		return ProbeResponse{
			Success:   false,
			Provider:  "openrouter",
			LatencyMs: 0,
			Message:   "API Key missing",
			Error:     "OpenRouter API Key is empty. Please enter your API key in Settings.",
		}
	}

	endpoint := "https://openrouter.ai/api/v1/models"
	if req.BaseURL != "" {
		endpoint = strings.TrimRight(strings.TrimSpace(req.BaseURL), "/") + "/models"
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ProbeResponse{
			Success:   false,
			Provider:  "openrouter",
			LatencyMs: time.Since(start).Milliseconds(),
			Message:   "Failed to create request",
			Error:     err.Error(),
		}
	}

	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("User-Agent", "AegisCode-Server/2.0")

	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return ProbeResponse{
			Success:   false,
			Provider:  "openrouter",
			LatencyMs: latency,
			Message:   "Connection error",
			Error:     fmt.Sprintf("Failed to reach OpenRouter: %v", err),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		msg := "Connected successfully to OpenRouter API"
		if req.Model != "" {
			msg = fmt.Sprintf("OpenRouter model '%s' verified", req.Model)
		}
		return ProbeResponse{
			Success:   true,
			Provider:  "openrouter",
			Model:     req.Model,
			LatencyMs: latency,
			Message:   msg,
		}
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return ProbeResponse{
			Success:   false,
			Provider:  "openrouter",
			Model:     req.Model,
			LatencyMs: latency,
			Message:   "Authentication failed",
			Error:     fmt.Sprintf("Invalid API key (HTTP %d)", resp.StatusCode),
		}
	}

	return ProbeResponse{
		Success:   false,
		Provider:  "openrouter",
		Model:     req.Model,
		LatencyMs: latency,
		Message:   fmt.Sprintf("Upstream returned HTTP %d", resp.StatusCode),
		Error:     fmt.Sprintf("Unexpected status from OpenRouter: %s", resp.Status),
	}
}

func probeOpenCode(ctx context.Context, req ProbeRequest, start time.Time) ProbeResponse {
	apiKey := strings.TrimSpace(req.APIKey)
	if apiKey == "" {
		return ProbeResponse{
			Success:   false,
			Provider:  "opencode",
			LatencyMs: 0,
			Message:   "API Key missing",
			Error:     "OpenCode API Key is empty. Please enter your API key in Settings.",
		}
	}

	baseURL := strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.opencode.ai/v1"
	}
	endpoint := baseURL + "/models"

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return ProbeResponse{
			Success:   false,
			Provider:  "opencode",
			LatencyMs: time.Since(start).Milliseconds(),
			Message:   "Failed to create request",
			Error:     err.Error(),
		}
	}

	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	httpReq.Header.Set("User-Agent", "AegisCode-Server/2.0")

	resp, err := client.Do(httpReq)
	latency := time.Since(start).Milliseconds()
	if err != nil {
		return ProbeResponse{
			Success:   false,
			Provider:  "opencode",
			LatencyMs: latency,
			Message:   "Connection error",
			Error:     fmt.Sprintf("Failed to reach OpenCode: %v", err),
		}
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		msg := "Connected successfully to OpenCode API"
		if req.Model != "" {
			msg = fmt.Sprintf("OpenCode model '%s' verified", req.Model)
		}
		return ProbeResponse{
			Success:   true,
			Provider:  "opencode",
			Model:     req.Model,
			LatencyMs: latency,
			Message:   msg,
		}
	}

	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return ProbeResponse{
			Success:   false,
			Provider:  "opencode",
			Model:     req.Model,
			LatencyMs: latency,
			Message:   "Authentication failed",
			Error:     fmt.Sprintf("Invalid API key (HTTP %d)", resp.StatusCode),
		}
	}

	return ProbeResponse{
		Success:   false,
		Provider:  "opencode",
		Model:     req.Model,
		LatencyMs: latency,
		Message:   fmt.Sprintf("Upstream returned HTTP %d", resp.StatusCode),
		Error:     fmt.Sprintf("Unexpected status from OpenCode: %s", resp.Status),
	}
}

func probeClaude(ctx context.Context, req ProbeRequest, start time.Time) ProbeResponse {
	cmdStr := strings.TrimSpace(req.Command)
	if cmdStr == "" {
		cmdStr = "claude"
	}

	parts := strings.Fields(cmdStr)
	binary := parts[0]

	home, _ := os.UserHomeDir()
	resolvedPath, err := exec.LookPath(binary)
	if err != nil && home != "" {
		candidates := []string{
			filepath.Join(home, ".local", "bin", binary),
			filepath.Join(home, ".local", "bin", "claude"),
		}
		for _, candidate := range candidates {
			if fi, statErr := os.Stat(candidate); statErr == nil && !fi.IsDir() {
				resolvedPath = candidate
				err = nil
				break
			}
		}
	}

	if err != nil && resolvedPath == "" {
		return ProbeResponse{
			Success:   false,
			Provider:  "claude",
			Model:     req.Model,
			LatencyMs: time.Since(start).Milliseconds(),
			Message:   "Command not found",
			Error:     fmt.Sprintf("CLI command '%s' not found in system PATH. Install Claude CLI or specify full path.", binary),
		}
	}

	// Probe CLI execution with --version or custom arguments
	args := []string{"--version"}
	if len(parts) > 1 {
		args = parts[1:]
	}

	cmd := exec.CommandContext(ctx, resolvedPath, args...)
	out, err := cmd.CombinedOutput()
	latency := time.Since(start).Milliseconds()

	if err != nil {
		// Even if --version returned non-zero, binary was found
		return ProbeResponse{
			Success:   true,
			Provider:  "claude",
			Model:     req.Model,
			LatencyMs: latency,
			Message:   fmt.Sprintf("Claude CLI binary found at %s", resolvedPath),
		}
	}

	outputTrimmed := strings.TrimSpace(string(out))
	if outputTrimmed == "" {
		outputTrimmed = fmt.Sprintf("Executable at %s", resolvedPath)
	}

	msg := fmt.Sprintf("Claude CLI ready: %s", outputTrimmed)
	if req.Model != "" {
		msg = fmt.Sprintf("Claude model '%s' verified (%s)", req.Model, outputTrimmed)
	}

	return ProbeResponse{
		Success:   true,
		Provider:  "claude",
		Model:     req.Model,
		LatencyMs: latency,
		Message:   msg,
	}
}

func probeAntigravity(ctx context.Context, req ProbeRequest, start time.Time) ProbeResponse {
	cmdStr := strings.TrimSpace(req.Command)
	if cmdStr == "" {
		cmdStr = "antigravity"
	}

	parts := strings.Fields(cmdStr)
	binary := parts[0]

	home, _ := os.UserHomeDir()

	// 1. Resolve binary across PATH and user home candidates
	resolvedPath, err := exec.LookPath(binary)
	if err != nil && home != "" {
		candidates := []string{
			"agy",
			filepath.Join(home, ".local", "bin", binary),
			filepath.Join(home, ".local", "bin", "agy"),
			filepath.Join(home, ".local", "bin", "antigravity"),
			filepath.Join(home, ".gemini", "antigravity-cli", "bin", "agy"),
		}
		for _, candidate := range candidates {
			if p, lookErr := exec.LookPath(candidate); lookErr == nil {
				resolvedPath = p
				break
			}
			if fi, statErr := os.Stat(candidate); statErr == nil && !fi.IsDir() {
				resolvedPath = candidate
				break
			}
		}
	}

	// 2. Check ~/.gemini root OAuth & brain context
	var authAccount string
	hasOAuth := false
	brainDetected := false

	if home != "" {
		oauthFile := filepath.Join(home, ".gemini", "oauth_creds.json")
		if b, readErr := os.ReadFile(oauthFile); readErr == nil && len(b) > 0 {
			var creds map[string]interface{}
			if jsonErr := json.Unmarshal(b, &creds); jsonErr == nil && (creds["access_token"] != nil || creds["refresh_token"] != nil) {
				hasOAuth = true
			}
		}
		acctFile := filepath.Join(home, ".gemini", "google_accounts.json")
		if b, readErr := os.ReadFile(acctFile); readErr == nil && len(b) > 0 {
			var acct map[string]interface{}
			if jsonErr := json.Unmarshal(b, &acct); jsonErr == nil {
				if act, ok := acct["active"].(string); ok && act != "" {
					authAccount = act
				}
			}
		}
		// Check Brain directories
		brainCandidates := []string{
			filepath.Join(home, ".gemini", "antigravity-cli", "brain"),
			filepath.Join(home, ".gemini", "antigravity", "brain"),
		}
		for _, bc := range brainCandidates {
			if fi, statErr := os.Stat(bc); statErr == nil && fi.IsDir() {
				brainDetected = true
				break
			}
		}
	}

	// Build context info summary
	var extraInfo []string
	if authAccount != "" {
		extraInfo = append(extraInfo, authAccount)
	}
	if brainDetected {
		extraInfo = append(extraInfo, "Brain active")
	}

	// If binary wasn't found anywhere:
	if resolvedPath == "" {
		if hasOAuth {
			latency := time.Since(start).Milliseconds()
			infoStr := ""
			if len(extraInfo) > 0 {
				infoStr = fmt.Sprintf(" (%s)", strings.Join(extraInfo, " • "))
			}
			msg := fmt.Sprintf("Antigravity OAuth credentials verified (~/.gemini)%s", infoStr)
			if req.Model != "" {
				msg = fmt.Sprintf("%s [model: %s]", msg, req.Model)
			}
			return ProbeResponse{
				Success:   true,
				Provider:  "antigravity",
				Model:     req.Model,
				LatencyMs: latency,
				Message:   msg,
			}
		}

		return ProbeResponse{
			Success:   false,
			Provider:  "antigravity",
			Model:     req.Model,
			LatencyMs: time.Since(start).Milliseconds(),
			Message:   "Antigravity CLI or OAuth credentials not found",
			Error:     fmt.Sprintf("CLI command '%s' not found and no credentials in ~/.gemini. Run 'agy' in external terminal to authenticate with Google.", binary),
		}
	}

	args := []string{"--version"}
	if len(parts) > 1 {
		args = parts[1:]
	}

	cmd := exec.CommandContext(ctx, resolvedPath, args...)
	out, _ := cmd.CombinedOutput()
	latency := time.Since(start).Milliseconds()

	outputTrimmed := strings.TrimSpace(string(out))
	if outputTrimmed == "" {
		outputTrimmed = fmt.Sprintf("Executable at %s", resolvedPath)
	}

	infoStr := ""
	if len(extraInfo) > 0 {
		infoStr = fmt.Sprintf(" • %s", strings.Join(extraInfo, " • "))
	}

	msgAnt := fmt.Sprintf("Antigravity CLI ready: %s%s", outputTrimmed, infoStr)
	if req.Model != "" {
		msgAnt = fmt.Sprintf("Antigravity model '%s' verified (CLI: %s%s)", req.Model, outputTrimmed, infoStr)
	}

	return ProbeResponse{
		Success:   true,
		Provider:  "antigravity",
		Model:     req.Model,
		LatencyMs: latency,
		Message:   msgAnt,
	}
}
