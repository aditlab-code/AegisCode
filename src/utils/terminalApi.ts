// Centralized API client functions for AegisCode PTY Terminal
import { API_BASE } from "./apiBase"

export async function createTerminalApi(shell = "zsh", cwd?: string) {
  try {
    const res = await fetch(`${API_BASE}/api/v1/terminal/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shell, cwd }),
    })
    if (!res.ok) {
      console.warn(
        `[TerminalAPI] create failed (${res.status}): ${res.statusText}`,
      )
      return null
    }
    return (await res.json()) as {
      sessionId: string
      shell: string
      cwd: string
      pid: number
    }
  } catch (err) {
    console.warn("[TerminalAPI] network error creating terminal session:", err)
    return null
  }
}

export async function sendTerminalInputApi(
  sessionId: string,
  data: string,
): Promise<boolean> {
  if (!sessionId || !data) return false
  try {
    const res = await fetch(`${API_BASE}/api/v1/terminal/${sessionId}/input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data }),
    })
    if (!res.ok) {
      console.warn(
        `[TerminalAPI] sendInput failed (${res.status}) for session ${sessionId}`,
      )
    }
    return res.ok
  } catch (err) {
    console.warn(
      `[TerminalAPI] network error sending input to session ${sessionId}:`,
      err,
    )
    return false
  }
}

export async function resizeTerminalApi(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<boolean> {
  if (!sessionId || !cols || !rows) return false
  try {
    const res = await fetch(`${API_BASE}/api/v1/terminal/${sessionId}/resize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cols, rows }),
    })
    if (!res.ok) {
      console.warn(
        `[TerminalAPI] resize failed (${res.status}) for session ${sessionId}`,
      )
    }
    return res.ok
  } catch (err) {
    console.warn(
      `[TerminalAPI] network error resizing session ${sessionId}:`,
      err,
    )
    return false
  }
}

export async function closeTerminalApi(sessionId: string): Promise<boolean> {
  if (!sessionId) return false
  try {
    const res = await fetch(`${API_BASE}/api/v1/terminal/${sessionId}`, {
      method: "DELETE",
    })
    if (!res.ok) {
      console.warn(
        `[TerminalAPI] close failed (${res.status}) for session ${sessionId}`,
      )
    }
    return res.ok
  } catch (err) {
    console.warn(
      `[TerminalAPI] network error closing session ${sessionId}:`,
      err,
    )
    return false
  }
}
