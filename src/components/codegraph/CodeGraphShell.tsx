import { useState, useEffect } from "react"
import {
  fetchStats,
  searchSymbols,
  triggerSync,
  triggerReindex,
  triggerInit,
  type WireStats,
  type WireNodeRef,
} from "../../services/codegraphApi"
import {
  useCodeGraphStore,
  type CodeGraphView,
} from "../../store/slices/codegraphSlice"
import { EntrypointsView } from "./EntrypointsView"
import { StepsView } from "./StepsView"
import { ArchitectureMapView } from "./ArchitectureMapView"
import { FlowTrailsView } from "./FlowTrailsView"
import { ScreensEventsView } from "./ScreensEventsView"
import { FileCodeDrawer } from "./FileCodeDrawer"
import { Icon } from "../ui/Icon"

export function CodeGraphShell() {
  const activeView = useCodeGraphStore((s) => s.activeView)
  const setActiveView = useCodeGraphStore((s) => s.setActiveView)
  const breadcrumbs = useCodeGraphStore((s) => s.breadcrumbs)
  const popBreadcrumb = useCodeGraphStore((s) => s.popBreadcrumb)
  const fileCodeTarget = useCodeGraphStore((s) => s.fileCodeTarget)
  const inspectSymbolFlow = useCodeGraphStore((s) => s.inspectSymbolFlow)

  const [stats, setStats] = useState<WireStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<WireNodeRef[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showSearchDropdown, setShowSearchDropdown] = useState(false)

  const loadStats = () => {
    fetchStats()
      .then((st) => {
        if (st) {
          setStats(st)
        } else {
          setStats({
            status: "unindexed",
            isIndexed: false,
            state: "unindexed",
          })
        }
      })
      .catch(() => {
        setStats({
          status: "unindexed",
          isIndexed: false,
          state: "unindexed",
        })
      })
      .finally(() => {
        setStatsLoading(false)
      })
  }

  useEffect(() => {
    loadStats()
    const timer = setInterval(loadStats, 15000)
    return () => clearInterval(timer)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setShowSearchDropdown(false)
      return
    }

    const timer = setTimeout(() => {
      setIsSearching(true)
      searchSymbols(searchQuery.trim())
        .then((res) => {
          setSearchResults(res.slice(0, 8))
          setShowSearchDropdown(true)
        })
        .finally(() => setIsSearching(false))
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const isUnindexed =
    !stats ||
    stats.status === "unindexed" ||
    stats.state === "unindexed" ||
    stats.isIndexed === false

  const handleInit = async () => {
    setSyncing(true)
    await triggerInit()
    loadStats()
    setSyncing(false)
  }

  const handleSync = async () => {
    if (isUnindexed) return
    setSyncing(true)
    await triggerSync()
    loadStats()
    setSyncing(false)
  }

  const handleReindex = async () => {
    if (isUnindexed) return
    setSyncing(true)
    await triggerReindex()
    loadStats()
    setSyncing(false)
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-canvas text-ink">
      {/* Top Header & Navigation */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2 shrink-0">
        {/* Left: View Switcher Tabs */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1.5 mr-3 pr-3 border-r border-line">
            <Icon name="code" size={16} className="text-accent" />
            <span className="text-xs font-bold tracking-tight text-ink font-mono">
              CodeGraph
            </span>
          </div>

          <button
            onClick={() => setActiveView("entrypoints")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeView === "entrypoints"
                ? "bg-accent text-canvas font-semibold shadow-sm"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink"
            }`}
          >
            1. Entrypoints
          </button>
          <button
            onClick={() => setActiveView("steps")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeView === "steps"
                ? "bg-accent text-canvas font-semibold shadow-sm"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink"
            }`}
          >
            2. Steps
          </button>
          <button
            onClick={() => setActiveView("map")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeView === "map"
                ? "bg-accent text-canvas font-semibold shadow-sm"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink"
            }`}
          >
            3. Architecture Map
          </button>
          <button
            onClick={() => setActiveView("flow")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeView === "flow"
                ? "bg-accent text-canvas font-semibold shadow-sm"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink"
            }`}
          >
            4. Directed Flow
          </button>
          <button
            onClick={() => setActiveView("screens")}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeView === "screens"
                ? "bg-accent text-canvas font-semibold shadow-sm"
                : "text-ink-soft hover:bg-surface-hover hover:text-ink"
            }`}
          >
            5. Screens
          </button>
        </div>

        {/* Center: Quick Search Palette */}
        <div className="relative w-64 max-w-sm mx-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchDropdown(true)
            }}
            placeholder="Search symbols..."
            className="w-full rounded bg-surface-raised border border-line px-2.5 py-1 text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-accent"
          />

          {showSearchDropdown && (
            <div className="absolute left-0 right-0 top-8 bg-surface-overlay border border-line rounded-lg shadow-popover z-50 overflow-hidden">
              {isSearching ? (
                <div className="p-2 text-center text-xs text-ink-muted">
                  Searching...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-2 text-center text-xs text-ink-muted">
                  No symbols found.
                </div>
              ) : (
                searchResults.map((sym) => (
                  <div
                    key={sym.id}
                    onClick={() => {
                      inspectSymbolFlow(sym.id, sym.name)
                      setShowSearchDropdown(false)
                      setSearchQuery("")
                    }}
                    className="p-2 text-xs font-mono hover:bg-surface-hover cursor-pointer border-b border-line last:border-none flex items-center justify-between"
                  >
                    <span className="text-ink font-semibold truncate">
                      {sym.name}
                    </span>
                    <span className="text-[10px] text-ink-muted truncate ml-2">
                      {sym.file}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right: Freshness & Actions */}
        <div className="flex items-center gap-2">
          {stats && (
            <div className="text-[11px] font-mono text-ink-muted flex items-center gap-1.5 mr-1">
              <span className="inline-block h-2 w-2 rounded-full bg-success" />
              <span>{stats.nodes || 0} nodes</span>
              <span>·</span>
              <span>{stats.edges || 0} edges</span>
            </div>
          )}

          <button
            onClick={handleSync}
            disabled={syncing || isUnindexed}
            className="px-2.5 py-1 rounded bg-surface-raised border border-line text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              isUnindexed
                ? "Repository not initialized with CodeGraph"
                : "Fast Git synchronization of modified files"
            }
          >
            <span>{syncing ? "Syncing..." : "Sync"}</span>
          </button>
          <button
            onClick={handleReindex}
            disabled={syncing || isUnindexed}
            className="px-2.5 py-1 rounded bg-surface-raised border border-line text-xs font-medium text-ink-soft hover:text-ink hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            title={
              isUnindexed
                ? "Repository not initialized with CodeGraph"
                : "Complete 4-phase reindex"
            }
          >
            Re-index
          </button>
        </div>
      </div>

      {/* Breadcrumbs Trail */}
      {breadcrumbs.length > 0 && (
        <div className="flex items-center gap-1.5 border-b border-line px-4 py-1.5 bg-surface-raised text-xs font-mono text-ink-muted shrink-0">
          <span
            onClick={() => setActiveView("entrypoints")}
            className="hover:text-ink cursor-pointer"
          >
            Home
          </span>
          {breadcrumbs.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-1.5">
              <span>/</span>
              <span
                onClick={() => {
                  setActiveView(crumb.view)
                }}
                className={`hover:text-ink cursor-pointer ${
                  idx === breadcrumbs.length - 1
                    ? "text-accent font-semibold"
                    : ""
                }`}
              >
                {crumb.name}
              </span>
            </span>
          ))}

          <button
            onClick={popBreadcrumb}
            className="ml-auto text-ink-muted hover:text-ink text-[11px]"
            title="Back one step"
          >
            ← Back
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {statsLoading ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-canvas text-ink-muted">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3" />
          <p className="text-xs">Checking CodeGraph index status...</p>
        </div>
      ) : isUnindexed ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-canvas">
          <div className="p-4 rounded-full bg-surface border border-line mb-4 text-accent">
            <Icon name="code" size={32} />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-1.5 font-mono">
            CodeGraph Not Initialized
          </h3>
          <p className="text-xs text-ink-muted max-w-md mb-5 leading-relaxed">
            This repository has not been indexed by CodeGraph yet. Initialize
            CodeGraph to generate interactive architectural maps, call
            hierarchies, entrypoint routing, and flow trails.
          </p>
          <button
            onClick={handleInit}
            disabled={syncing}
            className="px-4 py-2 rounded bg-accent text-canvas text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            <Icon name="zap" size={14} />
            <span>
              {syncing
                ? "Initializing CodeGraph..."
                : "Initialize CodeGraph Now"}
            </span>
          </button>
        </div>
      ) : (
        /* Main View Area with Bounded FileCode Drawer */
        <div className="flex flex-1 overflow-hidden relative">
          <div className="flex-1 overflow-hidden">
            {activeView === "entrypoints" && <EntrypointsView />}
            {activeView === "steps" && <StepsView />}
            {activeView === "map" && <ArchitectureMapView />}
            {activeView === "flow" && <FlowTrailsView />}
            {activeView === "screens" && <ScreensEventsView />}
          </div>

          {fileCodeTarget && <FileCodeDrawer />}
        </div>
      )}
    </div>
  )
}
