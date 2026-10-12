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
}

func NewManager(workspacePath string) *Manager {
	return &Manager{
		workspacePath: workspacePath,
		clients:       make(map[string]*Client),
		docVersions:   make(map[string]int),
		diagSubs:      make(map[chan PublishDiagnosticsParams]struct{}),
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

// FindServerBinary searches for a language server binary on the host machine.
func (m *Manager) FindServerBinary(lang string) (string, []string, error) {
	switch strings.ToLower(lang) {
	case "go":
		// 1. Check PATH
		if path, err := exec.LookPath("gopls"); err == nil {
			return path, nil, nil
		}
		// 2. Check GOPATH/bin
		gopath := os.Getenv("GOPATH")
		if gopath != "" {
			cand := filepath.Join(gopath, "bin", "gopls")
			if _, err := os.Stat(cand); err == nil {
				return cand, nil, nil
			}
		}
		// 3. Check ~/go/bin
		home, err := os.UserHomeDir()
		if err == nil {
			cand := filepath.Join(home, "go", "bin", "gopls")
			if _, err := os.Stat(cand); err == nil {
				return cand, nil, nil
			}
		}
		return "", nil, fmt.Errorf("gopls binary not found in PATH or ~/go/bin")

	default:
		return "", nil, fmt.Errorf("unsupported language server for '%s'", lang)
	}
}

// IsLanguageSupported checks if a language server binary exists.
func (m *Manager) IsLanguageSupported(lang string) bool {
	_, _, err := m.FindServerBinary(lang)
	return err == nil
}

// GetOrStartClient returns an initialized LSP client for the given language.
func (m *Manager) GetOrStartClient(lang string) (*Client, error) {
	m.clientMu.Lock()
	defer m.clientMu.Unlock()

	client, exists := m.clients[lang]
	if exists && client != nil {
		return client, nil
	}

	bin, args, err := m.FindServerBinary(lang)
	if err != nil {
		return nil, err
	}

	newClient, err := StartClient(bin, args, m.broadcastDiagnostic)
	if err != nil {
		return nil, err
	}

	// Initialize the LSP server
	initCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rootURI := m.filePathToURI(m.workspacePath)
	initParams := InitializeParams{
		ProcessID: os.Getpid(),
		RootURI:   rootURI,
		Capabilities: ClientCapabilities{
			TextDocument: map[string]any{
				"completion": map[string]any{"dynamicRegistration": false},
				"hover":      map[string]any{"dynamicRegistration": false},
				"definition": map[string]any{"dynamicRegistration": false},
			},
		},
	}

	if _, err := newClient.Call(initCtx, "initialize", initParams); err != nil {
		_ = newClient.Close()
		return nil, fmt.Errorf("failed to initialize lsp: %w", err)
	}

	_ = newClient.Notify("initialized", struct{}{})

	m.clients[lang] = newClient
	return newClient, nil
}

func (m *Manager) filePathToURI(relOrAbsPath string) string {
	abs := relOrAbsPath
	if !filepath.IsAbs(abs) && m.workspacePath != "" {
		abs = filepath.Join(m.workspacePath, relOrAbsPath)
	}
	abs = filepath.Clean(abs)
	u := url.URL{
		Scheme: "file",
		Path:   filepath.ToSlash(abs),
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

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
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

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
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

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
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

	var loc Location
	if err := json.Unmarshal(resp.Result, &loc); err == nil {
		return []Location{loc}, nil
	}

	var locs []Location
	if err := json.Unmarshal(resp.Result, &locs); err == nil {
		return locs, nil
	}

	return []Location{}, nil
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
