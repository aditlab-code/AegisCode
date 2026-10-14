import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  normalizeEntrypointsPayload,
  fetchEntrypoints,
  CODEGRAPH_ROUTES,
} from "../../../src/services/codegraphApi"

describe("CodeGraph Entrypoints Normalizer & Fetcher", () => {
  describe("normalizeEntrypointsPayload", () => {
    it("normalizes a standard @colbymchenry/codegraph entrypoints payload", () => {
      const nativePayload = {
        frameworks: ["gin", "react"],
        routes: {
          routed: true,
          routeCount: 1,
          items: {
            total: 1,
            shown: 1,
            truncated: false,
            items: [
              {
                id: "route-1",
                path: "/api/users",
                method: "GET",
                file: "server/api.go",
                line: 42,
                framework: "gin",
              },
            ],
          },
        },
        files: {
          total: 1,
          shown: 1,
          truncated: false,
          items: [
            {
              id: "file-1",
              name: "main.go",
              qualifiedName: "main.go",
              file: "server/cmd/main.go",
              line: 1,
              endLine: 50,
              language: "go",
              kind: "file",
              test: false,
              calls: 5,
              reaches: 12,
              dependents: 3,
            },
          ],
        },
        tests: {
          total: 0,
          shown: 0,
          truncated: false,
          items: [],
        },
        hubs: {
          total: 1,
          shown: 1,
          truncated: false,
          items: [
            {
              id: "hub-1",
              name: "Server",
              qualifiedName: "api.Server",
              file: "server/internal/api/api.go",
              line: 80,
              endLine: 350,
              language: "go",
              kind: "struct",
              test: false,
              dependents: 15,
            },
          ],
        },
        index: {
          lastIndexedAt: 1728900000,
          files: 45,
        },
        timing: {
          elapsedMs: 35,
          cached: true,
        },
      }

      const normalized = normalizeEntrypointsPayload(nativePayload)
      expect(normalized.frameworks).toEqual(["gin", "react"])
      expect(normalized.routes.routed).toBe(true)
      expect(normalized.routes.routeCount).toBe(1)
      expect(normalized.routes.items.items[0].path).toBe("/api/users")
      expect(normalized.files.items[0].name).toBe("main.go")
      expect(normalized.hubs.items[0].dependents).toBe(15)
      expect(normalized.index.files).toBe(45)
    })

    it("unpacks MCP CallToolResult text envelope cleanly", () => {
      const mcpWrapped = {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              frameworks: ["express"],
              routes: {
                routed: true,
                routeCount: 1,
                items: {
                  total: 1,
                  items: [
                    {
                      id: "route-2",
                      path: "/api/health",
                      method: "GET",
                      file: "src/server.ts",
                      line: 10,
                    },
                  ],
                },
              },
            }),
          },
        ],
        isError: false,
      }

      const normalized = normalizeEntrypointsPayload(mcpWrapped)
      expect(normalized.frameworks).toEqual(["express"])
      expect(normalized.routes.routeCount).toBe(1)
      expect(normalized.routes.items.items[0].path).toBe("/api/health")
    })

    it("throws explicit error when payload contains error field (never passes silently)", () => {
      expect(() => {
        normalizeEntrypointsPayload({
          error:
            "workspace is not initialized with CodeGraph. Initialize workspace first.",
        })
      }).toThrowError(
        "workspace is not initialized with CodeGraph. Initialize workspace first.",
      )
    })

    it("throws explicit error on non-object payload", () => {
      expect(() => {
        normalizeEntrypointsPayload(null)
      }).toThrowError("Invalid CodeGraph entrypoints response")

      expect(() => {
        normalizeEntrypointsPayload("plain string")
      }).toThrowError("Invalid CodeGraph entrypoints response")
    })
  })

  describe("fetchEntrypoints", () => {
    const originalFetch = globalThis.fetch

    beforeEach(() => {
      vi.restoreAllMocks()
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
    })

    it("attaches workspace query parameter to the URL", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          frameworks: [],
          routes: { items: { items: [] } },
          files: { items: [] },
          tests: { items: [] },
          hubs: { items: [] },
        }),
      })
      globalThis.fetch = mockFetch

      await fetchEntrypoints(undefined, "/Users/dev/project")

      expect(mockFetch).toHaveBeenCalledTimes(1)
      const callUrl = mockFetch.mock.calls[0][0]
      expect(callUrl).toContain(
        "/api/codegraph/ui/entrypoints?workspace=%2FUsers%2Fdev%2Fproject",
      )
    })

    it("throws descriptive error on 503 daemon unready (no silent swallowing)", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: "Service Unavailable",
        json: async () => ({
          error: "CodeGraph daemon unavailable: readiness probe timed out",
        }),
      })
      globalThis.fetch = mockFetch

      await expect(fetchEntrypoints()).rejects.toThrowError(
        "CodeGraph daemon unavailable: readiness probe timed out",
      )
    })

    it("throws descriptive error on network disconnect (no silent swallowing)", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"))
      globalThis.fetch = mockFetch

      await expect(fetchEntrypoints()).rejects.toThrowError(
        "CodeGraph network error: Failed to fetch",
      )
    })
  })
})
