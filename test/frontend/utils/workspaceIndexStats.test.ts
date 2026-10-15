import { describe, it, expect } from "vitest"
import {
  fetchWorkspaceIndexStats,
  type WorkspaceIndexStats,
} from "../../../src/utils/workspaceApi"

describe("fetchWorkspaceIndexStats API", () => {
  it("fetches and deserializes index telemetry correctly", async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((async () => ({
      ok: true,
      json: async (): Promise<WorkspaceIndexStats> => ({
        totalFiles: 1420,
        lastIndexedAt: "2026-10-15T23:00:00Z",
        indexDurationMs: 45,
        status: "ready",
      }),
    })) as any)

    try {
      const stats = await fetchWorkspaceIndexStats()
      expect(stats.totalFiles).toBe(1420)
      expect(stats.status).toBe("ready")
      expect(stats.indexDurationMs).toBe(45)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
