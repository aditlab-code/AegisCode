import { describe, it, expect, vi, beforeEach } from "vitest"
import { useWorkbenchStore } from "../../../src/store"
import * as agentApi from "../../../src/utils/agentApi"

describe("Aegis Copilot Workspace Initialization & Interceptor", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useWorkbenchStore.setState({
      isCopilotInitialized: null,
      copilotStatus: null,
      isCopilotInitModalOpen: false,
    })
  })

  it("checks copilot status and updates store state", async () => {
    const mockStatus: agentApi.WorkspaceCopilotStatus = {
      isInitialized: false,
      hasAegisDir: false,
      hasTasksDir: false,
      hasAgentsMd: false,
      rulesPath: "",
      activePersona: "kanna",
      taskCount: 0,
      presets: [
        {
          id: "kanna",
          name: "Kanna (Creative & Friendly)",
          description: "Friendly anime pair programmer",
          templateContent: "# AGENTS.md",
        },
      ],
    }

    vi.spyOn(agentApi, "fetchWorkspaceCopilotStatus").mockResolvedValue(
      mockStatus,
    )

    const res = await useWorkbenchStore.getState().checkCopilotStatus()
    expect(res).toEqual(mockStatus)
    expect(useWorkbenchStore.getState().isCopilotInitialized).toBe(false)
    expect(useWorkbenchStore.getState().copilotStatus).toEqual(mockStatus)
  })

  it("toggles copilot init modal state open and closed", () => {
    expect(useWorkbenchStore.getState().isCopilotInitModalOpen).toBe(false)
    useWorkbenchStore.getState().openCopilotInitModal()
    expect(useWorkbenchStore.getState().isCopilotInitModalOpen).toBe(true)
    useWorkbenchStore.getState().closeCopilotInitModal()
    expect(useWorkbenchStore.getState().isCopilotInitModalOpen).toBe(false)
  })

  it("initializes copilot workspace successfully", async () => {
    const mockInitResponse: agentApi.InitWorkspaceResponse = {
      success: true,
      aegisPath: "/test/.aegis",
      agentsPath: "/test/.aegis/AGENTS.md",
      gitignored: true,
      taskSlug: "001-welcome",
    }
    const mockStatus: agentApi.WorkspaceCopilotStatus = {
      isInitialized: true,
      hasAegisDir: true,
      hasTasksDir: true,
      hasAgentsMd: true,
      rulesPath: "/test/.aegis/AGENTS.md",
      activePersona: "kanna",
      taskCount: 1,
      presets: [],
    }

    vi.spyOn(agentApi, "initWorkspaceCopilot").mockResolvedValue(
      mockInitResponse,
    )
    vi.spyOn(agentApi, "fetchWorkspaceCopilotStatus").mockResolvedValue(
      mockStatus,
    )

    useWorkbenchStore.setState({ isCopilotInitModalOpen: true })

    const result = await useWorkbenchStore
      .getState()
      .initializeCopilotWorkspace({
        preset: "kanna",
        addToGitignore: true,
        createSample: true,
      })

    expect(result.success).toBe(true)
    expect(useWorkbenchStore.getState().isCopilotInitialized).toBe(true)
    expect(useWorkbenchStore.getState().isCopilotInitModalOpen).toBe(false)
  })
})
