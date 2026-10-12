import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"

interface EditorEmptyStateProps {
  groupId?: "group1" | "group2"
}

export function EditorEmptyState({
  groupId = "group1",
}: EditorEmptyStateProps) {
  const {
    createFile,
    setCommandPaletteOpen,
    toggleSidebar,
    toggleSettingsModal,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      createFile: s.createFile,
      setCommandPaletteOpen: s.setCommandPaletteOpen,
      toggleSidebar: s.toggleSidebar,
      toggleSettingsModal: s.toggleSettingsModal,
      showToast: s.showToast,
    })),
  )

  function handleNewFile() {
    createFile("Untitled-1.ts")
    showToast("Created Untitled-1.ts")
  }

  return (
    <div className="editor-empty-state" data-group-id={groupId}>
      {/* Background Watermark Logo */}
      <div aria-hidden="true" className="empty-watermark">
        <Icon name="aegis" size={160} />
      </div>

      <div className="empty-content">
        <div className="empty-brand">
          <div className="empty-brand-icon">
            <Icon name="aegis" size={32} />
          </div>
          <h2 className="empty-title">AegisCode</h2>
          <p className="empty-subtitle">Lightweight IDE · Local Server</p>
        </div>

        <div className="empty-shortcut-grid">
          <button
            className="empty-shortcut-card"
            onClick={handleNewFile}
            type="button"
          >
            <div className="shortcut-card-left">
              <Icon name="code" size={14} />
              <span>New File</span>
            </div>
            <kbd className="shortcut-kbd">⌘N</kbd>
          </button>

          <button
            className="empty-shortcut-card"
            onClick={() => setCommandPaletteOpen(true)}
            type="button"
          >
            <div className="shortcut-card-left">
              <Icon name="search" size={14} />
              <span>Command Palette</span>
            </div>
            <kbd className="shortcut-kbd">⌘K</kbd>
          </button>

          <button
            className="empty-shortcut-card"
            onClick={toggleSidebar}
            type="button"
          >
            <div className="shortcut-card-left">
              <Icon name="layout" size={14} />
              <span>Toggle Sidebar</span>
            </div>
            <kbd className="shortcut-kbd">⌘B</kbd>
          </button>

          <button
            className="empty-shortcut-card"
            onClick={toggleSettingsModal}
            type="button"
          >
            <div className="shortcut-card-left">
              <Icon name="settings" size={14} />
              <span>Open Settings</span>
            </div>
            <kbd className="shortcut-kbd">⌘,</kbd>
          </button>
        </div>

        <p className="empty-footer-hint">
          Open a file from the Explorer or drag files into this window to start
          coding.
        </p>
      </div>
    </div>
  )
}
