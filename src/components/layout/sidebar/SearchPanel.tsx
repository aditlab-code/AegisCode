import { useState, useMemo, useEffect, useCallback, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "@/store"
import {
  searchWorkspace,
  replaceAllWorkspace,
  fetchFileContent,
  saveWorkspaceFile,
} from "../../../utils/workspaceApi"
import type { GotoLineEventDetail } from "../../../types/workbench"

interface MatchItem {
  filename: string
  lineNumber: number
  column: number
  lineContent: string
  matchText: string
  isFilenameMatch?: boolean
}

interface FileSearchResult {
  filename: string
  matches: MatchItem[]
}

export function SearchPanel() {
  const {
    updateFileContent,
    syncBufferWithDisk,
    openFileInGroup,
    focusedGroup,
    setCursorPosition,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      updateFileContent: s.updateFileContent,
      syncBufferWithDisk: s.syncBufferWithDisk,
      openFileInGroup: s.openFileInGroup,
      focusedGroup: s.focusedGroup,
      setCursorPosition: s.setCursorPosition,
      showToast: s.showToast,
    })),
  )

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
  const [searchWarning, setSearchWarning] = useState<string | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement>(null)

  const [visibleLimit, setVisibleLimit] = useState(100)
  const activeAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  const refreshSearch = useCallback(
    async (signal?: AbortSignal) => {
      if (!search.trim()) {
        setBackendResults([])
        setSearchWarning(null)
        setSearchError(null)
        return
      }

      try {
        const response = await searchWorkspace(
          search,
          isRegex,
          isMatchCase,
          isWholeWord,
          signal,
        )
        if (!signal?.aborted) {
          setSearchError(null)
          if (response.isCapped) {
            setSearchWarning(
              response.warning ||
                "Banyak file cocok (dibatasi 100 matches). Persempit kata kunci jika file belum ditemukan.",
            )
          } else {
            setSearchWarning(null)
          }
          setBackendResults(
            response.results.map((r) => ({
              filename: r.filename,
              matches: r.matches.map((m) => ({
                filename: r.filename,
                lineNumber: m.lineNumber,
                column: m.column,
                lineContent: m.lineContent,
                matchText: m.matchText,
                isFilenameMatch: m.isFilenameMatch,
              })),
            })),
          )
        }
      } catch (err: any) {
        if (err?.name === "AbortError" || signal?.aborted) {
          return
        }
        setBackendResults([])
        setSearchWarning(null)
        const errMsg = err?.message || "Search failed during processing"
        setSearchError(errMsg)
        showToast(`Search failed: ${errMsg}`)
      }
    },
    [search, isRegex, isMatchCase, isWholeWord, showToast],
  )

  useEffect(() => {
    setDismissedFiles({})
    setVisibleLimit(100)
    if (!search.trim()) {
      setBackendResults([])
      setSearchWarning(null)
      setSearchError(null)
      return
    }

    const controller = new AbortController()
    activeAbortRef.current?.abort()
    activeAbortRef.current = controller

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        await refreshSearch(controller.signal)
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false)
        }
      }
    }, 250)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, isRegex, isMatchCase, isWholeWord, refreshSearch])

  const searchResults: FileSearchResult[] = useMemo(() => {
    return backendResults.filter((f) => !dismissedFiles[f.filename])
  }, [backendResults, dismissedFiles])

  const totalMatchesCount = useMemo(() => {
    return searchResults.reduce((acc, curr) => acc + curr.matches.length, 0)
  }, [searchResults])

  const { visibleFiles, renderedMatchesCount, hasMore } = useMemo(() => {
    let remainingQuota = visibleLimit
    const filesList: FileSearchResult[] = []
    let count = 0

    for (const file of searchResults) {
      if (remainingQuota <= 0) break

      if (file.matches.length <= remainingQuota) {
        filesList.push(file)
        remainingQuota -= file.matches.length
        count += file.matches.length
      } else {
        filesList.push({
          filename: file.filename,
          matches: file.matches.slice(0, remainingQuota),
        })
        count += remainingQuota
        remainingQuota = 0
        break
      }
    }

    return {
      visibleFiles: filesList,
      renderedMatchesCount: count,
      hasMore: totalMatchesCount > count,
    }
  }, [searchResults, visibleLimit, totalMatchesCount])

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
    if (match.isFilenameMatch) {
      showToast(`Cannot replace text for filename match: ${match.filename}`)
      return
    }

    try {
      let content = ""
      const buffers = useWorkbenchStore.getState().fileBuffers
      const hasBuffer = Boolean(buffers[match.filename])
      if (hasBuffer) {
        content = buffers[match.filename].content
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
      const buffers = useWorkbenchStore.getState().fileBuffers
      const hasBuffer = Boolean(buffers[filename])
      if (hasBuffer) {
        content = buffers[filename].content
      } else {
        content = await fetchFileContent(filename)
      }

      const updated = content.replace(regex, replace)
      if (content === updated) {
        showToast(`No text content matches to replace in ${filename}`)
        return
      }
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

      const buffers = useWorkbenchStore.getState().fileBuffers
      for (const path of result.modifiedFiles) {
        if (buffers[path]) {
          const freshContent = await fetchFileContent(path).catch(() => "")
          if (freshContent) {
            syncBufferWithDisk(path, freshContent)
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

  function renderHighlightedSnippet(match: MatchItem) {
    const { lineContent, column, matchText } = match
    if (!lineContent || !matchText) return lineContent || ""

    const leadingSpaces = lineContent.length - lineContent.trimStart().length
    const trimmed = lineContent.trim()
    const startCol = column > 0 ? column - 1 : 0
    const relCol = startCol - leadingSpaces

    if (
      relCol >= 0 &&
      relCol + matchText.length <= trimmed.length &&
      (isMatchCase
        ? trimmed.substring(relCol, relCol + matchText.length) === matchText
        : trimmed.substring(relCol, relCol + matchText.length).toLowerCase() ===
          matchText.toLowerCase())
    ) {
      const before = trimmed.substring(0, relCol)
      const matched = trimmed.substring(relCol, relCol + matchText.length)
      const after = trimmed.substring(relCol + matchText.length)
      return (
        <>
          {before}
          <span className="match-highlight">{matched}</span>
          {after}
        </>
      )
    }

    const searchTarget = isMatchCase ? trimmed : trimmed.toLowerCase()
    const searchPattern = isMatchCase ? matchText : matchText.toLowerCase()
    const idx = searchTarget.indexOf(searchPattern)

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
              placeholder="Search files... (regex)"
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
              <IconButton
                className="replace-all-btn"
                disabled={!search.trim() || totalMatchesCount === 0}
                label="Replace All across workspace"
                onClick={handleReplaceAll}
              >
                <Icon name="replace-all" size={12} />
              </IconButton>
            </label>
          </div>
        )}
      </div>

      {/* Results Tree */}
      {search ? (
        <div className="search-results">
          {searchError && (
            <div
              className="mx-3 mt-2 p-2 rounded text-xs bg-error-soft text-error border border-error/30 flex items-start gap-1.5"
              role="alert"
            >
              <Icon name="error" size={14} className="shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                <span className="font-semibold">Kesalahan Pemrosesan:</span>{" "}
                {searchError}
              </div>
            </div>
          )}

          {searchWarning && (
            <div
              className="mx-3 mt-2 p-2 rounded text-xs bg-warning-soft text-warning border border-warning/30 flex items-start gap-1.5"
              role="status"
            >
              <Icon name="warning" size={14} className="shrink-0 mt-0.5" />
              <div className="flex-1 leading-snug">
                <span className="font-semibold">Perhatian:</span>{" "}
                {searchWarning}
              </div>
            </div>
          )}

          <div className="result-summary flex items-center justify-between">
            <span>
              {isSearching ? (
                <span className="text-ink-muted italic">Mencari...</span>
              ) : (
                <>
                  {totalMatchesCount}{" "}
                  {totalMatchesCount === 1 ? "result" : "results"} in{" "}
                  {searchResults.length}{" "}
                  {searchResults.length === 1 ? "file" : "files"}
                  {totalMatchesCount >= 100 && (
                    <span className="text-[10px] text-ink-muted ml-1 font-normal">
                      (capped at 100)
                    </span>
                  )}
                </>
              )}
            </span>
            <div className="flex items-center gap-1">
              <IconButton
                className="p-0.5 text-ink-muted hover:text-ink cursor-pointer"
                label="Refresh Search"
                onClick={() => refreshSearch()}
              >
                <Icon name="refresh" size={11} />
              </IconButton>
              <IconButton
                className="p-0.5 text-ink-muted hover:text-ink cursor-pointer"
                label="Clear Search Results"
                onClick={() => setSearch("")}
              >
                <Icon name="close" size={10} />
              </IconButton>
              <IconButton
                className="p-0.5 text-ink-muted hover:text-ink cursor-pointer"
                label="Collapse / Expand All"
                onClick={toggleCollapseAll}
              >
                <Icon name="chevron" size={11} />
              </IconButton>
            </div>
          </div>

          {visibleFiles.map((fileRes) => {
            const isCollapsed = collapsedFiles[fileRes.filename]
            const cleanPath = fileRes.filename
              .replace(/\\/g, "/")
              .replace(/^\.\//, "")
            const lastSlash = cleanPath.lastIndexOf("/")
            const fileName =
              lastSlash !== -1 ? cleanPath.substring(lastSlash + 1) : cleanPath
            const dirPath =
              lastSlash !== -1 ? cleanPath.substring(0, lastSlash) : ""

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
                    <span className="search-filename" title={fileName}>
                      {fileName}
                    </span>
                    {dirPath && (
                      <span
                        className="search-filepath text-ink-muted text-[10px] font-normal truncate ml-1"
                        title={dirPath}
                      >
                        {dirPath}
                      </span>
                    )}
                    <small className="search-file-badge">
                      {fileRes.matches.length}
                    </small>
                  </button>

                  <div className="search-file-actions">
                    {/* Replace all in this file button (only if content matches exist) */}
                    {replaceOpen &&
                      fileRes.matches.some((m) => !m.isFilenameMatch) && (
                        <IconButton
                          className="file-replace-btn"
                          label={`Replace all in ${fileName}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReplaceInFile(fileRes.filename)
                          }}
                        >
                          <Icon name="edit" size={11} />
                        </IconButton>
                      )}
                    {/* Dismiss file from results button */}
                    <IconButton
                      className="file-dismiss-btn"
                      label={`Dismiss ${fileName}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismissFile(fileRes.filename)
                      }}
                    >
                      <Icon name="close" size={10} />
                    </IconButton>
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
                          if (!match.isFilenameMatch) {
                            setCursorPosition({
                              line: match.lineNumber,
                              col: match.column,
                            })
                            if (typeof window !== "undefined") {
                              const detail: GotoLineEventDetail = {
                                file: match.filename,
                                line: match.lineNumber,
                                col: match.column,
                              }
                              window.dispatchEvent(
                                new CustomEvent<GotoLineEventDetail>(
                                  "aegis:editor-goto-line",
                                  { detail },
                                ),
                              )
                              setTimeout(() => {
                                window.dispatchEvent(
                                  new CustomEvent<GotoLineEventDetail>(
                                    "aegis:editor-goto-line",
                                    { detail },
                                  ),
                                )
                              }, 50)
                            }
                            showToast(
                              `Jumped to ${match.filename} [Ln ${match.lineNumber}]`,
                            )
                          } else {
                            showToast(`Opened ${match.filename}`)
                          }
                        }}
                      >
                        <span className="match-line-num">
                          {match.isFilenameMatch ? "file" : match.lineNumber}
                        </span>
                        <span
                          className="match-snippet"
                          title={match.lineContent}
                        >
                          {match.isFilenameMatch ? (
                            <span className="text-ink-muted italic">
                              Matching file name
                            </span>
                          ) : (
                            renderHighlightedSnippet(match)
                          )}
                        </span>
                        {/* Replace this single occurrence (disabled for filename matches) */}
                        {replaceOpen && !match.isFilenameMatch && (
                          <IconButton
                            className="single-replace-btn"
                            label="Replace this match"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleReplaceSingle(match)
                            }}
                          >
                            <Icon name="edit" size={10} />
                          </IconButton>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {hasMore && (
            <div className="py-2.5 px-3 text-center border-t border-line/50 mt-1">
              <button
                className="text-xs px-3 py-1 bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink rounded border border-line cursor-pointer transition-colors"
                onClick={() => setVisibleLimit((prev) => prev + 100)}
                type="button"
              >
                Load more matches ({totalMatchesCount - renderedMatchesCount}{" "}
                remaining)...
              </button>
            </div>
          )}
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
