import { useState, useEffect, useRef, useCallback } from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import { parseGraphTab, isGraphTab } from "./viewerTypes"
import {
  GraphToolbar,
  type LayoutMode,
  type ScopeMode,
} from "./codegraph/GraphToolbar"
import {
  GraphCanvas,
  type GraphCanvasHandle,
  type AiTraceDetail,
} from "./codegraph/GraphCanvas"
import { NodeInspector } from "./codegraph/NodeInspector"
import {
  fetchWorkspaceGraph,
  fetchActiveFileGraph,
  fetchSymbolNeighborhood,
  fetchExploreSubgraph,
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
  symbolId?: string | number
  name?: string
  line?: number
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
    storeAiTrace,
    clearAiTrace,
  } = useWorkbenchStore(
    useShallow((s) => ({
      openFileInGroup: s.openFileInGroup,
      setCursorPosition: s.setCursorPosition,
      splitEditor: s.splitEditor,
      toggleSplitEditor: s.toggleSplitEditor,
      showToast: s.showToast,
      group1ActiveTab: s.group1.activeTab,
      group2ActiveTab: s.group2.activeTab,
      storeAiTrace: s.aiTrace,
      clearAiTrace: s.clearAiTrace,
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
  const [localTrace, setLocalTrace] = useState<AiTraceDetail | null>(null)
  const [focusedRootId, setFocusedRootId] = useState<string | number | null>(
    null,
  )

  const canvasRef = useRef<GraphCanvasHandle>(null)
  const lastResolvedTraceKeyRef = useRef<string | null>(null)

  // Effective trace combines centralized Zustand store trace with any local inspection event
  const activeTrace: AiTraceDetail | null = storeAiTrace || localTrace

  const traceSymbols =
    activeTrace?.symbols && activeTrace.symbols.length > 0
      ? activeTrace.symbols
      : activeTrace?.symbolName
        ? [activeTrace.symbolName]
        : []

  const traceKey = traceSymbols.join("|")

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

  // Load Graph Data (Single deterministic fetch pipeline)
  const loadGraph = useCallback(async () => {
    setLoading(true)
    let res: UIGraphPayload | null = null

    // If an active AI trace exists on initial mount or refresh, prioritize its subgraph directly
    if (traceSymbols.length > 0 && focusedRootId == null) {
      res = await fetchExploreSubgraph(traceSymbols, 60)
    }

    if (!res || res.nodes.length === 0) {
      if (focusedRootId != null) {
        res = await fetchSymbolNeighborhood(focusedRootId, 2, 60)
      } else if (scope === "macro") {
        res = await fetchWorkspaceGraph(macroLimit)
      } else if (microPath) {
        res = await fetchActiveFileGraph(microPath)
      } else {
        res = await fetchWorkspaceGraph(macroLimit)
      }
    }

    setPayload(res)
    setLoading(false)

    if (res && res.nodes.length > 0) {
      const active =
        (traceSymbols.length > 0
          ? res.nodes.find((n) =>
              traceSymbols.some((sym) => {
                const q = sym.toLowerCase().trim()
                const shortQ = q.includes(".") ? q.split(".").pop() || q : q
                const nameL = n.name.toLowerCase()
                const qualL = (n.qualifiedName || n.name).toLowerCase()
                return (
                  nameL === q ||
                  nameL === shortQ ||
                  qualL === q ||
                  qualL.endsWith(`.${shortQ}`)
                )
              }),
            )
          : null) ||
        res.nodes.find((n) => n.isActive) ||
        res.nodes[0]

      setSelectedNode(active)
      if (active) {
        const k = active.kind.toLowerCase()
        const bucket =
          k === "function" || k === "method"
            ? "function"
            : k === "interface" || k === "trait" || k === "protocol"
              ? "interface"
              : "class"
        setActiveKinds((prev) =>
          prev.has(bucket) ? prev : new Set(prev).add(bucket),
        )
      }
    }
  }, [focusedRootId, scope, macroLimit, microPath, traceKey])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  // Reactively synchronize canvas when activeTrace changes while viewer is mounted
  useEffect(() => {
    if (!activeTrace || traceSymbols.length === 0) {
      lastResolvedTraceKeyRef.current = null
      return
    }

    const currentKey = `${traceSymbols.join("|")}::${activeTrace.toolName || ""}`
    if (lastResolvedTraceKeyRef.current === currentKey) return
    lastResolvedTraceKeyRef.current = currentKey

    // If payload is not yet loaded, loadGraph() will handle it
    if (!payload) return

    // 1. Check if queried symbols are already present in current payload
    const matchedInPayload = payload.nodes.filter((n) => {
      const nameL = n.name.toLowerCase()
      const qualL = (n.qualifiedName || n.name).toLowerCase()
      const fileL = (n.filePath || "").toLowerCase()
      return traceSymbols.some((sym) => {
        const q = sym.toLowerCase().trim()
        const shortQ = q.includes(".") ? q.split(".").pop() || q : q
        return (
          nameL === q ||
          nameL === shortQ ||
          qualL === q ||
          qualL.endsWith(`.${shortQ}`) ||
          (fileL && (fileL.endsWith(q) || q.endsWith(fileL)))
        )
      })
    })

    if (matchedInPayload.length > 0) {
      const target = matchedInPayload[0]
      const k = target.kind.toLowerCase()
      const bucket =
        k === "function" || k === "method"
          ? "function"
          : k === "interface" || k === "trait" || k === "protocol"
            ? "interface"
            : "class"
      setActiveKinds((prev) =>
        prev.has(bucket) ? prev : new Set(prev).add(bucket),
      )
      setSelectedNode(target)
      canvasRef.current?.focusNode(target.id)
      return
    }

    // 2. Otherwise fetch the explore subgraph on-demand
    let cancelled = false
    setLoading(true)
    fetchExploreSubgraph(traceSymbols, 60).then((subgraphRes) => {
      if (cancelled) return
      setLoading(false)
      if (subgraphRes && subgraphRes.nodes.length > 0) {
        setPayload(subgraphRes)
        const target =
          subgraphRes.nodes.find((n) =>
            traceSymbols.some((sym) => {
              const q = sym.toLowerCase().trim()
              const shortQ = q.includes(".") ? q.split(".").pop() || q : q
              const nameL = n.name.toLowerCase()
              const qualL = (n.qualifiedName || n.name).toLowerCase()
              return (
                nameL === q ||
                nameL === shortQ ||
                qualL === q ||
                qualL.endsWith(`.${shortQ}`)
              )
            }),
          ) ||
          subgraphRes.nodes.find((n) => n.isActive) ||
          subgraphRes.nodes[0]

        setSelectedNode(target)
        if (target) {
          const k = target.kind.toLowerCase()
          const bucket =
            k === "function" || k === "method"
              ? "function"
              : k === "interface" || k === "trait" || k === "protocol"
                ? "interface"
                : "class"
          setActiveKinds((prev) =>
            prev.has(bucket) ? prev : new Set(prev).add(bucket),
          )
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeTrace, traceKey, payload])

  // Bidirectional Follow Cursor & legacy custom event listener
  useEffect(() => {
    function handleCursorFocus(e: Event) {
      const custom = e as CustomEvent<FocusSymbolDetail>
      const detail = custom.detail
      if (!detail) return

      if (detail.symbolId != null) {
        canvasRef.current?.focusNode(detail.symbolId)
        if (payload) {
          const match = payload.nodes.find(
            (n) => String(n.id) === String(detail.symbolId),
          )
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

    function handleLegacyAiTrace(e: Event) {
      const custom = e as CustomEvent<AiTraceDetail>
      if (!custom.detail) return
      setLocalTrace(custom.detail)
    }

    window.addEventListener("aegis:focus-symbol", handleCursorFocus)
    window.addEventListener("aegis:ai-trace-path", handleLegacyAiTrace)

    return () => {
      window.removeEventListener("aegis:focus-symbol", handleCursorFocus)
      window.removeEventListener("aegis:ai-trace-path", handleLegacyAiTrace)
    }
  }, [payload])

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

  const handleNodeClick = useCallback(
    (node: UIGraphNode) => {
      setSelectedNode(node)
      if (activeTrace) {
        clearAiTrace()
        setLocalTrace(null)
      }
    },
    [activeTrace, clearAiTrace],
  )

  const handleBackgroundClick = useCallback(() => {
    setSelectedNode(null)
    if (activeTrace) {
      clearAiTrace()
      setLocalTrace(null)
    }
  }, [activeTrace, clearAiTrace])

  function handleFocusNeighborhood(node: UIGraphNode) {
    setFocusedRootId(node.id)
    showToast(`Focused subgraph on ${node.name}`)
  }

  function handleScopeChange(nextScope: ScopeMode) {
    setFocusedRootId(null)
    setScope(nextScope)
    if (nextScope === "micro" && !microPath) {
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
    const exists = payload?.nodes.some(
      (n) => String(n.id) === String(symbol.id),
    )
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
    const otherGroup = groupId === "group1" ? "group2" : "group1"
    if (selectedNode?.filePath) {
      openFileInGroup(selectedNode.filePath, otherGroup)
    } else {
      openFileInGroup("codegraph:workspace", otherGroup)
    }
  }

  async function handleReindexWorkspace() {
    showToast(
      "Syncing @colbymchenry/codegraph index (.codegraph/codegraph.db)...",
    )
    const ok = await triggerCodeGraphReindex()
    if (ok) {
      showToast("CodeGraph index synchronized")
      loadGraph()
    } else {
      showToast("CodeGraph sync failed — run `codegraph init` in terminal")
    }
  }

  const traceLabel =
    activeTrace?.symbols && activeTrace.symbols.length > 0
      ? activeTrace.symbols.join(", ")
      : activeTrace?.symbolName || ""

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

      {/* Scope & Provider AI Trace Status Bar */}
      <div
        className={`flex items-center justify-between px-3 py-1 border-b text-[11px] transition-colors duration-200 select-none ${
          activeTrace && traceLabel
            ? activeTrace.status === "completed" ||
              activeTrace.status === "done"
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : activeTrace.status === "error"
                ? "bg-red-950/40 border-red-500/30 text-red-300"
                : "bg-pink-950/40 border-pink-500/30 text-pink-300"
            : "bg-surface border-line text-ink-muted"
        }`}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          {activeTrace && traceLabel ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="relative flex h-2 w-2">
                {activeTrace.status === "completed" ||
                activeTrace.status === "done" ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                ) : activeTrace.status === "error" ? (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                ) : (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-pink-500" />
                  </>
                )}
              </span>
              {activeTrace.provider && (
                <span className="font-mono uppercase text-[9.5px] px-1.5 py-0.2 rounded bg-canvas border border-line text-accent font-bold">
                  {activeTrace.provider}
                </span>
              )}
              <span className="font-semibold text-ink">
                {activeTrace.status === "completed" ||
                activeTrace.status === "done"
                  ? "Explored:"
                  : activeTrace.status === "error"
                    ? "Unindexed:"
                    : "Exploring MCP:"}
              </span>
              <span className="font-mono px-1.5 py-0.2 rounded font-bold bg-canvas border border-line text-ink">
                {traceLabel}
              </span>
              {activeTrace.toolName && (
                <span className="text-[10px] text-ink-muted font-mono">
                  ({activeTrace.toolName})
                </span>
              )}
              <button
                className="ml-1 text-ink-muted hover:text-ink cursor-pointer p-0.5"
                onClick={() => {
                  clearAiTrace()
                  setLocalTrace(null)
                }}
                title="Dismiss AI trace highlight"
                type="button"
              >
                <Icon name="close" size={10} />
              </button>
            </div>
          ) : focusedRootId != null ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>
                Subgraph Scope:{" "}
                <strong className="text-ink font-mono">
                  {selectedNode?.name}
                </strong>
              </span>
            </>
          ) : scope === "micro" ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>
                File Graph Scope:{" "}
                <strong className="text-ink font-mono">
                  {microPath || "Active File"}
                </strong>
              </span>
              <span className="text-[10px] text-ink-muted">
                ({payload?.nodes.length || 0} nodes)
              </span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>
                .codegraph/codegraph.db:{" "}
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
                  (Capped at {macroLimit})
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
              <span>Back to Workspace Graph</span>
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
            <span>Loading .codegraph/codegraph.db relationships...</span>
          </div>
        ) : !payload || payload.nodes.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-3 text-ink-muted">
            <div className="p-3 rounded-full bg-surface border border-line">
              <Icon className="text-accent" name="zap" size={24} />
            </div>
            <div className="font-semibold text-ink text-sm">
              No CodeGraph Index Found (.codegraph/codegraph.db)
            </div>
            <p className="text-xs max-w-sm leading-relaxed">
              Initialize{" "}
              <code className="font-mono text-ink">
                @colbymchenry/codegraph
              </code>{" "}
              in this workspace to build the SQLite knowledge graph and enable
              live{" "}
              <code className="font-mono text-accent">codegraph_explore</code>{" "}
              visual tracing.
            </p>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-accent-contrast font-medium hover:opacity-90 transition-opacity cursor-pointer text-xs"
              onClick={handleReindexWorkspace}
              type="button"
            >
              <Icon name="refresh" size={13} />
              <span>Run codegraph init / sync</span>
            </button>
          </div>
        ) : (
          <GraphCanvas
            activeKinds={activeKinds}
            aiTraceInfo={activeTrace}
            aiTraceSymbol={traceLabel || null}
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
