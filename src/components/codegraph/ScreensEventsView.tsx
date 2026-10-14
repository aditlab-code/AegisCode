import { useState, useEffect } from "react"
import {
  fetchScreens,
  type WireScreensPayload,
  type WireScreen,
  type WireScreenLink,
} from "../../services/codegraphApi"
import { useCodeGraphStore } from "../../store/slices/codegraphSlice"
import { useWorkbenchStore } from "../../store"
import { Icon } from "../ui/Icon"

export function ScreensEventsView() {
  const [data, setData] = useState<WireScreensPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)

  const openEntrypointSteps = useCodeGraphStore((s) => s.openEntrypointSteps)
  const openFileCode = useCodeGraphStore((s) => s.openFileCode)
  const setActiveView = useCodeGraphStore((s) => s.setActiveView)
  const currentWorkspace = useWorkbenchStore((s) => s.rootPath)

  const loadScreens = () => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    fetchScreens(ac.signal, currentWorkspace)
      .then((res) => {
        setData(res)
        if (res.screens && res.screens.length > 0) {
          setSelectedScreenId(res.entry || res.screens[0].id)
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }

  useEffect(() => {
    return loadScreens()
  }, [currentWorkspace])

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-ink-muted bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3" />
        <p className="text-sm">Mapping UI screens, transitions & events...</p>
      </div>
    )
  }

  if (error || !data || !data.routed) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-canvas">
        <Icon name="code" size={32} className="text-ink-muted mb-2" />
        <p className="text-ink font-medium mb-1">
          {error ? "Failed to Load Screens" : "No Multi-Screen Transitions"}
        </p>
        <p className="text-xs text-ink-muted max-w-md mb-4">
          {error ||
            "This project is a web application with standard Next.js App Router components without multi-screen navigation state stacks (such as Expo Router or React Navigation)."}
        </p>
        <div className="flex items-center gap-2">
          {error ? (
            <button
              onClick={loadScreens}
              className="px-3 py-1.5 rounded bg-surface-raised border border-line text-xs font-medium text-ink hover:bg-surface-hover transition-colors"
            >
              Retry
            </button>
          ) : (
            <>
              <button
                onClick={() => setActiveView("entrypoints")}
                className="px-3 py-1.5 rounded bg-accent text-canvas hover:bg-accent/90 text-xs font-medium transition-colors"
              >
                Browse Web Routes
              </button>
              <button
                onClick={() => setActiveView("map")}
                className="px-3 py-1.5 rounded bg-surface-raised border border-line text-xs font-medium text-ink hover:bg-surface-hover transition-colors"
              >
                View Architecture Map
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  const { screens, links } = data
  const selectedScreen =
    screens.find((s) => s.id === selectedScreenId) || screens[0]
  const outgoingLinks = links.filter((l) => l.from === selectedScreen?.id)
  const incomingLinks = links.filter((l) => l.to === selectedScreen?.id)

  return (
    <div className="flex h-full overflow-hidden bg-canvas">
      {/* Screens Sidebar List */}
      <div className="w-72 border-r border-line bg-surface flex flex-col shrink-0">
        <div className="p-3 border-b border-line flex items-center justify-between">
          <span className="text-xs font-semibold text-ink">
            Screens ({screens.length})
          </span>
          <span className="text-[11px] text-ink-muted">
            {links.length} transitions
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {screens.map((screen: WireScreen) => (
            <div
              key={screen.id}
              onClick={() => setSelectedScreenId(screen.id)}
              className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                selectedScreen?.id === screen.id
                  ? "border-accent bg-accent/10 font-medium text-accent"
                  : "border-transparent hover:bg-surface-hover text-ink-soft hover:text-ink"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono truncate">{screen.path}</span>
                {screen.id === data.entry && (
                  <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-accent-soft text-accent">
                    entry
                  </span>
                )}
              </div>
              <div className="text-[10px] text-ink-muted mt-1 truncate">
                {screen.incoming} in · {screen.outgoing} out · {screen.file}:
                {screen.line}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Screen Details & Transitions */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {selectedScreen ? (
          <div className="space-y-6 max-w-4xl">
            {/* Screen Info Header */}
            <div className="p-4 rounded-lg border border-line bg-surface flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-mono font-bold text-ink">
                    {selectedScreen.path}
                  </h3>
                  {selectedScreen.component && (
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-raised text-ink-soft border border-line">
                      {selectedScreen.component.name}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-muted mt-1">
                  File: {selectedScreen.file}:{selectedScreen.line}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    openEntrypointSteps(selectedScreen.id, selectedScreen.path)
                  }
                  className="px-3 py-1 rounded bg-accent-soft text-accent hover:bg-accent hover:text-canvas text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <span>View Steps</span>
                  <Icon name="chevron" size={12} />
                </button>
                <button
                  onClick={() =>
                    openFileCode(
                      selectedScreen.file,
                      selectedScreen.line,
                      selectedScreen.id,
                    )
                  }
                  className="p-1 rounded bg-surface-raised text-ink-muted hover:text-ink transition-colors border border-line"
                  title="Open in FileCode drawer"
                >
                  <Icon name="code" size={14} />
                </button>
              </div>
            </div>

            {/* Outgoing Transitions */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono font-semibold text-ink-soft uppercase tracking-wider">
                Navigates To ({outgoingLinks.length})
              </h4>
              {outgoingLinks.length === 0 ? (
                <div className="text-xs text-ink-muted p-4 border border-line rounded bg-surface/50">
                  No outgoing transitions from this screen.
                </div>
              ) : (
                outgoingLinks.map((link: WireScreenLink, i) => (
                  <div
                    key={link.id || i}
                    className="p-3 border border-line rounded-lg bg-surface space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-ink-muted">
                          →
                        </span>
                        <span className="text-sm font-mono font-semibold text-ink">
                          {link.to}
                        </span>
                        {link.when && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-raised text-warning border border-line">
                            when: {link.when}
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => setSelectedScreenId(link.to)}
                        className="text-xs text-accent hover:underline font-mono"
                      >
                        Inspect Target Screen
                      </button>
                    </div>

                    {link.via && link.via.length > 0 && (
                      <div className="text-xs text-ink-muted font-mono flex items-center gap-1 flex-wrap">
                        <span>via:</span>
                        {link.via.map((v, vIdx) => (
                          <span
                            key={vIdx}
                            onClick={() => openFileCode(v.file, v.line, v.id)}
                            className="bg-surface-raised px-1.5 py-0.5 rounded text-ink-soft hover:text-ink cursor-pointer border border-line"
                          >
                            {v.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Incoming Transitions */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono font-semibold text-ink-soft uppercase tracking-wider">
                Reached From ({incomingLinks.length})
              </h4>
              {incomingLinks.length === 0 ? (
                <div className="text-xs text-ink-muted p-4 border border-line rounded bg-surface/50">
                  No direct screen navigates into this screen (initial
                  entrypoint or deep link).
                </div>
              ) : (
                incomingLinks.map((link: WireScreenLink, i) => (
                  <div
                    key={link.id || i}
                    className="p-3 border border-line rounded-lg bg-surface"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-medium text-ink">
                          {link.from}
                        </span>
                        {link.when && (
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-raised text-warning border border-line">
                            when: {link.when}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedScreenId(link.from)}
                        className="text-xs text-accent hover:underline font-mono"
                      >
                        Go to Origin
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
