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
			return "Membaca " + targetFile
		}
		return "Membaca berkas"
	case "write_to_file", "Write", "replace_file_content", "create_file", "edit_file":
		if targetFile != "" {
			return "Menulis " + targetFile
		}
		return "Mengubah berkas"
	case "delete_file":
		if targetFile != "" {
			return "Menghapus " + targetFile
		}
		return "Menghapus berkas"
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
			return "Menjalankan: " + SanitizeString(cmd)
		}
		return "Menjalankan perintah terminal"
	case "search_web":
		if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
			return "Mencari web: " + SanitizeString(q)
		}
		return "Pencarian web"
	case "search_code", "grep", "code_search":
		if q, ok := args["query"].(string); ok && strings.TrimSpace(q) != "" {
			return "Mencari kode: " + SanitizeString(q)
		}
		return "Pencarian kode"
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
		return output[:maxLen] + "\n... (output dipotong)"
	}
	return output
}
