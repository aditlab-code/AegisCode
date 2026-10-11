import { useState, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { buildSettingsSchema, type SettingItem } from "./settingsRegistry"

export function SettingsModal() {
  const {
    settingsModalOpen,
    setSettingsModalOpen,
    settings,
    updateEditorSettings,
    updateWorkbenchSettings,
    updateFilesSettings,
    updateFeaturesSettings,
    updateCompanionSettings,
    updateAgentSettings,
    resetSettings,
    setThemePalette,
    setThemeMode,
    showToast,
  } = useWorkbench()

  const [activeCategory, setActiveCategory] = useState<string>("Editor")
  const [searchQuery, setSearchQuery] = useState("")
  const [isRegex, setIsRegex] = useState(false)

  const settingsList: SettingItem[] = useMemo(
    () =>
      buildSettingsSchema({
        settings,
        updateEditorSettings,
        updateWorkbenchSettings,
        updateFilesSettings,
        updateFeaturesSettings,
        updateCompanionSettings,
        updateAgentSettings,
        setThemePalette,
        setThemeMode,
        showToast,
      }),
    [
      settings,
      updateEditorSettings,
      updateWorkbenchSettings,
      updateFilesSettings,
      updateFeaturesSettings,
      updateCompanionSettings,
      updateAgentSettings,
      setThemePalette,
      setThemeMode,
      showToast,
    ],
  )

  // Filter settings by query or category
  const filteredSettings = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) {
      return settingsList.filter((s) => s.category === activeCategory)
    }

    let regex: RegExp
    try {
      const pattern = isRegex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      regex = new RegExp(pattern, "i")
    } catch {
      return []
    }

    return settingsList.filter(
      (s) =>
        regex.test(s.title) || regex.test(s.description) || regex.test(s.id),
    )
  }, [settingsList, searchQuery, isRegex, activeCategory])

  if (!settingsModalOpen) return null

  const categories = [
    { id: "Editor", label: "Text Editor", badge: "" },
    { id: "Files", label: "Files", badge: "" },
    { id: "Workbench", label: "Workbench", badge: "" },
    { id: "Window", label: "Window", badge: "Future" },
    { id: "Features", label: "Features", badge: "" },
    { id: "Companion", label: "Companion (Tablet)", badge: "Future" },
    { id: "AI", label: "AI Agents", badge: "Future" },
  ]

  return (
    <div
      aria-modal="true"
      className="settings-modal-backdrop"
      onMouseDown={() => setSettingsModalOpen(false)}
      role="dialog"
    >
      <div
        aria-label="Settings Modal"
        className="settings-modal-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Modal Header */}
        <div className="settings-modal-header">
          <div className="settings-title-group">
            <span className="settings-dialog-title">Settings</span>
            <span className="settings-dialog-subtitle">
              User Preferences (Cmd+,)
            </span>
          </div>

          {/* Search bar with Regex toggle */}
          <div className="settings-search-wrapper">
            <Icon name="search" size={13} />
            <input
              autoFocus
              className="settings-search-input"
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settings (supports regex)..."
              value={searchQuery}
            />
            {searchQuery && (
              <button
                className="settings-clear-btn"
                onClick={() => setSearchQuery("")}
                title="Clear query"
                type="button"
              >
                <Icon name="close" size={11} />
              </button>
            )}
            <button
              className={`settings-regex-btn ${isRegex ? "regex-active" : ""}`}
              onClick={() => setIsRegex((v) => !v)}
              title="Use Regular Expression"
              type="button"
            >
              .*
            </button>
          </div>

          <button
            className="settings-reset-btn"
            onClick={() => {
              resetSettings()
              showToast("All settings reset to defaults")
            }}
            title="Reset all preferences to factory defaults"
            type="button"
          >
            <Icon name="refresh" size={12} />
            <span>Reset</span>
          </button>

          <button
            aria-label="Close settings"
            className="settings-close-btn"
            onClick={() => setSettingsModalOpen(false)}
            type="button"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {/* Modal Body: Two-Column Minimalist VS Code Layout */}
        <div className="settings-modal-body">
          {/* Left Category Nav */}
          <nav className="settings-nav-column">
            {categories.map((cat) => (
              <button
                className={`settings-nav-item ${
                  activeCategory === cat.id && !searchQuery.trim()
                    ? "nav-item-active"
                    : ""
                }`}
                key={cat.id}
                onClick={() => {
                  setActiveCategory(cat.id)
                  setSearchQuery("")
                }}
                type="button"
              >
                <span>{cat.label}</span>
                {cat.badge && (
                  <span className="settings-nav-badge">{cat.badge}</span>
                )}
              </button>
            ))}
          </nav>

          {/* Right Settings Content List */}
          <div className="settings-content-column">
            {filteredSettings.length > 0 ? (
              filteredSettings.map((setting) => (
                <div className="settings-item-card" key={setting.id}>
                  <div className="settings-item-header">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="settings-item-title">
                        {setting.title}
                      </span>
                      {setting.isFutureNotice && (
                        <span className="settings-future-badge">
                          Future Notice
                        </span>
                      )}
                    </div>
                    <span className="settings-item-id">{setting.id}</span>
                  </div>
                  <p className="settings-item-desc">{setting.description}</p>

                  <div className="settings-control-row">
                    {setting.type === "boolean" && (
                      <label className="settings-toggle-label">
                        <input
                          checked={Boolean(setting.value)}
                          className="settings-checkbox"
                          onChange={(e) =>
                            setting.onChange &&
                            setting.onChange(e.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>{setting.value ? "Enabled" : "Disabled"}</span>
                      </label>
                    )}

                    {setting.type === "select" && (
                      <select
                        aria-label={setting.title}
                        className="settings-select"
                        onChange={(e) =>
                          setting.onChange && setting.onChange(e.target.value)
                        }
                        value={String(setting.value ?? "")}
                      >
                        {setting.options?.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    )}

                    {setting.type === "text" && (
                      <input
                        aria-label={setting.title}
                        className="settings-text-input"
                        onChange={(e) =>
                          setting.onChange && setting.onChange(e.target.value)
                        }
                        value={String(setting.value ?? "")}
                      />
                    )}

                    {setting.type === "number" && (
                      <input
                        aria-label={setting.title}
                        className="settings-text-input"
                        onChange={(e) =>
                          setting.onChange && setting.onChange(e.target.value)
                        }
                        type="number"
                        value={Number(setting.value ?? 0)}
                      />
                    )}

                    {setting.type === "info" && (
                      <div className="text-[11px] text-ink-muted italic">
                        {setting.futureNoticeText ||
                          "Coming in upcoming releases."}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="settings-empty-state">
                <Icon name="search" size={24} />
                <span>No settings found matching "{searchQuery}"</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
