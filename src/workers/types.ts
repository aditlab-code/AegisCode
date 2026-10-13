export type TaskLane = "fast" | "batch"
export type TaskPriority = "high" | "normal" | "low"

export interface WorkerRequest<T = any> {
  id: number
  task: string
  payload: T
  lane: TaskLane
  priority?: TaskPriority
}

export interface WorkerResponse<T = any> {
  id: number
  success: boolean
  data?: T
  error?: string
  durationMs: number
}

export type WorkerTaskHandler<TInput = any,
TOutput = any,> = (payload: TInput) => Promise<TOutput> | TOutput

export interface WorkerTaskDefinition<TInput = any, TOutput = any> {
  name: string
  lane: TaskLane
  handler: WorkerTaskHandler<TInput, TOutput>
}

export interface RawSyntaxToken {
  text: string
  className?: string
}

export interface TokenizePayload {
  lines: string[]
  tabSize?: number
}

export interface TokenizeResult {
  tokens: RawSyntaxToken[][]
}

export interface LintPayload {
  filename: string
  content: string
}
