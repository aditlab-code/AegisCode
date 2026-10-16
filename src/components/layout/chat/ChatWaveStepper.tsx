import { useState, useEffect, useCallback } from "react"
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
  const [collapsed, setCollapsed] = useState(false)

  const openFileInGroup = useWorkbenchStore((s) => s.openFileInGroup)
  const isCopilotInitialized = useWorkbenchStore((s) => s.isCopilotInitialized)

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

  if (!activeTask || !taskDetail || taskDetail.waves.length === 0) {
    return null
  }

  const specPath = `${activeTask.path}/0-spec.md`
  const planPath = `${activeTask.path}/0-plan.md`
  const logPath = `${activeTask.path}/0-log.md`

  return (
    <div className="flex flex-col border-b border-line bg-surface/90 text-ink select-none text-[11px] transition-all shrink-0">
      {/* Top Banner Bar */}
      <div className="flex items-center justify-between px-3 py-1.5 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon name="aegis" size={13} className="text-accent shrink-0" />
          <span
            className="font-semibold truncate max-w-[140px]"
            title={activeTask.title}
          >
            {activeTask.title}
          </span>
          <span className="text-[10px] text-muted font-mono px-1.5 py-0.2 rounded bg-surface-hover border border-line shrink-0">
            {activeTask.status}
          </span>
        </div>

        {/* Quick Links to Editor Tabs */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => openFileInGroup(specPath)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title="Open 0-spec.md in editor"
          >
            <Icon name="file" size={11} />
            <span>Spec</span>
          </button>

          <button
            type="button"
            onClick={() => openFileInGroup(planPath)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title="Open 0-plan.md in editor"
          >
            <Icon name="list" size={11} />
            <span>Plan</span>
          </button>

          <button
            type="button"
            onClick={() => openFileInGroup(logPath)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-muted hover:text-ink hover:bg-surface-hover transition-colors"
            title="Open 0-log.md in editor"
          >
            <Icon name="history" size={11} />
            <span>Log</span>
          </button>

          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="p-0.5 text-muted hover:text-ink rounded transition-colors"
            title={collapsed ? "Expand waves" : "Collapse waves"}
          >
            <Icon name={collapsed ? "chevron-down" : "chevron-up"} size={12} />
          </button>
        </div>
      </div>

      {/* Waves Stepper Track */}
      {!collapsed && (
        <div className="flex items-center gap-1.5 px-3 pb-1.5 overflow-x-auto no-scrollbar">
          {taskDetail.waves.map((w, idx) => {
            const isPassed = w.status === "PASSED"
            const isInProgress = w.status === "IN_PROGRESS"
            return (
              <div
                key={w.waveNumber || idx}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border shrink-0 transition-colors ${
                  isPassed
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium"
                    : isInProgress
                      ? "border-accent/40 bg-accent/15 text-accent font-medium animate-pulse"
                      : "border-line bg-surface-hover text-muted"
                }`}
                title={`Wave ${w.waveNumber}: ${w.name} (${w.passedSteps}/${w.totalSteps} steps)`}
              >
                {isPassed ? (
                  <Icon name="check" size={10} />
                ) : isInProgress ? (
                  <Icon name="play" size={10} />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-muted/40" />
                )}
                <span>
                  W{w.waveNumber}: {w.name}
                </span>
                {w.totalSteps > 0 && (
                  <span className="text-[9px] opacity-75 font-mono">
                    [{w.passedSteps}/{w.totalSteps}]
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
