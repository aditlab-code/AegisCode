export type ViewerType = "image" | "markdown" | "pdf" | "csv" | "graph" | "code"

export function isGraphTab(filename: string): boolean {
  return (
    filename === "CodeGraph" ||
    filename.startsWith("codegraph:") ||
    filename.endsWith(".graph")
  )
}

export interface ParsedGraphTab {
  displayName: string
  target: string
  isWorkspace: boolean
}

export function parseGraphTab(tab: string): ParsedGraphTab {
  if (tab === "CodeGraph" || tab === "codegraph:workspace") {
    return {
      displayName: "CodeGraph (Workspace)",
      target: "",
      isWorkspace: true,
    }
  }
  if (tab.startsWith("codegraph:")) {
    const rawTarget = tab.slice("codegraph:".length)
    const base = rawTarget.split("/").pop() || rawTarget
    return {
      displayName: `CodeGraph (${base})`,
      target: rawTarget,
      isWorkspace: false,
    }
  }
  return { displayName: tab, target: tab, isWorkspace: false }
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "bmp",
])

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"])

const PDF_EXTENSIONS = new Set(["pdf"])

const CSV_EXTENSIONS = new Set(["csv", "tsv"])

export function getFileExtension(filename: string): string {
  if (!filename) return ""
  const clean = filename.split("?")[0] || ""
  const dotIndex = clean.lastIndexOf(".")
  if (dotIndex === -1) return ""
  return clean.slice(dotIndex + 1).toLowerCase()
}

export function getViewerTypeForFile(filename: string): ViewerType {
  if (isGraphTab(filename)) return "graph"
  const ext = getFileExtension(filename)
  if (IMAGE_EXTENSIONS.has(ext)) return "image"
  if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown"
  if (PDF_EXTENSIONS.has(ext)) return "pdf"
  if (CSV_EXTENSIONS.has(ext)) return "csv"
  return "code"
}

export function getRawFileUrl(filePath: string): string {
  const clean = filePath.replace(/\\/g, "/").replace(/^\.\//, "")
  return `/api/v1/workspace/file/raw?path=${encodeURIComponent(clean)}`
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

/**
 * Detects CSV delimiter (',', ';', or '\t') by evaluating per-line consistency
 * and frequency outside of quoted strings.
 * Accurately distinguishes semicolon delimiters from decimal commas (e.g. European/Indonesian format).
 */
export function detectCsvDelimiter(content: string): "," | ";" | "\t" {
  if (!content) return ","

  // Analyze first ~25 non-empty lines within sample window
  const sample = content.slice(0, 15000)
  const lines = sample
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 25)

  if (lines.length === 0) return ","

  const delimiters: Array<"," | ";" | "\t"> = [",", ";", "\t"]
  const scores: Record<"," | ";" | "\t", {
    total: number
    consistentLines: number
    firstLineCount: number
  }> = {
    ",": { total: 0, consistentLines: 0, firstLineCount: 0 },
    ";": { total: 0, consistentLines: 0, firstLineCount: 0 },
    "\t": { total: 0, consistentLines: 0, firstLineCount: 0 },
  }

  for (const delim of delimiters) {
    const countsPerLine: number[] = []

    for (let l = 0; l < lines.length; l++) {
      const line = lines[l]
      let count = 0
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            i++
          } else {
            inQuotes = !inQuotes
          }
        } else if (!inQuotes && char === delim) {
          count++
        }
      }

      countsPerLine.push(count)
      scores[delim].total += count
    }

    const first = countsPerLine[0] || 0
    scores[delim].firstLineCount = first

    if (first > 0) {
      let matches = 0
      for (const c of countsPerLine) {
        if (c === first) matches++
      }
      scores[delim].consistentLines = matches
    }
  }

  // Prioritize delimiters present in header with regular repetition across rows
  const candidates = delimiters.filter((d) => scores[d].firstLineCount > 0)
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      const consistencyDiff =
        scores[b].consistentLines - scores[a].consistentLines
      if (consistencyDiff !== 0) return consistencyDiff
      return scores[b].total - scores[a].total
    })
    return candidates[0]
  }

  // Fallback to total frequency if header delimiter was unparsed
  if (
    scores["\t"].total > scores[","].total &&
    scores["\t"].total > scores[";"].total
  ) {
    return "\t"
  }
  if (scores[";"].total > scores[","].total) return ";"
  return ","
}

/**
 * @deprecated Prefer server-side windowing via /api/v1/workspace/csv/query (RFC 4180 chunk streaming).
 * Used only as local fallback for small test strings.
 * RFC 4180 compliant CSV parser.
 * Supports quoted strings containing delimiters and newlines, escaped quotes ("").
 */
export function parseCsv(
  content: string,
  delimiter: "," | ";" | "\t" = ",",
): string[][] {
  if (!content) return []

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ""
  let inQuotes = false

  const len = content.length

  for (let i = 0; i < len; i++) {
    const char = content[i]

    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        currentCell += '"'
        i++ // skip next quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      currentRow.push(currentCell)
      currentCell = ""
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && content[i + 1] === "\n") {
        i++ // handle CRLF
      }
      currentRow.push(currentCell)
      currentCell = ""
      // Avoid pushing empty trailing line if file ends with newline
      if (
        currentRow.length > 1 ||
        (currentRow[0] && currentRow[0].length > 0)
      ) {
        rows.push(currentRow)
      }
      currentRow = []
    } else {
      currentCell += char
    }
  }

  // Push final cell and row if not empty
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell)
    if (currentRow.length > 1 || (currentRow[0] && currentRow[0].length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}
