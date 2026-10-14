import { useState, useRef, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { isGitDiffTab, parseGitDiffTab } from "../../../utils/gitDiffTab"
import { isGraphTab, parseGraphTab } from "./viewers/viewerTypes"
import {
  fetchActiveFileGraph,
  type UIGraphNode,
} from "../../../utils/codegraphApi"

interface EditorBreadcrumbsProps {
  file?: string
}

interface DropdownItem {
  name: string
  path: string
  isDir: boolean
}

interface DropdownState {
  x: number
  y: number
  items: DropdownItem[]
}

export function EditorBreadcrumbs({ file }: EditorBreadcrumbsProps) {
  const {
    focusedPane,
    splitEditor,
    secondaryActiveTab,
    activeTab,
    files,
    openFileInPane,
    cursorPosition,
    setCursorPosition,
  } = useWorkbenchStore(
    useShallow((s) => ({
      focusedPane: s.focusedPane,
      splitEditor: s.splitEditor,
      secondaryActiveTab: s.secondaryActiveTab,
      activeTab: s.activeTab,
      files: s.files,
      openFileInPane: s.openFileInPane,
      cursorPosition: s.cursorPosition,
      setCursorPosition: s.setCursorPosition,
    })),
  )

  const [dropdown, setDropdown] = useState<DropdownState | null>(null)
  const [fileSymbols, setFileSymbols] = useState<UIGraphNode[]>([])
  const [symbolDropdownOpen, setSymbolDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDropdown(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDropdown(null)
      }
    }

    if (dropdown) {
      window.addEventListener("mousedown", handlePointerDown)
      window.addEventListener("keydown", handleKeyDown)
      return () => {
        window.removeEventListener("mousedown", handlePointerDown)
        window.removeEventListener("keydown", handleKeyDown)
      }
    }
  }, [dropdown])

  const currentFile =
    file ||
    (focusedPane === "secondary" && splitEditor
      ? secondaryActiveTab
      : activeTab) ||
    ""

  useEffect(() => {
    if (!currentFile || isGitDiffTab(currentFile) || isGraphTab(currentFile)) {
      setFileSymbols([])
      return
    }
    let cancelled = false
    fetchActiveFileGraph(currentFile)
      .then((res) => {
        if (cancelled || !res || !Array.isArray(res.nodes)) return
        const syms = res.nodes
          .filter(
            (n) =>
              n.filePath === currentFile ||
              currentFile.endsWith("/" + n.filePath) ||
              n.filePath.endsWith("/" + currentFile),
          )
          .sort((a, b) => a.lineStart - b.lineStart)
        setFileSymbols(syms)
      })
      .catch(() => {
        if (!cancelled) setFileSymbols([])
      })
    return () => {
      cancelled = true
    }
  }, [currentFile])

  const activeSymbol = fileSymbols.find(
    (s) =>
      cursorPosition.line >= s.lineStart && cursorPosition.line <= s.lineEnd,
  )

  const isDiff = isGitDiffTab(currentFile)
  const diffInfo = isDiff ? parseGitDiffTab(currentFile) : null

  if (isDiff && diffInfo) {
    return (
      <div className="breadcrumbs">
        <div className="breadcrumb-path">
          <span>diff</span>
          <Icon name="chevron" size={11} />
          <Icon
            className="text-[var(--color-accent)] shrink-0"
            name="git"
            size={12}
          />
          <span>{diffInfo.displayName}</span>
        </div>
      </div>
    )
  }

  const isGraph = isGraphTab(currentFile)
  const graphInfo = isGraph ? parseGraphTab(currentFile) : null
  if (isGraph && graphInfo) {
    return (
      <div className="breadcrumbs">
        <div className="breadcrumb-path">
          <span>codegraph</span>
          <Icon name="chevron" size={11} />
          <Icon className="text-accent shrink-0" name="zap" size={12} />
          <span>{graphInfo.displayName}</span>
        </div>
      </div>
    )
  }

  const isComponent =
    currentFile.endsWith(".tsx") || currentFile.endsWith(".jsx")
  const parts = currentFile.replace(/\\/g, "/").split("/").filter(Boolean)

  if (parts.length === 0) return null

  function handleSegmentClick(
    e: React.MouseEvent<HTMLButtonElement>,
    idx: number,
  ) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const isLast = idx === parts.length - 1
    const dirPath = isLast
      ? parts.slice(0, idx).join("/")
      : parts.slice(0, idx + 1).join("/")

    const prefix = dirPath
      ? dirPath.endsWith("/")
        ? dirPath
        : `${dirPath}/`
      : ""
    const seen = new Set<string>()
    const items: DropdownItem[] = []

    for (const f of files) {
      if (f.path.startsWith(prefix) && f.path !== dirPath) {
        const rest = f.path.slice(prefix.length)
        const segment = rest.split("/")[0]
        if (segment && !seen.has(segment)) {
          seen.add(segment)
          const isDir =
            rest.includes("/") || f.icon === "folder" || f.type === "folder"
          items.push({
            name: segment,
            path: prefix + segment,
            isDir,
          })
        }
      }
    }

    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return a.name.localeCompare(b.name)
    })

    setDropdown({
      x: Math.min(rect.left, window.innerWidth - 180),
      y: rect.bottom + 4,
      items,
    })
  }

  return (
    <div className="breadcrumbs">
      <div className="breadcrumb-path">
        {parts.map((segment, idx) => {
          const isLast = idx === parts.length - 1
          return (
            <span key={`${segment}-${idx}`} className="flex items-center gap-1">
              {idx > 0 && <Icon name="chevron" size={11} />}
              {isLast && (
                <Icon
                  name={isComponent ? "code" : "file"}
                  size={12}
                  className="shrink-0"
                />
              )}
              <button
                type="button"
                className={`px-1 py-0.5 rounded cursor-pointer transition-colors hover:bg-surface-hover ${
                  isLast
                    ? "text-ink font-medium"
                    : "text-ink-muted hover:text-ink"
                }`}
                onClick={(e) => handleSegmentClick(e, idx)}
                title={`Browse ${segment}`}
              >
                {segment}
              </button>
            </span>
          )
        })}

        {fileSymbols.length > 0 && (
          <span className="flex items-center gap-1 relative">
            <Icon name="chevron" size={11} />
            <button
              type="button"
              onClick={() => setSymbolDropdownOpen((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-accent hover:bg-surface-hover font-mono text-[11px] cursor-pointer"
              title="Jump to symbol in file"
            >
              <Icon name="symbol" size={11} />
              <span>
                {activeSymbol
                  ? activeSymbol.name
                  : `${fileSymbols.length} symbols`}
              </span>
            </button>
            {symbolDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-60 max-h-60 overflow-y-auto py-1 px-1 bg-surface-raised border border-line-bright rounded-md shadow-xl z-50 text-xs">
                {fileSymbols.map((sym) => (
                  <button
                    key={sym.id}
                    type="button"
                    onClick={() => {
                      setCursorPosition({ line: sym.lineStart, column: 1 })
                      setSymbolDropdownOpen(false)
                    }}
                    className="flex items-center justify-between gap-2 w-full px-2 py-1 text-left rounded hover:bg-surface-hover cursor-pointer"
                  >
                    <span className="font-mono text-ink truncate">
                      {sym.name}
                    </span>
                    <span className="text-[10px] text-ink-muted font-mono shrink-0">
                      {sym.kind} · L{sym.lineStart}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>

      {dropdown && (
        <div
          ref={dropdownRef}
          className="fixed z-[var(--z-popover,100)] min-w-[170px] max-h-60 overflow-y-auto py-1 px-1 bg-surface-raised border border-line-bright rounded-md shadow-lg backdrop-blur-md text-xs"
          style={{ left: dropdown.x, top: dropdown.y }}
        >
          {dropdown.items.length === 0 ? (
            <div className="px-2 py-1 text-ink-muted text-[11px]">
              No other files
            </div>
          ) : (
            dropdown.items.map((item) => (
              <button
                key={item.path}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1 text-left rounded text-ink-soft hover:text-ink hover:bg-surface-hover cursor-pointer"
                onClick={() => {
                  if (!item.isDir) {
                    openFileInPane(item.path)
                  }
                  setDropdown(null)
                }}
              >
                <Icon name={item.isDir ? "folder" : "file"} size={12} />
                <span className="truncate">{item.name}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
