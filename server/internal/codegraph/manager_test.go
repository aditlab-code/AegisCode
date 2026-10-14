package codegraph

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestManagerLifecycleAndProxy(t *testing.T) {
	bin, _ := FindCodegraphBinary()
	if _, err := exec.LookPath(bin); err != nil {
		t.Skip("codegraph binary not found in environment, skipping native integration test")
	}

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to get cwd: %v", err)
	}
	repoRoot := filepath.Clean(filepath.Join(cwd, "..", "..", ".."))
	if _, err := os.Stat(filepath.Join(repoRoot, "package.json")); err != nil {
		repoRoot = cwd
	}

	mgr := NewManager(repoRoot)
	defer mgr.Close()

	if err := mgr.EnsureRunning(); err != nil {
		t.Fatalf("EnsureRunning failed: %v", err)
	}

	if !mgr.IsRunning() {
		t.Errorf("expected manager to be running")
	}

	if mgr.Port() <= 0 {
		t.Errorf("expected positive port, got %d", mgr.Port())
	}

	// Test ProxyHandler routing to /api/stats
	handler := mgr.ProxyHandler()

	req := httptest.NewRequest(http.MethodGet, "/api/codegraph/ui/stats", nil)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from /api/codegraph/ui/stats, got %d: %s", rr.Code, rr.Body.String())
	}

	var stats map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &stats); err != nil {
		t.Fatalf("failed to parse stats JSON: %v", err)
	}

	// Test FetchAPI
	data, statusCode, err := mgr.FetchAPI(req.Context(), "stats")
	if err != nil || statusCode != http.StatusOK || len(data) == 0 {
		t.Fatalf("FetchAPI failed: status=%d err=%v dataLen=%d", statusCode, err, len(data))
	}

	// Test Status method
	st, err := mgr.Status(req.Context())
	if err != nil {
		t.Fatalf("Status failed: %v", err)
	}
	if st == nil {
		t.Errorf("expected non-nil status map")
	}

	// Test Close
	if err := mgr.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	// Verify manager is stopped
	time.Sleep(100 * time.Millisecond)
	if mgr.IsRunning() {
		t.Errorf("expected manager to not be running after Close")
	}
}
