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

export function tokenizeLine(line: string): ReactNode[] {
  if (!line) return ["\u00a0"]

  // Comment check
  const trimmed = line.trimStart()
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    const indentLen = line.length - trimmed.length
    const indent = line.slice(0, indentLen)
    return [
      indent,
      <span className="text-muted" key="comment">
        {trimmed}
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
