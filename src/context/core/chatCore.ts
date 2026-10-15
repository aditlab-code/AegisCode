import type {
  ChatMessage,
  ChatProvider,
  ChatSession,
  ContextItem,
} from "../../types/workbench"
import { CHAT_MODELS } from "../../data/chatConstants"

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
    messages: [],
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
        return parsed.map((s: ChatSession) => ({
          ...s,
          messages: (s.messages || []).filter(
            (m) =>
              !m.text?.includes("New session started. Ready to assist") &&
              !m.text?.includes(
                "I'm connected to your local workspace. What should we build next?",
              ),
          ),
        }))
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

export function formatPromptWithContext(
  text: string,
  context?: ContextItem[],
): string {
  if (!context || context.length === 0) return text
  const parts: string[] = []
  parts.push("<context>")
  for (const item of context) {
    if (item.type === "folder") {
      parts.push(`Directory: ${item.path}`)
    } else {
      const range = item.lineRange ? ` (${item.lineRange})` : ""
      parts.push(`File: ${item.path}${range}\n\`\`\`\n${item.content}\n\`\`\``)
    }
  }
  parts.push("</context>\n")
  parts.push(text)
  return parts.join("\n")
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
    messages: [],
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
      provider: s.provider,
      model: s.model,
    }

    return {
      ...s,
      title: newTitle,
      messages: [...newMessages, agentMsg],
    }
  })
}
