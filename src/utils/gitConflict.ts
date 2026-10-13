export interface ConflictRegion {
  id: string
  startLine: number // 1-indexed line containing <<<<<<<
  separatorLine: number // 1-indexed line containing =======
  endLine: number // 1-indexed line containing >>>>>>>
  currentBranch: string
  incomingBranch: string
  currentContent: string
  incomingContent: string
}

export type ConflictResolutionChoice = "current" | "incoming" | "both"

const CONFLICT_START_RE = /^<{7}\s*(.*)$/
const CONFLICT_SEP_RE = /^={7}\s*$/
const CONFLICT_END_RE = /^>{7}\s*(.*)$/

/**
 * Fast detection of Git merge conflict markers (<<<<<<<, =======, >>>>>>>).
 */
export function hasConflictMarkers(content?: string): boolean {
  if (!content || !content.includes("<<<<<<<")) {
    return false
  }
  return parseConflictRegions(content).length > 0
}

/**
 * Scans document text for Git merge conflict markers (<<<<<<<, =======, >>>>>>>).
 */
export function parseConflictRegions(content: string): ConflictRegion[] {
  if (!content || !content.includes("<<<<<<<")) {
    return []
  }

  const lines = content.split("\n")
  const regions: ConflictRegion[] = []

  let inConflict = false
  let startLine = -1
  let separatorLine = -1
  let currentBranch = ""
  let incomingBranch = ""
  let currentLines: string[] = []
  let incomingLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1
    const line = lines[i]

    if (!inConflict) {
      const startMatch = line.match(CONFLICT_START_RE)
      if (startMatch) {
        inConflict = true
        startLine = lineNum
        currentBranch = startMatch[1]?.trim() || "HEAD"
        separatorLine = -1
        currentLines = []
        incomingLines = []
      }
    } else {
      if (separatorLine === -1) {
        if (CONFLICT_SEP_RE.test(line)) {
          separatorLine = lineNum
        } else {
          currentLines.push(line)
        }
      } else {
        const endMatch = line.match(CONFLICT_END_RE)
        if (endMatch) {
          incomingBranch = endMatch[1]?.trim() || "incoming"
          regions.push({
            id: `conflict-${startLine}-${lineNum}`,
            startLine,
            separatorLine,
            endLine: lineNum,
            currentBranch,
            incomingBranch,
            currentContent: currentLines.join("\n"),
            incomingContent: incomingLines.join("\n"),
          })
          inConflict = false
          startLine = -1
          separatorLine = -1
          currentLines = []
          incomingLines = []
        } else {
          incomingLines.push(line)
        }
      }
    }
  }

  return regions
}

/**
 * Resolves a single conflict region inside content, replacing the conflict block with chosen content.
 */
export function resolveConflict(
  content: string,
  region: ConflictRegion,
  choice: ConflictResolutionChoice,
): string {
  const lines = content.split("\n")
  const startIdx = region.startLine - 1
  const endIdx = region.endLine - 1

  let replacement: string
  switch (choice) {
    case "current":
      replacement = region.currentContent
      break
    case "incoming":
      replacement = region.incomingContent
      break
    case "both":
      if (region.currentContent && region.incomingContent) {
        replacement = `${region.currentContent}\n${region.incomingContent}`
      } else {
        replacement = region.currentContent || region.incomingContent
      }
      break
  }

  const replacementLines = replacement ? replacement.split("\n") : []
  lines.splice(startIdx, endIdx - startIdx + 1, ...replacementLines)
  return lines.join("\n")
}
