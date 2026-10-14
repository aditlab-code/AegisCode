import { describe, it, expect } from "vitest"
import {
  parseToolCall,
  UnifiedActivityTimeline,
} from "@/components/layout/chat/ToolCallActivity"
import { extractCodeGraphTraceTargets } from "@/utils/codegraphApi"
import type { ToolCallItem } from "@/types/workbench"

describe("ToolCallActivity parseToolCall", () => {
  it("parses run_command into Run action with terminal icon and command target", () => {
    const item: ToolCallItem = {
      id: "tc-1",
      name: "run_command",
      status: "success",
      args: {
        CommandLine: "rtk npm run build",
        toolSummary: "Build workspace project",
      },
      output: "Build passed with 0 errors",
    }

    const parsed = parseToolCall(item)
    expect(parsed.actionLabel).toBe("Run")
    expect(parsed.actionIcon).toBe("terminal")
    expect(parsed.target).toBe("$ rtk npm run build")
    expect(parsed.secondary).toBe("Build workspace project")
    expect(parsed.command).toBe("rtk npm run build")
    expect(parsed.output).toBe("Build passed with 0 errors")
  })

  it("parses view_file into Read action with file icon and base name target with line range", () => {
    const item: ToolCallItem = {
      id: "tc-2",
      name: "view_file",
      status: "success",
      args: {
        AbsolutePath: "/root/src/utils/workspaceApi.ts",
        StartLine: 10,
        EndLine: 50,
      },
    }

    const parsed = parseToolCall(item)
    expect(parsed.actionLabel).toBe("Read")
    expect(parsed.actionIcon).toBe("file")
    expect(parsed.target).toBe("workspaceApi.ts · L10-50")
    expect(parsed.fullTarget).toBe("/root/src/utils/workspaceApi.ts")
  })

  it("parses write_to_file and replace_file_content into Edit action with edit icon", () => {
    const writeItem: ToolCallItem = {
      id: "tc-3",
      name: "write_to_file",
      status: "success",
      args: {
        TargetFile: "src/components/layout/chat/ChatMessageList.tsx",
        Description: "Optimize chat scrolling and memoize message cards",
      },
    }

    const parsed = parseToolCall(writeItem)
    expect(parsed.actionLabel).toBe("Edit")
    expect(parsed.actionIcon).toBe("edit")
    expect(parsed.target).toBe("ChatMessageList.tsx")
    expect(parsed.secondary).toBe(
      "Optimize chat scrolling and memoize message cards",
    )
  })

  it("parses delete_file into Delete action", () => {
    const deleteItem: ToolCallItem = {
      id: "tc-4",
      name: "delete_file",
      status: "success",
      args: {
        path: "src/unused.ts",
      },
    }

    const parsed = parseToolCall(deleteItem)
    expect(parsed.actionLabel).toBe("Delete")
    expect(parsed.actionIcon).toBe("edit")
    expect(parsed.target).toBe("unused.ts")
  })

  it("parses search_web and search_code into Search action with search icon", () => {
    const searchItem: ToolCallItem = {
      id: "tc-5",
      name: "search_web",
      status: "success",
      args: {
        query: "Tailwind v4 tokens",
      },
    }

    const parsed = parseToolCall(searchItem)
    expect(parsed.actionLabel).toBe("Search")
    expect(parsed.actionIcon).toBe("search")
    expect(parsed.target).toBe('"Tailwind v4 tokens"')
  })

  it("strips escaped surrounding quotes from AbsolutePath in view_file", () => {
    const item: ToolCallItem = {
      id: "tc-6",
      name: "view_file",
      status: "success",
      args: {
        AbsolutePath: '"/workspace/project/src/components/App.tsx"',
      },
    }

    const parsed = parseToolCall(item)
    expect(parsed.actionLabel).toBe("Read")
    expect(parsed.target).toBe("App.tsx")
    expect(parsed.fullTarget).toBe("/workspace/project/src/components/App.tsx")
  })

  it("sanitizes massive CodeContent and calculates linesCount for write_to_file", () => {
    const longCode = Array.from({ length: 50 }, (_, i) => `line ${i}`).join(
      "\n",
    )
    const item: ToolCallItem = {
      id: "tc-7",
      name: "write_to_file",
      status: "success",
      args: {
        TargetFile: "src/largeFile.ts",
        CodeContent: longCode,
      },
    }

    const parsed = parseToolCall(item)
    expect(parsed.actionLabel).toBe("Edit")
    expect(parsed.target).toBe("largeFile.ts")
    expect(parsed.linesCount).toBe(50)
    expect(parsed.secondary).toBe("50 lines written")
    expect(parsed.rawArgs?.CodeContent).toContain("50 lines")
    expect(parsed.rawArgs?.CodeContent).toContain("omitted")
  })

  it("sanitizes large ReplacementContent for replace_file_content", () => {
    const longReplacement = Array.from(
      { length: 30 },
      (_, i) => `replacement line ${i}`,
    ).join("\n")
    const item: ToolCallItem = {
      id: "tc-8",
      name: "replace_file_content",
      status: "success",
      args: {
        TargetFile: "src/component.tsx",
        Instruction: "Update styling",
        ReplacementContent: longReplacement,
      },
    }

    const parsed = parseToolCall(item)
    expect(parsed.actionLabel).toBe("Edit")
    expect(parsed.secondary).toBe("Update styling")
    expect(parsed.linesCount).toBe(30)
    expect(parsed.rawArgs?.ReplacementContent).toContain("30 lines")
  })

  it("extracts targetFile correctly for navigation in file reading and editing tools", () => {
    const viewItem: ToolCallItem = {
      id: "tc-9",
      name: "view_file",
      status: "success",
      args: { AbsolutePath: "src/context/core/workbenchFacade.ts" },
    }
    const viewParsed = parseToolCall(viewItem)
    expect(viewParsed.targetFile).toBe("src/context/core/workbenchFacade.ts")
    expect(viewParsed.fullTarget).toBe("src/context/core/workbenchFacade.ts")

    const editItem: ToolCallItem = {
      id: "tc-10",
      name: "write_to_file",
      status: "success",
      args: { TargetFile: "src/utils/workspaceApi.ts" },
    }
    const editParsed = parseToolCall(editItem)
    expect(editParsed.targetFile).toBe("src/utils/workspaceApi.ts")

    const cmdItem: ToolCallItem = {
      id: "tc-11",
      name: "run_command",
      status: "success",
      args: { CommandLine: "npm test" },
    }
    const cmdParsed = parseToolCall(cmdItem)
    expect(cmdParsed.targetFile).toBeUndefined()
  })

  it("prevents ghost tabs when view_file or write_to_file has empty or missing path", () => {
    const emptyViewItem: ToolCallItem = {
      id: "tc-12",
      name: "view_file",
      status: "success",
      summary: "view_file",
      args: {},
    }
    const parsedView = parseToolCall(emptyViewItem)
    expect(parsedView.targetFile).toBeUndefined()
    expect(parsedView.fullTarget).toBe("")
    expect(parsedView.target).toBe("view_file")

    const emptyWriteItem: ToolCallItem = {
      id: "tc-13",
      name: "write_to_file",
      status: "success",
      summary: "write_to_file",
      args: {},
    }
    const parsedWrite = parseToolCall(emptyWriteItem)
    expect(parsedWrite.targetFile).toBeUndefined()
    expect(parsedWrite.fullTarget).toBe("")
  })

  it("prioritizes direct targetFile field on ToolCallItem for read and write tools", () => {
    const viewWithTarget: ToolCallItem = {
      id: "tc-14",
      name: "view_file",
      status: "success",
      targetFile: "/root/src/index.ts",
      args: {},
    }
    const parsedView = parseToolCall(viewWithTarget)
    expect(parsedView.targetFile).toBe("/root/src/index.ts")
    expect(parsedView.fullTarget).toBe("/root/src/index.ts")
    expect(parsedView.target).toBe("index.ts")

    const editWithTarget: ToolCallItem = {
      id: "tc-15",
      name: "write_to_file",
      status: "success",
      targetFile: "server/cmd/server/main.go",
      args: {},
    }
    const parsedEdit = parseToolCall(editWithTarget)
    expect(parsedEdit.targetFile).toBe("server/cmd/server/main.go")
    expect(parsedEdit.fullTarget).toBe("server/cmd/server/main.go")
    expect(parsedEdit.target).toBe("main.go")
  })

  it("parses @colbymchenry/codegraph codegraph_explore into Explore action with zap icon", () => {
    const item: ToolCallItem = {
      id: "tc-cg-1",
      name: "mcp__codegraph__codegraph_explore",
      status: "running",
      args: {
        query: "StreamChat AntigravityEngine",
        maxFiles: 8,
      },
    }

    const parsed = parseToolCall(item)
    expect(parsed.actionLabel).toBe("Explore")
    expect(parsed.actionIcon).toBe("zap")
    expect(parsed.target).toBe("StreamChat AntigravityEngine")
  })

  it("extracts trace targets accurately from multi-symbol queries and filters stop words", () => {
    const res = extractCodeGraphTraceTargets(
      "mcp__codegraph__codegraph_explore",
      { query: "how does StreamChat call AntigravityEngine in session flow?" },
    )
    expect(res.isCodeGraph).toBe(true)
    expect(res.cleanToolName).toBe("codegraph_explore")
    expect(res.symbols).toContain("StreamChat")
    expect(res.symbols).toContain("AntigravityEngine")
    expect(res.symbols).not.toContain("how")
    expect(res.symbols).not.toContain("does")
  })
})

describe("UnifiedActivityTimeline", () => {
  it("exports UnifiedActivityTimeline as a valid React component", () => {
    expect(typeof UnifiedActivityTimeline).toBe("object") // memo wrapped component
  })
})
