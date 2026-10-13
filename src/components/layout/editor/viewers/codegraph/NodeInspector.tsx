import { Icon } from "../../../../ui/Icon"
import type {
  UIGraphNode,
  UIGraphEdge,
} from "../../../../../utils/codegraphApi"

interface NodeInspectorProps {
  node: UIGraphNode | null
  allNodes: UIGraphNode[]
  allEdges: UIGraphEdge[]
  onClose: () => void
  onJumpToSource: (node: UIGraphNode) => void
  onSelectNode: (node: UIGraphNode) => void
  onFocusNeighborhood: (node: UIGraphNode) => void
  onDrillToFile?: (filePath: string) => void
}

interface NodeConnection {
  node: UIGraphNode
  relation: string
  line: number
}

export function NodeInspector({
  node,
  allNodes,
  allEdges,
  onClose,
  onJumpToSource,
  onSelectNode,
  onFocusNeighborhood,
  onDrillToFile,
}: NodeInspectorProps) {
  if (!node) return null

  // Calculate inbound callers and outbound callees connected to this node in the current graph
  const callers: NodeConnection[] = []
  const callees: NodeConnection[] = []

  const nodeMap = new Map<number, UIGraphNode>()
  for (const n of allNodes) {
    nodeMap.set(n.id, n)
  }

  for (const edge of allEdges) {
    if (edge.targetId === node.id) {
      const srcNode = nodeMap.get(edge.sourceId)
      if (srcNode) {
        callers.push({
          node: srcNode,
          relation: edge.relation,
          line: edge.line,
        })
      }
    }
    if (edge.sourceId === node.id) {
      const tgtNode = nodeMap.get(edge.targetId)
      if (tgtNode) {
        callees.push({
          node: tgtNode,
          relation: edge.relation,
          line: edge.line,
        })
      }
    }
  }

  const kindBadgeColors: Record<string, string> = {
    function: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    method: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    interface: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    class: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    struct: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    type: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  }
  const badgeStyle =
    kindBadgeColors[node.kind.toLowerCase()] ||
    "bg-surface text-ink-muted border-line"

  return (
    <div className="w-80 h-full border-l border-line bg-surface flex flex-col text-xs shadow-2xl z-20 shrink-0 select-text">
      {/* Header */}
      <div className="flex items-start justify-between p-3 border-b border-line bg-canvas/40">
        <div className="flex flex-col gap-1 min-w-0 pr-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono capitalize border ${badgeStyle}`}
            >
              {node.kind}
            </span>
            <span className="font-mono font-bold text-ink truncate text-sm">
              {node.name}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-ink-muted font-mono">
            <span className="truncate">
              {node.filePath}:{node.lineStart}
              {node.lineEnd > node.lineStart ? `-${node.lineEnd}` : ""}
            </span>
            {node.filePath && onDrillToFile && (
              <button
                className="text-accent hover:underline text-[10px] shrink-0 cursor-pointer ml-1"
                onClick={() => onDrillToFile(node.filePath)}
                title="Open Micro View for this file"
                type="button"
              >
                (View File)
              </button>
            )}
          </div>
        </div>
        <button
          className="text-ink-muted hover:text-ink cursor-pointer p-1 rounded hover:bg-canvas transition-colors shrink-0"
          onClick={onClose}
          title="Close Inspector"
          type="button"
        >
          <Icon name="close" size={13} />
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded bg-accent text-accent-contrast font-medium hover:opacity-90 transition-opacity cursor-pointer text-xs shadow-sm"
            onClick={() => onJumpToSource(node)}
            type="button"
          >
            <Icon name="code" size={13} />
            <span>Jump to Source</span>
          </button>
          <button
            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-canvas border border-line hover:border-accent text-ink hover:text-accent transition-colors cursor-pointer text-[11px]"
            onClick={() => onFocusNeighborhood(node)}
            title="Load 1-hop / 2-hop neighborhood centered on this symbol"
            type="button"
          >
            <Icon name="zap" size={12} />
            <span>Focus</span>
          </button>
          {node.filePath && onDrillToFile && (
            <button
              className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded bg-canvas border border-line hover:border-accent text-ink hover:text-accent transition-colors cursor-pointer text-[11px]"
              onClick={() => onDrillToFile(node.filePath)}
              title={`Drill down into Micro AST graph for ${node.filePath}`}
              type="button"
            >
              <Icon name="file" size={12} />
              <span>File Graph</span>
            </button>
          )}
        </div>

        {/* Signature Preview */}
        {node.signature && (
          <div>
            <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
              Signature
            </div>
            <pre className="p-2.5 rounded bg-canvas border border-line/70 font-mono text-[11px] text-ink whitespace-pre-wrap break-all leading-relaxed">
              {node.signature}
            </pre>
          </div>
        )}

        {/* Documentation Comment */}
        {node.doc && (
          <div>
            <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
              Documentation
            </div>
            <div className="p-2.5 rounded bg-canvas border border-line/70 text-[11px] text-ink leading-relaxed whitespace-pre-wrap">
              {node.doc}
            </div>
          </div>
        )}

        {/* Inbound Callers */}
        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
            <span>Inbound Callers</span>
            <span className="font-mono text-ink-muted">({callers.length})</span>
          </div>
          {callers.length === 0 ? (
            <div className="text-[11px] text-ink-muted italic p-2 rounded bg-canvas/50 border border-line/40">
              No callers in visible graph
            </div>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {callers.map((c, i) => (
                <button
                  className="w-full text-left p-1.5 rounded bg-canvas border border-line hover:border-accent flex items-center justify-between cursor-pointer transition-colors"
                  key={`caller-${c.node.id}-${i}`}
                  onClick={() => onSelectNode(c.node)}
                  type="button"
                >
                  <div className="min-w-0 pr-1">
                    <div className="font-mono font-medium text-ink truncate text-[11px]">
                      {c.node.name}
                    </div>
                    <div className="text-[10px] text-ink-muted truncate">
                      {c.node.filePath}:{c.line}
                    </div>
                  </div>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-surface border border-line/60 text-ink-muted shrink-0 capitalize">
                    {c.relation}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Outbound Callees */}
        <div>
          <div className="flex items-center justify-between text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1.5">
            <span>Outbound Calls</span>
            <span className="font-mono text-ink-muted">({callees.length})</span>
          </div>
          {callees.length === 0 ? (
            <div className="text-[11px] text-ink-muted italic p-2 rounded bg-canvas/50 border border-line/40">
              No outbound calls in visible graph
            </div>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {callees.map((c, i) => (
                <button
                  className="w-full text-left p-1.5 rounded bg-canvas border border-line hover:border-accent flex items-center justify-between cursor-pointer transition-colors"
                  key={`callee-${c.node.id}-${i}`}
                  onClick={() => onSelectNode(c.node)}
                  type="button"
                >
                  <div className="min-w-0 pr-1">
                    <div className="font-mono font-medium text-ink truncate text-[11px]">
                      {c.node.name}
                    </div>
                    <div className="text-[10px] text-ink-muted truncate">
                      {c.node.filePath}:{c.line}
                    </div>
                  </div>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-surface border border-line/60 text-ink-muted shrink-0 capitalize">
                    {c.relation}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
