import { useState, useEffect, useCallback } from "react"
import { Icon } from "../../ui/Icon"
import {
  fetchAgentRulesStatus,
  initAgentRules,
  type AgentRulesStatus,
  type PersonaPreset,
} from "../../../utils/agentApi"
import { useWorkbenchStore } from "../../../store"

export function AgentRulesCard() {
  const [status, setStatus] = useState<AgentRulesStatus | null>(null)
  const [selectedPresetId, setSelectedPresetId] = useState<string>("kanna")
  const [editorContent, setEditorContent] = useState<string>("")
  const [lastLoadedPresetId, setLastLoadedPresetId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const showToast = useWorkbenchStore((s) => s.showToast)
  const openFileInGroup = useWorkbenchStore((s) => s.openFileInGroup)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchAgentRulesStatus()
      setStatus(data)
      if (data.activePersona && data.activePersona !== "custom") {
        setSelectedPresetId(data.activePersona)
      } else if (data.presets.length > 0 && !selectedPresetId) {
        setSelectedPresetId(data.presets[0].id)
      }
    } catch {
      // Offline or mock fallback
    } finally {
      setLoading(false)
    }
  }, [selectedPresetId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  const selectedPreset: PersonaPreset | undefined =
    status?.presets.find((p) => p.id === selectedPresetId) || status?.presets[0]

  useEffect(() => {
    if (selectedPreset && selectedPreset.id !== lastLoadedPresetId) {
      setEditorContent(selectedPreset.templateContent)
      setLastLoadedPresetId(selectedPreset.id)
    }
  }, [selectedPreset, lastLoadedPresetId])

  const isModified = Boolean(
    selectedPreset && editorContent !== selectedPreset.templateContent,
  )

  function handleReset() {
    if (selectedPreset) {
      setEditorContent(selectedPreset.templateContent)
      showToast("Template reset to preset default", "info")
    }
  }

  async function handleCopy() {
    if (!editorContent) return
    try {
      await navigator.clipboard.writeText(editorContent)
      showToast("Template copied to clipboard", "info")
    } catch {
      showToast("Failed to copy template", "error")
    }
  }

  async function handleCreateInWorkspace() {
    setActionLoading(true)
    try {
      const res = await initAgentRules(selectedPresetId, editorContent)
      if (res.success) {
        showToast("AGENTS.md saved to workspace root", "info")
        await loadStatus()
        openFileInGroup("AGENTS.md")
      }
    } catch (err: any) {
      showToast(err.message || "Failed to save AGENTS.md", "error")
    } finally {
      setActionLoading(false)
    }
  }

  function handleOpenEditor() {
    openFileInGroup("AGENTS.md")
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4 flex flex-col gap-3">
      {/* Header & Status Indicator */}
      <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2">
          <Icon name="aegis" size={18} className="text-accent" />
          <div>
            <h4 className="text-xs font-semibold text-ink">
              Workspace Rules & Persona (AGENTS.md)
            </h4>
            <p className="text-[11px] text-muted">
              Configure autonomous orchestrator directives, conventions, and
              persona presets.
            </p>
          </div>
        </div>

        {/* Live Status Badge */}
        {status?.hasWorkspaceRules ? (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
            <Icon name="check" size={12} />
            Active (
            {status.activePersona === "custom"
              ? "Custom Rules"
              : `${status.activePersona.toUpperCase()} Persona`}
            )
          </span>
        ) : (
          <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface-hover px-2.5 py-0.5 text-[11px] font-medium text-muted">
            <Icon name="sparkle" size={12} />
            Using Built-in Defaults
          </span>
        )}
      </div>

      {/* Preset Selector Dropdown */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-muted">
          Select Persona Preset:
        </label>
        <div className="relative max-w-xs">
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="w-full appearance-none rounded-md border border-line bg-surface-hover px-3 py-1.5 pr-8 text-xs text-ink transition-colors focus:border-accent focus:outline-none cursor-pointer"
            aria-label="Persona Preset"
          >
            {status?.presets.map((preset) => (
              <option
                key={preset.id}
                value={preset.id}
                className="bg-surface text-ink"
              >
                {preset.name}
              </option>
            ))}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted">
            <Icon name="chevron-down" size={12} />
          </div>
        </div>
        {selectedPreset && (
          <p className="text-[11px] text-muted italic mt-0.5">
            {selectedPreset.description}
          </p>
        )}
      </div>

      {/* Editable Markdown Preview Box */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] text-muted">
          <div className="flex items-center gap-2">
            <span>Template Preview & Customization:</span>
            {isModified && (
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                Modified
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isModified && (
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1 text-[11px] text-accent hover:underline cursor-pointer"
                title="Reset to preset default"
              >
                <Icon name="history" size={12} />
                Reset
              </button>
            )}
            <span>Markdown</span>
          </div>
        </div>
        <textarea
          value={editorContent}
          onChange={(e) => setEditorContent(e.target.value)}
          rows={9}
          disabled={loading}
          placeholder={
            loading ? "Loading presets..." : "No template content available"
          }
          className="w-full rounded-md border border-line bg-canvas p-2.5 font-mono text-[11px] text-ink leading-relaxed resize-y focus:outline-none focus:border-accent transition-colors selection:bg-accent/20"
          aria-label="Editable Template Markdown"
          spellCheck={false}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-2 pt-1 border-t border-line">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface-hover px-3 py-1.5 text-xs text-ink transition-colors hover:bg-surface-active cursor-pointer"
        >
          <Icon name="copy" size={14} />
          Copy Template
        </button>

        {status?.hasWorkspaceRules ? (
          <div className="flex items-center gap-2">
            {isModified && (
              <button
                type="button"
                onClick={handleCreateInWorkspace}
                disabled={actionLoading}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                <Icon name="check" size={14} />
                {actionLoading ? "Saving..." : "Save to AGENTS.md"}
              </button>
            )}
            <button
              type="button"
              onClick={handleOpenEditor}
              className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 shadow-sm cursor-pointer"
            >
              <Icon name="edit" size={14} />
              Open AGENTS.md in Editor
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCreateInWorkspace}
            disabled={actionLoading}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            <Icon name="plus" size={14} />
            {actionLoading ? "Creating..." : "Create AGENTS.md in Workspace"}
          </button>
        )}
      </div>
    </div>
  )
}
