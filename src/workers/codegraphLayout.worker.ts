/**
 * Web Worker for CodeGraph Layout Computation (ADR-0012 Zero-Freeze Architecture)
 * Offloads DAG layer calculation, cycle breaking, and coordinate assignments
 * from the React main thread.
 */

export interface Point {
  x: number
  y: number
}

export interface Bounds {
  width: number
  height: number
}

export interface LayoutNode {
  id: string
  label: string
  width?: number
  height?: number
  layer?: number
  x?: number
  y?: number
  [key: string]: any
}

export interface LayoutEdge {
  source: string
  target: string
  weight?: number
  points?: Point[]
  [key: string]: any
}

export interface MapLayoutRequest {
  type: "MAP_LAYOUT"
  modules: LayoutNode[]
  links: LayoutEdge[]
  canvasWidth: number
  canvasHeight: number
}

export interface FlowLayoutRequest {
  type: "FLOW_LAYOUT"
  callers: LayoutNode[]
  focus: LayoutNode
  callees: LayoutNode[]
  canvasWidth: number
  canvasHeight: number
}

export type LayoutRequest = MapLayoutRequest | FlowLayoutRequest

export interface MapLayoutResponse {
  type: "MAP_LAYOUT_RESULT"
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  bounds: Bounds
}

export interface FlowLayoutResponse {
  type: "FLOW_LAYOUT_RESULT"
  callers: LayoutNode[]
  focus: LayoutNode
  callees: LayoutNode[]
  edges: LayoutEdge[]
  bounds: Bounds
}

export type LayoutResponse = MapLayoutResponse | FlowLayoutResponse

/**
 * Computes layered DAG coordinates for the Architecture Map
 */
export function layoutMap(
  modules: LayoutNode[],
  links: LayoutEdge[],
  canvasWidth = 1200,
  _canvasHeight = 800,
): MapLayoutResponse {
  if (modules.length === 0) {
    return {
      type: "MAP_LAYOUT_RESULT",
      nodes: [],
      edges: [],
      bounds: { width: 400, height: 300 },
    }
  }

  // 1. Build adjacency
  const inDegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  modules.forEach((m) => {
    inDegree[m.id] = 0
    adj[m.id] = []
  })

  links.forEach((link) => {
    if (adj[link.source] && inDegree[link.target] !== undefined) {
      adj[link.source].push(link.target)
      inDegree[link.target]++
    }
  })

  // 2. Layer assignment (Longest path ranking)
  const layers: Record<string, number> = {}
  const queue: string[] = []

  // Seeds (in-degree 0 or least dependencies)
  modules.forEach((m) => {
    if (inDegree[m.id] === 0) {
      layers[m.id] = 0
      queue.push(m.id)
    }
  })

  // Cycle break fallback
  if (queue.length === 0 && modules.length > 0) {
    layers[modules[0].id] = 0
    queue.push(modules[0].id)
  }

  while (queue.length > 0) {
    const curr = queue.shift()!
    const currLayer = layers[curr] || 0
    const neighbors = adj[curr] || []
    for (const next of neighbors) {
      if (layers[next] === undefined || layers[next] < currLayer + 1) {
        layers[next] = Math.min(currLayer + 1, 8)
        queue.push(next)
      }
    }
  }

  // Fallback for unvisited nodes
  modules.forEach((m) => {
    if (layers[m.id] === undefined) {
      layers[m.id] = 1
    }
  })

  // Group nodes by layer
  const layerBuckets: Record<number, LayoutNode[]> = {}
  modules.forEach((m) => {
    const l = layers[m.id] || 0
    if (!layerBuckets[l]) layerBuckets[l] = []
    layerBuckets[l].push(m)
  })

  const sortedLayers = Object.keys(layerBuckets)
    .map(Number)
    .sort((a, b) => a - b)

  const nodeWidth = 220
  const nodeHeight = 90
  const xGap = 40
  const yGap = 80
  let maxY = 40

  const positionedNodes: LayoutNode[] = []
  const nodePosMap = new Map<string, Point>()

  sortedLayers.forEach((layerIndex) => {
    const nodesInLayer = layerBuckets[layerIndex]
    const rowWidth =
      nodesInLayer.length * nodeWidth + (nodesInLayer.length - 1) * xGap
    const startX = Math.max(40, (canvasWidth - rowWidth) / 2)
    const currentY = 40 + layerIndex * (nodeHeight + yGap)
    maxY = Math.max(maxY, currentY + nodeHeight)

    nodesInLayer.forEach((node, idx) => {
      const posX = startX + idx * (nodeWidth + xGap)
      const positioned = {
        ...node,
        width: nodeWidth,
        height: nodeHeight,
        x: posX,
        y: currentY,
        layer: layerIndex,
      }
      positionedNodes.push(positioned)
      nodePosMap.set(node.id, { x: posX, y: currentY })
    })
  })

  // Position edges
  const positionedEdges: LayoutEdge[] = links.map((link) => {
    const sPos = nodePosMap.get(link.source)
    const tPos = nodePosMap.get(link.target)
    if (!sPos || !tPos) {
      return link
    }
    const startX = sPos.x + nodeWidth / 2
    const startY = sPos.y + nodeHeight
    const endX = tPos.x + nodeWidth / 2
    const endY = tPos.y

    return {
      ...link,
      points: [
        { x: startX, y: startY },
        { x: startX, y: startY + 20 },
        { x: endX, y: endY - 20 },
        { x: endX, y: endY },
      ],
    }
  })

  return {
    type: "MAP_LAYOUT_RESULT",
    nodes: positionedNodes,
    edges: positionedEdges,
    bounds: {
      width: Math.max(canvasWidth, 800),
      height: maxY + 100,
    },
  }
}

/**
 * Computes 3-column coordinates for the Directed Flow View
 */
export function layoutFlow(
  callers: LayoutNode[],
  focus: LayoutNode,
  callees: LayoutNode[],
  canvasWidth = 1200,
  _canvasHeight = 600,
): FlowLayoutResponse {
  const colWidth = 280
  const itemHeight = 70
  const itemGap = 20

  const col1X = Math.max(40, (canvasWidth - colWidth * 3 - 120) / 2)
  const col2X = col1X + colWidth + 60
  const col3X = col2X + colWidth + 60

  let maxItems = Math.max(callers.length, 1, callees.length)
  const totalHeight = maxItems * (itemHeight + itemGap) + 80

  const focusY = Math.max(40, totalHeight / 2 - itemHeight / 2)
  const positionedFocus: LayoutNode = {
    ...focus,
    x: col2X,
    y: focusY,
    width: colWidth,
    height: itemHeight,
  }

  const callerStartY = Math.max(
    40,
    (totalHeight - (callers.length * (itemHeight + itemGap) - itemGap)) / 2,
  )
  const positionedCallers = callers.map((c, i) => ({
    ...c,
    x: col1X,
    y: callerStartY + i * (itemHeight + itemGap),
    width: colWidth,
    height: itemHeight,
  }))

  const calleeStartY = Math.max(
    40,
    (totalHeight - (callees.length * (itemHeight + itemGap) - itemGap)) / 2,
  )
  const positionedCallees = callees.map((c, i) => ({
    ...c,
    x: col3X,
    y: calleeStartY + i * (itemHeight + itemGap),
    width: colWidth,
    height: itemHeight,
  }))

  const edges: LayoutEdge[] = []

  // Edges from callers to focus
  positionedCallers.forEach((c) => {
    edges.push({
      source: c.id,
      target: focus.id,
      points: [
        { x: c.x! + colWidth, y: c.y! + itemHeight / 2 },
        {
          x: (c.x! + colWidth + positionedFocus.x!) / 2,
          y: c.y! + itemHeight / 2,
        },
        {
          x: (c.x! + colWidth + positionedFocus.x!) / 2,
          y: positionedFocus.y! + itemHeight / 2,
        },
        { x: positionedFocus.x!, y: positionedFocus.y! + itemHeight / 2 },
      ],
    })
  })

  // Edges from focus to callees
  positionedCallees.forEach((c) => {
    edges.push({
      source: focus.id,
      target: c.id,
      points: [
        {
          x: positionedFocus.x! + colWidth,
          y: positionedFocus.y! + itemHeight / 2,
        },
        {
          x: (positionedFocus.x! + colWidth + c.x!) / 2,
          y: positionedFocus.y! + itemHeight / 2,
        },
        {
          x: (positionedFocus.x! + colWidth + c.x!) / 2,
          y: c.y! + itemHeight / 2,
        },
        { x: c.x!, y: c.y! + itemHeight / 2 },
      ],
    })
  })

  return {
    type: "FLOW_LAYOUT_RESULT",
    callers: positionedCallers,
    focus: positionedFocus,
    callees: positionedCallees,
    edges,
    bounds: {
      width: col3X + colWidth + 60,
      height: Math.max(totalHeight, 400),
    },
  }
}

// ── Web Worker Message Handling ──
if (typeof self !== "undefined" && typeof self.postMessage === "function") {
  self.onmessage = (event: MessageEvent<LayoutRequest>) => {
    const data = event.data
    if (!data) return

    if (data.type === "MAP_LAYOUT") {
      const res = layoutMap(
        data.modules,
        data.links,
        data.canvasWidth,
        data.canvasHeight,
      )
      self.postMessage(res)
    } else if (data.type === "FLOW_LAYOUT") {
      const res = layoutFlow(
        data.callers,
        data.focus,
        data.callees,
        data.canvasWidth,
        data.canvasHeight,
      )
      self.postMessage(res)
    }
  }
}
