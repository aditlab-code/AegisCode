import { useState } from "react"
import { Icon } from "../../ui/Icon"
import type {
  AppSettings,
  AgentSettings,
  ChatProvider,
} from "../../../types/workbench"
import {
  testProviderConnection,
  type ProviderTestResponse,
} from "../../../utils/storeApi"

interface AIProvidersCardProps {
  settings?: AppSettings
  updateAgentSettings?: (
    patch: Partial<AgentSettings> | ((prev: AgentSettings) => AgentSettings),
  ) => void
  showToast: (msg: string) => void
}

export function AIProvidersCard({
  settings,
  updateAgentSettings,
  showToast,
}: AIProvidersCardProps) {
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({})
  const [testing, setTesting] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] =
    useState<Record<string, ProviderTestResponse>>({})

  // Custom provider state
  const [customName, setCustomName] = useState("")
  const [customBaseUrl, setCustomBaseUrl] = useState("")
  const [customKey, setCustomKey] = useState("")
  const [isAddingCustom, setIsAddingCustom] = useState(false)

  async function handleTest(provider: ChatProvider, model?: string) {
    setTesting((prev) => ({ ...prev, [provider]: true }))

    let apiKey: string | undefined
    let baseUrl: string | undefined
    let command: string | undefined

    if (provider === "antigravity") {
      command = settings?.agent?.bypassCommands?.antigravity || "antigravity"
      model = model || "gemini-3.8-flash"
    } else if (provider === "claude") {
      apiKey = settings?.agent?.providerKeys?.claude
      baseUrl = settings?.agent?.providerBaseUrls?.claude
      command = settings?.agent?.bypassCommands?.claude || "claude"
      model = model || "claude-3.7-sonnet"
    } else if (provider === "opencode") {
      apiKey = settings?.agent?.providerKeys?.opencode
      baseUrl =
        settings?.agent?.providerBaseUrls?.opencode ||
        "https://api.opencode.ai/v1"
      model = model || "gpt-4o"
    } else if (provider === "openrouter") {
      apiKey = settings?.agent?.providerKeys?.openrouter
      model = model || "deepseek-r1"
    }

    try {
      const res = await testProviderConnection({
        provider,
        model,
        apiKey,
        baseUrl,
        command,
      })

      setTestResults((prev) => ({ ...prev, [provider]: res }))
      if (res.success) {
        showToast(`${res.message} (${res.latencyMs}ms)`)
      } else {
        showToast(res.error || res.message)
      }
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [provider]: {
          success: false,
          provider,
          latencyMs: 0,
          message: "Connection failed",
          error: err?.message,
        },
      }))
      showToast("Connection test failed")
    } finally {
      setTesting((prev) => ({ ...prev, [provider]: false }))
    }
  }

  function getStatusBadge(provider: ChatProvider) {
    const isTestLoading = testing[provider]
    const result = testResults[provider]

    if (isTestLoading) {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-accent/15 text-accent border border-accent/30">
          <span className="inline-block w-2.5 h-2.5 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <span>Verifying...</span>
        </span>
      )
    }

    if (result) {
      return result.success ? (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
          <Icon name="check" size={11} />
          <span>Connected ({result.latencyMs}ms)</span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/30">
          <Icon name="error" size={11} />
          <span>Connection Failed</span>
        </span>
      )
    }

    // Default configuration status
    if (provider === "antigravity") {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-accent/10 text-accent border border-accent/20">
          <Icon name="sparkle" size={11} />
          <span>OAuth CLI Ready</span>
        </span>
      )
    }

    const key = settings?.agent?.providerKeys?.[provider]
    if (key && key.trim().length > 0) {
      return (
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">
          <Icon name="check" size={11} />
          <span>Configured</span>
        </span>
      )
    }

    return (
      <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-canvas border border-line text-ink-muted">
        <span>Not Configured</span>
      </span>
    )
  }

  function handleAddCustomProvider() {
    const cleanName = customName.trim()
    const cleanUrl = customBaseUrl.trim()
    if (!cleanName || !cleanUrl) {
      showToast("Please provide provider name and Base URL")
      return
    }

    updateAgentSettings?.((prev) => ({
      ...prev,
      providerBaseUrls: {
        ...prev.providerBaseUrls,
        [cleanName.toLowerCase()]: cleanUrl,
      },
      providerKeys: {
        ...prev.providerKeys,
        ...(customKey.trim()
          ? { [cleanName.toLowerCase()]: customKey.trim() }
          : {}),
      },
    }))

    showToast(`Added custom provider: ${cleanName}`)
    setCustomName("")
    setCustomBaseUrl("")
    setCustomKey("")
    setIsAddingCustom(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Overview Banner */}
      <div className="rounded-lg border border-line bg-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-semibold text-ink flex items-center gap-2">
            <Icon name="settings" size={14} className="text-accent" />
            <span>BYOK (Bring Your Own Key) & Provider Credentials</span>
          </h3>
          <p className="text-[11px] text-ink-muted mt-0.5">
            Configure your upstream LLM credentials, local CLI bridges, and
            custom OpenAI-compatible endpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsAddingCustom((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-line bg-canvas hover:bg-surface-raised text-ink transition-colors cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <Icon name="plus" size={12} className="text-accent" />
          <span>{isAddingCustom ? "Cancel" : "Add Custom Provider"}</span>
        </button>
      </div>

      {/* Add Custom Provider Expandable Drawer */}
      {isAddingCustom && (
        <div className="rounded-lg border border-accent/40 bg-surface p-4 flex flex-col gap-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between border-b border-line pb-2">
            <span className="text-xs font-semibold text-ink">
              Add OpenAI-Compatible Provider (e.g. Ollama, LM Studio, vLLM,
              Groq)
            </span>
            <span className="text-[10px] text-ink-muted">
              BYOK Dynamic Endpoint
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                Provider Name
              </label>
              <input
                type="text"
                placeholder="e.g. Ollama, Groq, LocalAI"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                Base URL (OpenAI /v1)
              </label>
              <input
                type="text"
                placeholder="http://localhost:11434/v1"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                API Key / Bearer Token (Optional)
              </label>
              <input
                type="password"
                placeholder="Optional API key..."
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAddingCustom(false)}
              className="px-3 py-1 rounded text-xs text-ink-muted hover:text-ink cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddCustomProvider}
              className="px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
            >
              <Icon name="check" size={12} />
              <span>Save Provider</span>
            </button>
          </div>
        </div>
      )}

      {/* Standard Provider Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. Antigravity */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col justify-between gap-3 transition-colors hover:border-line-active">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line/60">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-accent/15 text-accent border border-accent/30 font-mono">
                  AGY
                </span>
                <span className="text-xs font-semibold text-ink">
                  Google Antigravity
                </span>
              </div>
              {getStatusBadge("antigravity")}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                Command / Binary Path
              </label>
              <input
                type="text"
                className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
                value={
                  settings?.agent?.bypassCommands?.antigravity ?? "antigravity"
                }
                placeholder="antigravity"
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

            <div className="flex items-start gap-2 p-2 rounded bg-canvas border border-line/50 text-[11px] text-ink-muted">
              <Icon
                name="sparkle"
                size={13}
                className="text-accent shrink-0 mt-0.5"
              />
              <span>
                Credentials and agent memory are automatically detected from{" "}
                <code className="text-ink font-mono text-[10px]">
                  ~/.gemini/antigravity-cli
                </code>
                . Run{" "}
                <code className="text-ink font-mono text-[10px]">agy</code> in
                your terminal to authenticate via Google OAuth.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-line/40">
            <button
              type="button"
              disabled={testing["antigravity"]}
              onClick={() => void handleTest("antigravity")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border border-line bg-canvas hover:bg-surface-raised text-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              <Icon
                name="refresh"
                size={11}
                className={testing["antigravity"] ? "animate-spin" : ""}
              />
              <span>
                {testing["antigravity"] ? "Testing..." : "Test CLI Bridge"}
              </span>
            </button>
          </div>
        </div>

        {/* 2. Anthropic Claude */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col justify-between gap-3 transition-colors hover:border-line-active">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line/60">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                  CLD
                </span>
                <span className="text-xs font-semibold text-ink">
                  Anthropic Claude
                </span>
              </div>
              {getStatusBadge("claude")}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                API Key
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword["claude"] ? "text" : "password"}
                  className="w-full h-8 px-2.5 pr-14 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
                  value={settings?.agent?.providerKeys?.claude ?? ""}
                  placeholder="sk-ant-api03-..."
                  onChange={(e) =>
                    updateAgentSettings?.((prev) => ({
                      ...prev,
                      providerKeys: {
                        ...prev.providerKeys,
                        claude: e.target.value,
                      },
                    }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowPassword((p) => ({ ...p, claude: !p.claude }))
                  }
                  className="absolute right-2 text-[10px] text-ink-muted hover:text-ink cursor-pointer select-none"
                >
                  {showPassword["claude"] ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                Base URL (Optional Gateway / Proxy)
              </label>
              <input
                type="text"
                className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
                value={
                  settings?.agent?.providerBaseUrls?.claude ??
                  "https://api.anthropic.com/v1"
                }
                placeholder="https://api.anthropic.com/v1"
                onChange={(e) =>
                  updateAgentSettings?.((prev) => ({
                    ...prev,
                    providerBaseUrls: {
                      ...prev.providerBaseUrls,
                      claude: e.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-line/40">
            <button
              type="button"
              disabled={testing["claude"]}
              onClick={() => void handleTest("claude")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border border-line bg-canvas hover:bg-surface-raised text-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              <Icon
                name="refresh"
                size={11}
                className={testing["claude"] ? "animate-spin" : ""}
              />
              <span>{testing["claude"] ? "Testing..." : "Verify & Test"}</span>
            </button>
          </div>
        </div>

        {/* 3. OpenCode */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col justify-between gap-3 transition-colors hover:border-line-active">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line/60">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                  OC
                </span>
                <span className="text-xs font-semibold text-ink">
                  OpenCode Gateway
                </span>
              </div>
              {getStatusBadge("opencode")}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                API Key
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword["opencode"] ? "text" : "password"}
                  className="w-full h-8 px-2.5 pr-14 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
                  value={settings?.agent?.providerKeys?.opencode ?? ""}
                  placeholder="Enter OpenCode API key..."
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
                  onClick={() =>
                    setShowPassword((p) => ({ ...p, opencode: !p.opencode }))
                  }
                  className="absolute right-2 text-[10px] text-ink-muted hover:text-ink cursor-pointer select-none"
                >
                  {showPassword["opencode"] ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                Base URL
              </label>
              <input
                type="text"
                className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
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
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-line/40">
            <button
              type="button"
              disabled={testing["opencode"]}
              onClick={() => void handleTest("opencode")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border border-line bg-canvas hover:bg-surface-raised text-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              <Icon
                name="refresh"
                size={11}
                className={testing["opencode"] ? "animate-spin" : ""}
              />
              <span>
                {testing["opencode"] ? "Testing..." : "Verify & Test"}
              </span>
            </button>
          </div>
        </div>

        {/* 4. OpenRouter */}
        <div className="rounded-lg border border-line bg-surface p-4 flex flex-col justify-between gap-3 transition-colors hover:border-line-active">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line/60">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 font-mono">
                  OR
                </span>
                <span className="text-xs font-semibold text-ink">
                  OpenRouter (Multi-Model)
                </span>
              </div>
              {getStatusBadge("openrouter")}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-ink-muted">
                API Key
              </label>
              <div className="relative flex items-center">
                <input
                  type={showPassword["openrouter"] ? "text" : "password"}
                  className="w-full h-8 px-2.5 pr-14 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
                  value={settings?.agent?.providerKeys?.openrouter ?? ""}
                  placeholder="sk-or-v1-..."
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
                  onClick={() =>
                    setShowPassword((p) => ({
                      ...p,
                      openrouter: !p.openrouter,
                    }))
                  }
                  className="absolute right-2 text-[10px] text-ink-muted hover:text-ink cursor-pointer select-none"
                >
                  {showPassword["openrouter"] ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <p className="text-[11px] text-ink-muted">
              Connects to 300+ models via OpenRouter gateway (DeepSeek R1, Llama
              3.3, Claude, GPT-4o, Mistral).
            </p>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-line/40">
            <button
              type="button"
              disabled={testing["openrouter"]}
              onClick={() => void handleTest("openrouter")}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium border border-line bg-canvas hover:bg-surface-raised text-ink transition-colors cursor-pointer disabled:opacity-50"
            >
              <Icon
                name="refresh"
                size={11}
                className={testing["openrouter"] ? "animate-spin" : ""}
              />
              <span>
                {testing["openrouter"] ? "Testing..." : "Verify & Test"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
