import { Icon } from "../../ui/Icon";
import { useWorkbench } from "../../../context/WorkbenchContext";

export function ChatMessageList() {
  const { chatMessages } = useWorkbench();

  return (
    <div className="messages">
      <div className="agent-intro">
        <Icon name="aegis" size={22} />
        <p>Build with your codebase, not around it.</p>
      </div>
      {chatMessages.map((item) => (
        <div
          className={`message message-${item.role}`}
          key={item.id}
        >
          {item.text}
        </div>
      ))}
    </div>
  );
}
