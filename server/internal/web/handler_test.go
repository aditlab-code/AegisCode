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
