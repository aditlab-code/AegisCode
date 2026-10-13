import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { Minimap } from "./Minimap"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  parseConflictRegions,
  resolveConflict,
  type ConflictRegion,
  type ConflictResolutionChoice,
} from "../../../utils/gitConflict"
import { CMEditor, type CMEditorHandle } from "./CMEditor"
import { EditorContextMenu } from "./EditorContextMenu"

interface CodePaneProps {
  paneId: "primary" | "secondary"
  filename: string
  isFocused: boolean
  secondary?: boolean
  onClose?: () => void
  editorRef?: React.Ref<CMEditorHandle>
}

function isSameFile(a?: string, b?: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const normA = a.replace(/\\/g, "/").replace(/^\.\//, "")
  const normB = b.replace(/\\/g, "/").replace(/^\.\//, "")
  return (
    normA === normB ||
    normA.endsWith("/" + normB) ||
    normB.endsWith("/" + normA)
  )
}

const EMPTY_BREAKPOINTS: number[] = []

export function CodePane({
  paneId,
  filename,
  isFocused,
  secondary = false,
  onClose,
  editorRef,
}: CodePaneProps) {
  const {
    buffer,
    updateFileContent,
    setCursorPosition,
    setSelection,
    diagnostics,
    setFocusedPane,
    saveFile,
    revertFile,
    tabs,
    setSecondaryActiveTab,
    minimapEnabled,
    minimapScale,
    openFind,
    focusedGroup,
    tabSize,
    settings,
    fileBreakpoints,
    toggleBreakpoint,
    activeDebugLine,
    openFileInPane,
    cursorPosition,
    selection,
  } = useWorkbenchStore(
    useShallow((s) => ({
      buffer: s.fileBuffers[filename],
      updateFileContent: s.updateFileContent,
      setCursorPosition: s.setCursorPosition,
      setSelection: s.setSelection,
      diagnostics: s.diagnostics,
      setFocusedPane: s.setFocusedPane,
      saveFile: s.saveFile,
      revertFile: s.revertFile,
      tabs: s.tabs,
      setSecondaryActiveTab: s.setSecondaryActiveTab,
      minimapEnabled: s.minimapEnabled,
      minimapScale: s.minimapScale,
      openFind: s.openFind,
      focusedGroup: s.focusedGroup,
      tabSize: s.tabSize,
      settings: s.settings,
      fileBreakpoints: s.breakpoints[filename] ?? EMPTY_BREAKPOINTS,
      toggleBreakpoint: s.toggleBreakpoint,
      activeDebugLine: s.activeDebugLine,
      openFileInPane: s.openFileInPane,
      cursorPosition: s.cursorPosition,
      selection: s.selection,
    })),
  )

  const editorFontSize = settings?.editor?.fontSize ?? 13.5
  const editorLineHeight = settings?.editor?.lineHeight ?? 22
  const wordWrap = settings?.editor?.wordWrap ?? "off"
  const wordWrapColumn = settings?.editor?.wordWrapColumn ?? 80
  const minimapSide = settings?.editor?.minimapSide ?? "right"
  const accessibilityPageSize = settings?.editor?.accessibilityPageSize ?? 500
  const currentTabSize = settings?.editor?.tabSize ?? tabSize ?? 2
  const insertSpaces = settings?.editor?.insertSpaces ?? true
  const formatOnSave = settings?.editor?.formatOnSave ?? true
  const cursorBlinking = settings?.editor?.cursorBlinking ?? "smooth"
  const renderWhitespace = settings?.editor?.renderWhitespace ?? "selection"

  const paneRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)
  const content = buffer?.content ?? ""
  const isDirty = buffer?.isDirty ?? false
  const lines = useMemo(() => content.split("\n"), [content])
  const filteredDiagnostics = useMemo(
    () => diagnostics.filter((d) => d.location.startsWith(filename)),
    [diagnostics, filename],
  )

  const conflictRegions = useMemo(() => {
    return parseConflictRegions(content)
  }, [content])

  const handleResolveConflict = (
    region: ConflictRegion,
    choice: ConflictResolutionChoice,
  ) => {
    const newContent = resolveConflict(content, region, choice)
    updateFileContent(filename, newContent)
  }

  const [scrollInfo, setScrollInfo] = useState({
    scrollTop: 0,
    scrollHeight: 1,
    clientHeight: 1,
  })

  useEffect(() => {
    const scroller = paneRef.current?.querySelector(".cm-scroller")
    if (!scroller) return

    let rafId: number | null = null
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        setScrollInfo({
          scrollTop: scroller.scrollTop,
          scrollHeight: scroller.scrollHeight || 1,
          clientHeight: scroller.clientHeight || 1,
        })
      })
    }

    scroller.addEventListener("scroll", onScroll, { passive: true })
    onScroll()

    const ro = new ResizeObserver(() => {
      onScroll()
    })
    ro.observe(scroller)

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      scroller.removeEventListener("scroll", onScroll)
      ro.disconnect()
    }
  }, [filename])

  const handleScrollToLine = useCallback(
    (lineIndex: number, smooth: boolean = true) => {
      const scroller = paneRef.current?.querySelector(".cm-scroller")
      if (!scroller) return
      const target = Math.max(0, lineIndex * editorLineHeight - 60)
      if (smooth) {
        scroller.scrollTo({ top: target, behavior: "smooth" })
      } else {
        scroller.scrollTop = target
      }
    },
    [editorLineHeight],
  )

  return (
    <div
      ref={paneRef}
      className={`editor-pane relative ${
        isFocused ? "editor-pane-focused" : ""
      }`}
      onClick={() => setFocusedPane(paneId)}
    >
      {secondary && (
        <div className="split-pane-title">
          <div className="split-title-left">
            <Icon name="code" size={13} />
            <select
              aria-label="Secondary pane file"
              className="split-file-selector"
              onChange={(e) => setSecondaryActiveTab(e.target.value)}
              value={filename}
            >
              {tabs.map((tab) => (
                <option key={tab} value={tab}>
                  {tab}
                </option>
              ))}
            </select>
            {isDirty && (
              <span
                aria-label="Unsaved changes"
                className="tab-dirty-dot"
                title="Unsaved changes"
              />
            )}
          </div>
          <IconButton label="Close split editor" onClick={onClose}>
            <Icon name="close" size={13} />
          </IconButton>
        </div>
      )}

      {buffer?.hasDiskConflict && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-warning text-xs text-warning">
          <div className="flex items-center gap-1.5">
            <Icon name="warning" size={13} />
            <span>
              File modified externally on disk. Local unsaved edits are
              preserved.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover text-ink text-[11px] border border-line cursor-pointer"
              onClick={() => revertFile(filename)}
            >
              Revert to Disk
            </button>
            <button
              type="button"
              className="px-2 py-0.5 rounded bg-accent hover:bg-accent-soft text-canvas text-[11px] font-semibold cursor-pointer"
              onClick={() => saveFile(filename)}
            >
              Overwrite Disk
            </button>
          </div>
        </div>
      )}

      {buffer?.isDeletedOnDisk && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-error text-xs text-error">
          <div className="flex items-center gap-1.5">
            <Icon name="trash" size={13} />
            <span>File has been deleted from disk.</span>
          </div>
          <button
            type="button"
            className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover text-ink text-[11px] border border-line cursor-pointer"
            onClick={() => saveFile(filename)}
          >
            Re-save File
          </button>
        </div>
      )}

      {buffer?.isLargeFile && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-warning text-xs text-warning">
          <div className="flex items-center gap-1.5">
            <Icon name="warning" size={13} />
            <span>
              Large file ({((buffer.fileSize ?? 0) / (1024 * 1024)).toFixed(1)}{" "}
              MB). Showing first 64KB sample in read-only mode to preserve
              system memory.
            </span>
          </div>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface border border-line text-ink-muted">
            Read-Only
          </span>
        </div>
      )}

      {buffer?.isBinary && !buffer?.isLargeFile && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-raised border-b border-warning text-xs text-warning">
          <div className="flex items-center gap-1.5">
            <Icon name="warning" size={13} />
            <span>
              Binary file detected. Displaying preview in read-only mode to
              prevent data corruption.
            </span>
          </div>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface border border-line text-ink-muted">
            Read-Only
          </span>
        </div>
      )}

      {conflictRegions.length > 0 && (
        <div className="flex flex-col gap-1.5 px-3 py-2 bg-surface-raised border-b border-warning/40 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="git" size={14} className="text-warning" />
              <span className="font-semibold text-ink">
                Merge Conflicts Detected ({conflictRegions.length}{" "}
                {conflictRegions.length === 1 ? "region" : "regions"})
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {conflictRegions.map((region, idx) => (
              <div
                key={region.id}
                className="flex items-center justify-between py-1 px-2 rounded bg-surface border border-line text-[11px]"
              >
                <div className="flex items-center gap-2">
                  <span className="text-ink-muted">
                    #{idx + 1} (L{region.startLine}–L{region.endLine}):
                  </span>
                  <span className="text-sky-400 font-mono">
                    {region.currentBranch}
                  </span>
                  <span className="text-ink-muted">vs</span>
                  <span className="text-emerald-400 font-mono">
                    {region.incomingBranch}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(region, "current")}
                    className="text-sky-400 hover:underline cursor-pointer font-medium"
                  >
                    Accept Current
                  </button>
                  <span className="text-ink-muted">|</span>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(region, "incoming")}
                    className="text-emerald-400 hover:underline cursor-pointer font-medium"
                  >
                    Accept Incoming
                  </button>
                  <span className="text-ink-muted">|</span>
                  <button
                    type="button"
                    onClick={() => handleResolveConflict(region, "both")}
                    className="text-purple-400 hover:underline cursor-pointer font-medium"
                  >
                    Accept Both
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        aria-label={`${filename} code editor`}
        className={`code-editor ${
          minimapSide === "left" ? "minimap-side-left" : ""
        }`}
        data-accessibility-page-size={accessibilityPageSize}
        data-cursor-blinking={cursorBlinking}
        data-render-whitespace={renderWhitespace}
        data-word-wrap={wordWrap}
        onContextMenu={(e) => {
          e.preventDefault()
          setContextMenu({ x: e.clientX, y: e.clientY })
        }}
        role="region"
        style={
          {
            "--editor-tab-size": currentTabSize,
            "--editor-wrap-column": wordWrapColumn,
          } as any
        }
      >
        <div className="code-editor-layout">
          <CMEditor
            ref={editorRef}
            filename={filename}
            content={content}
            isReadOnly={Boolean(buffer?.isLargeFile || buffer?.isBinary)}
            wordWrap={wordWrap}
            tabSize={currentTabSize}
            fontSize={editorFontSize}
            lineHeight={editorLineHeight}
            breakpoints={fileBreakpoints}
            activeDebugLine={activeDebugLine}
            diagnostics={filteredDiagnostics}
            onChange={(newVal) => updateFileContent(filename, newVal)}
            onCursorChange={(line, col) =>
              setCursorPosition({ line, column: col })
            }
            onSelectionChange={(sel) => setSelection(sel)}
            onNavigateDefinition={(targetPath, line, col) => {
              openFileInPane(targetPath)
              setCursorPosition({ line, column: col })
              window.dispatchEvent(
                new CustomEvent("aegis:focus-symbol", {
                  detail: { name: targetPath, line },
                }),
              )
            }}
            onToggleBreakpoint={(line) => toggleBreakpoint(filename, line)}
            onSave={() => saveFile(filename)}
            onFind={() => openFind(focusedGroup, false)}
            formatOnSave={formatOnSave}
            insertSpaces={insertSpaces}
          />
        </div>

        {minimapEnabled && (
          <Minimap
            clientHeight={scrollInfo.clientHeight}
            editorFontSize={editorFontSize}
            editorLineHeight={editorLineHeight}
            lines={lines}
            onScrollToLine={handleScrollToLine}
            scale={minimapScale}
            scrollHeight={scrollInfo.scrollHeight}
            scrollTop={scrollInfo.scrollTop}
          />
        )}
      </div>

      {contextMenu && (
        <EditorContextMenu
          filename={filename}
          line={cursorPosition.line}
          onClose={() => setContextMenu(null)}
          selectedText={selection.selectedText}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      )}
    </div>
  )
}
