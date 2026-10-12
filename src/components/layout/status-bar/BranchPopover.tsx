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
      <div className="p-1.5 border-b border-[var(--color-line)]">
        <input
          autoFocus
          className="w-full px-2 py-1 rounded bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-accent)]"
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter or search branch..."
          value={filter}
        />
      </div>

      {/* Branch list */}
      <div className="max-h-48 overflow-y-auto py-1">
        {filteredBranches.map((b) => (
          <button
            className={activeBranch === b.name ? "popover-row-active" : ""}
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
            <span className="truncate">{b.name}</span>
            {activeBranch === b.name && <small>current</small>}
            {b.isRemote && <small className="opacity-60">remote</small>}
          </button>
        ))}

        {filteredBranches.length === 0 && (
          <div className="px-3 py-2 text-xs text-[var(--color-ink-muted)] text-center">
            No matching branch
          </div>
        )}
      </div>

      {/* Create new branch section */}
      <div className="p-1.5 border-t border-[var(--color-line)]">
        {creating ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              className="flex-1 px-2 py-1 rounded bg-[var(--color-canvas)] border border-[var(--color-line)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
              onChange={(e) => setNewBranchName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateBranch()
                if (e.key === "Escape") setCreating(false)
              }}
              placeholder="New branch name..."
              value={newBranchName}
            />
            <button
              className="px-2 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer"
              onClick={handleCreateBranch}
              type="button"
            >
              OK
            </button>
          </div>
        ) : (
          <button
            className="w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded hover:bg-[var(--color-surface-hover)] text-xs text-[var(--color-ink-soft)] font-medium transition-colors cursor-pointer"
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
        {modifiedCount} modified file{modifiedCount === 1 ? "" : "s"} · {ahead}{" "}
        ahead · {behind} behind
      </div>
    </div>
  )
}
