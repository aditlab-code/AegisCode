import { useState, useRef, useEffect, useCallback, memo } from "react"
import * as pdfjsLib from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"
import { Icon } from "../../../ui/Icon"
import { getRawFileUrl } from "./viewerTypes"
import { inverseSyncLatex } from "../../../../services/latexService"
import "./viewers.css"

// Configure PDF.js worker URL using Vite URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface PdfViewerProps {
  filename: string
}

interface SyncMarker {
  page: number
  x: number
  y: number
  width: number
  height: number
}

const MIN_ZOOM = 0.5 // 50%
const MAX_ZOOM = 3.0 // 300%

interface PdfPageItemProps {
  pageNumber: number
  pdfDoc: any
  scale: number
  viewportContainer: HTMLDivElement | null
  syncMarker: SyncMarker | null
  onCanvasClick: (
    e: React.MouseEvent<HTMLCanvasElement>,
    pageNumber: number,
  ) => void
  onPageVisible: (pageNumber: number) => void
}

/**
 * Individual Page Component for continuous vertical scroll.
 * Uses IntersectionObserver to lazily render canvas only when visible/near viewport.
 */
const PdfPageItem = memo(function PdfPageItem({
  pageNumber,
  pdfDoc,
  scale,
  viewportContainer,
  syncMarker,
  onCanvasClick,
  onPageVisible,
}: PdfPageItemProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<any>(null)
  const [isNearViewport, setIsNearViewport] = useState<boolean>(false)
  const [dimensions, setDimensions] = useState<{
    width: number
    height: number
  }>({
    width: 600 * scale,
    height: 800 * scale,
  })

  // Pre-fetch natural page dimensions
  useEffect(() => {
    let cancelled = false
    if (!pdfDoc) return

    pdfDoc
      .getPage(pageNumber)
      .then((page: any) => {
        if (cancelled) return
        const vp = page.getViewport({ scale })
        setDimensions({
          width: Math.floor(vp.width),
          height: Math.floor(vp.height),
        })
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [pdfDoc, pageNumber, scale])

  // Observe page visibility to lazy-render canvas and track active page in toolbar
  useEffect(() => {
    const el = containerRef.current
    if (!el || !viewportContainer) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsNearViewport(true)
            if (entry.intersectionRatio >= 0.35) {
              onPageVisible(pageNumber)
            }
          }
        }
      },
      {
        root: viewportContainer,
        rootMargin: "600px 0px 600px 0px", // Render slightly before scrolling into view
        threshold: [0, 0.35, 0.7],
      },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [viewportContainer, pageNumber, onPageVisible])

  // Render canvas once near viewport
  useEffect(() => {
    if (!isNearViewport || !pdfDoc || !canvasRef.current) return
    let isCancelled = false

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel()
      } catch {}
      renderTaskRef.current = null
    }

    pdfDoc
      .getPage(pageNumber)
      .then(async (page: any) => {
        if (isCancelled || !canvasRef.current) return
        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const pixelRatio = window.devicePixelRatio || 1
        const viewport = page.getViewport({ scale })

        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

        const task = page.render({
          canvasContext: ctx,
          viewport: viewport,
        })
        renderTaskRef.current = task
        await task.promise
        renderTaskRef.current = null
      })
      .catch((err: any) => {
        if (err?.name !== "RenderingCancelledException") {
          console.error(`Page ${pageNumber} render failed:`, err)
        }
      })

    return () => {
      isCancelled = true
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {}
        renderTaskRef.current = null
      }
    }
  }, [isNearViewport, pdfDoc, pageNumber, scale])

  return (
    <div
      ref={containerRef}
      data-page-number={pageNumber}
      className="pdf-page-container relative bg-white border border-line rounded shadow-md overflow-hidden"
      style={{
        width: `${dimensions.width}px`,
        minHeight: `${dimensions.height}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        onClick={(e) => onCanvasClick(e, pageNumber)}
        className="block cursor-crosshair"
        title="Ctrl+Click on any text to jump to LaTeX source code (SyncTeX)"
      />

      {/* SyncTeX Forward Search Pulse Highlight */}
      {syncMarker && (
        <div
          className="pdf-synctex-marker"
          style={{
            left: `${syncMarker.x * scale}px`,
            top: `${syncMarker.y * scale}px`,
            width: `${Math.max(32, syncMarker.width * scale)}px`,
            height: `${Math.max(14, syncMarker.height * scale)}px`,
          }}
        />
      )}

      {/* Floating page number indicator */}
      <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/50 text-[10px] text-white/90 font-mono select-none pointer-events-none">
        {pageNumber}
      </div>
    </div>
  )
})

export default function PdfViewer({ filename }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.25)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [engine, setEngine] = useState<"canvas" | "native">("canvas")
  const [syncMarker, setSyncMarker] = useState<SyncMarker | null>(null)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)

  const pdfDocRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const markerTimerRef = useRef<any>(null)

  const rawUrl = getRawFileUrl(filename)

  // Listen to Forward SyncTeX events triggered by LaTeX Editor
  useEffect(() => {
    const handleForwardSync = (e: any) => {
      const detail = e.detail
      if (!detail) return

      const targetBase = String(detail.pdfFile || "")
        .split(/[/\\]/)
        .pop()
        ?.toLowerCase()
      const currentBase = filename.split(/[/\\]/).pop()?.toLowerCase()

      if (targetBase && currentBase && targetBase !== currentBase) {
        return
      }

      const targetPage = detail.page || 1
      setCurrentPage(targetPage)

      setSyncMarker({
        page: targetPage,
        x: detail.x || 0,
        y: detail.y || 0,
        width: detail.width || 280,
        height: detail.height || 14,
      })

      // Smoothly scroll the container to target page & coordinate
      setTimeout(() => {
        if (!containerRef.current) return
        const pageEl = containerRef.current.querySelector(
          `[data-page-number="${targetPage}"]`,
        ) as HTMLElement | null
        if (pageEl) {
          const markerTop = pageEl.offsetTop + (detail.y || 0) * scale
          containerRef.current.scrollTo({
            top: Math.max(0, markerTop - 140),
            behavior: "smooth",
          })
        }
      }, 50)

      if (markerTimerRef.current) {
        clearTimeout(markerTimerRef.current)
      }
      markerTimerRef.current = setTimeout(() => {
        setSyncMarker(null)
      }, 3500)
    }

    window.addEventListener(
      "aegis:pdf-synctex-forward" as any,
      handleForwardSync,
    )
    return () => {
      window.removeEventListener(
        "aegis:pdf-synctex-forward" as any,
        handleForwardSync,
      )
      if (markerTimerRef.current) {
        clearTimeout(markerTimerRef.current)
      }
    }
  }, [filename, scale])

  // Handle Ctrl+Click / Cmd+Click for Inverse Search
  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>, pageNumber: number) => {
      if (!e.ctrlKey && !e.metaKey) return
      const canvas = e.currentTarget
      const rect = canvas.getBoundingClientRect()
      const clickX = e.clientX - rect.left
      const clickY = e.clientY - rect.top

      // Convert CSS client pixels to standard TeX point coordinates (72 pt/inch)
      const ptX = clickX / scale
      const ptY = clickY / scale

      setIsSyncing(true)
      try {
        const pos = await inverseSyncLatex(filename, pageNumber, ptX, ptY)
        if (pos?.file) {
          window.dispatchEvent(
            new CustomEvent("aegis:editor-goto-line", {
              detail: {
                file: pos.file,
                line: pos.line,
                col: pos.column || 1,
                preventFocus: false,
              },
            }),
          )
        }
      } catch (err) {
        console.warn("Inverse SyncTeX resolution failed:", err)
      } finally {
        setIsSyncing(false)
      }
    },
    [filename, scale],
  )

  // Load PDF document on rawUrl change with robust fail-safe cleanup
  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    setErrorMsg(null)
    setCurrentPage(1)

    const loadingTask = pdfjsLib.getDocument({
      url: rawUrl,
      disableRange: false,
      disableStream: false,
    })

    loadingTask.promise
      .then((pdf) => {
        if (isCancelled) return
        pdfDocRef.current = pdf
        setNumPages(pdf.numPages)
        setIsLoading(false)
      })
      .catch((err) => {
        if (isCancelled) return
        console.error("Failed to load PDF with canvas engine:", err)
        setErrorMsg(err.message || "Failed to load PDF document")
        setIsLoading(false)
        setEngine("native")
      })

    return () => {
      isCancelled = true
      if (pdfDocRef.current) {
        try {
          if (typeof pdfDocRef.current.destroy === "function") {
            void pdfDocRef.current.destroy()
          } else if (typeof pdfDocRef.current.cleanup === "function") {
            void pdfDocRef.current.cleanup()
          }
        } catch {}
        pdfDocRef.current = null
      }
      try {
        loadingTask.destroy()
      } catch {}
    }
  }, [rawUrl])

  const scrollToPage = useCallback(
    (pageNum: number) => {
      if (!containerRef.current) return
      const target = Math.max(1, Math.min(numPages, pageNum))
      const pageEl = containerRef.current.querySelector(
        `[data-page-number="${target}"]`,
      ) as HTMLElement | null
      if (pageEl) {
        pageEl.scrollIntoView({ behavior: "smooth", block: "start" })
        setCurrentPage(target)
      }
    },
    [numPages],
  )

  const handlePrevPage = () => {
    scrollToPage(currentPage - 1)
  }

  const handleNextPage = () => {
    scrollToPage(currentPage + 1)
  }

  const handleZoomIn = () => {
    setScale((s) => Math.min(MAX_ZOOM, Math.round((s + 0.25) * 100) / 100))
  }

  const handleZoomOut = () => {
    setScale((s) => Math.max(MIN_ZOOM, Math.round((s - 0.25) * 100) / 100))
  }

  const handleFitWidth = () => {
    if (!containerRef.current) return
    const containerWidth = containerRef.current.clientWidth - 48
    if (containerWidth > 300) {
      const fit = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, containerWidth / 620))
      setScale(Math.round(fit * 100) / 100)
    }
  }

  return (
    <div className="viewer-container">
      {/* PDF Header Toolbar */}
      <div className="viewer-toolbar">
        {/* Page Navigation */}
        <div className="viewer-toolbar-group">
          <button
            type="button"
            className="viewer-toolbar-btn"
            disabled={currentPage <= 1 || isLoading}
            onClick={() => scrollToPage(1)}
            title="First Page"
          >
            <span>«</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            disabled={currentPage <= 1 || isLoading}
            onClick={handlePrevPage}
            title="Previous Page"
          >
            <span>‹</span>
          </button>

          <div className="flex items-center gap-1 text-[11px] font-mono px-1">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, numPages)}
              value={currentPage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val)) scrollToPage(val)
              }}
              className="w-10 px-1 py-0.5 text-center bg-canvas border border-line rounded text-ink outline-none focus:border-accent"
              title="Jump to Page"
            />
            <span className="text-ink-muted">/ {numPages || 1}</span>
          </div>

          <button
            type="button"
            className="viewer-toolbar-btn"
            disabled={currentPage >= numPages || isLoading}
            onClick={handleNextPage}
            title="Next Page"
          >
            <span>›</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            disabled={currentPage >= numPages || isLoading}
            onClick={() => scrollToPage(numPages)}
            title="Last Page"
          >
            <span>»</span>
          </button>
        </div>

        {/* Zoom Controls & SyncTeX Status */}
        <div className="viewer-toolbar-group">
          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={handleZoomOut}
            disabled={scale <= MIN_ZOOM || isLoading}
            title="Zoom Out"
          >
            <Icon name="zoom-out" size={12} />
          </button>

          <span
            className="viewer-toolbar-badge font-mono"
            title="Current View Zoom Scale"
          >
            {Math.round(scale * 100)}%
          </span>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={handleZoomIn}
            disabled={scale >= MAX_ZOOM || isLoading}
            title="Zoom In"
          >
            <Icon name="zoom-in" size={12} />
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={handleFitWidth}
            title="Fit to Container Width"
          >
            <Icon name="fit-screen" size={12} />
            <span>Fit Width</span>
          </button>

          <button
            type="button"
            className="viewer-toolbar-btn"
            onClick={() => setScale(1.0)}
            title="100% Actual Scale"
          >
            <span>100%</span>
          </button>

          {/* SyncTeX Status Indicator */}
          <div
            className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded border border-line bg-surface text-[10px] text-ink-muted select-none"
            title="SyncTeX: Hold Ctrl or Cmd and click any text on the page to jump to the matching LaTeX source line"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isSyncing ? "bg-warning animate-ping" : "bg-emerald-500"
              }`}
            />
            <span className="font-mono">
              {isSyncing ? "Syncing..." : "SyncTeX Ready"}
            </span>
          </div>

          {/* Engine Selector */}
          <div className="flex items-center rounded border border-line bg-surface p-0.5 ml-2">
            <button
              type="button"
              className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                engine === "canvas"
                  ? "bg-accent text-canvas font-medium"
                  : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setEngine("canvas")}
              title="Continuous Multi-page Vertical Scroll"
            >
              Continuous
            </button>
            <button
              type="button"
              className={`px-2 py-0.5 text-[11px] rounded transition-colors cursor-pointer ${
                engine === "native"
                  ? "bg-accent text-canvas font-medium"
                  : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setEngine("native")}
              title="Native Browser Embed View"
            >
              Native
            </button>
          </div>
        </div>
      </div>

      {/* PDF Viewport Content (Continuous Scroll) */}
      <div ref={containerRef} className="pdf-viewport">
        {isLoading && (
          <div className="flex items-center gap-2 py-12 text-ink-muted text-xs">
            <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span>Loading PDF document...</span>
          </div>
        )}

        {errorMsg && engine === "canvas" && (
          <div className="flex flex-col items-center gap-3 py-12 text-error text-xs max-w-md text-center">
            <Icon name="warning" size={24} className="text-warning" />
            <span>{errorMsg}</span>
            <button
              type="button"
              className="viewer-toolbar-btn"
              onClick={() => setEngine("native")}
            >
              Switch to Native Browser Viewer
            </button>
          </div>
        )}

        {/* Continuous Multi-Page Vertical Scroll View */}
        {engine === "canvas" && !isLoading && numPages > 0 && (
          <div className="pdf-stream-container">
            {Array.from({ length: numPages }, (_, i) => i + 1).map(
              (pageNum) => (
                <PdfPageItem
                  key={`${filename}-page-${pageNum}`}
                  pageNumber={pageNum}
                  pdfDoc={pdfDocRef.current}
                  scale={scale}
                  viewportContainer={containerRef.current}
                  syncMarker={syncMarker?.page === pageNum ? syncMarker : null}
                  onCanvasClick={handleCanvasClick}
                  onPageVisible={setCurrentPage}
                />
              ),
            )}
          </div>
        )}

        {engine === "native" && (
          <div className="w-full h-full flex-1 min-h-125">
            <iframe
              src={rawUrl}
              title={filename}
              className="w-full h-full border-none rounded"
            />
          </div>
        )}
      </div>
    </div>
  )
}
