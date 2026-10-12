import type { TerminalSession } from "../../types/workbench"
import { initialTerminalSessions } from "../../data/mockData"
import {
  createTerminalApi,
  sendTerminalInputApi,
  closeTerminalApi,
} from "../../utils/terminalApi"
import type { TerminalSlice, SliceCreator } from "../types"
import {
  createTerminalSessionLogic,
  closeTerminalSessionLogic,
  clearTerminalSessionLogic,
  processTerminalCommandLogic,
  type TerminalCreateResult,
  type TerminalCloseResult,
} from "../../context/core/terminalCore"

export {
  createTerminalSessionLogic,
  closeTerminalSessionLogic,
  clearTerminalSessionLogic,
  processTerminalCommandLogic,
  type TerminalCreateResult,
  type TerminalCloseResult,
}

function syncTerminalDerivedState(
  sessions: TerminalSession[],
  activeId: string,
): {
  terminalSessions: TerminalSession[]
  activeTerminalSessionId: string
  activeTerminalSession: TerminalSession | undefined
  terminalLines: string[]
  terminalRunning: boolean
} {
  const active = sessions.find((s) => s.id === activeId) || sessions[0]
  return {
    terminalSessions: sessions,
    activeTerminalSessionId: active?.id || activeId,
    activeTerminalSession: active,
    terminalLines: active?.lines || [],
    terminalRunning: active?.running ?? false,
  }
}

export const createTerminalSlice: SliceCreator<TerminalSlice> = (set, get) => {
  const initialSession = initialTerminalSessions[0]
  const initialActiveId = initialSession?.id || "session-term-1"

  return {
    terminalSessions: initialTerminalSessions,
    activeTerminalSessionId: initialActiveId,
    activeTerminalSession: initialSession,
    terminalLines: initialSession?.lines || [],
    terminalRunning: initialSession?.running ?? false,

    setActiveTerminalSessionId: (id: string) => {
      const { terminalSessions } = get()
      set(syncTerminalDerivedState(terminalSessions, id))
    },

    createTerminalSession: async (shellName = "zsh") => {
      try {
        const data = await createTerminalApi(shellName)
        if (data) {
          const sessions = get().terminalSessions
          if (sessions.length === 1 && !sessions[0]?.isLive) {
            const upgraded: TerminalSession = {
              id: data.sessionId,
              name: `1: ${shellName}`,
              shell: shellName,
              lines: [],
              running: true,
              commandHistory: [],
              isLive: true,
            }
            set(syncTerminalDerivedState([upgraded], data.sessionId))
            return
          }

          const nextNum = sessions.length + 1
          const newSession: TerminalSession = {
            id: data.sessionId,
            name: `${nextNum}: ${shellName}`,
            shell: shellName,
            lines: [],
            running: true,
            commandHistory: [],
            isLive: true,
          }
          set(
            syncTerminalDerivedState([...sessions, newSession], data.sessionId),
          )
          return
        }
      } catch {
        // Fallback to offline logic
      }

      const sessions = get().terminalSessions
      const res = createTerminalSessionLogic(sessions, shellName)
      const updated = res.sessions.map((s) =>
        s.id === res.newSession.id ? { ...s, isLive: false } : s,
      )
      set(syncTerminalDerivedState(updated, res.newSession.id))
    },

    restartTerminalSession: async (id?: string) => {
      const { terminalSessions, activeTerminalSessionId } = get()
      const targetId = id || activeTerminalSessionId
      const found = terminalSessions.find((s) => s.id === targetId)
      const targetShell = found?.shell || "zsh"
      if (found?.isLive) {
        try {
          await closeTerminalApi(targetId)
        } catch {
          // ignore
        }
      }

      try {
        const data = await createTerminalApi(targetShell)
        if (data) {
          const currentSessions = get().terminalSessions
          const index = currentSessions.findIndex((s) => s.id === targetId)
          if (index >= 0) {
            const old = currentSessions[index]!
            const restarted: TerminalSession = {
              ...old,
              id: data.sessionId,
              shell: targetShell,
              lines: [],
              running: true,
              isLive: true,
            }
            const next = [...currentSessions]
            next[index] = restarted
            set(syncTerminalDerivedState(next, data.sessionId))
            return
          }

          const freshSession: TerminalSession = {
            id: data.sessionId,
            name: `1: ${targetShell}`,
            shell: targetShell,
            lines: [],
            running: true,
            commandHistory: [],
            isLive: true,
          }
          set(syncTerminalDerivedState([freshSession], data.sessionId))
          return
        }
      } catch {
        // Fallback if backend offline
      }

      const fallbackSessions = get().terminalSessions.map((s) =>
        s.id === targetId ? { ...s, running: false, isLive: false } : s,
      )
      set(
        syncTerminalDerivedState(
          fallbackSessions,
          get().activeTerminalSessionId,
        ),
      )
    },

    terminateTerminalSession: async (id?: string) => {
      const { terminalSessions, activeTerminalSessionId } = get()
      const targetId = id || activeTerminalSessionId
      const target = terminalSessions.find((s) => s.id === targetId)
      if (target?.isLive) {
        try {
          await closeTerminalApi(targetId)
        } catch {
          // ignore
        }
      }
      const updated = terminalSessions.map((s) =>
        s.id === targetId ? { ...s, running: false } : s,
      )
      set(syncTerminalDerivedState(updated, activeTerminalSessionId))
    },

    closeTerminalSession: async (id?: string) => {
      const { terminalSessions, activeTerminalSessionId } = get()
      const idToClose = id || activeTerminalSessionId
      const target = terminalSessions.find((s) => s.id === idToClose)
      if (target?.isLive) {
        try {
          await closeTerminalApi(idToClose)
        } catch {
          // ignore
        }
      }

      if (terminalSessions.length <= 1) {
        const shell = target?.shell || "zsh"
        try {
          const data = await createTerminalApi(shell)
          if (data) {
            const freshSession: TerminalSession = {
              id: data.sessionId,
              name: `1: ${shell}`,
              shell,
              lines: [],
              running: true,
              commandHistory: [],
              isLive: true,
            }
            set(syncTerminalDerivedState([freshSession], freshSession.id))
            return
          }
        } catch {
          // Fallback to offline reset
        }

        const res = closeTerminalSessionLogic(terminalSessions, idToClose)
        set(syncTerminalDerivedState(res.sessions, res.nextActiveId))
        return
      }

      const res = closeTerminalSessionLogic(terminalSessions, idToClose)
      const nextActiveId =
        activeTerminalSessionId === idToClose
          ? res.nextActiveId
          : activeTerminalSessionId
      set(syncTerminalDerivedState(res.sessions, nextActiveId))
    },

    setTerminalRunning: (r: boolean) => {
      const { terminalSessions, activeTerminalSessionId } = get()
      const updated = terminalSessions.map((s) => {
        if (s.id !== activeTerminalSessionId) return s
        let nextRunning = r
        if (typeof r === "function") {
          const fn = r as (prev: boolean) => boolean
          nextRunning = fn(s.running)
        }
        return { ...s, running: nextRunning }
      })
      set(syncTerminalDerivedState(updated, activeTerminalSessionId))
    },

    sendTerminalCommand: (cmd: string, sessionId?: string) => {
      const { terminalSessions, activeTerminalSessionId } = get()
      const targetId = sessionId || activeTerminalSessionId
      const target = terminalSessions.find((s) => s.id === targetId)
      if (target?.isLive) {
        void sendTerminalInputApi(targetId, cmd + "\n")
      }
      const updated = terminalSessions.map((s) =>
        s.id === targetId ? processTerminalCommandLogic(s, cmd) : s,
      )
      set(syncTerminalDerivedState(updated, activeTerminalSessionId))
    },

    clearTerminal: (sessionId?: string) => {
      const { terminalSessions, activeTerminalSessionId } = get()
      const targetId = sessionId || activeTerminalSessionId
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("aegis:terminal-clear", {
            detail: { sessionId: targetId },
          }),
        )
      }
      const updated = clearTerminalSessionLogic(terminalSessions, targetId)
      set(syncTerminalDerivedState(updated, activeTerminalSessionId))
    },
  }
}
