import { useState, useEffect, useMemo } from "react"
import { useWorkbenchStore, useShallow } from "../../../store"
import { Icon } from "../../ui/Icon"
import {
  searchBackendChats,
  type BackendSearchResult,
} from "../../../utils/storeApi"

function renderSnippet(snippet: string) {
  const parts = snippet.split(/(<b>.*?<\/b>)/g)
  return parts.map((part, i) => {
    if (part.startsWith("<b>") && part.endsWith("</b>")) {
      return (
        <strong key={i} className="session-search-highlight">
          {part.slice(3, -4)}
        </strong>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function getWorkspaceName(path?: string): string {
  if (!path) return ""
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] || path
}

export function ChatSessionSidebar() {
  const {
    sessions,
    activeSessionId,
    rootWorkspacePath,
    switchSession,
    deleteSession,
  } = useWorkbenchStore(
    useShallow((s) => ({
      sessions: s.sessions,
      activeSessionId: s.activeSessionId,
      rootWorkspacePath: s.rootWorkspacePath,
      switchSession: s.switchSession,
      deleteSession: s.deleteSession,
    })),
  )

  const [showAllProjects, setShowAllProjects] = useState(false)
  const [query, setQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<BackendSearchResult[]>([])

  const filteredSessions = useMemo(() => {
    if (showAllProjects || !rootWorkspacePath) {
      return sessions
    }
    return sessions.filter(
      (s) => !s.workspacePath || s.workspacePath === rootWorkspacePath,
    )
  }, [sessions, showAllProjects, rootWorkspacePath])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const timeout = setTimeout(
      async () => {
        const lower = trimmed.toLowerCase()
        const localMatches: BackendSearchResult[] = []

        // 1. Instant search across local in-memory sessions (filtered by workspace if applicable)
        for (const s of filteredSessions) {
          let matched = false
          if (s.title && s.title.toLowerCase().includes(lower)) {
            localMatches.push({
              sessionId: s.id,
              sessionTitle: s.title,
              eventId: s.messages?.[0]?.id || s.id,
              snippet: s.title,
              role: "session",
              workspacePath: s.workspacePath,
              createdAt: s.createdAt || Date.now(),
            })
            matched = true
          }

          if (!matched && Array.isArray(s.messages)) {
            for (const m of s.messages) {
              if (m.text && m.text.toLowerCase().includes(lower)) {
                localMatches.push({
                  sessionId: s.id,
                  sessionTitle: s.title,
                  eventId: m.id,
                  snippet:
                    m.text.length > 80 ? `${m.text.slice(0, 80)}...` : m.text,
                  role: m.role || "user",
                  workspacePath: s.workspacePath,
                  createdAt: m.timestamp || s.createdAt || Date.now(),
                })
                break
              }
            }
          }
        }

        // 2. Query backend SQLite FTS5 for deep search across database
        try {
          const wsFilter =
            !showAllProjects && rootWorkspacePath
              ? rootWorkspacePath
              : undefined
          const data = await searchBackendChats(trimmed, 30, wsFilter)
          const backendList = data.results || []

          const seen = new Set<string>()
          const combined: BackendSearchResult[] = []

          // Backend FTS5 results first (have rich snippets and highlights)
          for (const b of backendList) {
            seen.add(b.sessionId)
            combined.push(b)
          }

          // Add local matches for unsynced or newly created sessions
          for (const loc of localMatches) {
            if (!seen.has(loc.sessionId)) {
              seen.add(loc.sessionId)
              combined.push(loc)
            }
          }

          setSearchResults(combined)
        } catch {
          setSearchResults(localMatches)
        } finally {
          setIsSearching(false)
        }
      },
      200,
    )

    return () => clearTimeout(timeout)
  }, [query, filteredSessions, showAllProjects, rootWorkspacePath])

  return (
    <div className="chat-sessions-sidebar">
      <div className="sessions-sidebar-header">
        <div className="sessions-sidebar-title">
          <Icon name="history" size={13} />
          <span>Sessions</span>
          <span className="session-count-badge">
            {query.trim() ? searchResults.length : filteredSessions.length}
          </span>
        </div>
      </div>

      {rootWorkspacePath && (
        <div className="sessions-sidebar-workspace-filter">
          <button
            type="button"
            className={`workspace-filter-toggle ${
              !showAllProjects ? "active" : ""
            }`}
            onClick={() => setShowAllProjects(false)}
            title={`Show sessions for ${getWorkspaceName(rootWorkspacePath)}`}
          >
            <Icon name="folder" size={10} />
            <span>{getWorkspaceName(rootWorkspacePath)}</span>
          </button>
          <button
            type="button"
            className={`workspace-filter-toggle ${
              showAllProjects ? "active" : ""
            }`}
            onClick={() => setShowAllProjects(true)}
            title="Show sessions across all projects"
          >
            <Icon name="tag" size={10} />
            <span>All</span>
          </button>
        </div>
      )}

      <div className="sessions-sidebar-search-container">
        <div className="sessions-sidebar-search-box">
          <Icon name="search" size={12} className="sessions-search-icon" />
          <input
            type="text"
            className="sessions-search-input"
            placeholder="Search chats..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="sessions-search-clear-btn"
              onClick={() => setQuery("")}
              title="Clear search"
            >
              <Icon name="close" size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="sessions-sidebar-list">
        {query.trim() ? (
          isSearching ? (
            <div className="sessions-search-empty">Searching...</div>
          ) : searchResults.length === 0 ? (
            <div className="sessions-search-empty">No matches found</div>
          ) : (
            searchResults.map((res) => {
              const isActive = res.sessionId === activeSessionId
              return (
                <div
                  key={`${res.sessionId}-${res.eventId}`}
                  className={`session-sidebar-card session-search-card ${
                    isActive ? "active" : ""
                  }`}
                  onClick={() => switchSession(res.sessionId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      switchSession(res.sessionId)
                    }
                  }}
                >
                  <div className="session-sidebar-card-content">
                    <div className="session-sidebar-title-row">
                      <span
                        className="session-sidebar-card-title"
                        title={res.sessionTitle}
                      >
                        {res.sessionTitle}
                      </span>
                      {isActive && (
                        <span className="session-sidebar-active-dot" />
                      )}
                    </div>

                    <div className="session-search-snippet">
                      {renderSnippet(res.snippet)}
                    </div>

                    <div className="session-sidebar-meta">
                      <span className="session-card-tag tag-user">
                        {res.role}
                      </span>
                      {showAllProjects && res.workspacePath && (
                        <span
                          className="session-card-tag tag-workspace"
                          title={res.workspacePath}
                        >
                          {getWorkspaceName(res.workspacePath)}
                        </span>
                      )}
                      <span>
                        {new Date(res.createdAt).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )
        ) : filteredSessions.length === 0 ? (
          <div className="sessions-search-empty">
            {rootWorkspacePath && !showAllProjects
              ? "No sessions in this project"
              : "No sessions"}
          </div>
        ) : (
          filteredSessions.map((session) => {
            const isActive = session.id === activeSessionId
            const providerTag =
              session.provider === "antigravity"
                ? "AGY"
                : session.provider === "claude"
                  ? "CLD"
                  : session.provider === "opencode"
                    ? "OC"
                    : "OR"

            return (
              <div
                key={session.id}
                className={`session-sidebar-card ${isActive ? "active" : ""}`}
                onClick={() => switchSession(session.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    switchSession(session.id)
                  }
                }}
              >
                <div className="session-sidebar-card-content">
                  <div className="session-sidebar-title-row">
                    <span
                      className="session-sidebar-card-title"
                      title={session.title}
                    >
                      {session.title}
                    </span>
                    {isActive && (
                      <span className="session-sidebar-active-dot" />
                    )}
                  </div>

                  <div className="session-sidebar-meta">
                    <span
                      className={`session-card-tag tag-${session.provider}`}
                    >
                      {providerTag}
                    </span>
                    {showAllProjects && session.workspacePath && (
                      <span
                        className="session-card-tag tag-workspace"
                        title={session.workspacePath}
                      >
                        {getWorkspaceName(session.workspacePath)}
                      </span>
                    )}
                    <span>{session.messages.length} msg</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="session-sidebar-delete-btn"
                  title="Delete session"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSession(session.id)
                  }}
                >
                  <Icon name="trash" size={11} />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
