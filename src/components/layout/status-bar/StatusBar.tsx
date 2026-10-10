import { useState } from "react";
import { Icon } from "../../ui/Icon";
import { useWorkbench } from "../../../context/WorkbenchContext";
import { BranchPopover } from "./BranchPopover";
import { ProblemsPopover } from "./ProblemsPopover";
import { NotificationsPopover } from "./NotificationsPopover";

export function StatusBar() {
  const {
    activeBranch,
    diagnostics,
    notifications,
    activeLanguage,
  } = useWorkbench();

  const [activePanel, setActivePanel] = useState<"branch" | "notifications" | "problems" | null>(null);

  const unreadCount = notifications.filter((item) => !item.read).length;
  const errorCount = diagnostics.filter((d) => d.type === "error").length;
  const warningCount = diagnostics.filter((d) => d.type === "warning").length;

  function togglePanel(panel: "branch" | "notifications" | "problems") {
    setActivePanel((current) => (current === panel ? null : panel));
  }

  return (
    <footer className="status-bar">
      <div className="status-group">
        <button
          className={activePanel === "branch" ? "status-button-active" : ""}
          onClick={() => togglePanel("branch")}
          type="button"
        >
          <Icon name="branch" size={13} /> {activeBranch}*
        </button>
        <button
          className={activePanel === "problems" ? "status-button-active" : ""}
          onClick={() => togglePanel("problems")}
          type="button"
        >
          <Icon name="error" size={13} /> {errorCount}
          <Icon name="warning" size={13} /> {warningCount}
        </button>
      </div>

      <div className="status-group">
        <span className="status-item">Ln 9, Col 24</span>
        <span className="status-item">Spaces: 2</span>
        <span className="status-item">UTF-8</span>
        <span className="status-item">{activeLanguage}</span>
        <span className="status-item">
          <span className="status-dot" /> Local
        </span>
        <button
          aria-label={`${unreadCount} unread notifications`}
          className={
            activePanel === "notifications"
              ? "status-button-active notification-button"
              : "notification-button"
          }
          onClick={() => togglePanel("notifications")}
          type="button"
        >
          <Icon name="bell" size={13} />
          {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
        </button>
      </div>

      {activePanel === "branch" && (
        <BranchPopover onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "problems" && <ProblemsPopover />}
      {activePanel === "notifications" && <NotificationsPopover />}
    </footer>
  );
}
