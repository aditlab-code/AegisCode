import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function ProblemsView() {
  const { diagnostics, navigateToDiagnostic } = useWorkbench()
  const [filter, setFilter] = useState<"all" | "error" | "warning">("all")

  const errorCount = diagnostics.filter((d) => d.type === "error").length
  const warningCount = diagnostics.filter((d) => d.type === "warning").length

  const filteredDiagnostics = diagnostics.filter((diag) => {
    if (filter === "error") return diag.type === "error"
    if (filter === "warning") return diag.type === "warning"
    return true
  })

  return (
    <div className="problems-container">
      <div className="problems-filter-bar">
        <button
          className={`filter-chip ${
            filter === "all" ? "filter-chip-active" : ""
          }`}
          onClick={() => setFilter("all")}
          type="button"
        >
          All ({diagnostics.length})
        </button>
        <button
          className={`filter-chip ${
            filter === "error" ? "filter-chip-active" : ""
          }`}
          onClick={() => setFilter("error")}
          type="button"
        >
          <Icon name="error" size={12} />
          Errors ({errorCount})
        </button>
        <button
          className={`filter-chip ${
            filter === "warning" ? "filter-chip-active" : ""
          }`}
          onClick={() => setFilter("warning")}
          type="button"
        >
          <Icon name="warning" size={12} />
          Warnings ({warningCount})
        </button>
      </div>

      <div className="problems-list">
        {filteredDiagnostics.length === 0 ? (
          <p className="empty-problems text-muted">
            No problems found in workspace.
          </p>
        ) : (
          filteredDiagnostics.map((diag) => (
            <button
              key={diag.id}
              onClick={() => navigateToDiagnostic(diag)}
              type="button"
            >
              <Icon
                name={diag.type === "error" ? "error" : "warning"}
                size={14}
              />
              <span>
                <strong>{diag.title}</strong>
                <small>
                  {diag.source} · {diag.location}
                </small>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
