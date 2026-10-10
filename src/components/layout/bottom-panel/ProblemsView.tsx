import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function ProblemsView() {
  const {
    diagnostics,
    navigateToDiagnostic,
    panelMaximized,
    sendChatMessage,
    setChatOpen,
    showToast,
  } = useWorkbench()
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

      {panelMaximized ? (
        <div className="problems-table-container">
          <table className="problems-table">
            <thead>
              <tr>
                <th style={{ width: "95px" }}>Severity</th>
                <th>Message</th>
                <th style={{ width: "160px" }}>File</th>
                <th style={{ width: "110px" }}>Location</th>
                <th style={{ width: "120px" }}>Source</th>
                <th style={{ width: "100px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDiagnostics.length === 0 ? (
                <tr>
                  <td className="empty-problems text-muted" colSpan={6}>
                    No problems found in workspace.
                  </td>
                </tr>
              ) : (
                filteredDiagnostics.map((diag) => {
                  const locationParts = diag.location.split(":")
                  const filename = locationParts[0] || diag.location
                  const lineCol =
                    locationParts.length > 1
                      ? `Ln ${locationParts[1]}, Col ${locationParts[2] || 1}`
                      : "Ln 1, Col 1"
                  return (
                    <tr
                      className="problems-table-row"
                      key={diag.id}
                      onClick={() => navigateToDiagnostic(diag)}
                    >
                      <td>
                        <span
                          className={`severity-badge severity-${diag.type}`}
                        >
                          <Icon
                            name={diag.type === "error" ? "error" : "warning"}
                            size={12}
                          />
                          <span>
                            {diag.type === "error" ? "Error" : "Warning"}
                          </span>
                        </span>
                      </td>
                      <td className="problem-message-cell">
                        <strong>{diag.title}</strong>
                      </td>
                      <td className="problem-file-cell">{filename}</td>
                      <td className="problem-loc-cell">{lineCol}</td>
                      <td>
                        <span className="source-tag">{diag.source}</span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          className="problems-ask-ai-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            sendChatMessage(
                              `Help me fix this ${diag.type} in ${filename} at ${lineCol}: ${diag.title}`,
                            )
                            setChatOpen(true)
                            showToast("Sent diagnostic to Aegis AI")
                          }}
                          title="Ask Aegis AI to fix this problem"
                          type="button"
                        >
                          <Icon name="aegis" size={12} />
                          <span>Ask AI</span>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
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
      )}
    </div>
  )
}
