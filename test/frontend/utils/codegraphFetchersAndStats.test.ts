import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  fetchStats,
  fetchSteps,
  fetchMap,
  fetchFlow,
  fetchScreens,
  fetchFileCode,
  CODEGRAPH_ROUTES,
} from "../../../src/services/codegraphApi"
import { fetchCodeGraphStatus } from "../../../src/utils/codegraphApi"

describe("CodeGraph Fetchers & Stats Diagnosis (Reproducing Bugs)", () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe("Symptom 1: Header Stats Node/Edge Counts from @colbymchenry/codegraph", () => {
    it("extracts node and edge counts from native graph object in /api/stats", async () => {
      const mockStatsPayload = {
        project: { root: "/workspace/fintech", name: "fintech" },
        index: { state: "complete", lastIndexedAt: 1700000000 },
        graph: { nodes: 585, edges: 1478, files: 53 },
        frameworks: ["react", "nextjs"],
      }
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockStatsPayload,
      } as Response)

      const stats = await fetchStats()
      expect(stats).not.toBeNull()
      // Bug reproduction: The consumer expects stats.nodes and stats.edges or normalized fields.
      // In colbymchenry payload, it is inside graph.nodes and graph.edges.
      // Also fetchCodeGraphStatus in utils/codegraphApi should extract this properly.
      const status = await fetchCodeGraphStatus()
      expect(status).not.toBeNull()
      expect(status?.totalSymbols).toBe(585)
      expect(status?.totalEdges).toBe(1478)
      expect(status?.totalFiles).toBe(53)
    })
  })

  describe("Symptom 2: Zero Silent Error Swallowing in fetchers", () => {
    it("fetchSteps throws explicit Error on non-ok response instead of returning null", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "Anchor symbol not found in graph index" }),
      } as Response)

      // Currently this returns null (silent swallowing) -> this test MUST GO RED
      await expect(fetchSteps("anchor1")).rejects.toThrow(
        /Anchor symbol not found in graph index|HTTP 404/,
      )
    })

    it("fetchMap throws explicit Error on non-ok response instead of returning null", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: async () => ({ error: "Architecture map generation failed" }),
      } as Response)

      // Currently this returns null (silent swallowing) -> this test MUST GO RED
      await expect(fetchMap()).rejects.toThrow(
        /Architecture map generation failed|HTTP 500/,
      )
    })

    it("fetchFlow throws explicit Error on non-ok response instead of returning null", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "Server names nothing in this index" }),
      } as Response)

      // Currently this returns null (silent swallowing) -> this test MUST GO RED
      await expect(fetchFlow({ from: "source", to: "Server" })).rejects.toThrow(
        /Server names nothing in this index|HTTP 400/,
      )
    })

    it("fetchScreens throws explicit Error on network error instead of returning null", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"))

      // Currently this returns null (silent swallowing) -> this test MUST GO RED
      await expect(fetchScreens()).rejects.toThrow(
        /CodeGraph network error|Connection refused/,
      )
    })

    it("fetchFileCode throws explicit Error on non-ok response instead of returning null", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "File not found" }),
      } as Response)

      // Currently this returns null (silent swallowing) -> this test MUST GO RED
      await expect(fetchFileCode("foo/bar.ts")).rejects.toThrow(
        /File not found|HTTP 404/,
      )
    })
  })
})
