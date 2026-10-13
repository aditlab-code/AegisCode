import { useState, useMemo, useEffect } from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import {
  detectCsvDelimiter,
  parseCsv,
  formatFileSize,
  getRawFileUrl,
} from "./viewerTypes"
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
  const [pageSize, setPageSize] = useState(100)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortConfig, setSortConfig] = useState<SortConfig>(null)
  const [wrapText, setWrapText] = useState(false)
  const [viewMode, setViewMode] = useState<"table" | "raw">("table")
  const [isLoading, setIsLoading] = useState(false)

  // Sync buffer content or fetch from raw endpoint if empty
  useEffect(() => {
    if (buffer?.content) {
      setRawText(buffer.content)
      const detected = detectCsvDelimiter(buffer.content)
      setAutoDetectedDelimiter(detected)
      setActiveDelimiter(detected)
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
  }, [buffer?.content, filename])

  // Parse CSV rows cleanly
  const allRows = useMemo(() => {
    return parseCsv(rawText, activeDelimiter)
  }, [rawText, activeDelimiter])

  const headers = useMemo(() => {
    return allRows.length > 0 ? allRows[0] : []
  }, [allRows])

  const dataRows = useMemo(() => {
    return allRows.length > 1 ? allRows.slice(1) : []
  }, [allRows])

  // Filter rows by search query
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return dataRows
    const query = searchQuery.toLowerCase()
    return dataRows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(query)),
    )
  }, [dataRows, searchQuery])

  // Sort rows if column sort active
  const sortedRows = useMemo(() => {
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
  }, [filteredRows, sortConfig])

  // Rebatch / Paginate rows to prevent DOM memory bloat on large tables (> 100 rows)
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize))

  useEffect(() => {
    // Reset to page 1 if current page exceeds total pages
    if (page > totalPages) setPage(1)
  }, [page, totalPages])

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, page, pageSize])

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
          <span className="viewer-toolbar-badge font-mono">
            {dataRows.length} rows × {headers.length} cols
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
              value={activeDelimiter}
              onChange={(e) => {
                setActiveDelimiter(e.target.value as "," | ";" | "\t")
                setPage(1)
              }}
            >
              <option value=",">
                Comma (,){autoDetectedDelimiter === "," ? " [Auto]" : ""}
              </option>
              <option value=";">
                Semicolon (;){autoDetectedDelimiter === ";" ? " [Auto]" : ""}
              </option>
              <option value="&#9;">
                Tab (\t){autoDetectedDelimiter === "\t" ? " [Auto]" : ""}
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
                className="absolute right-1 top-1 text-ink-muted hover:text-ink text-xs"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right Pagination & Controls */}
        <div className="viewer-toolbar-group">
          {viewMode === "table" && (
            <>
              {/* Text Wrap Toggle */}
              <button
                type="button"
                className={`viewer-toolbar-btn ${wrapText ? "active" : ""}`}
                onClick={() => setWrapText((w) => !w)}
                title="Toggle Cell Text Wrapping"
              >
                <Icon name="wrap-text" size={12} />
                <span>Wrap</span>
              </button>

              {/* Batch Page Size Selector */}
              <select
                aria-label="Rows per page"
                className="bg-surface border border-line rounded px-1 py-0.5 text-ink text-xs cursor-pointer outline-none"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value))
                  setPage(1)
                }}
                title="Batch rows per page"
              >
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
                <option value={250}>250 / page</option>
                <option value={500}>500 / page</option>
              </select>

              {/* Pagination Navigation */}
              <button
                type="button"
                className="viewer-toolbar-btn"
                disabled={page <= 1}
                onClick={() => setPage(1)}
                title="First Page"
              >
                «
              </button>
              <button
                type="button"
                className="viewer-toolbar-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title="Previous Page"
              >
                ‹
              </button>

              <span className="viewer-toolbar-badge font-mono">
                {page} / {totalPages}
              </span>

              <button
                type="button"
                className="viewer-toolbar-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                title="Next Page"
              >
                ›
              </button>
              <button
                type="button"
                className="viewer-toolbar-btn"
                disabled={page >= totalPages}
                onClick={() => setPage(totalPages)}
                title="Last Page"
              >
                »
              </button>
            </>
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
        <div className="csv-table-container">
          {isLoading && (
            <div className="flex items-center justify-center p-12 text-ink-muted text-xs">
              <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2" />
              <span>Parsing tabular data...</span>
            </div>
          )}

          {!isLoading && allRows.length === 0 && (
            <div className="flex flex-col items-center justify-center p-12 text-ink-muted text-xs">
              <span>Empty CSV file</span>
            </div>
          )}

          {!isLoading && allRows.length > 0 && (
            <table className="csv-table">
              <thead>
                <tr>
                  <th className="csv-th csv-th-index">#</th>
                  {headers.map((header, colIdx) => {
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
                      {headers.map((_, colIdx) => {
                        const cellVal = row[colIdx] ?? ""
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
      )}
    </div>
  )
}
