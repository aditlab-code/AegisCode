import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { useWorkbench } from "../../../context/WorkbenchContext";

export function HeaderActions() {
  const {
    panelOpen,
    togglePanel,
    sidebarOpen,
    toggleSidebar,
    chatOpen,
    toggleChat,
  } = useWorkbench();

  return (
    <div className="header-actions">
      <IconButton
        active={panelOpen}
        label="Toggle bottom panel (Ctrl+J)"
        onClick={togglePanel}
      >
        <Icon name="panel" />
      </IconButton>
      <IconButton
        active={sidebarOpen}
        label="Toggle primary sidebar (Ctrl+B)"
        onClick={toggleSidebar}
      >
        <Icon name="layout" />
      </IconButton>
      <IconButton
        active={chatOpen}
        label="Toggle AEGIS chat"
        onClick={toggleChat}
      >
        <Icon name="aegis" />
      </IconButton>
    </div>
  );
}
