import type { DiagnosticItem } from "../types/workbench"

export function detectLanguage(filename: string): string {
  const clean = filename.split("?")[0] || filename
  const base = (clean.split("/").pop() || clean).toLowerCase()
  if (
    base === "makefile" ||
    base === "gnumakefile" ||
    base.endsWith(".mk") ||
    base.endsWith(".mak")
  ) {
    return "Makefile"
  }
  if (
    base === ".bashrc" ||
    base === ".zshrc" ||
    base === ".bash_profile" ||
    base === ".profile"
  ) {
    return "Shell"
  }

  const parts = clean.split(".")
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
    case "go":
      return "Go"
    case "rs":
      return "Rust"
    case "c":
    case "h":
      return "C"
    case "cpp":
    case "cc":
    case "cxx":
    case "hpp":
    case "hh":
    case "hxx":
      return "C++"
    case "cs":
    case "csx":
      return "C#"
    case "sh":
    case "bash":
    case "zsh":
      return "Shell"
    case "mk":
    case "mak":
      return "Makefile"
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

const LSP_EXTENSIONS = new Set([
  "go",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rs",
  "c",
  "cpp",
  "cc",
  "cxx",
  "h",
  "hpp",
  "hh",
  "hxx",
  "cs",
  "csx",
  "sh",
  "bash",
  "zsh",
  "mk",
  "mak",
])

export function isLspLanguage(filename: string): boolean {
  const clean = filename.split("?")[0] || filename
  const base = (clean.split("/").pop() || clean).toLowerCase()
  if (
    base === "makefile" ||
    base === "gnumakefile" ||
    base === ".bashrc" ||
    base === ".zshrc" ||
    base === ".bash_profile" ||
    base === ".profile"
  ) {
    return true
  }
  const ext = clean.split(".").pop()?.toLowerCase() || ""
  return LSP_EXTENSIONS.has(ext)
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

interface TemplateContext {
  depth: number
}

function validateJSOrTS(
  filename: string,
  lines: string[],
  diagnostics: DiagnosticItem[],
) {
  const stack: DelimiterToken[] = []
  const pairs: Record<string, string> = { "}": "{", ")": "(", "]": "[" }

  let inBlockComment = false
  const templateStack: TemplateContext[] = []
  let inSingleQuote = false
  let inDoubleQuote = false
  let inRegex = false
  let inRegexCharClass = false
  let prevToken = ""

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    let i = 0

    while (i < lineText.length) {
      const char = lineText[i]
      const nextChar = i + 1 < lineText.length ? lineText[i + 1] : ""

      // 1. Inside block comment /* ... */
      if (inBlockComment) {
        if (char === "*" && nextChar === "/") {
          inBlockComment = false
          i += 2
          continue
        }
        i++
        continue
      }

      // 2. Inside single quote string '...'
      if (inSingleQuote) {
        if (char === "\\") {
          i += 2
          continue
        }
        if (char === "'") {
          inSingleQuote = false
          prevToken = "string"
        }
        i++
        continue
      }

      // 3. Inside double quote string "..."
      if (inDoubleQuote) {
        if (char === "\\") {
          i += 2
          continue
        }
        if (char === '"') {
          inDoubleQuote = false
          prevToken = "string"
        }
        i++
        continue
      }

      // 4. Inside regex literal /.../
      if (inRegex) {
        if (char === "\\") {
          i += 2
          continue
        }
        if (char === "[" && !inRegexCharClass) {
          inRegexCharClass = true
        } else if (char === "]" && inRegexCharClass) {
          inRegexCharClass = false
        } else if (char === "/" && !inRegexCharClass) {
          inRegex = false
          prevToken = "regex"
        }
        i++
        continue
      }

      // 5. Inside template literal text `...` (not inside ${...} interpolation)
      const topTemplate = templateStack[templateStack.length - 1]
      if (topTemplate && topTemplate.depth === 0) {
        if (char === "\\") {
          i += 2
          continue
        }
        if (char === "`") {
          templateStack.pop()
          prevToken = "string"
          i++
          continue
        }
        if (char === "$" && nextChar === "{") {
          topTemplate.depth = 1
          stack.push({ char: "{", line: lineNum, col: i + 2 })
          prevToken = "{"
          i += 2
          continue
        }
        i++
        continue
      }

      // 6. Normal code or inside ${...} expression
      if (char === " " || char === "\t" || char === "\r") {
        i++
        continue
      }

      // Comments
      if (char === "/" && nextChar === "/") {
        break
      }
      if (char === "/" && nextChar === "*") {
        inBlockComment = true
        i += 2
        continue
      }

      // Strings
      if (char === "'") {
        inSingleQuote = true
        i++
        continue
      }
      if (char === '"') {
        inDoubleQuote = true
        i++
        continue
      }
      if (char === "`") {
        templateStack.push({ depth: 0 })
        i++
        continue
      }

      // Regex vs Division
      if (char === "/") {
        const canBeRegex =
          !prevToken ||
          /[=(?:,;!&|^~+*%\-<>]/.test(prevToken.slice(-1)) ||
          [
            "return",
            "case",
            "throw",
            "typeof",
            "instanceof",
            "void",
            "delete",
            "yield",
            "await",
          ].includes(prevToken)

        if (canBeRegex) {
          inRegex = true
          inRegexCharClass = false
          i++
          continue
        }
      }

      // Console.log warning
      if (lineText.slice(i, i + 12) === "console.log(") {
        diagnostics.push({
          id: `${filename}-warn-${lineNum}`,
          title: "Unexpected console statement (no-console)",
          location: `${filename} [${lineNum}, ${i + 1}]`,
          type: "warning",
          source: "eslint",
        })
      }

      // Delimiter tracking
      if (char === "{" || char === "(" || char === "[") {
        stack.push({ char, line: lineNum, col: i + 1 })
        if (topTemplate && topTemplate.depth > 0 && char === "{") {
          topTemplate.depth++
        }
        prevToken = char
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
        if (topTemplate && topTemplate.depth > 0 && char === "}") {
          topTemplate.depth--
        }
        prevToken = char
      } else {
        if (/[a-zA-Z0-9_$]/.test(char)) {
          if (/[a-zA-Z0-9_$]/.test(prevToken)) {
            prevToken += char
          } else {
            prevToken = char
          }
        } else {
          prevToken = char
        }
      }

      i++
    }

    inSingleQuote = false
    inDoubleQuote = false
    inRegex = false
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

function countUnquotedParens(text: string): number {
  let count = 0
  let inString: string | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        i++ // skip escape
      } else if (ch === inString) {
        inString = null
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = ch
      } else if (ch === "(" || ch === "[" || ch === "{") {
        count++
      } else if (ch === ")" || ch === "]" || ch === "}") {
        count--
      } else if (ch === "#") {
        // Comment starts, rest of line is ignored
        break
      }
    }
  }
  return count
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

  let inBlockHeader = false
  let openParenCount = 0

  lines.forEach((lineText, idx) => {
    const lineNum = idx + 1
    const trimmed = lineText.trim()
    if (!trimmed || trimmed.startsWith("#")) return

    const lineParens = countUnquotedParens(trimmed)

    if (!inBlockHeader) {
      for (const kw of blockKeywords) {
        if (
          trimmed === kw ||
          trimmed.startsWith(kw + " ") ||
          trimmed.startsWith(kw + "(")
        ) {
          openParenCount += lineParens
          if (trimmed.endsWith("\\") || openParenCount > 0) {
            inBlockHeader = true
          } else if (!trimmed.endsWith(":")) {
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
    } else {
      openParenCount += lineParens
      if (openParenCount <= 0 && !trimmed.endsWith("\\")) {
        inBlockHeader = false
        openParenCount = 0
        if (!trimmed.endsWith(":")) {
          diagnostics.push({
            id: `${filename}-py-colon-${lineNum}`,
            title: `SyntaxError: expected ':' at end of statement`,
            location: `${filename} [${lineNum}, ${lineText.length}]`,
            type: "error",
            source: "flake8",
          })
        }
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
