package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestOriginRejectionAndCSWSHDefense(t *testing.T) {
	_, handler, _ := setupTestServer(t, "")

	tests := []struct {
		name         string
		origin       string
		method       string
		path         string
		expectedCode int
	}{
		{
			name:         "Rejects untrusted cross-origin request with 403 Forbidden",
			origin:       "http://evil-attacker.com",
			method:       http.MethodGet,
			path:         "/api/v1/workspace/info",
			expectedCode: http.StatusForbidden,
		},
		{
			name:         "Rejects sandboxed iframe null origin with 403 Forbidden",
			origin:       "null",
			method:       http.MethodGet,
			path:         "/api/v1/workspace/info",
			expectedCode: http.StatusForbidden,
		},
		{
			name:         "Allows local frontend dev server origin http://localhost:5173",
			origin:       "http://localhost:5173",
			method:       http.MethodGet,
			path:         "/api/v1/workspace/info",
			expectedCode: http.StatusOK,
		},
		{
			name:         "Allows local desktop origin http://127.0.0.1:8080",
			origin:       "http://127.0.0.1:8080",
			method:       http.MethodGet,
			path:         "/api/v1/workspace/info",
			expectedCode: http.StatusOK,
		},
		{
			name:         "Allows direct client requests with empty origin (CLI / curl)",
			origin:       "",
			method:       http.MethodGet,
			path:         "/api/v1/workspace/info",
			expectedCode: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != tc.expectedCode {
				t.Fatalf("origin %q: expected status %d, got %d (body: %s)", tc.origin, tc.expectedCode, rec.Code, rec.Body.String())
			}

			// Verify wildcard is NEVER returned for cross-origin requests
			if tc.origin != "" && rec.Code == http.StatusOK {
				allowOrigin := rec.Header().Get("Access-Control-Allow-Origin")
				if allowOrigin == "*" {
					t.Fatalf("expected specific origin header, got wildcard '*'")
				}
				if allowOrigin != tc.origin {
					t.Fatalf("expected Access-Control-Allow-Origin: %s, got %s", tc.origin, allowOrigin)
				}
			}
		})
	}
}

func TestGitPathTraversalGuards(t *testing.T) {
	_, handler, _ := setupTestServer(t, "")

	t.Run("Rejects path traversal in Git timeline", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/git/timeline?file=../../etc/passwd", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for path traversal, got %d", rec.Code)
		}
	})

	t.Run("Rejects path traversal in Git stage", func(t *testing.T) {
		body, _ := json.Marshal(StageFilesRequest{
			Files: []string{"../../etc/passwd"},
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/git/stage", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for stage traversal, got %d", rec.Code)
		}
	})

	t.Run("Rejects path traversal in Git unstage", func(t *testing.T) {
		body, _ := json.Marshal(UnstageFilesRequest{
			Files: []string{"../../etc/shadow"},
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/git/unstage", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for unstage traversal, got %d", rec.Code)
		}
	})

	t.Run("Rejects path traversal in Git discard", func(t *testing.T) {
		body, _ := json.Marshal(DiscardFilesRequest{
			Files: []string{"../../../outside.txt"},
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/git/discard", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for discard traversal, got %d", rec.Code)
		}
	})
}

func TestGitInternalDirectoryProtection(t *testing.T) {
	_, handler, _ := setupTestServer(t, "")

	t.Run("Blocks writing into .git/hooks directory", func(t *testing.T) {
		body, _ := json.Marshal(WriteFileRequest{
			Path:    ".git/hooks/pre-commit",
			Content: "#!/bin/sh\nexit 0\n",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/file", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for .git/hooks write, got %d", rec.Code)
		}
	})

	t.Run("Blocks reading .git/config file", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/file?path=.git/config", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for .git read, got %d", rec.Code)
		}
	})

	t.Run("Blocks creating folder inside .git", func(t *testing.T) {
		body, _ := json.Marshal(CreateFolderRequest{Path: ".git/custom-dir"})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/folder", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 Forbidden for .git folder create, got %d", rec.Code)
		}
	})
}

func TestForbiddenWorkspaceRootMount(t *testing.T) {
	_, handler, _ := setupTestServer(t, "")

	t.Run("Rejects mounting filesystem root as workspace", func(t *testing.T) {
		body, _ := json.Marshal(OpenWorkspaceRequest{Path: "/"})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/open", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for root / mount, got %d", rec.Code)
		}
	})

	t.Run("Rejects mounting /etc as workspace", func(t *testing.T) {
		body, _ := json.Marshal(OpenWorkspaceRequest{Path: "/etc"})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/open", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for /etc mount, got %d", rec.Code)
		}
	})
}

func TestTerminalSecurityAndAllowlist(t *testing.T) {
	_, handler, _ := setupTestServer(t, "")

	t.Run("Rejects disallowed shell executable", func(t *testing.T) {
		body, _ := json.Marshal(CreateTerminalRequest{Shell: "python"})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/terminal/create", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for python shell, got %d (body: %s)", rec.Code, rec.Body.String())
		}
	})

	t.Run("Rejects terminal cwd escaping workspace root", func(t *testing.T) {
		body, _ := json.Marshal(CreateTerminalRequest{Cwd: "../../outside/path"})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/terminal/create", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for escaped cwd, got %d", rec.Code)
		}
	})
}

func TestDebuggerWorkspaceBoundary(t *testing.T) {
	_, handler, _ := setupTestServer(t, "")

	t.Run("Rejects debugging program escaping workspace", func(t *testing.T) {
		body, _ := json.Marshal(map[string]any{
			"program": "../../outside/main.go",
		})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/debug/start", bytes.NewReader(body))
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for escaped debug program, got %d", rec.Code)
		}
	})
}

func TestPairingRateLimitingAndLockout(t *testing.T) {
	pm := NewPairingManager(8080)
	clientIP := "192.168.1.150:44123"

	// 1-4. Initial failed attempts
	for i := 1; i <= 4; i++ {
		_, err := pm.Handshake("WRONG1", "test-client", clientIP)
		if err == nil {
			t.Fatalf("expected handshake error on wrong token")
		}
	}

	// 5. 5th attempt breaches limit and triggers lockout
	_, err := pm.Handshake("WRONG1", "test-client", clientIP)
	if err == nil {
		t.Fatalf("expected error on 5th attempt")
	}

	// 6. 6th attempt is strictly blocked by lockout
	_, err = pm.Handshake("ANY", "test-client", clientIP)
	if err == nil || !bytes.Contains([]byte(err.Error()), []byte("locked out")) {
		t.Fatalf("expected client to be locked out, got %v", err)
	}
}

func TestSystemShutdownTokenEnforcement(t *testing.T) {
	srv, handler, _ := setupTestServer(t, "")
	sessionToken := srv.SessionToken()

	t.Run("Rejects shutdown without token even from loopback", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/system/shutdown", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected 401 Unauthorized without session token, got %d", rec.Code)
		}
	})

	t.Run("Accepts shutdown with valid session token", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/system/shutdown", nil)
		req.Header.Set("X-Session-Token", sessionToken)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200 OK with valid session token, got %d", rec.Code)
		}
	})
}

func TestVaultHTTPFlow(t *testing.T) {
	srv, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// 1. Initial Vault Status: Not initialized
	req := httptest.NewRequest(http.MethodGet, "/api/v1/vault/status", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for vault status, got %d", rec.Code)
	}

	// 2. Setup Vault
	setupBody, _ := json.Marshal(VaultSetupRequest{MasterPassword: "securePassword123"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/vault/setup", bytes.NewReader(setupBody))
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for vault setup, got %d (%s)", rec.Code, rec.Body.String())
	}
	var setupResp map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &setupResp)
	recoveryKey, ok := setupResp["recoveryKey"].(string)
	if !ok || !strings.HasPrefix(recoveryKey, "AEGIS-RECV-") {
		t.Fatalf("invalid recovery key returned: %v", setupResp["recoveryKey"])
	}

	// 3. Lock Vault
	req = httptest.NewRequest(http.MethodPost, "/api/v1/vault/lock", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for vault lock, got %d", rec.Code)
	}

	// 4. Protected API call while locked -> Must return 423 Locked
	req = httptest.NewRequest(http.MethodGet, "/api/v1/workspace/info", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusLocked {
		t.Fatalf("expected 423 Locked for workspace info while vault is locked, got %d", rec.Code)
	}

	// 5. Unlock with wrong password -> 401 Unauthorized
	wrongBody, _ := json.Marshal(VaultUnlockRequest{MasterPassword: "wrongPassword"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/vault/unlock", bytes.NewReader(wrongBody))
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for wrong master password, got %d", rec.Code)
	}

	// 6. Unlock with correct password -> 200 OK
	correctBody, _ := json.Marshal(VaultUnlockRequest{MasterPassword: "securePassword123"})
	req = httptest.NewRequest(http.MethodPost, "/api/v1/vault/unlock", bytes.NewReader(correctBody))
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for valid master unlock, got %d", rec.Code)
	}

	// 7. Protected API call after unlock -> Must succeed (200 OK)
	req = httptest.NewRequest(http.MethodGet, "/api/v1/workspace/info", nil)
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for workspace info after unlock, got %d", rec.Code)
	}

	_ = srv
}

func TestCompanionLockedEndpoint(t *testing.T) {
	srv, _, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	srv.Pairing().SetLocked(true)
	if !srv.Pairing().IsLocked() {
		t.Fatalf("expected companion pairing to be locked")
	}

	_, err := srv.Pairing().Handshake("ANY", "client")
	if err == nil || !strings.Contains(err.Error(), "locked") {
		t.Fatalf("expected handshake error when companion is locked, got: %v", err)
	}
}


