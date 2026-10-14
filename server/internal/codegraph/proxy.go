package codegraph

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
	"strings"
)

// newReverseProxy configures an httputil.ReverseProxy routing to targetURL.
func newReverseProxy(target *url.URL) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		// Rewrite `/api/codegraph/ui/*`, `/api/codegraph/*`, or `/api/v1/codegraph/*` path to `/api/*`
		if strings.HasPrefix(req.URL.Path, "/api/codegraph/ui/") {
			req.URL.Path = "/api/" + strings.TrimPrefix(req.URL.Path, "/api/codegraph/ui/")
		} else if req.URL.Path == "/api/codegraph/ui" {
			req.URL.Path = "/api"
		} else if strings.HasPrefix(req.URL.Path, "/api/codegraph/") {
			req.URL.Path = "/api/" + strings.TrimPrefix(req.URL.Path, "/api/codegraph/")
		} else if req.URL.Path == "/api/codegraph" {
			req.URL.Path = "/api"
		} else if strings.HasPrefix(req.URL.Path, "/api/v1/codegraph/") {
			req.URL.Path = "/api/" + strings.TrimPrefix(req.URL.Path, "/api/v1/codegraph/")
		}
		req.Host = target.Host
	}

	proxy.ModifyResponse = func(resp *http.Response) error {
		if resp.StatusCode == http.StatusOK && strings.Contains(resp.Header.Get("Content-Type"), "json") {
			bodyBytes, err := io.ReadAll(resp.Body)
			if err != nil {
				return err
			}
			_ = resp.Body.Close()

			var mcpEnvelope struct {
				Content []struct {
					Type string `json:"type"`
					Text string `json:"text"`
				} `json:"content"`
				IsError bool `json:"isError"`
			}
			if err := json.Unmarshal(bodyBytes, &mcpEnvelope); err == nil && len(mcpEnvelope.Content) > 0 && mcpEnvelope.Content[0].Type == "text" && mcpEnvelope.Content[0].Text != "" {
				unwrapped := []byte(mcpEnvelope.Content[0].Text)
				resp.Body = io.NopCloser(bytes.NewReader(unwrapped))
				resp.ContentLength = int64(len(unwrapped))
				resp.Header.Set("Content-Length", strconv.Itoa(len(unwrapped)))
				resp.Header.Set("Content-Type", "application/json")
				return nil
			}

			resp.Body = io.NopCloser(bytes.NewReader(bodyBytes))
		}
		return nil
	}

	return proxy
}

// ProxyHandler handles all requests routed to `/api/codegraph/ui/*` and `/api/codegraph/*`.
func (m *Manager) ProxyHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		wsQuery := strings.TrimSpace(r.URL.Query().Get("workspace"))
		if wsQuery == "" {
			wsQuery = strings.TrimSpace(r.URL.Query().Get("path"))
		}
		if wsQuery != "" && wsQuery != m.Workspace() {
			m.SetWorkspace(wsQuery)
		}

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
