import { useState, useMemo, useEffect, useRef, type KeyboardEvent } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"
import { saveWorkspaceFile } from "../../../utils/workspaceApi"

interface EditorFindWidgetProps {
  isOpen: boolean
  isReplaceOpen?: boolean
  onClose: () => void
  onToggleReplace?: () => void
  filename?: string
  groupId?: "group1" | "group2"
}

interface EditorMatch {
  index: number
  length: number
  line: number
  col: number
  text: string
}

export function EditorFindWidget({
  isOpen,
  isReplaceOpen = false,
  onClose,
  filename,
}: EditorFindWidgetProps) {
  const {
    activeTab,
    secondaryActiveTab,
    focusedPane,
    splitEditor,
    fileBuffers,
    updateFileContent,
    setCursorPosition,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      activeTab: s.activeTab,
      secondaryActiveTab: s.secondaryActiveTab,
      focusedPane: s.focusedPane,
      splitEditor: s.splitEditor,
      fileBuffers: s.fileBuffers,
      updateFileContent: s.updateFileContent,
      setCursorPosition: s.setCursorPosition,
      showToast: s.showToast,
    })),
  )

  const [query, setQuery] = useState("")
  const [replaceText, setReplaceText] = useState("")
  const [localReplaceOpen, setLocalReplaceOpen] = useState(isReplaceOpen)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchWord, setMatchWord] = useState(false)
  const [isRegex, setIsRegex] = useState(false)
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)

  const findInputRef = useRef<HTMLInputElement>(null)
  const replaceInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isReplaceOpen) {
      setLocalReplaceOpen(true)
    }
  }, [isReplaceOpen])

  useEffect(() => {
    if (isOpen) {
      if (localReplaceOpen && isReplaceOpen) {
        replaceInputRef.current?.focus()
      } else {
        findInputRef.current?.focus()
      }
    }
  }, [isOpen, localReplaceOpen, isReplaceOpen])

  const currentFile =
    filename ||
    (focusedPane === "secondary" && splitEditor
      ? secondaryActiveTab
      : activeTab)
  const content = fileBuffers[currentFile]?.content || ""

  const matches = useMemo<EditorMatch[]>(() => {
    if (!query.trim()) return []
    try {
      let pattern = query
      if (!isRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      }
      if (matchWord) {
        pattern = `\\b${pattern}\\b`
      }
      const flags = caseSensitive ? "g" : "gi"
      const regex = new RegExp(pattern, flags)

      // Pre-calculate line start offsets in O(N)
      const lineStarts: number[] = [0]
      for (let i = 0; i < content.length; i++) {
        if (content[i] === "\n") {
          lineStarts.push(i + 1)
        }
      }

      interface MatchLocation {
        line: number
        col: number
      }

      function getLineAndCol(idx: number): MatchLocation {
        let low = 0
        let high = lineStarts.length - 1
        let lineIdx = 0
        while (low <= high) {
          const mid = (low + high) >> 1
          if (lineStarts[mid] <= idx) {
            lineIdx = mid
            low = mid + 1
          } else {
            high = mid - 1
          }
        }
        return {
          line: lineIdx + 1,
          col: idx - lineStarts[lineIdx] + 1,
        }
      }

      const results: EditorMatch[] = []
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        const index = match.index
        const text = match[0]
        if (!text) break

        const loc = getLineAndCol(index)

        results.push({
          index,
          length: text.length,
          line: loc.line,
          col: loc.col,
          text,
        })
        if (!regex.global) break
      }
      return results
    } catch {
      return []
    }
  }, [content, query, caseSensitive, matchWord, isRegex])

  const safeIndex =
    matches.length > 0
      ? Math.min(Math.max(0, activeMatchIndex), matches.length - 1)
      : 0

  function jumpToMatch(idx: number) {
    if (matches.length === 0) return
    const target = matches[idx]
    if (!target) return
    setActiveMatchIndex(idx)
    setCursorPosition({ line: target.line, col: target.col })
  }

  function handleNext() {
    if (matches.length === 0) return
    const nextIdx = (safeIndex + 1) % matches.length
    jumpToMatch(nextIdx)
  }

  function handlePrevious() {
    if (matches.length === 0) return
    const prevIdx = (safeIndex - 1 + matches.length) % matches.length
    jumpToMatch(prevIdx)
  }

  function handleReplaceCurrent() {
    if (matches.length === 0 || !currentFile) return
    const current = matches[safeIndex]
    if (!current) return

    const before = content.slice(0, current.index)
    const after = content.slice(current.index + current.length)
    const newContent = before + replaceText + after

    updateFileContent(currentFile, newContent)
    saveWorkspaceFile(currentFile, newContent, false).catch((err) => {
      console.warn("Failed to auto-save file after replace:", err)
    })
    showToast(`Replaced match at Ln ${current.line}, Col ${current.col}`)

    // If there were matches remaining, jump to next
    if (matches.length > 1) {
      const nextIdx = safeIndex % (matches.length - 1)
      jumpToMatch(nextIdx)
    }
  }

  function handleReplaceAll() {
    if (matches.length === 0 || !currentFile) return
    try {
      let pattern = query
      if (!isRegex) {
        pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      }
      if (matchWord) {
        pattern = `\\b${pattern}\\b`
      }
      const flags = caseSensitive ? "g" : "gi"
      const regex = new RegExp(pattern, flags)

      const newContent = content.replace(regex, replaceText)
      updateFileContent(currentFile, newContent)
      saveWorkspaceFile(currentFile, newContent, false).catch((err) => {
        console.warn("Failed to auto-save file after replace all:", err)
      })
      showToast(`Replaced ${matches.length} matches in ${currentFile}`)
    } catch {
      showToast("Invalid regex pattern")
    }
  }

  function handleFindKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) {
        handlePrevious()
      } else {
        handleNext()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  function handleReplaceKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.altKey || e.ctrlKey || e.metaKey) {
        handleReplaceAll()
      } else {
        handleReplaceCurrent()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="absolute right-4 top-12 z-20 flex flex-col gap-1.5 rounded border border-line bg-surface-raised p-2 shadow-lg backdrop-blur-md"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          onClose()
        }
      }}
    >
      {/* Row 1: Find Input & Controls */}
      <div className="flex items-center gap-1.5">
        <button
          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer"
          onClick={() => setLocalReplaceOpen((v) => !v)}
          title="Toggle Replace (Ctrl+H)"
          type="button"
        >
          <span
            className={`inline-block transition-transform duration-150 ${
              localReplaceOpen ? "rotate-90" : ""
            }`}
          >
            <Icon name="chevron" size={11} />
          </span>
        </button>

        <div className="flex items-center gap-1.5 rounded bg-canvas px-2 py-1 border border-line">
          <Icon className="text-ink-soft" name="search" size={13} />
          <input
            autoFocus
            className="w-44 bg-transparent text-[11px] text-ink outline-none placeholder:text-ink-muted"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleFindKeyDown}
            placeholder="Find in editor..."
            ref={findInputRef}
            value={query}
          />
          <button
            className={`px-1 py-0.5 text-[10px] rounded font-mono transition-colors cursor-pointer ${
              caseSensitive
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setCaseSensitive((v) => !v)}
            title="Match Case (Alt+C)"
            type="button"
          >
            Aa
          </button>
          <button
            className={`px-1 py-0.5 text-[10px] rounded font-mono transition-colors cursor-pointer ${
              matchWord
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setMatchWord((v) => !v)}
            title="Match Whole Word (Alt+W)"
            type="button"
          >
            \b
          </button>
          <button
            className={`px-1 py-0.5 text-[10px] rounded font-mono transition-colors cursor-pointer ${
              isRegex
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => setIsRegex((v) => !v)}
            title="Use Regular Expression (Alt+R)"
            type="button"
          >
            .*
          </button>
        </div>

        <span className="min-w-14 text-center text-[10px] text-ink-muted font-mono">
          {matches.length > 0
            ? `${safeIndex + 1} of ${matches.length}`
            : query
              ? "No results"
              : ""}
        </span>

        <IconButton
          disabled={matches.length === 0}
          label="Previous Match (Shift+Enter)"
          onClick={handlePrevious}
        >
          <Icon name="arrow-up" size={12} />
        </IconButton>
        <IconButton
          disabled={matches.length === 0}
          label="Next Match (Enter)"
          onClick={handleNext}
        >
          <Icon name="arrow-down" size={12} />
        </IconButton>
        <IconButton label="Close (Escape)" onClick={onClose}>
          <Icon name="close" size={12} />
        </IconButton>
      </div>

      {/* Row 2: Replace Input & Action Buttons */}
      {localReplaceOpen && (
        <div className="flex items-center gap-1.5 pl-6">
          <div className="flex items-center gap-1.5 rounded bg-canvas px-2 py-1 border border-line flex-1">
            <Icon className="text-ink-soft" name="edit" size={12} />
            <input
              className="w-full bg-transparent text-[11px] text-ink outline-none placeholder:text-ink-muted"
              onChange={(e) => setReplaceText(e.target.value)}
              onKeyDown={handleReplaceKeyDown}
              placeholder="Replace with..."
              ref={replaceInputRef}
              value={replaceText}
            />
          </div>

          <button
            className="px-2 py-1 text-[10px] font-medium rounded border border-line bg-surface hover:bg-surface-hover text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            disabled={matches.length === 0}
            onClick={handleReplaceCurrent}
            title="Replace Current Match (Enter)"
            type="button"
          >
            Replace
          </button>
          <button
            className="px-2 py-1 text-[10px] font-medium rounded border border-line bg-surface hover:bg-surface-hover text-ink disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            disabled={matches.length === 0}
            onClick={handleReplaceAll}
            title="Replace All in File (Alt+Enter)"
            type="button"
          >
            Replace All
          </button>
        </div>
      )}
    </div>
  )
}
