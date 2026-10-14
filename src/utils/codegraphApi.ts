import {
  fetchFileCode,
  fetchStats,
  searchSymbols,
  triggerInit,
  triggerReindex,
} from "../services/codegraphApi"

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
  engine?: "colbymchenry/codegraph"
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

  const isCodeGraph =
    cleanToolName === "codegraph_explore" ||
    cleanToolName === "codegraph_node" ||
    cleanToolName === "codegraph_search" ||
    cleanToolName === "codegraph_callers" ||
    cleanToolName === "codegraph_callees" ||
    cleanToolName === "codegraph_impact" ||
    cleanToolName === "codegraph_affected" ||
    cleanToolName === "codegraph_files" ||
    cleanToolName === "codegraph_status" ||
    cleanToolName === "codegraph_context"

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

export async function fetchActiveFileGraph(
  filePath: string,
  workspace?: string,
): Promise<UIGraphPayload | null> {
  const cleanPath = filePath.replace(/^\/+/, "")
  const data = await fetchFileCode(cleanPath, undefined, workspace)
  if (!data) return null

  const nodes: UIGraphNode[] = (data.outline?.items || []).map((it: any) => ({
    id: it.id,
    name: it.name,
    qualifiedName: it.qualifiedName || it.name,
    kind: it.kind,
    signature: it.signature || "",
    filePath: it.file || cleanPath,
    lineStart: it.line,
    lineEnd: it.endLine,
    isActive: false,
  }))

  const edges: UIGraphEdge[] = (data.calls?.items || []).map(
    (call: any, idx: number) => ({
      id: idx + 1,
      sourceId: call.from,
      targetId: call.to,
      relation: call.kind || "calls",
      line: call.line || 0,
    }),
  )

  return {
    rootId: cleanPath,
    nodes,
    edges,
    truncated: false,
    total: nodes.length,
    engine: "colbymchenry/codegraph",
  }
}

export async function searchGraphSymbols(
  query: string,
  limit = 20,
  workspace?: string,
): Promise<UIGraphNode[]> {
  const items = await searchSymbols(query, undefined, workspace)
  return items.slice(0, limit).map((it: any) => ({
    id: it.id,
    name: it.name,
    qualifiedName: it.qualifiedName || it.name,
    kind: it.kind,
    signature: it.signature || "",
    filePath: it.file || "",
    lineStart: it.line,
    lineEnd: it.endLine,
    isActive: false,
  }))
}

export async function fetchCodeGraphStatus(
  workspace?: string,
): Promise<GraphStatus | null> {
  const data = await fetchStats(undefined, workspace)
  if (!data) return null

  return {
    workspaceRoot: data.project?.root || data.workspaceRoot || "",
    workspaceHash: data.project?.name || "",
    dbPath: data.index?.backend || "",
    totalFiles: data.graph?.files ?? data.files ?? 0,
    totalSymbols: data.graph?.nodes ?? data.nodes ?? 0,
    totalEdges: data.graph?.edges ?? data.edges ?? 0,
    isIndexing: data.index?.state === "indexing" || data.state === "indexing",
    lastIndexedAt: data.index?.lastIndexedAt || data.lastIndexedAt || 0,
    engine: "colbymchenry/codegraph",
  }
}

export async function triggerCodeGraphInit(
  workspace?: string,
): Promise<boolean> {
  return await triggerInit(workspace)
}

export async function triggerCodeGraphReindex(
  workspace?: string,
): Promise<boolean> {
  return await triggerReindex(workspace)
}

export async function fetchMcpTools(): Promise<McpToolDefinition[]> {
  const res = await fetch(`${API_BASE}/api/v1/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }),
  })
  if (!res.ok) {
    throw new Error(
      `Failed to fetch MCP tools: HTTP ${res.status} ${res.statusText}`,
    )
  }
  const data = await res.json()
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error))
  }
  return data.result?.tools || []
}

export async function callMcpTool(
  toolName: string,
  toolArgs: Record<string, unknown> = {},
): Promise<unknown> {
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
  if (!res.ok) {
    throw new Error(
      `MCP tool call failed: HTTP ${res.status} ${res.statusText}`,
    )
  }
  const data = await res.json()
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error))
  }
  return data.result || data
}
