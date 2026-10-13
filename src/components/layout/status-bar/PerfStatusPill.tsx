import { useState, useEffect, useRef } from "react"
import { perfMonitor, type PerfMetrics } from "../../../utils/perfMonitor"
import { workerBroker } from "../../../workers"
import { offloadService } from "../../../utils/offloadService"
import { Icon } from "../../ui/Icon"

export function PerfStatusPill() {
  const [metrics, setMetrics] = useState<PerfMetrics>(() =>
    perfMonitor.getMetrics(),
  )
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    return perfMonitor.subscribe((m) => {
      setMetrics(m)
    })
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDocClick)
      document.removeEventListener("keydown", onKey)
    }
  }, [isOpen])

  const brokerStats = workerBroker.getStats()
  const cacheSize = offloadService.getCacheSize()

  const isHealthy = metrics.fps >= 50 && metrics.longTasksCount === 0
  const isWarning = metrics.fps < 40 || metrics.longTasksCount > 2

  const pillClass = isWarning
    ? "syntax-pink font-semibold"
    : isHealthy
      ? "syntax-green"
      : "syntax-orange"

  return (
    <div className="relative inline-flex items-center" ref={popoverRef}>
      <button
        aria-label="Performance Monitor"
        className={`status-item flex items-center gap-1.5 cursor-pointer ${pillClass} ${
          isOpen ? "status-button-active" : ""
        }`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Zero-Freeze Performance Guard (Click to inspect)"
        type="button"
      >
        <Icon name="zap" size={13} />
        <span>{metrics.fps} FPS</span>
      </button>

      {isOpen && (
        <div
          className="status-popover absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-50 w-[320px] max-w-[calc(100vw-16px)] text-xs flex flex-col"
          role="dialog"
        >
          <div className="status-popover-header flex items-center justify-between px-3 py-2 border-b border-line">
            <span className="font-semibold text-ink-muted text-[10px] tracking-wider uppercase flex items-center gap-1.5">
              <Icon name="zap" size={12} />
              PERFORMANCE GUARD
            </span>
            <button
              className="text-ink-muted hover:text-ink cursor-pointer text-[10px] px-1.5 py-0.5 rounded border border-line"
              onClick={() => perfMonitor.clearLongTasks()}
              type="button"
            >
              Clear Lags
            </button>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2 rounded bg-canvas border border-line/50">
                <span className="text-muted block text-[10px] uppercase">
                  Frame Rate
                </span>
                <strong className={`text-sm ${pillClass}`}>
                  {metrics.fps} FPS
                </strong>
              </div>
              <div className="p-2 rounded bg-canvas border border-line/50">
                <span className="text-muted block text-[10px] uppercase">
                  Main Thread Lag
                </span>
                <strong className="text-sm text-ink">
                  {metrics.eventLoopLagMs} ms
                </strong>
              </div>
              <div className="p-2 rounded bg-canvas border border-line/50">
                <span className="text-muted block text-[10px] uppercase">
                  Worker Pool
                </span>
                <span className="text-xs text-ink font-mono">
                  {brokerStats.isSupported
                    ? `${brokerStats.batchPoolSize} active`
                    : "Fallback Mode"}
                </span>
              </div>
              <div className="p-2 rounded bg-canvas border border-line/50">
                <span className="text-muted block text-[10px] uppercase">
                  LRU Cache
                </span>
                <span className="text-xs text-ink font-mono">
                  {cacheSize} entries
                </span>
              </div>
            </div>

            <div className="border-t border-line pt-2">
              <div className="flex items-center justify-between text-muted text-[10px] mb-1 uppercase font-semibold">
                <span>Recent Long Tasks (&gt;50ms)</span>
                <span>{metrics.longTasksCount} detected</span>
              </div>

              {metrics.recentLongTasks.length === 0 ? (
                <div className="text-muted text-[11px] py-2 text-center flex items-center justify-center gap-1.5">
                  <Icon name="check" size={13} />
                  <span>Zero freeze detected. UI thread clean.</span>
                </div>
              ) : (
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {metrics.recentLongTasks.map((t) => (
                    <div
                      className="flex items-center justify-between px-1.5 py-1 rounded bg-canvas text-[11px]"
                      key={t.id}
                    >
                      <span className="truncate max-w-[170px] text-muted">
                        {t.name}
                      </span>
                      <strong className="text-pink-400 font-mono">
                        +{t.duration}ms
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
