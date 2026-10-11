import { useCallback, useEffect, useState } from "react"
import type {
  ChatMessage,
  ChatProvider,
  ChatSession,
  ContextItem,
} from "../../types/workbench"
import { CHAT_MODELS } from "../../data/chatConstants"
import {
  deleteBackendChatSession,
  fetchBackendChatSession,
  fetchBackendChatSummaries,
  saveBackendChatSession,
} from "../../utils/storeApi"

export const DEFAULT_PROVIDER: ChatProvider = "antigravity"
export const DEFAULT_MODEL = "gemini-3.8-flash"

export function createDefaultSession(
  id = "session-1",
  provider: ChatProvider = DEFAULT_PROVIDER,
  model = DEFAULT_MODEL,
): ChatSession {
  return {
    id,
    title: "New Session",
    provider,
    model,
    messages: [
      {
        id: "msg-1",
        role: "agent",
        text: "I'm connected to your local workspace. What should we build next?",
      },
    ],
    createdAt: Date.now(),
  }
}

export function loadStoredSessions(): ChatSession[] {
  if (typeof window === "undefined") return [createDefaultSession()]
  try {
    const raw = window.localStorage.getItem("aegis_chat_sessions_v2")
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch {}
  return [createDefaultSession()]
}

export function loadStoredActiveId(sessions: ChatSession[]): string {
  if (typeof window === "undefined") return sessions[0]?.id || "session-1"
  try {
    const raw = window.localStorage.getItem("aegis_active_session_id_v2")
    if (raw && sessions.some((s) => s.id === raw)) {
      return raw
    }
  } catch {}
  return sessions[0]?.id || "session-1"
}

export function generateContextualReply(
  text: string,
  provider: ChatProvider,
  model: string,
  context?: ContextItem[],
): string {
  const skillMatch = text.match(/^\/(spec|plan|review|debug|simplify)\b/i)
  const mentions = Array.from(text.matchAll(/@([a-zA-Z0-9_\-./]+)/g)).map(
    (m) => m[0],
  )
  const contextNote =
    mentions.length > 0
      ? `\n• Context: ${mentions.join(", ")}`
      : Array.isArray(context) && context.length > 0
        ? `\n• Attached Context: ${context.map((c) => `${c.path}${c.lineRange ? ` (${c.lineRange})` : ""}`).join(", ")}`
        : ""

  if (skillMatch) {
    const cmd = skillMatch[1].toLowerCase()
    switch (cmd) {
      case "spec":
        return `[${provider} · ${model}] Specification Draft generated:\n• Architectural scope and acceptance criteria established.\n• Microservice boundaries verified.${contextNote}`
      case "plan":
        return `[${provider} · ${model}] Implementation Plan generated:\n1. Audit relevant modules & dependencies\n2. Incremental implementation with verifiable gates\n3. Integration tests and validation${contextNote}`
      case "review":
        return `[${provider} · ${model}] Code Review Audit complete:\n• Verified clean structure and 0 lint violations.\n• Styling tokens and component designs properly reused.${contextNote}`
      case "debug":
        return `[${provider} · ${model}] Diagnostic Analysis complete:\n• Root cause investigated for workspace telemetry.\n• Verified zero runtime regressions.${contextNote}`
      case "simplify":
        return `[${provider} · ${model}] Simplification Analysis complete:\n• Identified opportunities to eliminate unnecessary code.\n• Lightweight design patterns applied.${contextNote}`
    }
  }

  if (mentions.length > 0) {
    return `[${provider} · ${model}] Inspected context for ${mentions.join(", ")}. Ready to proceed with implementation or answer questions.`
  }

  if (context && context.length > 0) {
    return `[${provider} · ${model}] Inspected ${context.length} attached context item(s) (${context.map((c) => c.path).join(", ")}). Ready to assist with your codebase.`
  }

  return `[${provider} · ${model}] Received: "${
    text.length > 40 ? text.slice(0, 40) + "..." : text
  }". Workspace context is ready.`
}

export interface ChatCreateResult {
  sessions: ChatSession[]
  newSession: ChatSession
}

export interface ChatDeleteResult {
  sessions: ChatSession[]
  nextActiveId: string
}

// Pure state transitions for AI sessions
export function createSessionLogic(
  sessions: ChatSession[],
  provider?: ChatProvider,
  model?: string,
): ChatCreateResult {
  const newId = `session-${Date.now()}`
  const p = provider || DEFAULT_PROVIDER
  const m = model || CHAT_MODELS[p]?.[0]?.id || DEFAULT_MODEL
  const newSession: ChatSession = {
    id: newId,
    title: "New Session",
    provider: p,
    model: m,
    messages: [
      {
        id: `msg-${Date.now()}`,
        role: "agent",
        text: `[${p} · ${m}] New session started. Ready to assist with your codebase.`,
      },
    ],
    createdAt: Date.now(),
  }
  return {
    sessions: [newSession, ...sessions],
    newSession,
  }
}

export function deleteSessionLogic(
  sessions: ChatSession[],
  idToDelete: string,
  activeId: string,
): ChatDeleteResult {
  const remaining = sessions.filter((s) => s.id !== idToDelete)
  if (remaining.length === 0) {
    const fresh = createDefaultSession(`session-${Date.now()}`)
    return {
      sessions: [fresh],
      nextActiveId: fresh.id,
    }
  }
  const nextActive = activeId === idToDelete ? remaining[0].id : activeId
  return {
    sessions: remaining,
    nextActiveId: nextActive,
  }
}

export function setSessionModelLogic(
  sessions: ChatSession[],
  activeId: string,
  provider: ChatProvider,
  model: string,
): ChatSession[] {
  return sessions.map((s) => {
    if (s.id === activeId) {
      return { ...s, provider, model }
    }
    return s
  })
}

export function sendChatMessageLogic(
  sessions: ChatSession[],
  activeId: string,
  text: string,
  context?: ContextItem[],
): ChatSession[] {
  const cleanText = text.trim()
  const hasValidContext = Array.isArray(context) && context.length > 0
  if (!cleanText && !hasValidContext) return sessions

  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: "user",
    text: cleanText,
    timestamp: Date.now(),
    context: hasValidContext ? context : undefined,
  }

  return sessions.map((s) => {
    if (s.id !== activeId) return s

    const newMessages = [...s.messages, userMsg]
    const fallbackTitle =
      cleanText ||
      (hasValidContext ? context[0]?.path || "New Session" : "New Session")
    const newTitle =
      s.title === "New Session"
        ? fallbackTitle.slice(0, 26).trim() +
          (fallbackTitle.length > 26 ? "..." : "")
        : s.title

    const agentReplyText = generateContextualReply(
      cleanText,
      s.provider,
      s.model,
      context,
    )
    const agentMsg: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: "agent",
      text: agentReplyText,
      timestamp: Date.now() + 1,
    }

    return {
      ...s,
      title: newTitle,
      messages: [...newMessages, agentMsg],
    }
  })
}

export function useChatCore() {
  const [sessions, setSessions] = useState<ChatSession[]>(loadStoredSessions)
  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    loadStoredActiveId(sessions),
  )

  // Hydrate chat sessions from backend flat-file storage (~/.aegis/chats/*.json)
  useEffect(() => {
    fetchBackendChatSummaries()
      .then(async (summaries) => {
        if (Array.isArray(summaries) && summaries.length > 0) {
          const loadedSessions: ChatSession[] = []
          for (const s of summaries.slice(0, 15)) {
            const full = await fetchBackendChatSession(s.id)
            if (full) loadedSessions.push(full)
          }
          if (loadedSessions.length > 0) {
            setSessions((prev) => {
              const loadedIds = new Set(loadedSessions.map((l) => l.id))
              const localOnly = prev.filter((p) => !loadedIds.has(p.id))
              return [...loadedSessions, ...localOnly]
            })
          }
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "aegis_chat_sessions_v2",
        JSON.stringify(sessions),
      )
    } catch {}
  }, [sessions])

  useEffect(() => {
    try {
      window.localStorage.setItem("aegis_active_session_id_v2", activeSessionId)
    } catch {}
  }, [activeSessionId])

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ||
    sessions[0] ||
    createDefaultSession()
  const activeProvider = activeSession.provider
  const activeModel = activeSession.model
  const chatMessages = activeSession.messages

  // Sync active session changes to backend disk storage
  useEffect(() => {
    if (activeSession) {
      saveBackendChatSession(activeSession).catch(() => {})
    }
  }, [activeSession])

  const createSession = useCallback(
    (provider?: ChatProvider, model?: string) => {
      const res = createSessionLogic(sessions, provider, model)
      setSessions(res.sessions)
      setActiveSessionId(res.newSession.id)
      saveBackendChatSession(res.newSession).catch(() => {})
      return res.newSession.id
    },
    [sessions],
  )

  const switchSession = useCallback((id: string) => {
    setActiveSessionId(id)
  }, [])

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const res = deleteSessionLogic(prev, id, activeSessionId)
        setActiveSessionId(res.nextActiveId)
        return res.sessions
      })
      deleteBackendChatSession(id).catch(() => {})
    },
    [activeSessionId],
  )

  const setSessionModel = useCallback(
    (provider: ChatProvider, model: string) => {
      setSessions((prev) =>
        setSessionModelLogic(prev, activeSessionId, provider, model),
      )
    },
    [activeSessionId],
  )

  const sendChatMessage = useCallback(
    (text: string, context?: ContextItem[]) => {
      setSessions((prev) =>
        sendChatMessageLogic(prev, activeSessionId, text, context),
      )
    },
    [activeSessionId],
  )

  return {
    sessions,
    activeSessionId,
    activeSession,
    activeProvider,
    activeModel,
    chatMessages,
    createSession,
    switchSession,
    deleteSession,
    setSessionModel,
    sendChatMessage,
  }
}
