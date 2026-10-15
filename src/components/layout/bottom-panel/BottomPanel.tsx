import {
  useState,
  useEffect,
  useRef,
  useCallback,
  lazy,
  Suspense,
  type DragEvent,
} from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { ResizeSash } from "../../ui/ResizeSash"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  MIN_BOTTOM_HEIGHT,
  DEFAULT_BOTTOM_HEIGHT,
} from "../../../store/slices/createLayoutSlice"
import type { BottomTab, OutputChannel } from "../../../types/workbench"
import { ProblemsView } from "./ProblemsView"
import { OutputView } from "./OutputView"
import { DebugConsoleView } from "./DebugConsoleView"
import { McpPanelView } from "./McpPanelView"

import { API_BASE } from "../../../utils/apiBase"

const TerminalView = lazy(() => import("./TerminalView"))

export function BottomPanel() {
  const {
    diagnostics,
    terminalLines,
    terminalRunning,
    setTerminalRunning,
    terminalSessions,
    activeTerminalSession,
    activeTerminalSessionId,
    setActiveTerminalSessionId,
    createTerminalSession,
    restartTerminalSession,
    terminateTerminalSession,
    closeTerminalSession,
    clearTerminal,
    activeBottomTab,
    setActiveBottomTab,
    bottomTabOrder,
    reorderBottomTabs,
    panelMaximized,
    togglePanelMaximized,
    panelOpen,
    setPanelOpen,
    setBottomPanelHeight,
    resetBottomPanelHeight,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      diagnostics: s.diagnostics,
      terminalLines: s.terminalLines,
      terminalRunning: s.terminalRunning,
      setTerminalRunning: s.setTerminalRunning,
      terminalSessions: s.terminalSessions,
      activeTerminalSession: s.activeTerminalSession,
      activeTerminalSessionId: s.activeTerminalSessionId,
      setActiveTerminalSessionId: s.setActiveTerminalSessionId,
      createTerminalSession: s.createTerminalSession,
      restartTerminalSession: s.restartTerminalSession,
      terminateTerminalSession: s.terminateTerminalSession,
      closeTerminalSession: s.closeTerminalSession,
      clearTerminal: s.clearTerminal,
      activeBottomTab: s.activeBottomTab,
      setActiveBottomTab: s.setActiveBottomTab,
      bottomTabOrder: s.bottomTabOrder,
      reorderBottomTabs: s.reorderBottomTabs,
      panelMaximized: s.panelMaximized,
      togglePanelMaximized: s.togglePanelMaximized,
      panelOpen: s.panelOpen,
      setPanelOpen: s.setPanelOpen,
      setBottomPanelHeight: s.setBottomPanelHeight,
      resetBottomPanelHeight: s.resetBottomPanelHeight,
      showToast: s.showToast,
    })),
  )

  // Tracks live height during drag — no React state → zero re-renders during mousemove
  const heightRef = useRef(useWorkbenchStore.getState().bottomPanelHeight)

  // Mutate CSS var directly on .workbench DOM node (bypass React/Zustand during drag)
  const handleSashResize = useCallback((delta: number) => {
    const workbench = document.querySelector<HTMLElement>(".workbench")
    if (!workbench) return
    const next = heightRef.current - delta // upward drag = negative delta = bigger panel
    const maxHeight = Math.floor(window.innerHeight * 0.75)
    const clamped = Math.max(80, Math.min(maxHeight, next))
    heightRef.current = clamped
    workbench.style.setProperty("--bottom-height", `${clamped}px`)
  }, [])

  // On mouseup: single Zustand commit → one React reconciliation
  const handleSashResizeEnd = useCallback(() => {
    const h = heightRef.current
    if (h < MIN_BOTTOM_HEIGHT) {
      heightRef.current = DEFAULT_BOTTOM_HEIGHT
      const workbench = document.querySelector<HTMLElement>(".workbench")
      workbench?.style.setProperty(
        "--bottom-height",
        `${DEFAULT_BOTTOM_HEIGHT}px`,
      )
      setPanelOpen(false)
    } else {
      setBottomPanelHeight(h)
    }
  }, [setBottomPanelHeight, setPanelOpen])

  const handleSashDoubleClick = useCallback(() => {
    heightRef.current = DEFAULT_BOTTOM_HEIGHT
    const workbench = document.querySelector<HTMLElement>(".workbench")
    workbench?.style.setProperty(
      "--bottom-height",
      `${DEFAULT_BOTTOM_HEIGHT}px`,
    )
    resetBottomPanelHeight()
  }, [resetBottomPanelHeight])

  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [newShell, setNewShell] = useState<string>(() =>
    typeof navigator !== "undefined" &&
    /(win32|win64|windows|wow64)/i.test(
      navigator.userAgent || navigator.platform || "",
    )
      ? "powershell"
      : "zsh",
  )
  const [outputChannel, setOutputChannel] = useState<OutputChannel>("Server")
  const [outputLogs, setOutputLogs] = useState<Record<OutputChannel, string[]>>(
    {
      Server: [],
      Linter: [],
      Tasks: [],
      Git: [],
    },
  )

  useEffect(() => {
    const sse = new EventSource(`${API_BASE}/api/v1/events/logs`)
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
    if (activeTerminalSession?.isLive) {
      window.dispatchEvent(new CustomEvent("aegis:terminal-copy"))
      showToast("Terminal output copied to clipboard")
      return
    }
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
    <section
      className={`bottom-panel ${panelOpen ? "" : "bottom-panel-collapsed"}`}
    >
      {panelOpen && !panelMaximized && (
        <ResizeSash
          className="sash-bottom"
          direction="horizontal"
          onDoubleClick={handleSashDoubleClick}
          onResize={handleSashResize}
          onResizeEnd={handleSashResizeEnd}
          title="Drag to resize bottom panel (Double-click to reset)"
        />
      )}

      {panelOpen ? (
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
                  <option value="fish">fish</option>
                  <option value="sh">sh</option>
                  <option value="pwsh">pwsh</option>
                  <option value="powershell">powershell</option>
                  <option value="cmd">cmd</option>
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
                  <Icon name="discard" size={14} />
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
                    terminalRunning
                      ? "Restart terminal session"
                      : "Start terminal session"
                  }
                  onClick={() => {
                    restartTerminalSession(activeTerminalSessionId, newShell)
                  }}
                >
                  <Icon name={terminalRunning ? "refresh" : "play"} size={14} />
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
              label="Hide panel (Ctrl+J)"
              onClick={() => setPanelOpen(false)}
            >
              <Icon name="close" size={14} />
            </IconButton>
          </div>
        </div>
      ) : (
        <div className="bottom-panel-dock">
          <div className="bottom-tabs">
            {bottomTabOrder.map((name: BottomTab) => (
              <button
                className={`bottom-tab-button ${
                  activeBottomTab === name ? "bottom-tab-active" : ""
                }`}
                key={name}
                onClick={() => {
                  setActiveBottomTab(name)
                  setPanelOpen(true)
                }}
                type="button"
              >
                {name}
                {name === "Problems" && diagnostics.length > 0 && (
                  <span className="count-badge">{diagnostics.length}</span>
                )}
              </button>
            ))}
          </div>

          <div className="panel-controls">
            {terminalRunning && (
              <span className="session-running">
                <span className="status-dot" /> SSE active
              </span>
            )}
            <IconButton
              label="Open panel (Ctrl+J)"
              onClick={() => setPanelOpen(true)}
            >
              <Icon name="chevron-up" size={14} />
            </IconButton>
          </div>
        </div>
      )}

      <div
        className="bottom-panel-content"
        style={{ display: panelOpen ? undefined : "none" }}
      >
        <div
          className={
            activeBottomTab === "Terminal"
              ? "flex flex-col flex-1 min-h-0 h-full overflow-hidden"
              : "hidden"
          }
        >
          <Suspense fallback={<div className="flex-1 bg-canvas" />}>
            <TerminalView />
          </Suspense>
        </div>
        {activeBottomTab === "Problems" && <ProblemsView />}
        {activeBottomTab === "Output" && (
          <OutputView channel={outputChannel} logs={outputLogs} />
        )}
        {activeBottomTab === "Debug Console" && <DebugConsoleView />}
        {activeBottomTab === "MCP" && <McpPanelView />}
      </div>
    </section>
  )
}
