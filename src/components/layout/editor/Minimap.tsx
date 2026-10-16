import {
  useRef,
  useState,
  useEffect,
  useCallback,
  memo,
  type PointerEvent,
  type WheelEvent,
} from "react"
import {
  workerBroker,
  type RawSyntaxToken,
  type TokenizeResult,
} from "../../../workers"
import type { MinimapScale } from "../../../types/workbench"

export interface MinimapScaleConfig {
  fontSize: number
  lineHeight: number
  width: number
}

export function computeMinimapScaleConfig(
  scale: MinimapScale = "medium",
  editorFontSize: number = 13.5,
  editorLineHeight: number = 22,
): MinimapScaleConfig {
  const scaleMultiplier = {
    small: { fontRatio: 0.45, lineRatio: 0.45, widthRatio: 7.2, minWidth: 88 },
    medium: {
      fontRatio: 0.55,
      lineRatio: 0.55,
      widthRatio: 8.8,
      minWidth: 108,
    },
    large: { fontRatio: 0.7, lineRatio: 0.7, widthRatio: 10.6, minWidth: 132 },
  }[scale] || {
    fontRatio: 0.55,
    lineRatio: 0.55,
    widthRatio: 8.8,
    minWidth: 108,
  }

  const computedFontSize = Math.max(
    5.5,
    Math.round(editorFontSize * scaleMultiplier.fontRatio * 10) / 10,
  )
  const computedLineHeight = Math.max(
    8,
    Math.round(editorLineHeight * scaleMultiplier.lineRatio * 10) / 10,
  )
  const computedWidth = Math.max(
    scaleMultiplier.minWidth,
    Math.round(editorFontSize * scaleMultiplier.widthRatio),
  )

  return {
    fontSize: computedFontSize,
    lineHeight: computedLineHeight,
    width: computedWidth,
  }
}

interface MinimapProps {
  filename?: string
  lines: string[]
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  onScrollToLine: (lineIndex: number, smooth?: boolean) => void
  scale?: MinimapScale
  editorFontSize?: number
  editorLineHeight?: number
}

interface CachedLineTokens {
  text: string
  tokens: RawSyntaxToken[]
}

const TOKEN_COLORS: Record<string, string> = {
  "syntax-pink": "#f472b6",
  "syntax-blue": "#60a5fa",
  "syntax-green": "#4ade80",
  "syntax-yellow": "#facc15",
  "syntax-orange": "#fb923c",
  "text-muted": "rgba(148, 163, 184, 0.6)",
}
const DEFAULT_TEXT_COLOR = "rgba(226, 232, 240, 0.85)"

export const Minimap = memo(function Minimap({
  filename,
  lines,
  scrollTop,
  scrollHeight,
  clientHeight,
  onScrollToLine,
  scale = "medium",
  editorFontSize = 13.5,
  editorLineHeight = 22,
}: MinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [measuredHeight, setMeasuredHeight] = useState<number>(0)
  const tokenCacheRef = useRef<Map<number, CachedLineTokens>>(new Map())
  const [, setTokenVersion] = useState(0)
  const isDraggingRef = useRef(false)

  // Measure actual container height directly to prevent collapsing when external clientHeight is delayed
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.height > 0) {
          setMeasuredHeight(entry.contentRect.height)
        }
      }
    })
    ro.observe(el)
    if (el.clientHeight > 0) {
      setMeasuredHeight(el.clientHeight)
    }
    return () => ro.disconnect()
  }, [])

  const scaleConfig = computeMinimapScaleConfig(
    scale,
    editorFontSize,
    editorLineHeight,
  )

  const effectiveContainerHeight = Math.max(
    16,
    measuredHeight || clientHeight || 600,
  )
  const effectiveScrollHeight = Math.max(1, scrollHeight)
  const effectiveClientHeight = Math.max(1, clientHeight)
  const totalMinimapHeight = lines.length * scaleConfig.lineHeight

  const isOverflowing = totalMinimapHeight > effectiveContainerHeight
  const maxEditorScroll = Math.max(
    1,
    effectiveScrollHeight - effectiveClientHeight,
  )
  const scrollRatio = Math.max(0, Math.min(1, scrollTop / maxEditorScroll))
  const maxMinimapScroll = Math.max(
    0,
    totalMinimapHeight - effectiveContainerHeight,
  )
  const minimapOffsetY = isOverflowing ? scrollRatio * maxMinimapScroll : 0

  let sliderTopPx = 0
  let sliderHeightPx = 24
  if (isOverflowing) {
    const viewportRatio = Math.min(
      1,
      effectiveClientHeight / effectiveScrollHeight,
    )
    sliderHeightPx = Math.max(
      24,
      Math.min(
        effectiveContainerHeight,
        viewportRatio * effectiveContainerHeight,
      ),
    )
    const maxSliderTravel = effectiveContainerHeight - sliderHeightPx
    sliderTopPx = maxSliderTravel > 0 ? scrollRatio * maxSliderTravel : 0
  } else {
    const viewportRatio = Math.min(
      1,
      effectiveClientHeight / effectiveScrollHeight,
    )
    sliderHeightPx = Math.max(
      20,
      Math.min(totalMinimapHeight, viewportRatio * totalMinimapHeight),
    )
    const maxSliderTravel = totalMinimapHeight - sliderHeightPx
    sliderTopPx = maxSliderTravel > 0 ? scrollRatio * maxSliderTravel : 0
  }

  // Clear token cache whenever filename changes
  useEffect(() => {
    tokenCacheRef.current.clear()
    setTokenVersion((v) => v + 1)
  }, [filename])

  // Compute visible range for tokenization worker
  const visibleStart = Math.max(
    0,
    Math.floor((minimapOffsetY - 50) / scaleConfig.lineHeight),
  )
  const visibleEnd = Math.min(
    lines.length,
    Math.ceil(
      (minimapOffsetY + effectiveContainerHeight + 50) / scaleConfig.lineHeight,
    ),
  )

  // Asynchronously request tokens for visible lines not yet cached
  useEffect(() => {
    if (lines.length === 0) return
    const missingLineIndices: number[] = []
    const missingLineTexts: string[] = []

    for (let lineIdx = visibleStart; lineIdx < visibleEnd; lineIdx++) {
      const lineText = lines[lineIdx] ?? ""
      const cached = tokenCacheRef.current.get(lineIdx)
      if ((!cached || cached.text !== lineText) && lineText.trim().length > 0) {
        missingLineIndices.push(lineIdx)
        missingLineTexts.push(lineText)
      }
    }

    if (missingLineTexts.length === 0) return

    const controller = new AbortController()
    workerBroker
      .dispatch<{ lines: string[] }, TokenizeResult>(
        "tokenize",
        { lines: missingLineTexts },
        { lane: "fast", signal: controller.signal },
      )
      .then((res) => {
        if (!res?.tokens) return
        for (let j = 0; j < missingLineIndices.length; j++) {
          tokenCacheRef.current.set(missingLineIndices[j], {
            text: missingLineTexts[j],
            tokens: res.tokens[j],
          })
        }
        setTokenVersion((v) => v + 1)
      })
      .catch(() => {})

    return () => controller.abort()
  }, [visibleStart, visibleEnd, lines, filename, scaleConfig.lineHeight])

  // Canvas drawing effect: renders crisp silhouette micro-bars at 60fps
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
    const targetWidth = scaleConfig.width
    const targetHeight = effectiveContainerHeight

    if (
      canvas.width !== Math.floor(targetWidth * dpr) ||
      canvas.height !== Math.floor(targetHeight * dpr)
    ) {
      canvas.width = Math.floor(targetWidth * dpr)
      canvas.height = Math.floor(targetHeight * dpr)
    }

    ctx.save()
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, targetWidth, targetHeight)

    const fontPx = Math.max(5, Math.min(8.5, scaleConfig.fontSize * 0.8))
    ctx.font = `${fontPx}px "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace`
    ctx.textBaseline = "middle"

    const firstLine = Math.max(
      0,
      Math.floor(minimapOffsetY / scaleConfig.lineHeight),
    )
    const lastLine = Math.min(
      lines.length,
      Math.ceil((minimapOffsetY + targetHeight) / scaleConfig.lineHeight),
    )

    for (let i = firstLine; i < lastLine; i++) {
      const rawLine = lines[i]
      if (!rawLine || !rawLine.trim()) continue

      const lineText = rawLine.replace(/\t/g, "  ")
      const lineY = Math.floor(i * scaleConfig.lineHeight - minimapOffsetY)
      const centerY = lineY + Math.floor(scaleConfig.lineHeight / 2)

      const cached = tokenCacheRef.current.get(i)
      const cachedTokens =
        cached && cached.text === rawLine ? cached.tokens : null

      if (cachedTokens && cachedTokens.length > 0) {
        let currentX = 6
        for (let t = 0; t < cachedTokens.length; t++) {
          const tok = cachedTokens[t]
          const tokText = tok.text.replace(/\t/g, "  ")
          if (!tokText) continue

          const tokWidth = ctx.measureText(tokText).width
          ctx.fillStyle =
            TOKEN_COLORS[tok.className || ""] || DEFAULT_TEXT_COLOR
          ctx.fillText(tokText, Math.floor(currentX), centerY)

          currentX += tokWidth
          if (currentX >= targetWidth - 6) break
        }
      } else {
        ctx.fillStyle = DEFAULT_TEXT_COLOR
        ctx.fillText(lineText, 6, centerY)
      }
    }

    ctx.restore()
  }, [
    lines,
    minimapOffsetY,
    scaleConfig,
    effectiveContainerHeight,
    measuredHeight,
    filename,
  ])

  const scrollToPointer = useCallback(
    (clientY: number, smooth: boolean) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const clickY = clientY - rect.top
      const docY = isOverflowing ? clickY + minimapOffsetY : clickY
      const targetLine = Math.floor(docY / scaleConfig.lineHeight)
      onScrollToLine(
        Math.max(0, Math.min(lines.length - 1, targetLine)),
        smooth,
      )
    },
    [
      isOverflowing,
      minimapOffsetY,
      scaleConfig.lineHeight,
      lines.length,
      onScrollToLine,
    ],
  )

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = true
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    scrollToPointer(e.clientY, false)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!isDraggingRef.current) return
    scrollToPointer(e.clientY, false)
  }

  function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    isDraggingRef.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    } catch {
      // safe fallback
    }
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    const scroller =
      containerRef.current?.parentElement?.querySelector(".cm-scroller")
    if (scroller) {
      scroller.scrollTop += e.deltaY
    }
  }

  return (
    <div
      aria-hidden="true"
      className={`minimap-container minimap-scale-${scale}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onWheel={handleWheel}
      ref={containerRef}
      style={{ width: `${scaleConfig.width}px` }}
      title="Minimap: Drag or click to navigate"
    >
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        style={{
          width: `${scaleConfig.width}px`,
          height: `${effectiveContainerHeight}px`,
        }}
      />
      <div
        className="minimap-slider"
        style={{
          top: `${sliderTopPx}px`,
          height: `${sliderHeightPx}px`,
        }}
      />
    </div>
  )
})
