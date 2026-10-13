export type ViewerType = "image" | "markdown" | "pdf" | "csv" | "code"

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
 * Detects CSV delimiter by analyzing character frequency outside of quoted strings.
 * Defaults to comma (',') if counts are equal or no delimiters found.
 */
export function detectCsvDelimiter(content: string): "," | ";" | "\t" {
  if (!content) return ","

  const sample = content.slice(0, 10000)
  let inQuotes = false
  let commaCount = 0
  let semicolonCount = 0
  let tabCount = 0

  for (let i = 0; i < sample.length; i++) {
    const char = sample[i]
    if (char === '"') {
      if (inQuotes && sample[i + 1] === '"') {
        i++ // escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (!inQuotes) {
      if (char === ",") commaCount++
      else if (char === ";") semicolonCount++
      else if (char === "\t") tabCount++
    }
  }

  if (tabCount > commaCount && tabCount > semicolonCount) return "\t"
  if (semicolonCount > commaCount) return ";"
  return ","
}

/**
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
