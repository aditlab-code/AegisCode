import { useState, useCallback } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"
import type { GotoLineEventDetail } from "../../../types/workbench"

interface BreakpointEntry {
  file: string
  line: number
}

export function DebugSidePanel() {
  const {
    debugState,
    isDebugging,
    startDebugging,
    terminateDebugging,
    stepDebugging,
    openFileInGroup,
    activeTab,
    breakpoints,
    toggleBreakpoint,
    clearBreakpoints,
    setActiveDebugLine,
    focusedGroup,
  } = useWorkbenchStore(
    useShallow((s) => ({
      debugState: s.debugState,
      isDebugging: s.isDebugging,
      startDebugging: s.startDebugging,
      terminateDebugging: s.terminateDebugging,
      stepDebugging: s.stepDebugging,
      openFileInGroup: s.openFileInGroup,
      activeTab: s.activeTab,
      breakpoints: s.breakpoints,
      toggleBreakpoint: s.toggleBreakpoint,
      clearBreakpoints: s.clearBreakpoints,
      setActiveDebugLine: s.setActiveDebugLine,
      focusedGroup: s.focusedGroup,
    })),
  )

  const [variablesOpen, setVariablesOpen] = useState(true)
  const [callStackOpen, setCallStackOpen] = useState(true)
  const [breakpointsOpen, setBreakpointsOpen] = useState(true)
  const [expandedVarKeys, setExpandedVarKeys] =
    useState<Record<string, boolean>>({})

  const toggleVarExpand = useCallback((key: string) => {
    setExpandedVarKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }, [])

  const stackFrames = debugState.stackFrames || []
  const variables = debugState.variables || []

  // Flatten breakpoints map for quick listing
  const breakpointEntries: BreakpointEntry[] = []
  Object.entries(breakpoints).forEach(([file, lines]) => {
    lines.forEach((line) => {
      breakpointEntries.push({ file, line })
    })
  })

  const isDebuggableActive =
    activeTab?.endsWith(".go") ||
    activeTab?.endsWith(".py") ||
    activeTab?.endsWith(".cpp") ||
    activeTab?.endsWith(".c")
  const targetLabel = isDebuggableActive
    ? activeTab?.split("/").pop() || activeTab
    : "Auto-detect (.go / .py / .cpp)"

  const handleNavigateBreakpoint = useCallback(
    (file: string, line: number) => {
      openFileInGroup(file, focusedGroup)
      window.dispatchEvent(
        new CustomEvent<GotoLineEventDetail>("aegis:editor-goto-line", {
          detail: { file, line, col: 1 },
        }),
      )
    },
    [openFileInGroup, focusedGroup],
  )

  const handleNavigateFrame = useCallback(
    (file: string, line: number) => {
      if (!file) return
      openFileInGroup(file, focusedGroup)
      setActiveDebugLine({ file, line })
      window.dispatchEvent(
        new CustomEvent<GotoLineEventDetail>("aegis:editor-goto-line", {
          detail: { file, line, col: 1 },
        }),
      )
    },
    [openFileInGroup, focusedGroup, setActiveDebugLine],
  )

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-canvas text-xs select-none">
      {/* Session Controls Header */}
      <div className="p-3 border-b border-line bg-surface/50 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
            Debug Session
          </span>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
              debugState.status === "stopped"
                ? "bg-warning/15 text-warning"
                : debugState.status === "running"
                  ? "bg-accent/15 text-accent"
                  : "bg-surface text-ink-muted border border-line"
            }`}
          >
            {debugState.status === "stopped" && debugState.stopReason
              ? `paused: ${debugState.stopReason}`
              : debugState.status || "idle"}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 mb-2.5 rounded bg-surface border border-line text-[11px] font-mono text-ink">
          <span className="text-ink-muted shrink-0">Target:</span>
          <span
            className="text-accent truncate font-semibold"
            title={activeTab || undefined}
          >
            {targetLabel}
          </span>
        </div>

        {!isDebugging ||
        debugState.status === "idle" ||
        debugState.status === "terminated" ? (
          <button
            type="button"
            onClick={() => void startDebugging()}
            className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded bg-accent text-accent-contrast text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity"
          >
            <Icon name="play" size={13} />
            Start Debugging (F5)
          </button>
        ) : (
          <div className="flex items-center gap-1">
            {debugState.status === "stopped" ? (
              <button
                type="button"
                onClick={() => void stepDebugging("continue")}
                className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-accent text-accent-contrast text-[11px] font-semibold hover:opacity-90"
                title="Continue (F5)"
              >
                <Icon name="play" size={12} />
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void stepDebugging("pause")}
                className="flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded bg-surface border border-line text-ink text-[11px] font-semibold hover:bg-surface-hover"
                title="Pause"
              >
                <Icon name="pause" size={12} />
                Pause
              </button>
            )}
            <button
              type="button"
              onClick={() => void terminateDebugging()}
              className="px-2 py-1 rounded bg-surface border border-line text-error hover:bg-surface-hover text-[11px] font-medium"
              title="Stop Debugging (Shift+F5)"
            >
              <Icon name="stop" size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Accordion 1: VARIABLES */}
      <div className="border-b border-line shrink-0">
        <div className="section-title-bar">
          <button
            className="section-title section-title-clickable min-w-0 flex-1"
            onClick={() => setVariablesOpen((v) => !v)}
            title={variablesOpen ? "Collapse Variables" : "Expand Variables"}
            type="button"
          >
            <span
              className={`chevron-arrow ${variablesOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={12} />
            </span>
            <span>VARIABLES ({variables.length})</span>
          </button>
        </div>

        {variablesOpen && (
          <div className="p-2 space-y-1 max-h-56 overflow-y-auto font-mono text-[11px]">
            {variables.length === 0 ? (
              <p className="text-ink-muted text-center py-3 text-[11px] font-sans">
                {debugState.status === "running"
                  ? "Program is running..."
                  : "No variables in scope"}
              </p>
            ) : (
              variables.map((v, i) => {
                const varKey = `${v.name}-${i}`
                const isExpanded = Boolean(expandedVarKeys[varKey])
                return (
                  <div
                    key={varKey}
                    onClick={() => toggleVarExpand(varKey)}
                    className="flex items-baseline gap-2 px-1.5 py-0.5 rounded hover:bg-surface-hover text-ink cursor-pointer select-text transition-colors"
                    title={
                      isExpanded
                        ? "Click to collapse"
                        : `Click to expand: ${v.value}`
                    }
                  >
                    <span className="text-accent font-semibold shrink-0">
                      {v.name}:
                    </span>
                    {v.type && (
                      <span className="text-ink-muted text-[10px] shrink-0">
                        ({v.type})
                      </span>
                    )}
                    <span
                      className={`text-ink font-mono ${
                        isExpanded
                          ? "break-all whitespace-pre-wrap"
                          : "truncate"
                      }`}
                    >
                      {v.value}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Accordion 2: CALL STACK */}
      <div className="border-b border-line shrink-0">
        <div className="section-title-bar">
          <button
            className="section-title section-title-clickable min-w-0 flex-1"
            onClick={() => setCallStackOpen((v) => !v)}
            title={callStackOpen ? "Collapse Call Stack" : "Expand Call Stack"}
            type="button"
          >
            <span
              className={`chevron-arrow ${callStackOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={12} />
            </span>
            <span>CALL STACK ({stackFrames.length})</span>
          </button>
        </div>

        {callStackOpen && (
          <div className="p-1 space-y-0.5 max-h-56 overflow-y-auto font-mono text-[11px]">
            {stackFrames.length === 0 ? (
              <p className="text-ink-muted text-center py-3 text-[11px] font-sans">
                No active stack frames
              </p>
            ) : (
              stackFrames.map((frame, i) => {
                const fileBasename = frame.file.split("/").pop() || frame.file
                return (
                  <div
                    key={`${frame.name}-${frame.line}-${i}`}
                    onClick={() => handleNavigateFrame(frame.file, frame.line)}
                    className={`flex items-baseline justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                      i === 0
                        ? "bg-accent/15 text-ink font-semibold border-l-2 border-accent"
                        : "hover:bg-surface-hover text-ink-muted hover:text-ink"
                    }`}
                    title={`${frame.file}:${frame.line}`}
                  >
                    <span className="truncate pr-2 font-mono">
                      {frame.name}
                    </span>
                    <span className="text-[10px] text-ink-muted shrink-0 font-mono">
                      {fileBasename}:{frame.line}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Accordion 3: BREAKPOINTS */}
      <div className="border-b border-line flex-1 min-h-0 flex flex-col">
        <div className="section-title-bar shrink-0">
          <button
            className="section-title section-title-clickable min-w-0 flex-1"
            onClick={() => setBreakpointsOpen((v) => !v)}
            title={
              breakpointsOpen ? "Collapse Breakpoints" : "Expand Breakpoints"
            }
            type="button"
          >
            <span
              className={`chevron-arrow ${
                breakpointsOpen ? "chevron-open" : ""
              }`}
            >
              <Icon name="chevron" size={12} />
            </span>
            <span>BREAKPOINTS ({breakpointEntries.length})</span>
          </button>
          {breakpointsOpen && breakpointEntries.length > 0 && (
            <div className="section-actions pr-2">
              <IconButton
                label="Clear All Breakpoints"
                onClick={() => clearBreakpoints()}
              >
                <Icon name="trash" size={12} />
              </IconButton>
            </div>
          )}
        </div>

        {breakpointsOpen && (
          <div className="p-1 space-y-0.5 flex-1 overflow-y-auto font-mono text-[11px]">
            {breakpointEntries.length === 0 ? (
              <p className="text-ink-muted text-center py-4 px-2 text-[11px] font-sans">
                No breakpoints set. Click line gutter to set.
              </p>
            ) : (
              breakpointEntries.map(({ file, line }) => {
                const fileBasename = file.split("/").pop() || file
                return (
                  <div
                    key={`${file}:${line}`}
                    className="group flex items-center justify-between px-2 py-1 rounded hover:bg-surface-hover text-ink cursor-pointer"
                    onClick={() => handleNavigateBreakpoint(file, line)}
                    title={`${file}:${line}`}
                  >
                    <div className="flex items-center gap-1.5 truncate pr-1">
                      <span className="w-2 h-2 rounded-full bg-error shrink-0" />
                      <span className="truncate font-medium">
                        {fileBasename}
                      </span>
                      <span className="text-ink-muted text-[10px]">
                        :{line}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        void toggleBreakpoint(file, line)
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-surface text-ink-muted hover:text-error transition-opacity"
                      title="Remove Breakpoint"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
