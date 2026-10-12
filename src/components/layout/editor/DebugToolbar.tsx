import { useWorkbench } from "../../../context/WorkbenchContext"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"

export function DebugToolbar() {
  const {
    debugState,
    isDebugging,
    stepDebugging,
    terminateDebugging,
    startDebugging,
  } = useWorkbench()

  if (!isDebugging) {
    return null
  }

  const isStopped = debugState.status === "stopped"
  const locationLabel =
    isStopped && debugState.currentFile && debugState.currentLine
      ? `${debugState.currentFile.split("/").pop()}:${debugState.currentLine}`
      : debugState.status

  return (
    <div
      aria-label="Debug Execution Toolbar"
      className="absolute top-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-line shadow-xl text-ink backdrop-blur-md transition-all select-none"
    >
      {/* Status indicator */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-line text-xs font-mono">
        <span
          className={`w-2 h-2 rounded-full ${
            isStopped ? "bg-warning animate-pulse" : "bg-accent"
          }`}
        />
        <span
          className="text-[11px] text-ink-muted max-w-[140px] truncate"
          title={locationLabel}
        >
          {locationLabel}
        </span>
      </div>

      {/* Continue / Pause */}
      {isStopped ? (
        <IconButton
          label="Continue (F5)"
          onClick={() => stepDebugging("continue")}
          className="text-accent hover:bg-surface-hover"
        >
          <Icon name="play" size={14} />
        </IconButton>
      ) : (
        <IconButton
          label="Pause"
          onClick={() => stepDebugging("pause")}
          className="hover:bg-surface-hover"
        >
          <Icon name="pause" size={14} />
        </IconButton>
      )}

      {/* Step Over (F10) */}
      <IconButton
        label="Step Over (F10)"
        onClick={() => stepDebugging("stepOver")}
        disabled={!isStopped}
        className="hover:bg-surface-hover disabled:opacity-40"
      >
        <Icon name="step-over" size={14} />
      </IconButton>

      {/* Step Into (F11) */}
      <IconButton
        label="Step Into (F11)"
        onClick={() => stepDebugging("stepIn")}
        disabled={!isStopped}
        className="hover:bg-surface-hover disabled:opacity-40"
      >
        <Icon name="step-into" size={14} />
      </IconButton>

      {/* Step Out (Shift+F11) */}
      <IconButton
        label="Step Out (Shift+F11)"
        onClick={() => stepDebugging("stepOut")}
        disabled={!isStopped}
        className="hover:bg-surface-hover disabled:opacity-40"
      >
        <Icon name="step-out" size={14} />
      </IconButton>

      {/* Restart */}
      <IconButton
        label="Restart Session"
        onClick={() => {
          terminateDebugging().then(() => startDebugging())
        }}
        className="hover:bg-surface-hover"
      >
        <Icon name="refresh" size={13} />
      </IconButton>

      {/* Stop */}
      <IconButton
        label="Stop Debugging (Shift+F5)"
        onClick={terminateDebugging}
        className="text-error hover:bg-surface-hover"
      >
        <Icon name="stop" size={13} />
      </IconButton>
    </div>
  )
}
