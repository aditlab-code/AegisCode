import { useState, useEffect, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { tokenizeLine } from "../../../utils/syntax"
import { MermaidPreviewModal } from "./MermaidPreviewModal"

interface MermaidBlockProps {
  code: string
  unclosed?: boolean
  isStreaming?: boolean
  onCopy: (code: string) => void
}

export function MermaidBlock({
  code,
  unclosed,
  isStreaming,
  onCopy,
}: MermaidBlockProps) {
  const [svgContent, setSvgContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<"diagram" | "code">("diagram")
  const [copied, setCopied] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const renderSeq = useRef(0)

  const handleCopy = () => {
    onCopy(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Strictly prevent rendering while streaming or unclosed to eliminate DOM collision
  useEffect(() => {
    if (unclosed || isStreaming) {
      setSvgContent(null)
      setError(null)
      setLoading(false)
      return
    }

    const trimmed = code.trim()
    if (!trimmed) {
      setSvgContent(null)
      setError(null)
      setLoading(false)
      return
    }

    const currentSeq = ++renderSeq.current
    setLoading(true)
    setError(null)

    let isCancelled = false
    const uniqueId = `mermaid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

    // On-demand code splitting: only load mermaid and dompurify when needed (ADR 0017)
    Promise.all([import("mermaid"), import("dompurify")])
      .then(async ([m, domPurifyModule]) => {
        if (isCancelled || currentSeq !== renderSeq.current) return
        const mermaid = m.default || m
        const DOMPurify = domPurifyModule.default || domPurifyModule

        try {
          mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "strict",
            suppressErrorRendering: true,
          })

          const { svg } = await mermaid.render(uniqueId, trimmed)
          const sanitizedSvg = DOMPurify.sanitize(svg, {
            USE_PROFILES: { svg: true },
          })
          if (!isCancelled && currentSeq === renderSeq.current) {
            setSvgContent(sanitizedSvg)
            setError(null)
            setLoading(false)
          }
        } catch (err: any) {
          // Clean up any stray DOM nodes inserted by Mermaid into document.body
          try {
            document.getElementById(`d${uniqueId}`)?.remove()
            document.getElementById(uniqueId)?.remove()
          } catch {}

          if (!isCancelled && currentSeq === renderSeq.current) {
            const msg =
              typeof err === "string"
                ? err
                : err?.message || "Invalid Mermaid syntax"
            setError(msg)
            setSvgContent(null)
            setLoading(false)
          }
        }
      })
      .catch((err: any) => {
        if (!isCancelled && currentSeq === renderSeq.current) {
          setError(err?.message || "Failed to load Mermaid module")
          setSvgContent(null)
          setLoading(false)
        }
      })

    return () => {
      isCancelled = true
      try {
        document.getElementById(`d${uniqueId}`)?.remove()
        document.getElementById(uniqueId)?.remove()
      } catch {}
    }
  }, [code, unclosed, isStreaming])

  const lines = code.split("\n")
  const isInterrupted = unclosed && !isStreaming
  const showRaw =
    mode === "code" ||
    Boolean(error) ||
    unclosed ||
    isStreaming ||
    (!svgContent && !loading)

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="markdown-code-lang">MERMAID</span>

          {isStreaming && unclosed && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-accent/15 text-accent border border-accent/30 animate-pulse">
              writing diagram...
            </span>
          )}

          {isInterrupted && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
              interrupted
            </span>
          )}

          {error && (
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-warning/15 text-warning border border-warning/30 truncate max-w-60"
              title={error}
            >
              Mermaid syntax error (raw code)
            </span>
          )}
        </div>

        <div className="markdown-code-actions">
          {svgContent && !error && !unclosed && (
            <>
              <button
                type="button"
                className="markdown-code-action-btn"
                onClick={() => setIsModalOpen(true)}
                title="Fullscreen Preview with Pan & Zoom"
              >
                <Icon name="maximize" size={11} />
                <span>Preview</span>
              </button>
              <button
                type="button"
                className="markdown-code-action-btn"
                onClick={() =>
                  setMode((prev) => (prev === "diagram" ? "code" : "diagram"))
                }
                title={
                  mode === "diagram" ? "View raw Mermaid code" : "View Diagram"
                }
              >
                <Icon name="code" size={11} />
                <span>{mode === "diagram" ? "Code" : "Diagram"}</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="markdown-code-action-btn"
            onClick={handleCopy}
            title="Copy Mermaid code to clipboard"
          >
            <Icon name={copied ? "check" : "copy"} size={11} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>

      {loading && mode === "diagram" && !error && (
        <div className="p-4 flex items-center justify-center gap-2 text-[11px] text-ink-muted">
          <span className="animate-spin inline-block w-3 h-3 border border-accent border-t-transparent rounded-full" />
          <span>Rendering diagram...</span>
        </div>
      )}

      {showRaw ? (
        <pre className="markdown-code-pre">
          <code>
            {isStreaming ? (
              <span className="whitespace-pre-wrap block leading-relaxed">
                {code}
              </span>
            ) : (
              lines.map((line, lineIdx) => (
                <span key={lineIdx} className="block leading-relaxed">
                  {tokenizeLine(line)}
                </span>
              ))
            )}
            {unclosed && isStreaming && <span className="streaming-cursor" />}
          </code>
        </pre>
      ) : (
        <div
          className="mermaid-svg-container p-3 overflow-x-auto flex justify-center items-center bg-canvas max-w-full"
          dangerouslySetInnerHTML={{ __html: svgContent || "" }}
        />
      )}

      {isModalOpen && svgContent && (
        <MermaidPreviewModal
          isOpen={isModalOpen}
          svgContent={svgContent}
          code={code}
          onClose={() => setIsModalOpen(false)}
        />
      )}
    </div>
  )
}
