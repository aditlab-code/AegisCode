import { describe, it, expect, vi } from "vitest"
import { DEFAULT_APP_SETTINGS } from "@/context/core/settingsCore"
import { matchesExcludePattern } from "@/components/layout/sidebar/ExplorerPanel"
import { buildSettingsSchema } from "@/components/layout/settings/settingsRegistry"
import { tokenizeLine, buildTodoRegex } from "@/utils/syntax"
import { sortFileTree, flattenBackendTree } from "@/utils/workspaceApi"
import { addFileToTreeLogic } from "@/store/slices/createWorkspaceSlice"

describe("Settings, Explorer Exclude, and Syntax Highlighting", () => {
  describe("AppSettings and Defaults", () => {
    it("includes agent configuration in DEFAULT_APP_SETTINGS", () => {
      expect(DEFAULT_APP_SETTINGS.agent).toBeDefined()
      expect(DEFAULT_APP_SETTINGS.agent.defaultProvider).toBe("antigravity")
      expect(DEFAULT_APP_SETTINGS.agent.model).toBe("gemini-3.8-flash")
      expect(DEFAULT_APP_SETTINGS.agent.temperature).toBe(0.7)
      expect(DEFAULT_APP_SETTINGS.agent.streaming).toBe(true)
      expect(DEFAULT_APP_SETTINGS.agent.contextIngestion).toBe(true)
    })

    it("includes terminal font configuration in features settings", () => {
      expect(DEFAULT_APP_SETTINGS.features.terminal.fontFamily).toBe(
        "SFMono-Regular, Menlo, monospace",
      )
      expect(DEFAULT_APP_SETTINGS.features.terminal.lineHeight).toBe(1.4)
    })
  })

  describe("matchesExcludePattern (Explorer file filter)", () => {
    it("matches wildcard extensions like *.log and *.tmp", () => {
      expect(matchesExcludePattern("server.log", "server.log", "*.log")).toBe(
        true,
      )
      expect(
        matchesExcludePattern("logs/error.log", "error.log", "*.log"),
      ).toBe(true)
      expect(
        matchesExcludePattern("/path/to/cache.tmp", "cache.tmp", "**/*.tmp"),
      ).toBe(true)
      expect(matchesExcludePattern("main.ts", "main.ts", "*.log")).toBe(false)
    })

    it("matches folder patterns like **/node_modules/** and dist/**", () => {
      expect(
        matchesExcludePattern(
          "node_modules/react/index.js",
          "index.js",
          "**/node_modules/**",
        ),
      ).toBe(true)
      expect(
        matchesExcludePattern("dist/bundle.js", "bundle.js", "**/dist/**"),
      ).toBe(true)
      expect(
        matchesExcludePattern(".DS_Store", ".DS_Store", "**/.DS_Store"),
      ).toBe(true)
    })

    it("returns false for non-matching files", () => {
      expect(
        matchesExcludePattern("src/index.ts", "index.ts", "**/dist/**"),
      ).toBe(false)
      expect(matchesExcludePattern("", "", "")).toBe(false)
    })
  })

  describe("Explorer Tree Sorting and Default Collapse Behavior", () => {
    it("sorts root folders first, followed by root files alphabetically", () => {
      const unsorted = [
        {
          id: "1",
          name: "vite.config.ts",
          label: "vite.config.ts",
          type: "file" as const,
          icon: "file",
          depth: 0,
          path: "vite.config.ts",
        },
        {
          id: "2",
          name: "src",
          label: "src",
          type: "folder" as const,
          icon: "folder",
          depth: 0,
          path: "src",
        },
        {
          id: "3",
          name: "package.json",
          label: "package.json",
          type: "file" as const,
          icon: "file",
          depth: 0,
          path: "package.json",
        },
        {
          id: "4",
          name: "docs",
          label: "docs",
          type: "folder" as const,
          icon: "folder",
          depth: 0,
          path: "docs",
        },
        {
          id: "5",
          name: "App.tsx",
          label: "App.tsx",
          type: "file" as const,
          icon: "file",
          depth: 1,
          path: "src/App.tsx",
        },
        {
          id: "6",
          name: "components",
          label: "components",
          type: "folder" as const,
          icon: "folder",
          depth: 1,
          path: "src/components",
        },
      ]

      const sorted = sortFileTree(unsorted)
      const names = sorted.map((f) => f.name)

      expect(names).toEqual([
        "docs",
        "src",
        "components",
        "App.tsx",
        "package.json",
        "vite.config.ts",
      ])
    })

    it("ensures flattenBackendTree initializes all nodes with open: false", () => {
      const mockRawTree = [
        {
          name: "src",
          path: "src",
          type: "folder" as const,
          children: [
            { name: "index.ts", path: "src/index.ts", type: "file" as const },
          ],
        },
        {
          name: "README.md",
          path: "README.md",
          type: "file" as const,
        },
      ]

      const flat = flattenBackendTree(mockRawTree)
      expect(flat.every((node) => node.open === false)).toBe(true)
    })

    it("inserts new files in sorted order with addFileToTreeLogic", () => {
      const initial = [
        {
          id: "1",
          name: "src",
          label: "src",
          type: "folder" as const,
          icon: "folder",
          depth: 0,
          path: "src",
          open: false,
        },
        {
          id: "2",
          name: "package.json",
          label: "package.json",
          type: "file" as const,
          icon: "file",
          depth: 0,
          path: "package.json",
          open: false,
        },
      ]

      const withNewFolder = addFileToTreeLogic(initial, "build", true)
      expect(withNewFolder.map((f) => f.name)).toEqual([
        "build",
        "src",
        "package.json",
      ])

      const withNewFile = addFileToTreeLogic(
        withNewFolder,
        "a-config.json",
        false,
      )
      expect(withNewFile.map((f) => f.name)).toEqual([
        "build",
        "src",
        "a-config.json",
        "package.json",
      ])
    })
  })

  describe("tokenizeLine & buildTodoRegex", () => {
    it("builds custom todo regex from keyword list", () => {
      const regex = buildTodoRegex(["CUSTOM", "ALERT"])
      expect(regex.test("// CUSTOM: fix this")).toBe(true)
      regex.lastIndex = 0
      expect(regex.test("// ALERT: attention")).toBe(true)
      regex.lastIndex = 0
      expect(regex.test("// TODO: ignored")).toBe(false)
    })

    it("tokenizes lines with custom todoOptions", () => {
      const tokens = tokenizeLine("// ALERT: check here", {
        enabled: true,
        keywords: ["ALERT"],
      })
      expect(tokens.length).toBeGreaterThan(0)
    })

    it("skips todo highlight when enabled is false", () => {
      const tokens = tokenizeLine("// TODO: standard todo", {
        enabled: false,
      })
      const stringified = JSON.stringify(tokens)
      expect(stringified).not.toContain("syntax-todo-tag")
      expect(stringified).toContain("standard todo")
    })

    it("highlights trailing comments with TODO tags", () => {
      const tokens = tokenizeLine("const x = 1 // TODO: fix", {
        enabled: true,
      })
      const stringified = JSON.stringify(tokens)
      expect(stringified).toContain("syntax-todo-tag")
      expect(stringified).toContain("syntax-todo-TODO")
    })

    it("handles escaped quotes inside strings without breaking syntax tokens", () => {
      const tokens = tokenizeLine('const str = "hello \\"world\\""')
      const stringToken = tokens.find(
        (t) =>
          typeof t === "object" &&
          t !== null &&
          ("props" in t) as Record<string, unknown> &&
          ((t as Record<string, unknown>).props as Record<string, unknown>)
            ?.className === "syntax-green",
      ) as { props: { children: string } } | undefined
      expect(stringToken).toBeDefined()
      expect(stringToken?.props.children).toBe('"hello \\"world\\""')
    })
  })

  describe("buildSettingsSchema (Settings Registry)", () => {
    it("generates setting items without duplicate IDs", () => {
      const dummyCallbacks = {
        settings: DEFAULT_APP_SETTINGS,
        updateEditorSettings: vi.fn(),
        updateWorkbenchSettings: vi.fn(),
        updateFilesSettings: vi.fn(),
        updateFeaturesSettings: vi.fn(),
        updateCompanionSettings: vi.fn(),
        updateAgentSettings: vi.fn(),
        setThemePalette: vi.fn(),
        setThemeMode: vi.fn(),
        showToast: vi.fn(),
      }

      const schema = buildSettingsSchema(dummyCallbacks)
      const ids = schema.map((item) => item.id)
      const uniqueIds = new Set(ids)

      expect(uniqueIds.size).toBe(ids.length)
      expect(ids).toContain("agent.model")
      expect(ids).toContain("features.terminal.fontFamily")
      expect(ids).toContain("features.terminal.lineHeight")
      expect(ids).toContain("editor.tabSize")
    })

    it("ensures tabSize only appears in Editor category", () => {
      const dummyCallbacks = {
        settings: DEFAULT_APP_SETTINGS,
        updateEditorSettings: vi.fn(),
        updateWorkbenchSettings: vi.fn(),
        updateFilesSettings: vi.fn(),
        updateFeaturesSettings: vi.fn(),
        updateCompanionSettings: vi.fn(),
        updateAgentSettings: vi.fn(),
        setThemePalette: vi.fn(),
        setThemeMode: vi.fn(),
        showToast: vi.fn(),
      }

      const schema = buildSettingsSchema(dummyCallbacks)
      const tabSizeItems = schema.filter((item) => item.id.includes("tabSize"))
      expect(tabSizeItems.length).toBe(1)
      expect(tabSizeItems[0].category).toBe("Editor")
    })

    it("verifies LSP settings appear under LSP category", () => {
      const dummyCallbacks = {
        settings: DEFAULT_APP_SETTINGS,
        updateEditorSettings: vi.fn(),
        updateWorkbenchSettings: vi.fn(),
        updateFilesSettings: vi.fn(),
        updateFeaturesSettings: vi.fn(),
        updateCompanionSettings: vi.fn(),
        updateAgentSettings: vi.fn(),
        setThemePalette: vi.fn(),
        setThemeMode: vi.fn(),
        showToast: vi.fn(),
      }

      const schema = buildSettingsSchema(dummyCallbacks)
      const lspItems = schema.filter((item) => item.category === "LSP")
      expect(lspItems.length).toBeGreaterThan(0)
      const lspIds = lspItems.map((item) => item.id)
      expect(lspIds).toContain("features.lsp.formatOnSave")
      expect(lspIds).toContain("features.lsp.servers.typescript")
      expect(lspIds).toContain("features.lsp.servers.python")
      expect(lspIds).toContain("features.lsp.servers.go")
      expect(lspIds).toContain("features.lsp.servers.rust")
      expect(lspIds).toContain("features.lsp.servers.cpp")
    })
  })
})
