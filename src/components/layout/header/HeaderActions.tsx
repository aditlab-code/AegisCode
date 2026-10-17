import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"

export function HeaderActions() {
  const {
    panelOpen,
    togglePanel,
    sidebarOpen,
    toggleSidebar,
    chatOpen,
    toggleChat,
    openVaultModal,
    vaultStatus,
  } = useWorkbenchStore(
    useShallow((s) => ({
      panelOpen: s.panelOpen,
      togglePanel: s.togglePanel,
      sidebarOpen: s.sidebarOpen,
      toggleSidebar: s.toggleSidebar,
      chatOpen: s.chatOpen,
      toggleChat: s.toggleChat,
      openVaultModal: s.openVaultModal,
      vaultStatus: s.vaultStatus,
    })),
  )

  return (
    <div className="header-actions">
      <IconButton
        label="Master Vault (Lock / Security Status)"
        onClick={openVaultModal}
      >
        <Icon name={vaultStatus?.is_locked ? "lock" : "unlock"} />
      </IconButton>
      <IconButton
        active={sidebarOpen}
        label="Toggle primary sidebar (Ctrl+B)"
        onClick={toggleSidebar}
      >
        <Icon name="sidebar-left" />
      </IconButton>
      <IconButton
        active={panelOpen}
        label="Toggle bottom panel (Ctrl+J)"
        onClick={togglePanel}
      >
        <Icon name="panel" />
      </IconButton>
      <IconButton
        active={chatOpen}
        label="Toggle AEGIS chat drawer"
        onClick={toggleChat}
      >
        <Icon name="sidebar-right" />
      </IconButton>
    </div>
  )
}
