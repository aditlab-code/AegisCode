import { API_BASE, getSessionToken } from "./apiBase"

export interface VaultStatusResponse {
  is_initialized: boolean
  is_locked: boolean
  is_quarantined: boolean
  failed_attempts: number
  remaining_attempts: number
  is_deadlocked: boolean
  deadlock_seconds_left: number
  edition?: "community" | "enterprise"
}

export interface VaultSetupResult {
  success: boolean
  recovery_key?: string
  error?: string
}

export interface VaultUnlockResult {
  success: boolean
  status?: VaultStatusResponse
  error?: string
}

export interface VaultLockResult {
  success: boolean
  error?: string
}

export interface VaultRecoverResult {
  success: boolean
  new_recovery_key?: string
  error?: string
}

function getVaultHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  }
  const tok = getSessionToken()
  if (tok) h["X-Session-Token"] = tok
  return h
}

/**
 * Fetches the current Master Vault security status.
 */
export async function getVaultStatus(): Promise<VaultStatusResponse> {
  const resp = await fetch(`${API_BASE}/api/v1/vault/status`, {
    method: "GET",
    headers: getVaultHeaders(),
  })
  if (!resp.ok) {
    throw new Error(`Failed to fetch vault status: ${resp.statusText}`)
  }
  return resp.json()
}

/**
 * Initializes the Master Vault with a new master passphrase.
 * Returns the 24-character Emergency Recovery Key.
 */
export async function setupVault(
  passphrase: string,
): Promise<VaultSetupResult> {
  const resp = await fetch(`${API_BASE}/api/v1/vault/setup`, {
    method: "POST",
    headers: getVaultHeaders(),
    body: JSON.stringify({ passphrase }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return {
      success: false,
      error: data.error || `Setup failed with HTTP ${resp.status}`,
    }
  }
  return {
    success: true,
    recovery_key: data.recovery_key,
  }
}

/**
 * Unlocks the Master Vault with the user's master passphrase.
 */
export async function unlockVault(
  passphrase: string,
): Promise<VaultUnlockResult> {
  const resp = await fetch(`${API_BASE}/api/v1/vault/unlock`, {
    method: "POST",
    headers: getVaultHeaders(),
    body: JSON.stringify({ passphrase }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return {
      success: false,
      status: data.status,
      error: data.error || `Unlock failed with HTTP ${resp.status}`,
    }
  }
  return {
    success: true,
  }
}

/**
 * Locks the Master Vault, wiping ephemeral vault keys and zeroing RAM.
 */
export async function lockVault(): Promise<VaultLockResult> {
  const resp = await fetch(`${API_BASE}/api/v1/vault/lock`, {
    method: "POST",
    headers: getVaultHeaders(),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return {
      success: false,
      error: data.error || `Lock failed with HTTP ${resp.status}`,
    }
  }
  return {
    success: true,
  }
}

/**
 * Recovers access when the system is quarantined or passphrase lost, using the Emergency Recovery Key.
 */
export async function recoverVault(
  recoveryKey: string,
  newPassphrase: string,
): Promise<VaultRecoverResult> {
  const resp = await fetch(`${API_BASE}/api/v1/vault/recover`, {
    method: "POST",
    headers: getVaultHeaders(),
    body: JSON.stringify({
      recovery_key: recoveryKey,
      new_passphrase: newPassphrase,
    }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return {
      success: false,
      error: data.error || `Recovery failed with HTTP ${resp.status}`,
    }
  }
  return {
    success: true,
    new_recovery_key: data.new_recovery_key,
  }
}
