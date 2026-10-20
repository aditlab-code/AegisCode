package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/aditwicaksono/aegiscode/server/internal/latex"
)

func TestLatexStatusEndpoint(t *testing.T) {
	srv, _, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/latex/status", nil)
	w := httptest.NewRecorder()
	srv.handleLatexStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var status latex.ToolchainStatus
	if err := json.NewDecoder(w.Body).Decode(&status); err != nil {
		t.Fatalf("failed to decode status: %v", err)
	}
}

func TestLatexCompileEndpoint_Validation(t *testing.T) {
	srv, _, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// 1. Method Not Allowed
	req := httptest.NewRequest(http.MethodGet, "/api/v1/latex/compile", nil)
	w := httptest.NewRecorder()
	srv.handleLatexCompile(w, req)
	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("expected 405, got %d", w.Code)
	}

	// 2. Empty Body
	req = httptest.NewRequest(http.MethodPost, "/api/v1/latex/compile", bytes.NewBufferString("{}"))
	w = httptest.NewRecorder()
	srv.handleLatexCompile(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty file, got %d", w.Code)
	}
}

func TestLatexSyncEndpoints_Validation(t *testing.T) {
	srv, _, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// Forward with missing file
	req := httptest.NewRequest(http.MethodPost, "/api/v1/latex/synctex/forward", bytes.NewBufferString("{}"))
	w := httptest.NewRecorder()
	srv.handleLatexSyncForward(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing file in forward, got %d", w.Code)
	}

	// Inverse with missing pdfFile
	req = httptest.NewRequest(http.MethodPost, "/api/v1/latex/synctex/inverse", bytes.NewBufferString("{}"))
	w = httptest.NewRecorder()
	srv.handleLatexSyncInverse(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for missing pdfFile in inverse, got %d", w.Code)
	}
}
