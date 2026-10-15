import { describe, it, expect, beforeEach } from "vitest"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { VirtualWorkspaceEngine } from "../virtualWorkspace"
import {
  openTabInGroupLogic,
  closeTabInGroupLogic,
  moveTabBetweenGroupsLogic,
  reorderTabsInGroupLogic,
  renameTabInAllGroupsLogic,
} from "@/store/slices/createEditorSlice"
import {
  addFileToTreeLogic,
  removeFileFromTreeLogic,
  renameFileInTreeLogic,
  updateBufferContentLogic,
  markBufferSavedLogic,
  revertBufferContentLogic,
  sanitizeContentOnSave,
  normalizeWorkspacePath,
  AsyncSequenceGuard,
} from "@/store/slices/createWorkspaceSlice"
import {
  stageChangeLogic,
  unstageChangeLogic,
  stageAllLogic,
  unstageAllLogic,
  commitChangesLogic,
} from "@/context/core/gitCore"
import {
  reorderBottomTabsLogic,
  toggleThemeLogic,
  DEFAULT_SIDEBAR_WIDTH,
} from "@/store/slices/createLayoutSlice"
import {
  DEFAULT_APP_SETTINGS,
  loadStoredSettings,
  saveStoredSettings,
} from "@/store/slices/createSettingsSlice"
import { getThemeDefinition, PALETTE_OPTIONS } from "@/themes/themeRegistry"
import { computeMinimapScaleConfig } from "@/components/layout/editor/Minimap"
import {
  createTerminalSessionLogic,
  closeTerminalSessionLogic,
  processTerminalCommandLogic,
} from "@/context/core/terminalCore"
import {
  createSessionLogic,
  deleteSessionLogic,
  sendChatMessageLogic,
  setSessionModelLogic,
  generateContextualReply,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
} from "@/context/core/chatCore"
import {
  CHAT_PROVIDERS,
  CHAT_MODELS,
  getMergedProviderModels,
} from "@/data/chatConstants"
import {
  extractEditorContext,
  buildMentionContextItem,
  extractFileOutline,
  extractSnippet,
  enforceContextTokenBudget,
  estimateTokens,
  isPathExcluded,
  MAX_CONTEXT_CHARS,
} from "@/context/core/contextExtractorCore"
import type {
  EditorGroupState,
  FileItem,
  FileBuffer,
  GitChange,
  GitCommitNode,
  BottomTab,
  TerminalSession,
  ChatSession,
  ChatProvider,
  ContextItem,
} from "@/types/workbench"

/**
 * Core Workbench State Container for Regression & Logic Validation
 */
export interface CoreWorkbenchHarness {
  vfs: VirtualWorkspaceEngine
  group1: EditorGroupState
  group2: EditorGroupState
  files: FileItem[]
  buffers: Record<string, FileBuffer>
  changes: GitChange[]
  staged: GitChange[]
  commits: GitCommitNode[]
  bottomTabs: BottomTab[]
  terminals: TerminalSession[]
  chatSessions: ChatSession[]
  activeChatId: string
  lastExtractedContext?: ContextItem | null
}

export function createCoreWorkbenchHarness(): CoreWorkbenchHarness {
  const vfs = new VirtualWorkspaceEngine({
    "src/index.ts": "console.log('hello')",
    "README.md": "# AegisCode",
  })

  return {
    vfs,
    group1: {
      id: "group1",
      name: "Group 1",
      tabs: ["src/index.ts"],
      activeTab: "src/index.ts",
    },
    group2: { id: "group2", name: "Group 2", tabs: [], activeTab: "" },
    files: vfs.getFlatTree(),
    buffers: {
      "src/index.ts": {
        content: "console.log('hello')",
        isDirty: false,
        language: "TypeScript",
      },
    },
    changes: [
      { file: "src/index.ts", status: "M", additions: 2, deletions: 1 },
    ],
    staged: [],
    commits: [],
    bottomTabs: ["Terminal", "Problems", "Output"],
    terminals: [
      {
        id: "term-1",
        name: "1: zsh",
        shell: "zsh",
        lines: ["ready"],
        running: true,
        commandHistory: [],
      },
    ],
    chatSessions: [
      {
        id: "chat-1",
        title: "Initial Session",
        provider: "antigravity",
        model: "gemini-3.8-flash",
        messages: [{ id: "m-1", role: "agent", text: "Connected" }],
        createdAt: 1000,
      },
    ],
    activeChatId: "chat-1",
  }
}

/**
 * Centralized Core Test Scenario Matrix
 * Every test verifies against this Core Test suite.
 * New regression scenarios can be added directly to this table.
 */
export interface RegressionScenario {
  id: string
  description: string
  execute: (h: CoreWorkbenchHarness) => void | Promise<void>
  verify: (h: CoreWorkbenchHarness) => void
}

export const coreRegressionScenarios: RegressionScenario[] = [
  // 1. Workspace File Lifecycle & In-Memory Synchronization
  {
    id: "WS-01",
    description:
      "Create file in virtual filesystem, update buffer, and mark saved",
    execute: (h) => {
      h.vfs.writeFile(
        "src/utils.ts",
        "export const add = (a, b) => a + b",
        false,
      )
      h.files = addFileToTreeLogic(h.files, "src/utils.ts", false)
      h.buffers = updateBufferContentLogic(
        h.buffers,
        "src/utils.ts",
        "export const add = (a, b) => a + b",
      )
      h.group1 = openTabInGroupLogic(h.group1, "src/utils.ts")
    },
    verify: (h) => {
      expect(h.files.some((f) => f.path === "src/utils.ts")).toBe(true)
      expect(h.buffers["src/utils.ts"]?.isDirty).toBe(true)
      expect(h.group1.activeTab).toBe("src/utils.ts")
      expect(h.group1.tabs).toContain("src/utils.ts")

      // Perform save
      h.buffers = markBufferSavedLogic(h.buffers, "src/utils.ts")
      expect(h.buffers["src/utils.ts"]?.isDirty).toBe(false)
    },
  },

  // 2. File Rename propagating to Open Tabs & Buffer
  {
    id: "WS-02",
    description:
      "Rename file updates tree, buffers, and all editor tabs without losing state",
    execute: (h) => {
      h.vfs.renameFile("src/index.ts", "src/main.ts")
      h.files = renameFileInTreeLogic(h.files, "src/index.ts", "src/main.ts")
      const updatedTabs = renameTabInAllGroupsLogic(
        h.group1,
        h.group2,
        "src/index.ts",
        "src/main.ts",
      )
      h.group1 = updatedTabs.group1
      h.group2 = updatedTabs.group2
      if (h.buffers["src/index.ts"]) {
        h.buffers["src/main.ts"] = h.buffers["src/index.ts"]
        delete h.buffers["src/index.ts"]
      }
    },
    verify: (h) => {
      expect(h.files.some((f) => f.path === "src/main.ts")).toBe(true)
      expect(h.files.some((f) => f.path === "src/index.ts")).toBe(false)
      expect(h.group1.activeTab).toBe("src/main.ts")
      expect(h.group1.tabs).toContain("src/main.ts")
      expect(h.group1.tabs).not.toContain("src/index.ts")
      expect(h.buffers["src/main.ts"]).toBeDefined()
    },
  },

  // 3. File Deletion auto-closing Tabs in Groups
  {
    id: "WS-03",
    description:
      "Delete file auto-closes tabs across editor groups and cleans buffers",
    execute: (h) => {
      h.vfs.deleteFile("README.md")
      h.files = removeFileFromTreeLogic(h.files, "README.md")
      h.group1 = closeTabInGroupLogic(h.group1, "README.md")
      delete h.buffers["README.md"]
    },
    verify: (h) => {
      expect(h.files.some((f) => f.path === "README.md")).toBe(false)
      expect(h.group1.tabs).not.toContain("README.md")
    },
  },

  // 4. Multi-Group Split Editor & Tab Migration
  {
    id: "ED-01",
    description: "Migrate tab between groups and auto-focus active tab",
    execute: (h) => {
      h.group1 = openTabInGroupLogic(h.group1, "README.md")
      h.group1 = openTabInGroupLogic(h.group1, "src/index.ts")
      const moved = moveTabBetweenGroupsLogic(h.group1, h.group2, "README.md")
      h.group1 = moved.source
      h.group2 = moved.target
    },
    verify: (h) => {
      expect(h.group1.tabs).not.toContain("README.md")
      expect(h.group1.activeTab).toBe("src/index.ts")
      expect(h.group2.tabs).toContain("README.md")
      expect(h.group2.activeTab).toBe("README.md")
    },
  },

  // 5. Editor Tab Reordering
  {
    id: "ED-02",
    description: "Reorder tabs in group accurately preserves array boundaries",
    execute: (h) => {
      h.group1 = {
        id: "group1",
        name: "Group 1",
        tabs: ["tabA", "tabB", "tabC"],
        activeTab: "tabA",
      }
      h.group1 = reorderTabsInGroupLogic(h.group1, 0, 2)
    },
    verify: (h) => {
      expect(h.group1.tabs).toEqual(["tabB", "tabC", "tabA"])
    },
  },

  // 6. Git Workflow: Staging, Unstaging, and Committing
  {
    id: "GIT-01",
    description: "Git change staging, unstaging, and commit creation lifecycle",
    execute: (h) => {
      // Stage change
      const stagedRes = stageChangeLogic(h.changes, h.staged, "src/index.ts")
      h.changes = stagedRes.changes
      h.staged = stagedRes.staged

      // Commit
      const commitRes = commitChangesLogic(
        h.staged,
        h.commits,
        "main",
        "feat: initial core test commit",
      )
      h.staged = commitRes.staged
      h.commits = commitRes.commits
    },
    verify: (h) => {
      expect(h.changes.length).toBe(0)
      expect(h.staged.length).toBe(0)
      expect(h.commits.length).toBe(1)
      expect(h.commits[0].message).toBe("feat: initial core test commit")
      expect(h.commits[0].branch).toBe("main")
      expect(h.commits[0].hash).toBeDefined()
    },
  },

  // 7. Git Stage All & Unstage All
  {
    id: "GIT-02",
    description:
      "Git batch staging and unstaging maintains total changes invariant",
    execute: (h) => {
      h.changes = [
        { file: "a.ts", status: "M", additions: 1, deletions: 0 },
        { file: "b.ts", status: "A", additions: 10, deletions: 0 },
      ]
      h.staged = []
      const allStaged = stageAllLogic(h.changes, h.staged)
      h.changes = allStaged.changes
      h.staged = allStaged.staged

      const allUnstaged = unstageAllLogic(h.changes, h.staged)
      h.changes = allUnstaged.changes
      h.staged = allUnstaged.staged
    },
    verify: (h) => {
      expect(h.staged.length).toBe(0)
      expect(h.changes.length).toBe(2)
      expect(h.changes.map((c) => c.file)).toEqual(["a.ts", "b.ts"])
    },
  },

  // 8. Terminal Command Execution & PTY Sessions
  {
    id: "TERM-01",
    description: "Terminal PTY command execution and session lifecycle",
    execute: (h) => {
      const created = createTerminalSessionLogic(h.terminals, "bash")
      h.terminals = created.sessions
      const termBash = h.terminals.find((t) => t.id === created.newSession.id)!

      const updatedTerm = processTerminalCommandLogic(
        termBash,
        "echo hello aegis",
      )
      h.terminals = h.terminals.map((t) =>
        t.id === updatedTerm.id ? updatedTerm : t,
      )
    },
    verify: (h) => {
      expect(h.terminals.length).toBe(2)
      const bashTerm = h.terminals[1]
      expect(bashTerm.commandHistory).toContain("echo hello aegis")
      expect(bashTerm.lines).toContain("hello aegis")
    },
  },

  // 9. AI Agent Chat Session Streaming & Message Logic
  {
    id: "CHAT-01",
    description: "AI Chat session creation and message exchange logic",
    execute: (h) => {
      const newChat = createSessionLogic(
        h.chatSessions,
        "antigravity",
        "gemini-3.8-flash",
      )
      h.chatSessions = newChat.sessions
      h.activeChatId = newChat.newSession.id

      h.chatSessions = sendChatMessageLogic(
        h.chatSessions,
        h.activeChatId,
        "/plan build core test suite",
      )
    },
    verify: (h) => {
      const activeSession = h.chatSessions.find((s) => s.id === h.activeChatId)!
      expect(activeSession).toBeDefined()
      expect(activeSession.messages.length).toBe(2) // user + agent (clean session start)
      expect(activeSession.messages[0].text).toBe("/plan build core test suite")
      expect(activeSession.messages[1].text).toContain(
        "Implementation Plan generated",
      )
    },
  },

  // 10. Layout Bottom Tabs & Theme
  {
    id: "LAYOUT-01",
    description: "Bottom tab reordering and theme toggling logic",
    execute: (h) => {
      h.bottomTabs = reorderBottomTabsLogic(h.bottomTabs, 0, 2)
    },
    verify: (h) => {
      expect(h.bottomTabs).toEqual(["Problems", "Output", "Terminal"])
      expect(toggleThemeLogic("dark")).toBe("light")
      expect(toggleThemeLogic("light")).toBe("dark")
    },
  },

  // 11. Workspace Close Lifecycle & Buffer Reset
  {
    id: "WS-CLOSE-01",
    description:
      "Workspace close lifecycle clears active tree, buffers, and editor tabs",
    execute: (h) => {
      // Simulate closeRootFolder logic
      h.files = []
      h.buffers = {}
      h.group1 = { ...h.group1, tabs: [], activeTab: "" }
      h.group2 = { ...h.group2, tabs: [], activeTab: "" }
    },
    verify: (h) => {
      expect(h.files.length).toBe(0)
      expect(Object.keys(h.buffers).length).toBe(0)
      expect(h.group1.tabs.length).toBe(0)
      expect(h.group1.activeTab).toBe("")
      expect(h.group2.tabs.length).toBe(0)
    },
  },

  // 12. Workspace Path Normalization & Recent Project Handling
  {
    id: "WS-PATH-01",
    description:
      "Workspace path normalization handles trailing slashes and deduplication",
    execute: () => {
      // Tested in verify
    },
    verify: () => {
      expect(normalizeWorkspacePath("/Users/dev/my-project/")).toBe(
        "/Users/dev/my-project",
      )
      expect(normalizeWorkspacePath("C:\\Users\\dev\\project\\\\")).toBe(
        "C:\\Users\\dev\\project",
      )
      expect(normalizeWorkspacePath("   /Users/test/dir/   ")).toBe(
        "/Users/test/dir",
      )
      expect(normalizeWorkspacePath("")).toBe("")
    },
  },

  // 13. Buffer Revert & Clean State Tracking
  {
    id: "BUF-REVERT-01",
    description:
      "Buffer maintains savedContent, tracks dirty state on edits, and cleanly reverts changes",
    execute: (h) => {
      // 1. Initial buffer is clean
      const initial = "console.log('hello')"
      h.buffers["src/index.ts"] = {
        content: initial,
        savedContent: initial,
        isDirty: false,
        language: "TypeScript",
      }

      // 2. Edit buffer -> dirty
      h.buffers = updateBufferContentLogic(
        h.buffers,
        "src/index.ts",
        "console.log('modified')",
      )
      expect(h.buffers["src/index.ts"]?.isDirty).toBe(true)
      expect(h.buffers["src/index.ts"]?.savedContent).toBe(initial)

      // 3. Edit back to savedContent -> automatically clean
      h.buffers = updateBufferContentLogic(h.buffers, "src/index.ts", initial)
      expect(h.buffers["src/index.ts"]?.isDirty).toBe(false)

      // 4. Modify again and revert via revertBufferContentLogic
      h.buffers = updateBufferContentLogic(
        h.buffers,
        "src/index.ts",
        "console.log('changed again')",
      )
      expect(h.buffers["src/index.ts"]?.isDirty).toBe(true)

      h.buffers = revertBufferContentLogic(h.buffers, "src/index.ts")
    },
    verify: (h) => {
      expect(h.buffers["src/index.ts"]?.content).toBe("console.log('hello')")
      expect(h.buffers["src/index.ts"]?.isDirty).toBe(false)
      expect(h.buffers["src/index.ts"]?.savedContent).toBe(
        "console.log('hello')",
      )
    },
  },

  // 14. Unsaved Buffer Close & Discard Simulation
  {
    id: "BUF-REVERT-02",
    description:
      "Simulate Don't Save discard action reverting buffer and closing tab",
    execute: (h) => {
      const orig = "console.log('hello')"
      h.buffers["src/index.ts"] = {
        content: "console.log('unsaved draft')",
        savedContent: orig,
        isDirty: true,
        language: "TypeScript",
      }

      // Simulate user clicking "Don't Save": revert then close
      h.buffers = revertBufferContentLogic(h.buffers, "src/index.ts")
      h.group1 = closeTabInGroupLogic(h.group1, "src/index.ts")
    },
    verify: (h) => {
      expect(h.group1.tabs).not.toContain("src/index.ts")
      expect(h.buffers["src/index.ts"]?.content).toBe("console.log('hello')")
      expect(h.buffers["src/index.ts"]?.isDirty).toBe(false)
    },
  },

  // 15. Context Extractor Core: Passive extraction & token calculation
  {
    id: "CTX-EXTRACT-01",
    description:
      "Passive editor context extractor captures active buffer and calculates token estimation",
    execute: (h) => {
      const ctx = extractEditorContext({
        path: h.group1.activeTab,
        content: h.buffers[h.group1.activeTab]?.content ?? "",
        selectedText: "console.log('hello')",
        selectionRange: { startLine: 1, endLine: 1 },
      })
      h.lastExtractedContext = ctx
    },
    verify: (h) => {
      expect(h.lastExtractedContext).toBeDefined()
      expect(h.lastExtractedContext?.path).toBe("src/index.ts")
      expect(h.lastExtractedContext?.mode).toBe("selection")
      expect(h.lastExtractedContext?.lineRange).toBe("Ln 1")
      expect(h.lastExtractedContext?.content).toBe("console.log('hello')")
      expect(h.lastExtractedContext?.estimatedTokens).toBe(
        estimateTokens("console.log('hello')"),
      )
      expect(h.lastExtractedContext?.isTruncated).toBe(false)
    },
  },

  // 16. Context Extractor Core: 50k character threshold guardrail
  {
    id: "CTX-GUARD-01",
    description:
      "Context extractor enforces 50,000 character limit guardrail with isTruncated flag",
    execute: (h) => {
      const hugeContent = "X".repeat(60_000)
      const ctx = extractEditorContext({
        path: "src/huge.ts",
        content: hugeContent,
        mode: "full",
      })
      h.lastExtractedContext = ctx
    },
    verify: (h) => {
      expect(h.lastExtractedContext).toBeDefined()
      expect(h.lastExtractedContext?.isTruncated).toBe(true)
      expect(h.lastExtractedContext?.charCount).toBe(MAX_CONTEXT_CHARS)
      expect(h.lastExtractedContext?.content.length).toBe(MAX_CONTEXT_CHARS)
      expect(h.lastExtractedContext?.estimatedTokens).toBe(
        estimateTokens("X".repeat(MAX_CONTEXT_CHARS)),
      )
    },
  },

  // 17. Context Extractor Core: Exclude pattern filtering
  {
    id: "CTX-EXCLUDE-01",
    description:
      "Context extractor filters excluded paths (node_modules, dist, *.log) to prevent prompt bloat",
    execute: (h) => {
      const nodeModulesCtx = extractEditorContext({
        path: "node_modules/lodash/index.js",
        content: "module.exports = {}",
      })
      const gitCtx = extractEditorContext({
        path: ".git/HEAD",
        content: "ref: refs/heads/main",
      })
      const logCtx = extractEditorContext({
        path: "debug.log",
        content: "2026-10-12 info message",
      })
      const validCtx = extractEditorContext({
        path: "src/valid.ts",
        content: "export const x = 1",
      })

      h.lastExtractedContext = validCtx
      expect(nodeModulesCtx).toBeNull()
      expect(gitCtx).toBeNull()
      expect(logCtx).toBeNull()
    },
    verify: (h) => {
      expect(h.lastExtractedContext).not.toBeNull()
      expect(h.lastExtractedContext?.path).toBe("src/valid.ts")
    },
  },

  // 18. Chat Metadata Persistence: Attached Context Items
  {
    id: "CHAT-CTX-PERSIST-01",
    description:
      "Chat messaging preserves attached ContextItem array in message context metadata",
    execute: (h) => {
      const attachedCtx: ContextItem[] = [
        {
          id: "ctx-1",
          type: "selection",
          path: "src/index.ts",
          content: "console.log('hello')",
          charCount: 20,
          estimatedTokens: 5,
          mode: "selection",
          lineRange: "Ln 1",
        },
      ]

      h.chatSessions = sendChatMessageLogic(
        h.chatSessions,
        h.activeChatId,
        "Explain this snippet",
        attachedCtx,
      )
    },
    verify: (h) => {
      const session = h.chatSessions.find((s) => s.id === h.activeChatId)!
      expect(session).toBeDefined()
      const userMsg = session.messages.find(
        (m) => m.role === "user" && m.text === "Explain this snippet",
      )
      expect(userMsg).toBeDefined()
      expect(userMsg?.context).toBeDefined()
      expect(userMsg?.context).toHaveLength(1)
      expect(userMsg?.context?.[0].path).toBe("src/index.ts")
      expect(userMsg?.context?.[0].lineRange).toBe("Ln 1")
    },
  },

  // 19. Tab Switching During AI Streaming / Operations & Dirty Flag Preservation
  {
    id: "EDITOR-STREAM-TAB-01",
    description:
      "Switching active tabs during AI chat operations preserves editor buffer dirty flags and content state",
    execute: (h) => {
      // 1. Mark active tab as dirty
      h.buffers["src/index.ts"] = updateBufferContentLogic(
        h.buffers,
        "src/index.ts",
        "console.log('modified while chatting')",
      )["src/index.ts"]!

      expect(h.buffers["src/index.ts"]?.isDirty).toBe(true)

      // 2. Open a second file tab
      h.group1 = openTabInGroupLogic(h.group1, "README.md")
      expect(h.group1.activeTab).toBe("README.md")

      // 3. Simulate chat exchange occurring while README.md is active
      const ctxItem: ContextItem = {
        id: "ctx-readme",
        type: "file",
        path: "README.md",
        content: "# AegisCode",
        charCount: 11,
        estimatedTokens: 3,
        mode: "full",
      }
      h.chatSessions = sendChatMessageLogic(
        h.chatSessions,
        h.activeChatId,
        "Review README",
        [ctxItem],
      )

      // 4. Switch back to src/index.ts
      h.group1 = openTabInGroupLogic(h.group1, "src/index.ts")
    },
    verify: (h) => {
      expect(h.group1.activeTab).toBe("src/index.ts")
      // Dirty flag must NOT be corrupted or reset
      expect(h.buffers["src/index.ts"]?.isDirty).toBe(true)
      expect(h.buffers["src/index.ts"]?.content).toBe(
        "console.log('modified while chatting')",
      )
    },
  },
]

describe("AegisCode Core Test Suite (Frontend Logic Regression Engine)", () => {
  let harness: CoreWorkbenchHarness

  beforeEach(() => {
    harness = createCoreWorkbenchHarness()
  })

  // Table-driven execution of all scenarios against Core Test
  describe("Scenario Matrix Execution against Core Test", () => {
    for (const scenario of coreRegressionScenarios) {
      it(`[${scenario.id}] ${scenario.description}`, async () => {
        await scenario.execute(harness)
        scenario.verify(harness)
      })
    }
  })

  // Concurrency & Async Race Condition Guard Test
  describe("Async Concurrency & Race Condition Guard", () => {
    it("safely aborts superseded requests and ignores stale responses", async () => {
      const guard = new AsyncSequenceGuard()

      // Request 1 starts
      const req1 = guard.nextRequest()
      expect(req1.requestId).toBe(1)
      expect(guard.isCurrent(1)).toBe(true)

      // Request 2 starts immediately before Request 1 finishes
      const req2 = guard.nextRequest()
      expect(req2.requestId).toBe(2)

      // Signal 1 must be aborted
      expect(req1.signal.aborted).toBe(true)

      // Request 1 completion is now stale
      expect(guard.isCurrent(req1.requestId)).toBe(false)

      // Only Request 2 is current
      expect(guard.isCurrent(req2.requestId)).toBe(true)
    })
  })

  // Settings & Theme Palettes Engine Tests
  describe("Settings Core & Theme Palettes Engine", () => {
    it("provides complete default settings with 500 a11y page size and font variables", () => {
      expect(DEFAULT_APP_SETTINGS.editor.accessibilityPageSize).toBe(500)
      expect(DEFAULT_APP_SETTINGS.editor.fontSize).toBe(13.5)
      expect(DEFAULT_APP_SETTINGS.editor.lineHeight).toBe(22)
      expect(DEFAULT_APP_SETTINGS.editor.wordWrap).toBe("off")
      expect(
        DEFAULT_APP_SETTINGS.features.sourceControl.maxVisibleChanges,
      ).toBe(50)
      expect(DEFAULT_APP_SETTINGS.features.sourceControl.graphPageSize).toBe(25)
      expect(DEFAULT_APP_SETTINGS.features.timeline.maxVisibleItems).toBe(30)
      expect(DEFAULT_APP_SETTINGS.companion.port).toBe(8080)
    })

    it("loads theme definitions correctly for all registered palettes", () => {
      expect(PALETTE_OPTIONS).toHaveLength(3)

      const defDark = getThemeDefinition("default", "dark")
      expect(defDark.id).toBe("default-dark")
      expect(defDark.tokens["--color-canvas"]).toBe("#090d16")

      const atomDark = getThemeDefinition("atom", "dark")
      expect(atomDark.id).toBe("atom-dark")
      expect(atomDark.tokens["--color-canvas"]).toBe("#21252b")

      const tokyoDark = getThemeDefinition("tokyo-night", "dark")
      expect(tokyoDark.id).toBe("tokyo-night-dark")
      expect(tokyoDark.tokens["--color-canvas"]).toBe("#1a1b26")
    })

    it("supports persistence and hydration through loadStoredSettings and saveStoredSettings", () => {
      const storage = new Map<string, string>()
      const mockStorage = {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => storage.set(k, v),
        removeItem: (k: string) => storage.delete(k),
        clear: () => storage.clear(),
      }
      const prevWindow = (globalThis as any).window
      ;(globalThis as any).window = { localStorage: mockStorage }

      try {
        const customSettings = {
          ...DEFAULT_APP_SETTINGS,
          editor: {
            ...DEFAULT_APP_SETTINGS.editor,
            fontSize: 16,
            accessibilityPageSize: 1000,
          },
        }

        saveStoredSettings(customSettings)
        const reloaded = loadStoredSettings()
        expect(reloaded.editor.fontSize).toBe(16)
        expect(reloaded.editor.accessibilityPageSize).toBe(1000)
      } finally {
        ;(globalThis as any).window = prevWindow
      }
    })

    it("scales minimap typography and width relatively to editor font size and line height", () => {
      // Default font size 13.5 and line height 22
      const defaultSmall = computeMinimapScaleConfig("small", 13.5, 22)
      const defaultMed = computeMinimapScaleConfig("medium", 13.5, 22)
      const defaultLarge = computeMinimapScaleConfig("large", 13.5, 22)

      expect(defaultMed.fontSize).toBeGreaterThan(defaultSmall.fontSize)
      expect(defaultLarge.fontSize).toBeGreaterThan(defaultMed.fontSize)
      expect(defaultMed.lineHeight).toBeGreaterThan(defaultSmall.lineHeight)
      expect(defaultLarge.width).toBeGreaterThan(defaultMed.width)

      // Increased editor font size (e.g. 18px and line height 28px)
      const scaledMed = computeMinimapScaleConfig("medium", 18, 28)
      expect(scaledMed.fontSize).toBeGreaterThan(defaultMed.fontSize)
      expect(scaledMed.lineHeight).toBeGreaterThan(defaultMed.lineHeight)
      expect(scaledMed.width).toBeGreaterThan(defaultMed.width)
    })

    it("provides core IDE defaults for files, editor indentation, and workbench layout", () => {
      expect(DEFAULT_APP_SETTINGS.files.autoSave).toBe("afterDelay")
      expect(DEFAULT_APP_SETTINGS.files.autoSaveDelay).toBe(1000)
      expect(DEFAULT_APP_SETTINGS.files.trimTrailingWhitespace).toBe(true)
      expect(DEFAULT_APP_SETTINGS.files.insertFinalNewline).toBe(true)
      expect(DEFAULT_APP_SETTINGS.files.eol).toBe("\n")
      expect(DEFAULT_APP_SETTINGS.files.exclude).toContain("**/node_modules/**")

      expect(DEFAULT_APP_SETTINGS.editor.tabSize).toBe(2)
      expect(DEFAULT_APP_SETTINGS.editor.insertSpaces).toBe(true)
      expect(DEFAULT_APP_SETTINGS.editor.cursorBlinking).toBe("smooth")
      expect(DEFAULT_APP_SETTINGS.editor.renderWhitespace).toBe("selection")
      expect(DEFAULT_APP_SETTINGS.editor.formatOnSave).toBe(true)

      expect(DEFAULT_APP_SETTINGS.workbench.sidebarPosition).toBe("left")
      expect(DEFAULT_APP_SETTINGS.workbench.compactFolders).toBe(true)
    })

    it("sanitizes content on save with trimTrailingWhitespace, insertFinalNewline, and eol normalization", () => {
      const rawContent = "const a = 10;   \nconst b = 20;\t\t\nconst c = 30;"
      const sanitized = sanitizeContentOnSave(rawContent, {
        trimTrailingWhitespace: true,
        insertFinalNewline: true,
        eol: "\n",
      })
      expect(sanitized).toBe("const a = 10;\nconst b = 20;\nconst c = 30;\n")

      const crlfContent = sanitizeContentOnSave("line1  \nline2", {
        trimTrailingWhitespace: true,
        insertFinalNewline: true,
        eol: "\r\n",
      })
      expect(crlfContent).toBe("line1\r\nline2\r\n")
    })
  })

  // Context Extractor & Token Lifecycle Engine Tests (Sub-Phase 6.7)
  describe("Context Extractor & Token Lifecycle Engine", () => {
    it("estimates tokens based on ~4 chars per token ceiling calculation", () => {
      expect(estimateTokens("")).toBe(0)
      expect(estimateTokens("a")).toBe(1)
      expect(estimateTokens("abcd")).toBe(1)
      expect(estimateTokens("abcde")).toBe(2)
      expect(estimateTokens("a".repeat(100))).toBe(25)
    })

    it("correctly evaluates default exclusion patterns", () => {
      expect(isPathExcluded("node_modules/pkg/index.js")).toBe(true)
      expect(isPathExcluded(".git/config")).toBe(true)
      expect(isPathExcluded("dist/bundle.js")).toBe(true)
      expect(isPathExcluded("app.log")).toBe(true)
      expect(isPathExcluded("package-lock.json")).toBe(false)
      expect(isPathExcluded("src/components/App.tsx")).toBe(false)
      expect(isPathExcluded("src/utils/distribution.ts")).toBe(false)
    })

    it("builds mention context items with default reference mode and full mode", () => {
      // Default: compact reference outline
      const refMention = buildMentionContextItem(
        "src/utils.ts",
        "export const PI = 3.14\nexport function calc() { return 42 }\n",
      )
      expect(refMention).not.toBeNull()
      expect(refMention?.id).toBe("ctx-src/utils.ts-mention")
      expect(refMention?.mode).toBe("reference")
      expect(refMention?.content).toContain("[File Reference: src/utils.ts")
      expect(refMention?.content).toContain("- export const PI")
      expect(refMention?.content).toContain("- export function calc")

      // Explicit full mode
      const fullMention = buildMentionContextItem(
        "src/utils.ts",
        "export const PI = 3.14",
        "full",
      )
      expect(fullMention).not.toBeNull()
      expect(fullMention?.mode).toBe("full")
      expect(fullMention?.content).toBe("export const PI = 3.14")
      expect(fullMention?.estimatedTokens).toBe(
        estimateTokens("export const PI = 3.14"),
      )

      // Explicit snippet mode
      const snippetMention = buildMentionContextItem(
        "src/utils.ts",
        "line 1\nline 2\nline 3",
        "snippet",
      )
      expect(snippetMention).not.toBeNull()
      expect(snippetMention?.mode).toBe("snippet")
      expect(snippetMention?.content).toContain("line 1")
    })

    it("extracts file outline for multiple languages and file types", () => {
      // Go file outline
      const goCode =
        "package main\n\nfunc HandleRequest(w http.ResponseWriter, r *http.Request) {}\ntype Server struct {}\n"
      const goOutline = extractFileOutline("server/main.go", goCode)
      expect(goOutline).toContain("[File Reference: server/main.go")
      expect(goOutline).toContain("HandleRequest")
      expect(goOutline).toContain("Server")

      // JSON file outline
      const jsonCode = JSON.stringify({
        name: "aegis",
        version: "1.0.0",
        scripts: { build: "vite build" },
      })
      const jsonOutline = extractFileOutline("package.json", jsonCode)
      expect(jsonOutline).toContain("Top keys: name, version, scripts")

      // Markdown file outline
      const mdCode = "# Overview\nSome intro\n## Architecture\nDetails here\n"
      const mdOutline = extractFileOutline("README.md", mdCode)
      expect(mdOutline).toContain("- # Overview")
      expect(mdOutline).toContain("- ## Architecture")
    })

    it("extracts snippet capping at 50 lines", () => {
      const sixtyLines = Array.from(
        { length: 60 },
        (_, i) => `Line ${i + 1}`,
      ).join("\n")
      const snippet = extractSnippet(sixtyLines, 50)
      expect(snippet).toContain("Line 50")
      expect(snippet).toContain("truncated remaining 10 lines")
      expect(snippet).not.toContain("Line 51\n")
    })

    it("enforces context token budget by demoting large items to reference mode", () => {
      const largeContent = Array.from(
        { length: 500 },
        (_, i) => `export const val_${i} = ${i}`,
      ).join("\n")
      const item1 = buildMentionContextItem(
        "src/large1.ts",
        largeContent,
        "full",
      )!
      const item2 = buildMentionContextItem(
        "src/large2.ts",
        largeContent,
        "full",
      )!

      expect(item1.mode).toBe("full")
      expect(item2.mode).toBe("full")
      expect(item1.estimatedTokens + item2.estimatedTokens).toBeGreaterThan(
        2500,
      )

      const constrained = enforceContextTokenBudget([item1, item2], 2500)
      const totalConstrainedTokens = constrained.reduce(
        (sum, item) => sum + item.estimatedTokens,
        0,
      )
      expect(totalConstrainedTokens).toBeLessThanOrEqual(2500)
      expect(constrained.some((c) => c.mode === "reference")).toBe(true)
    })
  })

  // Sub-Phase 6.8: Go API Bridge & Token Lifecycle (Auth Context & Provider Settings)
  describe("Sub-Phase 6.8: AI Providers & Custom Models Registry", () => {
    it("registers all 4 standard AI providers with updated model catalogs", () => {
      expect(CHAT_PROVIDERS).toHaveLength(4)
      const ids = CHAT_PROVIDERS.map((p) => p.id)
      expect(ids).toEqual(["antigravity", "claude", "opencode", "openrouter"])

      // Verify Antigravity model updates (gemini-3.8-flash & gemini-3.8-medium)
      const agyModels = CHAT_MODELS.antigravity
      expect(agyModels.some((m) => m.id === "gemini-3.8-flash")).toBe(true)
      expect(agyModels.some((m) => m.id === "gemini-3.8-medium")).toBe(true)
      expect(agyModels.some((m) => m.id === "gemini-2.5-flash")).toBe(false)

      // Verify Claude models
      const claudeModels = CHAT_MODELS.claude
      expect(claudeModels.some((m) => m.id === "claude-3.7-sonnet")).toBe(true)
      expect(claudeModels.some((m) => m.id === "claude-3.5-haiku")).toBe(true)
    })

    it("merges dynamic custom models cleanly across providers via getMergedProviderModels", () => {
      const customModelsMap = {
        claude: ["claude-3-opus-20240229", "claude-custom-finetune"],
        openrouter: ["meta-llama/llama-3.3-70b", "deepseek/deepseek-r1"],
      }

      // Test claude merged models
      const claudeMerged = getMergedProviderModels("claude", customModelsMap)
      expect(claudeMerged.length).toBe(CHAT_MODELS.claude.length + 2)
      const customItem = claudeMerged.find(
        (m) => m.id === "claude-custom-finetune",
      )
      expect(customItem).toBeDefined()
      expect(customItem?.isCustom).toBe(true)
      expect(customItem?.description).toBe("Custom user-configured model")

      // Test deduplication if custom model ID already exists in built-in
      const dupMap = {
        antigravity: ["gemini-3.8-flash", "my-gemini-custom"],
      }
      const agyMerged = getMergedProviderModels("antigravity", dupMap)
      expect(agyMerged.length).toBe(CHAT_MODELS.antigravity.length + 1)
      expect(agyMerged.filter((m) => m.id === "gemini-3.8-flash").length).toBe(
        1,
      )
    })

    it("creates sessions with proper default model and handles custom model assignment", () => {
      const initialSessions: ChatSession[] = []

      // Default session creation
      const res1 = createSessionLogic(initialSessions)
      expect(res1.newSession.provider).toBe(DEFAULT_PROVIDER)
      expect(res1.newSession.model).toBe(DEFAULT_MODEL)
      expect(res1.newSession.model).toBe("gemini-3.8-flash")

      // Explicit provider + custom model
      const res2 = createSessionLogic(
        res1.sessions,
        "openrouter",
        "deepseek/deepseek-r1",
      )
      expect(res2.newSession.provider).toBe("openrouter")
      expect(res2.newSession.model).toBe("deepseek/deepseek-r1")
      expect(res2.sessions.length).toBe(2)

      // Switch active session model via setSessionModelLogic
      const updated = setSessionModelLogic(
        res2.sessions,
        res2.newSession.id,
        "claude",
        "claude-3.7-sonnet",
      )
      const switched = updated.find((s) => s.id === res2.newSession.id)
      expect(switched?.provider).toBe("claude")
      expect(switched?.model).toBe("claude-3.7-sonnet")
    })

    it("verifies settings registry defaults for AI providers and custom model state", () => {
      expect(DEFAULT_APP_SETTINGS.agent.defaultProvider).toBe("antigravity")
      expect(DEFAULT_APP_SETTINGS.agent.model).toBe("gemini-3.8-flash")
      expect(DEFAULT_APP_SETTINGS.agent.customModels).toEqual({
        antigravity: [],
        claude: [],
        opencode: [],
        openrouter: [],
      })
      expect(DEFAULT_APP_SETTINGS.agent.providerKeys).toEqual({})
      expect(DEFAULT_APP_SETTINGS.agent.providerBaseUrls).toHaveProperty(
        "opencode",
      )
      expect(DEFAULT_APP_SETTINGS.agent.bypassCommands).toEqual({
        antigravity: "antigravity",
        claude: "claude",
      })
    })

    it("generates contextual replies for Claude and custom models correctly", () => {
      const reply = generateContextualReply(
        "/spec microservice authentication bridge",
        "claude",
        "claude-3.7-sonnet",
      )
      expect(reply).toContain("[claude · claude-3.7-sonnet]")
      expect(reply).toContain("Specification Draft generated")
    })

    it("verifies default layout dimensions and state transitions", () => {
      expect(DEFAULT_SIDEBAR_WIDTH).toBe(260)
    })
  })
})
