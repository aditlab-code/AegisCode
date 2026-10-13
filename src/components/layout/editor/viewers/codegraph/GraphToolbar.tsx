import { useState, useEffect, useRef } from "react"
import { Icon } from "../../../../ui/Icon"
import { IconButton } from "../../../../ui/IconButton"
import {
  searchGraphSymbols,
  type UIGraphNode,
} from "../../../../../utils/codegraphApi"

export type LayoutMode = "dagre" | "cose"
export type ScopeMode = "macro" | "micro"

interface GraphToolbarProps {
  layout: LayoutMode
  onLayoutChange: (layout: LayoutMode) => void
  activeKinds: Set<string>
  onToggleKind: (kind: string) => void
  onFit: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onSelectSymbol: (symbol: UIGraphNode) => void
  onSplitSideBySide?: () => void
  onRefresh: () => void
  loading?: boolean
  scope: ScopeMode
  onScopeChange: (scope: ScopeMode) => void
  macroLimit: number
  onMacroLimitChange: (limit: number) => void
  microPath?: string | null
}

const AVAILABLE_KINDS = [
  {
    id: "function",
    label: "Functions",
    color: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  },
  {
    id: "interface",
    label: "Interfaces",
    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  {
    id: "class",
    label: "Classes & Types",
    color: "bg-purple-500/20 text-purple-400 border-purple-500/40",
  },
]

export function GraphToolbar({
  layout,
  onLayoutChange,
  activeKinds,
  onToggleKind,
  onFit,
  onZoomIn,
  onZoomOut,
  onSelectSymbol,
  onSplitSideBySide,
  onRefresh,
  loading = false,
  scope,
  onScopeChange,
  macroLimit,
  onMacroLimitChange,
  microPath,
}: GraphToolbarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<UIGraphNode[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setDropdownOpen(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      const results = await searchGraphSymbols(searchQuery, 8)
      setSearchResults(results)
      setIsSearching(false)
      setDropdownOpen(results.length > 0)
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleSelect(node: UIGraphNode) {
    onSelectSymbol(node)
    setSearchQuery("")
    setDropdownOpen(false)
  }

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-line bg-surface/40 text-xs select-none overflow-x-auto no-scrollbar whitespace-nowrap min-w-0">
      {/* Left: Scope Mode Switcher, Density, Search & Filters */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Scope Mode Switcher (Macro vs Micro) */}
        <div className="flex items-center rounded bg-surface border border-line p-0.5 shadow-xs">
          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
              scope === "macro"
                ? "bg-accent text-accent-contrast shadow-xs"
                : "text-ink-muted hover:text-ink hover:bg-canvas/50"
            }`}
            onClick={() => onScopeChange("macro")}
            title="Macro View: Workspace-wide structural architecture"
            type="button"
          >
            <Icon name="folder" size={11} />
            <span>Macro</span>
          </button>
          <button
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
              scope === "micro"
                ? "bg-accent text-accent-contrast shadow-xs"
                : "text-ink-muted hover:text-ink hover:bg-canvas/50"
            }`}
            onClick={() => onScopeChange("micro")}
            title={
              microPath
                ? `Micro View: Deep AST symbols for ${microPath}`
                : "Micro View: Active file AST symbols"
            }
            type="button"
          >
            <Icon name="file" size={11} />
            <span>Micro</span>
          </button>
        </div>

        {/* If Macro: Density Limit Selector */}
        {scope === "macro" && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface border border-line text-[10px] text-ink-muted">
            <span className="text-[9px] uppercase font-bold tracking-wider text-ink-muted/80">
              Nodes:
            </span>
            {[
              { val: 50, label: "50" },
              { val: 100, label: "100" },
              { val: 250, label: "250" },
              { val: 1000, label: "All" },
            ].map(({ val, label }) => (
              <button
                className={`px-1.5 py-0.2 rounded transition-colors cursor-pointer font-mono font-medium ${
                  macroLimit === val
                    ? "bg-accent text-accent-contrast font-bold"
                    : "hover:text-ink hover:bg-canvas"
                }`}
                key={val}
                onClick={() => onMacroLimitChange(val)}
                title={`Render up to ${label} symbols in workspace graph`}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* If Micro: Active File Badge */}
        {scope === "micro" && microPath && (
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-mono text-[10px] max-w-[170px] truncate"
            title={microPath}
          >
            <Icon name="file" size={10} />
            <span className="truncate">
              {microPath.split(/[/\\]/).pop() || microPath}
            </span>
          </div>
        )}

        {/* Divider */}
        <div className="h-4 w-px bg-line/80 mx-0.5" />

        {/* Symbol Search Bar */}
        <div className="relative" ref={dropdownRef}>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-surface border border-line focus-within:border-accent w-44 focus-within:w-56 transition-all duration-150">
            <Icon
              className={
                isSearching ? "animate-spin text-ink-muted" : "text-ink-muted"
              }
              name={isSearching ? "refresh" : "search"}
              size={12}
            />
            <input
              className="w-full bg-transparent border-none outline-none text-ink text-xs placeholder:text-ink-muted"
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) setDropdownOpen(true)
              }}
              placeholder="Search symbols..."
              type="text"
              value={searchQuery}
            />
            {searchQuery && (
              <button
                className="text-ink-muted hover:text-ink cursor-pointer"
                onClick={() => setSearchQuery("")}
                type="button"
              >
                <Icon name="close" size={10} />
              </button>
            )}
          </div>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-64 max-h-56 overflow-y-auto rounded-md bg-surface border border-line shadow-xl z-50 p-1">
              {searchResults.map((s) => (
                <button
                  className="w-full text-left p-1.5 rounded hover:bg-canvas text-xs flex flex-col gap-0.5 cursor-pointer transition-colors"
                  key={s.id}
                  onClick={() => handleSelect(s)}
                  type="button"
                >
                  <div className="flex items-center justify-between font-mono font-medium text-ink">
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-ink-muted capitalize">
                      {s.kind}
                    </span>
                  </div>
                  <div className="text-[10px] text-ink-muted truncate">
                    {s.filePath}:{s.lineStart}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Kind Filter Chips */}
        <div className="flex items-center gap-1">
          {AVAILABLE_KINDS.map((k) => {
            const isActive = activeKinds.has(k.id)
            return (
              <button
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors cursor-pointer ${
                  isActive
                    ? k.color
                    : "bg-surface/50 text-ink-muted border-line/60 hover:border-line"
                }`}
                key={k.id}
                onClick={() => onToggleKind(k.id)}
                type="button"
              >
                {k.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right: Layout Switcher, Zoom, Actions & MCP Status */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Layout Switcher (Dagre vs CoSE) */}
        <div className="flex items-center rounded bg-surface border border-line p-0.5">
          <button
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              layout === "dagre"
                ? "bg-accent text-accent-contrast"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => onLayoutChange("dagre")}
            title="Hierarchical Flow Layout"
            type="button"
          >
            Hierarchical
          </button>
          <button
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
              layout === "cose"
                ? "bg-accent text-accent-contrast"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => onLayoutChange("cose")}
            title="Force Network Layout"
            type="button"
          >
            Network
          </button>
        </div>

        {/* MCP Status Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-accent font-medium text-[10px]">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>MCP Active</span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-0.5 border-l border-line pl-1.5">
          <IconButton label="Fit View" onClick={onFit}>
            <Icon name="maximize" size={13} />
          </IconButton>
          <IconButton label="Zoom In" onClick={onZoomIn}>
            <Icon name="zoom-in" size={13} />
          </IconButton>
          <IconButton label="Zoom Out" onClick={onZoomOut}>
            <Icon name="zoom-out" size={13} />
          </IconButton>
          <IconButton
            disabled={loading}
            label="Refresh Graph"
            onClick={onRefresh}
          >
            <Icon
              className={loading ? "animate-spin" : ""}
              name="refresh"
              size={13}
            />
          </IconButton>
          {onSplitSideBySide && (
            <IconButton
              label="Open Side-by-Side Editor"
              onClick={onSplitSideBySide}
            >
              <Icon name="split" size={13} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  )
}
