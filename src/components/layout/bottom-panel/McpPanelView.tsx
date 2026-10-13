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
  get_file_outline: JSON.stringify({ rel_path: "main.go" }, null, 2),
  get_symbol_definition: JSON.stringify(
    { symbol_name: "main", file_hint: "" },
    null,
    2,
  ),
  find_callers: JSON.stringify({ function_name: "main", limit: 10 }, null, 2),
  find_callees: JSON.stringify({ function_name: "main", limit: 10 }, null, 2),
  query_subgraph: JSON.stringify({ root_symbol: "main", depth: 1 }, null, 2),
  read_symbol_body: JSON.stringify(
    { symbol_name: "main", rel_path: "main.go" },
    null,
    2,
  ),
  get_diff_impact: JSON.stringify({ staged: false }, null, 2),
}

export function McpPanelView() {
  const {
    openFileInPane,
    openFileInGroup,
    splitEditor,
    toggleSplitEditor,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      openFileInPane: s.openFileInPane,
      openFileInGroup: s.openFileInGroup,
      splitEditor: s.splitEditor,
      toggleSplitEditor: s.toggleSplitEditor,
      showToast: s.showToast,
    })),
  )

  const [status, setStatus] = useState<GraphStatus | null>(null)
  const [tools, setTools] = useState<McpToolDefinition[]>([])
  const [loading, setLoading] = useState(true)
  const [reindexing, setReindexing] = useState(false)

  // Tool tester state
  const [selectedTool, setSelectedTool] = useState("get_file_outline")
  const [argsText, setArgsText] = useState(
    TOOL_DEFAULTS.get_file_outline || "{}",
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

  async function handleRunTool() {
    setRunning(true)
    setToolOutput(null)
    try {
      let parsedArgs: Record<string, unknown> = {}
      if (argsText.trim()) {
        parsedArgs = JSON.parse(argsText)
      }
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
          <span className="text-ink-muted text-[11px]">
            DB:{" "}
            {status?.dbPath
              ? status.dbPath.replace(/^.*(?=\.aegis)/, "~/")
              : "Standby"}
          </span>
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

      {/* Main Content: Split Diagnostics & Tool Tester */}
      <div className="flex flex-1 min-h-0 divide-x divide-line">
        {/* Left: Engine Status & Metrics */}
        <div className="w-80 flex flex-col p-4 gap-4 overflow-y-auto shrink-0 bg-canvas/20">
          <div>
            <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2">
              Indexing Metrics
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-surface border border-line">
                <div className="text-base font-bold text-ink">
                  {status?.totalFiles ?? status?.indexedFiles ?? 0}
                </div>
                <div className="text-[10px] text-ink-muted">Files</div>
              </div>
              <div className="p-2 rounded bg-surface border border-line">
                <div className="text-base font-bold text-ink">
                  {status?.totalSymbols ?? 0}
                </div>
                <div className="text-[10px] text-ink-muted">Symbols</div>
              </div>
              <div className="p-2 rounded bg-surface border border-line">
                <div className="text-base font-bold text-ink">
                  {status?.totalEdges ?? 0}
                </div>
                <div className="text-[10px] text-ink-muted">Edges</div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider mb-2">
              Available Tools ({tools.length})
            </div>
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {tools.map((t) => (
                <button
                  className={`w-full text-left p-2 rounded border transition-colors cursor-pointer ${
                    selectedTool === t.name
                      ? "bg-accent/10 border-accent text-accent font-medium"
                      : "bg-surface border-line hover:border-line-strong text-ink"
                  }`}
                  key={t.name}
                  onClick={() => handleToolSelect(t.name)}
                  type="button"
                >
                  <div className="font-mono text-[11px]">{t.name}</div>
                  <div className="text-[10px] text-ink-muted line-clamp-1 mt-0.5">
                    {t.description}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Interactive MCP Tool Tester */}
        <div className="flex flex-col flex-1 min-w-0 p-4 gap-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">Tool Tester:</span>
              <span className="font-mono text-accent font-semibold px-2 py-0.5 rounded bg-accent/10 border border-accent/20">
                {selectedTool}
              </span>
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
