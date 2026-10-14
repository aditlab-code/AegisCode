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
	case "get_file_outline":
		f := targetFile
		if f == "" {
			if fp, ok := args["file_path"].(string); ok {
				f = fp
			}
		}
		if f != "" {
			return "Outlining " + SanitizeString(f)
		}
		return "Outlining file symbols"
	case "get_symbol_definition":
		sym, _ := args["name"].(string)
		if sym != "" {
			return "Looking up definition of " + SanitizeString(sym)
		}
		return "Looking up symbol definition"
	case "find_callers":
		fn, _ := args["function_name"].(string)
		if fn != "" {
			return "Finding callers of " + SanitizeString(fn)
		}
		return "Finding symbol callers"
	case "find_callees":
		fn, _ := args["function_name"].(string)
		if fn != "" {
			return "Finding callees of " + SanitizeString(fn)
		}
		return "Finding symbol callees"
	case "query_subgraph":
		sym, _ := args["root_symbol"].(string)
		if sym != "" {
			return "Exploring subgraph for " + SanitizeString(sym)
		}
		return "Exploring dependency subgraph"
	case "read_symbol_body":
		sym, _ := args["name"].(string)
		if sym != "" {
			return "Reading body of " + SanitizeString(sym)
		}
		return "Reading symbol body"
	case "get_diff_impact":
		return "Analyzing Git diff impact"
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
