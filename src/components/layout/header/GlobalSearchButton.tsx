import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function GlobalSearchButton() {
  const { setCommandPaletteOpen, rootWorkspaceName } = useWorkbench()

  return (
    <button
      className="command-search"
      onClick={() => setCommandPaletteOpen(true)}
      title={
        rootWorkspaceName ? `Active Workspace: ${rootWorkspaceName}` : undefined
      }
      type="button"
    >
      <Icon name="search" size={14} />
      <span className="truncate">
        {rootWorkspaceName ? (
          <>
            <strong className="font-semibold text-[var(--color-ink)] mr-1">
              {rootWorkspaceName}
            </strong>
            <span className="text-[var(--color-ink-muted)]">— Search...</span>
          </>
        ) : (
          "Search files, commands, symbols..."
        )}
      </span>
      <kbd>⌘ K</kbd>
    </button>
  )
}
