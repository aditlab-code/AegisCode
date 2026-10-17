import type { SliceCreator, VaultSlice } from "../types"
import {
  getVaultStatus,
  setupVault as apiSetupVault,
  unlockVault as apiUnlockVault,
  lockVault as apiLockVault,
  recoverVault as apiRecoverVault,
  type VaultStatusResponse,
} from "../../utils/vaultApi"

export const createVaultSlice: SliceCreator<VaultSlice> = (set, get) => ({
  vaultStatus: null,
  isVaultModalOpen: false,

  setVaultStatus: (status: VaultStatusResponse | null) => {
    set({ vaultStatus: status })
  },

  openVaultModal: () => {
    set({ isVaultModalOpen: true })
  },

  closeVaultModal: () => {
    const { vaultStatus } = get()
    // Do not allow closing if vault is initialized and locked or quarantined
    if (
      vaultStatus?.is_initialized &&
      (vaultStatus?.is_locked || vaultStatus?.is_quarantined)
    ) {
      return
    }
    set({ isVaultModalOpen: false })
  },

  fetchVaultStatus: async () => {
    try {
      const status = await getVaultStatus()
      set({ vaultStatus: status })
      if (
        status.is_initialized &&
        (status.is_locked || status.is_quarantined)
      ) {
        set({ isVaultModalOpen: true })
      }
      return status
    } catch {
      return null
    }
  },

  lockVault: async () => {
    try {
      const res = await apiLockVault()
      if (res.success) {
        await get().fetchVaultStatus()
        set({ isVaultModalOpen: true })
        return true
      }
      return false
    } catch {
      return false
    }
  },

  unlockVault: async (passphrase: string) => {
    try {
      const res = await apiUnlockVault(passphrase)
      if (res.success) {
        await get().fetchVaultStatus()
        set({ isVaultModalOpen: false })
        return { success: true }
      }
      if (res.status) {
        set({ vaultStatus: res.status })
      }
      return {
        success: false,
        error: res.error || "Master passphrase incorrect",
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unlock failed"
      return { success: false, error: msg }
    }
  },

  setupVault: async (passphrase: string) => {
    try {
      const res = await apiSetupVault(passphrase)
      if (res.success) {
        await get().fetchVaultStatus()
        return { success: true, recovery_key: res.recovery_key }
      }
      return { success: false, error: res.error || "Setup failed" }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Setup failed"
      return { success: false, error: msg }
    }
  },

  recoverVault: async (recoveryKey: string, newPassphrase: string) => {
    try {
      const res = await apiRecoverVault(recoveryKey, newPassphrase)
      if (res.success) {
        await get().fetchVaultStatus()
        return { success: true, new_recovery_key: res.new_recovery_key }
      }
      return { success: false, error: res.error || "Recovery failed" }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Recovery failed"
      return { success: false, error: msg }
    }
  },
})
