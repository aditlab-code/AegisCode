package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/aditwicaksono/aegiscode/server/internal/platform"
	"github.com/aditwicaksono/aegiscode/server/internal/workspace"
)

func setupTestServer(t *testing.T, initialDir string) (*Server, http.Handler, string) {
	tempDir, err := os.MkdirTemp("", "api-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	workDir := initialDir
	if workDir == "" {
		workDir = tempDir
	}

	ws, err := workspace.NewManager(workDir)
	if err != nil {
		t.Fatalf("failed to create manager: %v", err)
	}

	picker := &platform.StubFolderPicker{
		Path:      tempDir,
		Cancelled: false,
	}

	srv := NewServer(ws, picker)
	return srv, srv.Routes(), tempDir
}

func executeRequest(handler http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

func TestWorkspaceInfoAndOpenClose(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// 1. GET info
	req := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/info", nil)
	rr := executeRequest(handler, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rr.Code)
	}

	var info WorkspaceInfoResponse
	if err := json.Unmarshal(rr.Body.Bytes(), &info); err != nil {
		t.Fatalf("failed to unmarshal info: %v", err)
	}
	if info.RootPath != tempDir {
		t.Fatalf("expected rootPath '%s', got '%s'", tempDir, info.RootPath)
	}

	// 2. POST close
	closeReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/close", nil)
	rrClose := executeRequest(handler, closeReq)
	if rrClose.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for close, got %d", rrClose.Code)
	}

	// Verify info is now empty
	reqEmpty := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/info", nil)
	rrEmpty := executeRequest(handler, reqEmpty)
	var infoEmpty WorkspaceInfoResponse
	_ = json.Unmarshal(rrEmpty.Body.Bytes(), &infoEmpty)
	if infoEmpty.RootPath != "" {
		t.Fatalf("expected empty root after close, got '%s'", infoEmpty.RootPath)
	}

	// 3. POST open
	openPayload, _ := json.Marshal(OpenWorkspaceRequest{Path: tempDir})
	openReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/open", bytes.NewReader(openPayload))
	rrOpen := executeRequest(handler, openReq)
	if rrOpen.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for open, got %d", rrOpen.Code)
	}
}

func TestWorkspaceFileCRUDAndTree(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// 1. POST create folder
	folderPayload, _ := json.Marshal(CreateFolderRequest{Path: "src"})
	fReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/folder", bytes.NewReader(folderPayload))
	rrF := executeRequest(handler, fReq)
	if rrF.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for folder creation, got %d: %s", rrF.Code, rrF.Body.String())
	}

	// Folder escape must fail
	fEscape, _ := json.Marshal(CreateFolderRequest{Path: "../../escape"})
	fReqEscape := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/folder", bytes.NewReader(fEscape))
	rrEscape := executeRequest(handler, fReqEscape)
	if rrEscape.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for escaping folder, got %d", rrEscape.Code)
	}

	// 2. POST write file
	filePayload, _ := json.Marshal(WriteFileRequest{
		Path:     "src/app.txt",
		Content:  "hello from aegis api test",
		IsFolder: false,
	})
	wReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/file", bytes.NewReader(filePayload))
	rrW := executeRequest(handler, wReq)
	if rrW.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for file write, got %d: %s", rrW.Code, rrW.Body.String())
	}

	// 3. GET read file
	rReq := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/file?path=src/app.txt", nil)
	rrR := executeRequest(handler, rReq)
	if rrR.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for file read, got %d", rrR.Code)
	}
	var fRes FileResponse
	_ = json.Unmarshal(rrR.Body.Bytes(), &fRes)
	if fRes.Content != "hello from aegis api test" {
		t.Fatalf("unexpected file content: %s", fRes.Content)
	}

	// 4. GET tree
	tReq := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/tree", nil)
	rrT := executeRequest(handler, tReq)
	if rrT.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for tree, got %d", rrT.Code)
	}
	var tRes TreeResponse
	_ = json.Unmarshal(rrT.Body.Bytes(), &tRes)
	if len(tRes.Tree) != 1 || tRes.Tree[0].Name != "src" {
		t.Fatalf("unexpected tree: %+v", tRes.Tree)
	}

	// 5. POST rename
	renPayload, _ := json.Marshal(RenameRequest{
		OldPath: "src/app.txt",
		NewPath: "src/renamed.txt",
	})
	renReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/rename", bytes.NewReader(renPayload))
	rrRen := executeRequest(handler, renReq)
	if rrRen.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for rename, got %d", rrRen.Code)
	}

	// 6. DELETE file
	delReq := httptest.NewRequest(http.MethodDelete, "/api/v1/workspace/file?path=src/renamed.txt", nil)
	rrDel := executeRequest(handler, delReq)
	if rrDel.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for delete, got %d", rrDel.Code)
	}
}

func TestWorkspaceSearchAndReplace(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// Write sample file
	filePayload, _ := json.Marshal(WriteFileRequest{
		Path:    "sample.txt",
		Content: "alpha beta gamma\nalpha delta",
	})
	_ = executeRequest(handler, httptest.NewRequest(http.MethodPost, "/api/v1/workspace/file", bytes.NewReader(filePayload)))

	// Search
	sPayload, _ := json.Marshal(SearchRequest{
		Query: "alpha",
	})
	sReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/search", bytes.NewReader(sPayload))
	rrS := executeRequest(handler, sReq)
	if rrS.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for search, got %d", rrS.Code)
	}
	var sRes SearchResponse
	_ = json.Unmarshal(rrS.Body.Bytes(), &sRes)
	if len(sRes.Results) != 1 || len(sRes.Results[0].Matches) != 2 {
		t.Fatalf("unexpected search results: %+v", sRes.Results)
	}

	// Replace all
	repPayload, _ := json.Marshal(ReplaceAllRequest{
		Query:       "alpha",
		Replacement: "omega",
	})
	repReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/replace-all", bytes.NewReader(repPayload))
	rrRep := executeRequest(handler, repReq)
	if rrRep.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for replace-all, got %d", rrRep.Code)
	}
	var repRes ReplaceAllResponse
	_ = json.Unmarshal(rrRep.Body.Bytes(), &repRes)
	if repRes.Replacements != 2 || len(repRes.ModifiedFiles) != 1 {
		t.Fatalf("unexpected replace result: %+v", repRes)
	}
}

func TestGitStatusEndpoint(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// 1. Non-repo
	req := httptest.NewRequest(http.MethodGet, "/api/v1/git/status", nil)
	rr := executeRequest(handler, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for git status, got %d", rr.Code)
	}
	var status workspace.RepoStatus
	_ = json.Unmarshal(rr.Body.Bytes(), &status)
	if status.IsRepo {
		t.Fatalf("expected isRepo false, got true")
	}

	// 2. Repo with .git/HEAD
	gitDir := filepath.Join(tempDir, ".git")
	_ = os.Mkdir(gitDir, 0755)
	_ = os.WriteFile(filepath.Join(gitDir, "HEAD"), []byte("ref: refs/heads/develop\n"), 0644)

	rr2 := executeRequest(handler, req)
	var status2 workspace.RepoStatus
	_ = json.Unmarshal(rr2.Body.Bytes(), &status2)
	if !status2.IsRepo || status2.Branch != "develop" {
		t.Fatalf("expected repo with branch 'develop', got: %+v", status2)
	}
}

func TestPlatformPickAndBrowseEndpoints(t *testing.T) {
	srv, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// 1. Browse
	bReq := httptest.NewRequest(http.MethodGet, "/api/v1/workspace/browse?path="+tempDir, nil)
	rrB := executeRequest(handler, bReq)
	if rrB.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for browse, got %d", rrB.Code)
	}

	// 2. Pick folder (stub returns tempDir)
	pReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/pick-folder", nil)
	rrP := executeRequest(handler, pReq)
	if rrP.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for pick folder, got %d", rrP.Code)
	}
	var pRes PickFolderResponse
	_ = json.Unmarshal(rrP.Body.Bytes(), &pRes)
	if pRes.Status != "ok" || pRes.Path != tempDir {
		t.Fatalf("unexpected pick folder response: %+v", pRes)
	}

	// 3. Pick folder cancelled
	srv.picker = &platform.StubFolderPicker{Cancelled: true}
	rrPCancel := executeRequest(handler, pReq)
	var pCancelRes PickFolderResponse
	_ = json.Unmarshal(rrPCancel.Body.Bytes(), &pCancelRes)
	if pCancelRes.Status != "cancelled" || !pCancelRes.Cancelled {
		t.Fatalf("expected cancelled status, got: %+v", pCancelRes)
	}
}
