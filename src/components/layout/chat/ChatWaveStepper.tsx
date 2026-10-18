import { useState, useEffect, useCallback, useMemo } from "react"
import { Icon } from "../../ui/Icon"
import {
  fetchAgentTasks,
  fetchAgentTaskDetail,
  type AgentTaskItem,
  type AgentTaskDetail,
} from "../../../utils/agentApi"
import { useWorkbenchStore } from "../../../store"
import { eventHub } from "../../../services/WorkbenchEventHub"

export function ChatWaveStepper() {
  const [activeTask, setActiveTask] = useState<AgentTaskItem | null>(null)
  const [taskDetail, setTaskDetail] = useState<AgentTaskDetail | null>(null)
  const [collapsed, setCollapsed] = useState(true)

  const openFileInGroup = useWorkbenchStore((s) => s.openFileInGroup)
  const isCopilotInitialized = useWorkbenchStore((s) => s.isCopilotInitialized)
  const taskHudOpen = useWorkbenchStore((s) => s.taskHudOpen)

  const loadActiveTask = useCallback(async () => {
    try {
      const tasks = await fetchAgentTasks()
      if (tasks && tasks.length > 0) {
        // Pick the most recent task
        const latest = tasks[0]
        setActiveTask(latest)
        const detail = await fetchAgentTaskDetail(latest.id)
        setTaskDetail(detail)
      } else {
        setActiveTask(null)
        setTaskDetail(null)
      }
    } catch {
      // Backend offline or no tasks directory yet
    }
  }, [])

  useEffect(() => {
    void loadActiveTask()

    // Real-time instant reaction to task creation / wave changes
    const unsub = eventHub.subscribe("copilot", () => {
      void loadActiveTask()
    })

    // Periodic fallback poll every 10 seconds
    const interval = setInterval(() => {
      void loadActiveTask()
    }, 10000)

    return () => {
      unsub()
      clearInterval(interval)
    }
  }, [loadActiveTask, isCopilotInitialized])

  // Compute wave and active states unconditionally at the top level
  const waves = taskDetail?.waves || []
  const isRunning =
    activeTask?.status === "IN_PROGRESS" || activeTask?.status === "RUNNING"
  const activeWave = waves.find((w) => w.status === "IN_PROGRESS")

  // Dynamic action-driven label - Must be called unconditionally before any early returns
  const actionLabel = useMemo(() => {
    if (!activeTask) return "Autonomous Task"
    if (isRunning) {
      return activeWave?.name
        ? `W${activeWave.waveNumber}: ${activeWave.name}`
        : "Executing Task"
    }
    if (activeTask.status === "COMPLETED" || activeTask.status === "PASSED") {
      return "All Gates Passed"
    }
    if (activeTask.status === "PENDING") {
      return waves[0]?.name ? `Ready: ${waves[0].name}` : "Task Standby"
    }
    return activeTask.title || activeTask.id || "Autonomous Task"
  }, [isRunning, activeWave, activeTask, waves])

  // Conditional visibility: hide when idle unless user explicitly toggled HUD open
  if (!activeTask || !taskDetail || waves.length === 0) {
    return null
  }

  if (!isRunning && !taskHudOpen) {
    return null
  }

  const specPath = `${activeTask.path}/0-spec.md`
  const planPath = `${activeTask.path}/0-plan.md`
  const logPath = `${activeTask.path}/0-log.md`

  // Compute overall wave progress
  const totalWaves = waves.length
  const totalSteps = waves.reduce((sum, w) => sum + (w.totalSteps || 0), 0)
  const passedSteps = waves.reduce((sum, w) => sum + (w.passedSteps || 0), 0)
  const activeWaveIdx = waves.findIndex((w) => w.status === "IN_PROGRESS")
  const currentWaveNumber =
    activeWaveIdx >= 0 ? waves[activeWaveIdx].waveNumber : totalWaves
  const percent =
    totalSteps > 0 ? Math.round((passedSteps / totalSteps) * 100) : 0

  return (
    <div className="chat-wave-stepper flex flex-col border-b border-line bg-surface/95 backdrop-blur-md text-ink select-none text-[11px] transition-all shrink-0 shadow-2xs">
      {/* Top Banner Bar - Slim 28px Single Line */}
      <div className="chat-wave-banner flex items-center justify-between px-2.5 py-1 gap-2 border-b border-line/40">
        <div className="chat-wave-title-group flex items-center gap-1.5 min-w-0 flex-1">
          <div
            className={`chat-wave-avatar w-4.5 h-4.5 rounded flex items-center justify-center bg-accent/15 text-accent border border-accent/25 shrink-0 ${
              isRunning ? "animate-pulse" : ""
            }`}
          >
            <Icon name={isRunning ? "zap" : "aegis"} size={10} />
          </div>
          <div className="chat-wave-info flex items-center gap-1.5 min-w-0">
            <span
              className="chat-wave-slug text-[10.5px] font-semibold text-ink truncate max-w-[160px] tracking-tight hover:text-accent transition-colors"
              title={`${activeTask.title || activeTask.id} (${activeTask.status})${
                activeWave?.topology ? ` · ${activeWave.topology}` : ""
              }`}
            >
              {actionLabel}
            </span>
            <span
              className={`chat-wave-status text-[8.5px] font-mono px-1.5 py-0.2 rounded border shrink-0 font-medium tracking-wide uppercase ${
                activeTask.status === "COMPLETED" ||
                activeTask.status === "PASSED"
                  ? "status-passed bg-success-soft text-success border-success/30"
                  : isRunning
                    ? "status-running bg-accent/15 text-accent border-accent/30 animate-pulse"
                    : "status-pending bg-canvas text-ink-muted border-line"
              }`}
            >
              {activeTask.status}
            </span>
          </div>
        </div>

        {/* Center Progress Chip */}
        <div
          className="chat-wave-progress-chip flex items-center gap-1 px-1.5 py-0.5 rounded bg-canvas/80 border border-line text-[9px] font-mono shrink-0"
          title={`${passedSteps}/${totalSteps} steps completed across ${totalWaves} waves`}
        >
          <span className="chat-wave-progress-label text-ink font-semibold">
            W{currentWaveNumber}/{totalWaves}
          </span>
          <span className="text-line">·</span>
          <span className="chat-wave-progress-pct text-accent font-semibold">
            {percent}%
          </span>
        </div>

        {/* Quick Links to Editor Tabs */}
        <div className="chat-wave-actions flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => openFileInGroup(specPath)}
            className="chat-wave-btn flex items-center gap-1 px-1.5 py-0.5 rounded bg-canvas/70 hover:bg-surface-hover text-ink-muted hover:text-ink border border-line hover:border-accent/40 text-[9.5px] font-medium transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Open 0-spec.md in editor"
          >
            <Icon name="file" size={9} className="text-accent/80" />
            <span>Spec</span>
          </button>

          <button
            type="button"
            onClick={() => openFileInGroup(planPath)}
            className="chat-wave-btn flex items-center gap-1 px-1.5 py-0.5 rounded bg-canvas/70 hover:bg-surface-hover text-ink-muted hover:text-ink border border-line hover:border-accent/40 text-[9.5px] font-medium transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Open 0-plan.md in editor"
          >
            <Icon name="list" size={9} className="text-accent/80" />
            <span>Plan</span>
          </button>

          <button
            type="button"
            onClick={() => openFileInGroup(logPath)}
            className="chat-wave-btn flex items-center gap-1 px-1.5 py-0.5 rounded bg-canvas/70 hover:bg-surface-hover text-ink-muted hover:text-ink border border-line hover:border-accent/40 text-[9.5px] font-medium transition-all cursor-pointer active:scale-95 shadow-2xs"
            title="Open 0-log.md in editor"
          >
            <Icon name="history" size={9} className="text-accent/80" />
            <span>Log</span>
          </button>

          <div className="chat-wave-divider w-px h-3 bg-line mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="chat-wave-toggle flex items-center justify-center w-4.5 h-4.5 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer"
            title={
              collapsed ? "Expand wave timeline" : "Collapse wave timeline"
            }
          >
            <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={10} />
          </button>
        </div>
      </div>

      {/* Waves Stepper Track - Expanded Only */}
      {!collapsed && (
        <div className="chat-wave-track flex items-center gap-1.5 px-3 py-1.5 bg-canvas/40 overflow-x-auto no-scrollbar">
          {waves.map((w, idx) => {
            const isPassed = w.status === "PASSED"
            const isInProgress = w.status === "IN_PROGRESS"
            return (
              <div
                key={w.waveNumber || idx}
                className={`chat-wave-card flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] border shrink-0 transition-all cursor-default ${
                  isPassed
                    ? "wave-card-passed border-emerald-500/35 bg-emerald-500/10 text-emerald-400 font-medium hover:bg-emerald-500/15"
                    : isInProgress
                      ? "wave-card-running border-accent/40 bg-accent/15 text-accent font-semibold shadow-xs animate-pulse"
                      : "wave-card-pending border-line bg-surface/60 text-ink-muted hover:bg-surface-hover hover:text-ink"
                }`}
                title={`Wave ${w.waveNumber}: ${w.name}${
                  w.topology ? ` [${w.topology}]` : ""
                } (${w.passedSteps}/${w.totalSteps} steps)`}
              >
                {isPassed ? (
                  <Icon
                    name="check"
                    size={10}
                    className="text-emerald-400 shrink-0"
                  />
                ) : isInProgress ? (
                  <Icon
                    name="play"
                    size={10}
                    className="text-accent shrink-0"
                  />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-ink-muted/40 shrink-0" />
                )}
                <span className="truncate max-w-[120px]">
                  W{w.waveNumber}: {w.name}
                </span>
                {w.topology && (
                  <span
                    className={`chat-wave-topology-pill topology-${w.topology.toLowerCase()}`}
                    title={`Topology: ${w.topology}`}
                  >
                    <Icon
                      name={
                        w.topology === "PARALLEL"
                          ? "zap"
                          : w.topology === "HYBRID"
                            ? "branch"
                            : "lock"
                      }
                      size={8}
                      className="shrink-0"
                    />
                    <span>{w.topology}</span>
                  </span>
                )}
                {w.totalSteps > 0 && (
                  <span
                    className={`chat-wave-step-pill text-[9px] font-mono px-1 rounded ${
                      isPassed
                        ? "bg-emerald-500/20 text-emerald-300"
                        : isInProgress
                          ? "bg-accent/20 text-accent font-bold"
                          : "bg-surface-hover text-ink-muted"
                    }`}
                  >
                    {w.passedSteps}/{w.totalSteps}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
