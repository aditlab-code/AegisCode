import { useWorkbenchStore, useShallow } from "../../../store"
import { SettingsView } from "./SettingsView"

export function SettingsModal() {
  const { settingsModalOpen, setSettingsModalOpen } = useWorkbenchStore(
    useShallow((s) => ({
      settingsModalOpen: s.settingsModalOpen,
      setSettingsModalOpen: s.setSettingsModalOpen,
    })),
  )

  if (!settingsModalOpen) return null

  return (
    <div
      aria-modal="true"
      className="settings-modal-backdrop"
      onMouseDown={() => setSettingsModalOpen(false)}
      role="dialog"
    >
      <div
        aria-label="Settings Modal"
        className="settings-modal-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="document"
      >
        <SettingsView isModal onClose={() => setSettingsModalOpen(false)} />
      </div>
    </div>
  )
}
