import { describe, it, expect, vi } from "vitest"
import { validateWorkspaceRelativePath } from "../../../src/utils/workspaceApi"

describe("Sub-Phase 6.10: Path Boundary Verification", () => {
  it("accepts valid relative workspace paths", () => {
    expect(() => validateWorkspaceRelativePath("src/App.tsx")).not.toThrow()
    expect(() => validateWorkspaceRelativePath("package.json")).not.toThrow()
    expect(() =>
      validateWorkspaceRelativePath("deep/nested/sub/file.go"),
    ).not.toThrow()
    expect(() => validateWorkspaceRelativePath("./local.ts")).not.toThrow()
  })

  it("rejects empty paths", () => {
    expect(() => validateWorkspaceRelativePath("")).toThrow(
      "Workspace file path cannot be empty",
    )
    expect(() => validateWorkspaceRelativePath("   ")).toThrow(
      "Workspace file path cannot be empty",
    )
  })

  it("strictly rejects directory traversal attempts", () => {
    expect(() => validateWorkspaceRelativePath("../escape.txt")).toThrow(
      "escapes workspace root directory",
    )
    expect(() => validateWorkspaceRelativePath("src/../../escape.txt")).toThrow(
      "escapes workspace root directory",
    )
    expect(() => validateWorkspaceRelativePath("../../etc/passwd")).toThrow(
      "escapes workspace root directory",
    )
    expect(() => validateWorkspaceRelativePath("a/b/../../../c")).toThrow(
      "escapes workspace root directory",
    )
  })
})

describe("Sub-Phase 6.10: Code Fence Parser lang:filepath Syntax", () => {
  it("matches and extracts language and target file path from fence header", () => {
    const fenceRegex = /^```(?:([a-zA-Z0-9_.-]+)(?::(\S+))?)?/

    // 1. Plain lang
    const match1 = "```typescript".match(fenceRegex)
    expect(match1).not.toBeNull()
    expect(match1![1]).toBe("typescript")
    expect(match1![2]).toBeUndefined()

    // 2. Lang with target path
    const match2 = "```ts:src/utils/calc.ts".match(fenceRegex)
    expect(match2).not.toBeNull()
    expect(match2![1]).toBe("ts")
    expect(match2![2]).toBe("src/utils/calc.ts")

    // 3. Lang with complex filename
    const match3 = "```tsx:src/components/layout/Header.tsx".match(fenceRegex)
    expect(match3).not.toBeNull()
    expect(match3![1]).toBe("tsx")
    expect(match3![2]).toBe("src/components/layout/Header.tsx")

    // 4. No lang
    const match4 = "```".match(fenceRegex)
    expect(match4).not.toBeNull()
    expect(match4![1]).toBeUndefined()
    expect(match4![2]).toBeUndefined()
  })
})
