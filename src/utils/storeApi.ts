import type { ChatSession } from "../types/workbench"

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
