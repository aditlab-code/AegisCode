import { useState, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

interface SettingItem {
  id: string
  category: "Common" | "Editor" | "Workbench" | "Linter" | "Git" | "AI"
  title: string
  description: string
  type: "boolean" | "select" | "text"
  value: boolean | string | number
  options?: string[]
  onChange: (val: any) => void
}

export function SettingsModal() {
  const {
    settingsModalOpen,
    setSettingsModalOpen,
    linterSettings,
    setLinterSettings,
    minimapEnabled,
    setMinimapEnabled,
    activeBranch,
    showToast,
    theme,
    setTheme,
  } = useWorkbench()

  const [activeCategory, setActiveCategory] = useState<string>("Common")
  const [searchQuery, setSearchQuery] = useState("")
  const [isRegex, setIsRegex] = useState(false)

  // Local settings states
  const [autoSave, setAutoSave] = useState(true)
  const [tabSize, setTabSize] = useState("2")
  const [wordWrap, setWordWrap] = useState("on")
  const [fontFamily, setFontFamily] = useState(
    "SFMono-Regular, Menlo, monospace",
  )
  const [confirmDelete, setConfirmDelete] = useState(true)
  const [gitAutoFetch, setGitAutoFetch] = useState(true)
  const [agentAutoContext, setAgentAutoContext] = useState(true)

  const settingsList: SettingItem[] = useMemo(
    () => [
      // Common
      {
        id: "editor.autoSave",
        category: "Common",
        title: "Editor: Auto Save",
        description:
          "Controls auto save of dirty editors after a delay or on window blur.",
        type: "boolean",
        value: autoSave,
        onChange: (v) => {
          setAutoSave(v)
          showToast(`Auto Save ${v ? "enabled" : "disabled"}`)
        },
      },
      {
        id: "editor.minimap",
        category: "Common",
        title: "Editor: Minimap",
        description: "Controls whether the minimap code preview is shown.",
        type: "boolean",
        value: minimapEnabled,
        onChange: (v) => {
          setMinimapEnabled(v)
          showToast(`Minimap ${v ? "enabled" : "disabled"}`)
        },
      },
      {
        id: "linter.enabled",
        category: "Common",
        title: "Linter: Syntax & Diagnostics",
        description:
          "Controls active syntax error analysis and linter warning diagnostics.",
        type: "boolean",
        value: linterSettings.enabled,
        onChange: (v) => {
          setLinterSettings((prev) => ({ ...prev, enabled: v }))
          showToast(`Linter ${v ? "enabled" : "disabled"}`)
        },
      },

      // Text Editor
      {
        id: "editor.tabSize",
        category: "Editor",
        title: "Editor: Tab Size",
        description: "The number of spaces a tab is equal to.",
        type: "select",
        value: tabSize,
        options: ["2", "4", "8"],
        onChange: (v) => {
          setTabSize(v)
          showToast(`Tab size set to ${v}`)
        },
      },
      {
        id: "editor.wordWrap",
        category: "Editor",
        title: "Editor: Word Wrap",
        description:
          "Controls how lines should wrap in the code editor viewport.",
        type: "select",
        value: wordWrap,
        options: ["off", "on", "wordWrapColumn"],
        onChange: (v) => {
          setWordWrap(v)
          showToast(`Word wrap set to ${v}`)
        },
      },
      {
        id: "editor.fontFamily",
        category: "Editor",
        title: "Editor: Font Family",
        description:
          "Controls the font family used across all editor code panes.",
        type: "text",
        value: fontFamily,
        onChange: (v) => {
          setFontFamily(v)
        },
      },

      // Workbench
      {
        id: "workbench.colorTheme",
        category: "Workbench",
        title: "Workbench: Color Theme",
        description:
          "Specifies the active color theme (Dark or Light) for the entire workspace.",
        type: "select",
        value: theme,
        options: ["dark", "light"],
        onChange: (v) => {
          setTheme(v as "dark" | "light")
          showToast(`Color theme set to ${v}`)
        },
      },
      {
        id: "workbench.confirmDelete",
        category: "Workbench",
        title: "Workbench: Confirm Delete",
        description:
          "Prompt for confirmation when deleting files from explorer.",
        type: "boolean",
        value: confirmDelete,
        onChange: (v) => {
          setConfirmDelete(v)
        },
      },

      // Linter
      {
        id: "linter.trigger",
        category: "Linter",
        title: "Linter: Lint Trigger Mode",
        description:
          "Controls whether syntax checks execute in real-time as you type or only on file save.",
        type: "select",
        value: linterSettings.trigger,
        options: ["onType", "onSave"],
        onChange: (v) => {
          setLinterSettings((prev) => ({
            ...prev,
            trigger: v as "onType" | "onSave",
          }))
          showToast(`Linter trigger set to ${v}`)
        },
      },
      {
        id: "linter.showWarnings",
        category: "Linter",
        title: "Linter: Show Warnings",
        description:
          "Display warning-level diagnostics alongside syntax break errors.",
        type: "boolean",
        value: linterSettings.showWarnings,
        onChange: (v) => {
          setLinterSettings((prev) => ({ ...prev, showWarnings: v }))
          showToast(`Linter warnings ${v ? "shown" : "hidden"}`)
        },
      },

      // Git
      {
        id: "git.autoFetch",
        category: "Git",
        title: "Git: Auto Fetch",
        description: `When set to true, automatically commits telemetry and fetches origin/${activeBranch}.`,
        type: "boolean",
        value: gitAutoFetch,
        onChange: (v) => {
          setGitAutoFetch(v)
        },
      },

      // AI & Agents
      {
        id: "agent.autoContext",
        category: "AI",
        title: "AI: Auto Context Ingestion",
        description:
          "Automatically includes active editor tab buffer and cursor location in agent prompts.",
        type: "boolean",
        value: agentAutoContext,
        onChange: (v) => {
          setAgentAutoContext(v)
          showToast(`Agent auto-context ${v ? "enabled" : "disabled"}`)
        },
      },
    ],
    [
      autoSave,
      minimapEnabled,
      setMinimapEnabled,
      linterSettings,
      tabSize,
      wordWrap,
      fontFamily,
      confirmDelete,
      gitAutoFetch,
      activeBranch,
      agentAutoContext,
      setLinterSettings,
      showToast,
      theme,
      setTheme,
    ],
  )

  // Filter settings by query or category
  const filteredSettings = useMemo(() => {
    const q = searchQuery.trim()
    if (!q) {
      if (activeCategory === "Common") return settingsList
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
    { id: "Common", label: "Commonly Used" },
    { id: "Editor", label: "Text Editor" },
    { id: "Workbench", label: "Workbench" },
    { id: "Linter", label: "Linter & Diagnostics" },
    { id: "Git", label: "Git / Source Control" },
    { id: "AI", label: "AI & Agents" },
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
                {cat.label}
              </button>
            ))}
          </nav>

          {/* Right Settings Content List */}
          <div className="settings-content-column">
            {filteredSettings.length > 0 ? (
              filteredSettings.map((setting) => (
                <div className="settings-item-card" key={setting.id}>
                  <div className="settings-item-header">
                    <span className="settings-item-title">{setting.title}</span>
                    <span className="settings-item-id">{setting.id}</span>
                  </div>
                  <p className="settings-item-desc">{setting.description}</p>

                  <div className="settings-control-row">
                    {setting.type === "boolean" && (
                      <label className="settings-toggle-label">
                        <input
                          checked={Boolean(setting.value)}
                          className="settings-checkbox"
                          onChange={(e) => setting.onChange(e.target.checked)}
                          type="checkbox"
                        />
                        <span>{setting.value ? "Enabled" : "Disabled"}</span>
                      </label>
                    )}

                    {setting.type === "select" && (
                      <select
                        aria-label={setting.title}
                        className="settings-select"
                        onChange={(e) => setting.onChange(e.target.value)}
                        value={String(setting.value)}
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
                        onChange={(e) => setting.onChange(e.target.value)}
                        value={String(setting.value)}
                      />
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
