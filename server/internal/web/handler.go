package web

import (
	"bytes"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"path/filepath"
	"strings"
	"time"
)

var startTime = time.Now()

func init() {
	// Ensure common web mime types are registered across all OS platforms
	_ = mime.AddExtensionType(".js", "application/javascript")
	_ = mime.AddExtensionType(".mjs", "application/javascript")
	_ = mime.AddExtensionType(".css", "text/css; charset=utf-8")
	_ = mime.AddExtensionType(".svg", "image/svg+xml")
	_ = mime.AddExtensionType(".json", "application/json")
	_ = mime.AddExtensionType(".wasm", "application/wasm")
	_ = mime.AddExtensionType(".woff2", "font/woff2")
}

// SPAHandler serves embedded static files with client-side routing fallback to index.html.
type SPAHandler struct {
	fsys         fs.FS
	indexData    []byte
	hasIndex     bool
	sessionToken string
}

// NewSPAHandler constructs an http.Handler that serves assets from fsys.
// If a requested file does not exist, it falls back to serving index.html.
// Optionally accepts an ephemeral session token to inject into index.html (ADR 0017).
func NewSPAHandler(fsys fs.FS, sessionToken ...string) http.Handler {
	handler := &SPAHandler{
		fsys: fsys,
	}
	if len(sessionToken) > 0 {
		handler.sessionToken = sessionToken[0]
	}

	if fsys != nil {
		if indexFile, err := fsys.Open("index.html"); err == nil {
			defer indexFile.Close()
			if data, err := io.ReadAll(indexFile); err == nil && len(data) > 0 {
				handler.indexData = data
				handler.hasIndex = true
			}
		}
	}

	return handler
}

func (h *SPAHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	cleanPath := path.Clean(r.URL.Path)
	trimmedPath := strings.TrimPrefix(cleanPath, "/")

	// If root or empty, serve index.html
	if trimmedPath == "" || trimmedPath == "." {
		h.serveIndex(w, r)
		return
	}

	// Try to open the requested file in the embedded filesystem
	if h.fsys != nil {
		f, err := h.fsys.Open(trimmedPath)
		if err == nil {
			defer f.Close()
			stat, err := f.Stat()
			if err == nil && !stat.IsDir() {
				h.serveFile(w, r, trimmedPath, f, stat)
				return
			}
		}
	}

	// If file not found and has an extension (like a missing image or script), return 404
	ext := path.Ext(trimmedPath)
	if ext != "" && ext != ".html" {
		http.NotFound(w, r)
		return
	}

	// Fallback to index.html for SPA client-side routes (e.g. /settings, /?mode=companion)
	h.serveIndex(w, r)
}

func setSecurityHeaders(w http.ResponseWriter) {
	w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* http://localhost:* ws://localhost:*; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none';")
	w.Header().Set("X-Frame-Options", "DENY")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "same-origin")
}

func (h *SPAHandler) serveIndex(w http.ResponseWriter, r *http.Request) {
	setSecurityHeaders(w)
	if !h.hasIndex {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`<!DOCTYPE html>
<html>
<head><title>AegisCode Backend</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;background:#090d16;color:#e7edf7;">
  <h2>AegisCode Go Core Server is running</h2>
  <p>The embedded frontend bundle is not present.</p>
  <p>Run <code>npm run build:binary</code> or use <code>npm run dev:all</code> for live development.</p>
</body>
</html>`))
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	modTime := startTime

	finalData := h.indexData
	if h.sessionToken != "" {
		metaTag := []byte(fmt.Sprintf(`<meta name="aegis-session-token" content="%s" />`, h.sessionToken))
		if bytes.Contains(finalData, []byte(`<meta name="aegis-session-token"`)) {
			finalData = bytes.Replace(finalData, []byte(`<meta name="aegis-session-token" content="" />`), metaTag, 1)
		} else if bytes.Contains(finalData, []byte(`</head>`)) {
			finalData = bytes.Replace(finalData, []byte(`</head>`), append(append([]byte("  "), metaTag...), []byte("\n  </head>")...), 1)
		}
	}

	http.ServeContent(w, r, "index.html", modTime, bytes.NewReader(finalData))
}

func (h *SPAHandler) serveFile(w http.ResponseWriter, r *http.Request, filePath string, f fs.File, stat fs.FileInfo) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	ext := filepath.Ext(filePath)
	mimeType := mime.TypeByExtension(ext)
	if mimeType != "" {
		w.Header().Set("Content-Type", mimeType)
	}

	// Cache immutable assets aggressively
	if strings.HasPrefix(filePath, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	}

	modTime := stat.ModTime()
	if modTime.IsZero() {
		modTime = startTime
	}

	seeker, ok := f.(io.ReadSeeker)
	if !ok {
		data, err := io.ReadAll(f)
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		seeker = bytes.NewReader(data)
	}

	http.ServeContent(w, r, stat.Name(), modTime, seeker)
}
