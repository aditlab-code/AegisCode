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

export const MAX_CONTEXT_BUDGET_TOKENS = 2500

/**
 * Extracts a compact structural outline (~50-200 tokens) of a file to prevent token overload.
 */
export function extractFileOutline(path: string, content: string): string {
  if (!content) return `[File Reference: ${path} (empty)]`
  const lines = content.split("\n")
  const sizeKb = (content.length / 1024).toFixed(1)
  const symbols: string[] = []

  // TypeScript / JavaScript / Go / Python / Rust symbol patterns
  const patterns: RegExp[] = [
    /export\s+(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/g,
    /export\s+class\s+([a-zA-Z0-9_$]+)/g,
    /export\s+interface\s+([a-zA-Z0-9_$]+)/g,
    /export\s+type\s+([a-zA-Z0-9_$]+)/g,
    /export\s+(?:const|let)\s+([a-zA-Z0-9_$]+)/g,
    /export\s+enum\s+([a-zA-Z0-9_$]+)/g,
    /func\s+(?:\([^)]+\)\s+)?([a-zA-Z0-9_]+)\s*\(/g,
    /type\s+([a-zA-Z0-9_]+)\s+(?:struct|interface)/g,
    /def\s+([a-zA-Z0-9_]+)\s*\(/g,
    /class\s+([a-zA-Z0-9_]+)/g,
    /pub\s+(?:fn|struct|enum|trait)\s+([a-zA-Z0-9_]+)/g,
  ]

  for (const line of lines) {
    if (symbols.length >= 20) break
    const trimmed = line.trim()
    for (const pat of patterns) {
      pat.lastIndex = 0
      const match = pat.exec(trimmed)
      if (match && match[1]) {
        const item = `- ${match[0].replace(/\s+/g, " ").trim()}`
        if (!symbols.includes(item)) {
          symbols.push(item)
        }
        break
      }
    }
  }

  // Fallback for JSON / Markdown / Config files
  if (symbols.length === 0) {
    if (path.endsWith(".json")) {
      try {
        const parsed = JSON.parse(content)
        const keys = Object.keys(parsed).slice(0, 15)
        symbols.push(`- Top keys: ${keys.join(", ")}`)
      } catch {
        symbols.push(`- Format: JSON (${lines.length} lines)`)
      }
    } else if (path.endsWith(".md")) {
      const headers = lines
        .filter((l) => l.startsWith("#"))
        .slice(0, 10)
        .map((l) => `- ${l.trim()}`)
      symbols.push(...headers)
    }
  }

  const linesCount = lines.length
  let outline = `[File Reference: ${path} (${linesCount} lines, ${sizeKb} KB)]\n`
  if (symbols.length > 0) {
    outline += `Key Declarations / Structure:\n${symbols.join("\n")}\n`
  }
  outline += `(Compact manifest. Full file omitted to conserve token budget. Use view_file if full content is required.)`

  return outline
}

/**
 * Extracts a 50-line head snippet of the file.
 */
export function extractSnippet(content: string, maxLines = 50): string {
  if (!content) return ""
  const lines = content.split("\n")
  if (lines.length <= maxLines) return content
  const head = lines.slice(0, maxLines).join("\n")
  return `${head}\n\n... [truncated remaining ${lines.length - maxLines} lines. Switch to (Full) to view entire content]`
}

/**
 * Builds a manual file mention ContextItem (from @filename in composer).
 * Defaults to compact 'reference' mode to prevent token overload.
 */
export function buildMentionContextItem(
  path: string,
  content: string,
  mode: "reference" | "snippet" | "full" = "reference",
): ContextItem | null {
  if (!path || !content) return null
  if (isPathExcluded(path)) return null

  let effectiveContent: string
  let isTruncated = false

  if (mode === "reference") {
    effectiveContent = extractFileOutline(path, content)
  } else if (mode === "snippet") {
    effectiveContent = extractSnippet(content, 50)
    isTruncated = content.split("\n").length > 50
  } else {
    isTruncated = content.length > MAX_CONTEXT_CHARS
    effectiveContent = isTruncated
      ? content.slice(0, MAX_CONTEXT_CHARS)
      : content
  }

  return {
    id: `ctx-${path}-mention`,
    type: "file",
    path,
    content: effectiveContent,
    charCount: effectiveContent.length,
    estimatedTokens: estimateTokens(effectiveContent),
    isTruncated,
    mode,
    rawBuffer: content,
  }
}

/**
 * Enforces a total token budget (default 2500 tokens) across context items.
 * If total exceeds budget, demotes 'full' and 'snippet' items to 'reference' mode.
 */
export function enforceContextTokenBudget(
  items: ContextItem[],
  maxBudget = MAX_CONTEXT_BUDGET_TOKENS,
): ContextItem[] {
  let totalTokens = items.reduce((sum, item) => sum + item.estimatedTokens, 0)
  if (totalTokens <= maxBudget) return items

  // Demote mentions from full/snippet to reference
  const adjusted = items.map((item) => {
    if (totalTokens <= maxBudget) return item
    if (
      item.type === "file" &&
      (item.mode === "full" || item.mode === "snippet") &&
      item.rawBuffer
    ) {
      const demoted = buildMentionContextItem(
        item.path,
        item.rawBuffer,
        "reference",
      )
      if (demoted) {
        totalTokens -= item.estimatedTokens - demoted.estimatedTokens
        return demoted
      }
    }
    return item
  })

  return adjusted
}
