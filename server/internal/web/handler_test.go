package web

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func TestSPAHandler(t *testing.T) {
	mockFS := fstest.MapFS{
		"index.html": &fstest.MapFile{
			Data: []byte("<!DOCTYPE html><html><body><div id=\"root\">App Root</div></body></html>"),
		},
		"assets/bundle.js": &fstest.MapFile{
			Data: []byte("console.log('aegiscode loaded');"),
		},
		"assets/style.css": &fstest.MapFile{
			Data: []byte("body { background: #000; }"),
		},
	}

	handler := NewSPAHandler(mockFS)

	t.Run("Serves index.html on root /", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, "App Root") {
			t.Fatalf("expected body to contain 'App Root', got: %s", body)
		}
		ct := rec.Header().Get("Content-Type")
		if !strings.Contains(ct, "text/html") {
			t.Fatalf("expected text/html Content-Type, got: %s", ct)
		}
	})

	t.Run("Serves static javascript asset", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/assets/bundle.js", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, "console.log('aegiscode loaded')") {
			t.Fatalf("expected bundle content, got: %s", body)
		}
		ct := rec.Header().Get("Content-Type")
		if !strings.Contains(ct, "javascript") {
			t.Fatalf("expected javascript Content-Type, got: %s", ct)
		}
		cache := rec.Header().Get("Cache-Control")
		if !strings.Contains(cache, "immutable") {
			t.Fatalf("expected immutable Cache-Control, got: %s", cache)
		}
	})

	t.Run("Falls back to index.html on SPA routes without extension", func(t *testing.T) {
		routes := []string{"/settings", "/workspace/editor", "/companion"}
		for _, route := range routes {
			req := httptest.NewRequest(http.MethodGet, route, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("route %s: expected 200, got %d", route, rec.Code)
			}
			body := rec.Body.String()
			if !strings.Contains(body, "App Root") {
				t.Fatalf("route %s: expected index.html fallback, got: %s", route, body)
			}
		}
	})

	t.Run("Returns 404 for missing static assets with extension", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/assets/missing.png", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNotFound {
			t.Fatalf("expected 404 for missing asset, got %d", rec.Code)
		}
	})

	t.Run("Rejects non-GET/HEAD methods", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodPost, "/", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusMethodNotAllowed {
			t.Fatalf("expected 405 Method Not Allowed, got %d", rec.Code)
		}
	})

	t.Run("Serves developer guidance when no index.html is present", func(t *testing.T) {
		emptyFS := fstest.MapFS{}
		emptyHandler := NewSPAHandler(emptyFS)

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		emptyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected 200, got %d", rec.Code)
		}
		body := rec.Body.String()
		if !strings.Contains(body, "AegisCode Go Core Server is running") {
			t.Fatalf("expected guidance text, got: %s", body)
		}
	})

	t.Run("Serves CSP and framing security headers", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		csp := rec.Header().Get("Content-Security-Policy")
		if !strings.Contains(csp, "default-src 'self'") || !strings.Contains(csp, "frame-ancestors 'none'") {
			t.Fatalf("expected strict CSP header, got: %s", csp)
		}
		if rec.Header().Get("X-Frame-Options") != "DENY" {
			t.Fatalf("expected X-Frame-Options: DENY, got: %s", rec.Header().Get("X-Frame-Options"))
		}
		if rec.Header().Get("X-Content-Type-Options") != "nosniff" {
			t.Fatalf("expected X-Content-Type-Options: nosniff, got: %s", rec.Header().Get("X-Content-Type-Options"))
		}
	})

	t.Run("Injects ephemeral session token into index.html", func(t *testing.T) {
		tokenMockFS := fstest.MapFS{
			"index.html": &fstest.MapFile{
				Data: []byte("<!DOCTYPE html><html><head><title>Test</title></head><body><div id=\"root\">App Root</div></body></html>"),
			},
		}
		testToken := "abc123xyz789crypto"
		tokenHandler := NewSPAHandler(tokenMockFS, testToken)

		req := httptest.NewRequest(http.MethodGet, "/", nil)
		rec := httptest.NewRecorder()
		tokenHandler.ServeHTTP(rec, req)

		body := rec.Body.String()
		expectedMeta := `<meta name="aegis-session-token" content="abc123xyz789crypto" />`
		if !strings.Contains(body, expectedMeta) {
			t.Fatalf("expected body to contain meta tag %s, got: %s", expectedMeta, body)
		}
	})
}

func TestGetEmbeddedFS(t *testing.T) {
	efs := GetEmbeddedFS()
	if efs == nil {
		t.Fatal("expected non-nil embedded fs")
	}
	f, err := efs.Open("index.html")
	if err != nil {
		t.Fatalf("failed to open embedded index.html: %v", err)
	}
	defer f.Close()
	data, err := io.ReadAll(f)
	if err != nil || len(data) == 0 {
		t.Fatalf("expected non-empty embedded index.html content: %v", err)
	}
}
