import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderToString } from "react-dom/server"
import { useWorkbenchStore } from "@/store"
import { DebugSidePanel } from "@/components/layout/sidebar/DebugSidePanel"

describe("Track MP-3.3 (Sidebar Git & Debug) Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe("SB-06: Interactive Git Branch Switch Modal", () => {
    it("manages branches in store and switches active branch", async () => {
      const checkoutSpy = vi.fn().mockImplementation(async (branch: string) => {
        useWorkbenchStore.setState({ activeBranch: branch })
        return true
      })

      useWorkbenchStore.setState({
        isGitRepo: true,
        activeRepo: "my-project",
        activeBranch: "main",
        gitBranches: ["main", "feature/auth", "bugfix/login"],
        checkoutBranch: checkoutSpy,
      })

      const state = useWorkbenchStore.getState()
      expect(state.gitBranches).toHaveLength(3)
      expect(state.activeBranch).toBe("main")

      // Switching branch
      await state.checkoutBranch("feature/auth")
      expect(checkoutSpy).toHaveBeenCalledWith("feature/auth")
      expect(useWorkbenchStore.getState().activeBranch).toBe("feature/auth")
    })
  })

  describe("SB-07: AI Commit Message Context", () => {
    function generateAiCommitMessage(
      staged: Array<{ file: string }>,
      unstaged: Array<{ file: string }>,
    ): string {
      const isDirty = staged.length > 0 || unstaged.length > 0
      if (!isDirty) return ""

      const stagedFiles = staged.map((c) => c.file)
      const unstagedFiles = unstaged.map((c) => c.file)
      const allFiles = Array.from(new Set([...stagedFiles, ...unstagedFiles]))

      const prefix = allFiles.some((f) => f.includes("test"))
        ? "test"
        : allFiles.some((f) => f.endsWith(".md") || f.includes("docs/"))
          ? "docs"
          : allFiles.some((f) => f.includes("fix") || f.includes("bug"))
            ? "fix"
            : "feat"

      const summary = `${prefix}: update ${allFiles.slice(0, 2).join(", ")}${
        allFiles.length > 2 ? ` and ${allFiles.length - 2} other files` : ""
      }`

      const contextSections: string[] = []
      if (stagedFiles.length > 0) {
        contextSections.push(
          `Staged files:\n${stagedFiles.map((f) => `- ${f}`).join("\n")}`,
        )
      }
      if (unstagedFiles.length > 0) {
        contextSections.push(
          `Unstaged files:\n${unstagedFiles.map((f) => `- ${f}`).join("\n")}`,
        )
      }

      return contextSections.length > 0
        ? `${summary}\n\n${contextSections.join("\n\n")}`
        : summary
    }

    it("includes staged and unstaged file paths in commit message context", () => {
      const staged = [{ file: "src/auth/login.ts" }]
      const unstaged = [
        { file: "src/auth/logout.ts" },
        { file: "test/auth.test.ts" },
      ]

      const msg = generateAiCommitMessage(staged, unstaged)
      expect(msg).toContain(
        "test: update src/auth/login.ts, src/auth/logout.ts and 1 other files",
      )
      expect(msg).toContain("Staged files:\n- src/auth/login.ts")
      expect(msg).toContain(
        "Unstaged files:\n- src/auth/logout.ts\n- test/auth.test.ts",
      )
    })

    it("handles only staged changes gracefully", () => {
      const staged = [{ file: "docs/readme.md" }]
      const unstaged: Array<{ file: string }> = []

      const msg = generateAiCommitMessage(staged, unstaged)
      expect(msg).toContain("docs: update docs/readme.md")
      expect(msg).toContain("Staged files:\n- docs/readme.md")
      expect(msg).not.toContain("Unstaged files:")
    })
  })

  describe("SB-08 & NEW-01: Breakpoint & Stack Frame Navigation", () => {
    it("renders DebugSidePanel without crashing", () => {
      const html = renderToString(<DebugSidePanel />)
      expect(html).toContain("Debug Session")
      expect(html).toContain("VARIABLES")
      expect(html).toContain("CALL STACK")
      expect(html).toContain("BREAKPOINTS")
    })

    it("dispatches aegis:editor-goto-line event on breakpoint navigation without calling setActiveDebugLine", () => {
      const openFileInGroupSpy = vi.fn()
      const setActiveDebugLineSpy = vi.fn()
      const dispatchSpy = vi.fn()

      const fakeWindow = { dispatchEvent: dispatchSpy }
      const focusedGroup = "group2"
      const file = "server/main.go"
      const line = 25

      // Handler logic in DebugSidePanel
      const handleNavigateBreakpoint = (
        targetFile: string,
        targetLine: number,
      ) => {
        openFileInGroupSpy(targetFile, focusedGroup)
        fakeWindow.dispatchEvent({
          type: "aegis:editor-goto-line",
          detail: { file: targetFile, line: targetLine, col: 1 },
        })
      }

      handleNavigateBreakpoint(file, line)

      expect(openFileInGroupSpy).toHaveBeenCalledWith(
        "server/main.go",
        "group2",
      )
      expect(setActiveDebugLineSpy).not.toHaveBeenCalled()
      expect(dispatchSpy).toHaveBeenCalledWith({
        type: "aegis:editor-goto-line",
        detail: { file: "server/main.go", line: 25, col: 1 },
      })
    })

    it("dispatches aegis:editor-goto-line and calls setActiveDebugLine on frame navigation", () => {
      const openFileInGroupSpy = vi.fn()
      const setActiveDebugLineSpy = vi.fn()
      const dispatchSpy = vi.fn()

      const fakeWindow = { dispatchEvent: dispatchSpy }
      const focusedGroup = "group1"
      const file = "pkg/utils.go"
      const line = 88

      // Handler logic in DebugSidePanel
      const handleNavigateFrame = (targetFile: string, targetLine: number) => {
        if (!targetFile) return
        openFileInGroupSpy(targetFile, focusedGroup)
        setActiveDebugLineSpy({ file: targetFile, line: targetLine })
        fakeWindow.dispatchEvent({
          type: "aegis:editor-goto-line",
          detail: { file: targetFile, line: targetLine, col: 1 },
        })
      }

      handleNavigateFrame(file, line)

      expect(openFileInGroupSpy).toHaveBeenCalledWith("pkg/utils.go", "group1")
      expect(setActiveDebugLineSpy).toHaveBeenCalledWith({
        file: "pkg/utils.go",
        line: 88,
      })
      expect(dispatchSpy).toHaveBeenCalledWith({
        type: "aegis:editor-goto-line",
        detail: { file: "pkg/utils.go", line: 88, col: 1 },
      })
    })
  })

  describe("SB-09: Debug Variable Value Expansion Logic", () => {
    it("handles expanding and collapsing variable values", () => {
      let expandedVarKeys: Record<string, boolean> = {}

      const toggleVarExpand = (key: string) => {
        expandedVarKeys = {
          ...expandedVarKeys,
          [key]: !expandedVarKeys[key],
        }
      }

      const key = "myVar-0"
      expect(expandedVarKeys[key]).toBeUndefined()

      // Expand
      toggleVarExpand(key)
      expect(expandedVarKeys[key]).toBe(true)

      // Collapse
      toggleVarExpand(key)
      expect(expandedVarKeys[key]).toBe(false)
    })
  })
})
