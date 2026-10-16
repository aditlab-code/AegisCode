import { useState } from "react"
import { Icon } from "../../ui/Icon"
import type { AppSettings, AgentSettings } from "../../../types/workbench"
import { useWorkbenchStore } from "../../../store"
import { AIProvidersCard } from "./AIProvidersCard"
import { AIModelsTable } from "./AIModelsTable"
import { AgentRulesCard } from "./AgentRulesCard"

interface AISettingsPaneProps {
  settings?: AppSettings
  updateAgentSettings?: (
    patch: Partial<AgentSettings> | ((prev: AgentSettings) => AgentSettings),
  ) => void
  showToast: (msg: string) => void
}

type AISubTab = "providers" | "models" | "rules" | "runtime"

export function AISettingsPane({
  settings,
  updateAgentSettings,
  showToast,
}: AISettingsPaneProps) {
  const [activeSubTab, setActiveSubTab] = useState<AISubTab>("providers")

  const subTabs = [
    {
      id: "providers" as const,
      label: "Providers (BYOK)",
      icon: "cloud",
      desc: "API keys & upstream credentials",
    },
    {
      id: "models" as const,
      label: "Models & Registry",
      icon: "table",
      desc: "Active model list & connection latency",
    },
    {
      id: "rules" as const,
      label: "Agent Rules & Persona",
      icon: "edit",
      desc: "AGENTS.md workspace directives & persona",
    },
    {
      id: "runtime" as const,
      label: "Runtime & Guardrails",
      icon: "settings",
      desc: "Execution permissions, streaming & context",
    },
  ]

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Sub-Tab Navigation Header */}
      <div className="flex items-center gap-1.5 border-b border-line pb-2.5 overflow-x-auto">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveSubTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              activeSubTab === t.id
                ? "bg-accent text-white shadow-sm"
                : "bg-surface border border-line text-ink-muted hover:text-ink hover:bg-surface-raised"
            }`}
          >
            <Icon name={t.icon} size={13} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Sub-Tab 1: Providers (BYOK) */}
      {activeSubTab === "providers" && (
        <AIProvidersCard
          settings={settings}
          updateAgentSettings={updateAgentSettings}
          showToast={showToast}
        />
      )}

      {/* Sub-Tab 2: Models & Registry */}
      {activeSubTab === "models" && (
        <AIModelsTable
          settings={settings}
          updateAgentSettings={updateAgentSettings}
          showToast={showToast}
        />
      )}

      {/* Sub-Tab 3: Workspace Rules & Persona (AGENTS.md) */}
      {activeSubTab === "rules" && (
        <div className="flex flex-col gap-3">
          <AgentRulesCard />
        </div>
      )}

      {/* Sub-Tab 4: Runtime & Guardrails */}
      {activeSubTab === "runtime" && (
        <div className="flex flex-col gap-4">
          {/* Engine Parameters */}
          <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line/60">
              <div className="flex items-center gap-2">
                <Icon name="sparkle" size={14} className="text-accent" />
                <span className="text-xs font-semibold text-ink">
                  AI Engine Parameters
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-ink-muted">
                  Creativity Temperature
                </label>
                <select
                  aria-label="Creativity Temperature"
                  className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink focus:border-accent focus:outline-none"
                  value={String(settings?.agent?.temperature ?? "0.7")}
                  onChange={(e) => {
                    const v = Number(e.target.value) || 0.7
                    updateAgentSettings?.({ temperature: v })
                    showToast(`Agent temperature set to ${v}`)
                  }}
                >
                  <option value="0.2">0.2 - Strict & Precise</option>
                  <option value="0.7">0.7 - Balanced Coding</option>
                  <option value="1.0">1.0 - Creative</option>
                </select>
                <span className="text-[10px] text-ink-muted">
                  Controls output randomness. Lower values are better for
                  deterministic code fixes.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-ink-muted">
                  Token Streaming
                </label>
                <label className="flex items-center gap-2 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-line text-accent focus:ring-accent"
                    checked={settings?.agent?.streaming ?? true}
                    onChange={(e) => {
                      updateAgentSettings?.({ streaming: e.target.checked })
                      showToast(
                        `Agent streaming ${
                          e.target.checked ? "enabled" : "disabled"
                        }`,
                      )
                    }}
                  />
                  <span className="text-xs text-ink">
                    {settings?.agent?.streaming
                      ? "Enabled (Live tokens)"
                      : "Disabled (Block)"}
                  </span>
                </label>
                <span className="text-[10px] text-ink-muted">
                  Streams LLM tokens live into the chat panel in real-time.
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium text-ink-muted">
                  Auto Context Ingestion
                </label>
                <label className="flex items-center gap-2 mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-line text-accent focus:ring-accent"
                    checked={settings?.agent?.contextIngestion ?? true}
                    onChange={(e) => {
                      updateAgentSettings?.({
                        contextIngestion: e.target.checked,
                      })
                      showToast(
                        `Auto context ${
                          e.target.checked ? "enabled" : "disabled"
                        }`,
                      )
                    }}
                  />
                  <span className="text-xs text-ink">
                    {settings?.agent?.contextIngestion
                      ? "Enabled (Active buffer & selection)"
                      : "Disabled"}
                  </span>
                </label>
                <span className="text-[10px] text-ink-muted">
                  Automatically shares cursor position and active file buffer
                  with code agents.
                </span>
              </div>
            </div>
          </div>

          {/* Terminal & Agent Security Guardrails */}
          <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line/60">
              <div className="flex items-center gap-2">
                <Icon name="terminal" size={14} className="text-accent" />
                <span className="text-xs font-semibold text-ink">
                  Agent Execution Permissions & Terminal Guardrails
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Safe Mode Active
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="p-3 rounded bg-canvas border border-line text-xs flex flex-col gap-1">
                <span className="font-semibold text-ink">
                  Execution Safety Policy
                </span>
                <p className="text-[11px] text-ink-muted">
                  Aegis Code enforces strict terminal guardrails by default.
                  Autonomous agents run inspected shell invocations with
                  mandatory error breaking and token killer (RTK) compression.
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
                    <input type="radio" name="execPolicy" defaultChecked />
                    <span>
                      Smart Safe (Auto-run read commands, confirm on write/kill)
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
                    <input type="radio" name="execPolicy" />
                    <span>Strict (Ask confirmation for every command)</span>
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 mt-1">
                <label className="text-[11px] font-medium text-ink-muted">
                  Sensitive File Ignore Patterns (Context Exclusions)
                </label>
                <input
                  type="text"
                  readOnly
                  className="h-8 px-2.5 rounded border border-line bg-canvas text-xs text-ink font-mono"
                  value=".env*, *.pem, id_rsa*, credentials.json, secrets/**"
                />
                <span className="text-[10px] text-ink-muted">
                  Files matching these glob patterns will never be ingested or
                  sent to upstream LLM providers.
                </span>
              </div>
            </div>
          </div>

          {/* Workspace Copilot Setup & Ledger Card */}
          <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-line/60">
              <div className="flex items-center gap-2">
                <Icon name="aegis" size={14} className="text-accent" />
                <span className="text-xs font-semibold text-ink">
                  Aegis Copilot Workspace Setup
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  useWorkbenchStore.getState().openCopilotInitModal()
                }}
                className="px-2.5 py-1 rounded bg-accent text-accent-contrast text-[11px] font-medium hover:opacity-90 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <Icon name="zap" size={11} />
                <span>Configure .aegis/</span>
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-ink-muted leading-relaxed">
                Aegis Copilot coordinates autonomous multi-wave tasks,
                specifications (0-spec.md), execution plans (0-plan.md), and
                chain-of-thought logs (0-log.md) inside your workspace.
              </p>
              <div className="p-3 rounded bg-canvas border border-line text-xs flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="font-medium text-ink">
                    Workspace Initialization Status
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    {useWorkbenchStore.getState().isCopilotInitialized
                      ? "Initialized (.aegis/ active)"
                      : "Uninitialized (Setup recommended)"}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                    useWorkbenchStore.getState().isCopilotInitialized
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  }`}
                >
                  {useWorkbenchStore.getState().isCopilotInitialized
                    ? "Ready"
                    : "Not Initialized"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
