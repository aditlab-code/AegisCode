package codegraph

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// newReverseProxy configures an httputil.ReverseProxy routing to targetURL.
func newReverseProxy(target *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		// Rewrite `/api/codegraph/ui/*` path to `/api/*`
		if strings.HasPrefix(req.URL.Path, "/api/codegraph/ui/") {
			req.URL.Path = "/api/" + strings.TrimPrefix(req.URL.Path, "/api/codegraph/ui/")
		} else if req.URL.Path == "/api/codegraph/ui" {
			req.URL.Path = "/api"
		}
		req.Host = target.Host
	}
	return proxy
}

// ProxyHandler handles all requests routed to `/api/codegraph/ui/*`.
func (m *Manager) ProxyHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		cleanPath := strings.TrimSuffix(r.URL.Path, "/")

		// 1. Intercept mutation commands
		if r.Method == http.MethodPost {
			if strings.HasSuffix(cleanPath, "/init") {
				if err := m.Init(r.Context()); err != nil {
					w.WriteHeader(http.StatusInternalServerError)
					_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
					return
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "action": "init"})
				return
			}
			if strings.HasSuffix(cleanPath, "/index") {
				if !m.IsIndexed() {
					w.WriteHeader(http.StatusBadRequest)
					_ = json.NewEncoder(w).Encode(map[string]any{
						"error":     "workspace is not initialized. Run init first.",
						"isIndexed": false,
					})
					return
				}
				if err := m.Reindex(r.Context()); err != nil {
					w.WriteHeader(http.StatusInternalServerError)
					_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
					return
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "action": "index"})
				return
			}
			if strings.HasSuffix(cleanPath, "/sync") {
				if !m.IsIndexed() {
					w.WriteHeader(http.StatusBadRequest)
					_ = json.NewEncoder(w).Encode(map[string]any{
						"error":     "workspace is not initialized. Run init first.",
						"isIndexed": false,
					})
					return
				}
				if err := m.Sync(r.Context()); err != nil {
					w.WriteHeader(http.StatusInternalServerError)
					_ = json.NewEncoder(w).Encode(map[string]any{"error": err.Error()})
					return
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "action": "sync"})
				return
			}
		}

		// 2. Condition check: uninitialized workspace
		if !m.IsIndexed() {
			if strings.HasSuffix(cleanPath, "/stats") {
				st, _ := m.Status(r.Context())
				_ = json.NewEncoder(w).Encode(st)
				return
			}
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":     "workspace is not initialized with CodeGraph. Initialize workspace first.",
				"isIndexed": false,
				"running":   false,
			})
			return
		}

		// 3. Ensure the daemon process is running for indexed workspace
		if err := m.EnsureRunning(); err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error":   "CodeGraph daemon unavailable: " + err.Error(),
				"running": false,
			})
			return
		}

		m.mu.RLock()
		proxy := m.proxy
		m.mu.RUnlock()

		if proxy == nil {
			w.WriteHeader(http.StatusBadGateway)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "proxy handler not initialized"})
			return
		}

		// 4. Delegate to upstream reverse proxy
		proxy.ServeHTTP(w, r)
	})
}
