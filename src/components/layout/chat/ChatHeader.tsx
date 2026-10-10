import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { useWorkbench } from "../../../context/WorkbenchContext";

export function ChatHeader() {
  const { setChatOpen, activeTab } = useWorkbench();

  return (
    <>
      <div className="chat-header">
        <div className="chat-heading">
          <span className="agent-mark">
            <Icon name="aegis" size={17} />
          </span>
          <div>
            <strong>AEGIS</strong>
            <span>Workspace agent</span>
          </div>
        </div>
        <IconButton
          label="Close AEGIS chat"
          onClick={() => setChatOpen(false)}
        >
          <Icon name="close" />
        </IconButton>
      </div>

      <div className="chat-context">
        <span className="status-dot" />
        <span>{activeTab}</span>
        <span className="text-muted">in context</span>
      </div>
    </>
  );
}
