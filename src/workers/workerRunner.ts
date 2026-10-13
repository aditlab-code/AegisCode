import type { WorkerRequest, WorkerResponse } from "./types"
import { executeTaskDirectly } from "./registry"

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  const start = performance.now()

  try {
    const data = await executeTaskDirectly(req.task, req.payload)
    const durationMs = Math.round(performance.now() - start)
    const res: WorkerResponse = {
      id: req.id,
      success: true,
      data,
      durationMs,
    }
    self.postMessage(res)
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - start)
    const res: WorkerResponse = {
      id: req.id,
      success: false,
      error: err?.message || String(err),
      durationMs,
    }
    self.postMessage(res)
  }
}
