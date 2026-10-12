import type { SliceCreator, ChatSlice } from "../types"
import type {
  ChatMessage,
  ChatProvider,
  ChatSession,
  ContextItem,
  ProviderModel,
  SkillCommand,
} from "../../types/workbench"
import { CHAT_MODELS, SKILL_COMMANDS } from "../../data/chatConstants"
import {
  deleteBackendChatSession,
  fetchAIModels,
  fetchAISkills,
  fetchBackendChatSession,
  fetchBackendChatSummaries,
  saveBackendChatSession,
  streamAIChat,
} from "../../utils/storeApi"
import { fetchFileContent } from "../../utils/workspaceApi"

import {
  createSessionLogic,
  deleteSessionLogic,
  sendChatMessageLogic,
  setSessionModelLogic,
  generateContextualReply,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  createDefaultSession,
  loadStoredSessions,
  loadStoredActiveId,
  formatPromptWithContext,
  type ChatCreateResult,
  type ChatDeleteResult,
} from "../../context/core/chatCore"

import {
  extractEditorContext,
  buildMentionContextItem,
  enforceContextTokenBudget,
  estimateTokens,
  isPathExcluded,
  MAX_CONTEXT_CHARS,
  extractFileOutline,
  extractSnippet,
} from "../../context/core/contextExtractorCore"

export {
  createSessionLogic,
  deleteSessionLogic,
  sendChatMessageLogic,
  setSessionModelLogic,
  generateContextualReply,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  createDefaultSession,
  loadStoredSessions,
  extractEditorContext,
  buildMentionContextItem,
  enforceContextTokenBudget,
  estimateTokens,
  isPathExcluded,
  MAX_CONTEXT_CHARS,
  extractFileOutline,
  extractSnippet,
}

export type { ChatCreateResult, ChatDeleteResult }

let chatAbortController: AbortController | null = null
let chatSaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSaveSession: ChatSession | null = null

function debouncedSaveBackendSession(session: ChatSession) {
  pendingSaveSession = session
  if (chatSaveTimer) clearTimeout(chatSaveTimer)
  chatSaveTimer = setTimeout(() => {
    saveBackendChatSession(session).catch(() => {})
    pendingSaveSession = null
  }, 3000)
}

function persistSessions(sessions: ChatSession[], activeSessionId?: string) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "aegis_chat_sessions_v2",
        JSON.stringify(sessions),
      )
      if (activeSessionId) {
        window.localStorage.setItem(
          "aegis_active_session_id_v2",
          activeSessionId,
        )
      }
    }
  } catch {}
}

function getActiveChatState(sessions: ChatSession[], activeSessionId: string) {
  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ||
    sessions[0] ||
    createDefaultSession()
  return {
    sessions,
    activeSessionId: activeSession.id,
    activeSession,
    activeProvider: activeSession.provider,
    activeModel: activeSession.model,
    chatMessages: activeSession.messages,
  }
}

function computeContextItems(
  activeTab: string | undefined,
  fileBuffers: Record<string, { content: string }> | undefined,
  selection: {
    selectedText?: string
    startLine: number
    endLine: number
  } | undefined,
  excludePatterns: string[] | undefined,
  dismissedPaths: string[],
  contextModeOverrides: Record<string, "selection" | "full">,
  manualMentions: ContextItem[],
): ContextItem[] {
  const items: ContextItem[] = []
  if (
    activeTab &&
    fileBuffers?.[activeTab]?.content &&
    !dismissedPaths.includes(activeTab)
  ) {
    const activeBuffer = fileBuffers[activeTab].content
    const mode = contextModeOverrides[activeTab]
    const activeItem = extractEditorContext({
      path: activeTab,
      content: activeBuffer,
      selectedText: selection?.selectedText,
      selectionRange: selection
        ? {
            startLine: selection.startLine,
            endLine: selection.endLine,
          }
        : undefined,
      excludePatterns,
      mode,
    })
    if (activeItem) {
      items.push(activeItem)
    }
  }
  items.push(...manualMentions)
  return enforceContextTokenBudget(items)
}

function recomputeContext(
  state: {
    activeTab?: string
    fileBuffers?: Record<string, any>
    selection?: any
    settings?: any
    dismissedPaths: string[]
    contextModeOverrides: Record<string, "selection" | "full">
    manualMentions: ContextItem[]
  },
  overrides?: {
    dismissedPaths?: string[]
    contextModeOverrides?: Record<string, "selection" | "full">
    manualMentions?: ContextItem[]
  },
): ContextItem[] {
  const dismissed = overrides?.dismissedPaths ?? state.dismissedPaths
  const modeOverrides =
    overrides?.contextModeOverrides ?? state.contextModeOverrides
  const mentions = overrides?.manualMentions ?? state.manualMentions
  return computeContextItems(
    state.activeTab,
    state.fileBuffers,
    state.selection,
    state.settings?.files?.exclude,
    dismissed,
    modeOverrides,
    mentions,
  )
}

function updateAgentMessageInSessions(
  sessions: ChatSession[],
  sessionId: string,
  msgId: string,
  updater: (msg: ChatMessage) => ChatMessage,
): ChatSession[] {
  return sessions.map((s) => {
    if (s.id !== sessionId) return s
    return {
      ...s,
      messages: s.messages.map((m) => {
        if (m.id !== msgId) return m
        return updater(m)
      }),
    }
  })
}

export const createChatSlice: SliceCreator<ChatSlice> = (set, get) => {
  const initialSessions = loadStoredSessions()
  const initialActiveId = loadStoredActiveId(initialSessions)
  const initialActiveSession =
    initialSessions.find((s) => s.id === initialActiveId) ||
    initialSessions[0] ||
    createDefaultSession()

  // Hydrate models, skills, and backend chat storage in the background
  if (typeof window !== "undefined") {
    fetchAIModels()
      .then((models) => {
        if (Array.isArray(models) && models.length > 0) {
          CHAT_MODELS.antigravity = models
          set({ antigravityModels: models })
        }
      })
      .catch(() => {})

    fetchAISkills()
      .then((skills) => {
        if (Array.isArray(skills) && skills.length > 0) {
          set({ skills })
        }
      })
      .catch(() => {})

    fetchBackendChatSummaries()
      .then(async (summaries) => {
        if (Array.isArray(summaries) && summaries.length > 0) {
          const loadedSessions: ChatSession[] = []
          for (const s of summaries.slice(0, 15)) {
            const full = await fetchBackendChatSession(s.id)
            if (full) loadedSessions.push(full)
          }
          if (loadedSessions.length > 0) {
            const state = get()
            const loadedIds = new Set(loadedSessions.map((l) => l.id))
            const localOnly = state.sessions.filter((p) => !loadedIds.has(p.id))
            const merged = [...loadedSessions, ...localOnly]
            persistSessions(merged)
            set({
              ...getActiveChatState(merged, state.activeSessionId),
            })
          }
        }
      })
      .catch(() => {})

    const handleUnload = () => {
      if (pendingSaveSession) {
        saveBackendChatSession(pendingSaveSession, {
          keepalive: true,
        }).catch(() => {})
        pendingSaveSession = null
      }
    }
    window.addEventListener("beforeunload", handleUnload)
    window.addEventListener("pagehide", handleUnload)
  }

  return {
    sessions: initialSessions,
    activeSessionId: initialActiveSession.id,
    activeSession: initialActiveSession,
    activeProvider: initialActiveSession.provider,
    activeModel: initialActiveSession.model,
    chatMessages: initialActiveSession.messages,
    isGenerating: false,
    stopGenerating: () => {
      if (chatAbortController) {
        chatAbortController.abort()
        chatAbortController = null
      }
      set({ isGenerating: false })
    },
    skills: SKILL_COMMANDS,
    antigravityModels: CHAT_MODELS.antigravity,

    createSession: (provider?: ChatProvider, model?: string) => {
      const state = get()
      const agentSettings = state.settings?.agent
      const p = provider || agentSettings?.defaultProvider || DEFAULT_PROVIDER
      const m =
        model ||
        (p === agentSettings?.defaultProvider
          ? agentSettings?.model
          : undefined)

      const res = createSessionLogic(state.sessions, p, m)
      persistSessions(res.sessions, res.newSession.id)
      set({
        ...getActiveChatState(res.sessions, res.newSession.id),
      })
      saveBackendChatSession(res.newSession).catch(() => {})
      return res.newSession
    },

    switchSession: (id: string) => {
      const state = get()
      const target = state.sessions.find((s) => s.id === id)
      if (!target) return
      persistSessions(state.sessions, id)
      set({
        ...getActiveChatState(state.sessions, id),
      })
    },

    deleteSession: (id: string) => {
      const state = get()
      const res = deleteSessionLogic(state.sessions, id, state.activeSessionId)
      persistSessions(res.sessions, res.nextActiveId)
      set({
        ...getActiveChatState(res.sessions, res.nextActiveId),
      })
      deleteBackendChatSession(id).catch(() => {})
    },

    setSessionModel: (providerOrModel: string, optionalModel?: string) => {
      const state = get()
      const currentProvider = state.activeProvider || DEFAULT_PROVIDER
      const provider = optionalModel
        ? providerOrModel as ChatProvider
        : currentProvider
      const model = optionalModel ?? providerOrModel
      const nextSessions = setSessionModelLogic(
        state.sessions,
        state.activeSessionId,
        provider,
        model,
      )
      persistSessions(nextSessions)
      set({
        ...getActiveChatState(nextSessions, state.activeSessionId),
      })
      const active = nextSessions.find((s) => s.id === state.activeSessionId)
      if (active) {
        debouncedSaveBackendSession(active)
      }
    },

    sendChatMessage: (text: string, customContext?: ContextItem[]) => {
      const state = get()
      const cleanText = text.trim()
      const itemsToSend =
        customContext !== undefined ? customContext : recomputeContext(state)
      const hasValidContext =
        Array.isArray(itemsToSend) && itemsToSend.length > 0
      if (!cleanText && !hasValidContext) return

      const activeSession =
        state.activeSession ||
        state.sessions.find((s) => s.id === state.activeSessionId) ||
        createDefaultSession()
      const activeSessionId = activeSession.id

      const userMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "user",
        text: cleanText,
        timestamp: Date.now(),
        context: hasValidContext ? itemsToSend : undefined,
      }

      const agentMsgId = `msg-${Date.now() + 1}`
      const initialAgentMsg: ChatMessage = {
        id: agentMsgId,
        role: "agent",
        text: "",
        thinking: "",
        toolCalls: [],
        isStreaming: true,
        provider: activeSession.provider,
        model: activeSession.model,
        timestamp: Date.now() + 1,
      }

      const fallbackTitle =
        cleanText ||
        (hasValidContext
          ? itemsToSend[0]?.path || "New Session"
          : "New Session")
      const newTitle =
        activeSession.title === "New Session"
          ? fallbackTitle.slice(0, 26).trim() +
            (fallbackTitle.length > 26 ? "..." : "")
          : activeSession.title

      const nextSessions = state.sessions.map((s) => {
        if (s.id !== activeSessionId) return s
        return {
          ...s,
          title: newTitle,
          messages: [...s.messages, userMsg, initialAgentMsg],
        }
      })

      persistSessions(nextSessions)
      set({
        ...getActiveChatState(nextSessions, activeSessionId),
        isGenerating: true,
      })

      // Clear manual mentions after message dispatched
      get().clearManualMentions()

      if (chatAbortController) {
        chatAbortController.abort()
      }
      const controller = new AbortController()
      chatAbortController = controller

      const fullPrompt = formatPromptWithContext(cleanText, itemsToSend)
      const effectiveModel =
        activeSession.model === "gemini-3.8-flash"
          ? "gemini-3.8-flash-high"
          : activeSession.model

      let pendingDelta = ""
      let pendingThinking = ""
      let flushRafId: number | null = null
      let lastFlushTime = 0
      const BATCH_INTERVAL_MS = 40

      const flushDeltasSync = () => {
        if (flushRafId !== null) {
          if (typeof cancelAnimationFrame !== "undefined") {
            cancelAnimationFrame(flushRafId)
          }
          flushRafId = null
        }
        if (!pendingDelta && !pendingThinking) return
        const deltaToApply = pendingDelta
        const thinkingToApply = pendingThinking
        pendingDelta = ""
        pendingThinking = ""
        lastFlushTime =
          typeof performance !== "undefined" ? performance.now() : Date.now()
        const cur = get()
        const updated = updateAgentMessageInSessions(
          cur.sessions,
          activeSessionId,
          agentMsgId,
          (m) => ({
            ...m,
            ...(deltaToApply ? { text: m.text + deltaToApply } : {}),
            ...(thinkingToApply ? { thinking: thinkingToApply } : {}),
          }),
        )
        set({
          ...getActiveChatState(updated, activeSessionId),
        })
      }

      const scheduleFlush = () => {
        if (flushRafId !== null) return
        const now =
          typeof performance !== "undefined" ? performance.now() : Date.now()
        const elapsed = now - lastFlushTime
        if (elapsed >= BATCH_INTERVAL_MS) {
          flushDeltasSync()
        } else {
          if (typeof requestAnimationFrame !== "undefined") {
            flushRafId = requestAnimationFrame(() => {
              flushRafId = null
              flushDeltasSync()
            })
          } else {
            flushDeltasSync()
          }
        }
      }

      streamAIChat(
        {
          conversationId: activeSession.conversationId,
          provider: activeSession.provider,
          model: effectiveModel,
          prompt: fullPrompt,
        },
        (event) => {
          if (event.type === "start" && event.conversationId) {
            const cur = get()
            const updated = cur.sessions.map((s) =>
              s.id === activeSessionId
                ? { ...s, conversationId: event.conversationId }
                : s,
            )
            set({
              ...getActiveChatState(updated, activeSessionId),
            })
          } else if (event.type === "thinking") {
            if (event.thinking) {
              pendingThinking = event.thinking
              scheduleFlush()
            }
          } else if (event.type === "tool_call") {
            if (event.toolCall) {
              const cur = get()
              const updated = updateAgentMessageInSessions(
                cur.sessions,
                activeSessionId,
                agentMsgId,
                (m) => {
                  const existing = m.toolCalls || []
                  const foundIdx = existing.findIndex(
                    (t) => t.id === event.toolCall.id,
                  )
                  const nextTCs =
                    foundIdx >= 0
                      ? existing.map((t, idx) =>
                          idx === foundIdx ? { ...t, ...event.toolCall } : t,
                        )
                      : [...existing, event.toolCall]
                  return { ...m, toolCalls: nextTCs }
                },
              )
              set({
                ...getActiveChatState(updated, activeSessionId),
              })
            }
          } else if (event.type === "chunk") {
            if (event.delta) {
              pendingDelta += event.delta
              scheduleFlush()
            }
          } else if (event.type === "done") {
            flushDeltasSync()
            const cur = get()
            const updated = updateAgentMessageInSessions(
              cur.sessions,
              activeSessionId,
              agentMsgId,
              (m) => ({
                ...m,
                isStreaming: false,
                text: event.message?.text || m.text,
                thinking: event.message?.thinking || m.thinking,
                toolCalls: event.message?.toolCalls || m.toolCalls,
              }),
            )
            persistSessions(updated)
            set({
              ...getActiveChatState(updated, activeSessionId),
              isGenerating: false,
            })
            const finalActive = updated.find((s) => s.id === activeSessionId)
            if (finalActive) {
              debouncedSaveBackendSession(finalActive)
            }
            chatAbortController = null
          } else if (event.type === "error") {
            flushDeltasSync()
            const cur = get()
            const updated = updateAgentMessageInSessions(
              cur.sessions,
              activeSessionId,
              agentMsgId,
              (m) => ({
                ...m,
                isStreaming: false,
                error:
                  event.error ||
                  "An error occurred while processing the request",
              }),
            )
            persistSessions(updated)
            set({
              ...getActiveChatState(updated, activeSessionId),
              isGenerating: false,
            })
            chatAbortController = null
          }
        },
        controller.signal,
      ).catch((err) => {
        flushDeltasSync()
        const cur = get()
        if (controller.signal.aborted) {
          const updated = updateAgentMessageInSessions(
            cur.sessions,
            activeSessionId,
            agentMsgId,
            (m) => ({
              ...m,
              isStreaming: false,
              error: "Generation stopped by user.",
            }),
          )
          persistSessions(updated)
          set({
            ...getActiveChatState(updated, activeSessionId),
            isGenerating: false,
          })
        } else {
          const updated = updateAgentMessageInSessions(
            cur.sessions,
            activeSessionId,
            agentMsgId,
            (m) => ({
              ...m,
              isStreaming: false,
              error: err?.message || "Connection to AI disconnected.",
            }),
          )
          persistSessions(updated)
          set({
            ...getActiveChatState(updated, activeSessionId),
            isGenerating: false,
          })
        }
        chatAbortController = null
      })
    },

    appendChatChunk: (sessionId: string, chunk: string) => {
      const state = get()
      const sessions = state.sessions
      const targetSession = sessions.find((s) => s.id === sessionId)
      if (!targetSession || targetSession.messages.length === 0) return

      const updatedSessions = sessions.map((s) => {
        if (s.id !== sessionId) return s
        const msgs = [...s.messages]
        const lastIdx = msgs.length - 1
        if (lastIdx >= 0) {
          const lastMsg = msgs[lastIdx]
          msgs[lastIdx] = {
            ...lastMsg,
            text: (lastMsg.text || "") + chunk,
          }
        }
        return { ...s, messages: msgs }
      })

      const active =
        updatedSessions.find((s) => s.id === state.activeSessionId) ||
        state.activeSession
      set({
        sessions: updatedSessions,
        activeSession: active,
        chatMessages: active ? active.messages : state.chatMessages,
      })
    },

    contextItems: [],
    manualMentions: [],
    dismissedPaths: [],
    contextModeOverrides: {},

    dismissContextItem: (id: string) => {
      const state = get()
      const activeTab = state.activeTab
      const nextDismissed = [...state.dismissedPaths]
      if (activeTab && id.startsWith(`ctx-${activeTab}-`)) {
        if (!nextDismissed.includes(activeTab)) {
          nextDismissed.push(activeTab)
        }
      }
      const nextMentions = state.manualMentions.filter((m) => m.id !== id)
      const items = recomputeContext(state, {
        dismissedPaths: nextDismissed,
        manualMentions: nextMentions,
      })
      set({
        dismissedPaths: nextDismissed,
        manualMentions: nextMentions,
        contextItems: items,
      })
    },

    toggleContextItemMode: (id: string) => {
      const state = get()
      const activeTab = state.activeTab
      const nextOverrides = { ...state.contextModeOverrides }
      let nextMentions = [...state.manualMentions]

      if (activeTab && id.startsWith(`ctx-${activeTab}-`)) {
        const current =
          nextOverrides[activeTab] ||
          (id.includes("selection") ? "selection" : "full")
        nextOverrides[activeTab] =
          current === "selection" ? "full" : "selection"
      } else {
        const cycle: Record<string, "reference" | "snippet" | "full"> = {
          reference: "snippet",
          snippet: "full",
          full: "reference",
        }
        nextMentions = nextMentions.map((item) => {
          if (item.id !== id) return item
          const nextMode = cycle[item.mode] || "reference"
          const raw = item.rawBuffer || item.content
          const updated = buildMentionContextItem(item.path, raw, nextMode)
          return updated || item
        })
      }

      const items = recomputeContext(state, {
        contextModeOverrides: nextOverrides,
        manualMentions: nextMentions,
      })
      set({
        contextModeOverrides: nextOverrides,
        manualMentions: nextMentions,
        contextItems: items,
      })
    },

    addMentionContext: async (path: string) => {
      const state = get()
      let content = state.fileBuffers?.[path]?.content
      if (content === undefined) {
        try {
          content = await fetchFileContent(path)
        } catch {
          content = ""
        }
      }
      if (!content) return
      const item = buildMentionContextItem(path, content, "reference")
      if (!item) return

      const curMentions = get().manualMentions
      if (curMentions.some((p) => p.path === path)) return

      const nextMentions = [...curMentions, item]
      const curState = get()
      const items = recomputeContext(curState, { manualMentions: nextMentions })
      set({
        manualMentions: nextMentions,
        contextItems: items,
      })
    },

    clearManualMentions: () => {
      const state = get()
      const items = recomputeContext(state, { manualMentions: [] })
      set({
        manualMentions: [],
        contextItems: items,
      })
    },
  }
}
