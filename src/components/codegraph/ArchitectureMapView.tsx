import { useState, useEffect, useRef } from "react"
import {
  fetchMap,
  type WireMapPayload,
  type WireMapModule,
} from "../../services/codegraphApi"
import {
  layoutMap,
  type LayoutNode,
  type LayoutEdge,
  type MapLayoutResponse,
} from "../../workers/codegraphLayout.worker"
import { useCodeGraphStore } from "../../store/slices/codegraphSlice"
import { useWorkbenchStore } from "../../store"
import { Icon } from "../ui/Icon"

export function ArchitectureMapView() {
  const [data, setData] = useState<WireMapPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedModule, setSelectedModule] = useState<WireMapModule | null>(
    null,
  )

  const [layoutResult, setLayoutResult] = useState<MapLayoutResponse | null>(
    null,
  )

  const filters = useCodeGraphStore((s) => s.filters)
  const setFilters = useCodeGraphStore((s) => s.setFilters)
  const openFileCode = useCodeGraphStore((s) => s.openFileCode)
  const currentWorkspace = useWorkbenchStore((s) => s.rootPath)

  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })

  const loadMap = () => {
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    fetchMap({}, ac.signal, currentWorkspace)
      .then((res) => {
        setData(res)
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
    return loadMap()
  }, [currentWorkspace])

  // Calculate layout whenever data or filters change
  useEffect(() => {
    if (!data) return

    let activeModules = data.modules
    if (filters.hideTests) {
      activeModules = activeModules.filter((m) => !m.test)
    }
    if (filters.hideGenerated) {
      activeModules = activeModules.filter((m) => m.generated < m.files)
    }

    const activeSet = new Set(activeModules.map((m) => m.id))
    const activeLinks = data.links.filter(
      (l) => activeSet.has(l.source) && activeSet.has(l.target),
    )

    const nodes: LayoutNode[] = activeModules.map((m) => ({
      id: m.id,
      label: m.label,
      files: m.files,
      symbols: m.symbols,
      test: m.test,
      generated: m.generated,
      dependents: m.dependents,
      fileList: m.fileList,
      languages: m.languages,
    }))

    const edges: LayoutEdge[] = activeLinks.map((l) => ({
      source: l.source,
      target: l.target,
      count: l.count,
      declared: l.declared,
    }))

    const width = containerRef.current?.clientWidth || 1200
    const height = containerRef.current?.clientHeight || 800

    // Offloaded layout computation
    const res = layoutMap(nodes, edges, width, height)
    setLayoutResult(res)
  }, [data, filters.hideTests, filters.hideGenerated])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.4), 2.5)
    setZoom(newZoom)
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-ink-muted bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3" />
        <p className="text-sm">Calculating architecture module map...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-canvas">
        <Icon name="error" size={32} className="text-warning mb-2" />
        <p className="text-ink font-medium mb-1">
          Architecture Map Unavailable
        </p>
        <p className="text-xs text-ink-muted max-w-md mb-4">{error}</p>
        <button
          onClick={loadMap}
          className="px-3 py-1.5 rounded bg-surface-raised border border-line text-xs font-medium text-ink hover:bg-surface-hover transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas relative">
      {/* Map Toolbar */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2 bg-surface z-10">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-ink">
            Root: {data.root || "(repo root)"}
          </span>
          <span className="text-xs text-ink-muted">
            {data.modules.length} modules · {data.links.length} cross-module
            edges
          </span>
          {data.cycles.total > 0 && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-warning-soft text-warning border border-warning/30">
              {data.cycles.total} circular dependencies
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer">
            <input
              type="checkbox"
              checked={filters.hideTests}
              onChange={(e) => setFilters({ hideTests: e.target.checked })}
              className="rounded border-line bg-surface-raised accent-accent text-accent"
            />
            <span>Hide Tests</span>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink-soft cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={filters.hideGenerated}
              onChange={(e) => setFilters({ hideGenerated: e.target.checked })}
              className="rounded border-line bg-surface-raised accent-accent text-accent"
            />
            <span>Hide Generated</span>
          </label>

          <div className="flex items-center gap-1 ml-3 border-l border-line pl-3">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
              className="p-1 rounded bg-surface-raised text-ink-muted hover:text-ink text-xs"
              title="Zoom in"
            >
              +
            </button>
            <span className="text-[11px] font-mono text-ink-muted w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))}
              className="p-1 rounded bg-surface-raised text-ink-muted hover:text-ink text-xs"
              title="Zoom out"
            >
              -
            </button>
            <button
              onClick={() => {
                setZoom(1)
                setPan({ x: 0, y: 0 })
              }}
              className="px-2 py-1 rounded bg-surface-raised text-ink-muted hover:text-ink text-xs"
              title="Reset view"
            >
              Fit
            </button>
          </div>
        </div>
      </div>

      {/* Interactive Map Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
      >
        {layoutResult && (
          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
              width: layoutResult.bounds.width,
              height: layoutResult.bounds.height,
              position: "absolute",
            }}
          >
            {/* SVG Connecting Links */}
            <svg
              className="absolute inset-0 pointer-events-none"
              width={layoutResult.bounds.width}
              height={layoutResult.bounds.height}
            >
              <defs>
                <marker
                  id="map-arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 1 L 8 5 L 0 9 z"
                    fill="var(--color-line-bright)"
                  />
                </marker>
              </defs>
              {layoutResult.edges.map((edge, i) => {
                if (!edge.points || edge.points.length < 4) return null
                const p = edge.points
                const pathD = `M ${p[0].x} ${p[0].y} C ${p[1].x} ${p[1].y}, ${p[2].x} ${p[2].y}, ${p[3].x} ${p[3].y}`
                const strokeWidth = Math.min(
                  Math.max((edge.count || 1) / 4, 1.2),
                  6,
                )

                return (
                  <path
                    key={`${edge.source}-${edge.target}-${i}`}
                    d={pathD}
                    fill="none"
                    stroke="var(--color-line-bright)"
                    strokeWidth={strokeWidth}
                    strokeOpacity={0.65}
                    markerEnd="url(#map-arrow)"
                  />
                )
              })}
            </svg>

            {/* Module Nodes */}
            {layoutResult.nodes.map((node) => {
              const isSelected = selectedModule?.id === node.id
              const isTest = node.test

              return (
                <div
                  key={node.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    const m = data.modules.find((x) => x.id === node.id)
                    setSelectedModule(m || null)
                  }}
                  style={{
                    position: "absolute",
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                  }}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? "border-accent bg-surface-raised shadow-md"
                      : isTest
                        ? "border-dashed border-line bg-surface/70 hover:border-line-bright"
                        : "border-line bg-surface hover:bg-surface-hover hover:border-line-bright"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className="text-xs font-mono font-semibold text-ink truncate"
                      title={node.label}
                    >
                      {node.label}
                    </span>
                    {isTest && (
                      <span className="text-[9px] font-mono uppercase px-1 py-0.2 rounded bg-surface-raised text-ink-muted border border-line">
                        test
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-ink-muted space-x-2">
                    <span>{node.files} files</span>
                    <span>·</span>
                    <span>{node.symbols} symbols</span>
                  </div>

                  {node.dependents && (
                    <div className="text-[10px] text-ink-soft mt-1">
                      reaches {node.dependents.files} files (
                      {node.dependents.modules} modules)
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Selected Module Details Panel */}
      {selectedModule && (
        <div className="absolute right-0 top-12 bottom-0 w-80 bg-surface border-l border-line p-4 overflow-y-auto shadow-elevation z-20">
          <div className="flex items-center justify-between mb-3 border-b border-line pb-2">
            <span className="text-sm font-mono font-semibold text-ink truncate">
              {selectedModule.label}
            </span>
            <button
              onClick={() => setSelectedModule(null)}
              className="p-1 text-ink-muted hover:text-ink rounded"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-ink-muted">Directory ID:</span>
              <div className="font-mono text-ink mt-0.5 break-all">
                {selectedModule.id}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-surface-raised p-2 rounded border border-line">
              <div>
                <div className="text-ink-muted">Files</div>
                <div className="text-base font-semibold text-ink">
                  {selectedModule.files}
                </div>
              </div>
              <div>
                <div className="text-ink-muted">Symbols</div>
                <div className="text-base font-semibold text-ink">
                  {selectedModule.symbols}
                </div>
              </div>
            </div>

            <div>
              <span className="text-ink-muted">Files in Module:</span>
              <div className="mt-1.5 space-y-1 max-h-60 overflow-y-auto pr-1">
                {selectedModule.fileList?.items?.map((file) => (
                  <div
                    key={file}
                    onClick={() => openFileCode(file, 1)}
                    className="p-1.5 rounded font-mono text-[11px] text-ink-soft hover:bg-surface-raised hover:text-ink cursor-pointer truncate transition-colors flex items-center justify-between group"
                  >
                    <span className="truncate">{file}</span>
                    <Icon
                      name="code"
                      size={12}
                      className="opacity-0 group-hover:opacity-100 shrink-0 text-accent"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
