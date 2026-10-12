package api

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/debug"
	"github.com/aditwicaksono/aegiscode/server/internal/git"
	"github.com/aditwicaksono/aegiscode/server/internal/platform"
	"github.com/aditwicaksono/aegiscode/server/internal/store"
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

	storeDir := t.TempDir()
	st, err := store.New(storeDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	srv := NewServer(ws, picker, st)
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

	// 2b. POST write traversal attempt must return 400 Bad Request
	badPayload, _ := json.Marshal(WriteFileRequest{
		Path:    "../../escape.txt",
		Content: "bad content",
	})
	badReq := httptest.NewRequest(http.MethodPost, "/api/v1/workspace/file", bytes.NewReader(badPayload))
	rrBad := executeRequest(handler, badReq)
	if rrBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for traversal write, got %d: %s", rrBad.Code, rrBad.Body.String())
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

func TestGitEndpoints(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// Init git repo
	cmd := exec.Command("git", "init", "-b", "main")
	cmd.Dir = tempDir
	if err := cmd.Run(); err != nil {
		fallback := exec.Command("git", "init")
		fallback.Dir = tempDir
		_ = fallback.Run()
	}
	_ = exec.Command("git", "-C", tempDir, "config", "user.name", "Tester").Run()
	_ = exec.Command("git", "-C", tempDir, "config", "user.email", "tester@example.com").Run()

	// 1. Git Status
	statusReq := httptest.NewRequest(http.MethodGet, "/api/v1/git/status", nil)
	rrStatus := executeRequest(handler, statusReq)
	if rrStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 for status, got %d", rrStatus.Code)
	}

	// 2. Write file
	testFile := filepath.Join(tempDir, "sample.txt")
	_ = os.WriteFile(testFile, []byte("line1\nline2\n"), 0644)

	// 3. Stage
	stageBody, _ := json.Marshal(StageFilesRequest{Files: []string{"sample.txt"}})
	stageReq := httptest.NewRequest(http.MethodPost, "/api/v1/git/stage", bytes.NewReader(stageBody))
	rrStage := executeRequest(handler, stageReq)
	if rrStage.Code != http.StatusOK {
		t.Fatalf("expected 200 for stage, got %d", rrStage.Code)
	}

	// 4. Commit
	commitBody, _ := json.Marshal(CommitRequest{Message: "initial sample"})
	commitReq := httptest.NewRequest(http.MethodPost, "/api/v1/git/commit", bytes.NewReader(commitBody))
	rrCommit := executeRequest(handler, commitReq)
	if rrCommit.Code != http.StatusOK {
		t.Fatalf("expected 200 for commit, got %d", rrCommit.Code)
	}

	// 5. Branches
	branchesReq := httptest.NewRequest(http.MethodGet, "/api/v1/git/branches", nil)
	rrBranches := executeRequest(handler, branchesReq)
	if rrBranches.Code != http.StatusOK {
		t.Fatalf("expected 200 for branches, got %d", rrBranches.Code)
	}

	// 6. Log
	logReq := httptest.NewRequest(http.MethodGet, "/api/v1/git/log?limit=10", nil)
	rrLog := executeRequest(handler, logReq)
	if rrLog.Code != http.StatusOK {
		t.Fatalf("expected 200 for log, got %d", rrLog.Code)
	}
	var logRes LogResponse
	_ = json.Unmarshal(rrLog.Body.Bytes(), &logRes)
	if len(logRes.Commits) != 1 {
		t.Fatalf("expected 1 commit in log, got %d", len(logRes.Commits))
	}

	// 7. Diff
	_ = os.WriteFile(testFile, []byte("line1\nmodified line\n"), 0644)
	diffReq := httptest.NewRequest(http.MethodGet, "/api/v1/git/diff?file=sample.txt", nil)
	rrDiff := executeRequest(handler, diffReq)
	if rrDiff.Code != http.StatusOK {
		t.Fatalf("expected 200 for diff, got %d", rrDiff.Code)
	}
}

func TestGitInitStageUnstage_E2E(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// 1. Initially not a git repo
	statusReq := httptest.NewRequest(http.MethodGet, "/api/v1/git/status", nil)
	rrStatus := executeRequest(handler, statusReq)
	if rrStatus.Code != http.StatusOK {
		t.Fatalf("expected 200 for initial status, got %d", rrStatus.Code)
	}
	var st1 git.RepoStatus
	_ = json.Unmarshal(rrStatus.Body.Bytes(), &st1)
	if st1.IsRepo {
		t.Fatalf("expected isRepo false before init")
	}

	// 2. Initialize repository via POST /api/v1/git/init
	initReq := httptest.NewRequest(http.MethodPost, "/api/v1/git/init", nil)
	rrInit := executeRequest(handler, initReq)
	if rrInit.Code != http.StatusOK {
		t.Fatalf("expected 200 for init, got %d: %s", rrInit.Code, rrInit.Body.String())
	}

	_ = exec.Command("git", "-C", tempDir, "config", "user.name", "Tester").Run()
	_ = exec.Command("git", "-C", tempDir, "config", "user.email", "tester@example.com").Run()

	// Verify status after init
	rrStatus2 := executeRequest(handler, statusReq)
	var st2 git.RepoStatus
	_ = json.Unmarshal(rrStatus2.Body.Bytes(), &st2)
	if !st2.IsRepo {
		t.Fatalf("expected isRepo true after init")
	}

	// 3. Create sample files
	fileA := filepath.Join(tempDir, "doc.txt")
	_ = os.WriteFile(fileA, []byte("content doc"), 0644)
	subDir := filepath.Join(tempDir, "nested")
	_ = os.MkdirAll(subDir, 0755)
	fileB := filepath.Join(subDir, "file.txt")
	_ = os.WriteFile(fileB, []byte("content nested"), 0644)

	// Check status has 2 unstaged
	rrStatus3 := executeRequest(handler, statusReq)
	var st3 git.RepoStatus
	_ = json.Unmarshal(rrStatus3.Body.Bytes(), &st3)
	if len(st3.Unstaged) != 2 {
		t.Fatalf("expected 2 unstaged files, got %d", len(st3.Unstaged))
	}

	// 4. Stage single file
	stageBody, _ := json.Marshal(StageFilesRequest{Files: []string{"doc.txt"}})
	stageReq := httptest.NewRequest(http.MethodPost, "/api/v1/git/stage", bytes.NewReader(stageBody))
	rrStage := executeRequest(handler, stageReq)
	if rrStage.Code != http.StatusOK {
		t.Fatalf("expected 200 for stage doc.txt, got %d: %s", rrStage.Code, rrStage.Body.String())
	}

	// Verify 1 staged, 1 unstaged
	rrStatus4 := executeRequest(handler, statusReq)
	var st4 git.RepoStatus
	_ = json.Unmarshal(rrStatus4.Body.Bytes(), &st4)
	if len(st4.Staged) != 1 || len(st4.Unstaged) != 1 {
		t.Fatalf("expected 1 staged and 1 unstaged, got staged=%d, unstaged=%d", len(st4.Staged), len(st4.Unstaged))
	}

	// 5. Unstage single file BEFORE initial commit (no HEAD)
	unstageBody, _ := json.Marshal(UnstageFilesRequest{Files: []string{"doc.txt"}})
	unstageReq := httptest.NewRequest(http.MethodPost, "/api/v1/git/unstage", bytes.NewReader(unstageBody))
	rrUnstage := executeRequest(handler, unstageReq)
	if rrUnstage.Code != http.StatusOK {
		t.Fatalf("expected 200 for unstage doc.txt without HEAD, got %d: %s", rrUnstage.Code, rrUnstage.Body.String())
	}

	// Verify 0 staged, 2 unstaged
	rrStatus5 := executeRequest(handler, statusReq)
	var st5 git.RepoStatus
	_ = json.Unmarshal(rrStatus5.Body.Bytes(), &st5)
	if len(st5.Staged) != 0 || len(st5.Unstaged) != 2 {
		t.Fatalf("expected 0 staged and 2 unstaged after unstage without HEAD, got staged=%d, unstaged=%d", len(st5.Staged), len(st5.Unstaged))
	}

	// 6. Stage all
	stageAllBody, _ := json.Marshal(StageFilesRequest{All: true})
	rrStageAll := executeRequest(handler, httptest.NewRequest(http.MethodPost, "/api/v1/git/stage", bytes.NewReader(stageAllBody)))
	if rrStageAll.Code != http.StatusOK {
		t.Fatalf("expected 200 for stage all, got %d", rrStageAll.Code)
	}

	// 7. Unstage all BEFORE initial commit (no HEAD)
	unstageAllBody, _ := json.Marshal(UnstageFilesRequest{All: true})
	rrUnstageAll := executeRequest(handler, httptest.NewRequest(http.MethodPost, "/api/v1/git/unstage", bytes.NewReader(unstageAllBody)))
	if rrUnstageAll.Code != http.StatusOK {
		t.Fatalf("expected 200 for unstage all without HEAD, got %d: %s", rrUnstageAll.Code, rrUnstageAll.Body.String())
	}

	// 8. Stage all and commit to create HEAD
	executeRequest(handler, httptest.NewRequest(http.MethodPost, "/api/v1/git/stage", bytes.NewReader(stageAllBody)))
	commitBody, _ := json.Marshal(CommitRequest{Message: "feat: initial commit"})
	rrCommit := executeRequest(handler, httptest.NewRequest(http.MethodPost, "/api/v1/git/commit", bytes.NewReader(commitBody)))
	if rrCommit.Code != http.StatusOK {
		t.Fatalf("expected 200 for commit, got %d", rrCommit.Code)
	}

	// 9. Modify file and stage it with HEAD existing
	_ = os.WriteFile(fileA, []byte("content doc modified"), 0644)
	executeRequest(handler, httptest.NewRequest(http.MethodPost, "/api/v1/git/stage", bytes.NewReader(stageBody)))

	// 10. Unstage single file with HEAD existing
	rrUnstageWithHead := executeRequest(handler, httptest.NewRequest(http.MethodPost, "/api/v1/git/unstage", bytes.NewReader(unstageBody)))
	if rrUnstageWithHead.Code != http.StatusOK {
		t.Fatalf("expected 200 for unstage doc.txt with HEAD, got %d: %s", rrUnstageWithHead.Code, rrUnstageWithHead.Body.String())
	}
}

func TestGitUnlockEndpoint(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// Init git repo
	initReq := httptest.NewRequest(http.MethodPost, "/api/v1/git/init", nil)
	rrInit := executeRequest(handler, initReq)
	if rrInit.Code != http.StatusOK {
		t.Fatalf("expected 200 for init, got %d", rrInit.Code)
	}

	// Create artificial locks
	indexLock := filepath.Join(tempDir, ".git", "index.lock")
	_ = os.WriteFile(indexLock, []byte("locked"), 0644)

	unlockReq := httptest.NewRequest(http.MethodPost, "/api/v1/git/unlock", nil)
	rrUnlock := executeRequest(handler, unlockReq)
	if rrUnlock.Code != http.StatusOK {
		t.Fatalf("expected 200 for unlock, got %d: %s", rrUnlock.Code, rrUnlock.Body.String())
	}

	var res UnlockResponse
	if err := json.Unmarshal(rrUnlock.Body.Bytes(), &res); err != nil {
		t.Fatalf("failed to unmarshal unlock response: %v", err)
	}
	if !res.Unlocked {
		t.Errorf("expected Unlocked true, got false")
	}
	if len(res.Removed) != 1 || res.Removed[0] != "index.lock" {
		t.Errorf("expected removed ['index.lock'], got %v", res.Removed)
	}

	if _, err := os.Stat(indexLock); !os.IsNotExist(err) {
		t.Errorf("expected index.lock to be deleted after unlock")
	}
}

func TestTerminalEndpoints(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "aegis-term-api-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	ws, _ := workspace.NewManager(tempDir)
	picker := platform.NewNativeFolderPicker()
	srv := NewServer(ws, picker)
	handler := srv.Routes()

	// 1. Create terminal
	createBody, _ := json.Marshal(CreateTerminalRequest{
		Shell: "sh",
		Cols:  80,
		Rows:  24,
	})
	createReq := httptest.NewRequest(http.MethodPost, "/api/v1/terminal/create", bytes.NewReader(createBody))
	rrCreate := executeRequest(handler, createReq)
	if rrCreate.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rrCreate.Code, rrCreate.Body.String())
	}

	var createResp CreateTerminalResponse
	if err := json.Unmarshal(rrCreate.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("failed to decode create response: %v", err)
	}
	if createResp.SessionId == "" {
		t.Fatalf("expected non-empty SessionId")
	}

	// 2. List sessions
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/terminal/sessions", nil)
	rrList := executeRequest(handler, listReq)
	if rrList.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rrList.Code)
	}
	var listResp TerminalSessionsResponse
	_ = json.Unmarshal(rrList.Body.Bytes(), &listResp)
	if len(listResp.Sessions) != 1 || listResp.Sessions[0].SessionId != createResp.SessionId {
		t.Fatalf("expected 1 session with id %s, got %v", createResp.SessionId, listResp.Sessions)
	}

	// 3. Write input
	inputBody, _ := json.Marshal(TerminalInputRequest{Data: "echo 123\n"})
	inputReq := httptest.NewRequest(http.MethodPost, "/api/v1/terminal/"+createResp.SessionId+"/input", bytes.NewReader(inputBody))
	rrInput := executeRequest(handler, inputReq)
	if rrInput.Code != http.StatusOK {
		t.Fatalf("expected 200 for input, got %d: %s", rrInput.Code, rrInput.Body.String())
	}

	// 4. Resize
	resizeBody, _ := json.Marshal(TerminalResizeRequest{Cols: 100, Rows: 30})
	resizeReq := httptest.NewRequest(http.MethodPost, "/api/v1/terminal/"+createResp.SessionId+"/resize", bytes.NewReader(resizeBody))
	rrResize := executeRequest(handler, resizeReq)
	if rrResize.Code != http.StatusOK {
		t.Fatalf("expected 200 for resize, got %d: %s", rrResize.Code, rrResize.Body.String())
	}

	// 5. Delete session
	delReq := httptest.NewRequest(http.MethodDelete, "/api/v1/terminal/"+createResp.SessionId, nil)
	rrDel := executeRequest(handler, delReq)
	if rrDel.Code != http.StatusOK {
		t.Fatalf("expected 200 for delete, got %d: %s", rrDel.Code, rrDel.Body.String())
	}

	// 6. Verify empty list
	rrListAfter := executeRequest(handler, listReq)
	var listAfter TerminalSessionsResponse
	_ = json.Unmarshal(rrListAfter.Body.Bytes(), &listAfter)
	if len(listAfter.Sessions) != 0 {
		t.Fatalf("expected 0 sessions after delete, got %d", len(listAfter.Sessions))
	}
}

func TestWorkspaceEventsSSE(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	server := httptest.NewServer(handler)
	defer server.Close()

	req, err := http.NewRequest(http.MethodGet, server.URL+"/api/v1/events/workspace", nil)
	if err != nil {
		t.Fatalf("failed to create request: %v", err)
	}

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("failed to connect to SSE: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("expected text/event-stream, got %s", ct)
	}

	// Read initial connected event
	buf := make([]byte, 1024)
	n, err := resp.Body.Read(buf)
	if err != nil && err.Error() != "EOF" {
		t.Fatalf("failed to read connected event: %v", err)
	}
	content := string(buf[:n])
	if !bytes.Contains([]byte(content), []byte("event: connected")) {
		t.Fatalf("expected initial connected event, got: %s", content)
	}
}

func TestWorkersApiEndpoints(t *testing.T) {
	server, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)
	defer func() { _ = server.ws.Close() }()

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. Initially no workers
	resp, err := http.Get(ts.URL + "/api/v1/workers")
	if err != nil {
		t.Fatalf("failed to get workers: %v", err)
	}
	var listRes struct {
		Workers []map[string]any `json:"workers"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&listRes)
	resp.Body.Close()
	if len(listRes.Workers) != 0 {
		t.Fatalf("expected 0 workers, got %d", len(listRes.Workers))
	}

	// 2. Start a worker
	startBody := `{"id":"test-echo","name":"Echo Worker","command":"sh","args":["-c","echo hello-worker; sleep 5"]}`
	resp, err = http.Post(ts.URL+"/api/v1/workers", "application/json", strings.NewReader(startBody))
	if err != nil {
		t.Fatalf("failed to start worker: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	time.Sleep(100 * time.Millisecond)

	// 3. Inspect worker info
	resp, err = http.Get(ts.URL + "/api/v1/workers/test-echo")
	if err != nil {
		t.Fatalf("failed to get worker test-echo: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var infoRes struct {
		Worker map[string]any `json:"worker"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&infoRes)
	resp.Body.Close()
	if infoRes.Worker["id"] != "test-echo" {
		t.Fatalf("expected id test-echo, got %v", infoRes.Worker["id"])
	}

	// 4. Inspect worker logs
	resp, err = http.Get(ts.URL + "/api/v1/workers/test-echo/logs")
	if err != nil {
		t.Fatalf("failed to get worker logs: %v", err)
	}
	var logsRes struct {
		Logs string `json:"logs"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&logsRes)
	resp.Body.Close()
	if !strings.Contains(logsRes.Logs, "hello-worker") {
		t.Fatalf("expected logs to contain 'hello-worker', got %q", logsRes.Logs)
	}

	// 5. Validation error (empty body) returns 400
	resp, err = http.Post(ts.URL+"/api/v1/workers", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("failed to post empty worker: %v", err)
	}
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 6. Conflict error on duplicate active worker returns 409
	resp, err = http.Post(ts.URL+"/api/v1/workers", "application/json", strings.NewReader(startBody))
	if err != nil {
		t.Fatalf("failed to post duplicate worker: %v", err)
	}
	if resp.StatusCode != http.StatusConflict {
		t.Fatalf("expected 409 Conflict, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 7. Stop worker via POST .../stop
	resp, err = http.Post(ts.URL+"/api/v1/workers/test-echo/stop", "application/json", nil)
	if err != nil {
		t.Fatalf("failed to stop worker: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 8. Delete worker via DELETE ... unregisters from supervisor
	reqDel, _ := http.NewRequest(http.MethodDelete, ts.URL+"/api/v1/workers/test-echo", nil)
	resp, err = http.DefaultClient.Do(reqDel)
	if err != nil {
		t.Fatalf("failed to delete worker: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Verify worker is gone (404)
	resp, err = http.Get(ts.URL + "/api/v1/workers/test-echo")
	if err != nil {
		t.Fatalf("failed to get deleted worker: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found after delete, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 9. SSE Events endpoint connection
	resp, err = http.Get(ts.URL + "/api/v1/events/workers")
	if err != nil {
		t.Fatalf("failed to connect to worker SSE: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for SSE, got %d", resp.StatusCode)
	}
	buf := make([]byte, 256)
	n, _ := resp.Body.Read(buf)
	resp.Body.Close()
	if !strings.Contains(string(buf[:n]), "connected") {
		t.Fatalf("expected connected event in SSE stream, got %s", string(buf[:n]))
	}
}

func TestStorageEndpoints(t *testing.T) {
	srv, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. GET /api/v1/config
	resp, err := http.Get(ts.URL + "/api/v1/config")
	if err != nil {
		t.Fatalf("failed to get config: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var cfg store.Config
	_ = json.NewDecoder(resp.Body).Decode(&cfg)
	resp.Body.Close()

	// 2. POST /api/v1/config
	cfg.Theme = "tokyo-night"
	cfg.DefaultModel = "gemini-3.8-flash"
	cfg.BypassTokens = map[string]string{"antigravity": "token-xyz"}
	cfgBody, _ := json.Marshal(cfg)
	resp, err = http.Post(ts.URL+"/api/v1/config", "application/json", bytes.NewReader(cfgBody))
	if err != nil {
		t.Fatalf("failed to post config: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on config post, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Verify updated config via GET
	resp, _ = http.Get(ts.URL + "/api/v1/config")
	var updatedCfg store.Config
	_ = json.NewDecoder(resp.Body).Decode(&updatedCfg)
	resp.Body.Close()
	if updatedCfg.Theme != "tokyo-night" {
		t.Errorf("expected theme tokyo-night, got %s", updatedCfg.Theme)
	}

	// 3. GET /api/v1/state
	resp, err = http.Get(ts.URL + "/api/v1/state")
	if err != nil {
		t.Fatalf("failed to get state: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 4. POST /api/v1/state/recent
	recentReq := map[string]string{"path": filepath.Join(tempDir, "workspaceA")}
	b, _ := json.Marshal(recentReq)
	resp, err = http.Post(ts.URL+"/api/v1/state/recent", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("failed to post recent project: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on post recent, got %d", resp.StatusCode)
	}
	var st store.AppState
	_ = json.NewDecoder(resp.Body).Decode(&st)
	resp.Body.Close()
	if len(st.RecentProjects) != 1 {
		t.Errorf("expected 1 recent project, got %d", len(st.RecentProjects))
	}

	// 5. DELETE /api/v1/state/recent?all=true
	delReq, _ := http.NewRequest(http.MethodDelete, ts.URL+"/api/v1/state/recent?all=true", nil)
	resp, err = http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatalf("failed to clear recent projects: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on clear recent, got %d", resp.StatusCode)
	}
	_ = json.NewDecoder(resp.Body).Decode(&st)
	resp.Body.Close()
	if len(st.RecentProjects) != 0 {
		t.Errorf("expected 0 recent projects after clear, got %d", len(st.RecentProjects))
	}

	// 6. GET /api/v1/chats (empty list initially)
	resp, err = http.Get(ts.URL + "/api/v1/chats")
	if err != nil {
		t.Fatalf("failed to list chats: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var chatsList map[string][]store.ChatSummary
	_ = json.NewDecoder(resp.Body).Decode(&chatsList)
	resp.Body.Close()
	if len(chatsList["chats"]) != 0 {
		t.Errorf("expected 0 chats, got %d", len(chatsList["chats"]))
	}

	// 7. POST /api/v1/chats/session-101
	newSession := store.ChatSession{
		ID:       "session-101",
		Title:    "Architecture Review",
		Provider: "antigravity",
		Model:    "gemini-3.8-flash",
		Messages: []store.ChatMessage{
			{ID: "m1", Role: "user", Text: "Hello AI"},
		},
	}
	sessBytes, _ := json.Marshal(newSession)
	resp, err = http.Post(ts.URL+"/api/v1/chats/session-101", "application/json", bytes.NewReader(sessBytes))
	if err != nil {
		t.Fatalf("failed to post chat session: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on chat post, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 8. GET /api/v1/chats/session-101
	resp, err = http.Get(ts.URL + "/api/v1/chats/session-101")
	if err != nil {
		t.Fatalf("failed to get chat session: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	var retrieved store.ChatSession
	_ = json.NewDecoder(resp.Body).Decode(&retrieved)
	resp.Body.Close()
	if retrieved.Title != "Architecture Review" || len(retrieved.Messages) != 1 {
		t.Errorf("retrieved session mismatch: %+v", retrieved)
	}

	// 9. DELETE /api/v1/chats/session-101
	delChatReq, _ := http.NewRequest(http.MethodDelete, ts.URL+"/api/v1/chats/session-101", nil)
	resp, err = http.DefaultClient.Do(delChatReq)
	if err != nil {
		t.Fatalf("failed to delete chat session: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on delete chat, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// Verify 404 after deletion
	resp, _ = http.Get(ts.URL + "/api/v1/chats/session-101")
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("expected 404 after chat deletion, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	// 10. Test POST /api/v1/chats/session-ledger/events and GET ...?format=graph
	eventNode := store.GraphNode{
		ID:     "n-api-1",
		Type:   "user",
		Text:   "Ledger API test prompt",
		Output: strings.Repeat("Large diagnostic log payload\n", 150), // triggers CAS blob
	}
	eventBytes, _ := json.Marshal(eventNode)
	resp, err = http.Post(ts.URL+"/api/v1/chats/session-ledger/events", "application/json", bytes.NewReader(eventBytes))
	if err != nil {
		t.Fatalf("failed to append event node via API: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 on event post, got %d", resp.StatusCode)
	}
	var appendRes struct {
		Status string          `json:"status"`
		NodeId string          `json:"nodeId"`
		Node   store.GraphNode `json:"node"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&appendRes)
	resp.Body.Close()
	if appendRes.NodeId != "n-api-1" || appendRes.Node.BlobRef == "" {
		t.Errorf("expected node n-api-1 with BlobRef, got %+v", appendRes)
	}

	// 11. Test GET /api/v1/blobs/:hash
	resp, err = http.Get(ts.URL + "/api/v1/blobs/" + appendRes.Node.BlobRef)
	if err != nil {
		t.Fatalf("failed to fetch blob via API: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for blob fetch, got %d", resp.StatusCode)
	}
	blobBody, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	if !strings.Contains(string(blobBody), "Large diagnostic log payload") {
		t.Errorf("blob body mismatch")
	}

	// 12. Test GET /api/v1/chats/session-ledger?format=graph
	resp, err = http.Get(ts.URL + "/api/v1/chats/session-ledger?format=graph")
	if err != nil {
		t.Fatalf("failed to get chat graph: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for chat graph, got %d", resp.StatusCode)
	}
	var graphRes struct {
		ID    string            `json:"id"`
		Nodes []store.GraphNode `json:"nodes"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&graphRes)
	resp.Body.Close()
	if len(graphRes.Nodes) != 1 || graphRes.Nodes[0].ID != "n-api-1" {
		t.Errorf("expected 1 graph node n-api-1, got %+v", graphRes)
	}

	// 13. Test automatic AddRecentProject via /api/v1/workspace/open
	openReq := map[string]string{"path": tempDir}
	openBytes, _ := json.Marshal(openReq)
	resp, err = http.Post(ts.URL+"/api/v1/workspace/open", "application/json", bytes.NewReader(openBytes))
	if err != nil {
		t.Fatalf("failed to open workspace: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	resp.Body.Close()

	storedState, err := srv.Store().GetState()
	if err != nil {
		t.Fatalf("failed to read state from store: %v", err)
	}
	if len(storedState.RecentProjects) == 0 || storedState.RecentProjects[0] != tempDir {
		t.Errorf("expected recent projects to contain %s, got %v", tempDir, storedState.RecentProjects)
	}
}

func TestAIProbeEndpoint(t *testing.T) {
	server, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)
	defer func() { _ = server.ws.Close() }()

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. Test unsupported provider -> 200 with success: false
	probeReq := map[string]string{
		"provider": "unknown-provider",
	}
	b, _ := json.Marshal(probeReq)
	resp, err := http.Post(ts.URL+"/api/v1/ai/test", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("failed to call ai test endpoint: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	var res struct {
		Success  bool   `json:"success"`
		Provider string `json:"provider"`
		Error    string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if res.Success {
		t.Errorf("expected success to be false for unknown provider")
	}
	if res.Provider != "unknown-provider" {
		t.Errorf("expected provider 'unknown-provider', got %s", res.Provider)
	}
}

func TestAIModelsAndSkillsEndpoints(t *testing.T) {
	server, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)
	defer func() { _ = server.ws.Close() }()

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. Test GET /api/v1/ai/models
	respModels, err := http.Get(ts.URL + "/api/v1/ai/models")
	if err != nil {
		t.Fatalf("failed to call ai models endpoint: %v", err)
	}
	defer respModels.Body.Close()

	if respModels.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for models, got %d", respModels.StatusCode)
	}

	var modelsRes struct {
		Models []map[string]any `json:"models"`
	}
	if err := json.NewDecoder(respModels.Body).Decode(&modelsRes); err != nil {
		t.Fatalf("failed to decode models response: %v", err)
	}
	if len(modelsRes.Models) == 0 {
		t.Errorf("expected at least 1 model in response")
	}

	// 2. Test GET /api/v1/ai/skills
	respSkills, err := http.Get(ts.URL + "/api/v1/ai/skills")
	if err != nil {
		t.Fatalf("failed to call ai skills endpoint: %v", err)
	}
	defer respSkills.Body.Close()

	if respSkills.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for skills, got %d", respSkills.StatusCode)
	}

	var skillsRes struct {
		Skills []map[string]any `json:"skills"`
	}
	if err := json.NewDecoder(respSkills.Body).Decode(&skillsRes); err != nil {
		t.Fatalf("failed to decode skills response: %v", err)
	}
	if len(skillsRes.Skills) == 0 {
		t.Errorf("expected at least 1 skill in response")
	}

	// 3. Test POST /api/v1/ai/chat with empty prompt -> 400 Bad Request
	chatReq := map[string]string{
		"prompt": "",
	}
	b, _ := json.Marshal(chatReq)
	respChat, err := http.Post(ts.URL+"/api/v1/ai/chat", "application/json", bytes.NewReader(b))
	if err != nil {
		t.Fatalf("failed to call chat endpoint: %v", err)
	}
	defer respChat.Body.Close()

	if respChat.StatusCode != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for empty prompt, got %d", respChat.StatusCode)
	}
}

func TestDebugApiEndpoints(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. GET /api/v1/debug/state
	respState, err := http.Get(ts.URL + "/api/v1/debug/state")
	if err != nil {
		t.Fatalf("failed to get debug state: %v", err)
	}
	defer respState.Body.Close()
	if respState.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for debug state, got %d", respState.StatusCode)
	}
	var state debug.DebugState
	if err := json.NewDecoder(respState.Body).Decode(&state); err != nil {
		t.Fatalf("failed to decode debug state: %v", err)
	}
	if state.Active || state.Status != "idle" {
		t.Fatalf("expected inactive idle state, got %+v", state)
	}

	// 2. POST /api/v1/debug/breakpoints
	bpReq := debug.SetBreakpointsRequest{
		File:  "main.go",
		Lines: []int{42, 50},
	}
	bpBytes, _ := json.Marshal(bpReq)
	respBp, err := http.Post(ts.URL+"/api/v1/debug/breakpoints", "application/json", bytes.NewReader(bpBytes))
	if err != nil {
		t.Fatalf("failed to post breakpoints: %v", err)
	}
	defer respBp.Body.Close()
	if respBp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for breakpoints, got %d", respBp.StatusCode)
	}

	// 3. POST /api/v1/debug/step without active session -> 500 error
	stepReq := debug.StepRequest{Action: "continue"}
	stepBytes, _ := json.Marshal(stepReq)
	respStep, err := http.Post(ts.URL+"/api/v1/debug/step", "application/json", bytes.NewReader(stepBytes))
	if err != nil {
		t.Fatalf("failed to post step: %v", err)
	}
	defer respStep.Body.Close()
	if respStep.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500 InternalServerError for step without session, got %d", respStep.StatusCode)
	}

	// 4. POST /api/v1/debug/terminate when idle -> 200 OK
	respTerm, err := http.Post(ts.URL+"/api/v1/debug/terminate", "application/json", nil)
	if err != nil {
		t.Fatalf("failed to post terminate: %v", err)
	}
	defer respTerm.Body.Close()
	if respTerm.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for terminate, got %d", respTerm.StatusCode)
	}

	// 5. GET /api/v1/events/debug SSE connection
	reqSSE, err := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/events/debug", nil)
	if err != nil {
		t.Fatalf("failed to create SSE request: %v", err)
	}
	respSSE, err := http.DefaultClient.Do(reqSSE)
	if err != nil {
		t.Fatalf("failed to connect to debug events SSE: %v", err)
	}
	defer respSSE.Body.Close()

	if respSSE.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for SSE, got %d", respSSE.StatusCode)
	}

	reader := bufio.NewReader(respSSE.Body)
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("failed to read initial SSE line: %v", err)
	}
	if !strings.Contains(line, "event: connected") {
		t.Fatalf("expected event: connected, got %s", line)
	}
}

func TestSystemShutdownEndpoint(t *testing.T) {
	srv, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	shutdownNotified := make(chan struct{}, 1)
	srv.SetShutdownChannel(shutdownNotified)

	ts := httptest.NewServer(handler)
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/api/v1/system/shutdown", "application/json", nil)
	if err != nil {
		t.Fatalf("failed to post system shutdown: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}

	var data map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		t.Fatalf("failed to decode json response: %v", err)
	}
	if data["status"] != "shutting_down" {
		t.Fatalf("expected status 'shutting_down', got %s", data["status"])
	}

	select {
	case <-shutdownNotified:
		// success: shutdown channel was triggered
	case <-time.After(500 * time.Millisecond):
		t.Fatalf("expected shutdownChannel to receive signal")
	}
}

func TestTerminalResizeNotFound(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	resizeBody, _ := json.Marshal(TerminalResizeRequest{Cols: 80, Rows: 24})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/terminal/non-existent-session/resize", bytes.NewReader(resizeBody))
	rr := executeRequest(handler, req)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for non-existent session, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestDebugStartNoGoFiles(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// An empty temp directory has no Go files
	startBody, _ := json.Marshal(debug.StartDebugRequest{
		Program: tempDir,
		Cwd:     tempDir,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/debug/start", bytes.NewReader(startBody))
	rr := executeRequest(handler, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for directory without Go files, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["code"] != "no_go_files" {
		t.Fatalf("expected code 'no_go_files', got %v", resp["code"])
	}
}

func TestDebugResolveGoProgram(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "resolve-go-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create cmd/app/main.go
	cmdAppDir := filepath.Join(tempDir, "cmd", "app")
	if err := os.MkdirAll(cmdAppDir, 0755); err != nil {
		t.Fatalf("failed to create cmd/app dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(cmdAppDir, "main.go"), []byte("package main\nfunc main(){}"), 0644); err != nil {
		t.Fatalf("failed to create main.go: %v", err)
	}

	// When given empty program or root tempDir, resolveGoProgram should discover cmdAppDir
	resolved := resolveGoProgram("", tempDir)
	if resolved != cmdAppDir {
		t.Fatalf("expected resolved path to be %s, got %s", cmdAppDir, resolved)
	}
}

func TestDebugStartPythonValidation(t *testing.T) {
	_, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)

	// Non-existent python file should return 400 with code file_not_found
	startBody, _ := json.Marshal(debug.StartDebugRequest{
		Program:  "nonexistent_script.py",
		Cwd:      tempDir,
		Language: "python",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/debug/start", bytes.NewReader(startBody))
	rr := executeRequest(handler, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request for nonexistent python script, got %d: %s", rr.Code, rr.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["code"] != "file_not_found" {
		t.Fatalf("expected code 'file_not_found', got %v", resp["code"])
	}
}

func TestLSPEndpoints(t *testing.T) {
	server, handler, tempDir := setupTestServer(t, "")
	defer os.RemoveAll(tempDir)
	defer func() { _ = server.ws.Close() }()

	ts := httptest.NewServer(handler)
	defer ts.Close()

	// 1. LSP Open
	openBody := `{"path":"main.go","content":"package main\nfunc main(){}","language":"go"}`
	resp, err := http.Post(ts.URL+"/api/v1/lsp/open", "application/json", strings.NewReader(openBody))
	if err != nil {
		t.Fatalf("failed to post lsp/open: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	// 2. LSP Completion
	compBody := `{"path":"main.go","line":1,"character":5,"language":"go"}`
	resp2, err := http.Post(ts.URL+"/api/v1/lsp/completion", "application/json", strings.NewReader(compBody))
	if err != nil {
		t.Fatalf("failed to post lsp/completion: %v", err)
	}
	defer resp2.Body.Close()
	if resp2.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp2.StatusCode)
	}
	var compRes LSPCompletionResponse
	if err := json.NewDecoder(resp2.Body).Decode(&compRes); err != nil {
		t.Fatalf("failed to decode completion response: %v", err)
	}

	// 3. LSP Hover
	hoverBody := `{"path":"main.go","line":1,"character":5,"language":"go"}`
	resp3, err := http.Post(ts.URL+"/api/v1/lsp/hover", "application/json", strings.NewReader(hoverBody))
	if err != nil {
		t.Fatalf("failed to post lsp/hover: %v", err)
	}
	defer resp3.Body.Close()
	if resp3.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp3.StatusCode)
	}

	// 4. LSP Definition
	defBody := `{"path":"main.go","line":1,"character":5,"language":"go"}`
	resp4, err := http.Post(ts.URL+"/api/v1/lsp/definition", "application/json", strings.NewReader(defBody))
	if err != nil {
		t.Fatalf("failed to post lsp/definition: %v", err)
	}
	defer resp4.Body.Close()
	if resp4.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp4.StatusCode)
	}
}








