import type {
  Breakpoint,
  DebugState,
  StreamDebugEvent,
} from "../types/workbench"
import { API_BASE, getSessionToken } from "./apiBase"

function getDebugHeaders(
  extra?: Record<string, string>,
): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    ...extra,
  }
  const tok = getSessionToken()
  if (tok) h["X-Session-Token"] = tok
  return h
}

export interface StartDebugResult {
  status: string
  state?: DebugState
  error?: string
  code?: string
}

/**
 * Initiates a debug session through the Go Core Server.
 */
export async function startDebugSession(
  program?: string,
  args?: string[],
  env?: Record<string, string>,
  cwd?: string,
  breakpoints?: Record<string, number[]>,
  language?: string,
): Promise<StartDebugResult> {
  const resp = await fetch(`${API_BASE}/api/v1/debug/start`, {
    method: "POST",
    headers: getDebugHeaders(),
    body: JSON.stringify({ program, args, env, cwd, breakpoints, language }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return {
      status: "error",
      error: data.message || data.error || "Failed to start debug session",
      code: data.code,
    }
  }
  return data
}

/**
 * Registers breakpoints for a source file.
 */
export async function setBreakpoints(
  file: string,
  lines: number[],
): Promise<Breakpoint[]> {
  const resp = await fetch(`${API_BASE}/api/v1/debug/breakpoints`, {
    method: "POST",
    headers: getDebugHeaders(),
    body: JSON.stringify({ file, lines }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || "Failed to set breakpoints")
  }
  const data = await resp.json()
  return data.breakpoints || []
}

/**
 * Sends a step or flow control command to the debugger.
 */
export async function stepDebug(
  action: "continue" | "stepOver" | "stepIn" | "stepOut" | "pause",
): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/v1/debug/step`, {
    method: "POST",
    headers: getDebugHeaders(),
    body: JSON.stringify({ action }),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || "Failed to step debug")
  }
}

/**
 * Retrieves the current snapshot of debug state (stack frames, variables).
 */
export async function getDebugState(): Promise<DebugState> {
  const resp = await fetch(`${API_BASE}/api/v1/debug/state`, {
    headers: getDebugHeaders(),
  })
  if (!resp.ok) {
    throw new Error("Failed to fetch debug state")
  }
  return resp.json()
}

/**
 * Gracefully terminates the running debug session.
 */
export async function terminateDebugSession(): Promise<void> {
  const resp = await fetch(`${API_BASE}/api/v1/debug/terminate`, {
    method: "POST",
    headers: getDebugHeaders(),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    throw new Error(err.error || "Failed to terminate debug session")
  }
}

/**
 * Connects to the real-time Server-Sent Events stream for debugger events.
 */
export function connectDebugSSE(
  onEvent: (event: StreamDebugEvent) => void,
  onError?: (err: unknown) => void,
): () => void {
  const eventSource = new EventSource(`${API_BASE}/api/v1/events/debug`)

  const handleEvent = (e: MessageEvent) => {
    try {
      const parsed: StreamDebugEvent = JSON.parse(e.data)
      onEvent(parsed)
    } catch {
      // Ignore parse errors on raw keepalives
    }
  }

  eventSource.addEventListener("debug:started", handleEvent)
  eventSource.addEventListener("debug:stopped", handleEvent)
  eventSource.addEventListener("debug:continued", handleEvent)
  eventSource.addEventListener("debug:output", handleEvent)
  eventSource.addEventListener("debug:terminated", handleEvent)

  eventSource.onerror = (err) => {
    if (onError) onError(err)
  }

  return () => {
    eventSource.close()
  }
}
