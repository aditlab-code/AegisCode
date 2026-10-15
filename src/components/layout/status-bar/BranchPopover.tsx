import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"

interface BranchPopoverProps {
  onClose: () => void
}

export function BranchPopover({ onClose }: BranchPopoverProps) {
  const {
    activeBranch,
    checkoutBranch,
    createBranch,
    gitBranches,
    gitChanges,
    stagedChanges,
    ahead,
    behind,
  } = useWorkbenchStore(
    useShallow((s) => ({
      activeBranch: s.activeBranch,
      checkoutBranch: s.checkoutBranch,
      createBranch: s.createBranch,
      gitBranches: s.gitBranches,
      gitChanges: s.gitChanges,
      stagedChanges: s.stagedChanges,
      ahead: s.ahead,
      behind: s.behind,
    })),
  )

  const [filter, setFilter] = useState("")
  const [creating, setCreating] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")

  const branches =
    gitBranches.length > 0
      ? gitBranches
      : [{ name: activeBranch || "main", isHead: true, isRemote: false }]

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(filter.toLowerCase()),
  )

  const modifiedCount = gitChanges.length + stagedChanges.length

  function handleCreateBranch() {
    const trimmed = newBranchName.trim()
    if (!trimmed) return
    createBranch(trimmed, true)
    onClose()
  }

  return (
    <div className="status-popover branch-popover">
      <div className="status-popover-header">
        <span>SWITCH BRANCH</span>
        <strong>{activeBranch || "main"}</strong>
      </div>

      {/* Filter / Search input */}
      <div className="branch-filter-container">
        <input
          autoFocus
          className="branch-filter-input"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter or search branch..."
          value={filter}
        />
      </div>

      {/* Branch list */}
      <div className="branch-list">
        {filteredBranches.map((b) => (
          <button
            className={`branch-item ${
              activeBranch === b.name ? "popover-row-active" : ""
            }`}
            key={b.name}
            onClick={() => {
              if (activeBranch !== b.name) {
                checkoutBranch(b.name)
              }
              onClose()
            }}
            type="button"
          >
            <Icon name="branch" size={13} />
            <span className="truncate flex-1">{b.name}</span>
            {activeBranch === b.name && (
              <span className="branch-badge-current">current</span>
            )}
            {b.isRemote && <span className="branch-badge-remote">remote</span>}
          </button>
        ))}

        {filteredBranches.length === 0 && (
          <div className="branch-empty">No matching branch</div>
        )}
      </div>

      {/* Create new branch section */}
      <div className="branch-create-section">
        {creating ? (
          <div className="branch-create-form">
            <input
              autoFocus
              className="branch-create-input"
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateBranch()
                if (e.key === "Escape") setCreating(false)
              }}
              placeholder="New branch name..."
              value={newBranchName}
            />
            <button
              className="branch-create-submit"
              onClick={handleCreateBranch}
              type="button"
            >
              OK
            </button>
          </div>
        ) : (
          <button
            className="branch-create-trigger"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Icon name="plus" size={12} />
            <span>Create new branch...</span>
          </button>
        )}
      </div>

      {/* Real metadata footer */}
      <div className="branch-meta">
        <span>
          {modifiedCount} modified file{modifiedCount === 1 ? "" : "s"}
        </span>
        <span>
          {ahead} ahead · {behind} behind
        </span>
      </div>
    </div>
  )
}
