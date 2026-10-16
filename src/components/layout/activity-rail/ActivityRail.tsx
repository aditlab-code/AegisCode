import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"
import type { ActivityType } from "../../../types/workbench"

const activities: [name: "explorer" | "search" | "git" | "debug", label: ActivityType][] =
  [
    ["explorer", "Explorer"],
    ["search", "Search"],
    ["git", "Source Control"],
    ["debug", "Debug"],
  ]

export function ActivityRail() {
  const {
    activeActivity,
    setActiveActivity,
    sidebarOpen,
    setSidebarOpen,
    settingsModalOpen,
    toggleSettingsModal,
    openSettingsTab,
    theme,
    toggleTheme,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      activeActivity: s.activeActivity,
      setActiveActivity: s.setActiveActivity,
      sidebarOpen: s.sidebarOpen,
      setSidebarOpen: s.setSidebarOpen,
      settingsModalOpen: s.settingsModalOpen,
      toggleSettingsModal: s.toggleSettingsModal,
      openSettingsTab: s.openSettingsTab,
      theme: s.theme,
      toggleTheme: s.toggleTheme,
      showToast: s.showToast,
    })),
  )

  function handleSelect(label: ActivityType) {
    if (activeActivity === label && sidebarOpen) {
      setSidebarOpen(false)
    } else {
      setActiveActivity(label)
      if (!sidebarOpen) setSidebarOpen(true)
    }
  }

  function handleThemeToggle() {
    toggleTheme()
    showToast(
      theme === "dark" ? "Switched to Light Theme" : "Switched to Dark Theme",
    )
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
      <div className="activity-bottom">
        <IconButton
          className="theme-toggle-btn"
          label={
            theme === "dark" ? "Switch to Light Theme" : "Switch to Dark Theme"
          }
          onClick={handleThemeToggle}
        >
          <Icon
            className="theme-toggle-icon"
            name={theme === "dark" ? "sun" : "moon"}
            size={21}
          />
        </IconButton>
        <IconButton
          active={settingsModalOpen}
          label="Settings (Cmd+,)"
          onClick={() => openSettingsTab()}
        >
          <Icon name="settings" size={21} />
        </IconButton>
      </div>
    </aside>
  )
}
