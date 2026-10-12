import { describe, it, expect } from "vitest"
import { extractProposedCodeBlocks } from "@/components/layout/chat/ChatMessageList"

describe("ChatMessageList Multi-File Proposed Changes Extraction", () => {
  it("extracts multiple code blocks with target file paths", () => {
    const markdown = `
Here are the changes for the files:

\`\`\`ts:src/utils/math.ts
export function add(a: number, b: number) {
  return a + b
}
\`\`\`

And the second file:

\`\`\`tsx:src/components/Button.tsx
export function Button() {
  return <button>Click</button>
}
\`\`\`
`

    const blocks = extractProposedCodeBlocks(markdown)
    expect(blocks.length).toBe(2)
    expect(blocks[0].targetPath).toBe("src/utils/math.ts")
    expect(blocks[0].code).toContain("export function add")
    expect(blocks[1].targetPath).toBe("src/components/Button.tsx")
    expect(blocks[1].code).toContain("<button>Click</button>")
  })

  it("ignores standard code blocks without target filepaths", () => {
    const markdown = `
\`\`\`javascript
console.log("hello world")
\`\`\`
`
    const blocks = extractProposedCodeBlocks(markdown)
    expect(blocks.length).toBe(0)
  })

  it("returns empty array for empty or text-only messages", () => {
    expect(extractProposedCodeBlocks("")).toEqual([])
    expect(extractProposedCodeBlocks("Just regular text")).toEqual([])
  })
})
