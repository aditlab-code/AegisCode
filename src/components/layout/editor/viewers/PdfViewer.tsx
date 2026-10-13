import { useState, useRef, useEffect, useCallback } from "react"
import * as pdfjsLib from "pdfjs-dist"
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url"
import { Icon } from "../../../ui/Icon"
import { getRawFileUrl } from "./viewerTypes"
import "./viewers.css"

// Configure PDF.js worker URL using Vite URL import
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

interface PdfViewerProps {
  filename: string
}

const MIN_ZOOM = 0.5 // 50%
const MAX_ZOOM = 3.0 // 300%

export default function PdfViewer({ filename }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.25)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [engine, setEngine] = useState<"canvas" | "native">("canvas")

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<any>(null)
  const pdfDocRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const rawUrl = getRawFileUrl(filename)

  // Load PDF document on filename change
  useEffect(() => {
    let isCancelled = false
    setIsLoading(true)
    setErrorMsg(null)
    setCurrentPage(1)

    const loadingTask = pdfjsLib.getDocument({
      url: rawUrl,
      // Natively leverage HTTP Range requests for page streaming
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
        // Automatically fallback to native embed if PDF.js parsing fails
        setEngine("native")
      })

    return () => {
      isCancelled = true
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel()
        renderTaskRef.current = null
      }
      if (pdfDocRef.current) {
        void pdfDocRef.current.destroy()
        pdfDocRef.current = null
      }
      loadingTask.destroy()
    }
  }, [rawUrl])

  // Render current page to canvas with in-flight task cancellation (anti-race condition)
  const renderPage = useCallback(
    async (pageIndex: number, currentScale: number) => {
      if (!pdfDocRef.current || !canvasRef.current || engine !== "canvas")
        return

      // Cancel previous in-flight render task to avoid canvas collisions
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel()
        } catch {}
        renderTaskRef.current = null
      }

      try {
        const page = await pdfDocRef.current.getPage(pageIndex)
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const pixelRatio = window.devicePixelRatio || 1
        const viewport = page.getViewport({ scale: currentScale })

        canvas.width = Math.floor(viewport.width * pixelRatio)
        canvas.height = Math.floor(viewport.height * pixelRatio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`

        ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)

        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        }

        const task = page.render(renderContext)
        renderTaskRef.current = task
        await task.promise
        renderTaskRef.current = null
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("PDF page render error:", err)
        }
      }
    },
    [engine],
  )

  useEffect(() => {
    if (!isLoading && numPages > 0) {
      void renderPage(currentPage, scale)
    }
  }, [currentPage, scale, isLoading, numPages, renderPage])

  const handlePrevPage = () => {
    setCurrentPage((p) => Math.max(1, p - 1))
  }

  const handleNextPage = () => {
    setCurrentPage((p) => Math.min(numPages, p + 1))
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
      // Standard A4 width is ~595pt
      const fit = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, containerWidth / 600))
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
            onClick={() => setCurrentPage(1)}
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

          <span className="viewer-toolbar-badge font-mono">
            Page {currentPage} of {numPages || 1}
          </span>

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
            onClick={() => setCurrentPage(numPages)}
            title="Last Page"
          >
            <span>»</span>
          </button>
        </div>

        {/* Zoom & View Controls */}
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

          <span className="viewer-toolbar-badge font-mono min-w-11 text-center">
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
              title="PDF.js Canvas View"
            >
              Canvas
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

      {/* PDF Viewport Content */}
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

        {engine === "canvas" && !isLoading && (
          <div className="pdf-page-container">
            <canvas ref={canvasRef} />
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
