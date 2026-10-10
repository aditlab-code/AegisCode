import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { useWorkbench } from "../../../context/WorkbenchContext";
import type { ActivityType } from "../../../types/workbench";

const activities: [name: "explorer" | "search" | "git", label: ActivityType][] = [
  ["explorer", "Explorer"],
  ["search", "Search"],
  ["git", "Source Control"],
];

export function ActivityRail() {
  const { activeActivity, setActiveActivity, sidebarOpen, setSidebarOpen } = useWorkbench();

  function handleSelect(label: ActivityType) {
    if (activeActivity === label && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setActiveActivity(label);
      if (!sidebarOpen) setSidebarOpen(true);
    }
  }

  return (
    <aside className="activity-rail">
      <div className="activity-list">
        {activities.map(([icon, label]) => (
          <IconButton
            active={sidebarOpen && activeActivity === label}
            key={label}
            label={label}
            onClick={() => handleSelect(label)}
          >
            <Icon name={icon} size={21} />
          </IconButton>
        ))}
      </div>
      <IconButton
        active={sidebarOpen && activeActivity === "Settings"}
        label="Settings"
        onClick={() => handleSelect("Settings")}
      >
        <Icon name="settings" size={21} />
      </IconButton>
    </aside>
  );
}
