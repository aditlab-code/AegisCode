package debug

import (
	"path/filepath"
	"strconv"
	"strings"
)

// DebugAdapterConfig holds metadata and invocation recipes for a specific language's DAP engine.
type DebugAdapterConfig struct {
	Language   string
	AdapterID  string
	Binary     string
	InstallTip string
	Transport  string // "tcp" or "stdio"
	BuildArgs  func(target string, port int) []string
	LaunchArgs func(target string, args []string, env map[string]string, cwd string) map[string]any
}

// Registry maps canonical language identifiers to their respective debug adapter configurations.
var Registry = map[string]DebugAdapterConfig{
	"go": {
		Language:   "go",
		AdapterID:  "dlv-dap",
		Binary:     "dlv",
		InstallTip: "go install github.com/go-delve/delve/cmd/dlv@latest",
		Transport:  "tcp",
		BuildArgs: func(target string, port int) []string {
			return []string{"dap", "--listen=127.0.0.1:" + strconv.Itoa(port), "--check-go-version=false"}
		},
		LaunchArgs: func(target string, args []string, env map[string]string, cwd string) map[string]any {
			m := map[string]any{
				"mode":    "debug",
				"program": target,
			}
			if len(args) > 0 {
				m["args"] = args
			}
			if len(env) > 0 {
				m["env"] = env
			}
			if cwd != "" {
				m["cwd"] = cwd
			}
			return m
		},
	},
	"python": {
		Language:   "python",
		AdapterID:  "debugpy",
		Binary:     "python3",
		InstallTip: "pip install debugpy",
		Transport:  "tcp",
		BuildArgs: func(target string, port int) []string {
			return []string{"-m", "debugpy.adapter", "--host", "127.0.0.1", "--port", strconv.Itoa(port)}
		},
		LaunchArgs: func(target string, args []string, env map[string]string, cwd string) map[string]any {
			m := map[string]any{
				"program": target,
				"console": "internalConsole",
			}
			if len(args) > 0 {
				m["args"] = args
			}
			if len(env) > 0 {
				m["env"] = env
			}
			if cwd != "" {
				m["cwd"] = cwd
			}
			return m
		},
	},
	"cpp": {
		Language:   "cpp",
		AdapterID:  "lldb-dap",
		Binary:     "lldb-dap",
		InstallTip: "brew install llvm / sudo apt install lldb",
		Transport:  "stdio",
		BuildArgs: func(target string, port int) []string {
			return []string{}
		},
		LaunchArgs: func(target string, args []string, env map[string]string, cwd string) map[string]any {
			m := map[string]any{
				"program":     target,
				"stopOnEntry": false,
			}
			if len(args) > 0 {
				m["args"] = args
			}
			if len(env) > 0 {
				m["env"] = env
			}
			if cwd != "" {
				m["cwd"] = cwd
			}
			return m
		},
	},
}

// DetectLanguage auto-detects canonical language from explicit language hint or target file extension.
func DetectLanguage(explicitLang, targetPath string) string {
	if explicitLang != "" {
		lower := strings.ToLower(strings.TrimSpace(explicitLang))
		if _, ok := Registry[lower]; ok {
			return lower
		}
	}

	ext := strings.ToLower(filepath.Ext(targetPath))
	switch ext {
	case ".py", ".pyw":
		return "python"
	case ".cpp", ".cc", ".cxx", ".c", ".h", ".hpp":
		return "cpp"
	case ".go":
		return "go"
	default:
		return "go"
	}
}

// GetAdapter looks up adapter configuration for a given language.
func GetAdapter(lang string) (DebugAdapterConfig, bool) {
	cfg, ok := Registry[strings.ToLower(lang)]
	return cfg, ok
}
