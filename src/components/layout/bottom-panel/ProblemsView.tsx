import { Icon } from "../../ui/Icon";
import { useWorkbench } from "../../../context/WorkbenchContext";

export function ProblemsView() {
  const { diagnostics, showToast } = useWorkbench();

  return (
    <div className="problems-list">
      {diagnostics.map((diag) => (
        <button
          key={diag.id}
          onClick={() => showToast(`Navigating to ${diag.location}`)}
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
      ))}
    </div>
  );
}
