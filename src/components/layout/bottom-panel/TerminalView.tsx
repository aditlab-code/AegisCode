import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function TerminalView() {
  const {
    terminalLines,
    terminalRunning,
    setTerminalRunning,
    sendTerminalCommand,
    activeTerminalSession,
  } = useWorkbench()

  const [command, setCommand] = useState("")
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const history = activeTerminalSession?.commandHistory || []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto" })
  }, [terminalLines])

  function handleRun() {
    if (!command.trim()) return
    sendTerminalCommand(command)
    setCommand("")
    setHistoryIndex(null)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault()
      handleRun()
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      if (history.length === 0) return

      const nextIndex =
        historyIndex === null
          ? history.length - 1
          : Math.max(0, historyIndex - 1)
      setHistoryIndex(nextIndex)
      setCommand(history[nextIndex] || "")
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      if (historyIndex === null) return

      if (historyIndex < history.length - 1) {
        const nextIndex = historyIndex + 1
        setHistoryIndex(nextIndex)
        setCommand(history[nextIndex] || "")
      } else {
        setHistoryIndex(null)
        setCommand("")
      }
    } else if (event.key === "c" && event.ctrlKey) {
      if (command) {
        sendTerminalCommand(`${command} ^C`)
        setCommand("")
      } else {
        setTerminalRunning(false)
      }
    }
  }

  return (
    <div className="terminal-session">
      <div className="terminal-history">
        <p>
          <span className="terminal-prompt">aegis</span>{" "}
          <span className="text-muted">~/projects/aegiscode</span>{" "}
          <span className="syntax-blue">
            {activeTerminalSession?.shell || "zsh"}
          </span>
        </p>
        {terminalLines.map((line, index) => (
          <p
            className={
              line.includes("SSE")
                ? "terminal-event"
                : line.startsWith("➜")
                  ? "terminal-ok"
                  : line.includes("^C")
                    ? "terminal-error"
                    : ""
            }
            key={`${line}-${index}`}
          >
            {line}
          </p>
        ))}
        <div ref={bottomRef} />
      </div>
      <label className="terminal-command">
        <span className="terminal-prompt">aegis</span>
        <span className="text-muted">$</span>
        <input
          aria-label="Terminal command"
          disabled={!terminalRunning}
          onChange={(event) => {
            setCommand(event.target.value)
            setHistoryIndex(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder={
            terminalRunning
              ? "Type a command (↑/↓ history)…"
              : "Terminal terminated"
          }
          value={command}
        />
        {terminalRunning && <span className="cursor-block" />}
      </label>
    </div>
  )
}
