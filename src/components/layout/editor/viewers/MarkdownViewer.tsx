import { useState, useRef, useEffect } from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import { MarkdownRenderer } from "../../chat/MarkdownRenderer"
import { CodePane } from "../CodePane"
import type { CMEditorHandle } from "../CMEditor"
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
  const { buffer, focusedGroup, settings } = useWorkbenchStore(
    useShallow((s) => ({
      buffer: s.fileBuffers[filename],
      focusedGroup: s.focusedGroup,
      settings: s.settings,
    })),
  )

  const [mode, setMode] = useState<MarkdownMode>("split")
  const [syncScroll, setSyncScroll] = useState(true)
  const [splitRatio, setSplitRatio] = useState(50)
  const [isResizing, setIsResizing] = useState(false)
  const [activeDropdown, setActiveDropdown] =
    useState<"heading" | "list" | null>(null)

  const content = buffer?.content ?? ""
  const [debouncedContent, setDebouncedContent] = useState(content)

  const containerRef = useRef<HTMLDivElement>(null)
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<CMEditorHandle>(null)
  const dropdownContainerRef = useRef<HTMLDivElement>(null)
  const isSyncingScroll = useRef(false)
  const syncTimeoutRef = useRef<number | null>(null)
  const lastScrollRatio = useRef<number>(0)

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

  // Synchronized scrolling engine with anti-Big-O mutex lock for split mode
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
      lastScrollRatio.current = ratio
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
      lastScrollRatio.current = ratio
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

  // Track scroll position in editor-only mode
  useEffect(() => {
    if (mode !== "editor") return
    const scroller =
      containerRef.current?.querySelector<HTMLDivElement>(".cm-scroller")
    if (!scroller) return

    const handleScroll = () => {
      const maxScroll = scroller.scrollHeight - scroller.clientHeight
      if (maxScroll > 0) {
        lastScrollRatio.current = scroller.scrollTop / maxScroll
      }
    }

    scroller.addEventListener("scroll", handleScroll, { passive: true })
    return () => scroller.removeEventListener("scroll", handleScroll)
  }, [mode])

  // Track scroll position in preview-only mode
  useEffect(() => {
    if (mode !== "preview") return
    const preview = previewScrollRef.current
    if (!preview) return

    const handleScroll = () => {
      const maxScroll = preview.scrollHeight - preview.clientHeight
      if (maxScroll > 0) {
        lastScrollRatio.current = preview.scrollTop / maxScroll
      }
    }

    preview.addEventListener("scroll", handleScroll, { passive: true })
    return () => preview.removeEventListener("scroll", handleScroll)
  }, [mode])

  // Restore scroll position across mode transitions
  useEffect(() => {
    const ratio = lastScrollRatio.current
    if (ratio <= 0) return

    const timer = setTimeout(() => {
      if (mode === "editor" || mode === "split") {
        const scroller =
          containerRef.current?.querySelector<HTMLDivElement>(".cm-scroller")
        if (scroller) {
          const maxScroll = scroller.scrollHeight - scroller.clientHeight
          if (maxScroll > 0) {
            scroller.scrollTop = ratio * maxScroll
          }
        }
      }
      if (mode === "preview" || mode === "split") {
        const preview = previewScrollRef.current
        if (preview) {
          const maxScroll = preview.scrollHeight - preview.clientHeight
          if (maxScroll > 0) {
            preview.scrollTop = ratio * maxScroll
          }
        }
      }
    }, 50)

    return () => clearTimeout(timer)
  }, [mode])

  // Close toolbar dropdowns on outside click or Escape
  useEffect(() => {
    if (!activeDropdown) return

    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownContainerRef.current &&
        !dropdownContainerRef.current.contains(e.target as Node)
      ) {
        setActiveDropdown(null)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveDropdown(null)
      }
    }

    window.addEventListener("mousedown", handleClickOutside)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("mousedown", handleClickOutside)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [activeDropdown])

  return (
    <div className="viewer-container" ref={containerRef}>
      {/* Markdown Enhanced Toolbar */}
      <div className="viewer-toolbar">
        {/* Left Formatting Group - Active in Code and Split modes */}
        {mode !== "preview" ? (
          <div className="viewer-toolbar-group" ref={dropdownContainerRef}>
            <button
              type="button"
              className="viewer-toolbar-btn font-bold"
              onClick={() => editorRef.current?.insertMarkdown("bold")}
              title="Bold (**text**)"
            >
              <Icon name="bold" size={12} />
            </button>

            <button
              type="button"
              className="viewer-toolbar-btn italic font-serif"
              onClick={() => editorRef.current?.insertMarkdown("italic")}
              title="Italic (*text*)"
            >
              <Icon name="italic" size={12} />
            </button>

            <div className="viewer-toolbar-divider" />

            {/* Headings Dropdown */}
            <div className="viewer-dropdown">
              <button
                type="button"
                className={`viewer-toolbar-btn ${
                  activeDropdown === "heading" ? "active" : ""
                }`}
                onClick={() =>
                  setActiveDropdown((prev) =>
                    prev === "heading" ? null : "heading",
                  )
                }
                title="Headings (H1, H2, H3)"
              >
                <Icon name="heading" size={12} />
                <span>Heading</span>
                <Icon name="chevron-down" size={10} />
              </button>

              {activeDropdown === "heading" && (
                <div className="viewer-dropdown-menu" role="menu">
                  <button
                    type="button"
                    className="viewer-dropdown-item"
                    onClick={() => {
                      editorRef.current?.insertMarkdown("h1")
                      setActiveDropdown(null)
                    }}
                  >
                    <span className="font-bold text-xs">H1</span>
                    <span>Heading 1</span>
                    <span className="viewer-dropdown-item-badge">#</span>
                  </button>
                  <button
                    type="button"
                    className="viewer-dropdown-item"
                    onClick={() => {
                      editorRef.current?.insertMarkdown("h2")
                      setActiveDropdown(null)
                    }}
                  >
                    <span className="font-bold text-xs">H2</span>
                    <span>Heading 2</span>
                    <span className="viewer-dropdown-item-badge">##</span>
                  </button>
                  <button
                    type="button"
                    className="viewer-dropdown-item"
                    onClick={() => {
                      editorRef.current?.insertMarkdown("h3")
                      setActiveDropdown(null)
                    }}
                  >
                    <span className="font-bold text-xs">H3</span>
                    <span>Heading 3</span>
                    <span className="viewer-dropdown-item-badge">###</span>
                  </button>
                </div>
              )}
            </div>

            {/* Lists Dropdown */}
            <div className="viewer-dropdown">
              <button
                type="button"
                className={`viewer-toolbar-btn ${
                  activeDropdown === "list" ? "active" : ""
                }`}
                onClick={() =>
                  setActiveDropdown((prev) => (prev === "list" ? null : "list"))
                }
                title="Lists (Bullet, Numbered, Task)"
              >
                <Icon name="list" size={12} />
                <span>List</span>
                <Icon name="chevron-down" size={10} />
              </button>

              {activeDropdown === "list" && (
                <div className="viewer-dropdown-menu" role="menu">
                  <button
                    type="button"
                    className="viewer-dropdown-item"
                    onClick={() => {
                      editorRef.current?.insertMarkdown("bullet-list")
                      setActiveDropdown(null)
                    }}
                  >
                    <Icon name="list" size={12} />
                    <span>Bullet List</span>
                    <span className="viewer-dropdown-item-badge">-</span>
                  </button>
                  <button
                    type="button"
                    className="viewer-dropdown-item"
                    onClick={() => {
                      editorRef.current?.insertMarkdown("numbered-list")
                      setActiveDropdown(null)
                    }}
                  >
                    <span className="font-mono text-xs font-semibold">1.</span>
                    <span>Numbered List</span>
                    <span className="viewer-dropdown-item-badge">1.</span>
                  </button>
                  <button
                    type="button"
                    className="viewer-dropdown-item"
                    onClick={() => {
                      editorRef.current?.insertMarkdown("task-list")
                      setActiveDropdown(null)
                    }}
                  >
                    <Icon name="check" size={12} />
                    <span>Task List</span>
                    <span className="viewer-dropdown-item-badge">[ ]</span>
                  </button>
                </div>
              )}
            </div>

            <div className="viewer-toolbar-divider" />

            <button
              type="button"
              className="viewer-toolbar-btn"
              onClick={() => editorRef.current?.insertMarkdown("quote")}
              title="Quote (> quote)"
            >
              <span className="font-bold text-xs leading-none">&gt;</span>
            </button>

            <button
              type="button"
              className="viewer-toolbar-btn"
              onClick={() => editorRef.current?.insertMarkdown("link")}
              title="Hyperlink [title](url)"
            >
              <Icon name="link" size={12} />
            </button>

            <button
              type="button"
              className="viewer-toolbar-btn"
              onClick={() => editorRef.current?.insertMarkdown("table")}
              title="Insert Table"
            >
              <Icon name="table" size={12} />
              <span>Table</span>
            </button>

            <button
              type="button"
              className="viewer-toolbar-btn"
              onClick={() => editorRef.current?.insertMarkdown("code-block")}
              title="Code Block (```)"
            >
              <Icon name="code" size={12} />
            </button>
          </div>
        ) : (
          <div />
        )}

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
        <div className="markdown-raw-editor">
          <CodePane
            filename={filename}
            isFocused={focusedGroup === groupId}
            paneId={groupId === "group2" ? "secondary" : "primary"}
            editorRef={editorRef}
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
              editorRef={editorRef}
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
