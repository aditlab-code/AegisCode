import { useState } from "react"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function TerminalView() {
  const {
    terminalLines,
    terminalRunning,
    setTerminalRunning,
    sendTerminalCommand,
  } = useWorkbench()
  const [command, setCommand] = useState("")

  function handleRun() {
    if (!command.trim()) return
    sendTerminalCommand(command)
    setCommand("")
  }

  return (
    <div className="terminal-session">
      <div className="terminal-history">
        <p>
          <span className="terminal-prompt">aegis</span>{" "}
          <span className="text-muted">~/projects/aegiscode</span>{" "}
          <span className="syntax-blue">main</span>
        </p>
        {terminalLines.map((line, index) => (
          <p
            className={
              line.includes("SSE")
                ? "terminal-event"
                : line.startsWith("➜")
                  ? "terminal-ok"
                  : ""
            }
            key={`${line}-${index}`}
          >
            {line}
          </p>
        ))}
      </div>
      <label className="terminal-command">
        <span className="terminal-prompt">aegis</span>
        <span className="text-muted">$</span>
        <input
          aria-label="Terminal command"
          disabled={!terminalRunning}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleRun()
            if (event.key === "c" && event.ctrlKey) setTerminalRunning(false)
          }}
          placeholder={
            terminalRunning ? "Type a command…" : "Terminal terminated"
          }
          value={command}
        />
        {terminalRunning && <span className="cursor-block" />}
      </label>
    </div>
  )
}
