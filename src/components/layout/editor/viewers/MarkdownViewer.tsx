import { useState, useRef, useEffect, useCallback } from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import { MarkdownRenderer } from "../../chat/MarkdownRenderer"
import { CodePane } from "../CodePane"
import "./viewers.css"

interface MarkdownViewerProps {
  filename: string
  groupId?: "group1" | "group2"
}

type MarkdownMode = "split" | "preview" | "editor"

export default function MarkdownViewer({
  filename,
  groupId = "group1",
}: MarkdownViewerProps) {
  const { buffer, updateFileContent, focusedGroup, settings } =
    useWorkbenchStore(
      useShallow((s) => ({
        buffer: s.fileBuffers[filename],
        updateFileContent: s.updateFileContent,
        focusedGroup: s.focusedGroup,
        settings: s.settings,
      })),
    )

  const [mode, setMode] = useState<MarkdownMode>("split")
  const [syncScroll, setSyncScroll] = useState(true)
  const [splitRatio, setSplitRatio] = useState(50)
  const [isResizing, setIsResizing] = useState(false)

  const content = buffer?.content ?? ""
  const [debouncedContent, setDebouncedContent] = useState(content)

  const containerRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const isSyncingScroll = useRef(false)
  const syncTimeoutRef = useRef<number | null>(null)

  const editorFontSize = settings?.editor?.fontSize ?? 13.5

  // Realtime debounce sanitization: 150ms threshold prevents AST thrashing and DOM infinite loops
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedContent(content)
    }, 150)
    return () => clearTimeout(timer)
  }, [content])

  // Split-resizer drag handler
  useEffect(() => {
    if (!isResizing) return

    function handleMouseMove(e: MouseEvent) {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      if (rect.width <= 0) return
      const offset = e.clientX - rect.left
      const newRatio = (offset / rect.width) * 100
      const clamped = Math.max(20, Math.min(80, newRatio))
      setSplitRatio(Math.round(clamped))
    }

    function handleMouseUp() {
      setIsResizing(false)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isResizing])

  // Synchronized scrolling engine with anti-Big-O mutex lock
  useEffect(() => {
    if (!syncScroll || mode !== "split") return

    const previewPane = previewScrollRef.current
    const editorScroller =
      containerRef.current?.querySelector<HTMLDivElement>(".cm-scroller")
    if (!previewPane || !editorScroller) return

    const THRESHOLD_PX = 4

    // Editor scroll -> syncs preview
    const handleEditorScroll = () => {
      if (isSyncingScroll.current) return

      const eScrollable =
        editorScroller.scrollHeight - editorScroller.clientHeight
      if (eScrollable <= 0) return

      const ratio = editorScroller.scrollTop / eScrollable
      const pScrollable = previewPane.scrollHeight - previewPane.clientHeight
      const targetTop = ratio * pScrollable

      if (Math.abs(previewPane.scrollTop - targetTop) >= THRESHOLD_PX) {
        isSyncingScroll.current = true
        previewPane.scrollTop = targetTop

        if (syncTimeoutRef.current !== null)
          clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = window.setTimeout(() => {
          isSyncingScroll.current = false
        }, 50)
      }
    }

    // Preview scroll -> syncs editor
    const handlePreviewScroll = () => {
      if (isSyncingScroll.current) return

      const pScrollable = previewPane.scrollHeight - previewPane.clientHeight
      if (pScrollable <= 0) return

      const ratio = previewPane.scrollTop / pScrollable
      const eScrollable =
        editorScroller.scrollHeight - editorScroller.clientHeight
      const targetTop = ratio * eScrollable

      if (Math.abs(editorScroller.scrollTop - targetTop) >= THRESHOLD_PX) {
        isSyncingScroll.current = true
        editorScroller.scrollTop = targetTop

        if (syncTimeoutRef.current !== null)
          clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = window.setTimeout(() => {
          isSyncingScroll.current = false
        }, 50)
      }
    }

    editorScroller.addEventListener("scroll", handleEditorScroll, {
      passive: true,
    })
    previewPane.addEventListener("scroll", handlePreviewScroll, {
      passive: true,
    })

    return () => {
      editorScroller.removeEventListener("scroll", handleEditorScroll)
      previewPane.removeEventListener("scroll", handlePreviewScroll)
      if (syncTimeoutRef.current !== null) clearTimeout(syncTimeoutRef.current)
    }
  }, [syncScroll, mode, debouncedContent])

  // Markdown Enhanced toolbar helper
  const insertMarkdownSyntax = useCallback(
    (prefix: string, suffix: string = "", placeholder: string = "") => {
      const current = buffer?.content ?? ""
      // Append or insert clean markdown token
      const addition = `${prefix}${placeholder}${suffix}`
      const newContent =
        current.length > 0 ? `${current}\n\n${addition}` : addition
      updateFileContent(filename, newContent)
    },
    [buffer?.content, filename, updateFileContent],
  )

  return (
    <div className="viewer-container" ref={containerRef}>
      {/* Markdown Enhanced Toolbar */}
      <div className="viewer-toolbar">
        {/* Left Formatting Group */}
        <div className="viewer-toolbar-group">
          <button
            type="button"
            className="viewer-toolbar-btn font-bold"
            onClick={() => insertMarkdownSyntax("**", "**", "Bold text")}
            title="Bold (**text**)"
          >
            <Icon name="bold" size={12} />
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn italic font-serif"
            onClick={() => insertMarkdownSyntax("*", "*", "Italic text")}
            title="Italic (*text*)"
          >
            <Icon name="italic" size={12} />
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() => insertMarkdownSyntax("## ", "", "Heading 2")}
            title="Heading (## Heading)"
          >
            <Icon name="heading" size={12} />
            <span>H2</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() => insertMarkdownSyntax("### ", "", "Heading 3")}
            title="Heading (### Heading)"
          >
            <Icon name="heading" size={12} />
            <span>H3</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() => insertMarkdownSyntax("- ", "", "List item")}
            title="Bullet List (- item)"
          >
            <Icon name="list" size={12} />
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() =>
              insertMarkdownSyntax("- [ ] ", "", "Task to complete")
            }
            title="Task List (- [ ] task)"
          >
            <Icon name="check" size={12} />
            <span>Task</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() =>
              insertMarkdownSyntax("[", "](https://example.com)", "link title")
            }
            title="Hyperlink [title](url)"
          >
            <Icon name="link" size={12} />
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() =>
              insertMarkdownSyntax(
                "| Column 1 | Column 2 |\n| :--- | :--- |\n| Data A | Data B |",
                "",
                "",
              )
            }
            title="Insert Table"
          >
            <Icon name="table" size={12} />
            <span>Table</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() =>
              insertMarkdownSyntax(
                "```typescript\n",
                "\n```",
                "// Code snippet",
              )
            }
            title="Code Block (```)"
          >
            <Icon name="code" size={12} />
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() => insertMarkdownSyntax("> ", "", "Blockquote text")}
            title="Quote (> quote)"
          >
            <span className="font-bold text-xs">&gt;</span>
          </button>
        </div>

        {/* Right View Mode & Sync Controls */}
        <div className="viewer-toolbar-group">
          {mode === "split" && (
            <button
              type="button"
              className={`viewer-toolbar-btn ${syncScroll ? "active" : ""}`}
              onClick={() => setSyncScroll((s) => !s)}
              title="Synchronize Scrolling Between Editor and Preview"
            >
              <Icon name="refresh" size={12} />
              <span>Sync Scroll</span>
            </button>
          )}

          <div className="flex items-center rounded border border-line bg-surface p-0.5">
            <button
              type="button"
              className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                mode === "editor"
                  ? "bg-accent text-canvas font-medium"
                  : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setMode("editor")}
              title="Editor Only"
            >
              Code
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                mode === "split"
                  ? "bg-accent text-canvas font-medium"
                  : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setMode("split")}
              title="Side-by-Side Split View"
            >
              Split
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                mode === "preview"
                  ? "bg-accent text-canvas font-medium"
                  : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setMode("preview")}
              title="Preview Only"
            >
              Preview
            </button>
          </div>
        </div>
      </div>

      {/* Content Area Based on Mode */}
      {mode === "editor" && (
        <div className="flex-1 h-full overflow-hidden">
          <CodePane
            filename={filename}
            isFocused={focusedGroup === groupId}
            paneId={groupId === "group2" ? "secondary" : "primary"}
          />
        </div>
      )}

      {mode === "preview" && (
        <div
          ref={previewScrollRef}
          className="markdown-preview-pane flex-1"
          style={{ fontSize: `${editorFontSize}px` }}
        >
          <MarkdownRenderer text={debouncedContent} isStreaming={false} />
        </div>
      )}

      {mode === "split" && (
        <div className="markdown-split-container">
          {/* Left Editor Pane */}
          <div
            className="markdown-editor-pane"
            style={{ width: `${splitRatio}%` }}
          >
            <CodePane
              filename={filename}
              isFocused={focusedGroup === groupId}
              paneId={groupId === "group2" ? "secondary" : "primary"}
            />
          </div>

          {/* Draggable Divider Sash */}
          <div
            className={`split-resizer-sash ${
              isResizing ? "split-resizer-sash-active" : ""
            }`}
            onDoubleClick={() => setSplitRatio(50)}
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizing(true)
            }}
            role="separator"
            title="Drag to resize split view (double-click to reset 50:50)"
          >
            <div className="split-resizer-line" />
          </div>

          {/* Right Live Synchronized Preview Pane */}
          <div
            ref={previewScrollRef}
            className="markdown-preview-pane flex-1"
            style={{
              width: `calc(${100 - splitRatio}% - 4px)`,
              fontSize: `${editorFontSize}px`,
            }}
          >
            <MarkdownRenderer text={debouncedContent} isStreaming={false} />
          </div>
        </div>
      )}
    </div>
  )
}
