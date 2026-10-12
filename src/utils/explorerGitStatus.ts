import type { GitChange } from "../types/workbench"

export interface ExplorerGitBadge {
  code: string
  colorClass: string
  title: string
}

export interface ExplorerGitDecorations {
  gitStatusMap: Map<string, ExplorerGitBadge>
  dirtyFoldersSet: Set<string>
}

/**
 * Normalizes a file or directory path by trimming whitespace,
 * replacing backslashes with forward slashes, and removing leading/trailing slashes.
 */
export function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "")
}

/**
 * Maps a single Git change into a badge representation.
 */
export function mapGitChangeToBadge(change: GitChange): ExplorerGitBadge {
  let code = (change.code || "M").toUpperCase()
  if (code === "?") {
    code = "U"
  }

  let colorClass = "text-warning"
  let title = "Modified"

  if (code === "U" || code === "A") {
    colorClass = "text-success"
    title = code === "A" ? "Added (Staged)" : "Untracked"
  } else if (code === "D") {
    colorClass = "text-error"
    title = "Deleted"
  } else if (code === "R") {
    colorClass = "text-accent"
    title = "Renamed"
  } else if (code === "C") {
    colorClass = "text-accent"
    title = "Copied"
  }

  return { code, colorClass, title }
}

/**
 * Builds a fast lookup map for file Git status badges and a set of ancestor folders
 * that contain modified, added, deleted, or untracked files.
 */
export function buildExplorerGitDecorations(
  stagedChanges: GitChange[] = [],
  unstagedChanges: GitChange[] = [],
): ExplorerGitDecorations {
  const gitStatusMap = new Map<string, ExplorerGitBadge>()
  const dirtyFoldersSet = new Set<string>()

  // Unstaged changes take precedence over staged in visual representation
  const allChanges = [...unstagedChanges, ...stagedChanges]

  for (const change of allChanges) {
    const rawFile = change.file || ""
    const cleanPath = normalizePath(rawFile)
    if (!cleanPath) continue

    if (!gitStatusMap.has(cleanPath)) {
      gitStatusMap.set(cleanPath, mapGitChangeToBadge(change))
    }

    // Add ancestor folder paths
    const segments = cleanPath.split("/")
    segments.pop() // remove file name
    let current = ""
    for (const segment of segments) {
      current = current ? `${current}/${segment}` : segment
      dirtyFoldersSet.add(current)
    }
  }

  return { gitStatusMap, dirtyFoldersSet }
}
