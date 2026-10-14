const API_BASE = ""

export interface UIGraphNode {
  id: string | number
  name: string
  qualifiedName?: string
  kind: string
  signature: string
  filePath: string
  lineStart: number
  lineEnd: number
  doc?: string
  isExported?: boolean
  isActive: boolean
}

export interface UIGraphEdge {
  id: number | string
  sourceId: string | number
  targetId: string | number
  relation: string
  line: number
}

export interface UIGraphPayload {
  rootId: string | number
  nodes: UIGraphNode[]
  edges: UIGraphEdge[]
  truncated: boolean
  total: number
  engine?: "colbymchenry/codegraph" | "aegis-fallback"
}

export interface GraphStatus {
  workspaceRoot: string
  workspaceHash: string
  dbPath: string
  indexedFiles?: number
  totalFiles: number
  totalSymbols: number
  totalEdges: number
  isIndexing: boolean
  lastIndexedAt: number
  engine?: string
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

export interface AiTraceState {
  symbols: string[]
  symbolName: string
  rawQuery: string
  filePath?: string
  toolName: string
  provider: string
  model: string
  status: "running" | "completed" | "error"
  timestamp: number
}

const STOP_WORDS = new Set([
  "how",
  "does",
  "what",
  "where",
  "when",
  "why",
  "who",
  "which",
  "the",
  "and",
  "for",
  "from",
  "with",
  "into",
  "reach",
  "work",
  "flow",
  "call",
  "calls",
  "called",
  "caller",
  "callers",
  "callee",
  "callees",
  "file",
  "files",
  "in",
  "to",
  "of",
  "is",
  "are",
  "trace",
  "explore",
  "find",
  "show",
  "read",
])

/**
 * Extracts target symbols and query metadata from @colbymchenry/codegraph MCP tools
 * (`codegraph_explore`, `codegraph_node`, `codegraph_search`, `codegraph_callers`,
 * `codegraph_callees`, `codegraph_impact`, `codegraph_files`, `codegraph_status`)
 * as well as legacy CodeGraph tool names.
 */
export function extractCodeGraphTraceTargets(
  rawToolName: string,
  args?: Record<string, any>,
  targetFile?: string,
): {
  isCodeGraph: boolean
  cleanToolName: string
  symbols: string[]
  primarySymbol: string
  rawQuery: string
  filePath?: string
} {
  const cleanRaw = (rawToolName || "").trim()
  const withoutMcpPrefix = cleanRaw.replace(/^mcp__codegraph__/i, "")
  const cleanToolName = withoutMcpPrefix.startsWith("codegraph:")
    ? withoutMcpPrefix.replace(/^codegraph:/i, "codegraph_")
    : withoutMcpPrefix

  const isColbyTool =
    cleanToolName === "codegraph_explore" ||
    cleanToolName === "codegraph_node" ||
    cleanToolName === "codegraph_search" ||
    cleanToolName === "codegraph_callers" ||
    cleanToolName === "codegraph_callees" ||
    cleanToolName === "codegraph_impact" ||
    cleanToolName === "codegraph_files" ||
    cleanToolName === "codegraph_status"

  const baseLegacy = cleanToolName.replace(/^codegraph_/i, "")
  const isLegacyTool =
    baseLegacy === "get_file_outline" ||
    baseLegacy === "get_symbol_definition" ||
    baseLegacy === "find_callers" ||
    baseLegacy === "find_callees" ||
    baseLegacy === "query_subgraph" ||
    baseLegacy === "read_symbol_body" ||
    baseLegacy === "get_diff_impact"

  const isCodeGraph = isColbyTool || isLegacyTool
  if (!isCodeGraph) {
    return {
      isCodeGraph: false,
      cleanToolName,
      symbols: [],
      primarySymbol: "",
      rawQuery: "",
    }
  }

  const rawQuery = String(
    args?.query ||
      args?.symbol ||
      args?.symbol_name ||
      args?.function_name ||
      args?.root_symbol ||
      args?.name ||
      args?.file ||
      args?.file_path ||
      args?.rel_path ||
      args?.path ||
      targetFile ||
      "",
  ).trim()

  const filePath = (args?.file ||
    args?.file_path ||
    args?.rel_path ||
    args?.file_hint ||
    targetFile) as string | undefined

  if (!rawQuery) {
    return {
      isCodeGraph: true,
      cleanToolName,
      symbols: [],
      primarySymbol: "",
      rawQuery: "",
      filePath,
    }
  }

  // Tokenize `codegraph_explore` multi-symbol queries (e.g. "AuthService.login SessionStore")
  const rawTokens = rawQuery
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^['"`(]+|['"`):?]+$/g, ""))
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t.toLowerCase()))

  const identifierTokens = rawTokens.filter(
    (t) => /[./\\_]/.test(t) || /[A-Z]/.test(t) || rawTokens.length <= 3,
  )

  const symbols = Array.from(
    new Set(identifierTokens.length > 0 ? identifierTokens : [rawQuery]),
  ).slice(0, 6)

  return {
    isCodeGraph: true,
    cleanToolName,
    symbols,
    primarySymbol: symbols[0] || rawQuery,
    rawQuery,
    filePath,
  }
}

export async function fetchSymbolNeighborhood(
  symbolId: string | number,
  depth = 1,
  limit = 60,
): Promise<UIGraphPayload | null> {
  try {
    const encoded = encodeURIComponent(String(symbolId))
    const res = await fetch(
      `${API_BASE}/api/v1/codegraph/neighborhood?id=${encoded}&depth=${depth}&limit=${limit}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchExploreSubgraph(
  symbols: string[],
  limit = 60,
): Promise<UIGraphPayload | null> {
  if (!symbols || symbols.length === 0) return null
  try {
    const q = encodeURIComponent(symbols.join(" "))
    const res = await fetch(
      `${API_BASE}/api/v1/codegraph/neighborhood?symbol=${q}&depth=2&limit=${limit}`,
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
