import { useEffect, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { fetchActiveFileGraph } from "../../../utils/codegraphApi"
import type { DiagnosticItem } from "../../../types/workbench"

export interface HoverPosition {
  x: number
  y: number
}

interface DiagnosticHoverCardProps {
  diagnostic: DiagnosticItem
  position: HoverPosition
  onClose: () => void
}

export function DiagnosticHoverCard({
  diagnostic,
  position,
  onClose,
}: DiagnosticHoverCardProps) {
  const {
    setActiveBottomTab,
    setPanelOpen,
    sendChatMessage,
    setChatOpen,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      setActiveBottomTab: s.setActiveBottomTab,
      setPanelOpen: s.setPanelOpen,
      sendChatMessage: s.sendChatMessage,
      setChatOpen: s.setChatOpen,
      showToast: s.showToast,
    })),
  )

  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose])

  function handleViewInProblems() {
    setActiveBottomTab("Problems")
    setPanelOpen(true)
    onClose()
    showToast(`Inspecting ${diagnostic.title} in Problems view`)
  }

  async function handleAskAi() {
    setChatOpen(true)
    onClose()
    const colonMatch = diagnostic.location.match(/^(.*?):(\d+)/)
    const file = colonMatch ? colonMatch[1].trim() : diagnostic.location
    const lineNum = colonMatch ? parseInt(colonMatch[2], 10) : 0

    let cgContext = ""
    if (file && lineNum > 0) {
      try {
        const graph = await fetchActiveFileGraph(file)
        const sym = graph?.nodes.find(
          (n) => lineNum >= n.lineStart && lineNum <= n.lineEnd,
        )
        if (sym) {
          cgContext = `\nCodeGraph Symbol: ${sym.kind} \`${sym.name}\` (L${sym.lineStart}-L${sym.lineEnd})${
            sym.signature ? ` — \`${sym.signature}\`` : ""
          }`
        }
      } catch {
        // ignore if unavailable
      }
    }

    sendChatMessage(
      `Diagnose and fix this ${diagnostic.type} at ${diagnostic.location}: "${diagnostic.title}" (${diagnostic.source || "linter"}).${cgContext}\nPlease provide a ready-to-apply code block with \`\`\`lang:${file}.`,
    )
  }

  const isError = diagnostic.type === "error"

  return (
    <div
      className="diagnostic-hover-card"
      ref={cardRef}
      style={{
        left: `${Math.max(10, Math.min(window.innerWidth - 340, position.x))}px`,
        top: `${Math.max(10, position.y)}px`,
      }}
    >
      <div className="hover-card-header">
        <div className="hover-card-badge-row">
          <span
            className={`diag-badge ${
              isError ? "diag-badge-error" : "diag-badge-warning"
            }`}
          >
            <Icon name={isError ? "error" : "warning"} size={12} />
            <span>{isError ? "Error" : "Warning"}</span>
          </span>
          <span className="diag-source">[{diagnostic.source || "lint"}]</span>
        </div>

        <button
          aria-label="Close diagnostic card"
          className="hover-card-close-btn"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" size={11} />
        </button>
      </div>

      <div className="hover-card-body">
        <p className="diag-message">{diagnostic.title}</p>
        <span className="diag-location">{diagnostic.location}</span>
      </div>

      <div className="hover-card-actions">
        <button
          className="hover-action-btn action-problems"
          onClick={handleViewInProblems}
          type="button"
        >
          <Icon name="panel" size={11} />
          <span>View in Problems</span>
        </button>
        <button
          className="hover-action-btn action-ai"
          onClick={handleAskAi}
          type="button"
        >
          <Icon name="aegis" size={12} />
          <span>Ask Aegis AI</span>
        </button>
      </div>
    </div>
  )
}
