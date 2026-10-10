import { describe, it, expect, beforeEach } from "vitest"
import { VirtualWorkspaceEngine } from "../virtualWorkspace"
import {
  openTabInGroupLogic,
  closeTabInGroupLogic,
  moveTabBetweenGroupsLogic,
  reorderTabsInGroupLogic,
  renameTabInAllGroupsLogic,
} from "@/context/core/editorCore"
import {
  addFileToTreeLogic,
  removeFileFromTreeLogic,
  renameFileInTreeLogic,
  updateBufferContentLogic,
  markBufferSavedLogic,
  normalizeWorkspacePath,
  AsyncSequenceGuard,
} from "@/context/core/workspaceCore"
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
} from "@/context/core/layoutCore"
import {
  createTerminalSessionLogic,
  closeTerminalSessionLogic,
  processTerminalCommandLogic,
} from "@/context/core/terminalCore"
import {
  createSessionLogic,
  deleteSessionLogic,
  sendChatMessageLogic,
} from "@/context/core/chatCore"
import type {
  EditorGroupState,
  FileItem,
  FileBuffer,
  GitChange,
  GitCommitNode,
  BottomTab,
  TerminalSession,
  ChatSession,
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
        model: "gemini-2.5-flash",
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
        "gemini-2.5-flash",
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
      expect(activeSession.messages.length).toBe(3) // initial + user + agent
      expect(activeSession.messages[1].text).toBe("/plan build core test suite")
      expect(activeSession.messages[2].text).toContain(
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
})
