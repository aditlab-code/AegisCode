import { useState, useEffect, useRef, useCallback } from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import { parseGraphTab } from "./viewerTypes"
import { GraphToolbar, type LayoutMode } from "./codegraph/GraphToolbar"
import { GraphCanvas, type GraphCanvasHandle } from "./codegraph/GraphCanvas"
import { NodeInspector } from "./codegraph/NodeInspector"
import {
  fetchWorkspaceGraph,
  fetchActiveFileGraph,
  fetchSymbolNeighborhood,
  triggerCodeGraphReindex,
  type UIGraphPayload,
  type UIGraphNode,
} from "../../../../utils/codegraphApi"

interface GraphViewerProps {
  filename: string
  groupId: "group1" | "group2"
}

interface FocusSymbolDetail {
  symbolId: number
  name?: string
}

export default function GraphViewer({ filename, groupId }: GraphViewerProps) {
  const {
    openFileInGroup,
    setCursorPosition,
    splitEditor,
    toggleSplitEditor,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      openFileInGroup: s.openFileInGroup,
      setCursorPosition: s.setCursorPosition,
      splitEditor: s.splitEditor,
      toggleSplitEditor: s.toggleSplitEditor,
      showToast: s.showToast,
    })),
  )

  const parsed = parseGraphTab(filename)
  const isWorkspace = parsed.isWorkspace
  const targetPath = parsed.target

  const [payload, setPayload] = useState<UIGraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [depth, setDepth] = useState(1)
  const [layout, setLayout] = useState<LayoutMode>("dagre")
  const [activeKinds, setActiveKinds] = useState<Set<string>>(
    () => new Set(["function", "interface", "class"]),
  )
  const [selectedNode, setSelectedNode] = useState<UIGraphNode | null>(null)
  const [aiTraceSymbol, setAiTraceSymbol] = useState<string | null>(null)
  const [focusedRootId, setFocusedRootId] = useState<number | null>(null)

  const canvasRef = useRef<GraphCanvasHandle>(null)

  // Load Graph Data
  const loadGraph = useCallback(async () => {
    setLoading(true)
    let res: UIGraphPayload | null = null

    if (focusedRootId != null) {
      res = await fetchSymbolNeighborhood(focusedRootId, depth, 60)
    } else if (isWorkspace) {
      res = await fetchWorkspaceGraph(50)
    } else if (targetPath) {
      res = await fetchActiveFileGraph(targetPath)
    } else {
      res = await fetchWorkspaceGraph(50)
    }

    setPayload(res)
    setLoading(false)

    // Select active/root node if present
    if (res && res.nodes.length > 0) {
      const active = res.nodes.find((n) => n.isActive) || res.nodes[0]
      setSelectedNode(active)
    }
  }, [focusedRootId, isWorkspace, targetPath, depth])

  useEffect(() => {
    loadGraph()
  }, [loadGraph])

  // Bidirectional Follow Cursor Event Listener
  useEffect(() => {
    function handleCursorFocus(e: Event) {
      const custom = e as CustomEvent<FocusSymbolDetail>
      if (custom.detail?.symbolId) {
        canvasRef.current?.focusNode(custom.detail.symbolId)
        if (payload) {
          const match = payload.nodes.find(
            (n) => n.id === custom.detail.symbolId,
          )
          if (match) setSelectedNode(match)
        }
      }
    }

    function handleAiTrace(e: Event) {
      const custom = e as CustomEvent<{ symbolName: string }>
      if (custom.detail?.symbolName) {
        setAiTraceSymbol(custom.detail.symbolName)
        canvasRef.current?.pulseAiTrace(custom.detail.symbolName)
      }
    }

    window.addEventListener("aegis:focus-symbol", handleCursorFocus)
    window.addEventListener("aegis:ai-trace-path", handleAiTrace)

    return () => {
      window.removeEventListener("aegis:focus-symbol", handleCursorFocus)
      window.removeEventListener("aegis:ai-trace-path", handleAiTrace)
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

  function handleJumpToSource(node: UIGraphNode) {
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
  }

  function handleFocusNeighborhood(node: UIGraphNode) {
    setFocusedRootId(node.id)
    showToast(`Focused subgraph on ${node.name}`)
  }
  function handleDepthChange(newDepth: number) {
    setDepth(newDepth)
    const targetId =
      focusedRootId ?? selectedNode?.id ?? payload?.rootId ?? null
    if (targetId != null) {
      setFocusedRootId(targetId)
    }
  }

  function handleSelectSymbolFromSearch(symbol: UIGraphNode) {
    setSelectedNode(symbol)
    canvasRef.current?.focusNode(symbol.id)
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
        depth={depth}
        layout={layout}
        loading={loading}
        onDepthChange={handleDepthChange}
        onFit={() => canvasRef.current?.fit()}
        onLayoutChange={setLayout}
        onRefresh={loadGraph}
        onSelectSymbol={handleSelectSymbolFromSearch}
        onSplitSideBySide={handleSplitSideBySide}
        onToggleKind={handleToggleKind}
        onZoomIn={() => canvasRef.current?.zoomIn()}
        onZoomOut={() => canvasRef.current?.zoomOut()}
      />

      {/* Animated Loading Bar */}
      {loading && (
        <div className="w-full h-0.5 bg-accent/20 overflow-hidden">
          <div className="w-1/3 h-full bg-accent animate-pulse" />
        </div>
      )}

      {/* Scope & Focus Subgraph Status Bar */}
      {focusedRootId != null && (
        <div className="flex items-center justify-between px-3 py-1 bg-surface border-b border-line text-[11px] text-ink-muted">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span>
              Neighborhood Scope:{" "}
              <strong className="text-ink font-mono">
                {selectedNode?.name}
              </strong>{" "}
              ({depth} {depth === 1 ? "Hop" : "Hops"})
            </span>
            {payload && payload.nodes.length <= 1 && !loading && (
              <span className="text-warning text-[10px] ml-1">
                (Standalone symbol: 0 callers & 0 calls in visible graph)
              </span>
            )}
          </div>
          <button
            className="flex items-center gap-1 text-accent hover:underline cursor-pointer font-medium"
            onClick={() => setFocusedRootId(null)}
            type="button"
          >
            <Icon name="maximize" size={11} />
            <span>View Full Workspace</span>
          </button>
        </div>
      )}

      {/* Truncation / Info Banner */}
      {payload?.truncated && (
        <div className="flex items-center justify-between px-3 py-1 bg-accent/10 border-b border-accent/20 text-accent text-[11px]">
          <div className="flex items-center gap-1.5">
            <Icon name="warning" size={12} />
            <span>
              Graph capped to 50 nodes for visual clarity ({payload.total} total
              nodes discovered). Filter kinds or focus a node to inspect deeper.
            </span>
          </div>
          {focusedRootId != null && (
            <button
              className="underline font-medium hover:opacity-80 cursor-pointer"
              onClick={() => setFocusedRootId(null)}
              type="button"
            >
              Reset to Root Scope
            </button>
          )}
        </div>
      )}

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
              {targetPath
                ? `No code symbols or relationships recorded for ${targetPath}.`
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
            aiTraceSymbol={aiTraceSymbol}
            edges={payload.edges}
            layout={layout}
            nodes={payload.nodes}
            onBackgroundClick={() => setSelectedNode(null)}
            onNodeClick={(node) => setSelectedNode(node)}
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
