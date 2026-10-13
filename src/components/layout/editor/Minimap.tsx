import {
  useRef,
  useState,
  useEffect,
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
  lines: string[]
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  onScrollToLine: (lineIndex: number, smooth?: boolean) => void
  scale?: MinimapScale
  editorFontSize?: number
  editorLineHeight?: number
}

export const Minimap = memo(function Minimap({
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

  const scaleConfig = computeMinimapScaleConfig(
    scale,
    editorFontSize,
    editorLineHeight,
  )

  const effectiveScrollHeight = Math.max(1, scrollHeight)
  const effectiveClientHeight = Math.max(1, clientHeight)
  const totalMinimapHeight = lines.length * scaleConfig.lineHeight

  // Viewport ratio in main editor
  const maxEditorScroll = Math.max(
    1,
    effectiveScrollHeight - effectiveClientHeight,
  )
  const scrollRatio = Math.max(0, Math.min(1, scrollTop / maxEditorScroll))

  // If total minimap lines height > container height, scroll the minimap content proportionally
  const isOverflowing = totalMinimapHeight > effectiveClientHeight
  const maxMinimapScroll = Math.max(
    0,
    totalMinimapHeight - effectiveClientHeight,
  )
  const minimapOffsetY = isOverflowing ? scrollRatio * maxMinimapScroll : 0

  // Calculate viewport slider box position in pixels
  let sliderTopPx = 0
  let sliderHeightPx = 0

  if (isOverflowing) {
    sliderHeightPx = Math.max(
      16,
      Math.min(
        effectiveClientHeight,
        (effectiveClientHeight / effectiveScrollHeight) * effectiveClientHeight,
      ),
    )
    const maxSliderTravel = effectiveClientHeight - sliderHeightPx
    sliderTopPx = scrollRatio * maxSliderTravel
  } else {
    sliderHeightPx = Math.max(
      16,
      Math.min(
        totalMinimapHeight,
        (effectiveClientHeight / effectiveScrollHeight) * totalMinimapHeight,
      ),
    )
    const maxSliderTravel = totalMinimapHeight - sliderHeightPx
    sliderTopPx = maxSliderTravel > 0 ? scrollRatio * maxSliderTravel : 0
  }

  // Windowing for smooth 60fps rendering across large files
  const bufferLines = 15
  const visibleStart = Math.max(
    0,
    Math.floor(minimapOffsetY / scaleConfig.lineHeight) - bufferLines,
  )
  const visibleEnd = Math.min(
    lines.length,
    Math.ceil(
      (minimapOffsetY + effectiveClientHeight) / scaleConfig.lineHeight,
    ) + bufferLines,
  )

  const topPadding = visibleStart * scaleConfig.lineHeight
  const bottomPadding = (lines.length - visibleEnd) * scaleConfig.lineHeight
  const visibleLines = lines.slice(visibleStart, visibleEnd)
  const tokenCacheRef = useRef<Map<number, RawSyntaxToken[]>>(new Map())
  const [, setTokenVersion] = useState(0)

  // Asynchronously request tokens for visible lines not yet in tokenCacheRef
  useEffect(() => {
    const missingLineIndices: number[] = []
    const missingLineTexts: string[] = []

    for (let i = 0; i < visibleLines.length; i++) {
      const lineIdx = visibleStart + i
      if (
        !tokenCacheRef.current.has(lineIdx) &&
        visibleLines[i]?.trim().length > 0
      ) {
        missingLineIndices.push(lineIdx)
        missingLineTexts.push(visibleLines[i])
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
          tokenCacheRef.current.set(missingLineIndices[j], res.tokens[j])
        }
        setTokenVersion((v) => v + 1)
      })
      .catch(() => {
        // Aborted or fallback
      })

    return () => {
      controller.abort()
    }
  }, [visibleStart, visibleEnd, visibleLines, lines])

  const isDraggingRef = useRef(false)

  const scrollToPointer = (clientY: number, smooth: boolean) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const clickY = clientY - rect.top
    const totalY = clickY + minimapOffsetY
    const targetLine = Math.floor(totalY / scaleConfig.lineHeight)
    onScrollToLine(Math.max(0, Math.min(lines.length - 1, targetLine)), smooth)
  }

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
      <div
        className="minimap-slider"
        style={{
          top: `${sliderTopPx}px`,
          height: `${sliderHeightPx}px`,
        }}
      />
      <div
        className="minimap-content"
        style={{
          transform: `translateY(-${minimapOffsetY}px)`,
          paddingTop: `${topPadding}px`,
          paddingBottom: `${bottomPadding}px`,
        }}
      >
        {visibleLines.map((lineText, idx) => {
          const actualLineIdx = visibleStart + idx
          const cachedTokens = tokenCacheRef.current.get(actualLineIdx)

          return (
            <div
              className="minimap-line"
              key={actualLineIdx}
              style={{
                height: `${scaleConfig.lineHeight}px`,
                lineHeight: `${scaleConfig.lineHeight}px`,
                fontSize: `${scaleConfig.fontSize}px`,
              }}
            >
              {!lineText ? (
                "\u00a0"
              ) : cachedTokens ? (
                cachedTokens.map((tok, tIdx) =>
                  tok.className ? (
                    <span className={tok.className} key={tIdx}>
                      {tok.text}
                    </span>
                  ) : (
                    tok.text
                  ),
                )
              ) : (
                <span
                  className="minimap-skeleton-bar"
                  style={{
                    width: `${Math.min(100, Math.max(15, lineText.trim().length * 4))}%`,
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})
