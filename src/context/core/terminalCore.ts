import { useCallback, useState } from "react"
import type { TerminalSession } from "../../types/workbench"
import { initialTerminalSessions } from "../../data/mockData"

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
    extraLines = [
      `$ ${value}`,
      "/Users/aditwicaksono/Documents/Project-AI/AegisCodev2",
    ]
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

export function useTerminalCore() {
  const [terminalSessions, setTerminalSessions] = useState<TerminalSession[]>(
    () => initialTerminalSessions,
  )
  const [activeTerminalSessionId, setActiveTerminalSessionId] =
    useState<string>(() => initialTerminalSessions[0]?.id || "session-term-1")

  const activeTerminalSession =
    terminalSessions.find((s) => s.id === activeTerminalSessionId) ||
    terminalSessions[0]
  const terminalLines = activeTerminalSession?.lines || []
  const terminalRunning = activeTerminalSession?.running ?? false

  const setTerminalRunning = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setTerminalSessions((sessions) =>
        sessions.map((s) => {
          if (s.id !== activeTerminalSessionId) return s
          const nextRunning =
            typeof value === "function" ? value(s.running) : value
          return { ...s, running: nextRunning }
        }),
      )
    },
    [activeTerminalSessionId],
  )

  const createTerminalSession = useCallback((shellName = "zsh") => {
    setTerminalSessions((sessions) => {
      const res = createTerminalSessionLogic(sessions, shellName)
      setActiveTerminalSessionId(res.newSession.id)
      return res.sessions
    })
  }, [])

  const closeTerminalSession = useCallback((idToClose: string) => {
    setTerminalSessions((sessions) => {
      const res = closeTerminalSessionLogic(sessions, idToClose)
      setActiveTerminalSessionId((currId) =>
        currId === idToClose ? res.nextActiveId : currId,
      )
      return res.sessions
    })
  }, [])

  const clearTerminal = useCallback(
    (sessionId?: string) => {
      const targetId = sessionId || activeTerminalSessionId
      setTerminalSessions((sessions) =>
        clearTerminalSessionLogic(sessions, targetId),
      )
    },
    [activeTerminalSessionId],
  )

  const sendTerminalCommand = useCallback(
    (commandText: string, sessionId?: string) => {
      const targetId = sessionId || activeTerminalSessionId
      setTerminalSessions((sessions) =>
        sessions.map((s) =>
          s.id === targetId ? processTerminalCommandLogic(s, commandText) : s,
        ),
      )
    },
    [activeTerminalSessionId],
  )

  return {
    terminalSessions,
    activeTerminalSessionId,
    activeTerminalSession,
    setActiveTerminalSessionId,
    createTerminalSession,
    closeTerminalSession,
    terminalLines,
    terminalRunning,
    setTerminalRunning,
    sendTerminalCommand,
    clearTerminal,
  }
}
