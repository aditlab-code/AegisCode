import { useState, useEffect, useRef, useCallback } from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import { parseGraphTab, isGraphTab } from "./viewerTypes"
import {
  GraphToolbar,
  type LayoutMode,
  type ScopeMode,
} from "./codegraph/GraphToolbar"
import { GraphCanvas, type GraphCanvasHandle } from "./codegraph/GraphCanvas"
import { NodeInspector } from "./codegraph/NodeInspector"
import {
  fetchWorkspaceGraph,
  fetchActiveFileGraph,
  fetchSymbolNeighborhood,
  triggerCodeGraphReindex,
  searchGraphSymbols,
  type UIGraphPayload,
  type UIGraphNode,
} from "../../../../utils/codegraphApi"

interface GraphViewerProps {
  filename: string
  groupId: "group1" | "group2"
}

interface FocusSymbolDetail {
  symbolId?: number
  name?: string
  line?: number
}

interface AiTraceDetail {
  symbolName: string
  toolName?: string
  status?: string
}

export default function GraphViewer({ filename, groupId }: GraphViewerProps) {
  const {
    openFileInGroup,
    setCursorPosition,
    splitEditor,
    toggleSplitEditor,
    showToast,
    group1ActiveTab,
    group2ActiveTab,
  } = useWorkbenchStore(
    useShallow((s) => ({
      openFileInGroup: s.openFileInGroup,
      setCursorPosition: s.setCursorPosition,
      splitEditor: s.splitEditor,
      toggleSplitEditor: s.toggleSplitEditor,
      showToast: s.showToast,
      group1ActiveTab: s.group1.activeTab,
      group2ActiveTab: s.group2.activeTab,
    })),
  )

  const parsed = parseGraphTab(filename)

  const [scope, setScope] = useState<ScopeMode>(
    parsed.isWorkspace ? "macro" : "micro",
  )
  const [macroLimit, setMacroLimit] = useState<number>(50)
  const [microPath, setMicroPath] = useState<string | null>(
    parsed.target || null,
  )
  const [payload, setPayload] = useState<UIGraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [layout, setLayout] = useState<LayoutMode>("dagre")
  const [activeKinds, setActiveKinds] = useState<Set<string>>(
    () => new Set(["function", "interface", "class"]),
  )
  const [selectedNode, setSelectedNode] = useState<UIGraphNode | null>(null)
  const [aiTraceSymbol, setAiTraceSymbol] = useState<string | null>(null)
  const [aiTraceInfo, setAiTraceInfo] = useState<AiTraceDetail | null>(null)
  const [focusedRootId, setFocusedRootId] = useState<number | null>(null)
  const aiTraceTimerRef = useRef<NodeJS.Timeout | null>(null)

  const canvasRef = useRef<GraphCanvasHandle>(null)

  // Sync tab navigation if filename prop changes
  useEffect(() => {
    const nextParsed = parseGraphTab(filename)
    if (nextParsed.isWorkspace) {
      setScope("macro")
    } else if (nextParsed.target) {
      setScope("micro")
      setMicroPath(nextParsed.target)
    }
    setFocusedRootId(null)
  }, [filename])

  // Load Graph Data
  const loadGraph = useCallback(async () => {
    setLoading(true)
    let res: UIGraphPayload | null = null

    if (focusedRootId != null) {
      res = await fetchSymbolNeighborhood(focusedRootId, 1, 60)
    } else if (scope === "macro") {
      res = await fetchWorkspaceGraph(macroLimit)
    } else if (microPath) {
      res = await fetchActiveFileGraph(microPath)
    } else {
      res = await fetchWorkspaceGraph(macroLimit)
    }

    setPayload(res)
    setLoading(false)

    // Select active/root node if present
    if (res && res.nodes.length > 0) {
      const active = res.nodes.find((n) => n.isActive) || res.nodes[0]
      setSelectedNode(active)
    }
  }, [focusedRootId, scope, macroLimit, microPath])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  // Bidirectional Follow Cursor Event Listener
  useEffect(() => {
    function handleCursorFocus(e: Event) {
      const custom = e as CustomEvent<FocusSymbolDetail>
      const detail = custom.detail
      if (!detail) return

      if (detail.symbolId != null) {
        canvasRef.current?.focusNode(detail.symbolId)
        if (payload) {
          const match = payload.nodes.find((n) => n.id === detail.symbolId)
          if (match) setSelectedNode(match)
        }
      } else if (payload && detail.name) {
        const match = payload.nodes.find((n) => {
          if (detail.line != null) {
            const pathMatch =
              n.filePath === detail.name ||
              n.filePath.endsWith(detail.name) ||
              detail.name.endsWith(n.filePath)
            if (
              pathMatch &&
              detail.line >= n.lineStart &&
              detail.line <= n.lineEnd
            ) {
              return true
            }
          }
          return n.name === detail.name
        })
        if (match) {
          canvasRef.current?.focusNode(match.id)
          setSelectedNode(match)
        }
      }
    }

    async function handleAiTrace(e: Event) {
      const custom = e as CustomEvent<AiTraceDetail>
      if (!custom.detail) return

      const detail = custom.detail

      if (detail.status === "done" || detail.status === "completed") {
        setAiTraceInfo((prev) =>
          prev ? { ...prev, status: "completed" } : null,
        )
        clearTimeout(aiTraceTimerRef.current)
        // Keep completed visual state visible for 4 seconds before fade-out
        aiTraceTimerRef.current = setTimeout(() => {
          setAiTraceSymbol(null)
          setAiTraceInfo(null)
        }, 4000)
        return
      }

      if (detail.symbolName) {
        const sym = detail.symbolName
        setAiTraceSymbol(sym)
        setAiTraceInfo(detail)

        clearTimeout(aiTraceTimerRef.current)

        // 1. First attempt to pulse matching node directly in canvas
        const pulsed = canvasRef.current?.pulseAiTrace(sym)
        if (!pulsed) {
          // 2. Fetch symbol from workspace index asynchronously
          let matches = await searchGraphSymbols(sym, 5)

          // 2b. If search by full string yielded nothing, try base name if sym is a path
          if (
            matches.length === 0 &&
            (sym.includes("/") || sym.includes("\\"))
          ) {
            const base =
              sym
                .split(/[/\\]/)
                .pop()
                ?.replace(/\.[^/.]+$/, "") || ""
            if (base) {
              matches = await searchGraphSymbols(base, 5)
            }
          }

          if (matches.length > 0) {
            const target = matches[0]
            setFocusedRootId(target.id)
            setSelectedNode(target)

            // Direct deterministic fetch without relying on timers
            const res = await fetchSymbolNeighborhood(target.id, 1, 60)
            if (res && res.nodes.length > 0) {
              setPayload(res)
            }
          } else {
            // 2c. If symbol search returned empty, attempt file graph fetch if sym represents a file
            const fileRes = await fetchActiveFileGraph(sym)
            if (fileRes && fileRes.nodes.length > 0) {
              setPayload(fileRes)
              const first =
                fileRes.nodes.find((n) => n.isActive) || fileRes.nodes[0]
              setSelectedNode(first)
            } else {
              // Explicit error feedback without silent pass or dummy mocks
              setAiTraceInfo({
                ...detail,
                status: "error",
              })
              showToast(
                `CodeGraph: Symbol "${sym}" not found in workspace index`,
              )
            }
          }
        }
      }
    }

    window.addEventListener("aegis:focus-symbol", handleCursorFocus)
    window.addEventListener("aegis:ai-trace-path", handleAiTrace)

    return () => {
      window.removeEventListener("aegis:focus-symbol", handleCursorFocus)
      window.removeEventListener("aegis:ai-trace-path", handleAiTrace)
    }
  }, [payload, showToast])

  // Listen to external MCP events stream (MCP-05)
  useEffect(() => {
    let es: EventSource | null = null
    try {
      es = new EventSource("/api/v1/mcp/events")
      es.addEventListener("mcp_tool_invoked", (evt) => {
        try {
          const data = JSON.parse(evt.data)
          if (data && data.symbol) {
            window.dispatchEvent(
              new CustomEvent("aegis:ai-trace-path", {
                detail: {
                  symbolName: String(data.symbol),
                  toolName: data.tool || "mcp_tool",
                  status: "running",
                },
              }),
            )
          }
        } catch {
          // ignore parsing error
        }
      })
    } catch {
      // EventSource fallback
    }

    return () => {
      es?.close()
    }
  }, [])

  function handleToggleKind(kind: string) {
    setActiveKinds((prev) => {
      const next = new Set(prev)
      if (next.has(kind)) {
        next.delete(kind)
      } else {
        next.add(kind)
      }
      return next
    })
  }

  const handleJumpToSource = useCallback(
    (node: UIGraphNode) => {
      if (!node.filePath) return
      // If split pane is active, open in the other pane; otherwise open in current
      const targetGroup =
        splitEditor && groupId === "group2"
          ? "group1"
          : splitEditor && groupId === "group1"
            ? "group2"
            : groupId

      openFileInGroup(node.filePath, targetGroup)
      if (node.lineStart > 0) {
        setCursorPosition({ line: node.lineStart, column: 1 })
      }
      showToast(`Jumped to ${node.name} (${node.filePath}:${node.lineStart})`)
    },
    [splitEditor, groupId, openFileInGroup, setCursorPosition, showToast],
  )

  const handleNodeClick = useCallback((node: UIGraphNode) => {
    setSelectedNode(node)
  }, [])

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null)
  }, [])

  function handleFocusNeighborhood(node: UIGraphNode) {
    setFocusedRootId(node.id)
    showToast(`Focused subgraph on ${node.name}`)
  }

  function handleScopeChange(nextScope: ScopeMode) {
    setFocusedRootId(null)
    setScope(nextScope)
    if (nextScope === "micro" && !microPath) {
      // Auto-detect candidate file from selected node or active editor tab
      const candidate =
        selectedNode?.filePath ||
        (group1ActiveTab && !isGraphTab(group1ActiveTab)
          ? group1ActiveTab
          : null) ||
        (group2ActiveTab && !isGraphTab(group2ActiveTab)
          ? group2ActiveTab
          : null)
      if (candidate) {
        setMicroPath(candidate)
      }
    }
  }

  function handleMacroLimitChange(limit: number) {
    setMacroLimit(limit)
    if (scope === "macro") {
      setFocusedRootId(null)
    }
  }

  function handleDrillToFile(filePath: string) {
    setMicroPath(filePath)
    setScope("micro")
    setFocusedRootId(null)
    showToast(
      `Switched to Micro View: ${filePath.split("/").pop() || filePath}`,
    )
  }

  function handleSelectSymbolFromSearch(symbol: UIGraphNode) {
    setSelectedNode(symbol)
    const exists = payload?.nodes.some((n) => n.id === symbol.id)
    if (exists) {
      canvasRef.current?.focusNode(symbol.id)
    } else {
      setFocusedRootId(symbol.id)
    }
  }

  function handleSplitSideBySide() {
    if (!splitEditor) {
      toggleSplitEditor()
    }
    // If we are currently in group1, open code in group2, or vice versa
    const otherGroup = groupId === "group1" ? "group2" : "group1"
    if (selectedNode?.filePath) {
      openFileInGroup(selectedNode.filePath, otherGroup)
    } else {
      openFileInGroup("codegraph:workspace", otherGroup)
    }
  }

  async function handleReindexWorkspace() {
    showToast("Triggering CodeGraph reindexing...")
    const ok = await triggerCodeGraphReindex()
    if (ok) {
      showToast("Reindexing complete")
      loadGraph()
    } else {
      showToast("Reindexing failed")
    }
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0 min-w-0 bg-canvas text-ink overflow-hidden select-none">
      {/* Top Toolbar */}
      <GraphToolbar
        activeKinds={activeKinds}
        layout={layout}
        loading={loading}
        macroLimit={macroLimit}
        microPath={microPath}
        onFit={() => canvasRef.current?.fit()}
        onLayoutChange={setLayout}
        onMacroLimitChange={handleMacroLimitChange}
        onRefresh={loadGraph}
        onScopeChange={handleScopeChange}
        onSelectSymbol={handleSelectSymbolFromSearch}
        onSplitSideBySide={handleSplitSideBySide}
        onToggleKind={handleToggleKind}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
        scope={scope}
      />

      {/* Animated Loading Bar */}
      {loading && (
        <div className="w-full h-0.5 bg-accent/20 overflow-hidden">
          <div className="w-1/3 h-full bg-accent animate-pulse" />
        </div>
      )}

      {/* Scope & Breadcrumb Status Bar */}
      <div
        className={`flex items-center justify-between px-3 py-1 border-b text-[11px] transition-colors duration-200 select-none ${
          aiTraceInfo
            ? aiTraceInfo.status === "completed" ||
              aiTraceInfo.status === "done"
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : aiTraceInfo.status === "error"
                ? "bg-red-950/40 border-red-500/30 text-red-300"
                : "bg-pink-950/40 border-pink-500/30 text-pink-300"
            : "bg-surface border-line text-ink-muted"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {aiTraceInfo ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="relative flex h-2 w-2">
                {aiTraceInfo.status === "completed" ||
                aiTraceInfo.status === "done" ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                ) : aiTraceInfo.status === "error" ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500" />
                  </>
                )}
              </span>
              <Icon
                className={
                  aiTraceInfo.status === "completed" ||
                  aiTraceInfo.status === "done"
                    ? "text-emerald-400"
                    : aiTraceInfo.status === "error"
                      ? "text-red-400"
                      : "text-pink-400"
                }
                name={
                  aiTraceInfo.status === "completed" ||
                  aiTraceInfo.status === "done"
                    ? "check"
                    : aiTraceInfo.status === "error"
                      ? "warning"
                      : "zap"
                }
                size={12}
              />
              <span className="font-semibold text-ink">
                {aiTraceInfo.status === "completed" ||
                aiTraceInfo.status === "done"
                  ? "AI Read Success:"
                  : aiTraceInfo.status === "error"
                    ? "Symbol Unindexed:"
                    : "AI Reading MCP:"}
              </span>
              <span className="font-mono px-1.5 py-0.2 rounded font-bold bg-canvas border border-line text-ink">
                {aiTraceInfo.symbolName}
              </span>
              {aiTraceInfo.toolName && (
                <span className="text-[10px] text-ink-muted">
                  via {aiTraceInfo.toolName}
                </span>
              )}
              {aiTraceInfo.status === "error" && (
                <button
                  className="ml-1 px-1.5 py-0.2 rounded bg-accent text-accent-contrast text-[10px] font-medium hover:opacity-90 cursor-pointer"
                  onClick={handleReindexWorkspace}
                  type="button"
                >
                  Re-index
                </button>
              )}
              <button
                className="ml-1 text-ink-muted hover:text-ink cursor-pointer p-0.5"
                onClick={() => {
                  setAiTraceSymbol(null)
                  setAiTraceInfo(null)
                }}
                title="Dismiss AI status"
                type="button"
              >
                <Icon name="close" size={10} />
              </button>
            </div>
          ) : focusedRootId != null ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>
                Neighborhood Scope:{" "}
                <strong className="text-ink font-mono">
                  {selectedNode?.name}
                </strong>
              </span>
              {payload && payload.nodes.length <= 1 && !loading && (
                <span className="text-warning text-[10px] ml-1">
                  (Standalone symbol: 0 callers & 0 calls in visible graph)
                </span>
              )}
            </>
          ) : scope === "micro" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>
                Micro AST Scope:{" "}
                <strong className="text-ink font-mono">
                  {microPath || "Active File"}
                </strong>
              </span>
              <span className="text-[10px] text-ink-muted">
                ({payload?.nodes.length || 0} symbols in file)
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>
                Macro Workspace Scope:{" "}
                <strong className="text-ink font-mono">
                  {payload?.nodes.length || 0}
                </strong>{" "}
                of{" "}
                <strong className="text-ink font-mono">
                  {payload?.total || payload?.nodes.length || 0}
                </strong>{" "}
                nodes
              </span>
              {payload?.truncated && (
                <span className="text-accent text-[10px] ml-1 font-medium">
                  (Capped at {macroLimit} for visual clarity)
                </span>
              )}
            </>
          )}
        </div>

        {/* Right side navigation & density shortcuts */}
        <div className="flex items-center gap-2">
          {focusedRootId != null ? (
            <button
              className="flex items-center gap-1 text-accent hover:underline cursor-pointer font-medium"
              onClick={() => setFocusedRootId(null)}
              type="button"
            >
              <Icon name="maximize" size={11} />
              <span>Reset Focus</span>
            </button>
          ) : scope === "micro" ? (
            <button
              className="flex items-center gap-1 text-accent hover:underline cursor-pointer font-medium"
              onClick={() => {
                setScope("macro")
                setFocusedRootId(null)
              }}
              type="button"
            >
              <Icon name="folder" size={11} />
              <span>Back to Macro Workspace</span>
            </button>
          ) : (
            payload?.truncated && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-ink-muted">Expand:</span>
                {macroLimit < 100 && payload.total >= 100 && (
                  <button
                    className="px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-accent-contrast transition-colors cursor-pointer text-[10px]"
                    onClick={() => handleMacroLimitChange(100)}
                    type="button"
                  >
                    100
                  </button>
                )}
                {macroLimit < 250 && payload.total >= 250 && (
                  <button
                    className="px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-accent-contrast transition-colors cursor-pointer text-[10px]"
                    onClick={() => handleMacroLimitChange(250)}
                    type="button"
                  >
                    250
                  </button>
                )}
                <button
                  className="px-1.5 py-0.2 rounded bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-accent-contrast transition-colors cursor-pointer text-[10px]"
                  onClick={() => handleMacroLimitChange(1000)}
                  type="button"
                >
                  All ({payload.total})
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Main Workspace Area: Graph Canvas + Side Inspector */}
      <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {loading && !payload ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-ink-muted text-xs">
            <Icon
              className="animate-spin text-accent"
              name="refresh"
              size={18}
            />
            <span>Analyzing CodeGraph relationships...</span>
          </div>
        ) : !payload || payload.nodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3 text-ink-muted">
            <div className="p-3 rounded-full bg-surface border border-line">
              <Icon className="text-accent" name="zap" size={24} />
            </div>
            <div className="font-semibold text-ink text-sm">
              No Graph Nodes Discovered
            </div>
            <p className="text-xs max-w-sm leading-relaxed">
              {scope === "micro" && microPath
                ? `No code symbols or relationships recorded for ${microPath}.`
                : "Open a workspace folder or trigger indexing to visualize structural relationships."}
            </p>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-accent-contrast font-medium hover:opacity-90 transition-opacity cursor-pointer text-xs"
              onClick={handleReindexWorkspace}
              type="button"
            >
              <Icon name="refresh" size={13} />
              <span>Index Workspace</span>
            </button>
          </div>
        ) : (
          <GraphCanvas
            activeKinds={activeKinds}
            aiTraceInfo={aiTraceInfo}
            aiTraceSymbol={aiTraceSymbol}
            edges={payload.edges}
            layout={layout}
            nodes={payload.nodes}
            onBackgroundClick={handleBackgroundClick}
            onNodeClick={handleNodeClick}
            onNodeDoubleClick={handleJumpToSource}
            ref={canvasRef}
            selectedNodeId={selectedNode?.id ?? null}
          />
        )}

        {/* Slide-in Inspector Drawer */}
        {selectedNode && payload && (
          <NodeInspector
            allEdges={payload.edges}
            allNodes={payload.nodes}
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onDrillToFile={handleDrillToFile}
            onFocusNeighborhood={handleFocusNeighborhood}
            onJumpToSource={handleJumpToSource}
            onSelectNode={(node) => {
              setSelectedNode(node)
              canvasRef.current?.focusNode(node.id)
            }}
          />
        )}
      </div>
    </div>
  )
}
