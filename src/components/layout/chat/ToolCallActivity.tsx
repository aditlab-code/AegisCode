import { useState, memo, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import type { ToolCallItem, IconName } from "../../../types/workbench"
import { cleanFilePath } from "../../../utils/workspaceApi"
import { fetchChatBlob } from "../../../utils/storeApi"

export interface ParsedToolCall {
  actionLabel: string
  actionIcon: IconName
  target: string
  fullTarget: string
  secondary?: string
  command?: string
  targetFile?: string
  output?: string
  blobRef?: string
  error?: string
  rawArgs?: Record<string, any>
  linesCount?: number
}

/**
 * Sanitizes arguments to prevent dumping massive code blocks into DOM / inspector.
 */
function sanitizeRawArgs(
  args?: Record<string, any>,
): Record<string, any> | undefined {
  if (!args) return undefined
  const copy: Record<string, any> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string" && v.length > 250) {
      const lineCount = v.split("\n").length
      copy[k] = `[${lineCount} lines / ${v.length} chars omitted]`
    } else {
      copy[k] = v
    }
  }
  return copy
}

/**
 * Truncates massive tool output strings so they do not inflate DOM memory.
 */
function sanitizeOutput(output?: string, preview?: string): string | undefined {
  const content = output || preview
  if (!content) return undefined
  if (content.length > 2500) {
    return (
      content.slice(0, 2500) +
      `\n\n... [output truncated: ${content.length} characters total]`
    )
  }
  return content
}

/**
 * Parses raw ToolCallItem into clean human-readable action metadata.
 */
export function parseToolCall(tc: ToolCallItem): ParsedToolCall {
  const name = tc.name || ""
  const args = tc.args || {}

  // 1. Run terminal command
  if (name === "run_command" || name === "execute_command" || name === "bash") {
    const cmd = (args.CommandLine || args.command || tc.summary || "").trim()
    const desc = args.toolSummary || args.toolAction || ""
    return {
      actionLabel: "Run",
      actionIcon: "terminal",
      target: cmd ? `$ ${cmd}` : "$ Command",
      fullTarget: cmd,
      secondary: desc,
      command: cmd,
      output: sanitizeOutput(tc.output, tc.preview),
      blobRef: tc.blobRef,
      rawArgs: sanitizeRawArgs(tc.args),
    }
  }

  // 2. Read file or URL
  if (
    name === "view_file" ||
    name === "read_file" ||
    name === "read_url_content" ||
    name === "read_browser_page"
  ) {
    const rawPath = (
      tc.targetFile ||
      args.AbsolutePath ||
      args.path ||
      args.Url ||
      args.url ||
      ""
    )
      .toString()
      .trim()
    const filePath = rawPath ? cleanFilePath(rawPath) : ""
    const hasValidPath = Boolean(filePath && filePath !== name)
    const baseName = hasValidPath
      ? filePath.split("/").filter(Boolean).pop() || filePath
      : ""

    let lineInfo = ""
    if (args.StartLine && args.EndLine) {
      lineInfo = `L${args.StartLine}-${args.EndLine}`
    } else if (args.StartLine) {
      lineInfo = `L${args.StartLine}`
    }

    const secondary =
      hasValidPath && lineInfo
        ? args.toolSummary || args.toolAction || ""
        : lineInfo ||
          args.toolSummary ||
          args.toolAction ||
          (hasValidPath ? "" : tc.summary || "")

    const displayTarget = hasValidPath
      ? lineInfo
        ? `${baseName} · ${lineInfo}`
        : baseName
      : tc.summary || "File"

    return {
      actionLabel: "Read",
      actionIcon: "file",
      target: displayTarget,
      fullTarget: hasValidPath ? filePath : "",
      secondary,
      targetFile: hasValidPath ? filePath : undefined,
      output: sanitizeOutput(tc.output, tc.preview),
      blobRef: tc.blobRef,
      rawArgs: sanitizeRawArgs(tc.args),
    }
  }

  // 3. Edit / Write / Create / Delete file
  if (
    name === "write_to_file" ||
    name === "replace_file_content" ||
    name === "create_file" ||
    name === "delete_file" ||
    name === "edit_file"
  ) {
    const rawPath = (
      tc.targetFile ||
      args.TargetFile ||
      args.targetFile ||
      args.path ||
      args.target ||
      ""
    )
      .toString()
      .trim()
    const filePath = rawPath ? cleanFilePath(rawPath) : ""
    const hasValidPath = Boolean(filePath && filePath !== name)
    const baseName = hasValidPath
      ? filePath.split("/").filter(Boolean).pop() || filePath
      : ""
    const actionLabel = name === "delete_file" ? "Delete" : "Edit"

    let secondary =
      args.Description ||
      args.Instruction ||
      args.toolSummary ||
      args.toolAction ||
      ""

    let linesCount: number | undefined
    if (name === "write_to_file" && typeof args.CodeContent === "string") {
      linesCount = args.CodeContent.split("\n").length
      if (!secondary) {
        secondary = `${linesCount} lines written`
      }
    } else if (
      name === "replace_file_content" &&
      typeof args.ReplacementContent === "string"
    ) {
      const repLines = args.ReplacementContent.split("\n").length
      linesCount = repLines
    }

    return {
      actionLabel,
      actionIcon: "edit",
      target: hasValidPath ? baseName : tc.summary || "File",
      fullTarget: hasValidPath ? filePath : "",
      secondary,
      targetFile: hasValidPath ? filePath : undefined,
      output: sanitizeOutput(tc.output, tc.preview),
      blobRef: tc.blobRef,
      rawArgs: sanitizeRawArgs(tc.args),
      linesCount,
    }
  }

  // 4. Search
  if (
    name === "search_web" ||
    name === "search_code" ||
    name === "grep" ||
    name === "code_search"
  ) {
    const query = (args.query || args.pattern || tc.summary || "").trim()
    return {
      actionLabel: "Search",
      actionIcon: "search",
      target: query ? `"${query}"` : "Search",
      fullTarget: query,
      secondary: args.toolSummary || "",
      output: sanitizeOutput(tc.output, tc.preview),
      blobRef: tc.blobRef,
      rawArgs: sanitizeRawArgs(tc.args),
    }
  }
  // 5. CodeGraph Knowledge Engine tools
  if (
    name === "get_file_outline" ||
    name === "get_symbol_definition" ||
    name === "find_callers" ||
    name === "find_callees" ||
    name === "query_subgraph" ||
    name === "read_symbol_body" ||
    name === "get_diff_impact"
  ) {
    if (name === "get_file_outline") {
      const filePath = (args.file_path || tc.targetFile || "").toString().trim()
      const baseName = filePath ? filePath.split("/").pop() || filePath : "File"
      return {
        actionLabel: "Outline",
        actionIcon: "symbol",
        target: baseName,
        fullTarget: filePath,
        secondary: filePath !== baseName ? filePath : "",
        targetFile: filePath || undefined,
        output: sanitizeOutput(tc.output, tc.preview),
        blobRef: tc.blobRef,
        rawArgs: sanitizeRawArgs(tc.args),
      }
    }

    if (name === "get_symbol_definition") {
      const symName = (args.name || "").toString().trim()
      const fileHint = (args.file_hint || "").toString().trim()
      return {
        actionLabel: "Def",
        actionIcon: "code",
        target: symName || "Symbol",
        fullTarget: symName,
        secondary: fileHint ? `in ${fileHint}` : "",
        output: sanitizeOutput(tc.output, tc.preview),
        blobRef: tc.blobRef,
        rawArgs: sanitizeRawArgs(tc.args),
      }
    }

    if (name === "find_callers") {
      const fnName = (args.function_name || "").toString().trim()
      return {
        actionLabel: "Callers",
        actionIcon: "branch",
        target: fnName ? `← ${fnName}` : "Callers",
        fullTarget: fnName,
        secondary: args.limit ? `limit ${args.limit}` : "max 15",
        output: sanitizeOutput(tc.output, tc.preview),
        blobRef: tc.blobRef,
        rawArgs: sanitizeRawArgs(tc.args),
      }
    }

    if (name === "find_callees") {
      const fnName = (args.function_name || "").toString().trim()
      return {
        actionLabel: "Callees",
        actionIcon: "branch",
        target: fnName ? `→ ${fnName}` : "Callees",
        fullTarget: fnName,
        secondary: args.file_hint ? `in ${args.file_hint}` : "",
        output: sanitizeOutput(tc.output, tc.preview),
        blobRef: tc.blobRef,
        rawArgs: sanitizeRawArgs(tc.args),
      }
    }

    if (name === "query_subgraph") {
      const rootSym = (args.root_symbol || "").toString().trim()
      return {
        actionLabel: "Graph",
        actionIcon: "zap",
        target: rootSym ? `Graph · ${rootSym}` : "Subgraph",
        fullTarget: rootSym,
        secondary: args.depth ? `${args.depth} hops` : "2 hops",
        output: sanitizeOutput(tc.output, tc.preview),
        blobRef: tc.blobRef,
        rawArgs: sanitizeRawArgs(tc.args),
      }
    }

    if (name === "read_symbol_body") {
      const symName = (args.name || "").toString().trim()
      const filePath = (args.file_path || "").toString().trim()
      return {
        actionLabel: "Body",
        actionIcon: "file",
        target: symName || filePath || "Symbol",
        fullTarget: filePath,
        secondary: filePath ? filePath : "",
        targetFile: filePath || undefined,
        output: sanitizeOutput(tc.output, tc.preview),
        blobRef: tc.blobRef,
        rawArgs: sanitizeRawArgs(tc.args),
      }
    }

    if (name === "get_diff_impact") {
      const staged = Boolean(args.staged)
      return {
        actionLabel: "Impact",
        actionIcon: "git",
        target: staged ? "Staged Git Diff" : "Working Tree Diff",
        fullTarget: staged ? "git diff --cached" : "git diff",
        secondary: "Topology Impact",
        output: sanitizeOutput(tc.output, tc.preview),
        blobRef: tc.blobRef,
        rawArgs: sanitizeRawArgs(tc.args),
      }
    }
  }

  // 5. Fallback for other tools
  const formattedName = name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return {
    actionLabel: formattedName || "Tool",
    actionIcon: "code",
    target: tc.summary || name,
    fullTarget: tc.summary || name,
    secondary: "",
    output: sanitizeOutput(tc.output, tc.preview),
    blobRef: tc.blobRef,
    rawArgs: sanitizeRawArgs(tc.args),
  }
}

export interface ToolCallActivityCardProps {
  toolCall: ToolCallItem
  onOpenFile?: (path: string) => void
  stepNumber?: number
  totalSteps?: number
}

export const ToolCallActivityCard = memo(function ToolCallActivityCard({
  toolCall,
  onOpenFile,
  stepNumber,
  totalSteps,
}: ToolCallActivityCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showRawArgs, setShowRawArgs] = useState(false)
  const [copiedOutput, setCopiedOutput] = useState(false)
  const parsed = useMemo(() => parseToolCall(toolCall), [toolCall])

  const isRunning = toolCall.status === "running"
  const isError = toolCall.status === "error"

  const handleCopyOutput = () => {
    if (navigator?.clipboard && parsed.output) {
      navigator.clipboard.writeText(parsed.output)
      setCopiedOutput(true)
      setTimeout(() => setCopiedOutput(false), 2000)
    }
  }

  return (
    <div
      className={`tool-call-chip transition-colors ${
        isError ? "border-error/50 bg-error/5" : ""
      }`}
    >
      <div className="tool-call-summary w-full flex items-center gap-1.5 select-none">
        <button
          type="button"
          className="shrink-0 flex items-center justify-center cursor-pointer"
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? "Collapse details" : "Expand details"}
          aria-expanded={isOpen}
        >
          <span
            className={`tool-call-status shrink-0 ${
              isRunning
                ? "status-running"
                : isError
                  ? "status-error"
                  : "status-success"
            }`}
          >
            <Icon
              name={isRunning ? "refresh" : isError ? "error" : "check"}
              size={11}
              className={isRunning ? "animate-spin" : ""}
            />
          </span>
        </button>

        {stepNumber !== undefined && (
          <span className="shrink-0 px-1 py-0.5 rounded text-[9.5px] font-mono text-ink-muted bg-surface-raised border border-line">
            #{stepNumber}
            {totalSteps ? `/${totalSteps}` : ""}
          </span>
        )}

        {/* Action badge */}
        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-raised border border-line text-ink flex items-center gap-1">
          <Icon name={parsed.actionIcon} size={10} />
          <span>{parsed.actionLabel}</span>
        </span>

        {/* Action target - If targetFile exists, click navigates directly to file in editor */}
        {parsed.targetFile && onOpenFile ? (
          <button
            type="button"
            className="font-mono text-[11px] text-accent hover:underline truncate min-w-0 flex-1 text-left cursor-pointer flex items-center gap-1"
            onClick={(e) => {
              e.stopPropagation()
              onOpenFile(parsed.fullTarget)
            }}
            title={`Open ${parsed.fullTarget} in editor`}
          >
            <span className="truncate">{parsed.target}</span>
          </button>
        ) : (
          <button
            type="button"
            className="font-mono text-[11px] text-ink truncate min-w-0 flex-1 text-left cursor-pointer"
            onClick={() => setIsOpen((prev) => !prev)}
            title={parsed.fullTarget}
          >
            <span className="truncate">{parsed.target}</span>
          </button>
        )}

        {/* Secondary description */}
        {parsed.secondary && (
          <span
            className="text-[10px] text-ink-muted truncate hidden sm:inline max-w-[180px] cursor-pointer"
            title={parsed.secondary}
            onClick={() => setIsOpen((prev) => !prev)}
          >
            {parsed.secondary}
          </span>
        )}

        {/* Quick Open badge if targetFile exists */}
        {parsed.targetFile && onOpenFile && (
          <button
            type="button"
            className="shrink-0 px-1.5 py-0.5 rounded text-[10px] text-accent hover:bg-surface-raised border border-line cursor-pointer flex items-center gap-0.5"
            onClick={(e) => {
              e.stopPropagation()
              onOpenFile(parsed.fullTarget)
            }}
            title={`Open ${parsed.fullTarget} in editor`}
          >
            <span>Open</span>
          </button>
        )}

        {/* Expand toggle chevron */}
        <button
          type="button"
          className={`shrink-0 text-ink-muted transition-transform duration-150 p-0.5 cursor-pointer hover:text-ink ${
            isOpen ? "rotate-90" : ""
          }`}
          onClick={() => setIsOpen((prev) => !prev)}
          title={isOpen ? "Collapse" : "Expand"}
        >
          <Icon name="chevron" size={10} />
        </button>
      </div>

      {isOpen && (
        <div className="tool-call-details p-2 border-t border-line bg-canvas/60 text-xs flex flex-col gap-2">
          {/* Detailed Target / Command */}
          {parsed.command && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                Command
              </span>
              <pre className="p-1.5 rounded bg-surface border border-line font-mono text-[11px] text-accent select-all overflow-x-auto whitespace-pre-wrap">
                <code>{parsed.command}</code>
              </pre>
            </div>
          )}

          {parsed.targetFile && (
            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-surface border border-line">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon name="file" size={11} className="shrink-0 text-accent" />
                <span
                  className="font-mono text-[11px] text-ink truncate"
                  title={parsed.fullTarget}
                >
                  {parsed.fullTarget}
                </span>
              </div>
              {onOpenFile && (
                <button
                  type="button"
                  className="shrink-0 text-[10px] text-accent hover:underline cursor-pointer"
                  onClick={() => onOpenFile(parsed.fullTarget)}
                >
                  Open
                </button>
              )}
            </div>
          )}

          {parsed.secondary && !parsed.command && (
            <p className="text-[11px] text-ink-muted">{parsed.secondary}</p>
          )}

          {/* Formatted Output capped at max-h-40 (~160px) */}
          {parsed.output && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
                  Output
                </span>
                <button
                  type="button"
                  className="text-[10px] text-ink-muted hover:text-ink cursor-pointer flex items-center gap-1"
                  onClick={handleCopyOutput}
                  title="Copy output"
                >
                  <Icon name={copiedOutput ? "check" : "copy"} size={10} />
                  <span>{copiedOutput ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre className="max-h-40 overflow-y-auto p-2 rounded bg-surface border border-line font-mono text-[10.5px] text-ink-soft whitespace-pre-wrap select-all">
                <code>{parsed.output}</code>
              </pre>
            </div>
          )}

          {/* Optional Sanitized Raw Arguments Toggle */}
          {parsed.rawArgs && Object.keys(parsed.rawArgs).length > 0 && (
            <div className="pt-1 border-t border-line/60">
              <button
                type="button"
                className="text-[10px] text-ink-muted hover:text-ink cursor-pointer flex items-center gap-1"
                onClick={() => setShowRawArgs((v) => !v)}
              >
                <Icon
                  name="chevron"
                  size={9}
                  className={showRawArgs ? "rotate-90" : ""}
                />
                <span>
                  {showRawArgs ? "Hide raw arguments" : "View raw arguments"}
                </span>
              </button>
              {showRawArgs && (
                <pre className="mt-1.5 max-h-36 overflow-auto p-2 rounded bg-surface border border-line font-mono text-[9.5px] text-ink-muted">
                  <code>{JSON.stringify(parsed.rawArgs, null, 2)}</code>
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})

export interface ToolCallStepperProps {
  toolCalls: ToolCallItem[]
  onOpenFile?: (path: string) => void
}

/**
 * Activity Stepper: Groups multiple consecutive tool calls into a unified, collapsible stepper feed.
 */
export const ToolCallStepper = memo(function ToolCallStepper({
  toolCalls,
  onOpenFile,
}: ToolCallStepperProps) {
  if (!toolCalls || toolCalls.length === 0) return null

  // If only 1 tool call, render single card directly
  if (toolCalls.length === 1) {
    return (
      <ToolCallActivityCard toolCall={toolCalls[0]} onOpenFile={onOpenFile} />
    )
  }

  // Multi-tool stepper (2+ tools)
  const isAnyRunning = toolCalls.some((t) => t.status === "running")
  const isAnyError = toolCalls.some((t) => t.status === "error")
  const runningCount = toolCalls.filter((t) => t.status === "running").length
  const errorCount = toolCalls.filter((t) => t.status === "error").length

  // Counts by action label (memoized)
  const { parsedCalls, actionCounts } = useMemo(() => {
    const parsed = toolCalls.map(parseToolCall)
    const counts: Record<string, number> = {}
    parsed.forEach((p) => {
      counts[p.actionLabel] = (counts[p.actionLabel] || 0) + 1
    })
    return { parsedCalls: parsed, actionCounts: counts }
  }, [toolCalls])

  // Open by default if running or error, otherwise collapsed
  const [isOpen, setIsOpen] = useState(isAnyRunning || isAnyError)

  const summaryTitle = isAnyRunning
    ? `Running ${runningCount} action${runningCount > 1 ? "s" : ""}...`
    : isAnyError
      ? `Completed ${toolCalls.length} actions (${errorCount} failed)`
      : `Executed ${toolCalls.length} actions`

  return (
    <div
      className={`tool-stepper-container rounded-md border transition-colors ${
        isAnyError
          ? "border-error/40 bg-error/5"
          : isAnyRunning
            ? "border-accent/40 bg-accent/5"
            : "border-line bg-surface"
      }`}
    >
      <button
        type="button"
        className="tool-stepper-header w-full flex items-center justify-between p-2 cursor-pointer text-left select-none"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`tool-call-status shrink-0 ${
              isAnyRunning
                ? "status-running"
                : isAnyError
                  ? "status-error"
                  : "status-success"
            }`}
          >
            <Icon
              name={isAnyRunning ? "refresh" : isAnyError ? "error" : "check"}
              size={11}
              className={isAnyRunning ? "animate-spin" : ""}
            />
          </span>

          <span className="font-semibold text-xs text-ink truncate">
            {summaryTitle}
          </span>

          <div className="hidden sm:flex items-center gap-1 shrink-0 ml-1">
            {Object.entries(actionCounts).map(([label, count]) => (
              <span
                key={label}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-surface-raised border border-line text-ink-muted"
              >
                {label} ({count})
              </span>
            ))}
          </div>
        </div>

        <span
          className={`shrink-0 text-ink-muted transition-transform duration-150 ${
            isOpen ? "rotate-90" : ""
          }`}
        >
          <Icon name="chevron" size={11} />
        </span>
      </button>

      {isOpen && (
        <div className="tool-stepper-body p-2 border-t border-line flex flex-col gap-1.5 bg-canvas/40">
          {toolCalls.map((tc, idx) => (
            <div key={tc.id || idx} className="relative flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <ToolCallActivityCard
                  toolCall={tc}
                  onOpenFile={onOpenFile}
                  stepNumber={idx + 1}
                  totalSteps={toolCalls.length}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

function ToolOutputBlock({
  output,
  blobRef,
}: {
  output?: string
  blobRef?: string
}) {
  const [fullOutput, setFullOutput] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const content = fullOutput || output || ""

  const handleFetchBlob = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!blobRef || loading) return
    setLoading(true)
    const res = await fetchChatBlob(blobRef)
    if (res) setFullOutput(res)
    setLoading(false)
  }

  if (!content) return null

  return (
    <div className="timeline-detail-item">
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="detail-label">Output:</span>
        <div className="flex items-center gap-1">
          {blobRef && !fullOutput && (
            <button
              type="button"
              className="detail-copy-btn"
              onClick={handleFetchBlob}
              disabled={loading}
            >
              <span>{loading ? "Loading..." : "Load full output"}</span>
            </button>
          )}
          <button
            type="button"
            className="detail-copy-btn"
            onClick={(e) => {
              e.stopPropagation()
              if (navigator?.clipboard && content) {
                navigator.clipboard.writeText(content)
              }
            }}
          >
            <Icon name="copy" size={9} />
            <span>Copy</span>
          </button>
        </div>
      </div>
      <pre className="detail-output">
        <code>{content}</code>
      </pre>
    </div>
  )
}

export interface UnifiedActivityTimelineProps {
  thinking?: string
  toolCalls?: ToolCallItem[]
  isStreaming?: boolean
  error?: string
  onOpenFile?: (path: string) => void
  onOpenSettings?: () => void
}

/**
 * Unified Activity Timeline: Combines thinking process, tool actions, and execution notices
 * into a single minimalist collapsible timeline stream with auto-collapse.
 */
export const UnifiedActivityTimeline = memo(function UnifiedActivityTimeline({
  thinking,
  toolCalls = [],
  isStreaming = false,
  error,
  onOpenFile,
  onOpenSettings,
}: UnifiedActivityTimelineProps) {
  if (!thinking && toolCalls.length === 0 && !error) return null

  const isAnyRunning =
    toolCalls.some((t) => t.status === "running") ||
    (isStreaming && Boolean(thinking || toolCalls.length > 0))
  const isAnyError =
    Boolean(error) || toolCalls.some((t) => t.status === "error")

  // Auto-collapse: Open while actively streaming/running, auto-collapsed when done (unless user manually toggles)
  const [userOverride, setUserOverride] = useState<boolean | null>(null)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)

  const isOpen =
    userOverride !== null
      ? userOverride
      : Boolean(isStreaming || isAnyRunning || isAnyError)

  const handleToggle = () => {
    setUserOverride(!isOpen)
  }

  // Count actions by label
  const { parsedCalls, actionCounts } = useMemo(() => {
    const parsed = toolCalls.map(parseToolCall)
    const counts: Record<string, number> = {}
    parsed.forEach((p) => {
      counts[p.actionLabel] = (counts[p.actionLabel] || 0) + 1
    })
    return { parsedCalls: parsed, actionCounts: counts }
  }, [toolCalls])

  // Summary title
  const summaryTitle = useMemo(() => {
    if (isAnyRunning) {
      return toolCalls.length > 0
        ? `Running ${toolCalls.length} action${
            toolCalls.length > 1 ? "s" : ""
          }...`
        : "Thinking & analyzing..."
    }
    if (isAnyError) {
      return error
        ? "Execution interrupted"
        : `Completed with errors (${toolCalls.filter((t) => t.status === "error").length} failed)`
    }
    if (toolCalls.length > 0) {
      return `${toolCalls.length} action${
        toolCalls.length > 1 ? "s" : ""
      } taken`
    }
    return "Thought process"
  }, [isAnyRunning, isAnyError, error, toolCalls])

  return (
    <div
      className={`unified-timeline-container ${
        isAnyError ? "timeline-has-error" : ""
      } ${isAnyRunning ? "timeline-is-running" : ""}`}
    >
      {/* 1-Line Compact Summary Bar */}
      <button
        type="button"
        className="unified-timeline-bar"
        onClick={handleToggle}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span
            className={`timeline-status-icon ${
              isAnyRunning
                ? "status-running"
                : isAnyError
                  ? "status-error"
                  : "status-success"
            }`}
          >
            <Icon
              name={isAnyRunning ? "refresh" : isAnyError ? "warning" : "check"}
              size={11}
              className={isAnyRunning ? "animate-spin" : ""}
            />
          </span>

          <span className="timeline-title-text">{summaryTitle}</span>

          {/* Action count badges */}
          {!isAnyRunning &&
            !isAnyError &&
            Object.keys(actionCounts).length > 0 && (
              <div className="hidden sm:flex items-center gap-1 shrink-0 ml-1">
                {Object.entries(actionCounts).map(([label, count]) => (
                  <span key={label} className="timeline-action-badge">
                    {label} {count}
                  </span>
                ))}
              </div>
            )}
        </div>

        <span className={`timeline-chevron ${isOpen ? "rotate-90" : ""}`}>
          <Icon name="chevron" size={10} />
        </span>
      </button>

      {/* Expanded Timeline Tree */}
      {isOpen && (
        <div className="unified-timeline-tree">
          {/* Thinking step */}
          {thinking && (
            <div className="timeline-node timeline-node-thinking">
              <span className="timeline-node-dot dot-thinking">
                <Icon name="brain" size={10} />
              </span>
              <div className="timeline-node-content">
                <div className="timeline-node-header">
                  <span className="text-[11px] font-medium text-ink-muted">
                    Thinking Process
                  </span>
                  {isStreaming && (
                    <span className="text-[9.5px] text-accent animate-pulse">
                      In progress...
                    </span>
                  )}
                </div>
                <div className="timeline-thinking-body">
                  {isStreaming && thinking.length > 3000
                    ? "... [earlier thinking windowed]\n\n" +
                      thinking.slice(-3000)
                    : thinking}
                </div>
              </div>
            </div>
          )}

          {/* Tool Calls */}
          {parsedCalls.map((parsed, idx) => {
            const rawTc = toolCalls[idx]
            const isStepRunning = rawTc.status === "running"
            const isStepError = rawTc.status === "error"
            const isStepExpanded = expandedStepId === (rawTc.id || String(idx))

            return (
              <div key={rawTc.id || idx} className="timeline-node">
                <span
                  className={`timeline-node-dot ${
                    isStepRunning
                      ? "dot-running"
                      : isStepError
                        ? "dot-error"
                        : "dot-success"
                  }`}
                >
                  <Icon
                    name={
                      isStepRunning
                        ? "refresh"
                        : isStepError
                          ? "error"
                          : "check"
                    }
                    size={9}
                    className={isStepRunning ? "animate-spin" : ""}
                  />
                </span>

                <div className="timeline-node-content">
                  <div
                    className="timeline-node-row cursor-pointer select-none"
                    onClick={() =>
                      setExpandedStepId(
                        isStepExpanded ? null : rawTc.id || String(idx),
                      )
                    }
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-ink-muted shrink-0">
                        <Icon name={parsed.actionIcon} size={11} />
                      </span>

                      <span className="text-[11px] font-medium text-ink truncate">
                        {parsed.actionLabel}{" "}
                        {parsed.targetFile ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (onOpenFile && parsed.targetFile) {
                                onOpenFile(parsed.targetFile)
                              }
                            }}
                            className="font-mono text-accent hover:underline cursor-pointer"
                          >
                            {parsed.targetFile.split("/").filter(Boolean).pop()}
                          </span>
                        ) : (
                          <span className="font-mono text-ink-soft">
                            {parsed.target}
                          </span>
                        )}
                      </span>

                      {parsed.secondary && (
                        <span className="text-[10px] text-ink-muted truncate hidden sm:inline">
                          · {parsed.secondary}
                        </span>
                      )}
                    </div>

                    {(parsed.output || parsed.rawArgs) && (
                      <span className="text-[9.5px] text-ink-muted hover:text-ink shrink-0 ml-2">
                        {isStepExpanded ? "Hide" : "Details"}
                      </span>
                    )}
                  </div>

                  {/* Inline on-demand details */}
                  {isStepExpanded && (
                    <div className="timeline-node-details">
                      {parsed.command && (
                        <div className="timeline-detail-item">
                          <span className="detail-label">Command:</span>
                          <code className="detail-code">{parsed.command}</code>
                        </div>
                      )}
                      {parsed.output && (
                        <ToolOutputBlock
                          output={parsed.output}
                          blobRef={parsed.blobRef}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Inline Error node */}
          {error && (
            <div className="timeline-node timeline-node-error">
              <span className="timeline-node-dot dot-error">
                <Icon name="warning" size={10} />
              </span>
              <div className="timeline-node-content">
                <div className="text-[11px] font-medium text-error flex items-center justify-between gap-2">
                  <span>{error}</span>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-surface-raised border border-line text-ink hover:text-accent cursor-pointer"
                    >
                      Settings
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})
