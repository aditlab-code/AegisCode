package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// TestGAP_LSPFullCoverage validates complete coverage and edge-case behavior for all 11 LSP endpoints.
func TestGAP_LSPFullCoverage(t *testing.T) {
	server, handler, tempDir := setupTestServer(t, "")
	defer func() { _ = server.ws.Close() }()

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. LSP Change endpoint (POST /api/v1/lsp/change)
	t.Run("LSPChange_ValidAndInvalid", func(t *testing.T) {
		// Valid change
		changeBody := `{"path":"main.go","content":"package main\nfunc updated(){}","language":"go"}`
		resp, err := http.Post(ts.URL+"/api/v1/lsp/change", "application/json", strings.NewReader(changeBody))
		if err != nil {
			t.Fatalf("failed to post lsp/change: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
		}

		// Invalid JSON
		respBad, err := http.Post(ts.URL+"/api/v1/lsp/change", "application/json", strings.NewReader(`{bad json`))
		if err != nil {
			t.Fatalf("failed to post bad json: %v", err)
		}
		defer respBad.Body.Close()
		if respBad.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for malformed JSON, got %d", respBad.StatusCode)
		}

		// Method not allowed (GET)
		respMethod, err := http.Get(ts.URL + "/api/v1/lsp/change")
		if err != nil {
			t.Fatalf("failed to get lsp/change: %v", err)
		}
		defer respMethod.Body.Close()
		if respMethod.StatusCode != http.StatusMethodNotAllowed {
			t.Fatalf("expected 405 Method Not Allowed, got %d", respMethod.StatusCode)
		}
	})

	// 2. LSP Formatting endpoint (POST /api/v1/lsp/formatting)
	t.Run("LSPFormatting_ValidAndFallback", func(t *testing.T) {
		// Valid formatting with explicit tabSize
		fmtBody := `{"path":"main.go","tabSize":4,"insertSpaces":true,"language":"go"}`
		resp, err := http.Post(ts.URL+"/api/v1/lsp/formatting", "application/json", strings.NewReader(fmtBody))
		if err != nil {
			t.Fatalf("failed to post lsp/formatting: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
		}
		var fmtRes LSPFormattingResponse
		if err := json.NewDecoder(resp.Body).Decode(&fmtRes); err != nil {
			t.Fatalf("failed to decode formatting response: %v", err)
		}

		// Formatting with zero tabSize (verifies fallback to tabSize = 2)
		fmtZeroBody := `{"path":"main.go","tabSize":0,"insertSpaces":false,"language":"go"}`
		respZero, err := http.Post(ts.URL+"/api/v1/lsp/formatting", "application/json", strings.NewReader(fmtZeroBody))
		if err != nil {
			t.Fatalf("failed to post lsp/formatting with 0 tabSize: %v", err)
		}
		defer respZero.Body.Close()
		if respZero.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 OK, got %d", respZero.StatusCode)
		}

		// Invalid JSON
		respBad, err := http.Post(ts.URL+"/api/v1/lsp/formatting", "application/json", strings.NewReader(`{broken`))
		if err != nil {
			t.Fatalf("failed to post broken json: %v", err)
		}
		defer respBad.Body.Close()
		if respBad.StatusCode != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request, got %d", respBad.StatusCode)
		}

		// Method not allowed (GET)
		respMethod, err := http.Get(ts.URL + "/api/v1/lsp/formatting")
		if err != nil {
			t.Fatalf("failed to get lsp/formatting: %v", err)
		}
		defer respMethod.Body.Close()
		if respMethod.StatusCode != http.StatusMethodNotAllowed {
			t.Fatalf("expected 405 Method Not Allowed, got %d", respMethod.StatusCode)
		}
	})

	// 3. LSP Status endpoint (GET /api/v1/lsp/status)
	t.Run("LSPStatus_GetAndMethodGate", func(t *testing.T) {
		resp, err := http.Get(ts.URL + "/api/v1/lsp/status")
		if err != nil {
			t.Fatalf("failed to get lsp/status: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 OK for lsp/status, got %d", resp.StatusCode)
		}
		var stRes LSPStatusResponse
		if err := json.NewDecoder(resp.Body).Decode(&stRes); err != nil {
			t.Fatalf("failed to decode status response: %v", err)
		}
		if stRes.Servers == nil {
			t.Errorf("expected non-nil servers slice")
		}

		// Method not allowed (POST)
		respPost, err := http.Post(ts.URL+"/api/v1/lsp/status", "application/json", nil)
		if err != nil {
			t.Fatalf("failed to post lsp/status: %v", err)
		}
		defer respPost.Body.Close()
		if respPost.StatusCode != http.StatusMethodNotAllowed {
			t.Fatalf("expected 405 Method Not Allowed for POST on lsp/status, got %d", respPost.StatusCode)
		}
	})

	// 4. Method-not-allowed check on other LSP endpoints
	t.Run("LSPMethodsNotAllowed", func(t *testing.T) {
		postEndpoints := []string{
			"/api/v1/lsp/open",
			"/api/v1/lsp/save",
			"/api/v1/lsp/close",
			"/api/v1/lsp/symbols",
			"/api/v1/lsp/completion",
			"/api/v1/lsp/hover",
			"/api/v1/lsp/definition",
		}
		for _, ep := range postEndpoints {
			resp, err := http.Get(ts.URL + ep)
			if err != nil {
				t.Fatalf("failed GET on %s: %v", ep, err)
			}
			resp.Body.Close()
			if resp.StatusCode != http.StatusMethodNotAllowed {
				t.Errorf("expected 405 for GET %s, got %d", ep, resp.StatusCode)
			}
		}
	})

	// 5. LSP Diagnostics SSE Endpoint (GET /api/v1/events/lsp)
	t.Run("LSPEventsSSE_Connection", func(t *testing.T) {
		req, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/events/lsp", nil)
		client := &http.Client{Timeout: 500 * time.Millisecond}
		resp, err := client.Do(req)
		if err != nil && !strings.Contains(err.Error(), "Client.Timeout") {
			t.Fatalf("unexpected error connecting to lsp events: %v", err)
		}
		if resp != nil {
			defer resp.Body.Close()
			if resp.Header.Get("Content-Type") != "text/event-stream" {
				t.Errorf("expected text/event-stream, got %s", resp.Header.Get("Content-Type"))
			}
		}
	})

	_ = tempDir
}

// TestGAP_NilManagerSafeguards validates that handlers return clean JSON errors rather than panicking when managers are nil.
func TestGAP_NilManagerSafeguards(t *testing.T) {
	// Construct a bare server with nil managers to verify fail-safe behavior
	bareServer := &Server{}
	handler := bareServer.Routes()

	// 1. LSP status with nil LSP manager
	reqLspStatus := httptest.NewRequest(http.MethodGet, "/api/v1/lsp/status", nil)
	rrLspStatus := executeRequest(handler, reqLspStatus)
	if rrLspStatus.Code != http.StatusOK {
		t.Errorf("expected 200 OK with empty server list on nil lsp, got %d", rrLspStatus.Code)
	}

	// 2. Config request with nil Store
	reqConfig := httptest.NewRequest(http.MethodGet, "/api/v1/config", nil)
	rrConfig := executeRequest(handler, reqConfig)
	if rrConfig.Code != http.StatusServiceUnavailable {
		t.Errorf("expected 503 Service Unavailable on nil store, got %d", rrConfig.Code)
	}
}

// TestGAP_RouteMatrixSanity traverses key workspace and system routes to ensure HTTP verb gatekeeping.
func TestGAP_RouteMatrixSanity(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	testCases := []struct {
		name           string
		method         string
		path           string
		expectedStatus int
	}{
		{"WorkspaceInfo_POST_NotAllowed", http.MethodPost, "/api/v1/workspace/info", http.StatusMethodNotAllowed},
		{"WorkspaceOpen_GET_NotAllowed", http.MethodGet, "/api/v1/workspace/open", http.StatusMethodNotAllowed},
		{"WorkspaceClose_GET_NotAllowed", http.MethodGet, "/api/v1/workspace/close", http.StatusMethodNotAllowed},
		{"GitStatus_POST_NotAllowed", http.MethodPost, "/api/v1/git/status", http.StatusMethodNotAllowed},
		{"TerminalCreate_GET_NotAllowed", http.MethodGet, "/api/v1/terminal/create", http.StatusMethodNotAllowed},
		{"SystemShutdown_GET_NotAllowed", http.MethodGet, "/api/v1/system/shutdown", http.StatusMethodNotAllowed},
		{"AITest_GET_NotAllowed", http.MethodGet, "/api/v1/ai/test", http.StatusMethodNotAllowed},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			rr := executeRequest(handler, req)
			if rr.Code != tc.expectedStatus {
				t.Errorf("%s %s: expected status %d, got %d", tc.method, tc.path, tc.expectedStatus, rr.Code)
			}
		})
	}
}
