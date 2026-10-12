import { useWorkbench } from "../../../context/WorkbenchContext"
import { Icon } from "../../ui/Icon"

export function DebugView() {
  const {
    debugState,
    isDebugging,
    startDebugging,
    openFileInGroup,
    activeTab,
  } = useWorkbench()

  if (!isDebugging || debugState.status === "idle") {
    const isDebuggableActive =
      activeTab?.endsWith(".go") ||
      activeTab?.endsWith(".py") ||
      activeTab?.endsWith(".cpp") ||
      activeTab?.endsWith(".c")
    const targetLabel = isDebuggableActive
      ? activeTab
      : "Auto-detect (.go / .py / .cpp)"

    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4 py-8 text-ink-muted">
        <Icon name="debug" size={32} className="mb-3 text-ink-muted/50" />
        <p className="text-sm font-medium text-ink mb-1">
          No active debug session
        </p>
        <p className="text-xs text-ink-muted mb-3 max-w-sm">
          Set breakpoints by clicking the line number gutter, then start
          step-by-step debugging.
        </p>
        <div className="flex items-center gap-1.5 px-2.5 py-1 mb-4 rounded bg-surface border border-line text-[11px] font-mono text-ink">
          <span className="text-ink-muted">Target:</span>
          <span className="text-accent truncate max-w-xs">{targetLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => startDebugging()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-accent text-accent-contrast text-xs font-medium cursor-pointer hover:opacity-90 transition-opacity"
        >
          <Icon name="play" size={13} />
          Start Debugging (F5)
        </button>
      </div>
    )
  }

  const stackFrames = debugState.stackFrames || []
  const variables = debugState.variables || []

  return (
    <div className="flex h-full divide-x divide-line text-xs font-mono">
      {/* Variables Section */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-line text-[11px] font-sans font-semibold text-ink-muted tracking-wider uppercase select-none">
          <span>Variables ({variables.length})</span>
          {debugState.stopReason && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-mono lowercase">
              paused: {debugState.stopReason}
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {variables.length === 0 ? (
            <div className="text-ink-muted text-center py-6 text-xs font-sans">
              {debugState.status === "running"
                ? "Program is running..."
                : "No variables in scope"}
            </div>
          ) : (
            variables.map((v, i) => (
              <div
                key={i}
                className="flex items-baseline gap-2 px-2 py-1 rounded hover:bg-surface-hover text-ink"
              >
                <span className="text-accent font-semibold">{v.name}:</span>
                <span className="text-ink-muted text-[11px]">({v.type})</span>
                <span className="text-ink truncate">{v.value}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Call Stack Section */}
      <div className="w-80 flex flex-col shrink-0 overflow-hidden">
        <div className="px-3 py-1.5 bg-surface border-b border-line text-[11px] font-sans font-semibold text-ink-muted tracking-wider uppercase select-none">
          Call Stack ({stackFrames.length})
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {stackFrames.length === 0 ? (
            <div className="text-ink-muted text-center py-6 text-xs font-sans">
              No active stack frames
            </div>
          ) : (
            stackFrames.map((frame, i) => {
              const fileBasename = frame.file.split("/").pop() || frame.file
              return (
                <div
                  key={i}
                  onClick={() => {
                    if (frame.file) {
                      openFileInGroup(frame.file)
                    }
                  }}
                  className={`flex items-baseline justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                    i === 0
                      ? "bg-accent/15 text-ink font-semibold border-l-2 border-accent"
                      : "hover:bg-surface-hover text-ink-muted hover:text-ink"
                  }`}
                  title={`${frame.file}:${frame.line}`}
                >
                  <span className="truncate pr-2">{frame.name}</span>
                  <span className="text-[10px] text-ink-muted shrink-0">
                    {fileBasename}:{frame.line}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
