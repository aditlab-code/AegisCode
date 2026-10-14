import { useState, useEffect } from "react"
import {
  fetchEntrypoints,
  type WireEntryPoints,
  type WireRoute,
  type WireEntryFile,
  type WireEntryTest,
  type WireEntryHub,
} from "../../services/codegraphApi"
import { useCodeGraphStore } from "../../store/slices/codegraphSlice"
import { Icon } from "../ui/Icon"

export function EntrypointsView() {
  const [data, setData] = useState<WireEntryPoints | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] =
    useState<"routes" | "files" | "tests" | "hubs">("routes")

  const openEntrypointSteps = useCodeGraphStore((s) => s.openEntrypointSteps)
  const openFileCode = useCodeGraphStore((s) => s.openFileCode)
  const inspectSymbolFlow = useCodeGraphStore((s) => s.inspectSymbolFlow)

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    fetchEntrypoints(ac.signal)
      .then((res) => {
        if (!res) {
          setError("Failed to retrieve entrypoints from CodeGraph daemon.")
        } else {
          setData(res)
          // Default tab: if routes exist, routes; otherwise files
          if (!res.routes.routed && res.files.items.length > 0) {
            setActiveTab("files")
          }
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(String(err))
        }
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [])

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-ink-muted bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3" />
        <p className="text-sm">Scanning project entrypoints & routes...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-canvas">
        <Icon name="error" size={32} className="text-warning mb-2" />
        <p className="text-ink font-medium mb-1">Entrypoints Unavailable</p>
        <p className="text-xs text-ink-muted max-w-md">
          {error || "No entrypoints found."}
        </p>
      </div>
    )
  }

  const { routes, files, tests, hubs, frameworks } = data

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      {/* Category Sub-Navigation */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2 bg-surface">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab("routes")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "routes"
                ? "bg-accent-soft text-accent border border-accent/30"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink border border-transparent"
            }`}
          >
            HTTP Routes & APIs ({routes.routeCount})
          </button>
          <button
            onClick={() => setActiveTab("files")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "files"
                ? "bg-accent-soft text-accent border border-accent/30"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink border border-transparent"
            }`}
          >
            Binaries & Roots ({files.total})
          </button>
          <button
            onClick={() => setActiveTab("hubs")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "hubs"
                ? "bg-accent-soft text-accent border border-accent/30"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink border border-transparent"
            }`}
          >
            Hub Symbols ({hubs.total})
          </button>
          <button
            onClick={() => setActiveTab("tests")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeTab === "tests"
                ? "bg-accent-soft text-accent border border-accent/30"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink border border-transparent"
            }`}
          >
            Test Suites ({tests.total})
          </button>
        </div>

        {frameworks.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-ink-muted">
            <span>Framework:</span>
            {frameworks.map((fw) => (
              <span
                key={fw}
                className="rounded bg-surface-raised px-1.5 py-0.5 text-ink-soft border border-line"
              >
                {fw}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {activeTab === "routes" && (
          <div className="space-y-2">
            {routes.items.items.length === 0 ? (
              <div className="text-center p-8 text-xs text-ink-muted">
                No HTTP routes detected in this project. Check "Binaries &
                Roots" or "Hub Symbols".
              </div>
            ) : (
              routes.items.items.map((route: WireRoute) => (
                <div
                  key={route.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface hover:bg-surface-hover transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                        route.method === "GET"
                          ? "bg-blue-soft text-blue"
                          : route.method === "POST"
                            ? "bg-green-soft text-green"
                            : route.method === "PUT" || route.method === "PATCH"
                              ? "bg-warning-soft text-warning"
                              : route.method === "DELETE"
                                ? "bg-error-soft text-error"
                                : "bg-surface-raised text-ink-soft"
                      }`}
                    >
                      {route.method}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-mono font-medium text-ink truncate">
                        {route.path}
                      </div>
                      <div className="text-xs text-ink-muted truncate">
                        {route.file}:{route.line}{" "}
                        {route.framework && `· ${route.framework}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100">
                    <button
                      onClick={() =>
                        openEntrypointSteps(
                          route.id,
                          `${route.method} ${route.path}`,
                        )
                      }
                      className="px-2.5 py-1 text-xs rounded bg-accent-soft text-accent hover:bg-accent hover:text-canvas transition-colors font-medium flex items-center gap-1"
                      title="Inspect Execution Steps"
                    >
                      <span>Steps</span>
                      <Icon name="chevron" size={12} />
                    </button>
                    <button
                      onClick={() =>
                        openFileCode(route.file, route.line, route.id)
                      }
                      className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
                      title="View Bounded FileCode"
                    >
                      <Icon name="code" size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === "files" && (
          <div className="space-y-2">
            {files.items.map((file: WireEntryFile) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface hover:bg-surface-hover transition-colors group"
              >
                <div className="min-w-0">
                  <div className="text-sm font-mono font-medium text-ink truncate">
                    {file.name}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {file.file} · {file.calls} calls · reaches {file.reaches}{" "}
                    files · {file.dependents} dependents
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEntrypointSteps(file.id, file.name)}
                    className="px-2.5 py-1 text-xs rounded bg-accent-soft text-accent hover:bg-accent hover:text-canvas transition-colors font-medium flex items-center gap-1"
                  >
                    <span>Steps</span>
                    <Icon name="chevron" size={12} />
                  </button>
                  <button
                    onClick={() => openFileCode(file.file, file.line, file.id)}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
                    title="View Bounded FileCode"
                  >
                    <Icon name="code" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "hubs" && (
          <div className="space-y-2">
            {hubs.items.map((hub: WireEntryHub) => (
              <div
                key={hub.id}
                className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface hover:bg-surface-hover transition-colors group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-medium text-ink truncate">
                      {hub.name}
                    </span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-surface-raised text-ink-soft border border-line">
                      {hub.kind}
                    </span>
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-accent-soft text-accent font-semibold">
                      hub · {hub.dependents}
                    </span>
                  </div>
                  <div className="text-xs text-ink-muted mt-0.5">
                    {hub.file}:{hub.line}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => inspectSymbolFlow(hub.id, hub.name)}
                    className="px-2.5 py-1 text-xs rounded bg-cyan/15 text-cyan hover:bg-cyan hover:text-canvas transition-colors font-medium flex items-center gap-1"
                  >
                    <span>Flow</span>
                    <Icon name="chevron" size={12} />
                  </button>
                  <button
                    onClick={() => openEntrypointSteps(hub.id, hub.name)}
                    className="px-2.5 py-1 text-xs rounded bg-accent-soft text-accent hover:bg-accent hover:text-canvas transition-colors font-medium flex items-center gap-1"
                  >
                    <span>Steps</span>
                    <Icon name="chevron" size={12} />
                  </button>
                  <button
                    onClick={() => openFileCode(hub.file, hub.line, hub.id)}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
                    title="View Bounded FileCode"
                  >
                    <Icon name="code" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "tests" && (
          <div className="space-y-2">
            {tests.items.map((test: WireEntryTest) => (
              <div
                key={test.id}
                className="flex items-center justify-between p-3 rounded-lg border border-line bg-surface hover:bg-surface-hover transition-colors group"
              >
                <div className="min-w-0">
                  <div className="text-sm font-mono font-medium text-ink truncate">
                    {test.name}
                  </div>
                  <div className="text-xs text-ink-muted">
                    {test.file} · exercises {test.reaches} files ({test.refs}{" "}
                    references)
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openEntrypointSteps(test.id, test.name)}
                    className="px-2.5 py-1 text-xs rounded bg-accent-soft text-accent hover:bg-accent hover:text-canvas transition-colors font-medium flex items-center gap-1"
                  >
                    <span>Steps</span>
                    <Icon name="chevron" size={12} />
                  </button>
                  <button
                    onClick={() => openFileCode(test.file, test.line, test.id)}
                    className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
                    title="View Bounded FileCode"
                  >
                    <Icon name="code" size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
