import {
  useEffect,
  useRef,
  useState,
  useMemo,
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
    tabSize,
    settings,
    updateEditorSettings,
    gitDiffVersion,
  } = useWorkbench()

  const inheritEditorFont =
    settings?.editor?.diffEditor?.inheritEditorFont ?? true
  const wordWrap = settings?.editor?.wordWrap ?? "off"
  const renderSideBySide =
    settings?.editor?.diffEditor?.renderSideBySide ?? true
  const fontStyle = inheritEditorFont
    ? {
        fontFamily: "var(--editor-font-family, monospace)",
        fontSize: "var(--editor-font-size, 11px)",
        lineHeight: "var(--editor-line-height, 20px)",
      }
    : {
        lineHeight: "20px",
      }

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
  }, [file, staged, commit, fetchDiff, gitDiffVersion])

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

  const unifiedLines = useMemo(() => {
    if (!diffData?.diff) return []
    return diffData.diff.split("\n")
  }, [diffData?.diff])

  function handleContentChange(e: ChangeEvent<HTMLTextAreaElement>) {
    if (!isWorkingCopyEditable) return
    updateFileContent(file, e.target.value)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault()
      saveFile(file)
      fetchDiff(file, staged, commit)
        .then((res) => setDiffData(res))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
          showToast(`Failed to refresh diff: ${msg}`)
        })
      return
    }

    if (e.key === "Tab" && isWorkingCopyEditable) {
      e.preventDefault()
      const textarea = e.currentTarget
      const spaces = " ".repeat(tabSize || 2)
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const newContent =
        modifiedContent.slice(0, start) + spaces + modifiedContent.slice(end)

      updateFileContent(file, newContent)
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-canvas text-ink-muted text-xs gap-2">
        <Icon className="animate-spin text-accent" name="refresh" size={18} />
        <span>Loading comparison...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-canvas text-error text-xs p-4 text-center">
        <Icon className="mb-2" name="error" size={20} />
        <span className="font-semibold mb-1">Failed to load diff</span>
        <span className="text-[11px] text-ink-muted max-w-md">{loadError}</span>
        <button
          className="mt-3 px-3 py-1 rounded bg-surface-raised border border-line text-xs text-ink hover:bg-surface-hover cursor-pointer"
          onClick={() => openFileInPane(file)}
          type="button"
        >
          Open Regular File
        </button>
      </div>
    )
  }

  return (
    <div className="diff-editor-container flex flex-col h-full bg-canvas select-none">
      {/* Top Diff Navigation Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-surface text-xs">
        <div className="flex items-center gap-2 truncate">
          <span className="text-accent shrink-0">
            <Icon name="git" size={14} />
          </span>
          <span className="font-semibold text-ink truncate font-mono">
            {file}
          </span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-raised border border-line text-ink-muted">
            {staged ? "INDEX" : commit ? commit.slice(0, 7) : "WORKING TREE"}
          </span>

          <div className="flex items-center gap-1.5 text-[10px] font-mono ml-2">
            {additions > 0 && (
              <span className="text-success font-semibold">+{additions}</span>
            )}
            {deletions > 0 && (
              <span className="text-error font-semibold">-{deletions}</span>
            )}
          </div>
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-1.5">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-raised hover:bg-surface-hover text-[11px] text-ink transition-colors cursor-pointer"
            onClick={() => {
              updateEditorSettings((prev) => ({
                ...prev,
                diffEditor: {
                  ...prev.diffEditor,
                  renderSideBySide: !renderSideBySide,
                },
              }))
            }}
            title={
              renderSideBySide
                ? "Switch to Unified View"
                : "Switch to Side-by-Side View"
            }
            type="button"
          >
            <Icon name="split" size={12} />
            <span className="hidden sm:inline">
              {renderSideBySide ? "Split" : "Unified"}
            </span>
          </button>

          <button
            className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-raised hover:bg-surface-hover text-[11px] text-ink transition-colors cursor-pointer"
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
                  className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-raised hover:bg-surface-hover text-[11px] text-ink transition-colors cursor-pointer"
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
                    className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-raised hover:bg-surface-hover text-[11px] text-ink transition-colors cursor-pointer"
                    onClick={() => stageChange(file)}
                    title="Stage file"
                    type="button"
                  >
                    <Icon name="add" size={12} />
                    <span className="hidden sm:inline">Stage</span>
                  </button>
                  <button
                    className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-surface-raised hover:bg-error-soft text-[11px] text-error transition-colors cursor-pointer"
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
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer"
            onClick={() => closeTabInGroup(groupId, tab)}
            title="Close Diff"
            type="button"
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      </div>

      {/* Comparison Area: Unified or Side-by-Side */}
      {!renderSideBySide ? (
        <div className="flex-1 flex flex-col min-w-0 bg-canvas overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1 bg-surface-raised border-b border-line text-[10px] text-ink-muted font-semibold">
            <span>UNIFIED DIFF ({file})</span>
            <span className="uppercase text-[9px] opacity-75">READ-ONLY</span>
          </div>

          <div className="flex-1 overflow-auto font-mono text-xs leading-5 select-text p-2">
            <div className="space-y-0 min-w-max">
              {unifiedLines.length === 0 ? (
                <div className="text-[11px] text-ink-muted italic p-2">
                  No differences found or unified diff empty.
                </div>
              ) : (
                unifiedLines.map((line: string, idx: number) => {
                  const lineNum = idx + 1
                  const isAddition =
                    line.startsWith("+") && !line.startsWith("+++")
                  const isDeletion =
                    line.startsWith("-") && !line.startsWith("---")
                  const isHunkHeader = line.startsWith("@@")
                  const rowClass = isAddition
                    ? "bg-emerald-500/15 text-emerald-400"
                    : isDeletion
                      ? "bg-rose-500/15 text-rose-400"
                      : isHunkHeader
                        ? "bg-sky-500/15 text-sky-400 font-semibold"
                        : "text-ink-soft hover:bg-surface-hover/40"

                  return (
                    <div
                      className={`flex items-start rounded-xs ${rowClass}`}
                      key={`unified-${lineNum}`}
                    >
                      <span
                        className="w-10 shrink-0 text-right pr-3 select-none text-[11px] text-ink-muted opacity-60"
                        style={{ lineHeight: fontStyle?.lineHeight ?? "20px" }}
                      >
                        {lineNum}
                      </span>
                      <pre
                        className={`flex-1 m-0 font-mono text-[11px] ${
                          wordWrap === "on" || wordWrap === "wordWrapColumn"
                            ? "whitespace-pre-wrap wrap-break-word"
                            : "whitespace-pre"
                        }`}
                        style={fontStyle}
                      >
                        {line || " "}
                      </pre>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-line">
          {/* Left Pane: Original / HEAD */}
          <div className="flex-1 flex flex-col min-w-0 bg-canvas">
            <div className="flex items-center justify-between px-3 py-1 bg-surface-raised border-b border-line text-[10px] text-ink-muted font-semibold">
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
                      className="flex items-start hover:bg-surface-hover/40 rounded-xs group"
                      key={`orig-${lineNum}`}
                    >
                      <span
                        className="w-10 shrink-0 text-right pr-3 select-none text-[11px] text-ink-muted opacity-60"
                        style={{ lineHeight: fontStyle?.lineHeight ?? "20px" }}
                      >
                        {lineNum}
                      </span>
                      <pre
                        className={`flex-1 m-0 font-mono text-[11px] text-ink-soft ${
                          wordWrap === "on" || wordWrap === "wordWrapColumn"
                            ? "whitespace-pre-wrap wrap-break-word"
                            : "whitespace-pre"
                        }`}
                        style={fontStyle}
                      >
                        {line || " "}
                      </pre>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right Pane: Modified / Working Copy */}
          <div className="flex-1 flex flex-col min-w-0 bg-canvas">
            <div className="flex items-center justify-between px-3 py-1 bg-surface-raised border-b border-line text-[10px] text-ink-muted font-semibold">
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
                  <div
                    className="w-10 shrink-0 text-right pr-3 select-none text-[11px] text-ink-muted opacity-60 space-y-0"
                    style={{ lineHeight: fontStyle?.lineHeight ?? "20px" }}
                  >
                    {modifiedLines.map((_, idx) => (
                      <div
                        key={`mod-num-${idx + 1}`}
                        style={{ lineHeight: fontStyle?.lineHeight ?? "20px" }}
                      >
                        {idx + 1}
                      </div>
                    ))}
                  </div>

                  {/* Live Editable Textarea */}
                  <textarea
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    className={`flex-1 m-0 p-0 font-mono text-[11px] text-ink bg-transparent resize-none outline-none leading-5 overflow-hidden ${
                      wordWrap === "on" || wordWrap === "wordWrapColumn"
                        ? "whitespace-pre-wrap wrap-break-word"
                        : "whitespace-pre"
                    }`}
                    onChange={handleContentChange}
                    onKeyDown={handleKeyDown}
                    rows={Math.max(modifiedLines.length, 1)}
                    spellCheck={false}
                    style={fontStyle}
                    value={modifiedContent}
                    wrap={
                      wordWrap === "on" || wordWrap === "wordWrapColumn"
                        ? "soft"
                        : "off"
                    }
                  />
                </div>
              ) : (
                <div className="p-2 space-y-0 min-w-max select-text">
                  {modifiedLines.map((line, idx) => {
                    const lineNum = idx + 1
                    return (
                      <div
                        className="flex items-start hover:bg-surface-hover/40 rounded-xs group"
                        key={`mod-${lineNum}`}
                      >
                        <span
                          className="w-10 shrink-0 text-right pr-3 select-none text-[11px] text-ink-muted opacity-60"
                          style={{
                            lineHeight: fontStyle?.lineHeight ?? "20px",
                          }}
                        >
                          {lineNum}
                        </span>
                        <pre
                          className={`flex-1 m-0 font-mono text-[11px] text-ink ${
                            wordWrap === "on" || wordWrap === "wordWrapColumn"
                              ? "whitespace-pre-wrap wrap-break-word"
                              : "whitespace-pre"
                          }`}
                          style={fontStyle}
                        >
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
      )}
    </div>
  )
}
