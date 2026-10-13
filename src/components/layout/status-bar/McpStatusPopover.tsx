import { useState, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  fetchCodeGraphStatus,
  fetchMcpTools,
  triggerCodeGraphReindex,
  type GraphStatus,
  type McpToolDefinition,
} from "../../../utils/codegraphApi"

interface McpStatusPopoverProps {
  onClose?: () => void
}

export function McpStatusPopover({ onClose }: McpStatusPopoverProps) {
  const { openFileInPane, showToast } = useWorkbenchStore(
    useShallow((s) => ({
      openFileInPane: s.openFileInPane,
      showToast: s.showToast,
    })),
  )

  const [status, setStatus] = useState<GraphStatus | null>(null)
  const [tools, setTools] = useState<McpToolDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [reindexing, setReindexing] = useState(false)
  const [toolsExpanded, setToolsExpanded] = useState(false)

  async function loadData() {
    setLoading(true)
    const [st, tls] = await Promise.all([
      fetchCodeGraphStatus(),
      fetchMcpTools(),
    ])
    setStatus(st)
    setTools(tls)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  async function handleReindex() {
    setReindexing(true)
    showToast("Starting CodeGraph reindexing...")
    const success = await triggerCodeGraphReindex()
    if (success) {
      showToast("CodeGraph reindexing complete")
      await loadData()
    } else {
      showToast("CodeGraph reindex failed")
    }
    setReindexing(false)
  }

  function handleOpenGraph() {
    openFileInPane("codegraph:workspace")
    onClose?.()
  }

  const isOnline = Boolean(status && status.totalFiles > 0)
  const dbDisplay = status?.dbPath
    ? status.dbPath.replace(/^.*(?=\.aegis)/, "~/")
    : status?.workspaceRoot
      ? "Active Workspace"
      : "No Workspace Loaded"

  return (
    <div className="status-popover mcp-popover flex flex-col max-h-[440px] w-80 text-xs shadow-xl border border-line bg-surface rounded-md overflow-hidden">
      <div className="status-popover-header flex items-center justify-between px-3 py-2 border-b border-line bg-canvas">
        <div className="flex items-center gap-1.5">
          <Icon className="text-accent" name="zap" size={13} />
          <span className="font-semibold text-ink-muted text-[10px] tracking-wider uppercase">
            MODEL CONTEXT PROTOCOL (MCP)
          </span>
        </div>
        <button
          className="text-ink-muted hover:text-ink cursor-pointer p-0.5 rounded transition-colors"
          onClick={loadData}
          title="Refresh MCP status"
          type="button"
        >
          <Icon
            className={loading ? "animate-spin" : ""}
            name="refresh"
            size={12}
          />
        </button>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        {/* Database Status & Path */}
        <div className="flex flex-col gap-1.5 p-2 rounded bg-canvas border border-line/60">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink-muted">
              Database Engine
            </span>
            <div className="flex items-center gap-1.5">
              <span
                className={`status-dot ${
                  isOnline ? "status-dot-online" : "status-dot-offline"
                }`}
              />
              <span className="text-[10px] text-ink-muted">
                {isOnline ? "Online (SQLite)" : "Standby"}
              </span>
            </div>
          </div>
          <div
            className="text-[10px] font-mono text-ink truncate select-all"
            title={status?.dbPath || ""}
          >
            {dbDisplay}
          </div>
        </div>

        {/* Indexing Metrics */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-canvas border border-line/60">
            <div className="text-sm font-semibold text-ink">
              {status?.totalFiles ?? 0}
            </div>
            <div className="text-[10px] text-ink-muted">Files</div>
          </div>
          <div className="p-2 rounded bg-canvas border border-line/60">
            <div className="text-sm font-semibold text-ink">
              {status?.totalSymbols ?? 0}
            </div>
            <div className="text-[10px] text-ink-muted">Symbols</div>
          </div>
          <div className="p-2 rounded bg-canvas border border-line/60">
            <div className="text-sm font-semibold text-ink">
              {status?.totalEdges ?? 0}
            </div>
            <div className="text-[10px] text-ink-muted">Edges</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-accent text-accent-contrast font-medium hover:opacity-90 transition-opacity cursor-pointer text-xs"
            onClick={handleOpenGraph}
            type="button"
          >
            <Icon name="zap" size={13} />
            <span>Open CodeGraph View</span>
          </button>
          <button
            className="flex items-center justify-center p-1.5 rounded border border-line hover:bg-canvas text-ink-muted hover:text-ink cursor-pointer transition-colors"
            disabled={reindexing}
            onClick={handleReindex}
            title="Re-index CodeGraph"
            type="button"
          >
            <Icon
              className={reindexing ? "animate-spin" : ""}
              name="refresh"
              size={13}
            />
          </button>
        </div>

        {/* Registered MCP Tools Accordion */}
        <div className="border-t border-line/60 pt-2">
          <button
            className="w-full flex items-center justify-between text-[11px] text-ink-muted hover:text-ink py-1 font-medium cursor-pointer"
            onClick={() => setToolsExpanded(!toolsExpanded)}
            type="button"
          >
            <span className="flex items-center gap-1">
              <span>Registered Tools</span>
              <span className="px-1.5 py-0.2 rounded-full bg-canvas text-[9px] border border-line">
                {tools.length}
              </span>
            </span>
            <Icon
              className={`transition-transform duration-200 ${
                toolsExpanded ? "rotate-90" : ""
              }`}
              name="chevron"
              size={11}
            />
          </button>

          {toolsExpanded && (
            <div className="mt-1 space-y-1 max-h-40 overflow-y-auto pr-1">
              {tools.map((t) => (
                <div
                  className="p-1.5 rounded bg-canvas border border-line/40 text-[10px]"
                  key={t.name}
                >
                  <div className="font-mono font-medium text-ink flex items-center justify-between">
                    <span>{t.name}</span>
                    <span className="text-[9px] text-ink-muted">MCP</span>
                  </div>
                  <div className="text-ink-muted text-[9px] mt-0.5 line-clamp-2">
                    {t.description}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
