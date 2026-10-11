import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import {
  searchWorkspace,
  replaceAllWorkspace,
  fetchFileContent,
  saveWorkspaceFile,
} from "../../../utils/workspaceApi"

interface MatchItem {
  filename: string
  lineNumber: number
  column: number
  lineContent: string
  matchText: string
}

interface FileSearchResult {
  filename: string
  matches: MatchItem[]
}

export function SearchPanel() {
  const {
    fileBuffers,
    updateFileContent,
    openFileInGroup,
    focusedGroup,
    setCursorPosition,
    showToast,
  } = useWorkbench()

  const [search, setSearch] = useState("")
  const [replace, setReplace] = useState("")
  const [replaceOpen, setReplaceOpen] = useState(true)

  // Modifier toggles
  const [isRegex, setIsRegex] = useState(false)
  const [isMatchCase, setIsMatchCase] = useState(false)
  const [isWholeWord, setIsWholeWord] = useState(false)

  // Collapsed files in results
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>(
    {},
  )
  const [dismissedFiles, setDismissedFiles] = useState<Record<string, boolean>>(
    {},
  )

  const [backendResults, setBackendResults] = useState<FileSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  const refreshSearch = useCallback(async () => {
    if (!search.trim()) {
      setBackendResults([])
      return
    }

    try {
      const results = await searchWorkspace(
        search,
        isRegex,
        isMatchCase,
        isWholeWord,
      )
      setBackendResults(
        results.map((r) => ({
          filename: r.filename,
          matches: r.matches.map((m) => ({
            filename: r.filename,
            lineNumber: m.lineNumber,
            column: m.column,
            lineContent: m.lineContent,
            matchText: m.matchText,
          })),
        })),
      )
    } catch (err: any) {
      setBackendResults([])
      showToast(`Search failed: ${err?.message || "Unknown error"}`)
    }
  }, [search, isRegex, isMatchCase, isWholeWord, showToast])

  useEffect(() => {
    setDismissedFiles({})
    if (!search.trim()) {
      setBackendResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        await refreshSearch()
      } finally {
        setIsSearching(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [search, isRegex, isMatchCase, isWholeWord, refreshSearch])

  const searchResults: FileSearchResult[] = useMemo(() => {
    return backendResults.filter((f) => !dismissedFiles[f.filename])
  }, [backendResults, dismissedFiles])

  const totalMatchesCount = useMemo(() => {
    return searchResults.reduce((acc, curr) => acc + curr.matches.length, 0)
  }, [searchResults])

  function toggleFileCollapse(filename: string) {
    setCollapsedFiles((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }))
  }

  function handleDismissFile(filename: string) {
    setDismissedFiles((prev) => ({ ...prev, [filename]: true }))
    setBackendResults((prev) => prev.filter((f) => f.filename !== filename))
  }

  // 1. Replace single match
  async function handleReplaceSingle(match: MatchItem) {
    try {
      let content = ""
      const hasBuffer = Boolean(fileBuffers[match.filename])
      if (hasBuffer) {
        content = fileBuffers[match.filename].content
      } else {
        content = await fetchFileContent(match.filename)
      }

      const lines = content.split("\n")
      const targetLine = lines[match.lineNumber - 1]
      if (targetLine === undefined) {
        showToast(`Line ${match.lineNumber} not found in ${match.filename}`)
        return
      }

      const before = targetLine.substring(0, match.column - 1)
      const after = targetLine.substring(
        match.column - 1 + match.matchText.length,
      )
      lines[match.lineNumber - 1] = before + replace + after

      const newContent = lines.join("\n")
      if (hasBuffer) {
        updateFileContent(match.filename, newContent)
      }
      await saveWorkspaceFile(match.filename, newContent, false)
      showToast(`Replaced match in ${match.filename} [Ln ${match.lineNumber}]`)
      await refreshSearch()
    } catch (err: any) {
      showToast(`Replace failed: ${err?.message || "Unknown error"}`)
    }
  }

  // 2. Replace all in single file
  async function handleReplaceInFile(filename: string) {
    if (!search.trim()) return

    try {
      let pattern = search
      if (!isRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      }
      if (isWholeWord) {
        pattern = `\\b${pattern}\\b`
      }
      const flags = isMatchCase ? "g" : "gi"
      const regex = new RegExp(pattern, flags)

      let content = ""
      const hasBuffer = Boolean(fileBuffers[filename])
      if (hasBuffer) {
        content = fileBuffers[filename].content
      } else {
        content = await fetchFileContent(filename)
      }

      const updated = content.replace(regex, replace)
      if (hasBuffer) {
        updateFileContent(filename, updated)
      }
      await saveWorkspaceFile(filename, updated, false)
      showToast(`Replaced all matches in ${filename}`)
      await refreshSearch()
    } catch (err: any) {
      showToast(
        `Replace in ${filename} failed: ${
          err?.message || "Invalid replacement pattern"
        }`,
      )
    }
  }

  // 3. Replace all across workspace
  async function handleReplaceAll() {
    if (!search.trim() || totalMatchesCount === 0) return

    try {
      const result = await replaceAllWorkspace(
        search,
        replace,
        isRegex,
        isMatchCase,
        isWholeWord,
      )
      showToast(
        `Replaced ${result.count} occurrences across ${result.modifiedFiles.length} files`,
      )

      for (const path of result.modifiedFiles) {
        if (fileBuffers[path]) {
          const freshContent = await fetchFileContent(path).catch(() => "")
          if (freshContent) {
            updateFileContent(path, freshContent)
          }
        }
      }

      await refreshSearch()
    } catch (err: any) {
      showToast(`Replace all failed: ${err?.message || "Unknown error"}`)
    }
  }

  function toggleCollapseAll() {
    const allCollapsed = searchResults.every((f) => collapsedFiles[f.filename])
    const next: Record<string, boolean> = {}
    if (!allCollapsed) {
      for (const f of searchResults) {
        next[f.filename] = true
      }
    }
    setCollapsedFiles(next)
  }

  function renderHighlightedSnippet(lineContent: string, matchText: string) {
    const trimmed = lineContent.trim()
    if (!matchText || !trimmed) return trimmed

    const lowerLine = trimmed.toLowerCase()
    const lowerMatch = matchText.toLowerCase()
    const idx = lowerLine.indexOf(lowerMatch)

    if (idx === -1) {
      return trimmed
    }

    const before = trimmed.substring(0, idx)
    const matched = trimmed.substring(idx, idx + matchText.length)
    const after = trimmed.substring(idx + matchText.length)

    return (
      <>
        {before}
        <span className="match-highlight">{matched}</span>
        {after}
      </>
    )
  }

  return (
    <div className="tool-panel search-panel">
      {/* Search & Replace Input Rows */}
      <div className="search-input-group">
        {/* Search Input Row with Chevron */}
        <div className="search-input-row">
          <button
            className="replace-toggle-btn"
            onClick={() => setReplaceOpen((v) => !v)}
            title="Toggle Replace"
            type="button"
          >
            <span
              className={`chevron-arrow ${replaceOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={11} />
            </span>
          </button>
          <label className="panel-input search-box flex-1">
            <Icon name="search" size={13} />
            <input
              aria-label="Search files with regex"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search (supports regex)"
              ref={searchInputRef}
              value={search}
            />
            {search && (
              <button
                className="search-clear-btn"
                onClick={() => setSearch("")}
                title="Clear search"
                type="button"
              >
                <Icon name="close" size={10} />
              </button>
            )}
            <div className="search-modifiers">
              <button
                className={`modifier-btn ${
                  isMatchCase ? "modifier-active" : ""
                }`}
                onClick={() => setIsMatchCase((v) => !v)}
                title="Match Case (Alt+C)"
                type="button"
              >
                Aa
              </button>
              <button
                className={`modifier-btn ${
                  isWholeWord ? "modifier-active" : ""
                }`}
                onClick={() => setIsWholeWord((v) => !v)}
                title="Match Whole Word (Alt+W)"
                type="button"
              >
                \b
              </button>
              <button
                className={`modifier-btn ${isRegex ? "modifier-active" : ""}`}
                onClick={() => setIsRegex((v) => !v)}
                title="Use Regular Expression (Alt+R)"
                type="button"
              >
                .*
              </button>
            </div>
          </label>
        </div>

        {/* Replace Input Row */}
        {replaceOpen && (
          <div className="replace-input-row">
            <div className="w-4 shrink-0" />
            <label className="panel-input replace-box flex-1">
              <Icon name="edit" size={12} />
              <input
                aria-label="Replace matches"
                onChange={(event) => setReplace(event.target.value)}
                placeholder="Replace"
                value={replace}
              />
              <button
                className="replace-all-btn"
                disabled={!search.trim() || totalMatchesCount === 0}
                onClick={handleReplaceAll}
                title="Replace All across workspace"
                type="button"
              >
                <Icon name="replace-all" size={12} />
              </button>
            </label>
          </div>
        )}
      </div>

      {/* Results Tree */}
      {search ? (
        <div className="search-results">
          <div className="result-summary flex items-center justify-between">
            <span>
              {totalMatchesCount}{" "}
              {totalMatchesCount === 1 ? "result" : "results"} in{" "}
              {searchResults.length}{" "}
              {searchResults.length === 1 ? "file" : "files"}
            </span>
            <div className="flex items-center gap-1">
              <button
                className="p-0.5 text-ink-muted hover:text-ink cursor-pointer"
                onClick={refreshSearch}
                title="Refresh Search"
                type="button"
              >
                <Icon name="refresh" size={11} />
              </button>
              <button
                className="p-0.5 text-ink-muted hover:text-ink cursor-pointer"
                onClick={() => setSearch("")}
                title="Clear Search Results"
                type="button"
              >
                <Icon name="close" size={10} />
              </button>
              <button
                className="p-0.5 text-ink-muted hover:text-ink cursor-pointer"
                onClick={toggleCollapseAll}
                title="Collapse / Expand All"
                type="button"
              >
                <Icon name="chevron" size={11} />
              </button>
            </div>
          </div>

          {searchResults.map((fileRes) => {
            const isCollapsed = collapsedFiles[fileRes.filename]
            const normalized = fileRes.filename.replace(/\\/g, "/")
            const lastSlash = normalized.lastIndexOf("/")
            const fileName =
              lastSlash !== -1
                ? normalized.substring(lastSlash + 1)
                : normalized
            const dirPath =
              lastSlash !== -1 ? normalized.substring(0, lastSlash) : ""

            return (
              <div className="search-file-group" key={fileRes.filename}>
                <div className="search-file-header">
                  <button
                    className="search-file-toggle"
                    onClick={() => toggleFileCollapse(fileRes.filename)}
                    type="button"
                  >
                    <span
                      className={`chevron-arrow ${
                        !isCollapsed ? "chevron-open" : ""
                      }`}
                    >
                      <Icon name="chevron" size={11} />
                    </span>
                    <Icon name="file" size={12} />
                    <span className="search-filename">{fileName}</span>
                    {dirPath && (
                      <span className="search-filepath text-ink-muted text-[10px] font-normal truncate ml-1">
                        {dirPath}
                      </span>
                    )}
                    <small className="search-file-badge">
                      {fileRes.matches.length}
                    </small>
                  </button>

                  <div className="search-file-actions">
                    {/* Replace all in this file button */}
                    {replaceOpen && (
                      <button
                        className="file-replace-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReplaceInFile(fileRes.filename)
                        }}
                        title={`Replace all in ${fileRes.filename}`}
                        type="button"
                      >
                        <Icon name="edit" size={11} />
                      </button>
                    )}
                    {/* Dismiss file from results button */}
                    <button
                      className="file-dismiss-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismissFile(fileRes.filename)
                      }}
                      title={`Dismiss ${fileName}`}
                      type="button"
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </div>
                </div>

                {!isCollapsed && (
                  <div className="search-matches-list">
                    {fileRes.matches.map((match, idx) => (
                      <div
                        className="search-match-row"
                        key={`${match.filename}-${match.lineNumber}-${match.column}-${idx}`}
                        onClick={() => {
                          openFileInGroup(match.filename, focusedGroup)
                          setCursorPosition({
                            line: match.lineNumber,
                            col: match.column,
                          })
                          showToast(
                            `Jumped to ${match.filename} [Ln ${match.lineNumber}]`,
                          )
                        }}
                      >
                        <span className="match-line-num">
                          {match.lineNumber}
                        </span>
                        <span
                          className="match-snippet"
                          title={match.lineContent}
                        >
                          {renderHighlightedSnippet(
                            match.lineContent,
                            match.matchText,
                          )}
                        </span>
                        {/* Replace this single occurrence */}
                        {replaceOpen && (
                          <button
                            className="single-replace-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReplaceSingle(match)
                            }}
                            title="Replace this match"
                            type="button"
                          >
                            <Icon name="edit" size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div className="panel-hint">
          Search across workspace files using standard text or regular
          expressions. Click a result to navigate directly to line and column.
        </div>
      )}
    </div>
  )
}
