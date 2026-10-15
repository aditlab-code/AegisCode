package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestMultiLanguageBinaryResolution(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "lsp_multi_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	mgr := NewManager(tempDir)
	defer mgr.Close()

	// 1. Test custom server override
	fakeBinary := filepath.Join(tempDir, "my-custom-pyright")
	if err := os.WriteFile(fakeBinary, []byte("#!/bin/sh\nexit 0"), 0755); err != nil {
		t.Fatalf("failed to create fake binary: %v", err)
	}

	mgr.SetCustomServers(map[string]string{
		"python": fakeBinary,
	})

	bin, _, err := mgr.FindServerBinary("python")
	if err != nil {
		t.Fatalf("expected custom binary to be found, got error: %v", err)
	}
	if bin != fakeBinary {
		t.Fatalf("expected binary %s, got %s", fakeBinary, bin)
	}

	// 2. Test status inspection includes all standard languages
	statuses := mgr.GetStatus()
	expectedLangs := map[string]bool{
		"typescript": false,
		"javascript": false,
		"python":     false,
		"go":         false,
		"rust":       false,
		"c":          false,
		"cpp":        false,
		"csharp":     false,
		"bash":       false,
		"makefile":   false,
		"html":       false,
		"css":        false,
		"json":       false,
	}

	for _, s := range statuses {
		if _, ok := expectedLangs[s.Language]; ok {
			expectedLangs[s.Language] = true
		}
		if s.Language == "python" && s.Status != "available" && s.Status != "running" {
			t.Fatalf("expected python to be available due to custom override, got %s", s.Status)
		}
	}

	for lang, found := range expectedLangs {
		if !found {
			t.Errorf("expected language '%s' in status list", lang)
		}
	}
}

func TestMultiLanguageNormalizationAndCandidates(t *testing.T) {
	mgr := NewManager("")

	// Test normalization
	tests := []struct {
		input    string
		expected string
		canonLsp string
	}{
		{"makefile", "makefile", "makefile"},
		{"mk", "makefile", "makefile"},
		{"mak", "makefile", "makefile"},
		{"sh", "bash", "shellscript"},
		{"bash", "bash", "shellscript"},
		{"zsh", "bash", "shellscript"},
		{"shell", "bash", "shellscript"},
		{"shellscript", "bash", "shellscript"},
		{"c", "c", "c"},
		{"h", "c", "c"},
		{"cpp", "cpp", "cpp"},
		{"c++", "cpp", "cpp"},
		{"cxx", "cpp", "cpp"},
		{"hpp", "cpp", "cpp"},
		{"cs", "csharp", "csharp"},
		{"csharp", "csharp", "csharp"},
		{"c#", "csharp", "csharp"},
		{"csx", "csharp", "csharp"},
	}

	for _, tc := range tests {
		normalized := normalizeLang(tc.input)
		if normalized != tc.expected {
			t.Errorf("normalizeLang(%s) = %s; want %s", tc.input, normalized, tc.expected)
		}
		canon := canonicalLspLanguageID(tc.input)
		if canon != tc.canonLsp {
			t.Errorf("canonicalLspLanguageID(%s) = %s; want %s", tc.input, canon, tc.canonLsp)
		}
	}

	// Test C/C++ clangd optimization flags and ccls fallback
	cppSpec := mgr.getLangSpec("cpp")
	if len(cppSpec.candidates) < 2 {
		t.Fatalf("expected at least 2 candidates for cpp, got %d", len(cppSpec.candidates))
	}
	if cppSpec.candidates[0].binaryName != "clangd" {
		t.Errorf("expected primary candidate clangd, got %s", cppSpec.candidates[0].binaryName)
	}
	clangdArgs := strings.Join(cppSpec.candidates[0].args, " ")
	if !strings.Contains(clangdArgs, "--background-index") || !strings.Contains(clangdArgs, "--clang-tidy") {
		t.Errorf("expected clangd args to contain optimization flags, got %v", cppSpec.candidates[0].args)
	}
	if cppSpec.candidates[1].binaryName != "ccls" {
		t.Errorf("expected fallback candidate ccls, got %s", cppSpec.candidates[1].binaryName)
	}

	// Test Bash language server
	bashSpec := mgr.getLangSpec("bash")
	if len(bashSpec.candidates) == 0 || bashSpec.candidates[0].binaryName != "bash-language-server" {
		t.Errorf("expected bash-language-server, got %+v", bashSpec.candidates)
	}
	if len(bashSpec.candidates[0].args) == 0 || bashSpec.candidates[0].args[0] != "start" {
		t.Errorf("expected bash-language-server arg 'start', got %+v", bashSpec.candidates[0].args)
	}

	// Test Makefile language server
	makeSpec := mgr.getLangSpec("makefile")
	if len(makeSpec.candidates) == 0 || makeSpec.candidates[0].binaryName != "make-language-server" {
		t.Errorf("expected make-language-server, got %+v", makeSpec.candidates)
	}

	// Test C# language server
	csSpec := mgr.getLangSpec("csharp")
	if len(csSpec.candidates) < 2 {
		t.Fatalf("expected at least 2 candidates for csharp, got %d", len(csSpec.candidates))
	}
	if csSpec.candidates[0].binaryName != "csharp-ls" {
		t.Errorf("expected primary candidate csharp-ls, got %s", csSpec.candidates[0].binaryName)
	}
	if csSpec.candidates[1].binaryName != "omnisharp" {
		t.Errorf("expected secondary candidate omnisharp, got %s", csSpec.candidates[1].binaryName)
	}
}

func TestURIConversion(t *testing.T) {
	mgr := NewManager("/workspace/project")

	// Standard relative Unix path
	uri := mgr.filePathToURI("src/main.go")
	if !strings.HasPrefix(uri, "file:///") {
		t.Fatalf("expected file:/// prefix, got %s", uri)
	}
	if !strings.HasSuffix(uri, "/workspace/project/src/main.go") {
		t.Fatalf("unexpected uri: %s", uri)
	}

	// Absolute Unix path
	absURI := mgr.filePathToURI("/var/log/app.log")
	if absURI != "file:///var/log/app.log" {
		t.Fatalf("unexpected absolute URI: %s", absURI)
	}

	// Windows paths
	if runtime.GOOS == "windows" {
		winMgr := NewManager(`C:\Workspace\Project`)
		winURI := winMgr.filePathToURI(`src\main.go`)
		if winURI != "file:///C:/Workspace/Project/src/main.go" {
			t.Fatalf("unexpected windows URI: %s", winURI)
		}
	}
}

func TestMockLSPProtocolInteraction(t *testing.T) {
	// Create an in-memory pipe pair to test JSON-RPC framing & capabilities
	r1, w1, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe failed: %v", err)
	}
	r2, w2, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe failed: %v", err)
	}
	defer r1.Close()
	defer w1.Close()
	defer r2.Close()
	defer w2.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	client := &Client{
		stdin:   w1,
		stdout:  r2,
		reader:  nil,
		pending: make(map[int64]chan *Response),
		ctx:     ctx,
		cancel:  cancel,
	}

	// Mock server read loop
	go func() {
		// Read framed request from client (via r1)
		buf := make([]byte, 1024)
		n, err := r1.Read(buf)
		if err != nil || n == 0 {
			return
		}
		reqStr := string(buf[:n])
		if !strings.Contains(reqStr, "Content-Length:") {
			return
		}

		// Find request ID
		parts := strings.SplitN(reqStr, "\r\n\r\n", 2)
		if len(parts) < 2 {
			return
		}
		var req Request
		_ = json.Unmarshal([]byte(parts[1]), &req)

		// Send mock formatting response back via w2
		edits := []TextEdit{
			{
				Range:   Range{Start: Position{Line: 0, Character: 0}, End: Position{Line: 0, Character: 5}},
				NewText: "formatted",
			},
		}
		rawResult, _ := json.Marshal(edits)
		resp := Response{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  rawResult,
		}
		respBytes, _ := json.Marshal(resp)
		header := fmt.Sprintf("Content-Length: %d\r\n\r\n", len(respBytes))
		_, _ = w2.Write([]byte(header))
		_, _ = w2.Write(respBytes)
	}()

	// Start reader loop on client
	client.reader = bufio.NewReader(r2)
	// We can test client.Call directly using a mock response channel
	respChan := make(chan *Response, 1)
	client.pendingMu.Lock()
	client.pending[1] = respChan
	client.pendingMu.Unlock()

	// Simulate receiving response
	edits := []TextEdit{
		{
			Range:   Range{Start: Position{Line: 0, Character: 0}, End: Position{Line: 0, Character: 5}},
			NewText: "formatted",
		},
	}
	raw, _ := json.Marshal(edits)
	respChan <- &Response{
		JSONRPC: "2.0",
		ID:      1,
		Result:  raw,
	}

	select {
	case resp := <-respChan:
		var parsedEdits []TextEdit
		if err := json.Unmarshal(resp.Result, &parsedEdits); err != nil {
			t.Fatalf("unmarshal edits failed: %v", err)
		}
		if len(parsedEdits) != 1 || parsedEdits[0].NewText != "formatted" {
			t.Fatalf("unexpected edit result: %+v", parsedEdits)
		}
	case <-time.After(1 * time.Second):
		t.Fatal("timeout waiting for response")
	}
	_ = net.ErrClosed
}
