import { useEffect, useRef, useImperativeHandle, forwardRef } from "react"
import cytoscape, { type Core, type EventObject } from "cytoscape"
import dagre from "cytoscape-dagre"
import { getCytoscapeTheme } from "./graphTheme"
import type { LayoutMode } from "./GraphToolbar"
import { useWorkbenchStore } from "../../../../../store"
import type {
  UIGraphNode,
  UIGraphEdge,
  AiTraceState,
} from "../../../../../utils/codegraphApi"

// Register Dagre plugin safely once
try {
  cytoscape.use(dagre)
} catch {
  // Plugin already registered
}

export interface GraphCanvasHandle {
  fit: () => void
  zoomIn: () => void
  zoomOut: () => void
  focusNode: (id: string | number) => void
  pulseAiTrace: (symbolOrSymbols: string | string[]) => boolean
}

export type AiTraceDetail = Partial<AiTraceState> & {
  symbolName?: string
  symbols?: string[]
  toolName?: string
  provider?: string
  status?: string
}

interface GraphCanvasProps {
  nodes: UIGraphNode[]
  edges: UIGraphEdge[]
  layout: LayoutMode
  activeKinds: Set<string>
  selectedNodeId: string | number | null
  aiTraceSymbol?: string | null
  aiTraceInfo?: AiTraceDetail | null
  onNodeClick: (node: UIGraphNode) => void
  onNodeDoubleClick: (node: UIGraphNode) => void
  onBackgroundClick: () => void
}

function toDomSafeNodeId(id: string | number): string {
  return `sym_${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}`
}

function findMatchingNodes(cy: Core, symbols: string[]) {
  if (!symbols || symbols.length === 0) return cy.collection()
  const lowered = symbols.map((s) => s.toLowerCase().trim()).filter(Boolean)
  if (lowered.length === 0) return cy.collection()

  return cy.nodes().filter((n) => {
    const raw = n.data("raw") as UIGraphNode | undefined
    if (!raw) return false

    const rawName = raw.name.toLowerCase()
    const qualName = (raw.qualifiedName || raw.name).toLowerCase()
    const filePath = (raw.filePath || "").toLowerCase()

    return lowered.some((q) => {
      const shortQ = q.includes(".") ? q.split(".").pop() || q : q
      const nameMatch =
        rawName === q ||
        rawName === shortQ ||
        qualName === q ||
        qualName.endsWith(`.${shortQ}`) ||
        rawName.includes(shortQ)
      const fileMatch =
        filePath &&
        (filePath.endsWith(q) || q.endsWith(filePath) || filePath.includes(q))
      return Boolean(nameMatch || fileMatch)
    })
  })
}

function applyAiTrace(cy: Core, trace: AiTraceDetail | null): boolean {
  // Clear previous trace highlights
  cy.elements().removeClass("ai-target-pulse ai-target-edge ai-pulse-dim")

  const targetSymbols =
    trace?.symbols && trace.symbols.length > 0
      ? trace.symbols
      : trace?.symbolName
        ? [trace.symbolName]
        : []

  if (!trace || targetSymbols.length === 0) return false

  const matching = findMatchingNodes(cy, targetSymbols)
  if (matching.length === 0) return false

  // Apply persistent highlight & smooth pulse ring to target nodes
  matching.addClass("ai-target-pulse active")

  // Highlight connected edges in the call-tree hierarchy
  const connected = matching.connectedEdges()
  connected.addClass("ai-target-edge")

  // Smoothly center on the target node(s)
  cy.stop(true)
  cy.animate({
    center: { eles: matching },
    zoom: Math.min(1.4, cy.zoom() * 1.15),
    duration: 350,
    easing: "ease-out-cubic",
  })

  return true
}

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(
  function GraphCanvas(
    {
      nodes,
      edges,
      layout,
      activeKinds,
      selectedNodeId,
      aiTraceSymbol,
      aiTraceInfo,
      onNodeClick,
      onNodeDoubleClick,
      onBackgroundClick,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const cyRef = useRef<Core | null>(null)

    const theme = useWorkbenchStore((s) => s.theme)
    const isDark = theme === "dark"

    const onNodeClickRef = useRef(onNodeClick)
    onNodeClickRef.current = onNodeClick
    const onNodeDoubleClickRef = useRef(onNodeDoubleClick)
    onNodeDoubleClickRef.current = onNodeDoubleClick
    const onBackgroundClickRef = useRef(onBackgroundClick)
    onBackgroundClickRef.current = onBackgroundClick

    // Keep latest trace in a ref so layout stop callbacks never read a stale closure
    const latestTraceRef = useRef<AiTraceDetail | null>(null)
    latestTraceRef.current =
      aiTraceInfo ||
      (aiTraceSymbol
        ? {
            symbols: [aiTraceSymbol],
            symbolName: aiTraceSymbol,
            status: "running",
          }
        : null)

    useImperativeHandle(ref, () => ({
      fit: () => {
        if (!cyRef.current) return
        cyRef.current.resize()
        cyRef.current.fit(undefined, 35)
      },
      zoomIn: () => {
        if (!cyRef.current) return
        cyRef.current.resize()
        cyRef.current.zoom({
          level: cyRef.current.zoom() * 1.25,
          renderedPosition: {
            x: cyRef.current.width() / 2,
            y: cyRef.current.height() / 2,
          },
        })
      },
      zoomOut: () => {
        if (!cyRef.current) return
        cyRef.current.resize()
        cyRef.current.zoom({
          level: cyRef.current.zoom() * 0.8,
          renderedPosition: {
            x: cyRef.current.width() / 2,
            y: cyRef.current.height() / 2,
          },
        })
      },
      focusNode: (id: string | number) => {
        if (!cyRef.current) return
        cyRef.current.resize()
        const node = cyRef.current.$(`#${toDomSafeNodeId(id)}`)
        if (node.length > 0) {
          cyRef.current.stop(true)
          cyRef.current.animate({
            center: { eles: node },
            zoom: 1.3,
            duration: 350,
          })
          cyRef.current.elements().removeClass("active")
          node.addClass("active")
        }
      },
      pulseAiTrace: (symbolOrSymbols: string | string[]): boolean => {
        if (!cyRef.current) return false
        const syms = Array.isArray(symbolOrSymbols)
          ? symbolOrSymbols
          : [symbolOrSymbols]
        if (syms.length === 0 || !syms[0]) return false
        return applyAiTrace(cyRef.current, {
          symbols: syms,
          symbolName: syms[0],
          toolName: "codegraph_explore",
          status: "running",
        })
      },
    }))

    // Initialize Cytoscape core
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const cy = cytoscape({
        container,
        style: getCytoscapeTheme(isDark),
        boxSelectionEnabled: false,
        autounselectify: false,
        minZoom: 0.2,
        maxZoom: 3.0,
        wheelSensitivity: 0.2,
        textureOnViewport: true,
        hideLabelsOnViewport: true,
        pixelRatio: 1,
      })
      cyRef.current = cy

      const ro = new ResizeObserver(() => {
        if (cyRef.current) {
          cyRef.current.resize()
        }
      })
      ro.observe(container)

      cy.on("tap", "node", (evt: EventObject) => {
        const raw = evt.target.data("raw") as UIGraphNode
        if (raw) onNodeClickRef.current?.(raw)
      })

      cy.on("dbltap", "node", (evt: EventObject) => {
        const raw = evt.target.data("raw") as UIGraphNode
        if (raw) onNodeDoubleClickRef.current?.(raw)
      })

      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          onBackgroundClickRef.current?.()
        }
      })

      return () => {
        ro.disconnect()
        cy.destroy()
        cyRef.current = null
      }
    }, [])

    // Update Cytoscape style dynamically when theme changes
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return
      cy.style(getCytoscapeTheme(isDark))
    }, [isDark])

    // Update Elements and Run Layout
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      cy.resize()

      const visibleNodes = nodes.filter((n) => {
        const kind = n.kind.toLowerCase()
        if (kind === "function" || kind === "method") {
          return activeKinds.has("function")
        }
        if (
          kind === "interface" ||
          kind === "trait" ||
          kind === "protocol" ||
          kind === "type_alias"
        ) {
          return activeKinds.has("interface")
        }
        if (
          kind === "class" ||
          kind === "struct" ||
          kind === "type" ||
          kind === "enum" ||
          kind === "module" ||
          kind === "namespace" ||
          kind === "route" ||
          kind === "component"
        ) {
          return activeKinds.has("class")
        }
        return true
      })

      const visibleNodeIds = new Set(visibleNodes.map((n) => String(n.id)))

      const visibleEdges = edges.filter(
        (e) =>
          visibleNodeIds.has(String(e.sourceId)) &&
          visibleNodeIds.has(String(e.targetId)),
      )

      const elements = [
        ...visibleNodes.map((n) => ({
          group: "nodes" as const,
          data: {
            id: toDomSafeNodeId(n.id),
            label: n.name,
            kind: n.kind.toLowerCase(),
            raw: n,
          },
          classes: n.isActive ? "active" : "",
        })),
        ...visibleEdges.map((e, idx) => ({
          group: "edges" as const,
          data: {
            id: `edge_${String(e.id)}_${idx}`,
            source: toDomSafeNodeId(e.sourceId),
            target: toDomSafeNodeId(e.targetId),
            label: e.relation,
            raw: e,
          },
        })),
      ]

      cy.elements().remove()
      cy.add(elements)

      const reapplyTrace = () => {
        if (latestTraceRef.current && cyRef.current) {
          applyAiTrace(cyRef.current, latestTraceRef.current)
        }
      }

      // Single deterministic layout callback (no duplicate cy.one("layoutstop") + stop)
      try {
        if (visibleEdges.length === 0) {
          const cols = Math.min(
            6,
            Math.max(2, Math.ceil(Math.sqrt(visibleNodes.length))),
          )
          cy.layout({
            name: "grid",
            cols,
            padding: 50,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: true,
            spacingFactor: 1.6,
            animate: true,
            animationDuration: 350,
            animationEasing: "ease-out-cubic",
            stop: reapplyTrace,
          } as cytoscape.LayoutOptions).run()
        } else if (layout === "dagre") {
          cy.layout({
            name: "dagre",
            rankDir: "TB",
            nodeSep: 80,
            rankSep: 100,
            edgeSep: 40,
            fit: true,
            padding: 50,
            spacingFactor: 1.3,
            stop: reapplyTrace,
          } as cytoscape.LayoutOptions).run()
        } else {
          cy.layout({
            name: "cose",
            animate: true,
            animationDuration: 420,
            animationEasing: "ease-out-cubic",
            fit: true,
            padding: 60,
            componentSpacing: 120,
            nodeRepulsion: () => 12000,
            idealEdgeLength: () => 140,
            nodeOverlap: 20,
            stop: reapplyTrace,
          } as cytoscape.LayoutOptions).run()
        }
      } catch {
        cy.layout({
          name: "grid",
          animate: true,
          animationDuration: 300,
          fit: true,
          padding: 40,
          stop: reapplyTrace,
        } as cytoscape.LayoutOptions).run()
      }
    }, [nodes, edges, layout, activeKinds])

    // Highlight selected node
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      cy.nodes().removeClass("active")
      if (selectedNodeId != null) {
        const sel = cy.$(`#${toDomSafeNodeId(selectedNodeId)}`)
        if (sel.length > 0) {
          sel.addClass("active")
        }
      }
    }, [selectedNodeId])

    // Highlight AI trace using stylesheet class toggling (.ai-pulse) instead of inline style mutation
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      const trace =
        aiTraceInfo ||
        (aiTraceSymbol
          ? {
              symbols: [aiTraceSymbol],
              symbolName: aiTraceSymbol,
              status: "running",
            }
          : null)

      const hasSymbols =
        (trace?.symbols && trace.symbols.length > 0) ||
        Boolean(trace?.symbolName)

      if (!trace || !hasSymbols) {
        applyAiTrace(cy, null)
        return
      }

      const applied = applyAiTrace(cy, trace)
      if (!applied) return

      const pulseInterval = setInterval(() => {
        if (!cyRef.current) {
          clearInterval(pulseInterval)
          return
        }
        const targets = cyRef.current.$("node.ai-target-pulse")
        const edges = cyRef.current.$("edge.ai-target-edge")
        if (targets.length === 0) {
          clearInterval(pulseInterval)
          return
        }
        targets.toggleClass("ai-pulse-dim")
        edges.toggleClass("ai-pulse-dim")
      }, 700)

      return () => {
        clearInterval(pulseInterval)
        if (cyRef.current) {
          cyRef.current.elements().removeClass("ai-pulse-dim")
        }
      }
    }, [aiTraceInfo, aiTraceSymbol])

    return (
      <div className="relative flex-1 w-full h-full min-h-0 min-w-0 bg-canvas overflow-hidden">
        <div className="absolute inset-0 w-full h-full" ref={containerRef} />
      </div>
    )
  },
)
