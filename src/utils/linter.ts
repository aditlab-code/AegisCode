import type { DiagnosticItem } from "../types/workbench"

export function detectLanguage(filename: string): string {
  const parts = filename.split(".")
  const ext = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ""
  switch (ext) {
    case "ts":
    case "tsx":
      return "TypeScript"
    case "js":
    case "jsx":
      return "JavaScript"
    case "json":
      return "JSON"
    case "py":
      return "Python"
    case "cpp":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
      return "C++"
    case "css":
      return "CSS"
    case "html":
      return "HTML"
    case "md":
      return "Markdown"
    default:
      return "Plain Text"
  }
}

export function validateSyntax(
  filename: string,
  content: string,
  showWarnings: boolean = true,
): DiagnosticItem[] {
  const lang = detectLanguage(filename)
  const diagnostics: DiagnosticItem[] = []
  const lines = content.split("\n")

  if (lang === "JSON") {
    validateJSON(filename, content, diagnostics)
  } else if (lang === "TypeScript" || lang === "JavaScript") {
    validateJSOrTS(filename, lines, diagnostics)
  } else if (lang === "Python") {
    validatePython(filename, lines, diagnostics)
  } else if (lang === "C++") {
    validateCpp(filename, lines, diagnostics)
  }

  if (!showWarnings) {
    return diagnostics.filter((d) => d.type === "error")
  }
  return diagnostics
}

function validateJSON(
  filename: string,
  content: string,
  diagnostics: DiagnosticItem[],
) {
  if (!content.trim()) return

  try {
    JSON.parse(content)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "JSON syntax error"
    let line = 1
    let col = 1

    const matchLineCol = errorMsg.match(/line (\d+) column (\d+)/i)
    const matchPos = errorMsg.match(/position (\d+)/i)

    if (matchLineCol) {
      line = parseInt(matchLineCol[1], 10)
      col = parseInt(matchLineCol[2], 10)
    } else if (matchPos) {
      const pos = parseInt(matchPos[1], 10)
      const prefix = content.slice(0, pos)
      const subLines = prefix.split("\n")
      line = subLines.length
      col = subLines[subLines.length - 1].length + 1
    }

    diagnostics.push({
      id: `${filename}-err-${line}-${col}`,
      title: errorMsg.replace(/\s+in JSON at position \d+/, ""),
      location: `${filename} [${line}, ${col}]`,
      type: "error",
      source: "json-lint",
    })
  }
}

interface DelimiterToken {
  char: string
  line: number
  col: number
}

function validateJSOrTS(
  filename: string,
  lines: string[],
  diagnostics: DiagnosticItem[],
) {
  const stack: DelimiterToken[] = []
  const pairs: Record<string, string> = { "}": "{", ")": "(", "]": "[" }

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()

    // Skip comment lines
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return

    // Check for common warning: console.log left in code
    if (trimmed.includes("console.log(")) {
      diagnostics.push({
        id: `${filename}-warn-${lineNum}`,
        title: "Unexpected console statement (no-console)",
        location: `${filename} [${lineNum}, ${lineText.indexOf("console.log") + 1}]`,
        type: "warning",
        source: "eslint",
      })
    }

    // Bracket balance tracking
    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i]
      if (char === "{" || char === "(" || char === "[") {
        stack.push({ char, line: lineNum, col: i + 1 })
      } else if (char === "}" || char === ")" || char === "]") {
        const expected = pairs[char]
        const last = stack.pop()
        if (!last || last.char !== expected) {
          diagnostics.push({
            id: `${filename}-err-${lineNum}-${i}`,
            title: `Mismatched closing delimiter '${char}'`,
            location: `${filename} [${lineNum}, ${i + 1}]`,
            type: "error",
            source: "typescript",
          })
        }
      }
    }
  })

  // If stack has remaining unclosed delimiters
  while (stack.length > 0) {
    const unclosed = stack.pop()!
    diagnostics.push({
      id: `${filename}-unclosed-${unclosed.line}`,
      title: `Unclosed delimiter '${unclosed.char}'`,
      location: `${filename} [${unclosed.line}, ${unclosed.col}]`,
      type: "error",
      source: "typescript",
    })
  }
}

function validatePython(
  filename: string,
  lines: string[],
  diagnostics: DiagnosticItem[],
) {
  const blockKeywords = [
    "def",
    "class",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "try",
    "except",
    "finally",
    "with",
  ]

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()
    if (!trimmed || trimmed.startsWith("#")) return

    // Check block header ending with colon
    for (const kw of blockKeywords) {
      if (
        trimmed === kw ||
        trimmed.startsWith(kw + " ") ||
        trimmed.startsWith(kw + "(")
      ) {
        if (!trimmed.endsWith(":")) {
          diagnostics.push({
            id: `${filename}-py-colon-${lineNum}`,
            title: `SyntaxError: expected ':' at end of statement`,
            location: `${filename} [${lineNum}, ${lineText.length}]`,
            type: "error",
            source: "flake8",
          })
        }
        break
      }
    }

    // Check trailing semicolon in python (warning)
    if (trimmed.endsWith(";")) {
      diagnostics.push({
        id: `${filename}-py-semi-${lineNum}`,
        title: "Statement ends with unnecessary semicolon",
        location: `${filename} [${lineNum}, ${lineText.length}]`,
        type: "warning",
        source: "flake8",
      })
    }
  })
}

function validateCpp(
  filename: string,
  lines: string[],
  diagnostics: DiagnosticItem[],
) {
  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("#")) return

    // C++ missing semicolon heuristic: statements not ending with { or } or ; or :
    if (
      !trimmed.endsWith(";") &&
      !trimmed.endsWith("{") &&
      !trimmed.endsWith("}") &&
      !trimmed.endsWith(":") &&
      !trimmed.endsWith(",") &&
      !trimmed.endsWith("\\")
    ) {
      // Exclude simple comments or macros
      if (
        !trimmed.startsWith("/*") &&
        !trimmed.startsWith("public:") &&
        !trimmed.startsWith("private:")
      ) {
        diagnostics.push({
          id: `${filename}-cpp-semi-${lineNum}`,
          title: "Expected ';' at end of declaration",
          location: `${filename} [${lineNum}, ${lineText.length}]`,
          type: "error",
          source: "clang-tidy",
        })
      }
    }
  })
}
