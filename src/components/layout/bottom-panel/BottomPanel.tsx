import { useState, useEffect, type DragEvent } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { ResizeSash } from "../../ui/ResizeSash"
import { useWorkbench } from "../../../context/WorkbenchContext"
import type { BottomTab, OutputChannel } from "../../../types/workbench"
import { TerminalView } from "./TerminalView"
import { ProblemsView } from "./ProblemsView"
import { OutputView } from "./OutputView"

export function BottomPanel() {
  const {
    diagnostics,
    terminalLines,
    terminalRunning,
    setTerminalRunning,
    terminalSessions,
    activeTerminalSessionId,
    setActiveTerminalSessionId,
    createTerminalSession,
    closeTerminalSession,
    clearTerminal,
    activeBottomTab,
    setActiveBottomTab,
    bottomTabOrder,
    reorderBottomTabs,
    panelMaximized,
    togglePanelMaximized,
    setPanelOpen,
    setBottomPanelHeight,
    resetBottomPanelHeight,
    showToast,
  } = useWorkbench()

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [newShell, setNewShell] = useState<string>("zsh")
  const [outputChannel, setOutputChannel] = useState<OutputChannel>("Server")
  const [outputLogs, setOutputLogs] = useState<Record<OutputChannel, string[]>>(
    {
      Server: [
        "[10:38:00] AegisCode Go Core Server connected on http://localhost:8080",
        "[10:38:00] PTY Process Supervisor and SSE event pipelines active",
      ],
      Linter: [
        "[10:42:08] Starting incremental lint across 5 language profiles",
        "[10:42:08] TypeScript · ESLint adapter ready",
        "[10:42:08] JavaScript · ESLint adapter ready",
        "[10:42:08] Python · Ruff adapter ready",
        "[10:42:08] JSON · parser ready",
        "[10:42:08] C++ · clang-tidy adapter ready",
      ],
      Tasks: [
        "[10:40:02] [vite] vite v8.3.4 building client environment for production...",
        "[10:40:03] [server] Local development server running at http://localhost:4173/",
        "[10:40:03] [watcher] File watcher active on src/ directory",
        "[10:40:04] [ready] Dev server ready in 312 ms",
      ],
      Git: [
        "[10:39:15] git status --short",
        "[10:39:15]  M src/App.tsx",
        "[10:39:15]  M src/index.css",
        "[10:39:16] On branch main: Your branch is up to date with 'origin/main'.",
      ],
    },
  )

  useEffect(() => {
    const sse = new EventSource("/api/v1/events/logs")
    sse.addEventListener("log", (event) => {
      try {
        const data = JSON.parse(event.data) as {
          channel?: OutputChannel
          message?: string
          timestamp?: string
        }
        if (data.channel && data.message) {
          const ch = data.channel
          const time = data.timestamp || new Date().toTimeString().slice(0, 8)
          setOutputLogs((prev) => ({
            ...prev,
            [ch]: [...(prev[ch] || []), `[${time}] ${data.message}`],
          }))
        }
      } catch {
        // Safe fallback
      }
    })
    sse.onerror = () => {
      // Disconnect cleanly if server is down to prevent loop
      sse.close()
    }
    return () => {
      sse.close()
    }
  }, [])

  function handleCopy() {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(terminalLines.join("\n"))
      showToast("Terminal output copied to clipboard")
    }
  }

  function handleClearOutput() {
    setOutputLogs((prev) => ({
      ...prev,
      [outputChannel]: [],
    }))
    showToast(`Cleared output channel: ${outputChannel}`)
  }

  function handleDragStart(e: DragEvent<HTMLButtonElement>, index: number) {
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ sourceIndex: index }),
    )
    e.dataTransfer.effectAllowed = "move"
  }

  function handleDrop(e: DragEvent<HTMLButtonElement>, targetIndex: number) {
    e.preventDefault()
    setDragOverIndex(null)
    try {
      const raw = e.dataTransfer.getData("application/json")
      if (!raw) return
      const data = JSON.parse(raw) as { sourceIndex: number }
      if (typeof data.sourceIndex === "number") {
        reorderBottomTabs(data.sourceIndex, targetIndex)
      }
    } catch {
      // safe fallback
    }
  }

  return (
    <section className="bottom-panel">
      {!panelMaximized && (
        <ResizeSash
          className="sash-bottom"
          direction="horizontal"
          onDoubleClick={resetBottomPanelHeight}
          onResize={(delta) => {
            setBottomPanelHeight((prev) => {
              // Dragging upwards (negative delta) increases panel height
              const next = prev - delta
              if (next < 80) {
                setPanelOpen(false)
                return 180
              }
              const maxHeight =
                typeof window !== "undefined"
                  ? Math.floor(window.innerHeight * 0.75)
                  : 600
              return Math.max(100, Math.min(maxHeight, next))
            })
          }}
          title="Drag to resize bottom panel (Double-click to reset)"
        />
      )}
      <div className="bottom-panel-header">
        <div className="bottom-tabs">
          {bottomTabOrder.map((name: BottomTab, index: number) => (
            <button
              className={`bottom-tab-button ${
                activeBottomTab === name ? "bottom-tab-active" : ""
              } ${dragOverIndex === index ? "tab-drag-over" : ""}`}
              draggable
              key={name}
              onClick={() => setActiveBottomTab(name)}
              onDragEnd={() => setDragOverIndex(null)}
              onDragLeave={() => setDragOverIndex(null)}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOverIndex(index)
              }}
              onDragStart={(e) => handleDragStart(e, index)}
              onDrop={(e) => handleDrop(e, index)}
              type="button"
            >
              {name}
              {name === "Problems" && (
                <span className="count-badge">{diagnostics.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="panel-controls">
          {activeBottomTab === "Terminal" && (
            <>
              <select
                aria-label="Select terminal session"
                className="panel-select"
                onChange={(e) => setActiveTerminalSessionId(e.target.value)}
                value={activeTerminalSessionId}
              >
                {terminalSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Shell type"
                className="panel-select"
                onChange={(e) => setNewShell(e.target.value)}
                value={newShell}
              >
                <option value="zsh">zsh</option>
                <option value="bash">bash</option>
                <option value="sh">sh</option>
              </select>
              <IconButton
                label={`New ${newShell} session`}
                onClick={() => createTerminalSession(newShell)}
              >
                <Icon name="plus" size={14} />
              </IconButton>
              <IconButton
                label="Kill terminal session"
                onClick={() => closeTerminalSession(activeTerminalSessionId)}
              >
                <Icon name="trash" size={14} />
              </IconButton>
              <IconButton
                label="Clear terminal buffer"
                onClick={() => clearTerminal()}
              >
                <Icon name="close" size={14} />
              </IconButton>
              <span
                className={
                  terminalRunning ? "session-running" : "session-stopped"
                }
              >
                <span className="status-dot" />{" "}
                {terminalRunning ? "SSE active" : "terminated"}
              </span>
              <IconButton label="Copy terminal output" onClick={handleCopy}>
                <Icon name="copy" size={14} />
              </IconButton>
              <IconButton
                label={
                  terminalRunning ? "Terminate terminal" : "Restart terminal"
                }
                onClick={() => setTerminalRunning((v) => !v)}
              >
                <Icon name={terminalRunning ? "close" : "play"} size={14} />
              </IconButton>
            </>
          )}

          {activeBottomTab === "Output" && (
            <>
              <select
                aria-label="Select output channel"
                className="panel-select"
                onChange={(e) =>
                  setOutputChannel(e.target.value as OutputChannel)
                }
                value={outputChannel}
              >
                <option value="Server">Server / Runner</option>
                <option value="Tasks">Tasks & Build</option>
                <option value="Linter">Linter / Syntax</option>
                <option value="Git">Git / Source Control</option>
              </select>
              <IconButton
                label="Clear output channel"
                onClick={handleClearOutput}
              >
                <Icon name="trash" size={14} />
              </IconButton>
            </>
          )}

          <span className="panel-control-divider" />

          <IconButton
            label={
              panelMaximized ? "Restore panel size" : "Maximize panel size"
            }
            onClick={togglePanelMaximized}
          >
            <Icon
              name={panelMaximized ? "chevron-down" : "maximize"}
              size={14}
            />
          </IconButton>
          <IconButton
            label="Close panel (Ctrl+J)"
            onClick={() => setPanelOpen(false)}
          >
            <Icon name="close" size={14} />
          </IconButton>
        </div>
      </div>

      <div className="bottom-panel-content">
        <div
          className={
            activeBottomTab === "Terminal"
              ? "flex flex-col flex-1 min-h-0 h-full overflow-hidden"
              : "hidden"
          }
        >
          <TerminalView />
        </div>
        {activeBottomTab === "Problems" && <ProblemsView />}
        {activeBottomTab === "Output" && (
          <OutputView channel={outputChannel} logs={outputLogs} />
        )}
      </div>
    </section>
  )
}
