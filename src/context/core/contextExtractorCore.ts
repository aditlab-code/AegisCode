import type { ContextItem } from "../../types/workbench"

export const MAX_CONTEXT_CHARS = 50_000

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

export const DEFAULT_EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/target/**",
  "**/.DS_Store",
  "**/*.log",
  "**/*.lock",
]

/**
 * Checks if a given file path matches any exclusion patterns (glob-style or standard substring).
 */
export function isPathExcluded(
  path: string,
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS,
): boolean {
  if (!path) return false
  const normalized = path.replace(/\\/g, "/")

  for (const pattern of excludePatterns) {
    if (pattern.includes("*.")) {
      const ext = pattern.slice(pattern.indexOf("*.") + 1)
      if (normalized.endsWith(ext)) {
        return true
      }
      continue
    }
    const cleanPattern = pattern
      .replace(/\\/g, "")
      .replace(/\*\*/g, "")
      .replace(/^\/|\/$/g, "")
    if (cleanPattern && normalized.includes(cleanPattern)) {
      return true
    }
  }
  return false
}

export interface ContextSelectionRange {
  startLine: number
  endLine: number
}

export interface ExtractContextParams {
  path: string
  content: string
  selectedText?: string
  selectionRange?: ContextSelectionRange
  excludePatterns?: string[]
  mode?: "selection" | "full"
}

/**
 * Extracts a normalized, guardrailed ContextItem from active editor buffer and selection.
 */
export function extractEditorContext({
  path,
  content,
  selectedText,
  selectionRange,
  excludePatterns = DEFAULT_EXCLUDE_PATTERNS,
  mode,
}: ExtractContextParams): ContextItem | null {
  if (!path || !content) return null
  if (isPathExcluded(path, excludePatterns)) return null

  const hasSelection = Boolean(selectedText && selectedText.trim().length > 0)
  const effectiveMode = mode ?? (hasSelection ? "selection" : "full")

  if (effectiveMode === "selection" && hasSelection && selectedText) {
    const rawText = selectedText
    const isTruncated = rawText.length > MAX_CONTEXT_CHARS
    const safeContent = isTruncated
      ? rawText.slice(0, MAX_CONTEXT_CHARS)
      : rawText
    const lineRangeStr = selectionRange
      ? selectionRange.startLine === selectionRange.endLine
        ? `Ln ${selectionRange.startLine}`
        : `Ln ${selectionRange.startLine}–${selectionRange.endLine}`
      : undefined

    return {
      id: `ctx-${path}-selection`,
      type: "selection",
      path,
      lineRange: lineRangeStr,
      content: safeContent,
      charCount: safeContent.length,
      estimatedTokens: estimateTokens(safeContent),
      isTruncated,
      mode: "selection",
    }
  }

  // Full file buffer extraction
  const isTruncated = content.length > MAX_CONTEXT_CHARS
  const safeContent = isTruncated
    ? content.slice(0, MAX_CONTEXT_CHARS)
    : content

  return {
    id: `ctx-${path}-full`,
    type: "file",
    path,
    content: safeContent,
    charCount: safeContent.length,
    estimatedTokens: estimateTokens(safeContent),
    isTruncated,
    mode: "full",
  }
}

/**
 * Builds a manual file mention ContextItem (from @filename in composer).
 */
export function buildMentionContextItem(
  path: string,
  content: string,
): ContextItem | null {
  if (!path || !content) return null
  if (isPathExcluded(path)) return null

  const isTruncated = content.length > MAX_CONTEXT_CHARS
  const safeContent = isTruncated
    ? content.slice(0, MAX_CONTEXT_CHARS)
    : content

  return {
    id: `ctx-${path}-mention`,
    type: "file",
    path,
    content: safeContent,
    charCount: safeContent.length,
    estimatedTokens: estimateTokens(safeContent),
    isTruncated,
    mode: "full",
  }
}
