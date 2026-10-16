import { useState, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  fetchCodeGraphStatus,
  fetchMcpTools,
  triggerCodeGraphReindex,
  callMcpTool,
  type GraphStatus,
  type McpToolDefinition,
} from "../../../utils/codegraphApi"

const TOOL_DEFAULTS: Record<string, string> = {
  codegraph_explore: JSON.stringify(
    { query: "StreamChat AntigravityEngine", maxFiles: 8 },
    null,
    2,
  ),
  codegraph_node: JSON.stringify(
    { symbol: "NewServer", includeCode: true },
    null,
    2,
  ),
  codegraph_search: JSON.stringify({ query: "Server", limit: 10 }, null, 2),
  codegraph_callers: JSON.stringify(
    { symbol: "NewServer", limit: 15 },
    null,
    2,
  ),
  codegraph_callees: JSON.stringify({ symbol: "main", limit: 15 }, null, 2),
  codegraph_impact: JSON.stringify({ symbol: "NewServer", depth: 2 }, null, 2),
}

export function McpPanelView() {
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

  // Tool tester state
  const [selectedTool, setSelectedTool] = useState("codegraph_explore")
  const [argsText, setArgsText] = useState(
    TOOL_DEFAULTS.codegraph_explore || "{}",
  )
  const [running, setRunning] = useState(false)
  const [toolOutput, setToolOutput] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function loadData(isMountedCheck?: () => boolean) {
    setLoading(true)
    try {
      const [st, tls] = await Promise.all([
        fetchCodeGraphStatus().catch(() => null),
        fetchMcpTools().catch(() => []),
      ])
      if (!isMountedCheck || isMountedCheck()) {
        setStatus(st)
        setTools(tls)
      }
    } catch {
      // Safe fallback
    } finally {
      if (!isMountedCheck || isMountedCheck()) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let mounted = true
    void loadData(() => mounted)
    return () => {
      mounted = false
    }
  }, [])

  function handleToolSelect(name: string) {
    setSelectedTool(name)
    setArgsText(TOOL_DEFAULTS[name] || "{}")
    setToolOutput(null)
  }

  function handleResetDefaultArgs() {
    setArgsText(TOOL_DEFAULTS[selectedTool] || "{}")
    showToast(`Reset arguments for ${selectedTool}`)
  }

  function handleFormatJson() {
    try {
      const parsed = JSON.parse(argsText)
      setArgsText(JSON.stringify(parsed, null, 2))
    } catch (err: unknown) {
      showToast(
        `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  function handleCopyOutput() {
    if (!toolOutput) return
    void navigator.clipboard.writeText(toolOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    showToast("Tool output copied to clipboard")
  }

  async function handleReindex() {
    setReindexing(true)
    showToast("Reindexing CodeGraph...")
    try {
      const ok = await triggerCodeGraphReindex()
      if (ok) {
        showToast("CodeGraph reindexed successfully")
        await loadData()
      } else {
        showToast("CodeGraph reindex failed")
      }
    } catch {
      showToast("CodeGraph reindex failed")
    } finally {
      setReindexing(false)
    }
  }

  function handleOpenGraphCurrent() {
    openFileInPane("codegraph:workspace")
  }

  async function handleRunTool() {
    setRunning(true)
    setToolOutput(null)
    let parsedArgs: Record<string, unknown> = {}
    try {
      if (argsText.trim()) {
        parsedArgs = JSON.parse(argsText)
      }
    } catch (err: unknown) {
      setToolOutput(
        JSON.stringify(
          {
            error: `Invalid JSON arguments: ${
              err instanceof Error ? err.message : String(err)
            }`,
          },
          null,
          2,
        ),
      )
      setRunning(false)
      return
    }

    try {
      const result = await callMcpTool(selectedTool, parsedArgs)
      setToolOutput(JSON.stringify(result, null, 2))
    } catch (err: unknown) {
      setToolOutput(
        JSON.stringify(
          { error: err instanceof Error ? err.message : String(err) },
          null,
          2,
        ),
      )
    } finally {
      setRunning(false)
    }
  }

  const dbDisplay = status?.dbPath
    ? status.dbPath.replace(/^.*(?=\.(aegis|codegraph))/, "")
    : "Standby"

  const selectedToolDef = tools.find((t) => t.name === selectedTool)

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-surface text-ink text-xs select-text">
      {/* Top Banner / Server Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-line bg-canvas/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-medium">
            <Icon className="text-accent" name="zap" size={14} />
            <span>MCP CodeGraph Server</span>
          </div>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-accent/10 text-accent font-mono border border-accent/20">
            Protocol 2024-11-05
          </span>
          <span className="text-ink-muted text-[11px] font-mono">
            DB: {dbDisplay}
          </span>
          <div className="hidden sm:flex items-center gap-2.5 text-[10px] text-ink-muted border-l border-line pl-3">
            <span>
              Files:{" "}
              <strong className="text-ink">
                {status?.totalFiles ?? status?.indexedFiles ?? 0}
              </strong>
            </span>
            <span>
              Symbols:{" "}
              <strong className="text-ink">{status?.totalSymbols ?? 0}</strong>
            </span>
            <span>
              Edges:{" "}
              <strong className="text-ink">{status?.totalEdges ?? 0}</strong>
            </span>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-canvas border border-line hover:border-accent text-ink cursor-pointer transition-colors text-[11px]"
            onClick={handleOpenGraphCurrent}
            type="button"
          >
            <Icon name="zap" size={12} />
            <span>Open Graph Tab</span>
          </button>
          <button
            className="flex items-center gap-1 px-2 py-1 rounded bg-canvas border border-line hover:bg-surface text-ink-muted hover:text-ink cursor-pointer transition-colors text-[11px]"
            disabled={loading || reindexing}
            onClick={handleReindex}
            title="Re-index workspace"
            type="button"
          >
            <Icon
              className={loading || reindexing ? "animate-spin" : ""}
              name="refresh"
              size={12}
            />
            <span>Reindex</span>
          </button>
        </div>
      </div>

      {/* Main Content: Interactive MCP Tool Playground */}
      <div className="flex flex-1 min-h-0 divide-x divide-line">
        {/* Left: Tool Catalog (w-56 sm:w-64) */}
        <div className="w-56 sm:w-64 flex flex-col p-2.5 gap-2 overflow-hidden shrink-0 bg-canvas/30 border-r border-line">
          <div className="flex items-center justify-between px-1 shrink-0">
            <span className="text-[11px] font-semibold text-ink uppercase tracking-wider">
              MCP Tools
            </span>
            <span className="px-1.5 py-0.2 rounded-full bg-accent/15 text-accent text-[10px] font-mono font-medium">
              {tools.length}
            </span>
          </div>

          <div className="flex-1 flex flex-col gap-1 overflow-y-auto pr-0.5">
            {tools.map((t) => {
              const isSelected = t.name === selectedTool
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => handleToolSelect(t.name)}
                  className={`text-left p-2 rounded border transition-colors flex flex-col gap-0.5 cursor-pointer ${
                    isSelected
                      ? "bg-surface border-accent/40 shadow-xs"
                      : "bg-surface/50 border-transparent hover:bg-surface hover:border-line"
                  }`}
                >
                  <div className="flex items-center gap-1.5 truncate">
                    <Icon
                      name="zap"
                      size={11}
                      className={isSelected ? "text-accent" : "text-ink-muted"}
                    />
                    <span
                      className={`font-mono text-[11px] truncate ${
                        isSelected ? "text-accent font-semibold" : "text-ink"
                      }`}
                    >
                      {t.name}
                    </span>
                  </div>
                  {t.description && (
                    <span className="text-[10px] text-ink-muted line-clamp-1 pl-4">
                      {t.description}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Right: Interactive MCP Tool Playground */}
        <div className="flex flex-col flex-1 min-w-0 p-3.5 gap-3 overflow-hidden bg-surface">
          {/* Work Area Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex flex-col gap-0.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-xs text-ink">
                  {selectedTool}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-accent/10 text-accent font-mono border border-accent/20">
                  Tool Tester
                </span>
              </div>
              {selectedToolDef?.description && (
                <p className="text-[11px] text-ink-muted line-clamp-1">
                  {selectedToolDef.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleFormatJson}
                className="px-2 py-1 rounded bg-canvas border border-line text-ink-muted hover:text-ink cursor-pointer text-[11px] transition-colors"
                title="Format JSON arguments"
              >
                Format
              </button>
              <button
                type="button"
                onClick={handleResetDefaultArgs}
                className="px-2 py-1 rounded bg-canvas border border-line text-ink-muted hover:text-ink cursor-pointer text-[11px] transition-colors"
                title="Reset arguments to default"
              >
                Reset
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-accent-contrast font-medium hover:opacity-90 cursor-pointer transition-opacity text-[11px]"
                disabled={running}
                onClick={handleRunTool}
                type="button"
              >
                <Icon
                  className={running ? "animate-spin" : ""}
                  name={running ? "refresh" : "play"}
                  size={12}
                />
                <span>{running ? "Executing..." : "Execute Tool"}</span>
              </button>
            </div>
          </div>

          {/* Split Panes: Arguments Input & Execution Result Output */}
          <div className="flex flex-1 min-h-0 gap-3">
            {/* Input Arguments */}
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                JSON Arguments
              </span>
              <textarea
                className="flex-1 w-full p-2.5 rounded bg-canvas border border-line focus:border-accent focus:outline-none font-mono text-[11px] text-ink resize-none leading-relaxed"
                onChange={(e) => setArgsText(e.target.value)}
                spellCheck={false}
                value={argsText}
              />
            </div>

            {/* Output Inspector */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                  Execution Result
                </span>
                {toolOutput && (
                  <button
                    type="button"
                    onClick={handleCopyOutput}
                    className="flex items-center gap-1 text-[10px] text-ink-muted hover:text-ink cursor-pointer transition-colors"
                  >
                    <Icon name={copied ? "check" : "copy"} size={10} />
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>
              <div className="flex-1 w-full p-2.5 rounded bg-canvas border border-line overflow-auto font-mono text-[11px] leading-relaxed text-ink select-text">
                {toolOutput ? (
                  <pre className="whitespace-pre-wrap">{toolOutput}</pre>
                ) : (
                  <span className="text-ink-muted italic">
                    Output will appear here after execution...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
