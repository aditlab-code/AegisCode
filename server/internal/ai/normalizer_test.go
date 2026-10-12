package ai

import (
	"strings"
	"testing"
)

func TestSanitizeString(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"", ""},
		{"   ", ""},
		{`"hello"`, "hello"},
		{`'world'`, "world"},
		{"`path/to/file`", "path/to/file"},
		{" \t\n`\"spaced\"`\r\n ", "spaced"},
		{"clean_string", "clean_string"},
	}

	for _, tt := range tests {
		actual := SanitizeString(tt.input)
		if actual != tt.expected {
			t.Errorf("SanitizeString(%q) = %q, expected %q", tt.input, actual, tt.expected)
		}
	}
}

func TestExtractTargetFile(t *testing.T) {
	tests := []struct {
		name     string
		toolName string
		args     map[string]any
		expected string
	}{
		{
			name:     "extracts from AbsolutePath",
			toolName: "view_file",
			args:     map[string]any{"AbsolutePath": "/root/project/main.go"},
			expected: "/root/project/main.go",
		},
		{
			name:     "extracts from TargetFile with quotes",
			toolName: "write_to_file",
			args:     map[string]any{"TargetFile": `"src/app.ts"`},
			expected: "src/app.ts",
		},
		{
			name:     "extracts from targetFile",
			toolName: "replace_file_content",
			args:     map[string]any{"targetFile": "pkg/store.go"},
			expected: "pkg/store.go",
		},
		{
			name:     "extracts from filePath",
			toolName: "read_file",
			args:     map[string]any{"filePath": "config.json"},
			expected: "config.json",
		},
		{
			name:     "extracts from path",
			toolName: "delete_file",
			args:     map[string]any{"path": "temp.log"},
			expected: "temp.log",
		},
		{
			name:     "extracts from filename",
			toolName: "view_file",
			args:     map[string]any{"filename": "README.md"},
			expected: "README.md",
		},
		{
			name:     "ghost tab guard: empty path",
			toolName: "view_file",
			args:     map[string]any{"AbsolutePath": "   "},
			expected: "",
		},
		{
			name:     "ghost tab guard: path equals toolName",
			toolName: "view_file",
			args:     map[string]any{"AbsolutePath": "view_file"},
			expected: "",
		},
		{
			name:     "ghost tab guard: path equals quoted toolName",
			toolName: "view_file",
			args:     map[string]any{"path": `"view_file"`},
			expected: "",
		},
		{
			name:     "missing keys entirely",
			toolName: "run_command",
			args:     map[string]any{"CommandLine": "ls -la"},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := ExtractTargetFile(tt.toolName, tt.args)
			if actual != tt.expected {
				t.Errorf("ExtractTargetFile(%q, %+v) = %q, expected %q", tt.toolName, tt.args, actual, tt.expected)
			}
		})
	}
}

func TestGenerateSummary(t *testing.T) {
	// 1. Explicit toolSummary takes highest precedence
	t.Run("explicit toolSummary", func(t *testing.T) {
		args := map[string]any{"toolSummary": "Building backend server"}
		s := GenerateSummary("run_command", "", args)
		if s != "Building backend server" {
			t.Errorf("expected 'Building backend server', got %q", s)
		}
	})

	// 2. Explicit toolAction fallback
	t.Run("explicit toolAction", func(t *testing.T) {
		args := map[string]any{"toolAction": "Reading configuration"}
		s := GenerateSummary("view_file", "config.json", args)
		if s != "Reading configuration" {
			t.Errorf("expected 'Reading configuration', got %q", s)
		}
	})

	// 3. Synthesized view_file
	t.Run("view_file synthesis", func(t *testing.T) {
		s1 := GenerateSummary("view_file", "main.go", map[string]any{})
		if s1 != "Reading main.go" {
			t.Errorf("expected 'Reading main.go', got %q", s1)
		}
		s2 := GenerateSummary("view_file", "", map[string]any{})
		if s2 != "Reading file" {
			t.Errorf("expected 'Reading file', got %q", s2)
		}
	})

	// 4. Synthesized write_to_file
	t.Run("write_to_file synthesis", func(t *testing.T) {
		s1 := GenerateSummary("write_to_file", "src/index.ts", map[string]any{})
		if s1 != "Writing src/index.ts" {
			t.Errorf("expected 'Writing src/index.ts', got %q", s1)
		}
		s2 := GenerateSummary("write_to_file", "", map[string]any{})
		if s2 != "Modifying file" {
			t.Errorf("expected 'Modifying file', got %q", s2)
		}
	})

	// 5. Synthesized delete_file
	t.Run("delete_file synthesis", func(t *testing.T) {
		s1 := GenerateSummary("delete_file", "old.log", map[string]any{})
		if s1 != "Deleting old.log" {
			t.Errorf("expected 'Deleting old.log', got %q", s1)
		}
		s2 := GenerateSummary("delete_file", "", map[string]any{})
		if s2 != "Deleting file" {
			t.Errorf("expected 'Deleting file', got %q", s2)
		}
	})

	// 6. Synthesized run_command with CommandLine / command / cmd
	t.Run("run_command synthesis", func(t *testing.T) {
		s1 := GenerateSummary("run_command", "", map[string]any{"CommandLine": "go test ./..."})
		if s1 != "Running: go test ./..." {
			t.Errorf("expected 'Running: go test ./...', got %q", s1)
		}
		s2 := GenerateSummary("run_command", "", map[string]any{"command": "npm run build"})
		if s2 != "Running: npm run build" {
			t.Errorf("expected 'Running: npm run build', got %q", s2)
		}
		s3 := GenerateSummary("run_command", "", map[string]any{})
		if s3 != "Running terminal command" {
			t.Errorf("expected 'Running terminal command', got %q", s3)
		}
	})

	// 7. Search tools
	t.Run("search tools", func(t *testing.T) {
		s1 := GenerateSummary("search_web", "", map[string]any{"query": "Golang 1.24"})
		if s1 != "Web search: Golang 1.24" {
			t.Errorf("expected 'Web search: Golang 1.24', got %q", s1)
		}
		s2 := GenerateSummary("grep", "", map[string]any{"query": "HandleAntigravity"})
		if s2 != "Code search: HandleAntigravity" {
			t.Errorf("expected 'Code search: HandleAntigravity', got %q", s2)
		}
	})

	// 8. Fallback to name
	t.Run("fallback tool name", func(t *testing.T) {
		s := GenerateSummary("custom_unknown_tool", "", map[string]any{})
		if s != "custom_unknown_tool" {
			t.Errorf("expected 'custom_unknown_tool', got %q", s)
		}
	})
}

func TestCapOutput(t *testing.T) {
	short := "Hello world"
	if CapOutput(short, 2500) != short {
		t.Errorf("expected unchanged short output")
	}

	longOutput := strings.Repeat("A", 3000)
	capped := CapOutput(longOutput, 2500)
	if len(capped) <= 2500 {
		t.Errorf("expected capped output to contain suffix")
	}
	if !strings.HasSuffix(capped, "\n... (output truncated)") {
		t.Errorf("expected capped output to end with suffix, got: %s", capped[len(capped)-30:])
	}
	if !strings.HasPrefix(capped, strings.Repeat("A", 2500)) {
		t.Errorf("expected capped output to start with 2500 A's")
	}
}
