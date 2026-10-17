package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/aditwicaksono/aegiscode/server/internal/vault"
)

type VaultSetupRequest struct {
	MasterPassword string `json:"masterPassword"`
}

type VaultUnlockRequest struct {
	MasterPassword string `json:"masterPassword"`
}

type VaultRecoverRequest struct {
	RecoveryKey       string `json:"recoveryKey"`
	NewMasterPassword string `json:"newMasterPassword,omitempty"`
}

func (s *Server) handleVaultStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.vault == nil {
		jsonError(w, http.StatusInternalServerError, "vault manager not initialized")
		return
	}

	status, err := s.vault.GetStatus()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to get vault status: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, status)
}

func (s *Server) handleVaultSetup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.vault == nil {
		jsonError(w, http.StatusInternalServerError, "vault manager not initialized")
		return
	}

	var req VaultSetupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	pass := strings.TrimSpace(req.MasterPassword)
	if len(pass) < 6 {
		jsonError(w, http.StatusBadRequest, "master password must be at least 6 characters")
		return
	}

	recoveryKey, err := s.vault.Setup(pass)
	if err != nil {
		if errors.Is(err, vault.ErrAlreadyInitialized) {
			jsonError(w, http.StatusConflict, "vault is already initialized")
			return
		}
		jsonError(w, http.StatusInternalServerError, "failed to setup vault: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"recoveryKey": recoveryKey,
		"message":     "Master vault initialized successfully. Store your Emergency Recovery Key in a safe place.",
	})
}

func (s *Server) handleVaultUnlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.vault == nil {
		jsonError(w, http.StatusInternalServerError, "vault manager not initialized")
		return
	}

	var req VaultUnlockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	token, err := s.vault.Unlock(req.MasterPassword)
	if err != nil {
		if errors.Is(err, vault.ErrQuarantineActive) {
			jsonError(w, http.StatusLocked, "critical deadlock active: system quarantined due to intrusion. Emergency Recovery Key required.")
			return
		}
		if errors.Is(err, vault.ErrSoftDeadlock) {
			jsonError(w, http.StatusLocked, err.Error())
			return
		}
		if errors.Is(err, vault.ErrPanicKill) {
			jsonError(w, http.StatusServiceUnavailable, "hard deadlock breach: panic shutdown initiated")
			return
		}
		if errors.Is(err, vault.ErrInvalidPassphrase) {
			jsonError(w, http.StatusUnauthorized, err.Error())
			return
		}
		jsonError(w, http.StatusInternalServerError, "unlock failed: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"sessionToken": token,
	})
}

func (s *Server) handleVaultLock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.vault == nil {
		jsonError(w, http.StatusInternalServerError, "vault manager not initialized")
		return
	}

	s.vault.Lock()
	jsonResponse(w, http.StatusOK, map[string]string{
		"status":  "locked",
		"message": "Vault locked. In-memory keys cleared.",
	})
}

func (s *Server) handleVaultRecover(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		jsonError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if s.vault == nil {
		jsonError(w, http.StatusInternalServerError, "vault manager not initialized")
		return
	}

	var req VaultRecoverRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}

	if strings.TrimSpace(req.RecoveryKey) == "" {
		jsonError(w, http.StatusBadRequest, "recoveryKey is required")
		return
	}

	err := s.vault.Recover(req.RecoveryKey, req.NewMasterPassword)
	if err != nil {
		if errors.Is(err, vault.ErrInvalidRecoveryKey) {
			jsonError(w, http.StatusUnauthorized, "invalid emergency recovery key")
			return
		}
		jsonError(w, http.StatusInternalServerError, "recovery failed: "+err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"message": "Quarantine deadlock successfully cleared. System restored.",
	})
}
