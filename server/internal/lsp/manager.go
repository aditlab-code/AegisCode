package lsp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Manager manages language servers, document states, and client dispatching.
type Manager struct {
	workspacePath string
	clients       map[string]*Client
	clientMu      sync.Mutex
	docVersions   map[string]int
	versionMu     sync.Mutex
	diagSubs      map[chan PublishDiagnosticsParams]struct{}
	diagMu        sync.RWMutex
	customServers map[string]string
	customMu      sync.RWMutex
}

func NewManager(workspacePath string) *Manager {
	return &Manager{
		workspacePath: workspacePath,
		clients:       make(map[string]*Client),
		docVersions:   make(map[string]int),
		diagSubs:      make(map[chan PublishDiagnosticsParams]struct{}),
		customServers: make(map[string]string),
	}
}

// SetCustomServers updates user-configured language server binary paths.
func (m *Manager) SetCustomServers(servers map[string]string) {
	m.customMu.Lock()
	defer m.customMu.Unlock()
	m.customServers = make(map[string]string)
	for k, v := range servers {
		m.customServers[normalizeLang(k)] = v
	}
}

// SetWorkspace updates the root workspace directory.
func (m *Manager) SetWorkspace(newPath string) {
	m.clientMu.Lock()
	defer m.clientMu.Unlock()
	m.workspacePath = newPath
	// Close existing clients so they re-initialize with new root
	for lang, client := range m.clients {
		_ = client.Close()
		delete(m.clients, lang)
	}
}

// normalizeLang standardizes language identifiers.
func normalizeLang(lang string) string {
	l := strings.ToLower(strings.TrimSpace(lang))
	switch l {
	case "ts", "typescript", "typescriptreact", "tsx":
		return "typescript"
	case "js", "javascript", "javascriptreact", "jsx":
		return "javascript"
	case "py", "python":
		return "python"
	case "golang", "go":
		return "go"
	case "rs", "rust":
		return "rust"
	case "c", "cpp", "c++", "cxx", "cc", "h", "hpp":
		return "cpp"
	case "json":
		return "json"
	case "html", "htm":
		return "html"
	case "css":
		return "css"
	default:
		return l
	}
}

// clientGroup maps related languages to a shared client group.
func clientGroup(normLang string) string {
	switch normLang {
	case "javascript":
		return "typescript"
	default:
		return normLang
	}
}

type langCandidate struct {
	binaryName string
	args       []string
}

type langSpec struct {
	candidates     []langCandidate
	installCommand string
}

func (m *Manager) getLangSpec(normLang string) langSpec {
	switch normLang {
	case "go":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "gopls", args: nil},
			},
			installCommand: "go install golang.org/x/tools/gopls@latest",
		}

	case "typescript", "javascript":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "vtsls", args: []string{"--stdio"}},
				{binaryName: "typescript-language-server", args: []string{"--stdio"}},
			},
			installCommand: "npm install -g @vtsls/language-server (or npm install -g typescript-language-server typescript)",
		}

	case "python":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "pyright-langserver", args: []string{"--stdio"}},
				{binaryName: "pyright", args: []string{"--stdio"}},
				{binaryName: "ruff", args: []string{"server"}},
				{binaryName: "pylsp", args: nil},
			},
			installCommand: "pip install pyright (or npm install -g pyright)",
		}

	case "rust":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "rust-analyzer", args: nil},
			},
			installCommand: "rustup component add rust-analyzer (or cargo install rust-analyzer)",
		}

	case "cpp":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "clangd", args: nil},
			},
			installCommand: "brew install llvm (macOS) or sudo apt-get install clangd (Linux)",
		}

	case "json":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "vscode-json-language-server", args: []string{"--stdio"}},
			},
			installCommand: "npm install -g vscode-langservers-extracted",
		}

	case "html":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "vscode-html-language-server", args: []string{"--stdio"}},
			},
			installCommand: "npm install -g vscode-langservers-extracted",
		}

	case "css":
		return langSpec{
			candidates: []langCandidate{
				{binaryName: "vscode-css-language-server", args: []string{"--stdio"}},
			},
			installCommand: "npm install -g vscode-langservers-extracted",
		}

	default:
		return langSpec{
			candidates:     []langCandidate{{binaryName: normLang, args: nil}},
			installCommand: "",
		}
	}
}

// FindServerBinary searches for a language server binary on the host machine.
func (m *Manager) FindServerBinary(lang string) (string, []string, error) {
	norm := normalizeLang(lang)

	// 1. Check user custom override
	m.customMu.RLock()
	customPath, hasCustom := m.customServers[norm]
	m.customMu.RUnlock()

	if hasCustom && customPath != "" {
		if _, err := os.Stat(customPath); err == nil {
			spec := m.getLangSpec(norm)
			var args []string
			if len(spec.candidates) > 0 {
				args = spec.candidates[0].args
			}
			return customPath, args, nil
		}
		if p, err := exec.LookPath(customPath); err == nil {
			spec := m.getLangSpec(norm)
			var args []string
			if len(spec.candidates) > 0 {
				args = spec.candidates[0].args
			}
			return p, args, nil
		}
	}

	spec := m.getLangSpec(norm)
	homeDir, _ := os.UserHomeDir()

	for _, cand := range spec.candidates {
		// A. Check PATH
		if p, err := exec.LookPath(cand.binaryName); err == nil {
			return p, cand.args, nil
		}

		// B. Check workspace local binaries (e.g. node_modules/.bin, .venv/bin)
		if m.workspacePath != "" {
			localCandDirs := []string{
				filepath.Join(m.workspacePath, "node_modules", ".bin"),
				filepath.Join(m.workspacePath, ".venv", "bin"),
				filepath.Join(m.workspacePath, "venv", "bin"),
				filepath.Join(m.workspacePath, ".conda", "bin"),
				filepath.Join(m.workspacePath, "env", "bin"),
				// Windows venv support
				filepath.Join(m.workspacePath, ".venv", "Scripts"),
				filepath.Join(m.workspacePath, "venv", "Scripts"),
			}
			for _, dir := range localCandDirs {
				p := filepath.Join(dir, cand.binaryName)
				if _, err := os.Stat(p); err == nil {
					return p, cand.args, nil
				}
				// Windows .exe / .cmd check
				if _, err := os.Stat(p + ".cmd"); err == nil {
					return p + ".cmd", cand.args, nil
				}
				if _, err := os.Stat(p + ".exe"); err == nil {
					return p + ".exe", cand.args, nil
				}
			}
		}

		// C. Check environment-specific standard paths
		extraDirs := []string{}
		if homeDir != "" {
			extraDirs = append(extraDirs,
				filepath.Join(homeDir, "go", "bin"),
				filepath.Join(homeDir, ".cargo", "bin"),
				filepath.Join(homeDir, ".local", "bin"),
				filepath.Join(homeDir, ".npm-global", "bin"),
				filepath.Join(homeDir, ".pyenv", "shims"),
				filepath.Join(homeDir, "miniconda3", "bin"),
				filepath.Join(homeDir, "anaconda3", "bin"),
			)
			// NVM check
			nvmBase := filepath.Join(homeDir, ".nvm", "versions", "node")
			if entries, err := os.ReadDir(nvmBase); err == nil {
				for _, entry := range entries {
					if entry.IsDir() {
						extraDirs = append(extraDirs, filepath.Join(nvmBase, entry.Name(), "bin"))
					}
				}
			}
		}

		// Go GOPATH check
		if gopath := os.Getenv("GOPATH"); gopath != "" {
			extraDirs = append(extraDirs, filepath.Join(gopath, "bin"))
		}

		// macOS Homebrew & LLVM standard locations
		extraDirs = append(extraDirs,
			"/opt/homebrew/bin",
			"/usr/local/bin",
			"/usr/bin",
			"/usr/local/opt/llvm/bin",
			"/opt/homebrew/opt/llvm/bin",
		)

		for _, dir := range extraDirs {
			p := filepath.Join(dir, cand.binaryName)
			if _, err := os.Stat(p); err == nil {
				return p, cand.args, nil
			}
			if _, err := os.Stat(p + ".cmd"); err == nil {
				return p + ".cmd", cand.args, nil
			}
			if _, err := os.Stat(p + ".exe"); err == nil {
				return p + ".exe", cand.args, nil
			}
		}
	}

	hint := spec.installCommand
	if hint != "" {
		return "", nil, fmt.Errorf("language server for '%s' not found. Install via: %s", lang, hint)
	}
	return "", nil, fmt.Errorf("unsupported or missing language server for '%s'", lang)
}

// IsLanguageSupported checks if a language server binary exists.
func (m *Manager) IsLanguageSupported(lang string) bool {
	_, _, err := m.FindServerBinary(lang)
	return err == nil
}

// GetStatus returns the operational status and installation commands of all standard language servers.
func (m *Manager) GetStatus() []LanguageServerStatus {
	standardLangs := []string{"go", "typescript", "python", "rust", "cpp", "json", "html", "css"}
	result := make([]LanguageServerStatus, 0, len(standardLangs))

	m.clientMu.Lock()
	activeClients := make(map[string]*Client)
	for k, v := range m.clients {
		activeClients[k] = v
	}
	m.clientMu.Unlock()

	for _, lang := range standardLangs {
		norm := normalizeLang(lang)
		group := clientGroup(norm)
		spec := m.getLangSpec(norm)

		primaryBin := norm
		if len(spec.candidates) > 0 {
			primaryBin = spec.candidates[0].binaryName
		}

		client, isRunning := activeClients[group]
		if isRunning && client != nil && client.IsAlive() {
			result = append(result, LanguageServerStatus{
				Language:       lang,
				BinaryName:     primaryBin,
				Path:           "active",
				Status:         "running",
				ActivePID:      client.PID(),
				InstallCommand: spec.installCommand,
			})
			continue
		}

		binPath, _, err := m.FindServerBinary(lang)
		if err == nil && binPath != "" {
			result = append(result, LanguageServerStatus{
				Language:       lang,
				BinaryName:     filepath.Base(binPath),
				Path:           binPath,
				Status:         "available",
				InstallCommand: spec.installCommand,
			})
		} else {
			result = append(result, LanguageServerStatus{
				Language:       lang,
				BinaryName:     primaryBin,
				Path:           "",
				Status:         "not_found",
				InstallCommand: spec.installCommand,
			})
		}
	}

	return result
}

// GetOrStartClient returns an initialized LSP client for the given language.
func (m *Manager) GetOrStartClient(lang string) (*Client, error) {
	norm := normalizeLang(lang)
	group := clientGroup(norm)

	m.clientMu.Lock()
	defer m.clientMu.Unlock()

	client, exists := m.clients[group]
	if exists && client != nil {
		if client.IsAlive() {
			return client, nil
		}
		// Client died; clean up and respawn
		_ = client.Close()
		delete(m.clients, group)
	}

	bin, args, err := m.FindServerBinary(norm)
	if err != nil {
		return nil, err
	}

	newClient, err := StartClient(bin, args, m.broadcastDiagnostic, func() {
		m.clientMu.Lock()
		delete(m.clients, group)
		m.clientMu.Unlock()
	})
	if err != nil {
		return nil, err
	}

	// Initialize the LSP server with full modern capabilities
	initCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rootURI := m.filePathToURI(m.workspacePath)
	workspaceName := filepath.Base(m.workspacePath)
	if workspaceName == "" || workspaceName == "." || workspaceName == "/" {
		workspaceName = "workspace"
	}

	initParams := InitializeParams{
		ProcessID: os.Getpid(),
		RootURI:   rootURI,
		RootPath:  m.workspacePath,
		WorkspaceFolders: []WorkspaceFolder{
			{Name: workspaceName, URI: rootURI},
		},
		Capabilities: ClientCapabilities{
			Workspace: map[string]any{
				"workspaceFolders": true,
				"configuration":    true,
			},
			TextDocument: map[string]any{
				"synchronization": map[string]any{
					"dynamicRegistration": false,
					"willSave":            false,
					"didSave":             true,
				},
				"completion": map[string]any{
					"dynamicRegistration": false,
					"snippetSupport":      true,
				},
				"hover": map[string]any{
					"dynamicRegistration": false,
					"contentFormat":       []string{"markdown", "plaintext"},
				},
				"definition": map[string]any{
					"dynamicRegistration": false,
					"linkSupport":         true,
				},
				"formatting": map[string]any{
					"dynamicRegistration": false,
				},
			},
		},
	}

	if _, err := newClient.Call(initCtx, "initialize", initParams); err != nil {
		_ = newClient.Close()
		return nil, fmt.Errorf("failed to initialize lsp (%s): %w", bin, err)
	}

	_ = newClient.Notify("initialized", struct{}{})

	m.clients[group] = newClient
	return newClient, nil
}

func (m *Manager) filePathToURI(relOrAbsPath string) string {
	abs := relOrAbsPath
	if !filepath.IsAbs(abs) && m.workspacePath != "" {
		abs = filepath.Join(m.workspacePath, relOrAbsPath)
	}
	abs = filepath.Clean(abs)
	slashPath := filepath.ToSlash(abs)
	if !strings.HasPrefix(slashPath, "/") {
		slashPath = "/" + slashPath
	}
	u := url.URL{
		Scheme: "file",
		Path:   slashPath,
	}
	return u.String()
}

// DidOpen notifies the language server that a document has opened.
func (m *Manager) DidOpen(relPath string, content string, lang string) error {
	client, err := m.GetOrStartClient(lang)
	if err != nil {
		return err
	}

	uri := m.filePathToURI(relPath)
	m.versionMu.Lock()
	m.docVersions[uri] = 1
	m.versionMu.Unlock()

	params := DidOpenTextDocumentParams{
		TextDocument: TextDocumentItem{
			URI:        uri,
			LanguageID: lang,
			Version:    1,
			Text:       content,
		},
	}

	return client.Notify("textDocument/didOpen", params)
}

// DidChange notifies the language server that a document has changed.
func (m *Manager) DidChange(relPath string, content string, lang string) error {
	client, err := m.GetOrStartClient(lang)
	if err != nil {
		return err
	}

	uri := m.filePathToURI(relPath)
	m.versionMu.Lock()
	version := m.docVersions[uri] + 1
	m.docVersions[uri] = version
	m.versionMu.Unlock()

	params := DidChangeTextDocumentParams{
		TextDocument: VersionedTextDocumentIdentifier{
			URI:     uri,
			Version: version,
		},
		ContentChanges: []TextDocumentContentChangeEvent{
			{Text: content},
		},
	}

	return client.Notify("textDocument/didChange", params)
}

// Completion queries the language server for completions at a line & character position (0-indexed).
func (m *Manager) Completion(relPath string, line int, char int, lang string) ([]CompletionItem, error) {
	client, err := m.GetOrStartClient(lang)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	uri := m.filePathToURI(relPath)
	params := CompletionParams{
		TextDocument: PositionTextDocumentIdentifier{URI: uri},
		Position:     Position{Line: line, Character: char},
	}

	resp, err := client.Call(ctx, "textDocument/completion", params)
	if err != nil {
		return nil, err
	}

	if len(resp.Result) == 0 || string(resp.Result) == "null" {
		return []CompletionItem{}, nil
	}

	// Result can be []CompletionItem or CompletionList
	var items []CompletionItem
	if err := json.Unmarshal(resp.Result, &items); err == nil {
		return items, nil
	}

	var list CompletionList
	if err := json.Unmarshal(resp.Result, &list); err == nil {
		return list.Items, nil
	}

	return []CompletionItem{}, nil
}

// Hover queries the language server for hover info.
func (m *Manager) Hover(relPath string, line int, char int, lang string) (*Hover, error) {
	client, err := m.GetOrStartClient(lang)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	uri := m.filePathToURI(relPath)
	params := HoverParams{
		TextDocument: PositionTextDocumentIdentifier{URI: uri},
		Position:     Position{Line: line, Character: char},
	}

	resp, err := client.Call(ctx, "textDocument/hover", params)
	if err != nil {
		return nil, err
	}

	if len(resp.Result) == 0 || string(resp.Result) == "null" {
		return nil, nil
	}

	var hover Hover
	if err := json.Unmarshal(resp.Result, &hover); err != nil {
		return nil, err
	}

	return &hover, nil
}

// Definition queries the language server for definition location.
func (m *Manager) Definition(relPath string, line int, char int, lang string) ([]Location, error) {
	client, err := m.GetOrStartClient(lang)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	uri := m.filePathToURI(relPath)
	params := DefinitionParams{
		TextDocument: PositionTextDocumentIdentifier{URI: uri},
		Position:     Position{Line: line, Character: char},
	}

	resp, err := client.Call(ctx, "textDocument/definition", params)
	if err != nil {
		return nil, err
	}

	if len(resp.Result) == 0 || string(resp.Result) == "null" {
		return []Location{}, nil
	}

	// 1. Single Location
	var loc Location
	if err := json.Unmarshal(resp.Result, &loc); err == nil && loc.URI != "" {
		return []Location{loc}, nil
	}

	// 2. Array of Location
	var locs []Location
	if err := json.Unmarshal(resp.Result, &locs); err == nil && len(locs) > 0 {
		return locs, nil
	}

	// 3. Array of LocationLink (modern protocol)
	var links []LocationLink
	if err := json.Unmarshal(resp.Result, &links); err == nil && len(links) > 0 {
		out := make([]Location, 0, len(links))
		for _, link := range links {
			out = append(out, Location{
				URI:   link.TargetURI,
				Range: link.TargetSelectionRange,
			})
		}
		return out, nil
	}

	return []Location{}, nil
}

// Formatting formats a document via textDocument/formatting.
func (m *Manager) Formatting(relPath string, tabSize int, insertSpaces bool, lang string) ([]TextEdit, error) {
	client, err := m.GetOrStartClient(lang)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	uri := m.filePathToURI(relPath)
	params := DocumentFormattingParams{
		TextDocument: TextDocumentIdentifier{URI: uri},
		Options: FormattingOptions{
			TabSize:      tabSize,
			InsertSpaces: insertSpaces,
		},
	}

	resp, err := client.Call(ctx, "textDocument/formatting", params)
	if err != nil {
		return nil, err
	}

	if len(resp.Result) == 0 || string(resp.Result) == "null" {
		return []TextEdit{}, nil
	}

	var edits []TextEdit
	if err := json.Unmarshal(resp.Result, &edits); err != nil {
		return []TextEdit{}, nil
	}

	return edits, nil
}

// SubscribeDiagnostics registers an event listener for compiler diagnostics.
func (m *Manager) SubscribeDiagnostics() (<-chan PublishDiagnosticsParams, func()) {
	ch := make(chan PublishDiagnosticsParams, 64)
	m.diagMu.Lock()
	m.diagSubs[ch] = struct{}{}
	m.diagMu.Unlock()

	unsubscribe := func() {
		m.diagMu.Lock()
		delete(m.diagSubs, ch)
		m.diagMu.Unlock()
	}

	return ch, unsubscribe
}

func (m *Manager) broadcastDiagnostic(p PublishDiagnosticsParams) {
	m.diagMu.RLock()
	defer m.diagMu.RUnlock()

	for ch := range m.diagSubs {
		select {
		case ch <- p:
		default:
		}
	}
}

// Close shuts down all managed language servers.
func (m *Manager) Close() error {
	m.clientMu.Lock()
	defer m.clientMu.Unlock()

	for lang, client := range m.clients {
		_ = client.Close()
		delete(m.clients, lang)
	}
	return nil
}
