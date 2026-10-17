package vault

import (
	"os"
	"strings"
	"testing"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

func setupTestStore(t *testing.T) (*store.Store, func()) {
	t.Helper()
	tempDir, err := os.MkdirTemp("", "vault-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	st, err := store.New(tempDir)
	if err != nil {
		_ = os.RemoveAll(tempDir)
		t.Fatalf("failed to create store: %v", err)
	}

	cleanup := func() {
		_ = st.Close()
		_ = os.RemoveAll(tempDir)
	}

	return st, cleanup
}

func TestVaultSetupAndStatus(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	v := New(st)

	// 1. Initial Status: Uninitialized
	status, err := v.GetStatus()
	if err != nil {
		t.Fatalf("failed to get status: %v", err)
	}
	if status.IsInitialized {
		t.Errorf("expected isInitialized to be false")
	}
	if !status.IsLocked {
		t.Errorf("expected isLocked to be true for uninitialized vault")
	}

	// 2. Setup
	recoveryKey, err := v.Setup("masterSecret123")
	if err != nil {
		t.Fatalf("failed to setup vault: %v", err)
	}
	if !strings.HasPrefix(recoveryKey, "AEGIS-RECV-") {
		t.Errorf("unexpected recovery key format: %s", recoveryKey)
	}

	// 3. Status after setup: Initialized and Unlocked in RAM
	status, err = v.GetStatus()
	if err != nil {
		t.Fatalf("failed to get status after setup: %v", err)
	}
	if !status.IsInitialized {
		t.Errorf("expected isInitialized to be true")
	}
	if status.IsLocked {
		t.Errorf("expected isLocked to be false immediately after setup")
	}
}

func TestVaultLockUnlockAndSecrets(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	v := New(st)
	_, err := v.Setup("myPassphrase456")
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	// 1. Encrypt secret while unlocked
	err = v.EncryptSecret("GEMINI_KEY", "AIzaSyTestApiKey")
	if err != nil {
		t.Fatalf("failed to encrypt secret: %v", err)
	}

	val, err := v.DecryptSecret("GEMINI_KEY")
	if err != nil || val != "AIzaSyTestApiKey" {
		t.Fatalf("expected AIzaSyTestApiKey, got %s (err: %v)", val, err)
	}

	// 2. Lock Vault
	v.Lock()
	status, _ := v.GetStatus()
	if !status.IsLocked {
		t.Fatalf("expected vault to be locked")
	}

	// 3. Attempt to decrypt while locked -> Must fail
	_, err = v.DecryptSecret("GEMINI_KEY")
	if err != ErrVaultLocked {
		t.Fatalf("expected ErrVaultLocked, got %v", err)
	}

	// 4. Unlock with correct passphrase
	token, err := v.Unlock("myPassphrase456")
	if err != nil {
		t.Fatalf("unlock failed: %v", err)
	}
	if !v.ValidateSessionToken(token) {
		t.Fatalf("expected session token to be valid")
	}

	// 5. Decrypt after unlock -> Must succeed
	val, err = v.DecryptSecret("GEMINI_KEY")
	if err != nil || val != "AIzaSyTestApiKey" {
		t.Fatalf("expected secret decryption to succeed after unlock, got %s (err: %v)", val, err)
	}
}

func TestVaultFailedAttemptsAndPanicKill(t *testing.T) {
	st, cleanup := setupTestStore(t)
	defer cleanup()

	v := New(st)
	recoveryKey, err := v.Setup("secretMasterPass")
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	panicKillTriggered := false
	v.SetPanicKillHook(func() {
		panicKillTriggered = true
	})

	v.Lock()

	// 1. Attempts 1 to 4: Warning with remaining counter
	for i := 1; i <= 4; i++ {
		_, err := v.Unlock("wrongPassword")
		if err == nil || !strings.Contains(err.Error(), "remaining") {
			t.Fatalf("expected warning with remaining attempts on try %d, got: %v", i, err)
		}
	}

	if v.Policy().Name() == "enterprise" {
		// 2. 5th Attempt in Enterprise: Triggers Soft Deadlock (5-minute freeze)
		_, err = v.Unlock("wrongPassword")
		if err == nil || !strings.Contains(err.Error(), "locked for 5 minutes") {
			t.Fatalf("expected soft deadlock on 5th attempt in enterprise, got: %v", err)
		}

		// Attempts 6 to 9
		for i := 6; i <= 9; i++ {
			rec, _ := st.GetVaultRecord()
			rec.LockoutUntil = 0
			_ = st.SaveVaultRecord(rec)
			_, _ = v.Unlock("wrongPassword")
		}

		// 10th Attempt: Triggers Hard Deadlock Panic Kill (Option C)
		rec, _ := st.GetVaultRecord()
		rec.LockoutUntil = 0
		_ = st.SaveVaultRecord(rec)

		_, err = v.Unlock("wrongPassword")
		if err != ErrPanicKill {
			t.Fatalf("expected ErrPanicKill on 10th attempt, got: %v", err)
		}
		if !panicKillTriggered {
			t.Fatalf("expected panicKillHook to be called on 10th attempt in enterprise")
		}

		// Post-Panic Kill Status: Must be in Quarantine Deadlock
		status, _ := v.GetStatus()
		if !status.IsQuarantined {
			t.Fatalf("expected vault to be in Quarantine Deadlock")
		}

		// Normal unlock must be rejected even with right password while quarantined
		_, err = v.Unlock("secretMasterPass")
		if err != ErrQuarantineActive {
			t.Fatalf("expected ErrQuarantineActive, got: %v", err)
		}
	} else {
		// 2. 5th Attempt in Community: Triggers soft 30s pause, zero panic kill
		_, err = v.Unlock("wrongPassword")
		if err == nil || !strings.Contains(err.Error(), "paused for 30 seconds") {
			t.Fatalf("expected 30s soft pause on 5th attempt in community, got: %v", err)
		}

		// 10th Attempt in Community: Still soft pause, NEVER panic kill
		rec, _ := st.GetVaultRecord()
		rec.LockoutUntil = 0
		_ = st.SaveVaultRecord(rec)

		for i := 6; i <= 10; i++ {
			rec, _ := st.GetVaultRecord()
			rec.LockoutUntil = 0
			_ = st.SaveVaultRecord(rec)
			_, _ = v.Unlock("wrongPassword")
		}

		if panicKillTriggered {
			t.Fatalf("panicKillHook must NEVER be triggered in community edition")
		}
		status, _ := v.GetStatus()
		if status.IsQuarantined {
			t.Fatalf("quarantine must never be active in community edition")
		}
	}

	// 6. Recovery: Invalid recovery key rejected
	err = v.Recover("AEGIS-RECV-WRONG-KEY", "")
	if err != ErrInvalidRecoveryKey {
		t.Fatalf("expected ErrInvalidRecoveryKey, got: %v", err)
	}

	// 7. Recovery: Valid recovery key with new passphrase resets quarantine/counters
	err = v.Recover(recoveryKey, "brandNewPass999")
	if err != nil {
		t.Fatalf("expected recovery to succeed, got: %v", err)
	}

	status, _ := v.GetStatus()
	if status.IsQuarantined {
		t.Fatalf("expected quarantine to be cleared after recovery")
	}

	// 8. Normal unlock with new passphrase succeeds
	_, err = v.Unlock("brandNewPass999")
	if err != nil {
		t.Fatalf("expected unlock with new passphrase to succeed, got: %v", err)
	}
}
