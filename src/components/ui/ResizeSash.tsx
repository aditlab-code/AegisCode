import { useEffect, useRef, useState } from "react"

export interface ResizeSashProps {
  direction: "vertical" | "horizontal"
  onResize: (delta: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
  onDoubleClick?: () => void
  className?: string
  title?: string
}

export function ResizeSash({
  direction,
  onResize,
  onResizeStart,
  onResizeEnd,
  onDoubleClick,
  className = "",
  title,
}: ResizeSashProps) {
  const [isDragging, setIsDragging] = useState(false)
  const posRef = useRef<number>(0)

  useEffect(() => {
    if (!isDragging) return

    function handleMouseMove(e: MouseEvent) {
      const currentPos = direction === "vertical" ? e.clientX : e.clientY
      const delta = currentPos - posRef.current
      posRef.current = currentPos
      onResize(delta)
    }

    function handleMouseUp() {
      setIsDragging(false)
      onResizeEnd?.()
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging, direction, onResize, onResizeEnd])

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setIsDragging(true)
    posRef.current = direction === "vertical" ? e.clientX : e.clientY
    onResizeStart?.()
  }

  const defaultTitle =
    direction === "vertical"
      ? "Drag horizontally to resize (Double-click to reset)"
      : "Drag vertically to resize (Double-click to reset)"

  return (
    <>
      {isDragging && (
        <div
          className={`resize-overlay-active resize-overlay-${direction}`}
          style={{
            cursor: direction === "vertical" ? "col-resize" : "row-resize",
          }}
        />
      )}
      <div
        className={`resize-sash resize-sash-${direction} ${
          isDragging ? "resize-sash-active" : ""
        } ${className}`}
        onDoubleClick={onDoubleClick}
        onMouseDown={handleMouseDown}
        role="separator"
        tabIndex={-1}
        title={title || defaultTitle}
      >
        <div className="resize-sash-line" />
      </div>
    </>
  )
}
