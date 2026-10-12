import { useState, useMemo, useEffect, useCallback } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { buildSettingsSchema, type SettingItem } from "./settingsRegistry"
import {
  CHAT_PROVIDERS,
  getMergedProviderModels,
} from "../../../data/chatConstants"
import {
  testProviderConnection,
  type ProviderTestResponse,
} from "../../../utils/storeApi"
import {
  fetchLspStatus,
  type LanguageServerStatusInfo,
} from "../../../utils/lspApi"
import type { ChatProvider } from "../../../types/workbench"

export function SettingsModal() {
  const {
    settingsModalOpen,
    setSettingsModalOpen,
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
  } = useWorkbench()

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
      // fallback if server unreachable
    } finally {
      setLspLoading(false)
    }
  }, [])

  useEffect(() => {
    if (settingsModalOpen && settingsModalCategory) {
      setActiveCategory(settingsModalCategory)
    }
  }, [settingsModalOpen, settingsModalCategory])

  useEffect(() => {
    if (settingsModalOpen && activeCategory === "LSP") {
      void loadLspStatus()
    }
  }, [settingsModalOpen, activeCategory, loadLspStatus])

  // AI Tab State
  const [modelFilter, setModelFilter] = useState<"all" | ChatProvider>("all")
  const [modelSearch, setModelSearch] = useState("")
  const [newModelProvider, setNewModelProvider] =
    useState<ChatProvider>("openrouter")
  const [newModelId, setNewModelId] = useState("")
  const [modelTestStates, setModelTestStates] = useState<Record<string, {
    loading: boolean
    result?: ProviderTestResponse
  }>>({})

  // Compute all models (built-in + custom) across all providers
  const allModels = useMemo(() => {
    const list: {
      provider: ChatProvider
      id: string
      name: string
      description?: string
      isCustom?: boolean
    }[] = []

    for (const p of CHAT_PROVIDERS) {
      const pModels = getMergedProviderModels(
        p.id,
        settings?.agent?.customModels,
      )
      for (const m of pModels) {
        list.push({
          provider: p.id,
          id: m.id,
          name: m.name,
          description: m.description,
          isCustom: m.isCustom,
        })
      }
    }
    return list
  }, [settings?.agent?.customModels])

  // Filtered models for table
  const filteredModels = useMemo(() => {
    return allModels.filter((m) => {
      if (modelFilter !== "all" && m.provider !== modelFilter) return false
      if (modelSearch.trim()) {
        const q = modelSearch.toLowerCase()
        return (
          m.id.toLowerCase().includes(q) ||
          m.name.toLowerCase().includes(q) ||
          (m.description && m.description.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [allModels, modelFilter, modelSearch])

  // Test connection for a specific model
  async function handleTestSpecificModel(
    provider: ChatProvider,
    modelId: string,
  ) {
    const testKey = `${provider}:${modelId}`
    setModelTestStates((prev) => ({
      ...prev,
      [testKey]: { loading: true },
    }))

    let apiKey: string | undefined
    let baseUrl: string | undefined
    let command: string | undefined

    if (provider === "antigravity") {
      command = settings?.agent?.bypassCommands?.antigravity || "antigravity"
    } else if (provider === "claude") {
      command = settings?.agent?.bypassCommands?.claude || "claude"
    } else if (provider === "opencode") {
      apiKey = settings?.agent?.providerKeys?.opencode
      baseUrl = settings?.agent?.providerBaseUrls?.opencode
    } else if (provider === "openrouter") {
      apiKey = settings?.agent?.providerKeys?.openrouter
    }

    try {
      const res = await testProviderConnection({
        provider,
        model: modelId,
        apiKey,
        baseUrl,
        command,
      })

      setModelTestStates((prev) => ({
        ...prev,
        [testKey]: { loading: false, result: res },
      }))

      if (res.success) {
        showToast(`${res.message} (${res.latencyMs}ms)`)
      } else {
        showToast(res.error || res.message)
      }
    } catch (err: any) {
      setModelTestStates((prev) => ({
        ...prev,
        [testKey]: {
          loading: false,
          result: {
            success: false,
            provider,
            latencyMs: 0,
            message: "Connection test failed",
            error: err?.message,
          },
        },
      }))
      showToast("Connection test failed")
    }
  }

  // Set model as global default
  function handleSetModelDefault(provider: ChatProvider, modelId: string) {
    updateAgentSettings?.({
      defaultProvider: provider,
      model: modelId,
    })
    showToast(`Default model set to ${modelId} (${provider})`)
  }

  // Remove custom model
  function handleRemoveModelCustom(provider: ChatProvider, modelId: string) {
    const cur = settings?.agent?.customModels?.[provider] || []
    updateAgentSettings?.((prev) => ({
      ...prev,
      customModels: {
        ...prev.customModels,
        [provider]: cur.filter((m) => m !== modelId),
      },
    }))
    showToast(`Removed custom model ${modelId}`)
  }

  // Add custom model
  function handleAddCustomModel() {
    const cleanId = newModelId.trim()
    if (!cleanId) return
    const cur = settings?.agent?.customModels?.[newModelProvider] || []
    if (cur.includes(cleanId)) {
      showToast(`Model ${cleanId} already exists in ${newModelProvider}`)
      return
    }

    updateAgentSettings?.((prev) => ({
      ...prev,
      customModels: {
        ...prev.customModels,
        [newModelProvider]: [...cur, cleanId],
      },
    }))
    showToast(`Added custom model ${cleanId} to ${newModelProvider}`)
    setNewModelId("")
  }

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
    { id: "LSP", label: "Language Servers (LSP)", badge: "" },
    { id: "Companion", label: "Companion (Tablet)", badge: "Future" },
    { id: "AI", label: "AI Agents", badge: "" },
  ]

  function renderSettingCard(setting: SettingItem) {
    return (
      <div className="settings-item-card" key={setting.id}>
        <div className="settings-item-header">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="settings-item-title">{setting.title}</span>
            {setting.isFutureNotice && (
              <span className="settings-future-badge">Future Notice</span>
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

          {setting.type === "password" && (
            <div className="settings-password-wrapper">
              <input
                aria-label={setting.title}
                className="settings-text-input"
                type={showPassword[setting.id] ? "text" : "password"}
                onChange={(e) =>
                  setting.onChange && setting.onChange(e.target.value)
                }
                value={String(setting.value ?? "")}
                placeholder="Enter API key..."
              />
              <button
                type="button"
                className="settings-show-pwd-btn"
                onClick={() =>
                  setShowPassword((prev) => ({
                    ...prev,
                    [setting.id]: !prev[setting.id],
                  }))
                }
                title={showPassword[setting.id] ? "Hide" : "Show"}
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
              placeholder="Search settings..."
              value={searchQuery}
            />
            {searchQuery && (
              <button
                className="settings-search-clear"
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
                  setSettingsModalCategory?.(cat.id)
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
            {activeCategory === "AI" && !searchQuery.trim() ? (
              <div className="ai-settings-page">
                {/* 1. General AI Preferences */}
                <div className="ai-section">
                  <div className="ai-section-header">
                    <span className="ai-section-title">
                      General AI Preferences
                    </span>
                    <span className="ai-section-subtitle">
                      Runtime defaults and telemetry configuration for code
                      agents.
                    </span>
                  </div>
                  <div className="ai-general-grid">
                    <div className="ai-general-item">
                      <label className="ai-field-label">
                        Creativity Temperature
                      </label>
                      <select
                        aria-label="Creativity Temperature"
                        className="settings-select"
                        value={String(settings?.agent?.temperature ?? "0.7")}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0.7
                          updateAgentSettings?.({ temperature: v })
                          showToast(`Agent temperature set to ${v}`)
                        }}
                      >
                        <option value="0.2">0.2 - Strict & Precise</option>
                        <option value="0.7">0.7 - Balanced</option>
                        <option value="1.0">1.0 - Creative</option>
                      </select>
                    </div>

                    <div className="ai-general-item">
                      <label className="ai-field-label">Token Streaming</label>
                      <label className="settings-toggle-label mt-1">
                        <input
                          type="checkbox"
                          className="settings-checkbox"
                          checked={settings?.agent?.streaming ?? true}
                          onChange={(e) => {
                            updateAgentSettings?.({
                              streaming: e.target.checked,
                            })
                            showToast(
                              `Agent token streaming ${
                                e.target.checked ? "enabled" : "disabled"
                              }`,
                            )
                          }}
                        />
                        <span>
                          {settings?.agent?.streaming
                            ? "Enabled (Live tokens)"
                            : "Disabled (Block)"}
                        </span>
                      </label>
                    </div>

                    <div className="ai-general-item">
                      <label className="ai-field-label">
                        Auto Context Ingestion
                      </label>
                      <label className="settings-toggle-label mt-1">
                        <input
                          type="checkbox"
                          className="settings-checkbox"
                          checked={settings?.agent?.contextIngestion ?? true}
                          onChange={(e) => {
                            updateAgentSettings?.({
                              contextIngestion: e.target.checked,
                            })
                            showToast(
                              `Agent auto context ${
                                e.target.checked ? "enabled" : "disabled"
                              }`,
                            )
                          }}
                        />
                        <span>
                          {settings?.agent?.contextIngestion
                            ? "Enabled (Buffer & selection)"
                            : "Disabled"}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* 2. Provider Credentials Grid (Compact) */}
                <div className="ai-section">
                  <div className="ai-section-header">
                    <span className="ai-section-title">
                      Provider Authentication & Credentials
                    </span>
                    <span className="ai-section-subtitle">
                      Local CLI commands and upstream API keys across the 4
                      standard providers.
                    </span>
                  </div>

                  <div className="ai-credentials-grid">
                    {/* Antigravity */}
                    <div
                      className="ai-cred-card"
                      title="Login via 'agy' di terminal luar. Kredensial & brain otomatis terbaca dari ~/.gemini"
                    >
                      <div className="ai-cred-card-header">
                        <div className="flex items-center gap-1.5">
                          <span className="provider-tag tag-antigravity">
                            AGY
                          </span>
                          <span className="ai-cred-name">Antigravity</span>
                        </div>
                        <span
                          className="ai-cred-type"
                          title="Login via 'agy' di terminal luar"
                        >
                          OAuth CLI
                        </span>
                      </div>
                      <div className="ai-cred-field">
                        <label>Command / Binary Path</label>
                        <input
                          aria-label="Antigravity Command"
                          type="text"
                          className="settings-text-input"
                          value={
                            settings?.agent?.bypassCommands?.antigravity ??
                            "antigravity"
                          }
                          placeholder="antigravity"
                          title="Binary command Antigravity CLI (default: antigravity atau agy)"
                          onChange={(e) =>
                            updateAgentSettings?.((prev) => ({
                              ...prev,
                              bypassCommands: {
                                ...prev.bypassCommands,
                                antigravity: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div
                        className="ai-cred-hint"
                        title="Jalankan 'agy' di terminal luar untuk login Google OAuth"
                      >
                        <Icon
                          name="sparkle"
                          size={11}
                          className="text-accent shrink-0"
                        />
                        <span>
                          Kredensial & brain otomatis terbaca dari{" "}
                          <code>~/.gemini</code>
                        </span>
                      </div>
                    </div>

                    {/* Claude */}
                    <div className="ai-cred-card">
                      <div className="ai-cred-card-header">
                        <div className="flex items-center gap-1.5">
                          <span className="provider-tag tag-claude">CLD</span>
                          <span className="ai-cred-name">Claude</span>
                        </div>
                        <span className="ai-cred-type">OAuth CLI</span>
                      </div>
                      <div className="ai-cred-field">
                        <label>Command / Binary Path</label>
                        <input
                          aria-label="Claude Command"
                          type="text"
                          className="settings-text-input"
                          value={
                            settings?.agent?.bypassCommands?.claude ?? "claude"
                          }
                          placeholder="claude"
                          onChange={(e) =>
                            updateAgentSettings?.((prev) => ({
                              ...prev,
                              bypassCommands: {
                                ...prev.bypassCommands,
                                claude: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    </div>

                    {/* OpenCode */}
                    <div className="ai-cred-card">
                      <div className="ai-cred-card-header">
                        <div className="flex items-center gap-1.5">
                          <span className="provider-tag tag-opencode">OC</span>
                          <span className="ai-cred-name">OpenCode</span>
                        </div>
                        <span className="ai-cred-type">OpenAI Gateway</span>
                      </div>
                      <div className="ai-cred-field">
                        <label>Base URL</label>
                        <input
                          aria-label="OpenCode Base URL"
                          type="text"
                          className="settings-text-input"
                          value={
                            settings?.agent?.providerBaseUrls?.opencode ??
                            "https://api.opencode.ai/v1"
                          }
                          placeholder="https://api.opencode.ai/v1"
                          onChange={(e) =>
                            updateAgentSettings?.((prev) => ({
                              ...prev,
                              providerBaseUrls: {
                                ...prev.providerBaseUrls,
                                opencode: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="ai-cred-field mt-1">
                        <label>API Key</label>
                        <div className="settings-password-wrapper">
                          <input
                            aria-label="OpenCode API Key"
                            type={
                              showPassword["opencode"] ? "text" : "password"
                            }
                            className="settings-text-input"
                            value={
                              settings?.agent?.providerKeys?.opencode ?? ""
                            }
                            placeholder="Enter API key..."
                            onChange={(e) =>
                              updateAgentSettings?.((prev) => ({
                                ...prev,
                                providerKeys: {
                                  ...prev.providerKeys,
                                  opencode: e.target.value,
                                },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="settings-show-pwd-btn"
                            onClick={() =>
                              setShowPassword((prev) => ({
                                ...prev,
                                opencode: !prev["opencode"],
                              }))
                            }
                          >
                            {showPassword["opencode"] ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* OpenRouter */}
                    <div className="ai-cred-card">
                      <div className="ai-cred-card-header">
                        <div className="flex items-center gap-1.5">
                          <span className="provider-tag tag-openrouter">
                            OR
                          </span>
                          <span className="ai-cred-name">OpenRouter</span>
                        </div>
                        <span className="ai-cred-type">Multi-Gateway</span>
                      </div>
                      <div className="ai-cred-field">
                        <label>API Key</label>
                        <div className="settings-password-wrapper">
                          <input
                            aria-label="OpenRouter API Key"
                            type={
                              showPassword["openrouter"] ? "text" : "password"
                            }
                            className="settings-text-input"
                            value={
                              settings?.agent?.providerKeys?.openrouter ?? ""
                            }
                            placeholder="Enter API key..."
                            onChange={(e) =>
                              updateAgentSettings?.((prev) => ({
                                ...prev,
                                providerKeys: {
                                  ...prev.providerKeys,
                                  openrouter: e.target.value,
                                },
                              }))
                            }
                          />
                          <button
                            type="button"
                            className="settings-show-pwd-btn"
                            onClick={() =>
                              setShowPassword((prev) => ({
                                ...prev,
                                openrouter: !prev["openrouter"],
                              }))
                            }
                          >
                            {showPassword["openrouter"] ? "Hide" : "Show"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Models Management Table */}
                <div className="ai-section">
                  <div className="ai-section-header">
                    <span className="ai-section-title">
                      Models & Connections Registry
                    </span>
                    <span className="ai-section-subtitle">
                      Manage built-in and custom models across all providers
                      with per-model connection testing.
                    </span>
                  </div>

                  <div className="ai-models-table-container">
                    {/* Toolbar */}
                    <div className="ai-models-toolbar">
                      <div className="ai-filter-tabs">
                        {([
                          "all",
                          "antigravity",
                          "claude",
                          "opencode",
                          "openrouter",
                        ] as const).map((tab) => (
                          <button
                            key={tab}
                            type="button"
                            className={`ai-filter-tab ${
                              modelFilter === tab ? "active" : ""
                            }`}
                            onClick={() => setModelFilter(tab)}
                          >
                            {tab === "all"
                              ? "All Models"
                              : tab === "antigravity"
                                ? "Antigravity"
                                : tab === "claude"
                                  ? "Claude"
                                  : tab === "opencode"
                                    ? "OpenCode"
                                    : "OpenRouter"}
                          </button>
                        ))}
                      </div>

                      <div className="ai-models-search-box">
                        <Icon name="search" size={12} />
                        <input
                          type="text"
                          className="ai-models-search-input"
                          placeholder="Filter models..."
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Add Custom Model Bar */}
                    <div className="ai-add-model-bar">
                      <span className="text-[11px] font-medium text-ink-muted shrink-0">
                        Add Model:
                      </span>
                      <select
                        aria-label="Add Model Provider"
                        className="settings-select text-xs h-7 shrink-0"
                        value={newModelProvider}
                        onChange={(e) =>
                          setNewModelProvider(e.target.value as ChatProvider)
                        }
                      >
                        {CHAT_PROVIDERS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        className="settings-text-input text-xs h-7 flex-1 min-w-[180px]"
                        placeholder="Model ID (e.g. meta-llama/llama-3.3-70b-instruct, gemini-3.8-pro-exp)..."
                        value={newModelId}
                        onChange={(e) => setNewModelId(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault()
                            handleAddCustomModel()
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="custom-model-add-btn h-7 shrink-0"
                        onClick={handleAddCustomModel}
                      >
                        <Icon name="plus" size={12} />
                        <span>Add Model</span>
                      </button>
                    </div>

                    {/* Table */}
                    <div className="ai-table-scroll">
                      <table className="ai-models-table">
                        <thead>
                          <tr>
                            <th style={{ width: "90px" }}>Provider</th>
                            <th>Model ID</th>
                            <th style={{ width: "130px" }}>Type</th>
                            <th style={{ width: "170px" }}>Connection Test</th>
                            <th style={{ width: "130px", textAlign: "right" }}>
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredModels.map((m) => {
                            const testKey = `${m.provider}:${m.id}`
                            const testState = modelTestStates[testKey]
                            const isDefault =
                              settings?.agent?.defaultProvider === m.provider &&
                              settings?.agent?.model === m.id

                            return (
                              <tr
                                key={testKey}
                                className={isDefault ? "row-default" : ""}
                              >
                                <td>
                                  <span
                                    className={`provider-tag tag-${m.provider}`}
                                  >
                                    {m.provider === "antigravity"
                                      ? "AGY"
                                      : m.provider === "claude"
                                        ? "CLD"
                                        : m.provider === "opencode"
                                          ? "OC"
                                          : "OR"}
                                  </span>
                                </td>
                                <td>
                                  <div className="model-cell-id">
                                    <span className="model-cell-title">
                                      {m.id}
                                    </span>
                                    {m.description && (
                                      <span className="model-cell-desc">
                                        {m.description}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`model-kind-badge ${
                                        m.isCustom
                                          ? "kind-custom"
                                          : "kind-builtin"
                                      }`}
                                    >
                                      {m.isCustom ? "Custom" : "Built-in"}
                                    </span>
                                    {isDefault && (
                                      <span className="model-default-tag flex items-center gap-1">
                                        <Icon name="sparkle" size={10} />
                                        <span>Default</span>
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      className="model-test-action-btn"
                                      disabled={testState?.loading}
                                      onClick={() =>
                                        handleTestSpecificModel(
                                          m.provider,
                                          m.id,
                                        )
                                      }
                                      title="Test connection for this model"
                                    >
                                      {testState?.loading ? (
                                        <span className="test-spinner" />
                                      ) : (
                                        <Icon name="refresh" size={11} />
                                      )}
                                      <span>
                                        {testState?.loading
                                          ? "Testing"
                                          : "Test"}
                                      </span>
                                    </button>

                                    {testState?.result && (
                                      <div
                                        className={`model-test-status ${
                                          testState.result.success
                                            ? "status-success"
                                            : "status-error"
                                        }`}
                                        title={
                                          testState.result.error ||
                                          testState.result.message
                                        }
                                      >
                                        {testState.result.success ? (
                                          <>
                                            <Icon name="check" size={11} />
                                            <span>
                                              {testState.result.latencyMs}ms
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <Icon name="error" size={11} />
                                            <span>Failed</span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex items-center justify-end gap-1.5">
                                    {!isDefault && (
                                      <button
                                        type="button"
                                        className="model-set-default-btn"
                                        onClick={() =>
                                          handleSetModelDefault(
                                            m.provider,
                                            m.id,
                                          )
                                        }
                                        title="Set as default model"
                                      >
                                        <Icon name="sparkle" size={11} />
                                        <span>Default</span>
                                      </button>
                                    )}
                                    {m.isCustom && (
                                      <button
                                        type="button"
                                        className="model-delete-action-btn"
                                        onClick={() =>
                                          handleRemoveModelCustom(
                                            m.provider,
                                            m.id,
                                          )
                                        }
                                        title="Delete custom model"
                                      >
                                        <Icon name="trash" size={12} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                          {filteredModels.length === 0 && (
                            <tr>
                              <td
                                colSpan={5}
                                className="text-center py-6 text-ink-muted text-xs"
                              >
                                No models found matching your filter.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeCategory === "LSP" && !searchQuery.trim() ? (
              <div className="lsp-settings-page flex flex-col gap-5">
                {/* 1. Live Language Server Detection & Health Card */}
                <div className="bg-surface rounded-lg border border-line p-4 flex flex-col gap-3">
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
                      title="Re-scan system and custom paths"
                    >
                      <Icon
                        name="refresh"
                        size={12}
                        className={lspLoading ? "animate-spin" : ""}
                      />
                      <span>{lspLoading ? "Scanning..." : "Rescan"}</span>
                    </button>
                  </div>

                  {/* Servers Grid */}
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
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-success-soft text-success border border-success/30">
                              Running (PID {s.activePid})
                            </span>
                          ) : s.status === "available" ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-info-soft text-info border border-info/30">
                              Installed
                            </span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning-soft text-warning border border-warning/30">
                                Missing
                              </span>
                              {s.installCommand && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void navigator.clipboard.writeText(
                                      s.installCommand!,
                                    )
                                    showToast(
                                      `Copied install command: ${s.installCommand}`,
                                    )
                                  }}
                                  className="p-1 hover:text-ink text-ink-muted cursor-pointer"
                                  title={`Copy: ${s.installCommand}`}
                                >
                                  <Icon name="copy" size={11} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-line/50 text-[10px] text-ink-muted">
                    <span>
                      Quick command:{" "}
                      <code className="font-mono text-ink">
                        npm run lsp:bundle -- --check
                      </code>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText("npm run lsp:bundle")
                        showToast("Copied: npm run lsp:bundle")
                      }}
                      className="text-accent hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <Icon name="copy" size={10} /> Copy Bundle Installer
                    </button>
                  </div>
                </div>

                {/* 2. Configuration Settings */}
                <div className="flex flex-col gap-3">
                  <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider px-1">
                    LSP Preferences & Custom Binaries
                  </div>
                  {filteredSettings.map(renderSettingCard)}
                </div>
              </div>
            ) : filteredSettings.length > 0 ? (
              filteredSettings.map(renderSettingCard)
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
