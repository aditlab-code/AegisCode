import type { TerminalSession } from "../../types/workbench"

export interface TerminalCreateResult {
  sessions: TerminalSession[]
  newSession: TerminalSession
}

export interface TerminalCloseResult {
  sessions: TerminalSession[]
  nextActiveId: string
}

// Pure state transition functions for terminal sessions
export function createTerminalSessionLogic(
  sessions: TerminalSession[],
  shellName = "zsh",
): TerminalCreateResult {
  const nextNum = sessions.length + 1
  const newSession: TerminalSession = {
    id: `session-term-${Date.now()}`,
    name: `${nextNum}: ${shellName}`,
    shell: shellName,
    lines: [
      `➜ New terminal session started (${shellName})`,
      `SSE connected · session local-${String(nextNum).padStart(2, "0")}`,
    ],
    running: true,
    commandHistory: [],
  }
  return {
    sessions: [...sessions, newSession],
    newSession,
  }
}

export function closeTerminalSessionLogic(
  sessions: TerminalSession[],
  idToClose: string,
): TerminalCloseResult {
  if (sessions.length <= 1) {
    const reset: TerminalSession = {
      id: `session-term-${Date.now()}`,
      name: "1: zsh",
      shell: "zsh",
      lines: ["Terminal reset"],
      running: true,
      commandHistory: [],
    }
    return {
      sessions: [reset],
      nextActiveId: reset.id,
    }
  }

  const filtered = sessions.filter((s) => s.id !== idToClose)
  return {
    sessions: filtered,
    nextActiveId: filtered[0]?.id || "",
  }
}

export function processTerminalCommandLogic(
  session: TerminalSession,
  commandText: string,
  cwd?: string,
): TerminalSession {
  const value = commandText.trim()
  if (!value) return session

  const nextHistory = [...session.commandHistory]
  if (nextHistory[nextHistory.length - 1] !== value) {
    nextHistory.push(value)
  }

  if (value === "clear") {
    return { ...session, lines: [], commandHistory: nextHistory }
  }

  let extraLines: string[] = []
  if (value === "lint") {
    extraLines = [`$ ${value}`, "Lint complete · 1 error, 1 warning · 42 ms"]
  } else if (value.startsWith("echo ")) {
    extraLines = [`$ ${value}`, value.slice(5)]
  } else if (value === "pwd") {
    extraLines = [`$ ${value}`, cwd || "/workspace"]
  } else if (value === "ls") {
    extraLines = [
      `$ ${value}`,
      "src  public  package.json  vite.config.ts  README.md",
    ]
  } else {
    extraLines = [`$ ${value}`, `command queued locally: ${value}`]
  }

  return {
    ...session,
    lines: [...session.lines, ...extraLines],
    commandHistory: nextHistory,
  }
}

export function clearTerminalSessionLogic(
  sessions: TerminalSession[],
  sessionId: string,
): TerminalSession[] {
  return sessions.map((s) => (s.id === sessionId ? { ...s, lines: [] } : s))
}
