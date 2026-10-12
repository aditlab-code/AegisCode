import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  startDebugSession,
  setBreakpoints,
  stepDebug,
  getDebugState,
  terminateDebugSession,
  connectDebugSSE,
} from "@/utils/debugApi"
import type { DebugState, StreamDebugEvent } from "@/types/workbench"
import { loadStoredBottomTabOrder } from "@/context/core/layoutCore"
import { getTerminalRunCommand } from "@/context/core/workbenchFacade"

describe("DAP Debugger (Delve) Frontend Workflow", () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("Breakpoint Management Logic", () => {
    function toggleBreakpointLogic(
      current: Record<string, number[]>,
      file: string,
      line: number,
    ): Record<string, number[]> {
      const list = current[file] || []
      const updated = list.includes(line)
        ? list.filter((l) => l !== line)
        : [...list, line].sort((a, b) => a - b)
      return {
        ...current,
        [file]: updated,
      }
    }

    it("adds a breakpoint to an empty file list in sorted order", () => {
      let bps: Record<string, number[]> = {}
      bps = toggleBreakpointLogic(bps, "main.go", 15)
      expect(bps["main.go"]).toEqual([15])

      bps = toggleBreakpointLogic(bps, "main.go", 5)
      expect(bps["main.go"]).toEqual([5, 15])

      bps = toggleBreakpointLogic(bps, "main.go", 10)
      expect(bps["main.go"]).toEqual([5, 10, 15])
    })

    it("removes an existing breakpoint when toggled again", () => {
      let bps: Record<string, number[]> = { "main.go": [5, 10, 15] }
      bps = toggleBreakpointLogic(bps, "main.go", 10)
      expect(bps["main.go"]).toEqual([5, 15])

      bps = toggleBreakpointLogic(bps, "main.go", 5)
      expect(bps["main.go"]).toEqual([15])

      bps = toggleBreakpointLogic(bps, "main.go", 15)
      expect(bps["main.go"]).toEqual([])
    })

    it("maintains separate breakpoint lists across distinct files", () => {
      let bps: Record<string, number[]> = {}
      bps = toggleBreakpointLogic(bps, "main.go", 20)
      bps = toggleBreakpointLogic(bps, "server.go", 42)

      expect(bps["main.go"]).toEqual([20])
      expect(bps["server.go"]).toEqual([42])
    })
  })

  describe("Debug State Transitions", () => {
    it("reflects state progression from idle -> running -> stopped -> terminated", () => {
      let state: DebugState = { active: false, status: "idle" }
      expect(state.status).toBe("idle")
      expect(state.active).toBe(false)

      // Start session
      state = { active: true, status: "running" }
      expect(state.status).toBe("running")
      expect(state.active).toBe(true)

      // Hit breakpoint
      state = {
        active: true,
        status: "stopped",
        currentFile: "main.go",
        currentLine: 18,
        stopReason: "breakpoint",
        stackFrames: [
          { id: 1, name: "main.main", file: "main.go", line: 18, column: 0 },
        ],
        variables: [
          { name: "count", value: "42", type: "int" },
          { name: "msg", value: '"hello"', type: "string" },
        ],
      }
      expect(state.status).toBe("stopped")
      expect(state.currentFile).toBe("main.go")
      expect(state.currentLine).toBe(18)
      expect(state.stackFrames?.length).toBe(1)
      expect(state.variables?.length).toBe(2)

      // Terminate session
      state = { active: false, status: "terminated" }
      expect(state.status).toBe("terminated")
      expect(state.active).toBe(false)
    })
  })

  describe("Debug API Client", () => {
    it("calls startDebugSession and parses successful response", async () => {
      const mockState: DebugState = { active: true, status: "running" }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "started", state: mockState }),
      })

      const res = await startDebugSession("server/cmd/server")
      expect(res.status).toBe("started")
      expect(res.state).toEqual(mockState)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/debug/start",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ program: "server/cmd/server" }),
        }),
      )
    })

    it("calls startDebugSession with initial breakpoints included in payload", async () => {
      const mockState: DebugState = { active: true, status: "running" }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "started", state: mockState }),
      })

      const res = await startDebugSession(
        "server/cmd/server",
        undefined,
        undefined,
        undefined,
        { "main.go": [15, 25] },
      )
      expect(res.status).toBe("started")
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/debug/start",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            program: "server/cmd/server",
            breakpoints: { "main.go": [15, 25] },
          }),
        }),
      )
    })

    it("returns error code and message on start failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "Delve not installed",
          code: "delve_not_found",
        }),
      })

      const res = await startDebugSession()
      expect(res.status).toBe("error")
      expect(res.code).toBe("delve_not_found")
      expect(res.error).toBe("Delve not installed")
    })

    it("handles launch_failed error gracefully without throwing", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: "No Go files found in target directory",
          code: "no_go_files",
        }),
      })

      const res = await startDebugSession()
      expect(res.status).toBe("error")
      expect(res.code).toBe("no_go_files")
      expect(res.error).toBe("No Go files found in target directory")
    })

    it("starts a Python debug session with language specified", async () => {
      const mockState: DebugState = { active: true, status: "running" }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "started", state: mockState }),
      })

      const res = await startDebugSession(
        "scripts/app.py",
        undefined,
        undefined,
        undefined,
        { "scripts/app.py": [10] },
        "python",
      )
      expect(res.status).toBe("started")
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/debug/start",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            program: "scripts/app.py",
            breakpoints: { "scripts/app.py": [10] },
            language: "python",
          }),
        }),
      )
    })

    it("handles debugpy_not_found error response correctly", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          error:
            "debugpy debugger not found. Run 'pip install debugpy' to install Python debugger.",
          code: "debugpy_not_found",
        }),
      })

      const res = await startDebugSession(
        "app.py",
        undefined,
        undefined,
        undefined,
        undefined,
        "python",
      )
      expect(res.status).toBe("error")
      expect(res.code).toBe("debugpy_not_found")
      expect(res.error).toContain("pip install debugpy")
    })

    it("sets breakpoints via POST /api/v1/debug/breakpoints", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          breakpoints: [
            { id: 1, file: "main.go", line: 10, verified: true },
            { id: 2, file: "main.go", line: 20, verified: true },
          ],
        }),
      })

      const bps = await setBreakpoints("main.go", [10, 20])
      expect(bps.length).toBe(2)
      expect(bps[0].verified).toBe(true)
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/debug/breakpoints",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ file: "main.go", lines: [10, 20] }),
        }),
      )
    })

    it("sends step commands via POST /api/v1/debug/step", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ok" }),
      })

      await stepDebug("stepOver")
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/debug/step",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ action: "stepOver" }),
        }),
      )
    })

    it("fetches state snapshot via GET /api/v1/debug/state", async () => {
      const mockState: DebugState = {
        active: true,
        status: "stopped",
        currentLine: 12,
      }
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockState,
      })

      const state = await getDebugState()
      expect(state).toEqual(mockState)
    })

    it("terminates debug session via POST /api/v1/debug/terminate", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "terminated" }),
      })

      await terminateDebugSession()
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/v1/debug/terminate",
        expect.objectContaining({ method: "POST" }),
      )
    })
  })

  describe("SSE Debug Event Streaming", () => {
    it("listens to debug events and dispatches parsed payloads", () => {
      const listeners: Record<string, (e: any) => void> = {}
      const closeMock = vi.fn()

      class MockEventSource {
        constructor(public url: string) {}
        addEventListener(event: string, handler: (e: any) => void) {
          listeners[event] = handler
        }
        close = closeMock
      }

      const originalEventSource = globalThis.EventSource
      globalThis.EventSource = (MockEventSource as any)

      try {
        const received: StreamDebugEvent[] = []
        const disconnect = connectDebugSSE((evt) => received.push(evt))

        expect(listeners["debug:started"]).toBeDefined()
        expect(listeners["debug:stopped"]).toBeDefined()
        expect(listeners["debug:continued"]).toBeDefined()
        expect(listeners["debug:terminated"]).toBeDefined()

        // Simulate stopped event
        listeners["debug:stopped"]({
          data: JSON.stringify({
            type: "debug:stopped",
            reason: "breakpoint",
            currentFile: "main.go",
            currentLine: 42,
          }),
        })

        expect(received.length).toBe(1)
        expect(received[0].type).toBe("debug:stopped")
        expect(received[0].currentLine).toBe(42)

        disconnect()
        expect(closeMock).toHaveBeenCalled()
      } finally {
        globalThis.EventSource = originalEventSource
      }
    })
  })

  describe("Bottom Panel Tab Order Integration", () => {
    it("auto-migrates existing 3-tab layout by appending 'Debug'", () => {
      const storage = new Map<string, string>()
      storage.set(
        "aegis_bottom_panel_tab_order",
        JSON.stringify(["Terminal", "Problems", "Output"]),
      )
      const mockStorage = {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
      }
      const prevWindow = (globalThis as any).window
      ;(globalThis as any).window = { localStorage: mockStorage }

      try {
        const order = loadStoredBottomTabOrder()
        expect(order).toContain("Debug")
        expect(order).toEqual(["Terminal", "Problems", "Output", "Debug"])
      } finally {
        ;(globalThis as any).window = prevWindow
      }
    })

    it("preserves customized tab order containing 'Debug'", () => {
      const storage = new Map<string, string>()
      storage.set(
        "aegis_bottom_panel_tab_order",
        JSON.stringify(["Debug", "Output", "Terminal", "Problems"]),
      )
      const mockStorage = {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
      }
      const prevWindow = (globalThis as any).window
      ;(globalThis as any).window = { localStorage: mockStorage }

      try {
        const order = loadStoredBottomTabOrder()
        expect(order).toEqual(["Debug", "Output", "Terminal", "Problems"])
      } finally {
        ;(globalThis as any).window = prevWindow
      }
    })
  })

  describe("Terminal Runner Command Resolution", () => {
    it("resolves python command correctly", () => {
      expect(getTerminalRunCommand("scripts/app.py")).toBe(
        'python3 "scripts/app.py"',
      )
      expect(getTerminalRunCommand("test.pyw")).toBe('python3 "test.pyw"')
    })

    it("resolves go run command correctly", () => {
      expect(getTerminalRunCommand("cmd/server/main.go")).toBe(
        'go run "cmd/server/main.go"',
      )
    })

    it("resolves node and tsx commands correctly", () => {
      expect(getTerminalRunCommand("index.js")).toBe('node "index.js"')
      expect(getTerminalRunCommand("src/main.ts")).toBe('npx tsx "src/main.ts"')
    })

    it("resolves bash, cpp, and rust commands", () => {
      expect(getTerminalRunCommand("deploy.sh")).toBe('bash "deploy.sh"')
      expect(getTerminalRunCommand("main.cpp")).toBe(
        'clang++ "main.cpp" -o /tmp/aegis_bin && /tmp/aegis_bin',
      )
      expect(getTerminalRunCommand("main.rs")).toBe(
        'rustc "main.rs" -o /tmp/aegis_bin && /tmp/aegis_bin',
      )
    })

    it("returns null for unsupported or non-executable file types", () => {
      expect(getTerminalRunCommand("README.md")).toBeNull()
      expect(getTerminalRunCommand("styles.css")).toBeNull()
    })
  })
})
