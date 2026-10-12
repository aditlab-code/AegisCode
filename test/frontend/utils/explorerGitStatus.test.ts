import { describe, it, expect } from "vitest"
import {
  normalizePath,
  mapGitChangeToBadge,
  buildExplorerGitDecorations,
} from "@/utils/explorerGitStatus"
import type { GitChange } from "@/types/workbench"

describe("explorerGitStatus Utility", () => {
  describe("normalizePath", () => {
    it("strips leading and trailing slashes and normalizes backslashes", () => {
      expect(normalizePath("/src/components/")).toBe("src/components")
      expect(normalizePath("///server\\internal\\api/")).toBe(
        "server/internal/api",
      )
      expect(normalizePath("   /file.ts   ")).toBe("file.ts")
    })
  })

  describe("mapGitChangeToBadge", () => {
    it("maps Modified (M) correctly", () => {
      const badge = mapGitChangeToBadge({
        code: "M",
        file: "src/app.ts",
      })
      expect(badge.code).toBe("M")
      expect(badge.colorClass).toBe("text-warning")
      expect(badge.title).toBe("Modified")
    })

    it("maps Untracked (?) and (U) to U with text-success", () => {
      const badgeQuestion = mapGitChangeToBadge({
        code: "?",
        file: "newfile.ts",
      })
      expect(badgeQuestion.code).toBe("U")
      expect(badgeQuestion.colorClass).toBe("text-success")
      expect(badgeQuestion.title).toBe("Untracked")

      const badgeU = mapGitChangeToBadge({
        code: "U",
        file: "another.ts",
      })
      expect(badgeU.code).toBe("U")
      expect(badgeU.colorClass).toBe("text-success")
    })

    it("maps Added (A) to text-success", () => {
      const badge = mapGitChangeToBadge({
        code: "A",
        file: "staged.ts",
      })
      expect(badge.code).toBe("A")
      expect(badge.colorClass).toBe("text-success")
      expect(badge.title).toBe("Added (Staged)")
    })

    it("maps Deleted (D) to text-error", () => {
      const badge = mapGitChangeToBadge({
        code: "D",
        file: "deleted.ts",
      })
      expect(badge.code).toBe("D")
      expect(badge.colorClass).toBe("text-error")
      expect(badge.title).toBe("Deleted")
    })

    it("maps Renamed (R) to text-accent", () => {
      const badge = mapGitChangeToBadge({
        code: "R",
        file: "renamed.ts",
      })
      expect(badge.code).toBe("R")
      expect(badge.colorClass).toBe("text-accent")
      expect(badge.title).toBe("Renamed")
    })
  })

  describe("buildExplorerGitDecorations", () => {
    it("builds gitStatusMap and extracts all ancestor directories into dirtyFoldersSet", () => {
      const unstaged: GitChange[] = [
        { code: "M", file: "src/components/layout/chat/ChatMessageList.tsx" },
        { code: "?", file: "docs/new-guide.md" },
      ]
      const staged: GitChange[] = [
        { code: "A", file: "server/internal/api/api.go" },
      ]

      const { gitStatusMap, dirtyFoldersSet } = buildExplorerGitDecorations(
        staged,
        unstaged,
      )

      // Check status map
      expect(
        gitStatusMap.get("src/components/layout/chat/ChatMessageList.tsx"),
      ).toEqual({
        code: "M",
        colorClass: "text-warning",
        title: "Modified",
      })
      expect(gitStatusMap.get("docs/new-guide.md")).toEqual({
        code: "U",
        colorClass: "text-success",
        title: "Untracked",
      })
      expect(gitStatusMap.get("server/internal/api/api.go")).toEqual({
        code: "A",
        colorClass: "text-success",
        title: "Added (Staged)",
      })

      // Check ancestor dirty folders
      expect(dirtyFoldersSet.has("src")).toBe(true)
      expect(dirtyFoldersSet.has("src/components")).toBe(true)
      expect(dirtyFoldersSet.has("src/components/layout")).toBe(true)
      expect(dirtyFoldersSet.has("src/components/layout/chat")).toBe(true)
      expect(dirtyFoldersSet.has("docs")).toBe(true)
      expect(dirtyFoldersSet.has("server")).toBe(true)
      expect(dirtyFoldersSet.has("server/internal")).toBe(true)
      expect(dirtyFoldersSet.has("server/internal/api")).toBe(true)

      // Folders that do NOT contain modified files should not be dirty
      expect(dirtyFoldersSet.has("test")).toBe(false)
      expect(dirtyFoldersSet.has("public")).toBe(false)
    })

    it("prefers unstaged over staged status for the same file", () => {
      const unstaged: GitChange[] = [{ code: "M", file: "package.json" }]
      const staged: GitChange[] = [{ code: "A", file: "package.json" }]

      const { gitStatusMap } = buildExplorerGitDecorations(staged, unstaged)
      expect(gitStatusMap.get("package.json")?.code).toBe("M")
    })

    it("decorates in-memory dirty file buffers and propagates to ancestor folders", () => {
      const fileBuffers = {
        "src/utils/customHelper.ts": {
          content: "new code",
          isDirty: true,
          language: "typescript",
        },
        "clean.ts": {
          content: "clean code",
          isDirty: false,
          language: "typescript",
        },
      }

      const { gitStatusMap, dirtyFoldersSet } = buildExplorerGitDecorations(
        [],
        [],
        fileBuffers,
      )

      expect(gitStatusMap.get("src/utils/customHelper.ts")).toEqual({
        code: "●",
        colorClass: "text-warning",
        title: "Unsaved Changes",
      })
      expect(gitStatusMap.has("clean.ts")).toBe(false)
      expect(dirtyFoldersSet.has("src")).toBe(true)
      expect(dirtyFoldersSet.has("src/utils")).toBe(true)
    })
  })
})
