import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

interface ProblemsPopoverProps {
  onClose?: () => void
}

export function ProblemsPopover({ onClose }: ProblemsPopoverProps) {
  const { diagnostics, activeLanguage, navigateToDiagnostic } = useWorkbench()
  const errorCount = diagnostics.filter((d) => d.type === "error").length
  const warningCount = diagnostics.filter((d) => d.type === "warning").length

  return (
    <div className="status-popover problem-popover">
      <div className="status-popover-header">
        <span>PROBLEMS</span>
        <strong>{diagnostics.length} total</strong>
      </div>
      {diagnostics.length === 0 ? (
        <div className="notification-empty">
          <Icon name="check" size={20} />
          <span>No problems detected</span>
          <small>No errors or warnings in current files</small>
        </div>
      ) : (
        diagnostics.map((diag) => (
          <button
            key={diag.id}
            onClick={() => {
              navigateToDiagnostic(diag)
              onClose?.()
            }}
            type="button"
          >
            <Icon
              name={diag.type === "error" ? "error" : "warning"}
              size={14}
            />
            <span>
              <strong>{diag.title}</strong>
              <small>{diag.location}</small>
            </span>
          </button>
        ))
      )}
      <div className="problem-summary">
        <span className="syntax-pink">{errorCount} error</span>
        <span className="syntax-orange">{warningCount} warning</span>
        <span>{activeLanguage}</span>
      </div>
    </div>
  )
}
