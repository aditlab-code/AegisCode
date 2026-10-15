import { useState, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import {
  fetchWorkspaceIndexStats,
  type WorkspaceIndexStats,
} from "../../../utils/workspaceApi"
import { useWorkbenchStore } from "../../../store"

export function IndexStatusPill() {
  const serverConnected = useWorkbenchStore((s) => s.serverConnected)
  const rootWorkspacePath = useWorkbenchStore((s) => s.rootWorkspacePath)
  const [stats, setStats] = useState<WorkspaceIndexStats | null>(null)

  useEffect(() => {
    if (!serverConnected || !rootWorkspacePath) {
      setStats(null)
      return
    }

    let isMounted = true
    async function loadStats() {
      try {
        const data = await fetchWorkspaceIndexStats()
        if (isMounted) setStats(data)
      } catch {
        // Graceful fallback
      }
    }

    void loadStats()
    const interval = setInterval(loadStats, 10000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [serverConnected, rootWorkspacePath])

  if (!stats || stats.status === "unindexed" || stats.totalFiles === 0) {
    return null
  }

  const isIndexing = stats.status === "indexing"

  return (
    <span
      className="status-item cursor-default flex items-center gap-1.5 text-[11px] text-ink-muted select-none"
      title={`Workspace In-Memory Index: ${stats.totalFiles.toLocaleString()} files indexed in ${stats.indexDurationMs}ms (Polite multi-core allocation)`}
    >
      <Icon
        name={isIndexing ? "refresh" : "search"}
        size={11}
        className={isIndexing ? "animate-spin text-accent" : "text-ink-muted"}
      />
      <span>
        {isIndexing
          ? "Indexing..."
          : `${stats.totalFiles.toLocaleString()} files`}
      </span>
    </span>
  )
}
