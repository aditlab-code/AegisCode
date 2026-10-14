import { useState, useEffect } from "react"
import {
  fetchFlow,
  type WireFlowPayload,
  type WireFlow,
} from "../../services/codegraphApi"
import {
  layoutFlow,
  type LayoutNode,
} from "../../workers/codegraphLayout.worker"
import { useCodeGraphStore } from "../../store/slices/codegraphSlice"
import { useWorkbenchStore } from "../../store"
import { Icon } from "../ui/Icon"

export function FlowTrailsView() {
  const selectedSymbol = useCodeGraphStore((s) => s.selectedSymbol)
  const flowQuery = useCodeGraphStore((s) => s.flowQuery)
  const openFileCode = useCodeGraphStore((s) => s.openFileCode)
  const inspectSymbolFlow = useCodeGraphStore((s) => s.inspectSymbolFlow)
  const currentWorkspace = useWorkbenchStore((s) => s.rootPath)

  const [fromQuery, setFromQuery] = useState(
    flowQuery?.from || selectedSymbol?.name || "",
  )
  const [toQuery, setToQuery] = useState(flowQuery?.to || "")
  const [symbolQuery, setSymbolQuery] = useState(
    flowQuery?.symbols ? flowQuery.symbols.join(" ") : "",
  )

  const [data, setData] = useState<WireFlowPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFlowIndex, setSelectedFlowIndex] = useState(0)

  useEffect(() => {
    if (flowQuery?.from) {
      setFromQuery(flowQuery.from)
      setToQuery(flowQuery.to || "")
      setSymbolQuery("")
    } else if (flowQuery?.symbols) {
      setSymbolQuery(flowQuery.symbols.join(" "))
      setFromQuery("")
      setToQuery("")
    } else if (selectedSymbol?.name) {
      setFromQuery(selectedSymbol.name)
      setToQuery("")
      setSymbolQuery("")
    }
  }, [selectedSymbol, flowQuery])

  const handleSearch = () => {
    const activeSymbols = symbolQuery.split(/\s+/).filter(Boolean)

    if (fromQuery && !toQuery) {
      setData(null)
      setError(null)
      return
    }

    if ((!fromQuery || !toQuery) && activeSymbols.length < 2) {
      setData(null)
      setError(null)
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)

    const q =
      fromQuery && toQuery
        ? { from: fromQuery, to: toQuery }
        : { symbols: activeSymbols }

    fetchFlow(q, ac.signal, currentWorkspace)
      .then((res) => {
        setData(res)
        setSelectedFlowIndex(0)
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
    return handleSearch()
  }, [fromQuery, toQuery, symbolQuery, currentWorkspace])

  const activeFlow: WireFlow | null = data?.flows?.[selectedFlowIndex] || null

  // 3-column layout representation for active flow hops
  const hops = activeFlow?.hops || []
  const focusHopIndex = Math.floor(hops.length / 2)
  const callerHops = hops.slice(0, focusHopIndex)
  const focusHop = hops[focusHopIndex] || null
  const calleeHops = hops.slice(focusHopIndex + 1)

  const callerNodes: LayoutNode[] = callerHops.map((h) => ({
    id: h.node.id,
    label: h.node.name,
    file: h.node.file,
    line: h.node.line,
  }))

  const focusNode: LayoutNode = focusHop
    ? {
        id: focusHop.node.id,
        label: focusHop.node.name,
        file: focusHop.node.file,
        line: focusHop.node.line,
      }
    : { id: "none", label: "No Focus" }

  const calleeNodes: LayoutNode[] = calleeHops.map((h) => ({
    id: h.node.id,
    label: h.node.name,
    file: h.node.file,
    line: h.node.line,
  }))

  const layout = layoutFlow(callerNodes, focusNode, calleeNodes, 1000, 500)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      {/* Query Bar */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2 bg-surface">
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          <input
            type="text"
            value={fromQuery}
            onChange={(e) => setFromQuery(e.target.value)}
            placeholder="From symbol..."
            className="flex-1 rounded bg-surface-raised border border-line px-2.5 py-1 text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-accent"
          />
          <span className="text-xs text-ink-muted">→</span>
          <input
            type="text"
            value={toQuery}
            onChange={(e) => setToQuery(e.target.value)}
            placeholder="To symbol..."
            className="flex-1 rounded bg-surface-raised border border-line px-2.5 py-1 text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-accent"
          />
          <span className="text-xs text-ink-muted">or</span>
          <input
            type="text"
            value={symbolQuery}
            onChange={(e) => setSymbolQuery(e.target.value)}
            placeholder="Symbols (e.g. login user)"
            className="flex-1 rounded bg-surface-raised border border-line px-2.5 py-1 text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => {
              if (fromQuery && !toQuery) {
                setError(
                  "Please specify a target symbol in 'To symbol...' to calculate flow path.",
                )
              } else {
                handleSearch()
              }
            }}
            className="px-3 py-1 rounded bg-accent-soft text-accent hover:bg-accent hover:text-canvas text-xs font-medium transition-colors"
          >
            Trace
          </button>
        </div>

        {data?.flows && data.flows.length > 1 && (
          <div className="flex items-center gap-1.5 ml-4">
            <span className="text-xs text-ink-muted">Paths:</span>
            {data.flows.map((flow, i) => (
              <button
                key={flow.id}
                onClick={() => setSelectedFlowIndex(i)}
                className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                  selectedFlowIndex === i
                    ? "bg-accent text-canvas font-semibold"
                    : "bg-surface-raised text-ink-soft hover:text-ink"
                }`}
              >
                Path {i + 1}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Flow Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-64 flex-col items-center justify-center text-ink-muted">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3" />
            <p className="text-sm">Tracing shortest call flow path...</p>
          </div>
        ) : fromQuery && !toQuery ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <Icon name="code" size={32} className="text-accent mb-2" />
            <p className="text-ink font-medium mb-1">
              Origin Symbol Selected:{" "}
              <span className="font-mono text-accent">{fromQuery}</span>
            </p>
            <p className="text-xs text-ink-muted max-w-md">
              Enter a destination symbol in &quot;To symbol...&quot; above and
              click Trace to discover connected execution call pathways.
            </p>
          </div>
        ) : !fromQuery &&
          !toQuery &&
          symbolQuery.split(/\s+/).filter(Boolean).length < 2 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <Icon name="code" size={32} className="text-ink-muted mb-2" />
            <p className="text-ink font-medium mb-1">Direct Call Flow Tracer</p>
            <p className="text-xs text-ink-muted max-w-md">
              Enter starting and target symbols above (e.g. LandingHeroSection →
              LandingTelemetryRibbon) or two space-separated symbols to trace
              directed execution flows.
            </p>
          </div>
        ) : error || !activeFlow ? (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <Icon name="error" size={32} className="text-warning mb-2" />
            <p className="text-ink font-medium mb-1">Flow Not Found</p>
            <p className="text-xs text-ink-muted max-w-md mb-2">
              {data?.reason ||
                error ||
                "No connected path discovered between these symbols."}
            </p>
            {data?.unresolved && data.unresolved.length > 0 && (
              <p className="text-[11px] text-ink-muted font-mono mb-4">
                Unresolved symbol: {data.unresolved.join(", ")} (not callable in
                index)
              </p>
            )}
            <button
              onClick={handleSearch}
              className="px-3 py-1.5 rounded bg-surface-raised border border-line text-xs font-medium text-ink hover:bg-surface-hover transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="space-y-6 max-w-5xl mx-auto">
            {/* Flow Path Strip */}
            <div className="border border-line rounded-lg p-4 bg-surface">
              <div className="flex items-center justify-between mb-4 border-b border-line pb-2">
                <span className="text-xs font-mono font-semibold text-ink">
                  {activeFlow.label || `${hops.length} Hops Flow Chain`}
                </span>
                <span className="text-xs text-ink-muted">
                  {hops.length} hops traversed
                </span>
              </div>

              {/* 3-Column Visualization Canvas */}
              <div
                className="relative overflow-hidden bg-canvas/60 rounded-lg p-4 border border-line"
                style={{ height: Math.max(layout.bounds.height, 320) }}
              >
                <svg className="absolute inset-0 pointer-events-none w-full h-full">
                  {layout.edges.map((e, idx) => {
                    if (!e.points || e.points.length < 4) return null
                    const p = e.points
                    return (
                      <path
                        key={`edge-${idx}`}
                        d={`M ${p[0].x} ${p[0].y} C ${p[1].x} ${p[1].y}, ${p[2].x} ${p[2].y}, ${p[3].x} ${p[3].y}`}
                        fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="2"
                        strokeDasharray={e.synthesized ? "4 4" : "none"}
                        strokeOpacity="0.75"
                      />
                    )
                  })}
                </svg>

                {/* Callers Column (Left) */}
                {layout.callers.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => inspectSymbolFlow(c.id, c.label)}
                    style={{
                      position: "absolute",
                      left: c.x,
                      top: c.y,
                      width: c.width,
                      height: c.height,
                    }}
                    className="p-2.5 rounded-lg border border-line bg-surface hover:bg-surface-hover hover:border-accent cursor-pointer transition-all shadow-sm"
                  >
                    <div className="text-xs font-mono font-semibold text-ink truncate">
                      {c.label}
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5 truncate">
                      {c.file}:{c.line}
                    </div>
                  </div>
                ))}

                {/* Focus Column (Center) */}
                {focusHop && (
                  <div
                    onClick={() =>
                      openFileCode(
                        focusHop.node.file,
                        focusHop.node.line,
                        focusHop.node.id,
                      )
                    }
                    style={{
                      position: "absolute",
                      left: layout.focus.x,
                      top: layout.focus.y,
                      width: layout.focus.width,
                      height: layout.focus.height,
                    }}
                    className="p-3 rounded-lg border-2 border-accent bg-accent/10 hover:bg-accent/15 cursor-pointer transition-all shadow-md"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-bold text-accent truncate">
                        {focusHop.node.name}
                      </span>
                      <span className="text-[9px] uppercase font-mono px-1 py-0.2 rounded bg-accent-soft text-accent font-semibold">
                        focus
                      </span>
                    </div>
                    <div className="text-[10px] text-ink-soft truncate">
                      {focusHop.node.file}:{focusHop.node.line}
                    </div>
                  </div>
                )}

                {/* Callees Column (Right) */}
                {layout.callees.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => inspectSymbolFlow(c.id, c.label)}
                    style={{
                      position: "absolute",
                      left: c.x,
                      top: c.y,
                      width: c.width,
                      height: c.height,
                    }}
                    className="p-2.5 rounded-lg border border-line bg-surface hover:bg-surface-hover hover:border-accent cursor-pointer transition-all shadow-sm"
                  >
                    <div className="text-xs font-mono font-semibold text-ink truncate">
                      {c.label}
                    </div>
                    <div className="text-[10px] text-ink-muted mt-0.5 truncate">
                      {c.file}:{c.line}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hop Cards with Source Preview */}
            <div className="space-y-3">
              <h4 className="text-xs font-mono font-semibold text-ink-soft uppercase tracking-wider">
                Call Sites & Source Windows
              </h4>
              {hops.map((hop, i) => (
                <div
                  key={`${hop.node.id}-${i}`}
                  className="border border-line rounded-lg p-3.5 bg-surface"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-raised border border-line text-[11px] font-mono text-ink-muted">
                        {i + 1}
                      </span>
                      <span className="text-xs font-mono font-semibold text-ink">
                        {hop.node.name}
                      </span>
                      <span className="text-[11px] text-ink-muted">
                        {hop.node.file}:{hop.node.line}
                      </span>
                    </div>

                    <button
                      onClick={() =>
                        openFileCode(hop.node.file, hop.node.line, hop.node.id)
                      }
                      className="px-2 py-0.5 rounded bg-surface-raised hover:bg-surface-hover text-[11px] text-ink-soft hover:text-ink transition-colors border border-line flex items-center gap-1"
                    >
                      <Icon name="code" size={12} />
                      <span>Inspect Code</span>
                    </button>
                  </div>

                  {/* Inline Source Window */}
                  {hop.source?.lines && hop.source.lines.length > 0 && (
                    <div className="bg-canvas border border-line rounded p-2.5 font-mono text-xs overflow-x-auto text-ink-soft">
                      {hop.source.lines.map((l, lIdx) => (
                        <div key={lIdx} className="whitespace-pre">
                          <span className="text-ink-muted inline-block w-8 select-none">
                            {(hop.source?.from || 1) + lIdx}
                          </span>
                          <span>{l}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Dynamic Boundary Alert (if reached) */}
            {activeFlow.boundary && (
              <div className="border border-warning/40 bg-warning-soft/20 rounded-lg p-4">
                <div className="flex items-center gap-2 text-warning text-xs font-semibold mb-1">
                  <Icon name="warning" size={14} />
                  <span>Dynamic Dispatch / Uncertain Boundary Reached</span>
                </div>
                <p className="text-xs text-ink-soft">
                  The static path stopped at{" "}
                  <code className="font-mono text-ink">
                    {activeFlow.boundary.node.name}
                  </code>
                  . Resolution continues via dynamic callbacks or uncertain
                  matching.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
