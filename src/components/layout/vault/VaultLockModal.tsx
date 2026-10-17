import { useState, useEffect, type FormEvent } from "react"
import { useWorkbenchStore, useShallow } from "../../../store"
import { Icon } from "../../ui/Icon"
import "./vault.css"

export function VaultLockModal() {
  const {
    vaultStatus,
    isVaultModalOpen,
    fetchVaultStatus,
    closeVaultModal,
    unlockVault,
    setupVault,
    recoverVault,
    lockVault,
  } = useWorkbenchStore(
    useShallow((s) => ({
      vaultStatus: s.vaultStatus,
      isVaultModalOpen: s.isVaultModalOpen,
      fetchVaultStatus: s.fetchVaultStatus,
      closeVaultModal: s.closeVaultModal,
      unlockVault: s.unlockVault,
      setupVault: s.setupVault,
      recoverVault: s.recoverVault,
      lockVault: s.lockVault,
    })),
  )

  const [passphrase, setPassphrase] = useState("")
  const [confirmPassphrase, setConfirmPassphrase] = useState("")
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("")
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState(false)
  const [isRecoverMode, setIsRecoverMode] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Fetch status on mount or when modal opens
  useEffect(() => {
    if (isVaultModalOpen || !vaultStatus) {
      fetchVaultStatus()
    }
  }, [isVaultModalOpen, fetchVaultStatus])

  // Handle countdown timer for soft deadlock
  useEffect(() => {
    if (vaultStatus?.is_deadlocked && vaultStatus.deadlock_seconds_left > 0) {
      setSecondsLeft(vaultStatus.deadlock_seconds_left)
    }
  }, [vaultStatus?.is_deadlocked, vaultStatus?.deadlock_seconds_left])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          fetchVaultStatus()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [secondsLeft, fetchVaultStatus])

  if (
    !isVaultModalOpen &&
    (!vaultStatus?.is_initialized ||
      (!vaultStatus?.is_locked && !vaultStatus?.is_quarantined))
  ) {
    return null
  }

  const isQuarantined = Boolean(vaultStatus?.is_quarantined)
  const isDeadlocked = Boolean(vaultStatus?.is_deadlocked || secondsLeft > 0)
  const isInitialized = Boolean(vaultStatus?.is_initialized)
  const isLocked = Boolean(vaultStatus?.is_locked)

  // Whether user can dismiss modal
  const canClose = isInitialized && !isLocked && !isQuarantined

  const handleCopyRecoveryKey = async () => {
    if (!generatedKey) return
    try {
      await navigator.clipboard.writeText(generatedKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2500)
    } catch {
      // ignore clipboard error
    }
  }

  const handleSetup = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    if (passphrase.length < 6) {
      setErrorMessage("Passphrase must be at least 6 characters.")
      return
    }
    if (passphrase !== confirmPassphrase) {
      setErrorMessage("Passphrase confirmation does not match.")
      return
    }

    setLoading(true)
    const res = await setupVault(passphrase)
    setLoading(false)
    if (res.success && res.recovery_key) {
      setGeneratedKey(res.recovery_key)
    } else {
      setErrorMessage(res.error || "Failed to initialize vault.")
    }
  }

  const handleUnlock = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    if (!passphrase) {
      setErrorMessage("Please enter the master passphrase.")
      return
    }

    setLoading(true)
    const res = await unlockVault(passphrase)
    setLoading(false)
    if (res.success) {
      setPassphrase("")
      closeVaultModal()
    } else {
      setErrorMessage(res.error || "Incorrect master passphrase.")
    }
  }

  const handleRecover = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    if (!recoveryKeyInput.trim()) {
      setErrorMessage("Please enter the Emergency Recovery Key.")
      return
    }
    if (passphrase.length < 6) {
      setErrorMessage("New passphrase must be at least 6 characters.")
      return
    }

    setLoading(true)
    const res = await recoverVault(recoveryKeyInput.trim(), passphrase)
    setLoading(false)
    if (res.success && res.new_recovery_key) {
      setGeneratedKey(res.new_recovery_key)
      setIsRecoverMode(false)
      setRecoveryKeyInput("")
      setPassphrase("")
    } else {
      setErrorMessage(
        res.error || "Failed to recover access using recovery key.",
      )
    }
  }

  const handleLockNow = async () => {
    setLoading(true)
    await lockVault()
    setLoading(false)
  }

  return (
    <div
      aria-modal="true"
      className="vault-modal-backdrop"
      onMouseDown={() => {
        if (canClose) closeVaultModal()
      }}
      role="dialog"
    >
      <div
        aria-label="Master Vault Dialog"
        className="vault-modal-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Header */}
        <div className="vault-header">
          <div
            className={`vault-header-icon ${
              isQuarantined ? "quarantined" : isDeadlocked ? "deadlocked" : ""
            }`}
          >
            <Icon
              name={isQuarantined ? "warning" : isLocked ? "lock" : "unlock"}
              size={20}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div className="vault-title">
                {isQuarantined
                  ? "System Quarantined (Panic Deadlock)"
                  : !isInitialized
                    ? "Initialize Master Vault"
                    : isRecoverMode
                      ? "Emergency Vault Recovery"
                      : isLocked
                        ? "AegisCode Locked"
                        : "Master Security Vault"}
              </div>
              {vaultStatus?.edition && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background:
                      vaultStatus.edition === "enterprise"
                        ? "color-mix(in srgb, var(--color-accent) 20%, transparent)"
                        : "color-mix(in srgb, var(--color-ink) 12%, transparent)",
                    color:
                      vaultStatus.edition === "enterprise"
                        ? "var(--color-accent)"
                        : "var(--color-ink-faint)",
                  }}
                >
                  {vaultStatus.edition}
                </span>
              )}
            </div>
            <div className="vault-subtitle">
              {isQuarantined
                ? "IDE access frozen for security after consecutive failed attempts"
                : !isInitialized
                  ? "Setup 2-Door Cryptography & Zero-Knowledge Vault"
                  : isLocked
                    ? "Door 1: Enter master passphrase to unlock IDE"
                    : "Dual-crypt encryption system active & protected"}
            </div>
          </div>
          {canClose && (
            <button
              aria-label="Close"
              className="vault-btn-secondary"
              onClick={closeVaultModal}
              style={{
                padding: "4px 8px",
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
              type="button"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="vault-body">
          {/* Error Message */}
          {errorMessage && (
            <div className="vault-alert danger">{errorMessage}</div>
          )}

          {/* Newly Generated Recovery Key Display (Post-Setup or Post-Recovery) */}
          {generatedKey ? (
            <div className="vault-field">
              <div className="vault-alert warning">
                <strong>Save Your Emergency Recovery Key!</strong>
                <br />
                This key is the only instrument to recover access if the system
                is quarantined due to repeated failed attempts or a forgotten
                passphrase. AegisCode never stores this key in plaintext.
              </div>
              <div className="vault-recovery-display">{generatedKey}</div>
              <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <button
                  className="vault-btn vault-btn-secondary"
                  onClick={handleCopyRecoveryKey}
                  style={{ flex: 1 }}
                  type="button"
                >
                  {copiedKey ? "Copied to Clipboard!" : "Copy Recovery Key"}
                </button>
                <button
                  className="vault-btn vault-btn-primary"
                  onClick={() => {
                    setGeneratedKey(null)
                    closeVaultModal()
                  }}
                  style={{ flex: 1 }}
                  type="button"
                >
                  I Have Saved My Key
                </button>
              </div>
            </div>
          ) : isQuarantined || isRecoverMode ? (
            /* Emergency Recovery View */
            <form
              onSubmit={handleRecover}
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div className="vault-alert danger">
                {isQuarantined
                  ? "The system detected 10 unauthorized attempts. Fail-Secure Panic Kill mode is active. Enter your 24-character Emergency Recovery Key to release quarantine."
                  : "Enter the 24-character Emergency Recovery Key saved during initial setup."}
              </div>

              <div className="vault-field">
                <label className="vault-label">Emergency Recovery Key</label>
                <input
                  autoFocus
                  className="vault-input"
                  onChange={(e) => setRecoveryKeyInput(e.target.value)}
                  placeholder="AEGIS-RECV-XXXX-XXXX-XXXX-XXXX"
                  required
                  type="text"
                  value={recoveryKeyInput}
                />
              </div>

              <div className="vault-field">
                <label className="vault-label">New Master Passphrase</label>
                <input
                  className="vault-input"
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  type="password"
                  value={passphrase}
                />
              </div>

              <div
                className="vault-footer"
                style={{ padding: "8px 0 0", borderTop: "none" }}
              >
                {!isQuarantined && (
                  <button
                    className="vault-btn vault-btn-secondary"
                    onClick={() => {
                      setIsRecoverMode(false)
                      setErrorMessage(null)
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                )}
                <button
                  className="vault-btn vault-btn-primary"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? "Recovering..." : "Recover Vault Access"}
                </button>
              </div>
            </form>
          ) : !isInitialized ? (
            /* First-Time Setup Wizard */
            <form
              onSubmit={handleSetup}
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div className="vault-alert warning">
                Protect your workspace and AI secret keys with a Master
                Passphrase (Door 1). The server only stores a salted SHA-256
                hash.
              </div>

              <div className="vault-field">
                <label className="vault-label">Create Master Passphrase</label>
                <input
                  autoFocus
                  className="vault-input"
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  type="password"
                  value={passphrase}
                />
              </div>

              <div className="vault-field">
                <label className="vault-label">Confirm Passphrase</label>
                <input
                  className="vault-input"
                  onChange={(e) => setConfirmPassphrase(e.target.value)}
                  placeholder="Repeat passphrase"
                  required
                  type="password"
                  value={confirmPassphrase}
                />
              </div>

              <div
                className="vault-footer"
                style={{ padding: "8px 0 0", borderTop: "none" }}
              >
                <button
                  className="vault-btn vault-btn-primary"
                  disabled={loading}
                  type="submit"
                >
                  {loading ? "Initializing..." : "Enable Master Vault"}
                </button>
              </div>
            </form>
          ) : isLocked ? (
            /* Normal Unlock View */
            <form
              onSubmit={handleUnlock}
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              {isDeadlocked && (
                <div className="vault-alert warning">
                  <strong>Soft Deadlock Active!</strong>
                  <br />5 consecutive failed attempts detected. System locked
                  for <strong>{secondsLeft} seconds</strong>.
                </div>
              )}

              {vaultStatus &&
                vaultStatus.failed_attempts > 0 &&
                !isDeadlocked && (
                  <div className="vault-alert warning">
                    Security warning: {vaultStatus.failed_attempts} failed
                    attempt(s). Remaining attempt(s) before{" "}
                    {vaultStatus.edition === "enterprise"
                      ? "panic quarantine shutdown"
                      : "temporary lockout"}
                    : <strong>{vaultStatus.remaining_attempts}</strong>.
                  </div>
                )}

              <div className="vault-field">
                <label className="vault-label">Master Passphrase</label>
                <input
                  autoFocus
                  className="vault-input"
                  disabled={isDeadlocked || loading}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter master passphrase..."
                  required
                  type="password"
                  value={passphrase}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <button
                  className="vault-btn-secondary"
                  onClick={() => {
                    setIsRecoverMode(true)
                    setErrorMessage(null)
                  }}
                  style={{
                    border: "none",
                    fontSize: "12px",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                  type="button"
                >
                  Forgot passphrase? Use Recovery Key
                </button>
              </div>

              <div
                className="vault-footer"
                style={{ padding: "8px 0 0", borderTop: "none" }}
              >
                <button
                  className="vault-btn vault-btn-primary"
                  disabled={isDeadlocked || loading}
                  type="submit"
                >
                  {loading ? "Unlocking..." : "Unlock IDE"}
                </button>
              </div>
            </form>
          ) : (
            /* Unlocked Management View */
            <div
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <div
                className="vault-alert"
                style={{
                  background:
                    "color-mix(in srgb, var(--color-accent) 10%, transparent)",
                  border:
                    "1px solid color-mix(in srgb, var(--color-accent) 30%, transparent)",
                  color: "var(--color-ink)",
                }}
              >
                Master Vault is active and unlocked. The AES-256-GCM encryption
                key resides in memory to securely decrypt API secret keys.
              </div>
              <div
                className="vault-footer"
                style={{ padding: "8px 0 0", borderTop: "none" }}
              >
                <button
                  className="vault-btn vault-btn-secondary"
                  onClick={closeVaultModal}
                  type="button"
                >
                  Close
                </button>
                <button
                  className="vault-btn vault-btn-primary"
                  disabled={loading}
                  onClick={handleLockNow}
                  type="button"
                >
                  {loading ? "Locking..." : "Lock IDE Now"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
