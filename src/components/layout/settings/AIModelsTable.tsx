import { useState, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import type {
  AppSettings,
  AgentSettings,
  ChatProvider,
} from "../../../types/workbench"
import {
  CHAT_PROVIDERS,
  getMergedProviderModels,
} from "../../../data/chatConstants"
import {
  testProviderConnection,
  type ProviderTestResponse,
} from "../../../utils/storeApi"

interface AIModelsTableProps {
  settings?: AppSettings
  updateAgentSettings?: (
    patch: Partial<AgentSettings> | ((prev: AgentSettings) => AgentSettings),
  ) => void
  showToast: (msg: string) => void
}

export function AIModelsTable({
  settings,
  updateAgentSettings,
  showToast,
}: AIModelsTableProps) {
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

  // Check if selected filter provider is configured
  const isSelectedProviderConfigured = useMemo(() => {
    if (modelFilter === "all" || modelFilter === "antigravity") return true
    const key = settings?.agent?.providerKeys?.[modelFilter]
    return Boolean(key && key.trim().length > 0)
  }, [modelFilter, settings?.agent?.providerKeys])

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
      apiKey = settings?.agent?.providerKeys?.claude
      baseUrl = settings?.agent?.providerBaseUrls?.claude
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

  return (
    <div className="flex flex-col gap-4">
      {/* Header & Subtitle */}
      <div className="rounded-lg border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-ink flex items-center gap-2">
            <Icon name="table" size={14} className="text-accent" />
            <span>Active Models & Connectivity Registry</span>
          </h3>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Test per-model connection latency, configure custom model IDs, and
            designate the default code generation model.
          </p>
        </div>
      </div>

      {/* Unconfigured Provider Notice */}
      {!isSelectedProviderConfigured && modelFilter !== "all" && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 flex items-center gap-2.5 text-xs text-amber-300">
          <Icon name="warning" size={14} className="shrink-0 text-amber-400" />
          <span>
            The <strong>{modelFilter}</strong> provider does not have an API key
            configured yet. Go to the <strong>Providers (BYOK)</strong> tab to
            add your key before running connection tests.
          </span>
        </div>
      )}

      {/* Toolbar & Filter Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-1">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
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
              className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors whitespace-nowrap ${
                modelFilter === tab
                  ? "bg-accent text-white"
                  : "bg-surface border border-line text-ink-muted hover:text-ink hover:bg-surface-raised"
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

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-line bg-canvas text-xs min-w-[200px]">
          <Icon name="search" size={12} className="text-ink-muted shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent text-ink placeholder:text-ink-muted focus:outline-none"
            placeholder="Filter models by name or ID..."
            value={modelSearch}
            onChange={(e) => setModelSearch(e.target.value)}
          />
          {modelSearch && (
            <button
              type="button"
              onClick={() => setModelSearch("")}
              className="text-ink-muted hover:text-ink cursor-pointer"
            >
              <Icon name="close" size={10} />
            </button>
          )}
        </div>
      </div>

      {/* Add Custom Model Bar */}
      <div className="rounded-lg border border-line bg-surface p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <span className="text-xs font-medium text-ink-muted shrink-0">
          Add Model:
        </span>
        <select
          aria-label="Add Model Provider"
          className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none shrink-0"
          value={newModelProvider}
          onChange={(e) => setNewModelProvider(e.target.value as ChatProvider)}
        >
          {CHAT_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none flex-1 min-w-[200px]"
          placeholder="Model ID (e.g. meta-llama/llama-3.3-70b-instruct, qwen2.5-coder:7b)..."
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
          className="h-8 px-3 rounded bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
          onClick={handleAddCustomModel}
        >
          <Icon name="plus" size={12} />
          <span>Add to Registry</span>
        </button>
      </div>

      {/* Models Table */}
      <div className="rounded-lg border border-line bg-surface overflow-hidden">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-left text-xs text-ink border-collapse">
            <thead className="bg-canvas border-b border-line text-[11px] font-semibold text-ink-muted uppercase tracking-wider sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 w-24">Provider</th>
                <th className="py-2.5 px-3">Model ID</th>
                <th className="py-2.5 px-3 w-32">Type</th>
                <th className="py-2.5 px-3 w-40">Connection</th>
                <th className="py-2.5 px-3 w-32 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {filteredModels.map((m) => {
                const testKey = `${m.provider}:${m.id}`
                const testState = modelTestStates[testKey]
                const isDefault =
                  settings?.agent?.defaultProvider === m.provider &&
                  settings?.agent?.model === m.id

                return (
                  <tr
                    key={testKey}
                    className={`transition-colors hover:bg-surface-raised ${
                      isDefault ? "bg-accent/5" : ""
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border border-line bg-canvas text-ink">
                        {m.provider === "antigravity"
                          ? "AGY"
                          : m.provider === "claude"
                            ? "CLD"
                            : m.provider === "opencode"
                              ? "OC"
                              : "OR"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-ink font-mono text-[11px]">
                          {m.id}
                        </span>
                        {m.description && (
                          <span className="text-[10px] text-ink-muted">
                            {m.description}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            m.isCustom
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/30"
                              : "bg-canvas text-ink-muted border-line"
                          }`}
                        >
                          {m.isCustom ? "Custom" : "Built-in"}
                        </span>
                        {isDefault && (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent text-white">
                            <Icon name="sparkle" size={9} />
                            <span>Default</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-line bg-canvas hover:bg-surface-raised text-ink cursor-pointer disabled:opacity-50"
                          disabled={testState?.loading}
                          onClick={() =>
                            handleTestSpecificModel(m.provider, m.id)
                          }
                          title="Test connection for this model"
                        >
                          <Icon
                            name="refresh"
                            size={10}
                            className={testState?.loading ? "animate-spin" : ""}
                          />
                          <span>
                            {testState?.loading ? "Testing..." : "Test"}
                          </span>
                        </button>

                        {testState?.result && (
                          <div
                            className={`flex items-center gap-1 text-[11px] font-medium ${
                              testState.result.success
                                ? "text-emerald-400"
                                : "text-rose-400"
                            }`}
                            title={
                              testState.result.error || testState.result.message
                            }
                          >
                            <Icon
                              name={
                                testState.result.success ? "check" : "error"
                              }
                              size={11}
                            />
                            <span>
                              {testState.result.success
                                ? `${testState.result.latencyMs}ms`
                                : "Failed"}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {!isDefault && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-line bg-canvas hover:bg-surface-raised text-ink cursor-pointer transition-colors"
                            onClick={() =>
                              handleSetModelDefault(m.provider, m.id)
                            }
                            title="Set as default model"
                          >
                            <Icon
                              name="sparkle"
                              size={10}
                              className="text-accent"
                            />
                            <span>Set Default</span>
                          </button>
                        )}
                        {m.isCustom && (
                          <button
                            type="button"
                            className="p-1 rounded text-ink-muted hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer transition-colors"
                            onClick={() =>
                              handleRemoveModelCustom(m.provider, m.id)
                            }
                            title="Delete custom model"
                          >
                            <Icon name="trash" size={13} />
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
                    className="text-center py-8 text-ink-muted text-xs"
                  >
                    No models found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
