import { describe, it, expect, vi } from "vitest"
import { DEFAULT_APP_SETTINGS } from "@/context/core/settingsCore"
import { matchesExcludePattern } from "@/components/layout/sidebar/ExplorerPanel"
import { buildSettingsSchema } from "@/components/layout/settings/settingsRegistry"
import { tokenizeLine, buildTodoRegex } from "@/utils/syntax"

describe("Settings, Explorer Exclude, and Syntax Highlighting", () => {
  describe("AppSettings and Defaults", () => {
    it("includes agent configuration in DEFAULT_APP_SETTINGS", () => {
      expect(DEFAULT_APP_SETTINGS.agent).toBeDefined()
      expect(DEFAULT_APP_SETTINGS.agent.model).toBe("claude-3-7-sonnet")
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
  })
})
