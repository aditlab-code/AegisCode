package ai

import (
	"strings"
)

// SanitizeString strips outer quotes (single, double, backtick), whitespace, tabs, and newlines.
func SanitizeString(s string) string {
	return strings.Trim(s, "\"'` \t\r\n")
}

// ExtractTargetFile detects the target file path across diverse parameter keys and guards against ghost tabs.
func ExtractTargetFile(toolName string, args map[string]any) string {
	candidateKeys := []string{
		"targetFile",
		"TargetFile",
		"AbsolutePath",
		"filePath",
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
