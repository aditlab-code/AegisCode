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
  pulseAiTrace: (symbolName: string) => boolean
}

export interface AiTraceDetail {
  symbolName: string
  toolName?: string
  status?: string
}

interface GraphCanvasProps {
  nodes: UIGraphNode[]
  edges: UIGraphEdge[]
  layout: LayoutMode
  activeKinds: Set<string>
  selectedNodeId: number | null
  aiTraceSymbol?: string | null
  aiTraceInfo?: AiTraceDetail | null
  onNodeClick: (node: UIGraphNode) => void
  onNodeDoubleClick: (node: UIGraphNode) => void
  onBackgroundClick: () => void
}

function findMatchingNodes(cy: Core, query: string) {
  if (!query) return cy.collection()
  const q = query.toLowerCase().trim()
  return cy.nodes().filter((n) => {
    if (n.id() === "node_ai_caller") return false
    const raw = n.data("raw") as UIGraphNode | undefined
    if (!raw) return false
    const nameMatch =
      raw.name.toLowerCase() === q ||
      raw.name.toLowerCase().includes(q) ||
      q.includes(raw.name.toLowerCase())
    const fileMatch =
      raw.filePath &&
      (raw.filePath.toLowerCase().endsWith(q) ||
        q.endsWith(raw.filePath.toLowerCase()) ||
        raw.filePath.toLowerCase().includes(q))
    return Boolean(nameMatch || fileMatch)
  })
}

function applyAiTrace(cy: Core, trace: AiTraceDetail | null): boolean {
  // Clear any existing dynamic AI caller node and beam edge
  cy.$("#node_ai_caller").remove()
  cy.$("edge[id ^= 'edge_ai_beam']").remove()
  cy.elements().removeClass("ai-trace")

  if (!trace || !trace.symbolName) return false

  const matching = findMatchingNodes(cy, trace.symbolName)
  if (matching.length === 0) return false

  matching.addClass("ai-trace")
  matching.connectedEdges().addClass("ai-trace")

  const isCompleted = trace.status === "completed" || trace.status === "done"
  const targetNode = matching[0]
  const targetPos = targetNode.position()

  // Position the AI caller node near the target
  const aiPos = {
    x: targetPos.x - 220,
    y: targetPos.y - 70,
  }

  const toolTitle = trace.toolName
    ? `AI · ${trace.toolName}`
    : "AI Assistant (MCP)"

  cy.add({
    group: "nodes",
    data: {
      id: "node_ai_caller",
      label: toolTitle,
    },
    classes: `ai-caller${isCompleted ? " completed" : ""}`,
    position: aiPos,
  })

  cy.add({
    group: "edges",
    data: {
      id: `edge_ai_beam_${targetNode.id()}`,
      source: "node_ai_caller",
      target: targetNode.id(),
      label: trace.toolName || "query",
    },
    classes: `ai-beam${isCompleted ? " completed" : ""}`,
  })

  // Animate viewport to frame both AI caller node and target node with padding
  const targetElements = matching.union(cy.$("#node_ai_caller"))
  cy.animate({
    fit: {
      eles: targetElements,
      padding: 70,
    },
    duration: 450,
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

    // Expose imperative methods to parent
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
      focusNode: (id: number) => {
        if (!cyRef.current) return
        cyRef.current.resize()
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
      pulseAiTrace: (symbolName: string): boolean => {
        if (!cyRef.current || !symbolName) return false
        return applyAiTrace(cyRef.current, {
          symbolName,
          toolName: "CodeGraph MCP",
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
        style: getCytoscapeTheme(true),
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
        ro.disconnect()
        cy.destroy()
        cyRef.current = null
      }
    }, [onNodeClick, onNodeDoubleClick, onBackgroundClick])

    // Update Elements and Run Layout
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      // Ensure canvas dimensions match container before elements layout
      cy.resize()

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

      // Callback to re-apply AI trace after layout finishes computing positions
      const reapplyTrace = () => {
        const currentTrace =
          aiTraceInfo ||
          (aiTraceSymbol
            ? { symbolName: aiTraceSymbol, status: "running" }
            : null)
        if (currentTrace) {
          applyAiTrace(cy, currentTrace)
        }
      }

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
            stop: reapplyTrace,
          } as cytoscape.LayoutOptions)
          l.run()
        } else if (layout === "dagre") {
          cy.one("layoutstop", reapplyTrace)
          const l = cy.layout({
            name: "dagre",
            rankDir: "TB",
            nodeSep: 80,
            rankSep: 100,
            edgeSep: 40,
            fit: true,
            padding: 50,
            spacingFactor: 1.3,
            stop: reapplyTrace,
          } as cytoscape.LayoutOptions)
          l.run()
        } else {
          cy.one("layoutstop", reapplyTrace)
          const l = cy.layout({
            name: "cose",
            animate: true,
            animationDuration: 450,
            animationEasing: "ease-out-cubic",
            fit: true,
            padding: 60,
            componentSpacing: 120,
            nodeRepulsion: () => 12000,
            idealEdgeLength: () => 140,
            nodeOverlap: 20,
            stop: reapplyTrace,
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
          stop: reapplyTrace,
        } as cytoscape.LayoutOptions)
        fallback.run()
      }
    }, [nodes, edges, layout, activeKinds, aiTraceInfo, aiTraceSymbol])

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

    // Highlight AI trace and maintain live pulsing animation while active
    useEffect(() => {
      const cy = cyRef.current
      if (!cy) return

      const trace =
        aiTraceInfo ||
        (aiTraceSymbol
          ? { symbolName: aiTraceSymbol, status: "running" }
          : null)

      if (!trace || !trace.symbolName) {
        applyAiTrace(cy, null)
        return
      }

      applyAiTrace(cy, trace)

      if (trace.status !== "completed" && trace.status !== "done") {
        let step = 0
        const pulseInterval = setInterval(() => {
          if (!cyRef.current) {
            clearInterval(pulseInterval)
            return
          }
          const aiNode = cyRef.current.$("#node_ai_caller")
          const matching = findMatchingNodes(cyRef.current, trace.symbolName)
          const beamEdges = cyRef.current.$("edge[id ^= 'edge_ai_beam']")
          if (aiNode.length === 0 && matching.length === 0) {
            clearInterval(pulseInterval)
            return
          }

          if (step % 2 === 0) {
            aiNode.style({
              "border-width": "8px",
              "border-color": "#F0ABFC",
              "background-color": "#9333EA",
            })
            matching.style({
              "border-width": "9px",
              "border-color": "#FDA4AF",
              "background-color": "#E11D48",
            })
            beamEdges.style({
              width: 11,
              "line-color": "#FDA4AF",
              "target-arrow-color": "#FDA4AF",
            })
          } else {
            aiNode.style({
              "border-width": "4.5px",
              "border-color": "#C084FC",
              "background-color": "#7C3AED",
            })
            matching.style({
              "border-width": "5.5px",
              "border-color": "#F43F5E",
              "background-color": "#BE185D",
            })
            beamEdges.style({
              width: 7,
              "line-color": "#F43F5E",
              "target-arrow-color": "#F43F5E",
            })
          }
          step++
        }, 240)

        return () => {
          clearInterval(pulseInterval)
          if (cyRef.current) {
            cyRef.current
              .$("#node_ai_caller")
              .removeStyle("border-width border-color background-color")
            findMatchingNodes(cyRef.current, trace.symbolName).removeStyle(
              "border-width border-color background-color",
            )
            cyRef.current
              .$("edge[id ^= 'edge_ai_beam']")
              .removeStyle("width line-color target-arrow-color")
          }
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
