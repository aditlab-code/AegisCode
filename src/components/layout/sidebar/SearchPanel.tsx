import { useState, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

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
    openFileInPane,
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

  // Compute search results across fileBuffers
  const searchResults: FileSearchResult[] = useMemo(() => {
    if (!search.trim()) return []

    let regex: RegExp
    try {
      let pattern = search
      if (!isRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      }
      if (isWholeWord) {
        pattern = `\\b${pattern}\\b`
      }
      const flags = isMatchCase ? "g" : "gi"
      regex = new RegExp(pattern, flags)
    } catch {
      // Incomplete regex while typing
      return []
    }

    const results: FileSearchResult[] = []

    for (const [filename, buffer] of Object.entries(fileBuffers)) {
      const content = buffer.content || ""
      const lines = content.split("\n")
      const fileMatches: MatchItem[] = []

      lines.forEach((lineText, idx) => {
        const lineNum = idx + 1
        // Reset regex state per line
        regex.lastIndex = 0
        let match: RegExpExecArray | null

        while ((match = regex.exec(lineText)) !== null) {
          fileMatches.push({
            filename,
            lineNumber: lineNum,
            column: match.index + 1,
            lineContent: lineText,
            matchText: match[0],
          })
          if (!regex.global) break
        }
      })

      if (fileMatches.length > 0) {
        results.push({
          filename,
          matches: fileMatches,
        })
      }
    }

    return results
  }, [fileBuffers, search, isRegex, isMatchCase, isWholeWord])

  const totalMatchesCount = useMemo(() => {
    return searchResults.reduce((acc, curr) => acc + curr.matches.length, 0)
  }, [searchResults])

  function toggleFileCollapse(filename: string) {
    setCollapsedFiles((prev) => ({
      ...prev,
      [filename]: !prev[filename],
    }))
  }

  // 1. Replace single match
  function handleReplaceSingle(match: MatchItem) {
    const buffer = fileBuffers[match.filename]
    if (!buffer) return

    const lines = buffer.content.split("\n")
    const targetLine = lines[match.lineNumber - 1]
    if (targetLine === undefined) return

    const before = targetLine.substring(0, match.column - 1)
    const after = targetLine.substring(
      match.column - 1 + match.matchText.length,
    )
    lines[match.lineNumber - 1] = before + replace + after

    updateFileContent(match.filename, lines.join("\n"))
    showToast(`Replaced match in ${match.filename} [Ln ${match.lineNumber}]`)
  }

  // 2. Replace all in single file
  function handleReplaceInFile(filename: string) {
    const buffer = fileBuffers[filename]
    if (!buffer || !search.trim()) return

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

      const updated = buffer.content.replace(regex, replace)
      updateFileContent(filename, updated)
      showToast(`Replaced all matches in ${filename}`)
    } catch {
      showToast("Invalid replacement pattern")
    }
  }

  // 3. Replace all across workspace
  function handleReplaceAll() {
    if (!search.trim() || totalMatchesCount === 0) return

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

      let filesAffected = 0
      searchResults.forEach((res) => {
        const buffer = fileBuffers[res.filename]
        if (buffer) {
          const updated = buffer.content.replace(regex, replace)
          updateFileContent(res.filename, updated)
          filesAffected++
        }
      })

      showToast(
        `Replaced ${totalMatchesCount} matches across ${filesAffected} files`,
      )
    } catch {
      showToast("Invalid replacement pattern")
    }
  }

  return (
    <div className="tool-panel search-panel">
      {/* Search Input Bar with Regex Modifiers */}
      <div className="search-input-group">
        <label className="panel-input search-box">
          <Icon name="search" size={13} />
          <input
            aria-label="Search files with regex"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search (supports regex)"
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
              className={`modifier-btn ${isMatchCase ? "modifier-active" : ""}`}
              onClick={() => setIsMatchCase((v) => !v)}
              title="Match Case (Alt+C)"
              type="button"
            >
              Aa
            </button>
            <button
              className={`modifier-btn ${isWholeWord ? "modifier-active" : ""}`}
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

        {/* Replace Bar Toggle & Input */}
        <div className="replace-bar-toggle">
          <button
            className="replace-toggle-btn"
            onClick={() => setReplaceOpen((v) => !v)}
            title="Toggle Replace"
            type="button"
          >
            <span
              className={`chevron-arrow ${replaceOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={12} />
            </span>
            <span>Replace</span>
          </button>
        </div>

        {replaceOpen && (
          <div className="replace-input-wrapper">
            <label className="panel-input replace-box">
              <Icon name="edit" size={12} />
              <input
                aria-label="Replace matches"
                onChange={(event) => setReplace(event.target.value)}
                placeholder="Replace with..."
                value={replace}
              />
              <button
                className="replace-all-btn"
                disabled={!search.trim() || totalMatchesCount === 0}
                onClick={handleReplaceAll}
                title="Replace All across workspace"
                type="button"
              >
                Replace All
              </button>
            </label>
          </div>
        )}
      </div>

      <div className="panel-options">
        <span>files to include</span>
        <span>src/**, *.ts, *.tsx</span>
      </div>

      {/* Results Tree */}
      {search ? (
        <div className="search-results">
          <div className="result-summary">
            {totalMatchesCount} {totalMatchesCount === 1 ? "result" : "results"}{" "}
            in {searchResults.length}{" "}
            {searchResults.length === 1 ? "file" : "files"}
          </div>

          {searchResults.map((fileRes) => {
            const isCollapsed = collapsedFiles[fileRes.filename]
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
                    <Icon name="code" size={13} />
                    <span className="search-filename">{fileRes.filename}</span>
                    <small className="search-file-badge">
                      {fileRes.matches.length}
                    </small>
                  </button>

                  {/* Replace all in this file button */}
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
                </div>

                {!isCollapsed && (
                  <div className="search-matches-list">
                    {fileRes.matches.map((match, idx) => (
                      <div
                        className="search-match-row"
                        key={`${match.filename}-${match.lineNumber}-${match.column}-${idx}`}
                        onClick={() => {
                          openFileInPane(match.filename)
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
                          {match.lineContent.trim()}
                        </span>
                        {/* Replace this single occurrence */}
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
