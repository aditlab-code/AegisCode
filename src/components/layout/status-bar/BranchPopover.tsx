import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

interface BranchPopoverProps {
  onClose: () => void
}

export function BranchPopover({ onClose }: BranchPopoverProps) {
  const { activeBranch, setActiveBranch } = useWorkbench()
  const branches = ["main", "feature/editor-split", "develop"]

  return (
    <div className="status-popover branch-popover">
      <div className="status-popover-header">
        <span>ACTIVE BRANCH</span>
        <strong>{activeBranch}</strong>
      </div>
      {branches.map((name) => (
        <button
          className={activeBranch === name ? "popover-row-active" : ""}
          key={name}
          onClick={() => {
            setActiveBranch(name)
            onClose()
          }}
          type="button"
        >
          <Icon name="branch" size={14} />
          <span>{name}</span>
          {activeBranch === name && <small>current</small>}
        </button>
      ))}
      <div className="branch-meta">2 modified files · 0 ahead · 0 behind</div>
    </div>
  )
}
