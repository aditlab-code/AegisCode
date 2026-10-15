import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"

export interface ScopeVariable {
  name?: string
  value: string
  type?: string
}

export interface ReplStackFrame {
  name: string
  file?: string
  line?: number
}

export interface ReplEvaluationResult {
  category: "stdout" | "info" | "error"
  output: string
}

export function evaluateReplExpression(
  expr: string,
  isDebugging: boolean,
  debugState: {
    status?: string
    variables?: ScopeVariable[]
    stackFrames?: ReplStackFrame[]
  },
): ReplEvaluationResult | null {
  const trimmed = expr.trim()
  if (!trimmed) return null

  // Response logic: evaluate against active DAP scope variables & expressions
  if (
    !isDebugging ||
    debugState.status === "idle" ||
    debugState.status === "terminated"
  ) {
    return {
      category: "error",
      output:
        "Cannot evaluate expression: No active debug session. Press F5 to start debugging.",
    }
  }

  const vars = debugState.variables || []
  const varMap = new Map<string, ScopeVariable>()
  for (const v of vars) {
    varMap.set(v.name, { value: v.value, type: v.type })
  }

  if (trimmed === ":vars" || trimmed === "locals") {
    if (vars.length === 0) {
      return {
        category: "info",
        output: "(no local variables in current frame)",
      }
    }
    const dump = vars
      .map((v) => `${v.name}${v.type ? ` (${v.type})` : ""} = ${v.value}`)
      .join("\n")
    return { category: "stdout", output: dump }
  }

  if (trimmed === ":stack" || trimmed === "bt") {
    const frames = debugState.stackFrames || []
    if (frames.length === 0) {
      return { category: "info", output: "(call stack empty)" }
    }
    const dump = frames
      .map(
        (f, idx) =>
          `#${idx} ${f.name} at ${f.file || "unknown"}:${f.line || 0}`,
      )
      .join("\n")
    return { category: "stdout", output: dump }
  }

  // Check if expression directly matches a local variable in debugState.variables
  const directVar = varMap.get(trimmed) || vars.find((v) => v.name === trimmed)
  if (directVar) {
    return {
      category: "stdout",
      output: `${directVar.value}${
        directVar.type ? ` (${directVar.type})` : ""
      }`,
    }
  }

  // Attempt safe expression evaluation with current frame variables injected
  try {
    const argNames: string[] = []
    const argValues: unknown[] = []
    for (const [k, v] of varMap.entries()) {
      if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k)) {
        argNames.push(k)
        try {
          argValues.push(JSON.parse(v.value))
        } catch {
          argValues.push(v.value)
        }
      }
    }

    let result: unknown
    try {
      const fn = new Function(...argNames, `"use strict"; return (${trimmed});`)
      result = fn(...argValues)
    } catch {
      // If return (${trimmed}) fails (e.g. statement), attempt evaluation as statement block
      const fn = new Function(...argNames, `"use strict"; ${trimmed};`)
      result = fn(...argValues)
    }

    const formatted =
      typeof result === "object" && result !== null
        ? JSON.stringify(result, null, 2)
        : String(result)
    return { category: "stdout", output: formatted }
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    return {
      category: "error",
      output: `Evaluation error: ${errMsg}. Expression "${trimmed}" could not be evaluated in current frame (tip: type "locals" or ":stack" to inspect active scope).`,
    }
  }
}

export function DebugConsoleView() {
  const {
    debugConsoleLogs,
    clearDebugConsole,
    addDebugConsoleLog,
    isDebugging,
    debugState,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      debugConsoleLogs: s.debugConsoleLogs,
      clearDebugConsole: s.clearDebugConsole,
      addDebugConsoleLog: s.addDebugConsoleLog,
      isDebugging: s.isDebugging,
      debugState: s.debugState,
      showToast: s.showToast,
    })),
  )

  const [inputVal, setInputVal] = useState("")
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState<number>(-1)
  const [filterText, setFilterText] = useState("")

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom on new log
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [debugConsoleLogs.length])

  const filteredLogs = filterText
    ? debugConsoleLogs.filter((log) =>
        log.message.toLowerCase().includes(filterText.toLowerCase()),
      )
    : debugConsoleLogs

  const handleCopy = useCallback(() => {
    if (debugConsoleLogs.length === 0) {
      showToast("Debug console is empty")
      return
    }
    const text = debugConsoleLogs
      .map((l) => `[${l.timestamp}] [${l.category.toUpperCase()}] ${l.message}`)
      .join("\n")
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(text)
      showToast("Debug console output copied to clipboard")
    }
  }, [debugConsoleLogs, showToast])

  const executeRepl = useCallback(
    (expr: string) => {
      const res = evaluateReplExpression(expr, isDebugging, debugState)
      if (res) {
        addDebugConsoleLog(res.category, res.output)
      }
    },
    [isDebugging, debugState, addDebugConsoleLog],
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = inputVal.trim()
    if (!trimmed) return

    // Record user command
    addDebugConsoleLog("input", trimmed)
    setHistory((prev) => [...prev, trimmed])
    setHistoryIndex(-1)
    setInputVal("")

    executeRepl(trimmed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (history.length === 0) return
      const nextIndex =
        historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setInputVal(history[nextIndex] || "")
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      if (history.length === 0 || historyIndex === -1) return
      const nextIndex = historyIndex + 1
      if (nextIndex >= history.length) {
        setHistoryIndex(-1)
        setInputVal("")
      } else {
        setHistoryIndex(nextIndex)
        setInputVal(history[nextIndex] || "")
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-canvas text-xs font-mono select-none overflow-hidden">
      {/* Console Sub-header / Filter Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-line text-[11px] shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink-muted uppercase tracking-wider">
            Console
          </span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-line text-ink-muted">
            {filteredLogs.length} entries
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter output..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="px-2 py-0.5 rounded bg-canvas border border-line text-[11px] text-ink placeholder:text-ink-muted/50 focus:outline-none focus:border-accent w-36"
          />
          <IconButton label="Copy all logs" onClick={handleCopy}>
            <Icon name="copy" size={12} />
          </IconButton>
          <IconButton
            label="Clear console"
            onClick={() => {
              clearDebugConsole()
              showToast("Debug console cleared")
            }}
          >
            <Icon name="discard" size={12} />
          </IconButton>
        </div>
      </div>

      {/* Log Output Stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[11px] select-text"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-ink-muted/60 select-none py-8 font-sans">
            <Icon name="debug" size={24} className="mb-2 opacity-40" />
            <p className="text-xs">Debug Console is empty</p>
            <p className="text-[11px] text-ink-muted/50 mt-1">
              Start debugging (F5) to see runtime output and evaluate
              expressions.
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isInput = log.category === "input"
            const isStderr =
              log.category === "stderr" || log.category === "error"
            const isInfo = log.category === "info"

            return (
              <div
                key={log.id}
                className={`flex items-start gap-2 px-1.5 py-0.5 rounded leading-relaxed hover:bg-surface/50 ${
                  isStderr
                    ? "text-error"
                    : isInput
                      ? "text-ink font-semibold"
                      : isInfo
                        ? "text-ink-muted"
                        : "text-ink"
                }`}
              >
                <span className="text-[10px] text-ink-muted/60 shrink-0 font-mono select-none">
                  {log.timestamp}
                </span>

                {isInput && (
                  <span className="text-accent select-none shrink-0 font-bold">
                    &gt;
                  </span>
                )}

                <span className="whitespace-pre-wrap break-all flex-1 font-mono">
                  {log.message}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* Interactive REPL Prompt */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-2.5 py-1.5 bg-surface border-t border-line shrink-0"
      >
        <span className="text-accent font-bold text-xs select-none">&gt;</span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isDebugging
              ? "Evaluate expression in current scope... (press Enter)"
              : "Debug session not active (F5 to start)"
          }
          className="flex-1 bg-transparent text-ink placeholder:text-ink-muted/50 text-[11px] font-mono focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inputVal.trim()}
          className="px-2 py-0.5 rounded bg-accent text-accent-contrast text-[10px] font-semibold disabled:opacity-30 cursor-pointer"
        >
          Eval
        </button>
      </form>
    </div>
  )
}
