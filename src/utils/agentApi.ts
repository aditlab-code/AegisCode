import { API_BASE } from "./apiBase"

export interface PersonaPreset {
  id: string
  name: string
  description: string
  templateContent: string
}

export interface AgentRulesStatus {
  hasWorkspaceRules: boolean
  rulesPath: string
  activePersona: string
  presets: PersonaPreset[]
}

export interface WorkspaceCopilotStatus {
  isInitialized: boolean
  hasAegisDir: boolean
  hasTasksDir: boolean
  hasAgentsMd: boolean
  rulesPath: string
  activePersona: string
  taskCount: number
  presets: PersonaPreset[]
}

export interface InitWorkspaceOptions {
  preset?: string
  addToGitignore?: boolean
  createSample?: boolean
  customRules?: string
  overwriteRules?: boolean
}

export interface InitWorkspaceResponse {
  success: boolean
  aegisPath: string
  agentsPath: string
  gitignored: boolean
  taskSlug?: string
}

export interface AgentTaskItem {
  id: string
  title: string
  status: "PENDING" | "IN_PROGRESS" | "PASSED" | "BLOCKED"
  createdAt: string
  path: string
}

export interface WaveStatus {
  waveNumber: number
  name: string
  totalSteps: number
  passedSteps: number
  status: "PENDING" | "IN_PROGRESS" | "PASSED" | "BLOCKED"
}

export interface AgentTaskDetail {
  slug: string
  spec: string
  plan: string
  log: string
  waves: WaveStatus[]
}

export interface InitRulesResult {
  success: boolean
  path: string
}

/**
 * Fetches current workspace AGENTS.md rules status and available persona presets.
 */
export async function fetchAgentRulesStatus(): Promise<AgentRulesStatus> {
  const res = await fetch(`${API_BASE}/api/v1/agent/rules-status`)
  if (!res.ok) {
    throw new Error(`Failed to fetch rules status: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Initializes AGENTS.md in the active workspace with the specified persona preset or custom content.
 */
export async function initAgentRules(
  preset = "kanna",
  content?: string,
): Promise<InitRulesResult> {
  const res = await fetch(`${API_BASE}/api/v1/agent/init-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset, content }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(
      errData.error || `Failed to initialize rules: ${res.statusText}`,
    )
  }
  return res.json()
}

/**
 * Lists all autonomous tasks in .aegis/tasks/.
 */
export async function fetchAgentTasks(): Promise<AgentTaskItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/agent/tasks`)
  if (!res.ok) {
    throw new Error(`Failed to list tasks: ${res.statusText}`)
  }
  const data = await res.json()
  return data.tasks || []
}

/**
 * Creates or scaffolds a new autonomous task under .aegis/tasks/<slug>.
 */
export async function createAgentTask(
  slug: string,
  title: string,
  prompt: string,
): Promise<AgentTaskItem> {
  const res = await fetch(`${API_BASE}/api/v1/agent/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, title, prompt }),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error || `Failed to create task: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Retrieves task detail including markdown contents and extracted waves.
 */
export async function fetchAgentTaskDetail(
  slug: string,
): Promise<AgentTaskDetail> {
  const res = await fetch(
    `${API_BASE}/api/v1/agent/task/${encodeURIComponent(slug)}`,
  )
  if (!res.ok) {
    throw new Error(`Failed to fetch task: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Updates a specific task markdown file (0-spec.md, 0-plan.md, or 0-log.md).
 */
export async function updateAgentTaskFile(
  slug: string,
  filename: string,
  content: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/agent/task/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, content }),
    },
  )
  if (!res.ok) {
    throw new Error(`Failed to update task file: ${res.statusText}`)
  }
}

/**
 * Fetches current workspace Copilot readiness status.
 */
export async function fetchWorkspaceCopilotStatus(): Promise<WorkspaceCopilotStatus> {
  const res = await fetch(`${API_BASE}/api/v1/agent/workspace-status`)
  if (!res.ok) {
    throw new Error(`Failed to fetch workspace status: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Initializes workspace directory (.aegis), tasks ledger, and rules.
 */
export async function initWorkspaceCopilot(
  options: InitWorkspaceOptions = {},
): Promise<InitWorkspaceResponse> {
  const res = await fetch(`${API_BASE}/api/v1/agent/init-workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  })
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(
      errData.error || `Failed to initialize copilot: ${res.statusText}`,
    )
  }
  return res.json()
}
