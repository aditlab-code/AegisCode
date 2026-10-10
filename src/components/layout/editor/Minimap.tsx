import { useRef, type MouseEvent } from "react"

interface MinimapProps {
  lines: string[]
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  onScrollToLine: (lineIndex: number) => void
}

interface MinimapToken {
  width: number
  colorClass: string
}

function getLineTokens(lineText: string): MinimapToken[] {
  const trimmed = lineText.trim()
  if (!trimmed) return []

  const tokens: MinimapToken[] = []
  const words = trimmed.split(/\s+/)

  words.slice(0, 7).forEach((word) => {
    let colorClass = "syntax-blue"
    if (
      /^(import|export|from|return|function|const|let|var|class|interface|type|async|await|default|if|else)$/.test(
        word,
      )
    ) {
      colorClass = "syntax-pink"
    } else if (/^(['"`].*['"`]|true|false|\d+)$/.test(word)) {
      colorClass = "syntax-green"
    } else if (
      word.startsWith("//") ||
      word.startsWith("/*") ||
      word.startsWith("*")
    ) {
      colorClass = "text-muted"
    } else if (/^[A-Z][a-zA-Z0-9]*$/.test(word)) {
      colorClass = "syntax-yellow"
    }

    const width = Math.min(26, Math.max(4, word.length * 1.8))
    tokens.push({ width, colorClass })
  })

  return tokens
}

export function Minimap({
  lines,
  scrollTop,
  scrollHeight,
  clientHeight,
  onScrollToLine,
}: MinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  const effectiveScrollHeight = Math.max(1, scrollHeight)
  const effectiveClientHeight = Math.max(1, clientHeight)

  // Calculate viewport slider box position in percentage
  const sliderTopPercent = (scrollTop / effectiveScrollHeight) * 100
  const sliderHeightPercent = Math.min(
    100,
    Math.max(8, (effectiveClientHeight / effectiveScrollHeight) * 100),
  )

  function handleMinimapClick(e: MouseEvent<HTMLDivElement>) {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const clickY = e.clientY - rect.top
    const ratio = Math.max(0, Math.min(1, clickY / rect.height))
    const targetLine = Math.floor(ratio * lines.length)
    onScrollToLine(targetLine)
  }

  return (
    <div
      aria-hidden="true"
      className="minimap-container"
      onClick={handleMinimapClick}
      ref={containerRef}
      title="Minimap: Click to navigate"
    >
      <div
        className="minimap-slider"
        style={{
          top: `${sliderTopPercent}%`,
          height: `${sliderHeightPercent}%`,
        }}
      />
      <div className="minimap-content">
        {lines.slice(0, 250).map((lineText, idx) => {
          const indent = lineText.search(/\S/)
          const indentPx = indent > 0 ? Math.min(18, indent * 2) : 0
          const tokens = getLineTokens(lineText)

          return (
            <div
              className="minimap-line"
              key={idx}
              style={{ paddingLeft: `${indentPx}px` }}
            >
              {tokens.length === 0 ? (
                <span className="minimap-empty-bar" />
              ) : (
                tokens.map((token, tIdx) => (
                  <span
                    className={`minimap-token ${token.colorClass}`}
                    key={tIdx}
                    style={{ width: `${token.width}px` }}
                  />
                ))
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
