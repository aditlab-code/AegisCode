import type { ReactNode } from "react"

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

export interface TodoOptions {
  enabled?: boolean
  keywords?: string[]
}

export function buildTodoRegex(keywords?: string[]): RegExp {
  if (!keywords || keywords.length === 0) {
    return /\b(TODO|FIXME|NOTE|BUG|HACK)(?::)?\b/gi
  }
  const escaped = keywords
    .map((k) => k.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .join("|")
  if (!escaped) return /\b(TODO|FIXME|NOTE|BUG|HACK)(?::)?\b/gi
  return new RegExp(`\\b(${escaped})(?::)?\\b`, "gi")
}

function renderCommentWithTodo(
  commentText: string,
  keyPrefix: string,
  todoOptions?: TodoOptions,
): ReactNode[] {
  if (todoOptions && todoOptions.enabled === false) {
    return [commentText]
  }

  const parts: ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null
  const regex = buildTodoRegex(todoOptions?.keywords)

  while ((match = regex.exec(commentText)) !== null) {
    if (match.index > lastIdx) {
      parts.push(commentText.slice(lastIdx, match.index))
    }
    const rawTag = match[0]
    const cleanTag = match[1].toUpperCase()
    parts.push(
      <span
        className={`syntax-todo-tag syntax-todo-${cleanTag}`}
        key={`${keyPrefix}-todo-${match.index}`}
      >
        {rawTag}
      </span>,
    )
    lastIdx = regex.lastIndex
  }

  if (lastIdx < commentText.length) {
    parts.push(commentText.slice(lastIdx))
  }

  return parts.length > 0 ? parts : [commentText]
}

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

export function tokenizeLine(
  line: string,
  todoOptions?: TodoOptions,
): ReactNode[] {
  if (!line) return ["\u00a0"]

  // Full line comment check
  const trimmed = line.trimStart()
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    const indentLen = line.length - trimmed.length
    const indent = line.slice(0, indentLen)
    return [
      indent,
      <span className="text-muted" key="comment">
        {renderCommentWithTodo(trimmed, "full-comment", todoOptions)}
      </span>,
    ]
  }

  // Trailing line comment check (ignoring // inside strings/URLs)
  const commentIdx = findInlineCommentIndex(line)
  if (commentIdx !== -1) {
    const codePart = line.slice(0, commentIdx)
    const commentPart = line.slice(commentIdx)
    return [
      ...tokenizeLine(codePart, todoOptions),
      <span className="text-muted" key={`inline-comment-${commentIdx}`}>
        {renderCommentWithTodo(commentPart, "inline-comment", todoOptions)}
      </span>,
    ]
  }

  // Regex matching tokens: strings, numbers, identifiers, punctuation
  const regex =
    /(".*?"|'.*?'|`.*?`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b|[<>{}[\](),;.:=+\-*/&|!])/g
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index))
    }

    const token = match[0]
    const key = `${match.index}-${token}`

    if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("`")
    ) {
      nodes.push(
        <span className="syntax-green" key={key}>
          {token}
        </span>,
      )
    } else if (/^\d+(?:\.\d+)?$/.test(token)) {
      nodes.push(
        <span className="syntax-orange" key={key}>
          {token}
        </span>,
      )
    } else if (KEYWORDS.has(token)) {
      nodes.push(
        <span className="syntax-pink" key={key}>
          {token}
        </span>,
      )
    } else if (BUILTINS.has(token)) {
      nodes.push(
        <span className="syntax-blue" key={key}>
          {token}
        </span>,
      )
    } else if (/^[A-Z][a-zA-Z0-9]*$/.test(token)) {
      nodes.push(
        <span className="syntax-yellow" key={key}>
          {token}
        </span>,
      )
    } else {
      nodes.push(token)
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : ["\u00a0"]
}
