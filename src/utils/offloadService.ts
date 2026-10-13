import { workerBroker, type TaskPriority } from "../workers"
import { executeTaskDirectly } from "../workers/registry"

export interface OffloadOptions<TInput = any> {
  task: string
  payload: TInput
  tier?: "worker" | "backend"
  signal?: AbortSignal
  priority?: TaskPriority
  cacheKey?: string
  skipCache?: boolean
}

export interface OffloadResult<TOutput = any> {
  data: TOutput
  durationMs: number
  source: "worker" | "backend" | "cache" | "fallback"
}

export function fnv1a(str: string): string {
  let hash = 2166136261
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

class LruCache<V> {
  private capacity: number
  private map: Map<string, V>

  constructor(capacity = 100) {
    this.capacity = capacity
    this.map = new Map<string, V>()
  }

  get(key: string): V | undefined {
    if (!this.map.has(key)) return undefined
    const val = this.map.get(key)!
    this.map.delete(key)
    this.map.set(key, val)
    return val
  }

  set(key: string, value: V) {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.capacity) {
      const oldestKey = this.map.keys().next().value
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey)
      }
    }
    this.map.set(key, value)
  }

  clear() {
    this.map.clear()
  }

  size(): number {
    return this.map.size
  }
}

interface ExecuteTaskOptions {
  signal?: AbortSignal
  priority?: TaskPriority
}

export class OffloadService {
  private static instance: OffloadService | null = null
  private cache = new LruCache<any>(100)
  private inFlight = new Map<string, Promise<OffloadResult<any>>>()

  public static getInstance(): OffloadService {
    if (!OffloadService.instance) {
      OffloadService.instance = new OffloadService()
    }
    return OffloadService.instance
  }

  public async run<TInput = any,
  TOutput = any,>(
    options: OffloadOptions<TInput>,
  ): Promise<OffloadResult<TOutput>> {
    const {
      task,
      payload,
      signal,
      priority = "normal",
      skipCache = false,
    } = options

    // 1. Generate cache & coalescing key
    const rawKey =
      options.cacheKey ||
      `${task}:${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`
    const hashedKey = `${task}:${fnv1a(rawKey)}`

    // 2. Check LRU Cache
    if (!skipCache) {
      const cached = this.cache.get(hashedKey)
      if (cached !== undefined) {
        return {
          data: cached as TOutput,
          durationMs: 0,
          source: "cache",
        }
      }
    }

    // 3. In-flight request coalescing (deduplication)
    const existingInFlight = this.inFlight.get(hashedKey)
    if (existingInFlight) {
      return existingInFlight as Promise<OffloadResult<TOutput>>
    }

    const executionPromise = this.executeTask<TInput, TOutput>(task, payload, {
      signal,
      priority,
    })
      .then((res) => {
        this.inFlight.delete(hashedKey)
        if (!skipCache && res.data !== undefined) {
          this.cache.set(hashedKey, res.data)
        }
        return res
      })
      .catch((err) => {
        this.inFlight.delete(hashedKey)
        throw err
      })

    this.inFlight.set(hashedKey, executionPromise)
    return executionPromise
  }

  private async executeTask<TInput,
  TOutput,>(
    task: string,
    payload: TInput,
    opts: ExecuteTaskOptions,
  ): Promise<OffloadResult<TOutput>> {
    const start = performance.now()

    try {
      const data = await workerBroker.dispatch<TInput, TOutput>(
        task,
        payload,
        opts,
      )
      const durationMs = Math.round(performance.now() - start)
      return {
        data,
        durationMs,
        source: "worker",
      }
    } catch (err: any) {
      if (err?.name === "AbortError") {
        throw err
      }

      // Transparent degradation fallback to main thread
      try {
        const fallbackData = await executeTaskDirectly<TInput, TOutput>(
          task,
          payload,
        )
        const durationMs = Math.round(performance.now() - start)
        return {
          data: fallbackData,
          durationMs,
          source: "fallback",
        }
      } catch (fallbackErr) {
        throw fallbackErr
      }
    }
  }

  public clearCache() {
    this.cache.clear()
  }

  public getCacheSize(): number {
    return this.cache.size()
  }
}

export const offloadService = OffloadService.getInstance()
