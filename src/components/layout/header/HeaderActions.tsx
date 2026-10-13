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
  } = useWorkbenchStore(
    useShallow((s) => ({
      panelOpen: s.panelOpen,
      togglePanel: s.togglePanel,
      sidebarOpen: s.sidebarOpen,
      toggleSidebar: s.toggleSidebar,
      chatOpen: s.chatOpen,
      toggleChat: s.toggleChat,
    })),
  )

  return (
    <div className="header-actions">
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
