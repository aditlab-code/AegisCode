import { memo, useMemo, useState, type ReactNode } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { tokenizeLine } from "../../../utils/syntax"
import { isGitDiffTab } from "../../../utils/gitDiffTab"
import { useSmoothStream } from "./useSmoothStream"
import { MermaidBlock } from "./MermaidBlock"

interface MarkdownRendererProps {
  text: string
  isStreaming?: boolean
}

interface CodeBlock {
  type: "code"
  lang: string
  targetPath?: string
  content: string
  unclosed?: boolean
}

interface HeaderBlock {
  type: "header"
  level: 1 | 2 | 3 | 4
  content: string
}

interface BlockquoteBlock {
  type: "blockquote"
  content: string[]
}

interface ListBlock {
  type: "ul" | "ol"
  items: string[]
}

interface TableBlock {
  type: "table"
  headers: string[]
  rows: string[][]
}

interface HrBlock {
  type: "hr"
}

interface ParagraphBlock {
  type: "p"
  content: string
}

export type Block = CodeBlock | HeaderBlock | BlockquoteBlock | ListBlock | TableBlock | HrBlock | ParagraphBlock

export const MarkdownRenderer = memo(function MarkdownRenderer({
  text,
  isStreaming = false,
}: MarkdownRendererProps) {
  const displayedText = useSmoothStream(text, isStreaming)
  const { openFileInPane, applyCodeWithReview, showToast } = useWorkbenchStore(
    useShallow((s) => ({
      openFileInPane: s.openFileInPane,
      applyCodeWithReview: s.applyCodeWithReview,
      showToast: s.showToast,
    })),
  )

  const blocks = useMemo(() => {
    return parseMarkdownBlocks(displayedText, isStreaming)
  }, [displayedText, isStreaming])

  return (
    <div className="markdown-body">
      {blocks.length === 0 && isStreaming && (
        <span className="streaming-cursor" />
      )}
      {blocks.map((block, idx) => {
        const isLastBlock = idx === blocks.length - 1
        const cursorNode =
          isStreaming && isLastBlock && block.type !== "code" ? (
            <span className="streaming-cursor" />
          ) : null

        switch (block.type) {
          case "code":
            return (
              <CodeBlockView
                key={`block-${idx}`}
                lang={block.lang}
                targetPath={block.targetPath}
                code={block.content}
                unclosed={block.unclosed}
                isStreaming={isStreaming}
                onApply={(target, code) => {
                  if (target) {
                    void applyCodeWithReview(target, code)
                  } else {
                    showToast(
                      "Please open a target file in the editor to apply code",
                    )
                  }
                }}
                onCopy={(code) => {
                  if (navigator?.clipboard) {
                    navigator.clipboard.writeText(code)
                    showToast("Code copied to clipboard")
                  }
                }}
              />
            )
          case "header": {
            const inline = renderInlineMarkdown(
              block.content,
              openFileInPane,
              `h-${idx}`,
            )
            if (block.level === 1) {
              return (
                <h1 key={`block-${idx}`} className="markdown-h1">
                  {inline}
                  {cursorNode}
                </h1>
              )
            }
            if (block.level === 2) {
              return (
                <h2 key={`block-${idx}`} className="markdown-h2">
                  {inline}
                  {cursorNode}
                </h2>
              )
            }
            if (block.level === 3) {
              return (
                <h3 key={`block-${idx}`} className="markdown-h3">
                  {inline}
                  {cursorNode}
                </h3>
              )
            }
            return (
              <h4 key={`block-${idx}`} className="markdown-h4">
                {inline}
                {cursorNode}
              </h4>
            )
          }
          case "blockquote":
            return (
              <blockquote key={`block-${idx}`} className="markdown-blockquote">
                {block.content.map((line, lineIdx) => {
                  const isLastLine = lineIdx === block.content.length - 1
                  return (
                    <div key={lineIdx}>
                      {renderInlineMarkdown(
                        line,
                        openFileInPane,
                        `bq-${idx}-${lineIdx}`,
                      )}
                      {isLastLine ? cursorNode : null}
                    </div>
                  )
                })}
              </blockquote>
            )
          case "ul":
            return (
              <ul key={`block-${idx}`} className="markdown-ul">
                {block.items.map((item, itemIdx) => {
                  const isLastItem = itemIdx === block.items.length - 1
                  const itemCursor = isLastItem ? cursorNode : null
                  const isTask =
                    item.startsWith("[ ] ") || item.startsWith("[x] ")
                  if (isTask) {
                    const checked = item.startsWith("[x] ")
                    const content = item.slice(4)
                    return (
                      <li key={itemIdx} className="markdown-task-item">
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          className="mr-1.5 accent-(--color-accent)"
                        />
                        <span>
                          {renderInlineMarkdown(
                            content,
                            openFileInPane,
                            `ul-task-${idx}-${itemIdx}`,
                          )}
                          {itemCursor}
                        </span>
                      </li>
                    )
                  }
                  return (
                    <li key={itemIdx} className="markdown-li">
                      {renderInlineMarkdown(
                        item,
                        openFileInPane,
                        `ul-${idx}-${itemIdx}`,
                      )}
                      {itemCursor}
                    </li>
                  )
                })}
              </ul>
            )
          case "ol":
            return (
              <ol key={`block-${idx}`} className="markdown-ol">
                {block.items.map((item, itemIdx) => {
                  const isLastItem = itemIdx === block.items.length - 1
                  return (
                    <li key={itemIdx} className="markdown-li">
                      {renderInlineMarkdown(
                        item,
                        openFileInPane,
                        `ol-${idx}-${itemIdx}`,
                      )}
                      {isLastItem ? cursorNode : null}
                    </li>
                  )
                })}
              </ol>
            )
          case "table":
            return (
              <div key={`block-${idx}`} className="markdown-table-wrapper">
                <table className="markdown-table">
                  <thead>
                    <tr>
                      {block.headers.map((h, hIdx) => (
                        <th key={hIdx}>
                          {renderInlineMarkdown(
                            h,
                            openFileInPane,
                            `th-${idx}-${hIdx}`,
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx}>
                            {renderInlineMarkdown(
                              cell,
                              openFileInPane,
                              `td-${idx}-${rIdx}-${cIdx}`,
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {cursorNode}
              </div>
            )
          case "hr":
            return (
              <div key={`block-${idx}`}>
                <hr className="markdown-hr" />
                {cursorNode}
              </div>
            )
          case "p":
          default:
            return (
              <p key={`block-${idx}`} className="markdown-p">
                {renderInlineMarkdown(
                  block.content,
                  openFileInPane,
                  `p-${idx}`,
                )}
                {cursorNode}
              </p>
            )
        }
      })}
    </div>
  )
})

interface CodeBlockViewProps {
  lang: string
  targetPath?: string
  code: string
  unclosed?: boolean
  isStreaming?: boolean
  onApply: (target: string, code: string) => void
  onCopy: (code: string) => void
}

function CodeBlockView({
  lang,
  targetPath,
  code,
  unclosed,
  isStreaming,
  onApply,
  onCopy,
}: CodeBlockViewProps) {
  if (lang.toLowerCase() === "mermaid") {
    return (
      <MermaidBlock
        code={code}
        unclosed={unclosed}
        isStreaming={isStreaming}
        onCopy={onCopy}
      />
    )
  }

  const [copied, setCopied] = useState(false)
  // Read activeTab locally so only CodeBlockView re-renders on tab change,
  // not the expensive MarkdownRenderer parser above it.
  const activeTab = useWorkbenchStore((s) => s.activeTab)

  const handleCopy = () => {
    onCopy(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const effectiveTarget =
    targetPath || (!isGitDiffTab(activeTab) ? activeTab || "" : "")
  const baseName = effectiveTarget
    ? effectiveTarget.split("/").pop() || effectiveTarget
    : ""
  const applyLabel = effectiveTarget
    ? `Apply to ${baseName}`
    : "Apply to Editor"

  const lines = code.split("\n")

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="markdown-code-lang">{lang || "CODE"}</span>
          {targetPath && (
            <span
              className="text-[10px] text-ink-muted font-mono truncate max-w-50"
              title={targetPath}
            >
              {targetPath}
            </span>
          )}
          {unclosed && !isStreaming && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider bg-warning/15 text-warning border border-warning/30">
              interrupted
            </span>
          )}
        </div>
        <div className="markdown-code-actions">
          <button
            type="button"
            className="markdown-code-action-btn"
            onClick={() => onApply(effectiveTarget, code)}
            title={
              effectiveTarget
                ? `Apply code to ${effectiveTarget} and review in Git diff`
                : "Open a target file in editor to apply code"
            }
          >
            <Icon name="check" size={11} />
            <span>{applyLabel}</span>
          </button>
          <button
            type="button"
            className="markdown-code-action-btn"
            onClick={handleCopy}
            title="Copy code to clipboard"
          >
            <Icon name={copied ? "check" : "copy"} size={11} />
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
      </div>
      <pre className="markdown-code-pre">
        <code>
          {isStreaming ? (
            <span className="whitespace-pre-wrap block leading-relaxed">
              {code}
            </span>
          ) : (
            lines.map((line, lineIdx) => (
              <span key={lineIdx} className="block leading-relaxed">
                {tokenizeLine(line)}
              </span>
            ))
          )}
          {unclosed && isStreaming && <span className="streaming-cursor" />}
        </code>
      </pre>
    </div>
  )
}

export function parseMarkdownBlocks(
  text: string,
  isStreaming: boolean,
): Block[] {
  const lines = text.split("\n")
  const blocks: Block[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // 1. Fenced Code Block: ```lang or ```lang:filepath
    const fenceMatch = line.match(/^```(?:([a-zA-Z0-9_.-]+)(?::(\S+))?)?/)
    if (fenceMatch) {
      const lang = fenceMatch[1] || ""
      const targetPath = fenceMatch[2] || undefined
      const codeLines: string[] = []
      let closed = false
      i++
      while (i < lines.length) {
        if (lines[i].startsWith("```")) {
          closed = true
          i++
          break
        }
        codeLines.push(lines[i])
        i++
      }
      blocks.push({
        type: "code",
        lang,
        targetPath,
        content: codeLines.join("\n"),
        unclosed: !closed,
      })
      continue
    }

    // 2. Horizontal Rule (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      blocks.push({ type: "hr" })
      i++
      continue
    }

    // 3. Headers (#, ##, ###, ####)
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/)
    if (headerMatch) {
      const level = headerMatch[1].length as 1 | 2 | 3 | 4
      blocks.push({
        type: "header",
        level,
        content: headerMatch[2].trim(),
      })
      i++
      continue
    }

    // 4. Blockquote (> ...)
    if (line.startsWith(">")) {
      const bqLines: string[] = []
      while (
        i < lines.length &&
        (lines[i].startsWith(">") ||
          (lines[i].trim() !== "" &&
            bqLines.length > 0 &&
            !lines[i].startsWith("#") &&
            !lines[i].startsWith("-") &&
            !lines[i].startsWith("```")))
      ) {
        if (lines[i].startsWith(">")) {
          bqLines.push(lines[i].replace(/^>\s?/, ""))
        } else {
          bqLines.push(lines[i])
        }
        i++
      }
      blocks.push({ type: "blockquote", content: bqLines })
      continue
    }

    // 5. Unordered List (- , * , + )
    if (/^(\s*)[-*+]\s+(.+)$/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(\s*)[-*+]\s+(.+)$/)
        if (!itemMatch) break
        listItems.push(itemMatch[2])
        i++
      }
      blocks.push({ type: "ul", items: listItems })
      continue
    }

    // 6. Ordered List (1. , 2. )
    if (/^\s*\d+\.\s+(.+)$/.test(line)) {
      const listItems: string[] = []
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^\s*\d+\.\s+(.+)$/)
        if (!itemMatch) break
        listItems.push(itemMatch[1])
        i++
      }
      blocks.push({ type: "ol", items: listItems })
      continue
    }

    // 7. Markdown Table (| Col 1 | Col 2 |)
    if (
      line.trim().startsWith("|") &&
      line.trim().endsWith("|") &&
      i + 1 < lines.length &&
      /^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(lines[i + 1])
    ) {
      const parseCells = (l: string) =>
        l.trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())

      const headers = parseCells(line)
      i += 2 // Skip header and separator
      const rows: string[][] = []
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        lines[i].trim().endsWith("|")
      ) {
        rows.push(parseCells(lines[i]))
        i++
      }
      blocks.push({ type: "table", headers, rows })
      continue
    }

    // 8. Paragraph / Plain text
    if (line.trim() === "") {
      i++
      continue
    }

    const pLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith(">") &&
      !/^(\s*)[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^(\*{3,}|-{3,}|_{3,})$/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|"))
    ) {
      pLines.push(lines[i])
      i++
    }
    blocks.push({ type: "p", content: pLines.join("\n") })
  }

  return blocks
}

export function renderInlineMarkdown(
  text: string,
  onOpenFile: (path: string) => void,
  keyPrefix: string,
): ReactNode[] {
  // Regex parsing: inline code `...`, bold **...**, italic *...*, strikethrough ~~...~~, links [...](...), @mentions, /commands
  const regex =
    /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|~~[^~]+~~|\[[^\]]+\]\([^)]+\)|(?:^|\s)@[a-zA-Z0-9_\-./]+|(?:^|\s)\/[a-zA-Z0-9_\-]+)/g

  const nodes: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    const raw = match[0]
    const key = `${keyPrefix}-${match.index}`

    if (raw.startsWith("`") && raw.endsWith("`") && raw.length >= 2) {
      nodes.push(
        <code key={key} className="markdown-inline-code">
          {raw.slice(1, -1)}
        </code>,
      )
    } else if (raw.startsWith("**") && raw.endsWith("**") && raw.length >= 4) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {raw.slice(2, -2)}
        </strong>,
      )
    } else if (raw.startsWith("*") && raw.endsWith("*") && raw.length >= 2) {
      nodes.push(
        <em key={key} className="italic">
          {raw.slice(1, -1)}
        </em>,
      )
    } else if (raw.startsWith("~~") && raw.endsWith("~~") && raw.length >= 4) {
      nodes.push(
        <del key={key} className="line-through text-ink-muted">
          {raw.slice(2, -2)}
        </del>,
      )
    } else if (raw.startsWith("[") && raw.includes("](") && raw.endsWith(")")) {
      const linkMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        const href = linkMatch[2].trim()
        const isSafeProtocol = /^(https?:|mailto:|file:|\/|#)/i.test(href)
        if (isSafeProtocol) {
          nodes.push(
            <a
              key={key}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="markdown-link"
            >
              {linkMatch[1]}
            </a>,
          )
        } else {
          nodes.push(
            <span key={key} className="text-ink-muted underline">
              {linkMatch[1]}
            </span>,
          )
        }
      } else {
        nodes.push(raw)
      }
    } else if (raw.trim().startsWith("@")) {
      const leadingSpace = raw.match(/^\s+/)?.[0]
      if (leadingSpace) {
        nodes.push(leadingSpace)
      }
      const trimmed = raw.trim()
      const cleanPath = trimmed.slice(1)
      const isFolder = cleanPath.endsWith("/")
      nodes.push(
        <button
          key={key}
          type="button"
          onClick={() => onOpenFile(cleanPath)}
          className="markdown-mention-pill"
          title={`Open ${cleanPath} in editor`}
        >
          <Icon name={isFolder ? "folder" : "file"} size={11} />
          <span>{trimmed}</span>
        </button>,
      )
    } else if (raw.trim().startsWith("/")) {
      const leadingSpace = raw.match(/^\s+/)?.[0]
      if (leadingSpace) {
        nodes.push(leadingSpace)
      }
      const trimmed = raw.trim()
      nodes.push(
        <span key={key} className="markdown-command-chip">
          <Icon name="code" size={11} />
          <span>{trimmed}</span>
        </span>,
      )
    } else {
      nodes.push(raw)
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}
