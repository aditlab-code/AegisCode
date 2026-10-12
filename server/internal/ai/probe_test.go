package ai

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProbeOpenRouter(t *testing.T) {
	// 1. Missing Key
	resMissing := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "openrouter",
	})
	if resMissing.Success {
		t.Errorf("expected failure when API key is missing")
	}

	// 2. Success with Mock Server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer ts.Close()

	SetHTTPClient(ts.Client())

	resSuccess := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "openrouter",
		APIKey:   "test-key",
		BaseURL:  ts.URL,
	})
	if !resSuccess.Success {
		t.Errorf("expected success with mock server, got error: %s", resSuccess.Error)
	}

	// 3. Unauthorized with Mock Server
	resAuthFail := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "openrouter",
		APIKey:   "invalid-key",
		BaseURL:  ts.URL,
	})
	if resAuthFail.Success {
		t.Errorf("expected auth failure, got success")
	}
}

func TestProbeOpenCode(t *testing.T) {
	// 1. Missing Key
	resMissing := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "opencode",
	})
	if resMissing.Success {
		t.Errorf("expected failure when API key is missing")
	}

	// 2. Success with Mock Server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-opencode-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer ts.Close()

	SetHTTPClient(ts.Client())

	resSuccess := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "opencode",
		APIKey:   "test-opencode-key",
		BaseURL:  ts.URL,
	})
	if !resSuccess.Success {
		t.Errorf("expected success with mock server, got error: %s", resSuccess.Error)
	}
}

func TestProbeCLI(t *testing.T) {
	// 1. Test binary that exists (e.g. echo)
	resEcho := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "claude",
		Command:  "echo hello",
	})
	if !resEcho.Success {
		t.Errorf("expected success for existing binary 'echo', got error: %s", resEcho.Error)
	}

	// 2. Test binary that does not exist
	resMissing := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "claude",
		Command:  "nonexistent-cmd-xyz-987",
	})
	if resMissing.Success {
		t.Errorf("expected failure for nonexistent binary")
	}
}

func TestProbeOpenAI(t *testing.T) {
	// 1. Missing Key
	resMissing := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "openai",
	})
	if resMissing.Success {
		t.Errorf("expected failure when API key is missing")
	}

	// 2. Success with Mock Server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-openai-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer ts.Close()

	SetHTTPClient(ts.Client())

	resSuccess := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "openai",
		APIKey:   "test-openai-key",
		BaseURL:  ts.URL,
	})
	if !resSuccess.Success {
		t.Errorf("expected success with mock server, got error: %s", resSuccess.Error)
	}

	// 3. Unauthorized
	resAuthFail := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "openai",
		APIKey:   "invalid-key",
		BaseURL:  ts.URL,
	})
	if resAuthFail.Success {
		t.Errorf("expected auth failure, got success")
	}
}

func TestProbeClaudeHTTP(t *testing.T) {
	// 1. Missing Key when Command is empty
	resMissing := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "claude",
	})
	if resMissing.Success {
		t.Errorf("expected failure when API key is missing")
	}

	// 2. Success with Mock Server
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("x-api-key") != "test-claude-key" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	defer ts.Close()

	SetHTTPClient(ts.Client())

	resSuccess := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "claude",
		APIKey:   "test-claude-key",
		BaseURL:  ts.URL,
	})
	if !resSuccess.Success {
		t.Errorf("expected success with mock server, got error: %s", resSuccess.Error)
	}
}

func TestProbeUnsupportedProvider(t *testing.T) {
	res := ProbeProvider(context.Background(), ProbeRequest{
		Provider: "unknown-ai",
	})
	if res.Success {
		t.Errorf("expected failure for unsupported provider")
	}
}
