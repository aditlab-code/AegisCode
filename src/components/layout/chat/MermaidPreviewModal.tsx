import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type PointerEvent,
  type WheelEvent,
} from "react"
import { createPortal } from "react-dom"
import { Icon } from "../../ui/Icon"

interface MermaidPreviewModalProps {
  isOpen: boolean
  svgContent: string
  code: string
  onClose: () => void
}

const MIN_ZOOM = 0.2 // 20%
const MAX_ZOOM = 5.0 // 500%

export function MermaidPreviewModal({
  isOpen,
  svgContent,
  code,
  onClose,
}: MermaidPreviewModalProps) {
  const [scale, setScale] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [copied, setCopied] = useState(false)

  const isPointerDownRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })

  // Reset zoom & pan when opening
  useEffect(() => {
    if (isOpen) {
      setScale(1.0)
      setPan({ x: 0, y: 0 })
    }
  }, [isOpen])

  // Esc key closes modal cleanly
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Zoom helpers
  const handleZoomIn = () => {
    setScale((prev) => Math.min(MAX_ZOOM, Number((prev + 0.25).toFixed(2))))
  }

  const handleZoomOut = () => {
    setScale((prev) => Math.max(MIN_ZOOM, Number((prev - 0.25).toFixed(2))))
  }

  const handleResetZoom = useCallback(() => {
    setScale(1.0)
    setPan({ x: 0, y: 0 })
  }, [])

  // Mouse Wheel Zoom
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const delta = e.deltaY < 0 ? 0.15 : -0.15
    setScale((prev) => {
      const next = prev + delta
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(next.toFixed(2))))
    })
  }

  // Pointer Drag (Pan)
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Only drag on primary mouse button
    if (e.button !== 0) return
    isPointerDownRef.current = true
    lastPointerRef.current = { x: e.clientX, y: e.clientY }
    setIsDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!isPointerDownRef.current) return
    const dx = e.clientX - lastPointerRef.current.x
    const dy = e.clientY - lastPointerRef.current.y
    lastPointerRef.current = { x: e.clientX, y: e.clientY }
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }))
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  // Copy Mermaid Code
  const handleCopyCode = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Download SVG file
  const handleDownloadSvg = () => {
    try {
      const blob = new Blob([svgContent], {
        type: "image/svg+xml;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `mermaid-diagram-${Date.now()}.svg`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.warn("Failed to download Mermaid SVG:", err)
    }
  }

  if (!isOpen) return null

  const modalElement = (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-md animate-in fade-in duration-150 select-none"
      role="dialog"
      aria-modal="true"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-line shadow-xs shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-6 h-6 rounded flex items-center justify-center bg-accent/15 text-accent border border-accent/25">
            <Icon name="code" size={13} />
          </span>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-ink leading-tight">
              Mermaid Diagram Preview
            </span>
            <span className="text-[10px] text-ink-muted leading-tight font-mono">
              Pan: Drag canvas | Zoom: Scroll wheel | Double-click: Reset
            </span>
          </div>
        </div>

        {/* Toolbar Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-line bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
            onClick={handleZoomOut}
            title="Zoom out (or scroll down)"
          >
            <Icon name="zoom-out" size={12} />
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-mono font-medium border border-line bg-surface hover:bg-surface-hover text-ink transition-colors cursor-pointer min-w-16 justify-center"
            onClick={handleResetZoom}
            title="Reset zoom to 100% (or double click)"
          >
            <Icon name="fit-screen" size={11} />
            <span>{Math.round(scale * 100)}%</span>
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border border-line bg-surface hover:bg-surface-hover text-ink-muted hover:text-ink transition-colors cursor-pointer"
            onClick={handleZoomIn}
            title="Zoom in (or scroll up)"
          >
            <Icon name="zoom-in" size={12} />
          </button>

          <div className="w-[1px] h-4 bg-line mx-1" />

          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border border-line bg-surface hover:bg-surface-hover text-ink transition-colors cursor-pointer"
            onClick={handleDownloadSvg}
            title="Download diagram as SVG"
          >
            <Icon name="cloud" size={12} />
            <span>SVG</span>
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium border border-line bg-surface hover:bg-surface-hover text-ink transition-colors cursor-pointer"
            onClick={handleCopyCode}
            title="Copy Mermaid source code"
          >
            <Icon name={copied ? "check" : "copy"} size={12} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>

          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 rounded text-ink-muted hover:text-ink hover:bg-surface-hover border border-transparent hover:border-line transition-colors ml-1 cursor-pointer"
            onClick={onClose}
            title="Close preview (Esc)"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      {/* Interactive Pan-Zoom Canvas */}
      <div
        className={`flex-1 relative overflow-hidden bg-canvas flex items-center justify-center ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          backgroundImage:
            "radial-gradient(var(--color-line) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleResetZoom}
      >
        <div
          className="transition-transform duration-75 ease-out select-none flex items-center justify-center max-w-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    </div>
  )

  if (typeof document === "undefined") {
    return modalElement
  }

  return createPortal(modalElement, document.body)
}
