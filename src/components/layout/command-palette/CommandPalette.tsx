import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import type { ActivityType } from "../../../types/workbench"

interface CommandItem {
  activity: ActivityType
  detail: string
  label: string
}

const commands: CommandItem[] = [
  {
    activity: "Explorer",
    detail: "Navigate repository files",
    label: "View: Show Explorer",
  },
  {
    activity: "Search",
    detail: "Search and replace across files",
    label: "Search: Find in Files",
  },
  {
    activity: "Source Control",
    detail: "Review pending changes",
    label: "Git: Open Source Control",
  },
  {
    activity: "Settings",
    detail: "Configure the workbench",
    label: "Preferences: Open Settings",
  },
]

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setActiveActivity,
    setSidebarOpen,
  } = useWorkbench()
  const [query, setQuery] = useState("")

  if (!commandPaletteOpen) return null

  const results = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase()),
  )

  function handleSelect(activity: ActivityType) {
    setActiveActivity(activity)
    setSidebarOpen(true)
    setCommandPaletteOpen(false)
  }

  function handleClose() {
    setCommandPaletteOpen(false)
  }

  return (
    <div
      aria-modal="true"
      className="palette-backdrop"
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
            const iconName =
              cmd.activity === "Explorer"
                ? "explorer"
                : cmd.activity === "Search"
                  ? "search"
                  : cmd.activity === "Source Control"
                    ? "git"
                    : "settings"

            return (
              <button
                className={index === 0 ? "command-active" : ""}
                key={cmd.label}
                onClick={() => handleSelect(cmd.activity)}
                type="button"
              >
                <Icon name={iconName} size={15} />
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
