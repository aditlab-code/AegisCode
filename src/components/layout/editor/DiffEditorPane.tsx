import {
  useEffect,
  useRef,
  useState,
  type UIEvent,
  type ChangeEvent,
  type KeyboardEvent,
} from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { parseGitDiffTab } from "../../../utils/gitDiffTab"
import type { GitDiffResult } from "../../../types/workbench"

interface DiffEditorPaneProps {
  groupId: "group1" | "group2"
  tab: string
}

export function DiffEditorPane({ groupId, tab }: DiffEditorPaneProps) {
  const {
    fetchDiff,
    fileBuffers,
    updateFileContent,
    saveFile,
    openFileInPane,
    closeTabInGroup,
    stageChange,
    unstageChange,
    discardChange,
    showToast,
  } = useWorkbench()

  const diffInfo = parseGitDiffTab(tab)
  const file = diffInfo?.file || ""
  const staged = Boolean(diffInfo?.staged)
  const commit = diffInfo?.commit || ""

  const [diffData, setDiffData] = useState<GitDiffResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const leftScrollRef = useRef<HTMLDivElement>(null)
  const rightScrollRef = useRef<HTMLDivElement>(null)
  const isScrollingSyncRef = useRef<"left" | "right" | null>(null)

  // Working copy live buffer
  const buffer = fileBuffers[file]
  const isWorkingCopyEditable = !staged && !commit

  // Fetch diff from backend
  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    setLoadError(null)

    fetchDiff(file, staged, commit)
      .then((res) => {
        if (!isCancelled) {
          setDiffData(res)
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : String(err)
          setLoadError(msg)
          setIsLoading(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [file, staged, commit, fetchDiff])

  // Synchronized scrolling handlers
  function handleLeftScroll(e: UIEvent<HTMLDivElement>) {
    if (isScrollingSyncRef.current === "right") return
    isScrollingSyncRef.current = "left"
    if (rightScrollRef.current) {
      rightScrollRef.current.scrollTop = e.currentTarget.scrollTop
      rightScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
    requestAnimationFrame(() => {
      isScrollingSyncRef.current = null
    })
  }

  function handleRightScroll(e: UIEvent<HTMLDivElement>) {
    if (isScrollingSyncRef.current === "left") return
    isScrollingSyncRef.current = "right"
    if (leftScrollRef.current) {
      leftScrollRef.current.scrollTop = e.currentTarget.scrollTop
      leftScrollRef.current.scrollLeft = e.currentTarget.scrollLeft
    }
    requestAnimationFrame(() => {
      isScrollingSyncRef.current = null
    })
  }

  const originalContent = diffData?.original ?? ""
  const modifiedContent = isWorkingCopyEditable
    ? (buffer?.content ?? diffData?.modified ?? "")
    : (diffData?.modified ?? "")

  const originalLines = originalContent.split("\n")
  const modifiedLines = modifiedContent.split("\n")

  // Parse diff stats from diffText
  const additions = (diffData?.diff.match(/^\+[^+]/gm) || []).length
  const deletions = (diffData?.diff.match(/^-[^-]/gm) || []).length

  function handleContentChange(e: ChangeEvent<HTMLTextAreaElement>) {
    if (!isWorkingCopyEditable) return
    updateFileContent(file, e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault()
      saveFile(file)
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-[var(--color-canvas)] text-[var(--color-ink-muted)] text-xs gap-2">
        <Icon
          className="animate-spin text-[var(--color-accent)]"
          name="refresh"
          size={18}
        />
        <span>Loading comparison...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-[var(--color-canvas)] text-[var(--color-error)] text-xs p-4 text-center">
        <Icon className="mb-2" name="error" size={20} />
        <span className="font-semibold mb-1">Failed to load diff</span>
        <span className="text-[11px] text-[var(--color-ink-muted)] max-w-md">
          {loadError}
        </span>
        <button
          className="mt-3 px-3 py-1 rounded bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-xs text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
          onClick={() => openFileInPane(file)}
          type="button"
        >
          Open Regular File
        </button>
      </div>
    )
  }

  return (
    <div className="diff-editor-container flex flex-col h-full bg-[var(--color-canvas)] select-none">
      {/* Top Diff Navigation Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface)] text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="text-[var(--color-accent)] shrink-0">
            <Icon name="git" size={14} />
          </span>
          <span className="font-semibold text-[var(--color-ink)] truncate font-mono">
            {file}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-[var(--color-ink-muted)]">
            {staged ? "INDEX" : commit ? commit.slice(0, 7) : "WORKING TREE"}
          </span>

          <div className="flex items-center gap-1.5 text-[10px] font-mono ml-2">
            {additions > 0 && (
              <span className="text-[var(--color-success)] font-semibold">
                +{additions}
              </span>
            )}
            {deletions > 0 && (
              <span className="text-[var(--color-error)] font-semibold">
                -{deletions}
              </span>
            )}
          </div>
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-1.5">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] text-[11px] text-[var(--color-ink)] transition-colors cursor-pointer"
            onClick={() => openFileInPane(file)}
            title="Open file in normal editor"
            type="button"
          >
            <Icon name="code" size={12} />
            <span className="hidden sm:inline">Open File</span>
          </button>

          {!commit && (
            <>
              {staged ? (
                <button
                  className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] text-[11px] text-[var(--color-ink)] transition-colors cursor-pointer"
                  onClick={() => unstageChange(file)}
                  title="Unstage file"
                  type="button"
                >
                  <Icon name="close" size={12} />
                  <span className="hidden sm:inline">Unstage</span>
                </button>
              ) : (
                <>
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] text-[11px] text-[var(--color-ink)] transition-colors cursor-pointer"
                    onClick={() => stageChange(file)}
                    title="Stage file"
                    type="button"
                  >
                    <Icon name="add" size={12} />
                    <span className="hidden sm:inline">Stage</span>
                  </button>
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-error-soft)] text-[11px] text-[var(--color-error)] transition-colors cursor-pointer"
                    onClick={() => {
                      discardChange(file)
                      closeTabInGroup(groupId, tab)
                    }}
                    title="Discard changes in file"
                    type="button"
                  >
                    <Icon name="discard" size={12} />
                    <span className="hidden sm:inline">Discard</span>
                  </button>
                </>
              )}
            </>
          )}

          <button
            aria-label="Close diff"
            className="p-1 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            onClick={() => closeTabInGroup(groupId, tab)}
            title="Close Diff"
            type="button"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      </div>

      {/* Side-by-Side Comparison Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-[var(--color-line)]">
        {/* Left Pane: Original / HEAD */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--color-canvas)]">
          <div className="flex items-center justify-between px-3 py-1 bg-[var(--color-surface-raised)] border-b border-[var(--color-line)] text-[10px] text-[var(--color-ink-muted)] font-semibold">
            <span>
              ORIGINAL ({commit ? `COMMIT ${commit.slice(0, 7)}` : "HEAD"})
            </span>
            <span className="uppercase text-[9px] opacity-75">READ-ONLY</span>
          </div>

          <div
            className="flex-1 overflow-auto font-mono text-xs leading-5 select-text"
            onScroll={handleLeftScroll}
            ref={leftScrollRef}
          >
            <div className="p-2 space-y-0 min-w-max">
              {originalLines.map((line, idx) => {
                const lineNum = idx + 1
                return (
                  <div
                    className="flex items-start hover:bg-[var(--color-surface-hover)]/40 rounded-xs group"
                    key={`orig-${lineNum}`}
                  >
                    <span className="w-10 shrink-0 text-right pr-3 select-none text-[11px] text-[var(--color-ink-muted)] opacity-60">
                      {lineNum}
                    </span>
                    <pre className="flex-1 m-0 font-mono text-[11px] text-[var(--color-ink-soft)] whitespace-pre">
                      {line || " "}
                    </pre>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Pane: Modified / Working Copy */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--color-canvas)]">
          <div className="flex items-center justify-between px-3 py-1 bg-[var(--color-surface-raised)] border-b border-[var(--color-line)] text-[10px] text-[var(--color-ink-muted)] font-semibold">
            <span>MODIFIED ({staged ? "INDEX" : "WORKING TREE"})</span>
            <span className="uppercase text-[9px] opacity-75">
              {isWorkingCopyEditable ? "EDITABLE (⌘S TO SAVE)" : "READ-ONLY"}
            </span>
          </div>

          <div
            className="flex-1 overflow-auto font-mono text-xs leading-5 relative"
            onScroll={handleRightScroll}
            ref={rightScrollRef}
          >
            {isWorkingCopyEditable ? (
              <div className="relative min-h-full min-w-max p-2 flex">
                {/* Gutter */}
                <div className="w-10 shrink-0 text-right pr-3 select-none text-[11px] text-[var(--color-ink-muted)] opacity-60 space-y-0">
                  {modifiedLines.map((_, idx) => (
                    <div key={`mod-num-${idx + 1}`}>{idx + 1}</div>
                  ))}
                </div>

                {/* Live Editable Textarea */}
                <textarea
                  autoCapitalize="off"
                  autoComplete="off"
                  autoCorrect="off"
                  className="flex-1 m-0 p-0 font-mono text-[11px] text-[var(--color-ink)] bg-transparent resize-none outline-none leading-5 whitespace-pre overflow-hidden"
                  onChange={handleContentChange}
                  onKeyDown={handleKeyDown}
                  rows={Math.max(modifiedLines.length, 1)}
                  spellCheck={false}
                  value={modifiedContent}
                />
              </div>
            ) : (
              <div className="p-2 space-y-0 min-w-max select-text">
                {modifiedLines.map((line, idx) => {
                  const lineNum = idx + 1
                  return (
                    <div
                      className="flex items-start hover:bg-[var(--color-surface-hover)]/40 rounded-xs group"
                      key={`mod-${lineNum}`}
                    >
                      <span className="w-10 shrink-0 text-right pr-3 select-none text-[11px] text-[var(--color-ink-muted)] opacity-60">
                        {lineNum}
                      </span>
                      <pre className="flex-1 m-0 font-mono text-[11px] text-[var(--color-ink)] whitespace-pre">
                        {line || " "}
                      </pre>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
