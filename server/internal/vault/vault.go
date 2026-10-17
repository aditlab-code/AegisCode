package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/aditwicaksono/aegiscode/server/internal/store"
)

var (
	ErrAlreadyInitialized = errors.New("vault is already initialized")
	ErrNotInitialized     = errors.New("vault is not initialized")
	ErrInvalidPassphrase  = errors.New("invalid master passphrase")
	ErrInvalidRecoveryKey = errors.New("invalid emergency recovery key")
	ErrVaultLocked        = errors.New("vault is locked: unlock with master passphrase first")
	ErrSoftDeadlock       = errors.New("system temporarily locked: too many failed attempts")
	ErrQuarantineActive   = errors.New("system in critical quarantine deadlock: emergency recovery key required")
	ErrPanicKill          = errors.New("hard deadlock reached: emergency panic shutdown triggered")
)

// VaultStatus provides runtime status information about the master vault.
type VaultStatus struct {
	IsInitialized           bool   `json:"isInitialized"`
	IsLocked                bool   `json:"isLocked"`
	IsQuarantined           bool   `json:"isQuarantined"`
	FailedAttempts          int    `json:"failedAttempts"`
	LockoutRemainingSeconds int64  `json:"lockoutRemainingSeconds"`
	Edition                 string `json:"edition"`
}

// Vault coordinates the two-door security system (master passphrase + AES-256-GCM vault)
// and handles intrusion detection with fail-secure circuit breaker shutdown.
type Vault struct {
	mu            sync.RWMutex
	st            *store.Store
	policy        Policy
	vaultKey      []byte
	sessionToken  string
	panicKillHook func()
}

// New creates a new Vault manager bound to the backing SQLite store.
func New(st *store.Store) *Vault {
	return &Vault{
		st:     st,
		policy: defaultPolicy,
	}
}

// SetPolicy assigns a custom deadlock/hardening policy.
func (v *Vault) SetPolicy(p Policy) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.policy = p
}

func (v *Vault) policyLocked() Policy {
	if v.policy != nil {
		return v.policy
	}
	return defaultPolicy
}

// Policy returns the active deadlock policy.
func (v *Vault) Policy() Policy {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.policyLocked()
}

// SetPanicKillHook assigns a custom hook invoked during a 10th consecutive failed attempt panic kill.
func (v *Vault) SetPanicKillHook(hook func()) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.panicKillHook = hook
}

// GenerateSalt creates 32 cryptographically random bytes encoded as a hex string.
func GenerateSalt() (string, error) {
	b := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", fmt.Errorf("failed to generate random salt: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// HashSecret computes a salted SHA-256 digest of secret with salt.
func HashSecret(secret, salt string) string {
	sum := sha256.Sum256([]byte(salt + ":" + secret))
	return hex.EncodeToString(sum[:])
}

// DeriveKey derives a 32-byte AES key from passphrase and salt using 64,000 rounds of SHA-256.
func DeriveKey(passphrase, salt string) []byte {
	buf := []byte(salt + ":" + passphrase)
	for i := 0; i < 64000; i++ {
		sum := sha256.Sum256(buf)
		buf = sum[:]
	}
	key := make([]byte, 32)
	copy(key, buf)
	return key
}

// GenerateRecoveryKey creates a 16-character base32/alphanumeric emergency recovery token
// formatted as AEGIS-RECV-XXXX-XXXX-XXXX-XXXX.
func GenerateRecoveryKey() (string, error) {
	const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	b := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return "", fmt.Errorf("failed to generate random recovery bytes: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("AEGIS-RECV")
	for i, v := range b {
		if i%4 == 0 {
			sb.WriteByte('-')
		}
		sb.WriteByte(charset[int(v)%len(charset)])
	}
	return sb.String(), nil
}

// GetStatus returns the current runtime security state of the vault.
func (v *Vault) GetStatus() (VaultStatus, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	rec, err := v.st.GetVaultRecord()
	if err != nil {
		return VaultStatus{}, err
	}

	now := time.Now().UnixMilli()
	var lockoutRemaining int64
	if rec.LockoutUntil > now {
		lockoutRemaining = (rec.LockoutUntil - now + 999) / 1000
	}

	isQuarantined := v.policyLocked().IsQuarantined(rec.DeadlockQuarantine)
	isLocked := v.vaultKey == nil || !rec.IsInitialized || isQuarantined || lockoutRemaining > 0

	return VaultStatus{
		IsInitialized:           rec.IsInitialized,
		IsLocked:                isLocked,
		IsQuarantined:           isQuarantined,
		FailedAttempts:          rec.FailedAttempts,
		LockoutRemainingSeconds: lockoutRemaining,
		Edition:                 v.policyLocked().Name(),
	}, nil
}

// Setup initializes the vault with the user's master passphrase and outputs an Emergency Recovery Key.
// Unlocks the vault immediately in-memory for the initial session.
func (v *Vault) Setup(masterPass string) (string, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if strings.TrimSpace(masterPass) == "" {
		return "", errors.New("master passphrase cannot be empty")
	}

	rec, err := v.st.GetVaultRecord()
	if err != nil {
		return "", err
	}
	if rec.IsInitialized {
		return "", ErrAlreadyInitialized
	}

	masterSalt, err := GenerateSalt()
	if err != nil {
		return "", err
	}
	masterHash := HashSecret(masterPass, masterSalt)

	recoveryKey, err := GenerateRecoveryKey()
	if err != nil {
		return "", err
	}
	recoverySalt, err := GenerateSalt()
	if err != nil {
		return "", err
	}
	recoveryHash := HashSecret(recoveryKey, recoverySalt)

	rec.IsInitialized = true
	rec.MasterSalt = masterSalt
	rec.MasterHash = masterHash
	rec.RecoverySalt = recoverySalt
	rec.RecoveryHash = recoveryHash
	rec.DeadlockQuarantine = false
	rec.FailedAttempts = 0
	rec.LockoutUntil = 0
	if rec.EncryptedSecrets == nil {
		rec.EncryptedSecrets = make(map[string]string)
	}

	if err := v.st.SaveVaultRecord(rec); err != nil {
		return "", err
	}

	// Unlock in RAM immediately
	v.vaultKey = DeriveKey(masterPass, masterSalt)
	tokenBytes := make([]byte, 32)
	_, _ = io.ReadFull(rand.Reader, tokenBytes)
	v.sessionToken = hex.EncodeToString(tokenBytes)

	return recoveryKey, nil
}

// Unlock verifies the master passphrase, deriving the in-memory VaultKey if valid,
// or escalates to soft deadlock / panic kill on repeated failures.
func (v *Vault) Unlock(masterPass string) (string, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	rec, err := v.st.GetVaultRecord()
	if err != nil {
		return "", err
	}
	if !rec.IsInitialized {
		return "", ErrNotInitialized
	}

	now := time.Now().UnixMilli()

	// 1. Check if Quarantine Deadlock is active (requires Emergency Recovery Key)
	if v.policyLocked().IsQuarantined(rec.DeadlockQuarantine) {
		return "", ErrQuarantineActive
	}

	// 2. Check if Soft Deadlock is active
	if rec.LockoutUntil > now {
		remaining := (rec.LockoutUntil - now + 999) / 1000
		return "", fmt.Errorf("%w: retry in %d seconds", ErrSoftDeadlock, remaining)
	}

	// 3. Verify Master Passphrase via ConstantTimeCompare
	inputHash := HashSecret(masterPass, rec.MasterSalt)
	if subtle.ConstantTimeCompare([]byte(inputHash), []byte(rec.MasterHash)) == 1 {
		// Valid Passphrase! Reset failure counters
		_ = v.st.ResetVaultAttempts()

		// Derive and store VaultKey in RAM
		v.vaultKey = DeriveKey(masterPass, rec.MasterSalt)

		// Issue new session token
		tokenBytes := make([]byte, 32)
		_, _ = io.ReadFull(rand.Reader, tokenBytes)
		v.sessionToken = hex.EncodeToString(tokenBytes)

		return v.sessionToken, nil
	}

	// 4. Invalid Passphrase: Increment failure counter and delegate to Policy
	rec.FailedAttempts++
	lockoutUntil, quarantine, panicKill, policyErr := v.policyLocked().HandleFailedAttempt(rec.FailedAttempts, time.UnixMilli(now))

	if quarantine {
		rec.DeadlockQuarantine = true
	}
	_ = v.st.RecordVaultFailedAttempt(rec.FailedAttempts, lockoutUntil, quarantine)

	if panicKill {
		v.zeroRAMLocked()
		if v.panicKillHook != nil {
			v.panicKillHook()
		}
		return "", ErrPanicKill
	}

	return "", policyErr
}

// Lock wipes the in-memory VaultKey and invalidates the session token.
func (v *Vault) Lock() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.zeroRAMLocked()
}

// Recover validates the emergency recovery key, resets the quarantine state and failure counters,
// and optionally resets the master passphrase if newMasterPass is provided.
func (v *Vault) Recover(recoveryKey, newMasterPass string) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	rec, err := v.st.GetVaultRecord()
	if err != nil {
		return err
	}
	if !rec.IsInitialized {
		return ErrNotInitialized
	}

	cleanKey := strings.TrimSpace(recoveryKey)
	inputHash := HashSecret(cleanKey, rec.RecoverySalt)

	if subtle.ConstantTimeCompare([]byte(inputHash), []byte(rec.RecoveryHash)) != 1 {
		return ErrInvalidRecoveryKey
	}

	// Recovery key valid! Reset quarantine and failed attempts
	rec.DeadlockQuarantine = false
	rec.FailedAttempts = 0
	rec.LockoutUntil = 0

	// If new master passphrase is provided, update credentials
	if strings.TrimSpace(newMasterPass) != "" {
		newSalt, err := GenerateSalt()
		if err != nil {
			return err
		}
		rec.MasterSalt = newSalt
		rec.MasterHash = HashSecret(newMasterPass, newSalt)
		v.vaultKey = DeriveKey(newMasterPass, newSalt)

		tokenBytes := make([]byte, 32)
		_, _ = io.ReadFull(rand.Reader, tokenBytes)
		v.sessionToken = hex.EncodeToString(tokenBytes)
	} else {
		v.zeroRAMLocked()
	}

	return v.st.SaveVaultRecord(rec)
}

// EncryptSecret encrypts plaintext using the in-memory VaultKey with AES-256-GCM.
func (v *Vault) EncryptSecret(secretKey, plaintext string) error {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.vaultKey == nil {
		return ErrVaultLocked
	}

	block, err := aes.NewCipher(v.vaultKey)
	if err != nil {
		return fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("failed to create gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	cipherHex := hex.EncodeToString(ciphertext)

	rec, err := v.st.GetVaultRecord()
	if err != nil {
		return err
	}
	if rec.EncryptedSecrets == nil {
		rec.EncryptedSecrets = make(map[string]string)
	}
	rec.EncryptedSecrets[secretKey] = cipherHex

	return v.st.SaveVaultRecord(rec)
}

// DecryptSecret decrypts a stored secret using the in-memory VaultKey with AES-256-GCM.
func (v *Vault) DecryptSecret(secretKey string) (string, error) {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if v.vaultKey == nil {
		return "", ErrVaultLocked
	}

	rec, err := v.st.GetVaultRecord()
	if err != nil {
		return "", err
	}
	cipherHex, exists := rec.EncryptedSecrets[secretKey]
	if !exists || cipherHex == "" {
		return "", nil
	}

	ciphertext, err := hex.DecodeString(cipherHex)
	if err != nil {
		return "", fmt.Errorf("invalid ciphertext hex: %w", err)
	}

	block, err := aes.NewCipher(v.vaultKey)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create gcm: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, payload := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintextBytes, err := gcm.Open(nil, nonce, payload, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}

	return string(plaintextBytes), nil
}

// ValidateSessionToken checks if the provided token matches the active in-memory session.
func (v *Vault) ValidateSessionToken(token string) bool {
	v.mu.RLock()
	defer v.mu.RUnlock()

	if v.sessionToken == "" || token == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(token), []byte(v.sessionToken)) == 1
}

// zeroRAMLocked cleans the volatile encryption key and session token from memory.
func (v *Vault) zeroRAMLocked() {
	if v.vaultKey != nil {
		for i := range v.vaultKey {
			v.vaultKey[i] = 0
		}
		v.vaultKey = nil
	}
	v.sessionToken = ""
}
