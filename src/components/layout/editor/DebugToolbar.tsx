import { useState, useRef } from "react"
import { useWorkbenchStore, useShallow } from "../../../store"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"

interface ToolbarOffset {
  x: number
  y: number
}

interface DragStartCoords {
  mouseX: number
  mouseY: number
  startX: number
  startY: number
}

export function DebugToolbar() {
  const {
    debugState,
    isDebugging,
    stepDebugging,
    terminateDebugging,
    startDebugging,
  } = useWorkbenchStore(
    useShallow((s) => ({
      debugState: s.debugState,
      isDebugging: s.isDebugging,
      stepDebugging: s.stepDebugging,
      terminateDebugging: s.terminateDebugging,
      startDebugging: s.startDebugging,
    })),
  )

  const [offset, setOffset] = useState<ToolbarOffset>({
    x: 0,
    y: 10,
  })
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<DragStartCoords>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 10,
  })

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault()
    isDraggingRef.current = true
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: offset.x,
      startY: offset.y,
    }

    function handleMouseMove(moveEvent: MouseEvent) {
      if (!isDraggingRef.current) return
      const deltaX = moveEvent.clientX - dragStartRef.current.mouseX
      const deltaY = moveEvent.clientY - dragStartRef.current.mouseY
      setOffset({
        x: Math.max(-450, Math.min(450, dragStartRef.current.startX + deltaX)),
        y: Math.max(6, Math.min(400, dragStartRef.current.startY + deltaY)),
      })
    }

    function handleMouseUp() {
      isDraggingRef.current = false
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }

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
      className="absolute z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-line shadow-xl text-ink backdrop-blur-md select-none"
      style={{
        left: "50%",
        top: 0,
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
      }}
    >
      {/* Drag handle */}
      <div
        className="flex items-center cursor-grab active:cursor-grabbing text-ink-muted hover:text-ink px-1 -ml-1"
        onMouseDown={handleDragStart}
        title="Drag toolbar"
      >
        <Icon name="more" size={13} />
      </div>
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
