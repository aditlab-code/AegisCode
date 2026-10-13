import { useEffect, useRef, useImperativeHandle, forwardRef } from "react"
import cytoscape, { type Core, type EventObject } from "cytoscape"
import dagre from "cytoscape-dagre"
import { getCytoscapeTheme } from "./graphTheme"
import type { LayoutMode } from "./GraphToolbar"
import type {
  UIGraphNode,
  UIGraphEdge,
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
  focusNode: (id: number) => void
  pulseAiTrace: (symbolName: string) => void
}

interface GraphCanvasProps {
  nodes: UIGraphNode[]
  edges: UIGraphEdge[]
  layout: LayoutMode
  activeKinds: Set<string>
  selectedNodeId: number | null
  aiTraceSymbol: string | null
  onNodeClick: (node: UIGraphNode) => void
  onNodeDoubleClick: (node: UIGraphNode) => void
  onBackgroundClick: () => void
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
      onNodeClick,
      onNodeDoubleClick,
      onBackgroundClick,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null)
    const cyRef = useRef<Core | null>(null)

    // Expose imperative methods to parent
    useImperativeHandle(ref, () => ({
      fit: () => {
        cyRef.current?.fit(undefined, 35)
      },
      zoomIn: () => {
        if (!cyRef.current) return
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
        cyRef.current.zoom({
          level: cyRef.current.zoom() * 0.8,
          renderedPosition: {
            x: cyRef.current.width() / 2,
            y: cyRef.current.height() / 2,
          },
        })
      },
      focusNode: (id: number) => {
        if (!cyRef.current) return
        const node = cyRef.current.$(`#sym_${id}`)
        if (node.length > 0) {
          cyRef.current.animate({
            center: { eles: node },
            zoom: 1.3,
            duration: 350,
          })
          cyRef.current.elements().removeClass("active")
          node.addClass("active")
        }
      },
      pulseAiTrace: (symbolName: string) => {
        if (!cyRef.current || !symbolName) return
        cyRef.current.elements().removeClass("ai-trace")
        const matching = cyRef.current.nodes().filter((n) => {
          const raw = n.data("raw") as UIGraphNode | undefined
          return raw?.name.toLowerCase() === symbolName.toLowerCase()
        })
        if (matching.length > 0) {
          matching.addClass("ai-trace")
          matching.connectedEdges().addClass("ai-trace")
          cyRef.current.animate({
            center: { eles: matching },
            zoom: 1.2,
            duration: 350,
          })
        }
      },
    }))

    // Initialize Cytoscape core
    useEffect(() => {
      if (!containerRef.current) return

      const cy = cytoscape({
        container: containerRef.current,
        style: getCytoscapeTheme(true),
        boxSelectionEnabled: false,
        autounselectify: false,
        minZoom: 0.2,
        maxZoom: 3.0,
      })
      cyRef.current = cy

      cy.on("tap", "node", (evt: EventObject) => {
        const raw = evt.target.data("raw") as UIGraphNode
        if (raw) onNodeClick(raw)
      })

      cy.on("dbltap", "node", (evt: EventObject) => {
        const raw = evt.target.data("raw") as UIGraphNode
        if (raw) onNodeDoubleClick(raw)
      })

      cy.on("tap", (evt: EventObject) => {
        if (evt.target === cy) {
          onBackgroundClick()
        }
      })

      return () => {
        cy.destroy()
        cyRef.current = null
      }
    }, [onNodeClick, onNodeDoubleClick, onBackgroundClick])

    // Update Elements and Run Layout
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      // Filter nodes according to activeKinds
      const visibleNodes = nodes.filter((n) => {
        const kind = n.kind.toLowerCase()
        if (kind === "function" || kind === "method") {
          return activeKinds.has("function")
        }
        if (kind === "interface") {
          return activeKinds.has("interface")
        }
        if (kind === "class" || kind === "struct" || kind === "type") {
          return activeKinds.has("class")
        }
        return true
      })

      const visibleNodeIds = new Set(visibleNodes.map((n) => n.id))

      // Only edges whose both source and target are visible
      const visibleEdges = edges.filter(
        (e) => visibleNodeIds.has(e.sourceId) && visibleNodeIds.has(e.targetId),
      )

      const elements = [
        ...visibleNodes.map((n) => ({
          group: "nodes" as const,
          data: {
            id: `sym_${n.id}`,
            label: n.name,
            kind: n.kind.toLowerCase(),
            raw: n,
          },
          classes: n.isActive ? "active" : "",
        })),
        ...visibleEdges.map((e) => ({
          group: "edges" as const,
          data: {
            id: `edge_${e.id}`,
            source: `sym_${e.sourceId}`,
            target: `sym_${e.targetId}`,
            label: e.relation,
            raw: e,
          },
        })),
      ]

      cy.elements().remove()
      cy.add(elements)

      // Layout Execution with animation
      try {
        if (visibleEdges.length === 0) {
          // Disconnected nodes without edges: arrange in a clean 2D card grid
          const cols = Math.min(
            6,
            Math.max(2, Math.ceil(Math.sqrt(visibleNodes.length))),
          )
          const l = cy.layout({
            name: "grid",
            cols,
            padding: 50,
            avoidOverlap: true,
            nodeDimensionsIncludeLabels: true,
            spacingFactor: 1.6,
            animate: true,
            animationDuration: 400,
            animationEasing: "ease-out-cubic",
          } as cytoscape.LayoutOptions)
          l.run()
        } else if (layout === "dagre") {
          const l = cy.layout({
            name: "dagre",
            rankDir: "TB",
            nodeSep: 80,
            rankSep: 100,
            edgeSep: 40,
            fit: true,
            padding: 50,
            spacingFactor: 1.3,
          } as cytoscape.LayoutOptions)
          l.run()
          cy.animate({
            fit: { eles: cy.elements(), padding: 50 },
            duration: 350,
            easing: "ease-out-cubic",
          })
        } else {
          const l = cy.layout({
            name: "cose",
            animate: true,
            animationDuration: 450,
            animationEasing: "ease-out-cubic",
            fit: true,
            padding: 50,
            componentSpacing: 80,
            nodeRepulsion: () => 5000,
          } as cytoscape.LayoutOptions)
          l.run()
        }
      } catch {
        const fallback = cy.layout({
          name: "grid",
          animate: true,
          animationDuration: 300,
          fit: true,
          padding: 40,
        } as cytoscape.LayoutOptions)
        fallback.run()
      }
    }, [nodes, edges, layout, activeKinds])

    // Highlight selected node
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      cy.nodes().removeClass("active")
      if (selectedNodeId != null) {
        const sel = cy.$(`#sym_${selectedNodeId}`)
        if (sel.length > 0) {
          sel.addClass("active")
        }
      }
    }, [selectedNodeId])

    // Highlight AI trace symbol if passed
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      cy.elements().removeClass("ai-trace")
      if (aiTraceSymbol) {
        const matching = cy.nodes().filter((n) => {
          const raw = n.data("raw") as UIGraphNode | undefined
          return raw?.name.toLowerCase() === aiTraceSymbol.toLowerCase()
        })
        if (matching.length > 0) {
          matching.addClass("ai-trace")
          matching.connectedEdges().addClass("ai-trace")
          cy.animate({
            center: { eles: matching },
            zoom: 1.25,
            duration: 350,
          })
        }
      }
    }, [aiTraceSymbol])

    return (
      <div className="relative flex-1 w-full h-full min-h-0 min-w-0 bg-canvas overflow-hidden">
        <div className="absolute inset-0 w-full h-full" ref={containerRef} />
      </div>
    )
  },
)
