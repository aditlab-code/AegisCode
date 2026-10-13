const API_BASE = ""

export interface UIGraphNode {
  id: number
  name: string
  kind: string
  signature: string
  filePath: string
  lineStart: number
  lineEnd: number
  doc?: string
  isActive: boolean
}

export interface UIGraphEdge {
  id: number
  sourceId: number
  targetId: number
  relation: string
  line: number
}

export interface UIGraphPayload {
  rootId: number
  nodes: UIGraphNode[]
  edges: UIGraphEdge[]
  truncated: boolean
  total: number
}

export interface GraphStatus {
  workspaceRoot: string
  workspaceHash: string
  dbPath: string
  totalFiles: number
  totalSymbols: number
  totalEdges: number
  isIndexing: boolean
  lastIndexedAt: number
}

export interface McpToolProperty {
  type?: string
  description?: string
}

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema?: {
    type?: string
    properties?: Record<string, McpToolProperty>
    required?: string[]
  }
}

export async function fetchSymbolNeighborhood(
  symbolId: number,
  depth = 1,
  limit = 50,
): Promise<UIGraphPayload | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/codegraph/neighborhood?id=${symbolId}&depth=${depth}&limit=${limit}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchActiveFileGraph(
  filePath: string,
): Promise<UIGraphPayload | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/codegraph/file?path=${encodeURIComponent(filePath)}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchWorkspaceGraph(
  limit = 50,
): Promise<UIGraphPayload | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/codegraph/workspace?limit=${limit}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function searchGraphSymbols(
  query: string,
  limit = 20,
): Promise<UIGraphNode[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/codegraph/symbols/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    )
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

export async function fetchCodeGraphStatus(): Promise<GraphStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/codegraph/status`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function triggerCodeGraphReindex(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/codegraph/reindex`, {
      method: "POST",
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchMcpTools(): Promise<McpToolDefinition[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.result?.tools || []
  } catch {
    return []
  }
}

export async function callMcpTool(
  toolName: string,
  toolArgs: Record<string, unknown> = {},
): Promise<unknown> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "tools/call",
        params: {
          name: toolName,
          arguments: toolArgs,
        },
      }),
    })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const data = await res.json()
    return data.result || data.error || data
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
