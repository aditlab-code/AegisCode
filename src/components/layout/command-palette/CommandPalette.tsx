import { useState, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import type { IconName } from "../../../types/workbench"

interface CommandPaletteItem {
  id: string
  label: string
  detail: string
  icon: IconName
  action: () => void
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveActivity,
    setSidebarOpen,
    setSettingsModalOpen,
    theme,
    toggleTheme,
    showToast,
    openFolderPicker,
    openRootFolder,
    closeRootFolder,
    rootWorkspacePath,
    recentProjects,
  } = useWorkbench()

  const [query, setQuery] = useState("")

  const allCommands = useMemo<CommandPaletteItem[]>(() => {
    const list: CommandPaletteItem[] = [
      {
        id: "open-folder",
        label: "File: Open Folder...",
        detail: "Open project folder in native file manager",
        icon: "folder",
        action: () => {
          openFolderPicker()
        },
      },
      ...(rootWorkspacePath
        ? [
            {
              id: "close-folder",
              label: "File: Close Folder",
              detail: "Close the currently open workspace",
              icon: "close" as IconName,
              action: () => {
                closeRootFolder()
              },
            },
          ]
        : []),
      {
        id: "view-explorer",
        label: "View: Show Explorer",
        detail: "Navigate repository files",
        icon: "explorer",
        action: () => {
          setActiveActivity("Explorer")
          setSidebarOpen(true)
        },
      },
      {
        id: "search-files",
        label: "Search: Find in Files",
        detail: "Search and replace across files",
        icon: "search",
        action: () => {
          setActiveActivity("Search")
          setSidebarOpen(true)
        },
      },
      {
        id: "git-scm",
        label: "Git: Open Source Control",
        detail: "Review pending changes",
        icon: "git",
        action: () => {
          setActiveActivity("Source Control")
          setSidebarOpen(true)
        },
      },
      {
        id: "pref-settings",
        label: "Preferences: Open Settings",
        detail: "Configure the workbench",
        icon: "settings",
        action: () => setSettingsModalOpen(true),
      },
      {
        id: "toggle-theme",
        label: "Preferences: Toggle Color Theme",
        detail: "Switch between Dark and Light mode",
        icon: theme === "dark" ? "sun" : "moon",
        action: () => {
          toggleTheme()
          showToast(
            theme === "dark"
              ? "Switched to Light Theme"
              : "Switched to Dark Theme",
          )
        },
      },
    ]

    recentProjects.forEach((p) => {
      const base = p.split("/").filter(Boolean).pop() || p
      list.push({
        id: `recent-${p}`,
        label: `File: Open Recent: ${base}`,
        detail: p,
        icon: "folder",
        action: () => {
          openRootFolder(p)
        },
      })
    })

    return list
  }, [
    openFolderPicker,
    closeRootFolder,
    openRootFolder,
    rootWorkspacePath,
    recentProjects,
    setActiveActivity,
    setSettingsModalOpen,
    setSidebarOpen,
    showToast,
    theme,
    toggleTheme,
  ])

  if (!commandPaletteOpen) return null

  const results = allCommands.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.detail.toLowerCase().includes(query.toLowerCase()),
  )

  function handleSelect(cmd: CommandPaletteItem) {
    cmd.action()
    setCommandPaletteOpen(false)
  }

  function handleClose() {
    setCommandPaletteOpen(false)
  }

  return (
    <div
      aria-modal="true"
      className="command-palette-backdrop"
      onClick={handleClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          handleClose()
        }
      }}
      onMouseDown={handleClose}
      role="dialog"
    >
      <div
        aria-label="Command palette"
        className="command-palette"
        onMouseDown={(e) => e.stopPropagation()}
        role="document"
      >
        <label className="palette-input">
          <Icon name="chevron" size={15} />
          <input
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type a command or search..."
            value={query}
          />
          <kbd>Esc</kbd>
        </label>
        <div className="command-results">
          <span className="command-section">COMMANDS</span>
          {results.map((cmd, index) => {
            return (
              <button
                className={index === 0 ? "command-active" : ""}
                key={cmd.id}
                onClick={() => handleSelect(cmd)}
                type="button"
              >
                <Icon name={cmd.icon} size={15} />
                <span>
                  <strong>{cmd.label}</strong>
                  <small>{cmd.detail}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
