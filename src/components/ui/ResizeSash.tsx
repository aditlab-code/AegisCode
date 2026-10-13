import { useRef } from "react"

export interface ResizeSashProps {
  direction: "vertical" | "horizontal"
  onResize: (delta: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
  onDoubleClick?: () => void
  className?: string
  title?: string
}

/**
 * ResizeSash — zero-state drag handle, VSCode-style.
 *
 * During drag: all work is done via refs + raw DOM events.
 * No React state mutations → no re-renders during mouse move.
 * `onResize(delta)` is called on every mousemove; callee
 * should mutate the DOM directly (e.g. CSS var on workbench el)
 * and only commit to Zustand on mouseup.
 */
export function ResizeSash({
  direction,
  onResize,
  onResizeStart,
  onResizeEnd,
  onDoubleClick,
  className = "",
  title,
}: ResizeSashProps) {
  const sashRef = useRef<HTMLDivElement>(null)
  const posRef = useRef(0)
  const dragging = useRef(false)

  const cursor = direction === "vertical" ? "col-resize" : "row-resize"

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()

    dragging.current = true
    posRef.current = direction === "vertical" ? e.clientX : e.clientY
    document.body.style.cursor = cursor
    document.body.style.userSelect = "none"
    sashRef.current?.classList.add("resize-sash-active")
    onResizeStart?.()

    function onMouseMove(ev: MouseEvent) {
      if (!dragging.current) return
      const cur = direction === "vertical" ? ev.clientX : ev.clientY
      const delta = cur - posRef.current
      posRef.current = cur
      onResize(delta)
    }

    function onMouseUp() {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      sashRef.current?.classList.remove("resize-sash-active")
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup", onMouseUp)
      onResizeEnd?.()
    }

    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup", onMouseUp)
  }

  const defaultTitle =
    direction === "vertical"
      ? "Drag horizontally to resize (Double-click to reset)"
      : "Drag vertically to resize (Double-click to reset)"

  return (
    <div
      ref={sashRef}
      className={`resize-sash resize-sash-${direction} ${className}`}
      onDoubleClick={onDoubleClick}
      onMouseDown={handleMouseDown}
      role="separator"
      tabIndex={-1}
      title={title || defaultTitle}
    >
      <div className="resize-sash-line" />
    </div>
  )
}
