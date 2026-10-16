import { useState, useMemo, useEffect, useCallback } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { buildSettingsSchema, type SettingItem } from "./settingsRegistry"
import { AISettingsPane } from "./AISettingsPane"
import {
  fetchLspStatus,
  type LanguageServerStatusInfo,
} from "../../../utils/lspApi"

export interface SettingsViewProps {
  isModal?: boolean
  onClose?: () => void
}

export function SettingsView({ isModal = false, onClose }: SettingsViewProps) {
  const {
    settingsModalCategory,
    setSettingsModalCategory,
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
  } = useWorkbenchStore(
    useShallow((s) => ({
      settingsModalCategory: s.settingsModalCategory,
      setSettingsModalCategory: s.setSettingsModalCategory,
      settings: s.settings,
      updateEditorSettings: s.updateEditorSettings,
      updateWorkbenchSettings: s.updateWorkbenchSettings,
      updateFilesSettings: s.updateFilesSettings,
      updateFeaturesSettings: s.updateFeaturesSettings,
      updateCompanionSettings: s.updateCompanionSettings,
      updateAgentSettings: s.updateAgentSettings,
      resetSettings: s.resetSettings,
      setThemePalette: s.setThemePalette,
      setThemeMode: s.setThemeMode,
      showToast: s.showToast,
    })),
  )

  const [activeCategory, setActiveCategory] = useState<string>(
    settingsModalCategory || "Editor",
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [isRegex, setIsRegex] = useState(false)
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})

  // LSP Tab State
  const [lspServers, setLspServers] = useState<LanguageServerStatusInfo[]>([])
  const [lspLoading, setLspLoading] = useState(false)

  const loadLspStatus = useCallback(async () => {
    setLspLoading(true)
    try {
      const list = await fetchLspStatus()
      setLspServers(list)
    } catch {
      // offline or mock fallback
    } finally {
      setLspLoading(false)
    }
  }, [])

  useEffect(() => {
    if (settingsModalCategory) {
      setActiveCategory(settingsModalCategory)
    }
  }, [settingsModalCategory])

  useEffect(() => {
    if (activeCategory === "LSP") {
      void loadLspStatus()
    }
  }, [activeCategory, loadLspStatus])

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

  const categories = [
    { id: "Editor", label: "Text Editor", icon: "code" },
    { id: "Files", label: "Files", icon: "folder" },
    { id: "Workbench", label: "Workbench", icon: "window" },
    { id: "AI", label: "AI & Agent Runtime", icon: "sparkle" },
    { id: "LSP", label: "Language Servers (LSP)", icon: "zap" },
    { id: "Features", label: "Features", icon: "settings" },
    { id: "Window", label: "Window", icon: "split", badge: "Future" },
    {
      id: "Companion",
      label: "Companion (Tablet)",
      icon: "sparkle",
      badge: "Future",
    },
  ]

  function renderSettingCard(setting: SettingItem) {
    return (
      <div
        className="rounded-lg border border-line bg-surface p-3.5 flex flex-col gap-2.5 transition-colors hover:border-line-active"
        key={setting.id}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-ink">
              {setting.title}
            </span>
            {setting.isFutureNotice && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Future Notice
              </span>
            )}
          </div>
          <span className="text-[10px] font-mono text-ink-muted">
            {setting.id}
          </span>
        </div>

        <p className="text-[11px] text-ink-muted leading-relaxed">
          {setting.description}
        </p>

        <div className="pt-1">
          {setting.type === "boolean" && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-ink select-none">
              <input
                checked={Boolean(setting.value)}
                className="rounded border-line text-accent focus:ring-accent"
                onChange={(e) =>
                  setting.onChange && setting.onChange(e.target.checked)
                }
                type="checkbox"
              />
              <span>{setting.value ? "Enabled" : "Disabled"}</span>
            </label>
          )}

          {setting.type === "select" && (
            <select
              aria-label={setting.title}
              className="h-8 max-w-sm px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
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
              className="h-8 max-w-md w-full px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
              onChange={(e) =>
                setting.onChange && setting.onChange(e.target.value)
              }
              value={String(setting.value ?? "")}
            />
          )}

          {setting.type === "number" && (
            <input
              aria-label={setting.title}
              className="h-8 w-32 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
              onChange={(e) =>
                setting.onChange && setting.onChange(e.target.value)
              }
              type="number"
              value={Number(setting.value ?? 0)}
            />
          )}

          {setting.type === "password" && (
            <div className="relative flex items-center max-w-md">
              <input
                aria-label={setting.title}
                className="w-full h-8 px-2.5 pr-14 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
                type={showPassword[setting.id] ? "text" : "password"}
                onChange={(e) =>
                  setting.onChange && setting.onChange(e.target.value)
                }
                value={String(setting.value ?? "")}
                placeholder="Enter value..."
              />
              <button
                type="button"
                className="absolute right-2 text-[10px] text-ink-muted hover:text-ink cursor-pointer select-none"
                onClick={() =>
                  setShowPassword((prev) => ({
                    ...prev,
                    [setting.id]: !prev[setting.id],
                  }))
                }
              >
                {showPassword[setting.id] ? "Hide" : "Show"}
              </button>
            </div>
          )}

          {setting.type === "info" && (
            <div className="text-[11px] text-ink-muted italic">
              {setting.futureNoticeText || "Coming in upcoming releases."}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col w-full h-full bg-canvas text-ink ${
        isModal ? "rounded-lg" : ""
      }`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 h-12 px-4 border-b border-line bg-surface/80 shrink-0">
        <div className="flex items-center gap-2.5">
          <Icon name="settings" size={16} className="text-accent" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-ink">Preferences</span>
            <span className="text-[10px] text-ink-muted">
              User Settings (Cmd+,)
            </span>
          </div>
        </div>

        {/* Search Input */}
        <div className="flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-line bg-canvas text-xs flex-1 max-w-md">
          <Icon name="search" size={12} className="text-ink-muted shrink-0" />
          <input
            className="w-full bg-transparent text-xs text-ink placeholder:text-ink-muted focus:outline-none"
            placeholder="Search settings..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="text-ink-muted hover:text-ink cursor-pointer"
              onClick={() => setSearchQuery("")}
              title="Clear query"
              type="button"
            >
              <Icon name="close" size={11} />
            </button>
          )}
          <button
            className={`px-1 rounded text-[10px] font-mono cursor-pointer border ${
              isRegex
                ? "bg-accent/15 text-accent border-accent/40"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
            onClick={() => setIsRegex((v) => !v)}
            title="Use Regular Expression"
            type="button"
          >
            .*
          </button>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1.5">
          <button
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border border-line bg-canvas hover:bg-surface-raised text-ink transition-colors cursor-pointer"
            onClick={() => {
              resetSettings()
              showToast("All settings reset to defaults")
            }}
            title="Reset all preferences to factory defaults"
            type="button"
          >
            <Icon name="refresh" size={11} />
            <span>Reset</span>
          </button>

          {isModal && onClose && (
            <button
              aria-label="Close settings"
              className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors cursor-pointer"
              onClick={onClose}
              type="button"
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Main Body: Two-Column Master-Detail Layout */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Category Navigation */}
        <nav className="w-52 border-r border-line bg-surface p-2 flex flex-col gap-0.5 overflow-y-auto shrink-0">
          <div className="px-2.5 py-1 text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
            Categories
          </div>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer text-left ${
                activeCategory === cat.id && !searchQuery.trim()
                  ? "bg-accent text-white"
                  : "text-ink-muted hover:text-ink hover:bg-surface-raised"
              }`}
              onClick={() => {
                setActiveCategory(cat.id)
                setSettingsModalCategory?.(cat.id)
                setSearchQuery("")
              }}
              type="button"
            >
              <div className="flex items-center gap-2 truncate">
                <Icon name={cat.icon} size={13} className="shrink-0" />
                <span className="truncate">{cat.label}</span>
              </div>
              {cat.badge && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-canvas border border-line text-ink-muted shrink-0">
                  {cat.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* Right Settings Content Pane */}
        <div className="flex-1 min-w-0 p-5 overflow-y-auto bg-canvas">
          {activeCategory === "AI" && !searchQuery.trim() ? (
            <AISettingsPane
              settings={settings}
              updateAgentSettings={updateAgentSettings}
              showToast={showToast}
            />
          ) : activeCategory === "LSP" && !searchQuery.trim() ? (
            <div className="flex flex-col gap-5">
              {/* Live Language Server Detection */}
              <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-ink">
                      Language Servers Runtime Status
                    </span>
                    <p className="text-[11px] text-ink-muted">
                      Live detection across PATH, Homebrew, toolchains, and
                      custom configured paths.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadLspStatus()}
                    disabled={lspLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-canvas border border-line rounded hover:bg-surface-raised cursor-pointer text-ink transition-colors"
                  >
                    <Icon
                      name="refresh"
                      size={12}
                      className={lspLoading ? "animate-spin" : ""}
                    />
                    <span>{lspLoading ? "Scanning..." : "Rescan"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                  {lspServers.map((s) => (
                    <div
                      key={s.language}
                      className="flex items-center justify-between p-2.5 rounded bg-canvas border border-line text-xs"
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="font-semibold text-ink capitalize truncate">
                          {s.language}
                        </span>
                        <span className="text-[10px] text-ink-muted font-mono truncate">
                          {s.path || s.binaryName || "Not configured"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.status === "running" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Running (PID {s.activePid})
                          </span>
                        ) : s.status === "available" ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-info-soft text-info border border-info/30">
                            Installed
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning-soft text-warning border border-warning/30">
                            Missing
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider px-1">
                  LSP Preferences & Custom Binaries
                </div>
                {filteredSettings.map(renderSettingCard)}
              </div>
            </div>
          ) : filteredSettings.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider px-1">
                {searchQuery.trim()
                  ? `Search Results for "${searchQuery}"`
                  : activeCategory}
              </div>
              {filteredSettings.map(renderSettingCard)}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-ink-muted gap-2 text-xs">
              <Icon name="search" size={24} />
              <span>No settings found matching "{searchQuery}"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
