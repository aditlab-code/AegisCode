import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { parseGitDiffTab } from "../../../utils/gitDiffTab"
import type { GitDiffResult } from "../../../types/workbench"
import { CMEditor, type CMEditorHandle } from "./CMEditor"

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
  } = useWorkbenchStore(
    useShallow((s) => ({
      fetchDiff: s.fetchDiff,
      fileBuffers: s.fileBuffers,
      updateFileContent: s.updateFileContent,
      saveFile: s.saveFile,
      openFileInPane: s.openFileInPane,
      closeTabInGroup: s.closeTabInGroup,
      stageChange: s.stageChange,
      unstageChange: s.unstageChange,
      discardChange: s.discardChange,
      showToast: s.showToast,
      tabSize: s.tabSize,
      settings: s.settings,
      updateEditorSettings: s.updateEditorSettings,
      gitDiffVersion: s.gitDiffVersion,
    })),
  )

  const inheritEditorFont =
    settings?.editor?.diffEditor?.inheritEditorFont ?? true
  const wordWrap = settings?.editor?.wordWrap ?? "off"
  const renderSideBySide =
    settings?.editor?.diffEditor?.renderSideBySide ?? true
  const editorFontSize = inheritEditorFont
    ? (settings?.editor?.fontSize ?? 13.5)
    : 13
  const editorLineHeight = inheritEditorFont
    ? (settings?.editor?.lineHeight ?? 22)
    : 20
  const currentTabSize = settings?.editor?.tabSize ?? tabSize ?? 2

  const diffInfo = parseGitDiffTab(tab)
  const file = diffInfo?.file || ""
  const staged = Boolean(diffInfo?.staged)
  const commit = diffInfo?.commit || ""

  const [diffData, setDiffData] = useState<GitDiffResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const editorRef = useRef<CMEditorHandle>(null)

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

  // Parse diff stats from diffText
  const additions = useMemo(() => {
    return (diffData?.diff.match(/^\+[^+]/gm) || []).length
  }, [diffData?.diff])

  const deletions = useMemo(() => {
    return (diffData?.diff.match(/^-[^-]/gm) || []).length
  }, [diffData?.diff])

  // Save handler for ⌘S
  const handleSave = useCallback(async () => {
    if (!isWorkingCopyEditable) return
    try {
      await saveFile(file)
      const res = await fetchDiff(file, staged, commit)
      if (res) {
        setDiffData(res)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Failed to refresh diff: ${msg}`)
    }
  }, [
    file,
    staged,
    commit,
    isWorkingCopyEditable,
    saveFile,
    fetchDiff,
    showToast,
  ])

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-canvas text-ink-muted text-xs gap-2">
        <Icon className="animate-spin text-accent" name="refresh" size={18} />
        <span>Loading comparison...</span>
      </div>
    )
  }

  if (loadError || !diffData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-canvas text-error text-xs p-4 text-center">
        <Icon className="mb-2" name="error" size={20} />
        <span className="font-semibold mb-1">Failed to load diff</span>
        <span className="text-[11px] text-ink-muted max-w-md">
          {loadError || "No comparison data returned"}
        </span>
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

  const modifiedContent = isWorkingCopyEditable
    ? (buffer?.content ?? diffData.modified ?? "")
    : (diffData.modified ?? "")

  return (
    <div className="diff-editor-container flex flex-col h-full bg-canvas">
      {/* Top Diff Navigation Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-line bg-surface text-xs select-none">
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
          {/* Previous / Next Chunk Navigation */}
          <div className="flex items-center mr-1">
            <button
              aria-label="Previous Difference"
              className="p-1 rounded-l border border-line bg-surface-raised hover:bg-surface-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
              onClick={() => editorRef.current?.goToPrevChunk()}
              title="Previous Difference"
              type="button"
            >
              <Icon name="arrow-up" size={12} />
            </button>
            <button
              aria-label="Next Difference"
              className="p-1 rounded-r border-y border-r border-line bg-surface-raised hover:bg-surface-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
              onClick={() => editorRef.current?.goToNextChunk()}
              title="Next Difference"
              type="button"
            >
              <Icon name="arrow-down" size={12} />
            </button>
          </div>

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

      {/* Embedded Single Source of Truth CodeMirror Editor */}
      <div className="flex-1 w-full min-h-0 min-w-0 overflow-hidden relative flex flex-col">
        <CMEditor
          ref={editorRef}
          filename={file}
          content={modifiedContent}
          diff={{
            original: diffData.original,
            renderSideBySide,
            originalLabel: commit ? `COMMIT ${commit.slice(0, 7)}` : "HEAD",
            modifiedLabel: staged ? "INDEX" : "WORKING TREE",
          }}
          isReadOnly={!isWorkingCopyEditable}
          wordWrap={wordWrap}
          tabSize={currentTabSize}
          fontSize={editorFontSize}
          lineHeight={editorLineHeight}
          onChange={(val) => updateFileContent(file, val)}
          onSave={handleSave}
        />
      </div>
    </div>
  )
}
