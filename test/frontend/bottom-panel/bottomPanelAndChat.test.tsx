import { describe, it, expect, vi } from "vitest"
import { renderToString } from "react-dom/server"
import { BottomPanel } from "@/components/layout/bottom-panel/BottomPanel"
import {
  DebugConsoleView,
  evaluateReplExpression,
} from "@/components/layout/bottom-panel/DebugConsoleView"
import { useWorkbenchStore } from "@/store"

describe("Track MP-3.4 (Bottom Panel & Chat Track) Tests", () => {
  describe("BP-02: Output Logs Startup Clean & BP-04: Windows Shell Support", () => {
    it("renders shell select containing Unix and Windows shell options", () => {
      const html = renderToString(<BottomPanel />)
      // Check shell options
      expect(html).toContain('value="zsh"')
      expect(html).toContain('value="bash"')
      expect(html).toContain('value="fish"')
      expect(html).toContain('value="sh"')
      expect(html).toContain('value="pwsh"')
      expect(html).toContain('value="powershell"')
      expect(html).toContain('value="cmd"')
    })

    it("initializes output logs with clean empty arrays", () => {
      const html = renderToString(<BottomPanel />)
      // Startup logs should NOT contain hardcoded mock strings
      expect(html).not.toContain("AegisCode Go Core Server connected")
      expect(html).not.toContain(
        "Starting incremental lint across 5 language profiles",
      )
      expect(html).not.toContain(
        "[vite] vite v8.3.4 building client environment",
      )
    })
  })

  describe("BP-03: Debug Console REPL Evaluation Graceful", () => {
    it("renders debug console without crashing", () => {
      const html = renderToString(<DebugConsoleView />)
      expect(html).toContain("Console")
      expect(html).toContain("Debug Console is empty")
    })

    it("evaluates local variables directly without crashing", () => {
      const debugState = {
        status: "stopped",
        variables: [
          { name: "totalCount", value: "42", type: "int" },
          { name: "message", value: '"hello world"', type: "string" },
        ],
      }

      // 1. Direct variable lookup
      const resVar = evaluateReplExpression("totalCount", true, debugState)
      expect(resVar).toEqual({
        category: "stdout",
        output: "42 (int)",
      })

      // 2. Safe mathematical expression evaluation with variables injected
      const resExpr = evaluateReplExpression("totalCount * 2", true, debugState)
      expect(resExpr).toEqual({
        category: "stdout",
        output: "84",
      })

      // 3. Command :vars and locals
      const resVars = evaluateReplExpression(":vars", true, debugState)
      expect(resVars?.output).toContain("totalCount (int) = 42")
      expect(resVars?.output).toContain('message (string) = "hello world"')

      // 4. Handles unresolvable symbol / syntax error gracefully without crashing
      const resErr = evaluateReplExpression("unknownVar + 1", true, debugState)
      expect(resErr?.category).toBe("error")
      expect(resErr?.output).toContain("Evaluation error:")
      expect(resErr?.output).toContain(
        'Expression "unknownVar + 1" could not be evaluated in current frame',
      )
      expect(resErr?.output).toContain('tip: type "locals" or ":stack"')

      // 5. Handles broken syntax gracefully
      const resSyntax = evaluateReplExpression("{{{ broken", true, debugState)
      expect(resSyntax?.category).toBe("error")
      expect(resSyntax?.output).toContain("Evaluation error:")

      // 6. Handles inactive debug session
      const resInactive = evaluateReplExpression("totalCount", false, {
        status: "idle",
      })
      expect(resInactive?.category).toBe("error")
      expect(resInactive?.output).toContain("No active debug session")
    })
  })

  describe("CH-02: AI Provider Credential Validation Logic", () => {
    function validateProviderKey(
      provider: string,
      keys: Record<string, string> = {},
    ): boolean {
      if (provider === "claude") {
        return Boolean(keys.claude?.trim() || keys.anthropic?.trim())
      }
      if (provider === "openai") {
        return Boolean(keys.openai?.trim())
      }
      if (provider === "gemini") {
        return Boolean(keys.gemini?.trim() || keys.google?.trim())
      }
      if (provider === "openrouter") {
        return Boolean(keys.openrouter?.trim())
      }
      if (provider === "opencode") {
        return Boolean(keys.opencode?.trim())
      }
      return true
    }

    it("allows antigravity provider without API key", () => {
      expect(validateProviderKey("antigravity", {})).toBe(true)
    })

    it("validates claude provider key correctly", () => {
      expect(validateProviderKey("claude", {})).toBe(false)
      expect(validateProviderKey("claude", { claude: "  " })).toBe(false)
      expect(validateProviderKey("claude", { claude: "sk-ant-123" })).toBe(true)
      expect(validateProviderKey("claude", { anthropic: "sk-ant-456" })).toBe(
        true,
      )
    })

    it("validates openai provider key correctly", () => {
      expect(validateProviderKey("openai", {})).toBe(false)
      expect(validateProviderKey("openai", { openai: "" })).toBe(false)
      expect(validateProviderKey("openai", { openai: "sk-proj-123" })).toBe(
        true,
      )
    })

    it("validates gemini provider key correctly", () => {
      expect(validateProviderKey("gemini", {})).toBe(false)
      expect(validateProviderKey("gemini", { gemini: "AIzaSy..." })).toBe(true)
      expect(validateProviderKey("gemini", { google: "AIzaSy..." })).toBe(true)
    })

    it("validates openrouter and opencode provider keys correctly", () => {
      expect(validateProviderKey("openrouter", {})).toBe(false)
      expect(
        validateProviderKey("openrouter", { openrouter: "sk-or-123" }),
      ).toBe(true)

      expect(validateProviderKey("opencode", {})).toBe(false)
      expect(
        validateProviderKey("opencode", { opencode: "oc-token-123" }),
      ).toBe(true)
    })
  })
})
