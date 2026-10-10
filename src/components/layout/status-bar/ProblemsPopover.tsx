import { Icon } from "../../ui/Icon";
import { useWorkbench } from "../../../context/WorkbenchContext";

export function ProblemsPopover() {
  const { diagnostics, activeLanguage } = useWorkbench();
  const errorCount = diagnostics.filter((d) => d.type === "error").length;
  const warningCount = diagnostics.filter((d) => d.type === "warning").length;

  return (
    <div className="status-popover problem-popover">
      <div className="status-popover-header">
        <span>PROBLEMS</span>
        <strong>{diagnostics.length} total</strong>
      </div>
      {diagnostics.map((diag) => (
        <button key={diag.id} type="button">
          <Icon
            name={diag.type === "error" ? "error" : "warning"}
            size={14}
          />
          <span>
            <strong>{diag.title}</strong>
            <small>{diag.location}</small>
          </span>
        </button>
      ))}
      <div className="problem-summary">
        <span className="syntax-pink">{errorCount} error</span>
        <span className="syntax-orange">{warningCount} warning</span>
        <span>{activeLanguage}</span>
      </div>
    </div>
  );
}
