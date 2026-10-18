package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
)

func (s *Server) handleGitStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	status, err := s.git.GetStatus(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, status)
}

func (s *Server) handleGitInit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.Init(r.Context()); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitUnlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	res, err := s.git.Unlock(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, UnlockResponse{
		Unlocked: res.Unlocked,
		Removed:  res.Removed,
		Message:  res.Message,
	})
}

func (s *Server) handleGitBranches(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	branches, err := s.git.GetBranches(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, BranchesResponse{Branches: branches})
}

func (s *Server) handleGitBranchCheckout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CheckoutBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.CheckoutBranch(r.Context(), req.Branch); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitBranchCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CreateBranchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.CreateBranch(r.Context(), req.Name, req.Checkout); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	limit := 50
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	commits, err := s.git.GetLog(r.Context(), limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, LogResponse{Commits: commits})
}

func (s *Server) handleGitTimeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	filePath := r.URL.Query().Get("file")
	if filePath == "" {
		filePath = r.URL.Query().Get("path")
	}
	limit := 30
	if lStr := r.URL.Query().Get("limit"); lStr != "" {
		if l, err := strconv.Atoi(lStr); err == nil && l > 0 {
			limit = l
		}
	}

	if filePath != "" {
		if _, err := s.ws.ResolvePath(filePath); err != nil {
			jsonError(w, http.StatusBadRequest, "invalid file path: "+err.Error())
			return
		}
	}

	commits, err := s.git.GetTimeline(r.Context(), filePath, limit)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, TimelineResponse{Commits: commits})
}

func (s *Server) handleGitStage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req StageFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if len(req.Files) == 0 && len(req.Paths) > 0 {
		req.Files = req.Paths
	}

	if !req.All && len(req.Files) > 0 {
		for _, f := range req.Files {
			clean := strings.TrimSpace(f)
			if clean == "" || clean == "." {
				continue
			}
			if _, err := s.ws.ResolvePath(clean); err != nil {
				jsonError(w, http.StatusBadRequest, "invalid file path: "+f)
				return
			}
		}
	}

	if err := s.git.Stage(r.Context(), req.Files, req.All); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitUnstage(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req UnstageFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if len(req.Files) == 0 && len(req.Paths) > 0 {
		req.Files = req.Paths
	}

	if !req.All && len(req.Files) > 0 {
		for _, f := range req.Files {
			clean := strings.TrimSpace(f)
			if clean == "" || clean == "." {
				continue
			}
			if _, err := s.ws.ResolvePath(clean); err != nil {
				jsonError(w, http.StatusBadRequest, "invalid file path: "+f)
				return
			}
		}
	}

	if err := s.git.Unstage(r.Context(), req.Files, req.All); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitDiscard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req DiscardFilesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if len(req.Files) == 0 && len(req.Paths) > 0 {
		req.Files = req.Paths
	}

	if !req.All && len(req.Files) > 0 {
		for _, f := range req.Files {
			clean := strings.TrimSpace(f)
			if clean == "" || clean == "." {
				continue
			}
			if _, err := s.ws.ResolvePath(clean); err != nil {
				jsonError(w, http.StatusBadRequest, "invalid file path: "+f)
				return
			}
		}
	}

	if err := s.git.Discard(r.Context(), req.Files, req.All); err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitCommit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CommitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	node, err := s.git.Commit(r.Context(), req.Message, req.AutoStage)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, CommitResponse{
		Status: "ok",
		Commit: node,
	})
}

func (s *Server) handleGitPush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req PushRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	if err := s.git.Push(r.Context(), req.SetUpstream); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitPull(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.Pull(r.Context()); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.Sync(r.Context()); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitTags(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	tags, err := s.git.GetTags(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, TagsResponse{Tags: tags})
}

func (s *Server) handleGitTagCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CreateTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	var err error
	if req.Target != "" {
		err = s.git.CreateTag(r.Context(), req.Name, req.Message, req.Target)
	} else {
		err = s.git.CreateTag(r.Context(), req.Name, req.Message)
	}
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitTagPush(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if err := s.git.PushTags(r.Context()); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitDiff(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	file := r.URL.Query().Get("file")
	if file == "" {
		file = r.URL.Query().Get("path")
	}
	staged := r.URL.Query().Get("staged") == "true"
	commit := r.URL.Query().Get("commit")
	base := r.URL.Query().Get("base")

	res, err := s.git.GetDiff(r.Context(), file, staged, commit, base)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, res)
}

func (s *Server) handleGitCompare(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	base := r.URL.Query().Get("base")
	target := r.URL.Query().Get("target")

	res, err := s.git.CompareCommits(r.Context(), base, target)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, res)
}

func (s *Server) handleGitAddRemote(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req AddRemoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.AddRemote(r.Context(), req.Name, req.URL); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitStashes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	stashes, err := s.git.GetStashes(r.Context())
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, StashesResponse{Stashes: stashes})
}

func (s *Server) handleGitStashSave(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req StashSaveRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if err := s.git.StashSave(r.Context(), req.Message, req.Untracked); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitStashPop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req StashActionRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if err := s.git.StashPop(r.Context(), req.Ref); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitStashApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req StashActionRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if err := s.git.StashApply(r.Context(), req.Ref); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitStashDrop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req StashActionRequest
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	if err := s.git.StashDrop(r.Context(), req.Ref); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitCherryPick(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CherryPickRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if err := s.git.CherryPick(r.Context(), req.Hash); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, GitOperationResponse{Status: "ok"})
}

func (s *Server) handleGitClone(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	var req CloneRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	clonedPath, err := s.git.Clone(r.Context(), req.URL, req.TargetPath)
	if err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	name := filepath.Base(clonedPath)
	if req.OpenWorkspace && s.ws != nil {
		if absPath, setErr := s.ws.SetRoot(clonedPath); setErr == nil {
			_, name = s.ws.GetRoot()
			s.BroadcastLog("Server", fmt.Sprintf("Mounted cloned workspace root: %s (%s)", absPath, name), "info")
			if s.store != nil {
				_ = s.store.AddRecentProject(absPath)
			}
			if s.lsp != nil {
				s.lsp.SetWorkspace(absPath)
			}
		}
	}

	jsonResponse(w, http.StatusOK, CloneResponse{
		Status:   "ok",
		RootPath: clonedPath,
		Name:     name,
	})
}


