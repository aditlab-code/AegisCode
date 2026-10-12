import { describe, it, expect } from "vitest"
import { parseConflictRegions, resolveConflict } from "@/utils/gitConflict"

describe("gitConflict parser and resolver", () => {
  const sampleWithOneConflict = [
    "function calculateTotal(items: number[]) {",
    "<<<<<<< HEAD",
    "  const sum = items.reduce((acc, curr) => acc + curr, 0);",
    "=======",
    "  let sum = 0;",
    "  for (const n of items) sum += n;",
    ">>>>>>> feat/loop-optimization",
    "  return sum;",
    "}",
  ].join("\n")

  it("parses single conflict region accurately", () => {
    const regions = parseConflictRegions(sampleWithOneConflict)
    expect(regions).toHaveLength(1)
    expect(regions[0].startLine).toBe(2)
    expect(regions[0].separatorLine).toBe(4)
    expect(regions[0].endLine).toBe(7)
    expect(regions[0].currentBranch).toBe("HEAD")
    expect(regions[0].incomingBranch).toBe("feat/loop-optimization")
    expect(regions[0].currentContent).toBe(
      "  const sum = items.reduce((acc, curr) => acc + curr, 0);",
    )
    expect(regions[0].incomingContent).toBe(
      "  let sum = 0;\n  for (const n of items) sum += n;",
    )
  })

  it("resolves conflict by accepting current change", () => {
    const regions = parseConflictRegions(sampleWithOneConflict)
    const resolved = resolveConflict(
      sampleWithOneConflict,
      regions[0],
      "current",
    )
    expect(resolved).not.toContain("<<<<<<<")
    expect(resolved).not.toContain("=======")
    expect(resolved).not.toContain(">>>>>>>")
    expect(resolved).toContain("items.reduce")
    expect(resolved).not.toContain("for (const n of items)")
  })

  it("resolves conflict by accepting incoming change", () => {
    const regions = parseConflictRegions(sampleWithOneConflict)
    const resolved = resolveConflict(
      sampleWithOneConflict,
      regions[0],
      "incoming",
    )
    expect(resolved).not.toContain("<<<<<<<")
    expect(resolved).not.toContain("=======")
    expect(resolved).not.toContain(">>>>>>>")
    expect(resolved).not.toContain("items.reduce")
    expect(resolved).toContain("for (const n of items)")
  })

  it("resolves conflict by accepting both changes", () => {
    const regions = parseConflictRegions(sampleWithOneConflict)
    const resolved = resolveConflict(sampleWithOneConflict, regions[0], "both")
    expect(resolved).not.toContain("<<<<<<<")
    expect(resolved).not.toContain("=======")
    expect(resolved).not.toContain(">>>>>>>")
    expect(resolved).toContain("items.reduce")
    expect(resolved).toContain("for (const n of items)")
  })

  it("returns empty array for files without conflict markers", () => {
    const cleanContent = "const a = 1;\nconst b = 2;\n"
    expect(parseConflictRegions(cleanContent)).toEqual([])
  })

  it("handles multiple sequential conflict blocks", () => {
    const multiConflict = [
      "<<<<<<< HEAD",
      "const val = 10;",
      "=======",
      "const val = 20;",
      ">>>>>>> branchA",
      "const middle = true;",
      "<<<<<<< HEAD",
      "const str = 'current';",
      "=======",
      "const str = 'incoming';",
      ">>>>>>> branchB",
    ].join("\n")

    const regions = parseConflictRegions(multiConflict)
    expect(regions).toHaveLength(2)
    expect(regions[0].startLine).toBe(1)
    expect(regions[1].startLine).toBe(7)
  })
})
