import type { RawSyntaxToken, TokenizePayload, TokenizeResult } from "../types"

const KEYWORDS = new Set([
  "import",
  "export",
  "default",
  "from",
  "as",
  "function",
  "return",
  "const",
  "let",
  "var",
  "type",
  "interface",
  "class",
  "extends",
  "implements",
  "if",
  "else",
  "switch",
  "case",
  "for",
  "while",
  "do",
  "def",
  "elif",
  "try",
  "except",
  "finally",
  "with",
  "include",
  "using",
  "namespace",
  "struct",
  "void",
  "int",
  "bool",
  "async",
  "await",
  "new",
  "this",
  "typeof",
  "instanceof",
])

const BUILTINS = new Set([
  "useState",
  "useMemo",
  "useEffect",
  "useCallback",
  "useContext",
  "useRef",
  "React",
  "Component",
  "LocalServer",
  "ServerState",
  "Status",
  "Endpoint",
  "true",
  "false",
  "null",
  "undefined",
  "None",
  "True",
  "False",
  "string",
  "number",
  "boolean",
  "any",
  "Record",
  "Array",
  "Promise",
])

function findInlineCommentIndex(line: string): number {
  let inString: '"' | "'" | "`" | null = null
  let isEscaped = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (char === "\\") {
        isEscaped = true
      } else if (char === inString) {
        inString = null
      }
      continue
    }

    if (char === '"' || char === "'" || char === "`") {
      inString = char
      continue
    }

    if (char === "/" && line[i + 1] === "/") {
      return i
    }
  }

  return -1
}

export function tokenizeSingleLine(line: string): RawSyntaxToken[] {
  if (!line) return [{ text: "\u00a0" }]

  const trimmed = line.trimStart()
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    const indentLen = line.length - trimmed.length
    const indent = line.slice(0, indentLen)
    const tokens: RawSyntaxToken[] = []
    if (indent) tokens.push({ text: indent })
    tokens.push({ text: trimmed, className: "text-muted" })
    return tokens
  }

  const commentIdx = findInlineCommentIndex(line)
  if (commentIdx !== -1) {
    const codePart = line.slice(0, commentIdx)
    const commentPart = line.slice(commentIdx)
    return [
      ...tokenizeSingleLine(codePart),
      { text: commentPart, className: "text-muted" },
    ]
  }

  const regex =
    /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b|[<>{}[\](),;.:=+\-*/&|!])/g
  const tokens: RawSyntaxToken[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: line.slice(lastIndex, match.index) })
    }

    const token = match[0]
    if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("`")
    ) {
      tokens.push({ text: token, className: "syntax-green" })
    } else if (/^\d+(?:\.\d+)?$/.test(token)) {
      tokens.push({ text: token, className: "syntax-orange" })
    } else if (KEYWORDS.has(token)) {
      tokens.push({ text: token, className: "syntax-pink" })
    } else if (BUILTINS.has(token)) {
      tokens.push({ text: token, className: "syntax-blue" })
    } else if (/^[A-Z][a-zA-Z0-9]*$/.test(token)) {
      tokens.push({ text: token, className: "syntax-yellow" })
    } else {
      tokens.push({ text: token })
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < line.length) {
    tokens.push({ text: line.slice(lastIndex) })
  }

  return tokens.length > 0 ? tokens : [{ text: "\u00a0" }]
}

export function handleTokenizeTask(payload: TokenizePayload): TokenizeResult {
  const result: RawSyntaxToken[][] = new Array(payload.lines.length)
  for (let i = 0; i < payload.lines.length; i++) {
    result[i] = tokenizeSingleLine(payload.lines[i])
  }
  return { tokens: result }
}
