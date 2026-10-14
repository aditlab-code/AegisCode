package ai

import (
	"strings"
)

// SanitizeString strips outer quotes (single, double, backtick), whitespace, tabs, and newlines.
func SanitizeString(s string) string {
	return strings.Trim(s, "\"'` \t\r\n")
}

// NormalizeToolName strips known MCP server prefixes from tool names.
func NormalizeToolName(name string) string {
	clean := strings.TrimPrefix(name, "mcp__codegraph__")
	clean = strings.TrimPrefix(clean, "codegraph:")
	clean = strings.TrimPrefix(clean, "codegraph_")
	return clean
}

// ExtractTargetFile detects the target file path across diverse parameter keys and guards against ghost tabs.
func ExtractTargetFile(toolName string, args map[string]any) string {
	toolName = NormalizeToolName(toolName)
	candidateKeys := []string{
		"targetFile",
		"TargetFile",
		"AbsolutePath",
		"filePath",
		"file_path",
		"rel_path",
		"path",
		"filename",
		"target",
	}

	cleanToolName := SanitizeString(toolName)
	for _, k := range candidateKeys {
		if raw, ok := args[k].(string); ok {
			clean := SanitizeString(raw)
			// Ghost tab guard: Path must not be empty and must not match the tool name itself.
			if clean != "" && clean != cleanToolName && clean != toolName {
				return clean
			}
		}
	}
	return ""
}

// GenerateSummary constructs a concise human-readable summary for a tool execution.
func GenerateSummary(name, targetFile string, args map[string]any) string {
	name = NormalizeToolName(name)
	if rawSummary, ok := args["toolSummary"].(string); ok && strings.TrimSpace(rawSummary) != "" {
		return SanitizeString(rawSummary)
	}
	if rawAction, ok := args["toolAction"].(string); ok && strings.TrimSpace(rawAction) != "" {
		return SanitizeString(rawAction)
	}

	switch name {
	case "view_file", "Read", "read_file":
		if targetFile != "" {
			return "Reading " + targetFile
		}
		return "Reading file"
	case "write_to_file", "Write", "replace_file_content", "create_file", "edit_file":
		if targetFile != "" {
			return "Writing " + targetFile
		}
		return "Modifying file"
	case "delete_file":
		if targetFile != "" {
			return "Deleting " + targetFile
		}
		return "Deleting file"
	case "run_command", "bash", "execute", "execute_command":
		cmd := ""
		if c, ok := args["CommandLine"].(string); ok && strings.TrimSpace(c) != "" {
			cmd = c
		} else if c, ok := args["command"].(string); ok && strings.TrimSpace(c) != "" {
			cmd = c
		} else if c, ok := args["cmd"].(string); ok && strings.TrimSpace(c) != "" {
			cmd = c
		}
		if cmd != "" {
			return "Running: " + SanitizeString(cmd)
		}
		return "Running terminal command"
	case "search_web":
		if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
			return "Web search: " + SanitizeString(q)
		}
		return "Web search"
	case "search_code", "grep", "code_search":
		if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
			return "Code search: " + SanitizeString(q)
		}
		return "Code search"
	case "explore":
		if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
			return "Exploring: " + SanitizeString(q)
		}
		return "Exploring codebase"
	case "node":
		if sym, ok := args["name"].(string); ok && strings.TrimSpace(sym) != "" {
			return "Inspecting symbol: " + SanitizeString(sym)
		}
		if f, ok := args["file"].(string); ok && strings.TrimSpace(f) != "" {
			return "Reading file: " + SanitizeString(f)
		}
		return "Inspecting symbol"
	case "search":
		if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
			return "Searching symbols: " + SanitizeString(q)
		}
		return "Searching symbols"
	case "callers":
		if sym, ok := args["symbol"].(string); ok && strings.TrimSpace(sym) != "" {
			return "Finding callers of " + SanitizeString(sym)
		}
		return "Finding symbol callers"
	case "callees":
		if sym, ok := args["symbol"].(string); ok && strings.TrimSpace(sym) != "" {
			return "Finding callees of " + SanitizeString(sym)
		}
		return "Finding symbol callees"
	case "impact":
		if sym, ok := args["symbol"].(string); ok && strings.TrimSpace(sym) != "" {
			return "Analyzing impact of " + SanitizeString(sym)
		}
		return "Analyzing symbol impact"
	case "affected":
		return "Finding affected tests"
	case "files":
		return "Listing indexed files"
	case "status":
		return "Checking CodeGraph status"
	case "context":
		if task, ok := args["task"].(string); ok && strings.TrimSpace(task) != "" {
			return "Building context for: " + SanitizeString(task)
		}
		return "Building task context"
	default:
		return name
	}
}

// CapOutput limits tool output size to prevent UI rendering churn or memory bloat.
func CapOutput(output string, maxLen int) string {
	if maxLen <= 0 {
		maxLen = 2500
	}
	if len(output) > maxLen {
		return output[:maxLen] + "\n... (output truncated)"
	}
	return output
}
