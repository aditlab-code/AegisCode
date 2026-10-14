import { useState, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  fetchCodeGraphStatus,
  fetchMcpTools,
  triggerCodeGraphReindex,
  callMcpTool,
  extractCodeGraphTraceTargets,
  type GraphStatus,
  type McpToolDefinition,
} from "../../../utils/codegraphApi"
import type { AiTraceState } from "../../../store/types"

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
  const {
    openFileInPane,
    openFileInGroup,
    splitEditor,
    toggleSplitEditor,
    showToast,
    aiTrace,
    aiTraceHistory,
    triggerAiTrace,
    clearAiTrace,
  } = useWorkbenchStore(
    useShallow((s) => ({
      openFileInPane: s.openFileInPane,
      openFileInGroup: s.openFileInGroup,
      splitEditor: s.splitEditor,
      toggleSplitEditor: s.toggleSplitEditor,
      showToast: s.showToast,
      aiTrace: s.aiTrace,
      aiTraceHistory: s.aiTraceHistory,
      triggerAiTrace: s.triggerAiTrace,
      clearAiTrace: s.clearAiTrace,
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

  function handleToolSelect(name: string) {
    setSelectedTool(name)
    setArgsText(TOOL_DEFAULTS[name] || "{}")
    setToolOutput(null)
  }

  async function handleReindex() {
    setReindexing(true)
    showToast("Reindexing CodeGraph...")
    const ok = await triggerCodeGraphReindex()
    if (ok) {
      showToast("CodeGraph reindexed successfully")
      await loadData()
    } else {
      showToast("CodeGraph reindex failed")
    }
    setReindexing(false)
  }

  function handleOpenGraphCurrent() {
    openFileInPane("codegraph:workspace")
  }

  function handleOpenGraphSplit() {
    if (!splitEditor) {
      toggleSplitEditor()
    }
    openFileInGroup("codegraph:workspace", "group2")
  }

  function handleJumpToTrace(item: AiTraceState) {
    if (!splitEditor) {
      toggleSplitEditor()
    }
    const graphTab = item.filePath
      ? `codegraph:${item.filePath}`
      : "codegraph:workspace"
    openFileInGroup(graphTab, "group2")
    triggerAiTrace({
      ...item,
      status: "running",
    })
    showToast(
      `Focused CodeGraph on ${item.symbols.join(", ") || item.symbolName}`,
    )
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

    const traceInfo = extractCodeGraphTraceTargets(selectedTool, parsedArgs)
    const traceSymbols =
      traceInfo.symbols.length > 0
        ? traceInfo.symbols
        : traceInfo.primarySymbol
          ? [traceInfo.primarySymbol]
          : []

    if (traceSymbols.length > 0) {
      triggerAiTrace({
        symbols: traceSymbols,
        symbolName: traceInfo.primarySymbol || traceSymbols[0],
        rawQuery: traceInfo.rawQuery,
        filePath: traceInfo.filePath,
        toolName: traceInfo.cleanToolName,
        status: "running",
      })
    }

    try {
      const result = await callMcpTool(selectedTool, parsedArgs)
      setToolOutput(JSON.stringify(result, null, 2))

      if (traceSymbols.length > 0) {
        triggerAiTrace({
          symbols: traceSymbols,
          symbolName: traceInfo.primarySymbol || traceSymbols[0],
          rawQuery: traceInfo.rawQuery,
          filePath: traceInfo.filePath,
          toolName: traceInfo.cleanToolName,
          status: "completed",
        })
      }
    } catch (err: unknown) {
      if (traceSymbols.length > 0) {
        triggerAiTrace({
          symbols: traceSymbols,
          symbolName: traceInfo.primarySymbol || traceSymbols[0],
          rawQuery: traceInfo.rawQuery,
          filePath: traceInfo.filePath,
          toolName: traceInfo.cleanToolName,
          status: "error",
        })
      }
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

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden bg-surface text-ink text-xs select-text">
      {/* Top Banner / Server Info */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-line bg-canvas/40">
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-accent text-accent-contrast font-medium hover:opacity-90 cursor-pointer transition-opacity text-[11px]"
            onClick={handleOpenGraphSplit}
            type="button"
          >
            <Icon name="split" size={12} />
            <span>Open Side-by-Side</span>
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

      {/* Main Content: Split Live Trace Log & Tool Tester */}
      <div className="flex flex-1 min-h-0 divide-x divide-line">
        {/* Left: Live AI Trace Log + Diagnostics */}
        <div className="w-88 sm:w-96 flex flex-col p-3 gap-2.5 overflow-hidden shrink-0 bg-canvas/30 border-r border-line">
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink uppercase tracking-wider">
                Live AI Traces
              </span>
              <span className="px-1.5 py-0.2 rounded-full bg-accent/15 text-accent text-[10px] font-mono font-medium">
                {aiTraceHistory.length}
              </span>
              {aiTrace && (
                <span className="flex items-center gap-1 text-[10px] text-accent animate-pulse font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                  <span>Live</span>
                </span>
              )}
            </div>
            {aiTraceHistory.length > 0 && (
              <button
                className="text-[10px] text-ink-muted hover:text-ink cursor-pointer transition-colors"
                onClick={() => clearAiTrace()}
                type="button"
              >
                Clear
              </button>
            )}
          </div>

          {/* Active Live Trace Card */}
          {aiTrace && (
            <div className="p-2.5 rounded bg-accent/10 border border-accent/30 flex flex-col gap-1.5 shrink-0 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      aiTrace.status === "completed"
                        ? "bg-emerald-500"
                        : aiTrace.status === "error"
                          ? "bg-red-500"
                          : "bg-pink-500 animate-ping"
                    }`}
                  />
                  <span className="font-mono uppercase text-[9px] px-1 py-0.2 rounded bg-surface border border-line text-accent font-semibold shrink-0">
                    {aiTrace.provider}
                  </span>
                  <span className="font-mono text-[10px] font-medium text-ink truncate">
                    {aiTrace.toolName}
                  </span>
                </div>
                <button
                  className="shrink-0 px-2 py-0.5 rounded bg-accent text-accent-contrast text-[10px] font-medium hover:opacity-90 cursor-pointer flex items-center gap-1"
                  onClick={() => handleJumpToTrace(aiTrace)}
                  title="Focus node in Split Graph"
                  type="button"
                >
                  <Icon name="zap" size={10} />
                  <span>Jump</span>
                </button>
              </div>
              <div
                className="text-[11px] font-mono text-ink font-semibold truncate select-all"
                title={aiTrace.symbols.join(", ") || aiTrace.symbolName}
              >
                {aiTrace.symbols.join(", ") || aiTrace.symbolName}
              </div>
            </div>
          )}

          {/* Trace History Feed */}
          <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto pr-1">
            {aiTraceHistory.length === 0 && !aiTrace ? (
              <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-ink-muted text-xs gap-1.5">
                <Icon className="text-ink-muted/50" name="zap" size={20} />
                <span className="font-medium text-ink">No AI Traces Yet</span>
                <span className="text-[11px] leading-relaxed text-ink-muted/80">
                  When an AI Provider queries CodeGraph MCP tools (e.g.{" "}
                  <code className="font-mono text-accent">
                    codegraph_explore
                  </code>
                  ), live traces will appear here with 1-click graph jumping.
                </span>
              </div>
            ) : (
              aiTraceHistory.map((item, idx) => (
                <div
                  className="p-2 rounded bg-surface border border-line hover:border-line-strong transition-colors flex flex-col gap-1 text-[11px]"
                  key={`${item.timestamp}-${idx}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          item.status === "completed"
                            ? "bg-emerald-500"
                            : item.status === "error"
                              ? "bg-red-500"
                              : "bg-accent animate-pulse"
                        }`}
                      />
                      <span className="font-mono uppercase text-[9px] px-1 py-0.2 rounded bg-canvas border border-line text-accent font-medium shrink-0">
                        {item.provider}
                      </span>
                      <span className="font-mono text-[10px] text-ink-muted truncate">
                        {item.toolName}
                      </span>
                    </div>
                    <button
                      className="shrink-0 px-1.5 py-0.5 rounded bg-canvas hover:bg-surface-raised border border-line text-accent text-[10px] cursor-pointer flex items-center gap-1"
                      onClick={() => handleJumpToTrace(item)}
                      title="Inspect node in GraphViewer"
                      type="button"
                    >
                      <Icon name="zap" size={9} />
                      <span>Jump</span>
                    </button>
                  </div>
                  <div
                    className="font-mono text-[10px] text-ink font-semibold truncate select-all"
                    title={item.symbols.join(", ") || item.symbolName}
                  >
                    {item.symbols.join(", ") || item.symbolName}
                  </div>
                  {item.filePath && (
                    <div className="text-[9.5px] text-ink-muted font-mono truncate">
                      {item.filePath}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Interactive MCP Tool Tester */}
        <div className="flex flex-col flex-1 min-w-0 p-4 gap-3 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">Tool Tester:</span>
              <select
                aria-label="Select MCP tool"
                className="font-mono text-xs text-ink bg-canvas border border-line rounded px-2 py-1 focus:border-accent focus:outline-none cursor-pointer"
                onChange={(e) => handleToolSelect(e.target.value)}
                value={selectedTool}
              >
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-accent text-accent-contrast font-medium hover:opacity-90 cursor-pointer transition-opacity"
              disabled={running}
              onClick={handleRunTool}
              type="button"
            >
              <Icon
                className={running ? "animate-spin" : ""}
                name={running ? "refresh" : "play"}
                size={12}
              />
              <span>Execute Tool</span>
            </button>
          </div>

          <div className="flex flex-1 min-h-0 gap-3">
            {/* Input Arguments */}
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[11px] font-medium text-ink-muted mb-1">
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
              <span className="text-[11px] font-medium text-ink-muted mb-1">
                Execution Result
              </span>
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
