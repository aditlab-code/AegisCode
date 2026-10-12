import { describe, it, expect } from "vitest"
import { reconstructPath } from "../../../src/utils/storeApi"
import type { GraphNode } from "../../../src/types/workbench"

describe("Append-Only Graph Ledger Traversal & Linearization", () => {
  it("reconstructs linear root-to-leaf path correctly", () => {
    const nodes: GraphNode[] = [
      { id: "n-1", type: "user", text: "Turn 1", ts: 1000 },
      {
        id: "n-2",
        parent: "n-1",
        type: "thought",
        content: "Thinking 1",
        ts: 1002,
      },
      { id: "n-3", parent: "n-2", type: "agent", text: "Answer 1", ts: 1005 },
    ]

    const path = reconstructPath(nodes, "n-3")
    expect(path.map((n) => n.id)).toEqual(["n-1", "n-2", "n-3"])
  })

  it("handles conversation branching without mutating historic nodes", () => {
    // Tree topology:
    // n-1 (user)
    //  ├── n-2 (thought) -> n-3 (agent branch A)
    //  └── n-4 (thought alternative) -> n-5 (agent branch B)
    const nodes: GraphNode[] = [
      { id: "n-1", type: "user", text: "Prompt", ts: 1000 },
      {
        id: "n-2",
        parent: "n-1",
        type: "thought",
        content: "Plan A",
        ts: 1002,
      },
      { id: "n-3", parent: "n-2", type: "agent", text: "Reply A", ts: 1005 },
      {
        id: "n-4",
        parent: "n-1",
        type: "thought",
        content: "Plan B (retry)",
        ts: 1010,
      },
      { id: "n-5", parent: "n-4", type: "agent", text: "Reply B", ts: 1012 },
    ]

    // Branch A traversal
    const pathA = reconstructPath(nodes, "n-3")
    expect(pathA.map((n) => n.id)).toEqual(["n-1", "n-2", "n-3"])

    // Branch B traversal
    const pathB = reconstructPath(nodes, "n-5")
    expect(pathB.map((n) => n.id)).toEqual(["n-1", "n-4", "n-5"])
  })

  it("safely handles cycle or disconnected leaf node", () => {
    const nodes: GraphNode[] = [
      { id: "n-1", parent: "n-2", type: "user", text: "Cycle 1", ts: 1000 },
      { id: "n-2", parent: "n-1", type: "agent", text: "Cycle 2", ts: 1002 },
    ]

    // Should not infinite loop
    const path = reconstructPath(nodes, "n-2")
    expect(path.length).toBe(2)

    // Unknown node returns empty
    const emptyPath = reconstructPath(nodes, "non-existent")
    expect(emptyPath).toEqual([])
  })
})
