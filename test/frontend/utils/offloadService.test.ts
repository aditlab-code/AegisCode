import { describe, it, expect, beforeEach } from "vitest"
import { offloadService, fnv1a } from "../../../src/utils/offloadService"
import { workerBroker } from "../../../src/workers"

describe("offloadService & WorkerBroker", () => {
  beforeEach(() => {
    offloadService.clearCache()
  })

  it("computes deterministic FNV-1a hashes", () => {
    const h1 = fnv1a("hello world")
    const h2 = fnv1a("hello world")
    const h3 = fnv1a("hello world 2")

    expect(h1).toBe(h2)
    expect(h1).not.toBe(h3)
    expect(typeof h1).toBe("string")
  })

  it("executes tokenize task and caches the result", async () => {
    const lines = ["const greeting = 'hello';", "console.log(greeting);"]
    const res1 = await offloadService.run({
      task: "tokenize",
      payload: { lines },
    })

    expect(res1.data.tokens).toHaveLength(2)
    expect(["worker", "fallback"]).toContain(res1.source)

    // Second call should hit the LRU cache
    const res2 = await offloadService.run({
      task: "tokenize",
      payload: { lines },
    })

    expect(res2.source).toBe("cache")
    expect(res2.durationMs).toBe(0)
    expect(res2.data.tokens).toEqual(res1.data.tokens)
  })

  it("coalesces concurrent in-flight requests", async () => {
    const lines = ["function calculate() { return 42; }"]

    const [p1, p2] = await Promise.all([
      offloadService.run({ task: "tokenize", payload: { lines } }),
      offloadService.run({ task: "tokenize", payload: { lines } }),
    ])

    expect(p1.data).toEqual(p2.data)
  })

  it("executes linter task via offloadService", async () => {
    const res = await offloadService.run({
      task: "lint",
      payload: {
        filename: "test.ts",
        content: "const a = 10;",
      },
    })

    expect(Array.isArray(res.data)).toBe(true)
  })

  it("handles AbortSignal correctly", async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      offloadService.run({
        task: "tokenize",
        payload: { lines: ["test"] },
        signal: controller.signal,
        skipCache: true,
      }),
    ).rejects.toThrow()
  })

  it("reports broker stats accurately", () => {
    const stats = workerBroker.getStats()
    expect(typeof stats.isSupported).toBe("boolean")
    expect(typeof stats.batchPoolSize).toBe("number")
  })
})
