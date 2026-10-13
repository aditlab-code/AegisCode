export interface LongTaskRecord {
  id: number
  startTime: number
  duration: number
  name: string
}

export interface PerfMetrics {
  fps: number
  eventLoopLagMs: number
  longTasksCount: number
  recentLongTasks: LongTaskRecord[]
}

type PerfListener = (metrics: PerfMetrics) => void

export class PerfMonitor {
  private static instance: PerfMonitor | null = null

  private listeners = new Set<PerfListener>()
  private longTasks: LongTaskRecord[] = []
  private longTaskId = 1

  private fps = 60
  private frameCount = 0
  private lastFpsCalcTime = performance.now()
  private eventLoopLagMs = 0

  private isRunning = false
  private rafId: number | null = null
  private lagIntervalId: ReturnType<typeof setInterval> | null = null

  private observer: PerformanceObserver | null = null

  constructor() {
    this.initLongTaskObserver()
    this.startTracking()
    this.exposeGlobal()
  }

  public static getInstance(): PerfMonitor {
    if (!PerfMonitor.instance) {
      PerfMonitor.instance = new PerfMonitor()
    }
    return PerfMonitor.instance
  }

  private initLongTaskObserver() {
    if (
      typeof window === "undefined" ||
      typeof PerformanceObserver === "undefined"
    ) {
      return
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            this.recordLongTask(entry.startTime, entry.duration, entry.name)
          }
        }
      })
      this.observer.observe({ entryTypes: ["longtask"] })
    } catch {
      // PerformanceObserver longtask might not be supported in all environments (e.g., Firefox/Safari or tests)
    }
  }

  private recordLongTask(startTime: number, duration: number, name: string) {
    const record: LongTaskRecord = {
      id: this.longTaskId++,
      startTime: Math.round(startTime),
      duration: Math.round(duration),
      name: name || "LongTask",
    }

    this.longTasks.unshift(record)
    if (this.longTasks.length > 20) {
      this.longTasks.pop()
    }

    this.notify()
  }

  private startTracking() {
    if (typeof window === "undefined" || this.isRunning) return
    this.isRunning = true

    // FPS loop
    const onFrame = (now: number) => {
      this.frameCount++
      const elapsed = now - this.lastFpsCalcTime
      if (elapsed >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / elapsed)
        this.frameCount = 0
        this.lastFpsCalcTime = now
        this.notify()
      }
      this.rafId = requestAnimationFrame(onFrame)
    }
    this.rafId = requestAnimationFrame(onFrame)

    // Event loop lag check
    let lastLagCheck = performance.now()
    this.lagIntervalId = setInterval(() => {
      const now = performance.now()
      const delta = now - lastLagCheck
      this.eventLoopLagMs = Math.max(0, Math.round(delta - 500))
      lastLagCheck = now
    }, 500)
  }

  private notify() {
    const metrics = this.getMetrics()
    for (const listener of this.listeners) {
      try {
        listener(metrics)
      } catch {
        // Safe listener execution
      }
    }
  }

  public getMetrics(): PerfMetrics {
    return {
      fps: this.fps,
      eventLoopLagMs: this.eventLoopLagMs,
      longTasksCount: this.longTasks.length,
      recentLongTasks: [...this.longTasks],
    }
  }

  public subscribe(listener: PerfListener): () => void {
    this.listeners.add(listener)
    listener(this.getMetrics())
    return () => {
      this.listeners.delete(listener)
    }
  }

  public clearLongTasks() {
    this.longTasks = []
    this.notify()
  }

  private exposeGlobal() {
    if (typeof window !== "undefined") {
      ;(window as any).__AEGIS_PERF__ = {
        getMetrics: () => this.getMetrics(),
        clear: () => this.clearLongTasks(),
      }
    }
  }

  public destroy() {
    this.isRunning = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    if (this.lagIntervalId) clearInterval(this.lagIntervalId)
    this.observer?.disconnect()
    this.listeners.clear()
  }
}

export const perfMonitor = PerfMonitor.getInstance()
