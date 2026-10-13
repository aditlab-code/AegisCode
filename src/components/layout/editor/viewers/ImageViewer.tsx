import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type PointerEvent,
} from "react"
import { Icon } from "../../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../../store"
import { getRawFileUrl, formatFileSize, getFileExtension } from "./viewerTypes"
import "./viewers.css"

interface ImageViewerProps {
  filename: string
  onOpenCode?: () => void
}

const MIN_ZOOM = 0.1 // 10%
const MAX_ZOOM = 25.0 // 2500%

export default function ImageViewer({
  filename,
  onOpenCode,
}: ImageViewerProps) {
  const { buffer, openFileInPane } = useWorkbenchStore(
    useShallow((s) => ({
      buffer: s.fileBuffers[filename],
      openFileInPane: s.openFileInPane,
    })),
  )

  const [scale, setScale] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [showGrid, setShowGrid] = useState(true)
  const [naturalSize, setNaturalSize] = useState<{
    width: number
    height: number
  } | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const isPointerDownRef = useRef(false)
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const rafIdRef = useRef<number | null>(null)

  const rawUrl = getRawFileUrl(filename)
  const ext = getFileExtension(filename).toUpperCase()
  const isSvg = ext === "SVG"

  // Reset or fit image on filename change
  useEffect(() => {
    setScale(1.0)
    setPan({ x: 0, y: 0 })
    setNaturalSize(null)
  }, [filename])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const nw = img.naturalWidth || 400
    const nh = img.naturalHeight || 300
    setNaturalSize({ width: nw, height: nh })

    // Auto-fit if image exceeds viewport container
    if (containerRef.current) {
      const cw = containerRef.current.clientWidth - 48
      const ch = containerRef.current.clientHeight - 48
      if (cw > 0 && ch > 0 && (nw > cw || nh > ch)) {
        const fitScale = Math.min(cw / nw, ch / nh)
        const clampedFit = Math.max(MIN_ZOOM, Math.min(1.0, fitScale))
        setScale(clampedFit)
      } else {
        setScale(1.0)
      }
      setPan({ x: 0, y: 0 })
    }
  }

  const handleFitToScreen = useCallback(() => {
    if (!naturalSize || !containerRef.current) {
      setScale(1.0)
      setPan({ x: 0, y: 0 })
      return
    }
    const cw = containerRef.current.clientWidth - 48
    const ch = containerRef.current.clientHeight - 48
    if (cw > 0 && ch > 0) {
      const fitScale = Math.min(cw / naturalSize.width, ch / naturalSize.height)
      const clampedFit = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitScale))
      setScale(clampedFit)
      setPan({ x: 0, y: 0 })
    }
  }, [naturalSize])

  const handleResetZoom = useCallback(() => {
    setScale(1.0)
    setPan({ x: 0, y: 0 })
  }, [])

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(MAX_ZOOM, prev * 1.25))
  }, [])

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(MIN_ZOOM, prev * 0.8))
  }, [])

  // Interactive mouse wheel zoom centered at pointer with non-passive listener
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const factor = e.deltaY < 0 ? 1.15 : 0.87
      setScale((prevScale) =>
        Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prevScale * factor)),
      )
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
    }
  }, [])

  // Pointer drag pan handling
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return // Left click only
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

    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(() => {
      setPan((prev) => {
        const boundX = Math.max(200, (naturalSize?.width ?? 600) * scale)
        const boundY = Math.max(200, (naturalSize?.height ?? 600) * scale)
        const nextX = Math.max(-boundX, Math.min(boundX, prev.x + dx))
        const nextY = Math.max(-boundY, Math.min(boundY, prev.y + dy))
        return { x: nextX, y: nextY }
      })
    })
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    isPointerDownRef.current = false
    setIsDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  return (
    <div className="viewer-container">
      {/* Viewer Header Toolbar */}
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-group">
          <Icon name="image" size={14} className="text-accent" />
          <span className="font-medium text-ink">
            {filename.split("/").pop()}
          </span>
          <span className="viewer-toolbar-badge uppercase font-semibold">
            [{ext}]
          </span>
          {naturalSize && (
            <span className="viewer-toolbar-badge">
              {naturalSize.width} × {naturalSize.height} px
            </span>
          )}
          {buffer?.fileSize && (
            <span className="viewer-toolbar-badge">
              {formatFileSize(buffer.fileSize)}
            </span>
          )}
        </div>

        <div className="viewer-toolbar-group">
          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={handleZoomOut}
            title="Zoom Out (Wheel Down)"
          >
            <Icon name="zoom-out" size={12} />
          </button>

          <span className="viewer-toolbar-badge font-mono min-w-11 text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={handleZoomIn}
            title="Zoom In (Wheel Up)"
          >
            <Icon name="zoom-in" size={12} />
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={handleFitToScreen}
            title="Fit to Window"
          >
            <Icon name="fit-screen" size={12} />
            <span>Fit</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={handleResetZoom}
            title="Actual Size 1:1 (100%)"
          >
            <span>100%</span>
          </button>

          <button
            type="button"
            className={`viewer-toolbar-btn ${showGrid ? "active" : ""}`}
            onClick={() => setShowGrid((v) => !v)}
            title="Toggle Transparency Checkerboard Grid"
          >
            <Icon name="layout" size={12} />
            <span>Grid</span>
          </button>

          {isSvg && (
            <button
              type="button"
              className="viewer-toolbar-btn text-accent hover:border-accent"
              onClick={() => {
                if (onOpenCode) onOpenCode()
                else openFileInPane(filename)
              }}
              title="Edit SVG Raw Source Code"
            >
              <Icon name="code" size={12} />
              <span>Edit SVG XML</span>
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Pan-Zoom Canvas Viewport */}
      <div
        ref={containerRef}
        className={`image-canvas-viewport ${
          showGrid ? "transparency-grid" : ""
        } ${isDragging ? "grabbing" : "grab"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <img
          key={rawUrl}
          src={rawUrl}
          alt={filename}
          className="image-preview-target"
          draggable={false}
          onLoad={handleImageLoad}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${scale})`,
          }}
        />
      </div>
    </div>
  )
}
