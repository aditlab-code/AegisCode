import { useState, useMemo, useEffect, useRef } from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import {
  detectCsvDelimiter,
  parseCsv,
  formatFileSize,
  getRawFileUrl,
} from "./viewerTypes"
import {
  queryWorkspaceCsv,
  type CsvQueryResponse,
} from "../../../../utils/workspaceApi"
import { CodePane } from "../CodePane"
import "./viewers.css"

interface CsvViewerProps {
  filename: string
  groupId?: "group1" | "group2"
}

type SortConfig = {
  colIndex: number
  direction: "asc" | "desc"
} | null

export default function CsvViewer({
  filename,
  groupId = "group1",
}: CsvViewerProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const { buffer, focusedGroup } = useWorkbenchStore(
    useShallow((s) => ({
      buffer: s.fileBuffers[filename],
      focusedGroup: s.focusedGroup,
    })),
  )

  const [rawText, setRawText] = useState(buffer?.content ?? "")
  const [activeDelimiter, setActiveDelimiter] = useState<"," | ";" | "\t">(",")
  const [autoDetectedDelimiter, setAutoDetectedDelimiter] =
    useState<"," | ";" | "\t">(",")
  const [page, setPage] = useState(1)
  const [pageInput, setPageInput] = useState("1")
  const [pageSize, setPageSize] = useState(10)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)
  const [wrapText, setWrapText] = useState(false)
  const [viewMode, setViewMode] = useState<"table" | "raw">("table")
  const [isLoading, setIsLoading] = useState(false)

  // Column rebatching / windowing for wide tables (> 25 columns)
  const [colBatchIndex, setColBatchIndex] = useState(0)
  const colBatchSize = 25
  const [showAllCols, setShowAllCols] = useState(false)

  // Hybrid Big Data Mode detection: large file guard or file size >= 2MB
  const isServerSideMode = Boolean(
    buffer?.isLargeFile || (buffer?.fileSize ?? 0) >= 2 * 1024 * 1024,
  )

  const [serverData, setServerData] = useState<CsvQueryResponse | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // In Server-Side Mode, query backend via Native Go engine
  useEffect(() => {
    if (!isServerSideMode) return

    let isMounted = true
    setIsLoading(true)

    queryWorkspaceCsv(filename, {
      page,
      pageSize,
      colOffset: showAllCols ? 0 : colBatchIndex * colBatchSize,
      colLimit: showAllCols ? 0 : colBatchSize,
      search: debouncedSearch,
    })
      .then((data) => {
        if (!isMounted) return
        setServerData(data)
        setIsLoading(false)
      })
      .catch((err) => {
        if (!isMounted) return
        console.error("Failed to query CSV from server:", err)
        setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [
    filename,
    isServerSideMode,
    page,
    pageSize,
    colBatchIndex,
    showAllCols,
    debouncedSearch,
  ])

  // In Client-Side Mode, sync buffer content or fetch from raw endpoint
  useEffect(() => {
    if (isServerSideMode) return

    if (typeof buffer?.content === "string") {
      setRawText(buffer.content)
      const detected = detectCsvDelimiter(buffer.content)
      setAutoDetectedDelimiter(detected)
      setActiveDelimiter(detected)
      setIsLoading(false)
    } else {
      setIsLoading(true)
      fetch(getRawFileUrl(filename))
        .then((res) => res.text())
        .then((text) => {
          setRawText(text)
          const detected = detectCsvDelimiter(text)
          setAutoDetectedDelimiter(detected)
          setActiveDelimiter(detected)
          setIsLoading(false)
        })
        .catch((err) => {
          console.error("Failed to load raw CSV text:", err)
          setIsLoading(false)
        })
    }
  }, [isServerSideMode, buffer?.content, filename])

  // Parse CSV rows cleanly in client-side mode
  const allRows = useMemo(() => {
    if (isServerSideMode) return []
    return parseCsv(rawText, activeDelimiter)
  }, [isServerSideMode, rawText, activeDelimiter])

  const headers = useMemo(() => {
    if (isServerSideMode) return serverData?.headers ?? []
    return allRows.length > 0 ? allRows[0] : []
  }, [isServerSideMode, serverData?.headers, allRows])

  const totalCols = isServerSideMode
    ? (serverData?.totalCols ?? headers.length)
    : headers.length

  const dataRows = useMemo(() => {
    if (isServerSideMode) return serverData?.rows ?? []
    return allRows.length > 1 ? allRows.slice(1) : []
  }, [isServerSideMode, serverData?.rows, allRows])

  // Filter rows by search query in client mode
  const filteredRows = useMemo(() => {
    if (isServerSideMode) return dataRows
    if (!searchQuery.trim()) return dataRows
    const query = searchQuery.toLowerCase()
    return dataRows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(query)),
    )
  }, [isServerSideMode, dataRows, searchQuery])

  // Sort rows if column sort active (client mode)
  const sortedRows = useMemo(() => {
    if (isServerSideMode) return filteredRows
    if (!sortConfig) return filteredRows

    const { colIndex, direction } = sortConfig
    return [...filteredRows].sort((a, b) => {
      const valA = (a[colIndex] ?? "").trim()
      const valB = (b[colIndex] ?? "").trim()

      const numA = Number(valA)
      const numB = Number(valB)

      if (!isNaN(numA) && !isNaN(numB) && valA !== "" && valB !== "") {
        return direction === "asc" ? numA - numB : numB - numA
      }
      return direction === "asc"
        ? valA.localeCompare(valB)
        : valB.localeCompare(valA)
    })
  }, [isServerSideMode, filteredRows, sortConfig])

  const totalRows = isServerSideMode
    ? (serverData?.totalRows ?? 0)
    : sortedRows.length

  const totalPages = isServerSideMode
    ? Math.max(1, serverData?.totalPages ?? 1)
    : Math.max(1, Math.ceil(sortedRows.length / pageSize))

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  useEffect(() => {
    setPageInput(String(page))
  }, [page])

  // Reset vertical scroll to top on page navigation
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0
    }
  }, [page])

  const paginatedRows = useMemo(() => {
    if (isServerSideMode) return serverData?.rows ?? []
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [isServerSideMode, serverData?.rows, sortedRows, page, pageSize])

  const handlePageSizeChange = (newSize: number) => {
    const currentFirstRow = (page - 1) * pageSize
    const newPage = Math.floor(currentFirstRow / newSize) + 1
    setPageSize(newSize)
    setPage(Math.max(1, newPage))
  }

  const handleJumpPage = () => {
    const parsed = parseInt(pageInput.trim(), 10)
    if (isNaN(parsed)) {
      setPageInput(String(page))
      return
    }
    const clamped = Math.max(1, Math.min(totalPages, parsed))
    setPage(clamped)
    setPageInput(String(clamped))
  }

  // Column rebatching / windowing logic
  const isWideTable = totalCols > 25
  const totalColBatches = Math.max(1, Math.ceil(totalCols / colBatchSize))

  useEffect(() => {
    if (colBatchIndex >= totalColBatches) {
      setColBatchIndex(0)
    }
  }, [totalColBatches, colBatchIndex])

  const visibleColRange = useMemo(() => {
    if (!isWideTable || showAllCols) {
      return { start: 0, end: totalCols }
    }
    const start = colBatchIndex * colBatchSize
    const end = Math.min(totalCols, start + colBatchSize)
    return { start, end }
  }, [isWideTable, showAllCols, colBatchIndex, colBatchSize, totalCols])

  const visibleHeaders = useMemo(() => {
    if (isServerSideMode) {
      return (serverData?.headers ?? []).map((h, i) => ({
        header: h,
        colIdx: (serverData?.colOffset ?? 0) + i,
      }))
    }
    return headers
      .slice(visibleColRange.start, visibleColRange.end)
      .map((h, i) => ({
        header: h,
        colIdx: visibleColRange.start + i,
      }))
  }, [
    isServerSideMode,
    serverData?.headers,
    serverData?.colOffset,
    headers,
    visibleColRange,
  ])

  const startRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1
  const endRow = Math.min(totalRows, page * pageSize)
  const isFiltered = Boolean(searchQuery.trim())

  const handleHeaderClick = (colIndex: number) => {
    setSortConfig((prev) => {
      if (prev?.colIndex === colIndex) {
        if (prev.direction === "asc") return { colIndex, direction: "desc" }
        return null // Reset sort
      }
      return { colIndex, direction: "asc" }
    })
  }

  // Column letters (A, B, C...) helper
  const getColLetter = (idx: number): string => {
    let letter = ""
    let temp = idx
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter
      temp = Math.floor(temp / 26) - 1
    }
    return letter
  }

  const hasData = isServerSideMode
    ? (serverData?.totalRows ?? 0) > 0
    : allRows.length > 0

  return (
    <div className="viewer-container">
      {/* CSV Viewer Header Toolbar */}
      <div className="viewer-toolbar">
        {/* Left Information & Search */}
        <div className="viewer-toolbar-group">
          <Icon name="table" size={14} className="text-accent" />
          <span className="font-medium text-ink">
            {filename.split("/").pop()}
          </span>
          {isServerSideMode && (
            <span
              className="csv-server-badge inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-accent/15 text-accent border border-accent/30"
              title={`Native Go Big Data Engine active (${
                serverData?.queryTimeMs
                  ? `${serverData.queryTimeMs.toFixed(1)}ms`
                  : "Indexed"
              })`}
            >
              <Icon name="sparkle" size={11} />
              Big Data Engine
            </span>
          )}
          <span className="viewer-toolbar-badge font-mono">
            {isServerSideMode
              ? `${totalRows.toLocaleString()} rows × ${totalCols} cols`
              : `${dataRows.length} rows × ${headers.length} cols`}
          </span>
          {buffer?.fileSize && (
            <span className="viewer-toolbar-badge">
              {formatFileSize(buffer.fileSize)}
            </span>
          )}

          {/* Delimiter Selector */}
          <div className="flex items-center gap-1 ml-2 text-xs">
            <span className="text-ink-muted text-[11px]">Delimiter:</span>
            <select
              aria-label="CSV Delimiter"
              className="bg-surface border border-line rounded px-1.5 py-0.5 text-ink text-xs cursor-pointer outline-none"
              value={
                isServerSideMode
                  ? (serverData?.delimiter ?? ",")
                  : activeDelimiter
              }
              disabled={isServerSideMode}
              onChange={(e) => {
                if (!isServerSideMode) {
                  setActiveDelimiter(e.target.value as "," | ";" | "\t")
                  setPage(1)
                }
              }}
            >
              <option value=",">
                Comma (,)
                {(
                  isServerSideMode
                    ? serverData?.delimiter === ","
                    : autoDetectedDelimiter === ","
                )
                  ? " [Auto]"
                  : ""}
              </option>
              <option value=";">
                Semicolon (;)
                {(
                  isServerSideMode
                    ? serverData?.delimiter === ";"
                    : autoDetectedDelimiter === ";"
                )
                  ? " [Auto]"
                  : ""}
              </option>
              <option value="&#9;">
                Tab (\t)
                {(
                  isServerSideMode
                    ? serverData?.delimiter === "\t"
                    : autoDetectedDelimiter === "\t"
                )
                  ? " [Auto]"
                  : ""}
              </option>
            </select>
          </div>

          {/* Search Filter Input */}
          <div className="relative ml-2">
            <input
              type="text"
              placeholder="Filter table..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setPage(1)
              }}
              className="bg-surface border border-line rounded px-2 py-0.5 text-xs text-ink placeholder:text-ink-muted w-36 focus:w-48 transition-all outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-1 top-1 text-ink-muted hover:text-ink text-xs cursor-pointer"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right Controls */}
        <div className="viewer-toolbar-group">
          {viewMode === "table" && (
            <button
              type="button"
              className={`viewer-toolbar-btn ${wrapText ? "active" : ""}`}
              onClick={() => setWrapText((w) => !w)}
              title="Toggle Cell Text Wrapping"
            >
              <Icon name="wrap-text" size={12} />
              <span>Wrap</span>
            </button>
          )}

          {/* Table / Raw Text View Mode Switcher */}
          <div className="flex items-center rounded border border-line bg-surface p-0.5 ml-2">
            <button
              type="button"
              className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                viewMode === "table"
                  ? "bg-accent text-canvas font-medium"
                  : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              Table
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                viewMode === "raw"
                  ? "bg-accent text-canvas font-medium"
                  : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setViewMode("raw")}
              title="Raw CSV Text Editor"
            >
              Raw Text
            </button>
          </div>
        </div>
      </div>

      {/* Raw Code Editor Mode */}
      {viewMode === "raw" && (
        <div className="flex-1 h-full overflow-hidden">
          <CodePane
            filename={filename}
            isFocused={focusedGroup === groupId}
            paneId={groupId === "group2" ? "secondary" : "primary"}
          />
        </div>
      )}

      {/* Data Table Grid Mode */}
      {viewMode === "table" && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="csv-table-container" ref={tableContainerRef}>
            {isLoading && (
              <div className="flex items-center justify-center p-12 text-ink-muted text-xs">
                <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
                <span>
                  {isServerSideMode
                    ? "Querying Big Data engine..."
                    : "Parsing tabular data..."}
                </span>
              </div>
            )}

            {!isLoading && !hasData && (
              <div className="flex flex-col items-center justify-center p-12 text-ink-muted text-xs">
                <span>
                  {searchQuery ? "No matching rows found" : "Empty CSV file"}
                </span>
              </div>
            )}

            {!isLoading && hasData && (
              <table className="csv-table">
                <thead>
                  <tr>
                    <th className="csv-th csv-th-index">#</th>
                    {visibleHeaders.map(({ header, colIdx }) => {
                      const isSorted = sortConfig?.colIndex === colIdx
                      const sortIcon = isSorted
                        ? sortConfig?.direction === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""
                      return (
                        <th
                          key={colIdx}
                          className="csv-th cursor-pointer hover:bg-surface-hover"
                          onClick={() => handleHeaderClick(colIdx)}
                          title={`Sort by ${header || `Column ${getColLetter(colIdx)}`}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-ink">
                              {header || `(Col ${getColLetter(colIdx)})`}
                            </span>
                            <span className="text-[10px] text-ink-muted font-mono">
                              {getColLetter(colIdx)}
                              {sortIcon}
                            </span>
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((row, rowIdx) => {
                    const absoluteIndex = (page - 1) * pageSize + rowIdx + 1
                    return (
                      <tr key={rowIdx} className="csv-tr">
                        <td className="csv-td csv-td-index">{absoluteIndex}</td>
                        {visibleHeaders.map(({ colIdx }, i) => {
                          const cellVal = isServerSideMode
                            ? (row[i] ?? "")
                            : (row[colIdx] ?? "")
                          return (
                            <td
                              key={colIdx}
                              className={`csv-td ${
                                wrapText ? "csv-cell-wrap" : "csv-cell-truncate"
                              }`}
                              title={cellVal}
                            >
                              {cellVal}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Sticky Bottom Footer Bar */}
          {!isLoading && hasData && (
            <div className="csv-footer">
              {/* Row Summary Counter */}
              <div className="flex items-center gap-2">
                <span className="text-ink font-mono text-[11px]">
                  Showing rows{" "}
                  <strong className="text-accent">{startRow}</strong>–
                  <strong className="text-accent">{endRow}</strong> of{" "}
                  <strong>{totalRows.toLocaleString()}</strong>
                </span>
                {isFiltered && (
                  <span className="text-ink-muted text-[10px]">
                    {isServerSideMode
                      ? `(${serverData?.matchCount?.toLocaleString() ?? 0} matches found)`
                      : `(filtered from ${dataRows.length} total)`}
                  </span>
                )}
              </div>

              {/* Column Batching Window Controls (for wide tables > 25 cols) */}
              {isWideTable && (
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-ink-muted text-[11px]">Columns:</span>
                  {!showAllCols && (
                    <>
                      <button
                        type="button"
                        className="viewer-toolbar-btn font-mono"
                        disabled={colBatchIndex <= 0}
                        onClick={() =>
                          setColBatchIndex((c) => Math.max(0, c - 1))
                        }
                        title="Previous 25 Columns"
                      >
                        ‹ Prev Cols
                      </button>
                      <span className="csv-col-batch-badge">
                        {visibleColRange.start + 1}–{visibleColRange.end} of{" "}
                        {totalCols}
                      </span>
                      <button
                        type="button"
                        className="viewer-toolbar-btn font-mono"
                        disabled={colBatchIndex >= totalColBatches - 1}
                        onClick={() =>
                          setColBatchIndex((c) =>
                            Math.min(totalColBatches - 1, c + 1),
                          )
                        }
                        title="Next 25 Columns"
                      >
                        Next Cols ›
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className={`viewer-toolbar-btn text-[10px] ${
                      showAllCols ? "active" : ""
                    }`}
                    onClick={() => setShowAllCols((s) => !s)}
                    title={
                      showAllCols
                        ? "Switch back to batched columns (25 cols/batch)"
                        : `Show all ${totalCols} columns (may slow down rendering)`
                    }
                  >
                    <span>{showAllCols ? "Batch (25)" : "Show All"}</span>
                  </button>
                </div>
              )}

              {/* Bottom Pagination Controls */}
              <div className="flex items-center gap-1.5">
                {/* Rows per page selector */}
                <select
                  aria-label="Rows per page (footer)"
                  className="bg-surface border border-line rounded px-1.5 py-0.5 text-ink text-xs cursor-pointer outline-none font-mono"
                  value={pageSize}
                  onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  title="Batch rows per page"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                  <option value={100}>100 / page</option>
                  <option value={250}>250 / page</option>
                  <option value={500}>500 / page</option>
                </select>

                <button
                  type="button"
                  className="viewer-toolbar-btn font-mono"
                  disabled={page <= 1}
                  onClick={() => setPage(1)}
                  title="First Page (Page 1)"
                >
                  « First
                </button>
                <button
                  type="button"
                  className="viewer-toolbar-btn font-mono"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  title="Previous Page"
                >
                  ‹ Prev
                </button>

                <div className="flex items-center gap-1 text-[11px] px-1">
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJumpPage()
                    }}
                    onBlur={handleJumpPage}
                    className="csv-page-input"
                    title="Direct Jump to Page Number (Press Enter)"
                  />
                  <span className="text-ink-muted font-mono">
                    / {totalPages}
                  </span>
                </div>

                <button
                  type="button"
                  className="viewer-toolbar-btn font-mono"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  title="Next Page"
                >
                  Next ›
                </button>
                <button
                  type="button"
                  className="viewer-toolbar-btn font-mono"
                  disabled={page >= totalPages}
                  onClick={() => setPage(totalPages)}
                  title={`Last Page (Page ${totalPages})`}
                >
                  Last »
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
