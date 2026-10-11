package core

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// getFreePort asks the kernel for a free open TCP port.
func getFreePort(t *testing.T) int {
	addr, err := net.ResolveTCPAddr("tcp", "localhost:0")
	if err != nil {
		t.Fatalf("failed to resolve TCP addr: %v", err)
	}
	l, err := net.ListenTCP("tcp", addr)
	if err != nil {
		t.Fatalf("failed to listen on TCP: %v", err)
	}
	defer l.Close()
	return l.Addr().(*net.TCPAddr).Port
}

// waitForServerReady polls the health/info endpoint until it responds or times out.
func waitForServerReady(baseURL string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		resp, err := http.Get(baseURL + "/api/v1/workspace/info")
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return nil
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	return fmt.Errorf("server at %s did not become ready within %v", baseURL, timeout)
}

// CoreServerHarness holds resources for independent end-to-end testing
type CoreServerHarness struct {
	BaseURL    string
	TempDir    string
	cmd        *exec.Cmd
	HTTPClient *http.Client
}

func setupCoreServer(t *testing.T) *CoreServerHarness {
	// Create real temporary OS workspace directory
	tempDir, err := os.MkdirTemp("", "aegis-core-server-test-*")
	if err != nil {
		t.Fatalf("failed to create temp directory: %v", err)
	}

	port := getFreePort(t)
	portStr := fmt.Sprintf("%d", port)
	baseURL := fmt.Sprintf("http://localhost:%s", portStr)

	// Locate root and server directories
	rootDir, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatalf("failed to determine root dir: %v", err)
	}
	serverDir := filepath.Join(rootDir, "server")
	binPath := filepath.Join(rootDir, "dist-server", "aegis-server")

	// Ensure binary exists
	if _, err := os.Stat(binPath); os.IsNotExist(err) {
		buildCmd := exec.Command("go", "build", "-o", binPath, "./cmd/server")
		buildCmd.Dir = serverDir
		if out, err := buildCmd.CombinedOutput(); err != nil {
			_ = os.RemoveAll(tempDir)
			t.Fatalf("failed to build server binary: %v, out: %s", err, string(out))
		}
	}

	// Start compiled server process directly
	cmd := exec.Command(binPath)
	cmd.Dir = serverDir
	cmd.Env = append(os.Environ(),
		"PORT="+portStr,
		"WORKSPACE_ROOT="+tempDir,
	)

	// Capture output in case of startup failure
	var serverOutput bytes.Buffer
	cmd.Stdout = &serverOutput
	cmd.Stderr = &serverOutput

	if err := cmd.Start(); err != nil {
		_ = os.RemoveAll(tempDir)
		t.Fatalf("failed to start AegisCode Core Server: %v", err)
	}

	if err := waitForServerReady(baseURL, 5*time.Second); err != nil {
		_ = cmd.Process.Kill()
		_ = os.RemoveAll(tempDir)
		t.Fatalf("Core Server startup failed: %v. Output:\n%s", err, serverOutput.String())
	}

	return &CoreServerHarness{
		BaseURL:    baseURL,
		TempDir:    tempDir,
		cmd:        cmd,
		HTTPClient: &http.Client{Timeout: 5 * time.Second},
	}
}

func (h *CoreServerHarness) teardown() {
	if h.cmd != nil && h.cmd.Process != nil {
		_ = h.cmd.Process.Kill()
		_ = h.cmd.Wait()
	}
	if h.TempDir != "" {
		_ = os.RemoveAll(h.TempDir)
	}
}

// TestCoreServerLifecycle executes the centralized table-driven scenario matrix.
func TestCoreServerLifecycle(t *testing.T) {
	h := setupCoreServer(t)
	defer h.teardown()

	type ScenarioStep struct {
		Name     string
		Method   string
		Path     string
		Body     any
		Validate func(t *testing.T, status int, respBody []byte)
	}

	// Table-Driven Scenario Matrix for Core Server Regression
	scenarios := []ScenarioStep{
		{
			Name:   "1. Get Workspace Info",
			Method: http.MethodGet,
			Path:   "/api/v1/workspace/info",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("expected status 200, got %d: %s", status, string(body))
				}
				var res map[string]string
				if err := json.Unmarshal(body, &res); err != nil {
					t.Fatalf("failed to parse JSON: %v", err)
				}
				if res["rootPath"] == "" {
					t.Fatalf("expected non-empty rootPath, got %+v", res)
				}
			},
		},
		{
			Name:   "2. Create File in Workspace",
			Method: http.MethodPost,
			Path:   "/api/v1/workspace/file",
			Body: map[string]any{
				"path":     "hello.txt",
				"content":  "Hello AegisCode World\nSecond line test",
				"isFolder": false,
			},
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("failed to write file: status %d, body: %s", status, string(body))
				}
			},
		},
		{
			Name:   "3. Read File from Workspace",
			Method: http.MethodGet,
			Path:   "/api/v1/workspace/file?path=hello.txt",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("expected status 200, got %d: %s", status, string(body))
				}
				var res map[string]string
				if err := json.Unmarshal(body, &res); err != nil {
					t.Fatalf("failed to parse JSON: %v", err)
				}
				if res["content"] != "Hello AegisCode World\nSecond line test" {
					t.Fatalf("unexpected content: %s", res["content"])
				}
			},
		},
		{
			Name:   "4. Create Folder and Move File",
			Method: http.MethodPost,
			Path:   "/api/v1/workspace/file",
			Body: map[string]any{
				"path":     "subfolder",
				"content":  "",
				"isFolder": true,
			},
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("failed to create folder: status %d, body: %s", status, string(body))
				}
			},
		},
		{
			Name:   "5. Move File to Subfolder",
			Method: http.MethodPost,
			Path:   "/api/v1/workspace/move",
			Body: map[string]string{
				"sourcePath":      "hello.txt",
				"targetDirectory": "subfolder",
			},
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("failed to move file: status %d, body: %s", status, string(body))
				}
				var res map[string]string
				_ = json.Unmarshal(body, &res)
				if !strings.HasSuffix(res["newPath"], "hello.txt") {
					t.Fatalf("unexpected new path: %s", res["newPath"])
				}
			},
		},
		{
			Name:   "6. Workspace Tree Verification",
			Method: http.MethodGet,
			Path:   "/api/v1/workspace/tree?depth=4",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("expected status 200, got %d: %s", status, string(body))
				}
				var res map[string]any
				if err := json.Unmarshal(body, &res); err != nil {
					t.Fatalf("failed to parse tree JSON: %v", err)
				}
				tree, ok := res["tree"].([]any)
				if !ok || len(tree) != 1 {
					t.Fatalf("expected tree with 1 root folder, got %+v", res)
				}
			},
		},
		{
			Name:   "7. Search Text in Workspace",
			Method: http.MethodPost,
			Path:   "/api/v1/workspace/search",
			Body: map[string]any{
				"query":       "AegisCode",
				"isRegex":     false,
				"isMatchCase": false,
				"isWholeWord": false,
			},
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("search failed: status %d, body: %s", status, string(body))
				}
				var res map[string]any
				_ = json.Unmarshal(body, &res)
				results, ok := res["results"].([]any)
				if !ok || len(results) == 0 {
					t.Fatalf("expected search matches, got none: %+v", res)
				}
			},
		},
		{
			Name:   "8. Git Status on Non-Repo Directory",
			Method: http.MethodGet,
			Path:   "/api/v1/git/status",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("git status failed: status %d, body: %s", status, string(body))
				}
				var res map[string]any
				_ = json.Unmarshal(body, &res)
				if isRepo, _ := res["isRepo"].(bool); isRepo {
					t.Fatalf("expected isRepo false for fresh directory, got true")
				}
			},
		},
		{
			Name:   "9. Delete File in Subfolder",
			Method: http.MethodDelete,
			Path:   "/api/v1/workspace/file?path=subfolder/hello.txt",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("delete failed: status %d, body: %s", status, string(body))
				}
			},
		},
		{
			Name:   "10. Verify Deleted File Returns 404",
			Method: http.MethodGet,
			Path:   "/api/v1/workspace/file?path=subfolder/hello.txt",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusNotFound {
					t.Fatalf("expected 404 for deleted file, got status %d", status)
				}
			},
		},
		{
			Name:   "11. Close Active Workspace",
			Method: http.MethodPost,
			Path:   "/api/v1/workspace/close",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("expected 200 for close workspace, got status %d: %s", status, string(body))
				}
				var res map[string]string
				_ = json.Unmarshal(body, &res)
				if res["status"] != "closed" {
					t.Fatalf("expected status closed, got %+v", res)
				}
			},
		},
		{
			Name:   "12. Verify Workspace Info After Close Is Empty",
			Method: http.MethodGet,
			Path:   "/api/v1/workspace/info",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("expected 200, got status %d: %s", status, string(body))
				}
				var res map[string]string
				_ = json.Unmarshal(body, &res)
				if res["rootPath"] != "" {
					t.Fatalf("expected empty rootPath after close, got %s", res["rootPath"])
				}
			},
		},
		{
			Name:   "13. Safe Git Status On Closed Workspace Returns 200 OK",
			Method: http.MethodGet,
			Path:   "/api/v1/git/status",
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("expected 200 OK for git status on empty workspace, got %d: %s", status, string(body))
				}
				var res map[string]any
				_ = json.Unmarshal(body, &res)
				if isRepo, _ := res["isRepo"].(bool); isRepo {
					t.Fatalf("expected isRepo false for empty workspace, got true")
				}
			},
		},
		{
			Name:   "14. Reopen Workspace With Trailing Slash Normalizes Path",
			Method: http.MethodPost,
			Path:   "/api/v1/workspace/open",
			Body: map[string]any{
				"path": h.TempDir + "/",
			},
			Validate: func(t *testing.T, status int, body []byte) {
				if status != http.StatusOK {
					t.Fatalf("expected 200 for reopen workspace, got %d: %s", status, string(body))
				}
				var res map[string]string
				_ = json.Unmarshal(body, &res)
				expectedClean := filepath.Clean(h.TempDir)
				if res["rootPath"] != expectedClean {
					t.Fatalf("expected cleaned rootPath %s, got %s", expectedClean, res["rootPath"])
				}
			},
		},
	}

	for _, step := range scenarios {
		t.Run(step.Name, func(t *testing.T) {
			var bodyReader io.Reader
			if step.Body != nil {
				data, err := json.Marshal(step.Body)
				if err != nil {
					t.Fatalf("failed to marshal request body: %v", err)
				}
				bodyReader = bytes.NewReader(data)
			}

			req, err := http.NewRequest(step.Method, h.BaseURL+step.Path, bodyReader)
			if err != nil {
				t.Fatalf("failed to create HTTP request: %v", err)
			}
			if step.Body != nil {
				req.Header.Set("Content-Type", "application/json")
			}

			resp, err := h.HTTPClient.Do(req)
			if err != nil {
				t.Fatalf("HTTP request failed: %v", err)
			}
			defer resp.Body.Close()

			respBytes, err := io.ReadAll(resp.Body)
			if err != nil {
				t.Fatalf("failed to read response body: %v", err)
			}

			step.Validate(t, resp.StatusCode, respBytes)
		})
	}
}

func TestServerBootWithEmptyWorkspaceRoot(t *testing.T) {
	port := getFreePort(t)
	portStr := fmt.Sprintf("%d", port)
	baseURL := fmt.Sprintf("http://localhost:%s", portStr)

	rootDir, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatalf("failed to determine root dir: %v", err)
	}
	serverDir := filepath.Join(rootDir, "server")
	binPath := filepath.Join(rootDir, "dist-server", "aegis-server")

	// Start server without WORKSPACE_ROOT (empty initial workspace)
	cmd := exec.Command(binPath)
	cmd.Dir = serverDir
	cmd.Env = append(os.Environ(),
		"PORT="+portStr,
		"WORKSPACE_ROOT=",
	)

	var serverOutput bytes.Buffer
	cmd.Stdout = &serverOutput
	cmd.Stderr = &serverOutput

	if err := cmd.Start(); err != nil {
		t.Fatalf("failed to start AegisCode Core Server with empty workspace: %v", err)
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}()

	if err := waitForServerReady(baseURL, 5*time.Second); err != nil {
		t.Fatalf("Core Server startup failed: %v. Output:\n%s", err, serverOutput.String())
	}

	client := &http.Client{Timeout: 5 * time.Second}

	// 1. Verify workspace info has empty root
	resp, err := client.Get(baseURL + "/api/v1/workspace/info")
	if err != nil {
		t.Fatalf("failed to get workspace info: %v", err)
	}
	defer resp.Body.Close()
	var infoRes map[string]string
	_ = json.NewDecoder(resp.Body).Decode(&infoRes)
	if infoRes["rootPath"] != "" {
		t.Fatalf("expected empty rootPath when booting without WORKSPACE_ROOT, got %s", infoRes["rootPath"])
	}

	// 2. Verify git status returns 200 OK with isRepo false
	gitResp, err := client.Get(baseURL + "/api/v1/git/status")
	if err != nil {
		t.Fatalf("failed to get git status: %v", err)
	}
	defer gitResp.Body.Close()
	if gitResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from git status on uninitialized server, got %d", gitResp.StatusCode)
	}
	var gitRes map[string]any
	_ = json.NewDecoder(gitResp.Body).Decode(&gitRes)
	if isRepo, _ := gitRes["isRepo"].(bool); isRepo {
		t.Fatalf("expected isRepo false on uninitialized workspace, got true")
	}
}

func TestTerminalSessionSSEWorkflow(t *testing.T) {
	harness := setupCoreServer(t)
	defer harness.teardown()

	// 1. Create Terminal Session
	createPayload := map[string]any{
		"shell": "sh",
		"cols":  80,
		"rows":  24,
	}
	body, _ := json.Marshal(createPayload)
	resp, err := harness.HTTPClient.Post(harness.BaseURL+"/api/v1/terminal/create", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("failed to create terminal session: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("expected 200 OK from terminal create, got %d: %s", resp.StatusCode, string(raw))
	}

	var createRes map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&createRes)
	sessionID, ok := createRes["sessionId"].(string)
	if !ok || sessionID == "" {
		t.Fatalf("invalid or missing sessionId: %v", createRes)
	}

	// 2. Connect to SSE stream
	sseReq, err := http.NewRequest(http.MethodGet, harness.BaseURL+"/api/v1/events/terminal/"+sessionID, nil)
	if err != nil {
		t.Fatalf("failed to create SSE request: %v", err)
	}
	sseReq.Header.Set("Accept", "text/event-stream")

	sseClient := &http.Client{}
	sseResp, err := sseClient.Do(sseReq)
	if err != nil {
		t.Fatalf("failed to connect to SSE stream: %v", err)
	}
	defer sseResp.Body.Close()

	if sseResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from SSE endpoint, got %d", sseResp.StatusCode)
	}

	// 3. Send Input command via HTTP POST
	inputPayload := map[string]string{
		"data": "echo HELLO_FROM_SSE_TERMINAL\n",
	}
	inBody, _ := json.Marshal(inputPayload)
	inResp, err := harness.HTTPClient.Post(harness.BaseURL+"/api/v1/terminal/"+sessionID+"/input", "application/json", bytes.NewReader(inBody))
	if err != nil {
		t.Fatalf("failed to send terminal input: %v", err)
	}
	_ = inResp.Body.Close()
	if inResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK from terminal input, got %d", inResp.StatusCode)
	}

	// 4. Read SSE stream and verify HELLO_FROM_SSE_TERMINAL appears
	scanner := bufio.NewScanner(sseResp.Body)
	found := false
	deadline := time.After(5 * time.Second)

	receivedChan := make(chan string, 50)
	go func() {
		for scanner.Scan() {
			line := scanner.Text()
			receivedChan <- line
		}
	}()

	for !found {
		select {
		case line := <-receivedChan:
			if strings.Contains(line, "data: {") {
				var msg struct {
					Payload string `json:"payload"`
				}
				dataStr := strings.TrimPrefix(line, "data: ")
				if err := json.Unmarshal([]byte(dataStr), &msg); err == nil && msg.Payload != "" {
					decoded, _ := base64.StdEncoding.DecodeString(msg.Payload)
					if strings.Contains(string(decoded), "HELLO_FROM_SSE_TERMINAL") {
						found = true
					}
				}
			}
		case <-deadline:
			t.Fatalf("timed out waiting for HELLO_FROM_SSE_TERMINAL in SSE stream")
		}
	}

	// 5. Delete session
	delReq, _ := http.NewRequest(http.MethodDelete, harness.BaseURL+"/api/v1/terminal/"+sessionID, nil)
	delResp, err := harness.HTTPClient.Do(delReq)
	if err != nil {
		t.Fatalf("failed to delete terminal: %v", err)
	}
	_ = delResp.Body.Close()
	if delResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK on terminal delete, got %d", delResp.StatusCode)
	}
}

