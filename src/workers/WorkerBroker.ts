import type {
  TaskLane,
  TaskPriority,
  WorkerRequest,
  WorkerResponse,
} from "./types"
import { executeTaskDirectly, workerTaskRegistry } from "./registry"

interface PendingRequest<T = any> {
  id: number
  task: string
  lane: TaskLane
  resolve: (value: T) => void
  reject: (reason?: any) => void
  timeoutId: ReturnType<typeof setTimeout>
  signal?: AbortSignal
  onAbort?: () => void
}

interface QueuedTask {
  request: WorkerRequest
  pending: PendingRequest
  priority: TaskPriority
}

export interface WorkerBrokerOptions {
  batchPoolSize?: number
  taskTimeoutMs?: number
}

export class WorkerBroker {
  private static instance: WorkerBroker | null = null

  private reqId = 1
  private fastWorker: Worker | null = null
  private batchPool: Worker[] = []
  private batchBusy: boolean[] = []
  private batchQueue: QueuedTask[] = []

  private pendingMap = new Map<number, PendingRequest>()
  private isSupported =
    typeof window !== "undefined" && typeof Worker !== "undefined"
  private taskTimeoutMs: number

  constructor(options: WorkerBrokerOptions = {}) {
    this.taskTimeoutMs = options.taskTimeoutMs || 15000

    if (this.isSupported) {
      this.initFastLane()
      const poolSize =
        options.batchPoolSize ||
        Math.max(
          1,
          Math.min(
            4,
            (typeof navigator !== "undefined"
              ? navigator.hardwareConcurrency || 2
              : 2) - 1,
          ),
        )
      this.initBatchLane(poolSize)
    }
  }

  public static getInstance(): WorkerBroker {
    if (!WorkerBroker.instance) {
      WorkerBroker.instance = new WorkerBroker()
    }
    return WorkerBroker.instance
  }

  private createWorker(): Worker | null {
    try {
      return new Worker(new URL("./workerRunner.ts", import.meta.url), {
        type: "module",
      })
    } catch {
      return null
    }
  }

  private initFastLane() {
    const w = this.createWorker()
    if (!w) {
      this.isSupported = false
      return
    }
    this.attachWorkerHandlers(w, "fast", -1)
    this.fastWorker = w
  }

  private initBatchLane(poolSize: number) {
    for (let i = 0; i < poolSize; i++) {
      const w = this.createWorker()
      if (!w) {
        this.isSupported = false
        return
      }
      this.attachWorkerHandlers(w, "batch", i)
      this.batchPool.push(w)
      this.batchBusy.push(false)
    }
  }

  private attachWorkerHandlers(
    worker: Worker,
    lane: TaskLane,
    poolIdx: number,
  ) {
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const res = e.data
      if (lane === "batch" && poolIdx >= 0) {
        this.batchBusy[poolIdx] = false
        this.drainBatchQueue()
      }

      const pending = this.pendingMap.get(res.id)
      if (!pending) return

      this.pendingMap.delete(res.id)
      clearTimeout(pending.timeoutId)
      if (pending.signal && pending.onAbort) {
        pending.signal.removeEventListener("abort", pending.onAbort)
      }

      if (res.success) {
        pending.resolve(res.data)
      } else {
        pending.reject(new Error(res.error || "Worker task execution failed"))
      }
    }

    worker.onerror = (err) => {
      // Worker crashed or encountered unhandled error -> restart
      if (lane === "fast") {
        this.fastWorker?.terminate()
        this.initFastLane()
      } else if (poolIdx >= 0 && poolIdx < this.batchPool.length) {
        this.batchPool[poolIdx]?.terminate()
        const newWorker = this.createWorker()
        if (newWorker) {
          this.attachWorkerHandlers(newWorker, "batch", poolIdx)
          this.batchPool[poolIdx] = newWorker
          this.batchBusy[poolIdx] = false
          this.drainBatchQueue()
        }
      }
    }
  }

  public dispatch<TInput = any,
  TOutput = any,>(
    taskName: string,
    payload: TInput,
    options: {
      lane?: TaskLane
      priority?: TaskPriority
      signal?: AbortSignal
    } = {},
  ): Promise<TOutput> {
    const def = workerTaskRegistry[taskName]
    const lane: TaskLane = options.lane || def?.lane || "batch"
    const priority: TaskPriority = options.priority || "normal"
    const signal = options.signal

    if (signal?.aborted) {
      return Promise.reject(new DOMException("Aborted", "AbortError"))
    }

    // Graceful fallback to direct main-thread idle execution if Web Workers are unavailable
    if (
      !this.isSupported ||
      (!this.fastWorker && this.batchPool.length === 0)
    ) {
      return new Promise<TOutput>((resolve, reject) => {
        try {
          const result = executeTaskDirectly<TInput, TOutput>(taskName, payload)
          resolve(result)
        } catch (err) {
          reject(err)
        }
      })
    }

    const id = this.reqId++
    const req: WorkerRequest<TInput> = {
      id,
      task: taskName,
      payload,
      lane,
      priority,
    }

    return new Promise<TOutput>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingMap.has(id)) {
          this.pendingMap.delete(id)
          reject(
            new Error(
              `Worker task '${taskName}' timed out after ${this.taskTimeoutMs}ms`,
            ),
          )
        }
      }, this.taskTimeoutMs)

      const pending: PendingRequest<TOutput> = {
        id,
        task: taskName,
        lane,
        resolve,
        reject,
        timeoutId,
        signal,
      }

      if (signal) {
        const onAbort = () => {
          if (this.pendingMap.has(id)) {
            this.pendingMap.delete(id)
            clearTimeout(timeoutId)
            reject(new DOMException("Aborted", "AbortError"))
          }
        }
        pending.onAbort = onAbort
        signal.addEventListener("abort", onAbort, { once: true })
      }

      this.pendingMap.set(id, pending)

      if (lane === "fast" && this.fastWorker) {
        this.fastWorker.postMessage(req)
      } else {
        this.scheduleBatchTask({ request: req, pending, priority })
      }
    })
  }

  private scheduleBatchTask(queued: QueuedTask) {
    const freeIdx = this.batchBusy.findIndex((busy) => !busy)
    if (freeIdx !== -1) {
      this.batchBusy[freeIdx] = true
      this.batchPool[freeIdx].postMessage(queued.request)
    } else {
      // Insert into priority queue
      const prioWeight: Record<TaskPriority, number> = {
        high: 3,
        normal: 2,
        low: 1,
      }
      const itemWeight = prioWeight[queued.priority]
      const insertIdx = this.batchQueue.findIndex(
        (q) => prioWeight[q.priority] < itemWeight,
      )
      if (insertIdx === -1) {
        this.batchQueue.push(queued)
      } else {
        this.batchQueue.splice(insertIdx, 0, queued)
      }
    }
  }

  private drainBatchQueue() {
    if (this.batchQueue.length === 0) return
    const freeIdx = this.batchBusy.findIndex((busy) => !busy)
    if (freeIdx === -1) return

    const nextTask = this.batchQueue.shift()
    if (!nextTask) return

    if (nextTask.pending.signal?.aborted) {
      this.drainBatchQueue()
      return
    }

    this.batchBusy[freeIdx] = true
    this.batchPool[freeIdx].postMessage(nextTask.request)
  }

  public getStats() {
    return {
      isSupported: this.isSupported,
      fastLaneActive: !!this.fastWorker,
      batchPoolSize: this.batchPool.length,
      batchQueueLength: this.batchQueue.length,
      pendingCount: this.pendingMap.size,
    }
  }

  public terminate() {
    this.fastWorker?.terminate()
    this.batchPool.forEach((w) => w.terminate())
    this.fastWorker = null
    this.batchPool = []
    this.batchBusy = []
    this.batchQueue = []
    this.pendingMap.clear()
  }
}

export const workerBroker = WorkerBroker.getInstance()
