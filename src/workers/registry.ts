import type { WorkerTaskDefinition } from "./types"
import { handleTokenizeTask } from "./tasks/tokenizerTask"
import { handleLintTask } from "./tasks/linterTask"

export function defineWorkerTask<TInput = any, TOutput = any>(
  def: WorkerTaskDefinition<TInput, TOutput>,
): WorkerTaskDefinition<TInput, TOutput> {
  return def
}

export const tokenizeTask = defineWorkerTask({
  name: "tokenize",
  lane: "fast",
  handler: handleTokenizeTask,
})

export const lintTask = defineWorkerTask({
  name: "lint",
  lane: "batch",
  handler: handleLintTask,
})

export const workerTaskRegistry: Record<string, WorkerTaskDefinition<any, any>> =
  {
    [tokenizeTask.name]: tokenizeTask,
    [lintTask.name]: lintTask,
  }

export function executeTaskDirectly<TInput = any, TOutput = any>(
  taskName: string,
  payload: TInput,
): Promise<TOutput> | TOutput {
  const def = workerTaskRegistry[taskName]
  if (!def) {
    throw new Error(`Worker task '${taskName}' not found in registry`)
  }
  return def.handler(payload)
}
