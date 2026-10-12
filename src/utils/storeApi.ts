import type { ChatSession, GraphNode } from "../types/workbench"

export interface BackendConfig {
  theme?: string
  defaultProvider?: string
  defaultModel?: string
  providerBaseUrls?: Record<string, string>
  providerKeys?: Record<string, string>
  bypassCommands?: Record<string, string>
  bypassTokens?: Record<string, string>
  customModels?: Record<string, string[]>
  settings?: Record<string, any>
  updatedAt?: number
}

export interface ProviderTestRequest {
  provider: string
  model?: string
  apiKey?: string
  baseUrl?: string
  command?: string
}

export interface ProviderTestResponse {
  success: boolean
  provider: string
  model?: string
  latencyMs: number
  message: string
  error?: string
}

export interface BackendAppState {
  recentProjects: string[]
  lastWorkspace?: string
  activeSessionId?: string
  updatedAt?: number
}

export interface BackendChatSummary {
  id: string
  title: string
  provider: string
  model: string
  messageCount: number
  createdAt: number
  updatedAt: number
}

const API_BASE = ""

export async function fetchBackendConfig(): Promise<BackendConfig | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/config`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function saveBackendConfig(
  config: Partial<BackendConfig>,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function testProviderConnection(
  req: ProviderTestRequest,
): Promise<ProviderTestResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/ai/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    })

    if (!res.ok) {
      const errText = await res.text()
      try {
        const errJson = JSON.parse(errText)
        return {
          success: false,
          provider: req.provider,
          model: req.model,
          latencyMs: 0,
          message: errJson.message || `Server returned HTTP ${res.status}`,
          error: errJson.error || errText,
        }
      } catch {
        return {
          success: false,
          provider: req.provider,
          model: req.model,
          latencyMs: 0,
          message:
            res.status === 404
              ? "Backend API endpoint not found. Please restart server: npm run server"
              : `Server returned HTTP ${res.status}`,
          error: errText.slice(0, 120),
        }
      }
    }

    const data = await res.json()
    return data
  } catch (err: any) {
    return {
      success: false,
      provider: req.provider,
      model: req.model,
      latencyMs: 0,
      message: "Network error connecting to local Aegis server",
      error: err?.message || "Network request failed",
    }
  }
}

export async function fetchBackendState(): Promise<BackendAppState | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/state`)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function saveBackendState(
  state: Partial<BackendAppState>,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function addBackendRecentProject(
  path: string,
): Promise<string[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/state/recent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) return null
    const data: BackendAppState = await res.json()
    return data.recentProjects || []
  } catch {
    return null
  }
}

export async function removeBackendRecentProject(
  path: string,
): Promise<string[] | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/state/recent?path=${encodeURIComponent(path)}`,
      {
        method: "DELETE",
      },
    )
    if (!res.ok) return null
    const data: BackendAppState = await res.json()
    return data.recentProjects || []
  } catch {
    return null
  }
}

export async function clearBackendRecentProjects(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/state/recent?all=true`, {
      method: "DELETE",
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchBackendChatSummaries(): Promise<BackendChatSummary[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/chats`)
    if (!res.ok) return []
    const data = await res.json()
    return data.chats || []
  } catch {
    return []
  }
}

export async function fetchBackendChatSession(
  id: string,
): Promise<ChatSession | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/chats/${encodeURIComponent(id)}`,
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function saveBackendChatSession(
  session: ChatSession,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/chats/${encodeURIComponent(session.id)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(session),
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export async function deleteBackendChatSession(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/chats/${encodeURIComponent(id)}`,
      {
        method: "DELETE",
      },
    )
    return res.ok
  } catch {
    return false
  }
}

export interface StreamChatRequest {
  workspaceDir?: string
  conversationId?: string
  provider?: string
  model?: string
  prompt: string
  apiKey?: string
  baseUrl?: string
}

export interface StreamEvent {
  type: "start" | "thinking" | "tool_call" | "chunk" | "done" | "error"
  conversationId?: string
  delta?: string
  thinking?: string
  toolCall?: any
  message?: any
  error?: string
}

export async function fetchAIModels(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/ai/models`)
    if (!res.ok) return []
    const data = await res.json()
    return data.models || []
  } catch {
    return []
  }
}

export async function fetchAISkills(): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/ai/skills`)
    if (!res.ok) return []
    const data = await res.json()
    return data.skills || []
  } catch {
    return []
  }
}

export async function fetchAITranscript(
  conversationId: string,
): Promise<any[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/ai/transcript/${encodeURIComponent(conversationId)}`,
    )
    if (!res.ok) return []
    const data = await res.json()
    return data.messages || []
  } catch {
    return []
  }
}

export async function streamAIChat(
  req: StreamChatRequest,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  })

  if (!res.ok) {
    let errMsg = `Server returned ${res.status} ${res.statusText}`
    try {
      const errJson = await res.json()
      if (errJson.error) errMsg = errJson.error
    } catch {}
    onEvent({ type: "error", error: errMsg })
    return
  }

  if (!res.body) {
    onEvent({ type: "error", error: "Empty response body from AI server" })
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n\n")
      buffer = lines.pop() || ""

      for (const block of lines) {
        if (!block.trim()) continue
        const eventLines = block.split("\n")
        let currentType = "chunk"
        let dataStr = ""

        for (const line of eventLines) {
          if (line.startsWith("event: ")) {
            currentType = line.slice(7).trim()
          } else if (line.startsWith("data: ")) {
            dataStr = line.slice(6).trim()
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr)
            onEvent({
              type: currentType as any || parsed.type || "chunk",
              ...parsed,
            })
          } catch {
            onEvent({
              type: "chunk",
              delta: dataStr,
            })
          }
        }
      }
    }
  } catch (err: any) {
    if (signal?.aborted) {
      onEvent({ type: "error", error: "Generation stopped by user." })
      return
    }
    onEvent({ type: "error", error: err?.message || "Stream read error" })
  }
}

export interface AppendEventResponse {
  status: string
  nodeId?: string
  node?: GraphNode
}

export async function appendChatEvent(
  sessionId: string,
  node: GraphNode,
): Promise<AppendEventResponse | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/chats/${encodeURIComponent(sessionId)}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(node),
      },
    )
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function fetchChatBlob(hash: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/blobs/${encodeURIComponent(hash)}`,
    )
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

export async function fetchChatNodes(
  sessionId: string,
  tail?: number,
): Promise<GraphNode[]> {
  try {
    const url = `${API_BASE}/api/v1/chats/${encodeURIComponent(sessionId)}?format=graph${
      tail ? `&tail=${tail}` : ""
    }`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data.nodes || []
  } catch {
    return []
  }
}

/**
 * Reconstructs the linear dialogue path from any active leaf node back to the root.
 * Time Complexity: O(D), where D is depth of the conversation branch (typically < 100).
 * Space Complexity: O(D).
 */
export function reconstructPath(
  nodes: Map<string, GraphNode> | GraphNode[],
  activeLeafId: string,
): GraphNode[] {
  const nodeMap: Map<string, GraphNode> =
    nodes instanceof Map ? nodes : new Map(nodes.map((n) => [n.id, n]))

  const path: GraphNode[] = []
  let current: GraphNode | undefined = nodeMap.get(activeLeafId)
  const visited = new Set<string>()

  while (current && !visited.has(current.id)) {
    visited.add(current.id)
    path.unshift(current)
    if (!current.parent) break
    current = nodeMap.get(current.parent)
  }

  return path
}
