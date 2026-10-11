import { useRef, type MouseEvent } from "react"
import { tokenizeLine } from "../../../utils/syntax"
import type { MinimapScale } from "../../../types/workbench"

interface MinimapProps {
  lines: string[]
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  onScrollToLine: (lineIndex: number) => void
  scale?: MinimapScale
}

export function Minimap({
  lines,
  scrollTop,
  scrollHeight,
  clientHeight,
  onScrollToLine,
  scale = "medium",
}: MinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const scaleConfig = {
    small: { fontSize: 3.5, lineHeight: 5, width: 78 },
    medium: { fontSize: 4.5, lineHeight: 6.5, width: 88 },
    large: { fontSize: 6, lineHeight: 8.5, width: 100 },
  }[scale] || { fontSize: 4.5, lineHeight: 6.5, width: 88 }

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

  // Calculate viewport slider box position in percentage
  const sliderHeightPercent = Math.min(
    100,
    Math.max(8, (effectiveClientHeight / effectiveScrollHeight) * 100),
  )
  const sliderTopPercent = (scrollTop / effectiveScrollHeight) * 100

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

  function handleMinimapClick(e: MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const clickY = e.clientY - rect.top

    let targetLine = 0
    if (isOverflowing) {
      const totalY = clickY + minimapOffsetY
      targetLine = Math.floor(totalY / scaleConfig.lineHeight)
    } else {
      const ratio = Math.max(0, Math.min(1, clickY / rect.height))
      targetLine = Math.floor(ratio * lines.length)
    }

    onScrollToLine(Math.max(0, Math.min(lines.length - 1, targetLine)))
  }

  return (
    <div
      aria-hidden="true"
      className={`minimap-container minimap-scale-${scale}`}
      onClick={handleMinimapClick}
      ref={containerRef}
      style={{ width: `${scaleConfig.width}px` }}
      title="Minimap: Click to navigate"
    >
      <div
        className="minimap-slider"
        style={{
          top: `${sliderTopPercent}%`,
          height: `${sliderHeightPercent}%`,
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
              {lineText ? tokenizeLine(lineText) : "\u00a0"}
            </div>
          )
        })}
      </div>
    </div>
  )
}
