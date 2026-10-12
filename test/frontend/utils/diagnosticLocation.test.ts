import { describe, it, expect } from "vitest"
import { parseDiagnosticLocation } from "@/components/layout/bottom-panel/ProblemsView"

describe("parseDiagnosticLocation", () => {
  it("parses linter bracket format: filename [line, col]", () => {
    const result = parseDiagnosticLocation("src/App.tsx [12, 5]")
    expect(result.filename).toBe("src/App.tsx")
    expect(result.lineCol).toBe("Ln 12, Col 5")
  })

  it("parses colon format with line and column: filename:line:col", () => {
    const result = parseDiagnosticLocation("server/main.go:45:10")
    expect(result.filename).toBe("server/main.go")
    expect(result.lineCol).toBe("Ln 45, Col 10")
  })

  it("parses colon format with line only: filename:line", () => {
    const result = parseDiagnosticLocation("server/main.go:88")
    expect(result.filename).toBe("server/main.go")
    expect(result.lineCol).toBe("Ln 88, Col 1")
  })

  it("handles filename without location metadata", () => {
    const result = parseDiagnosticLocation("README.md")
    expect(result.filename).toBe("README.md")
    expect(result.lineCol).toBe("Ln 1, Col 1")
  })

  it("handles empty location string safely", () => {
    const result = parseDiagnosticLocation("")
    expect(result.filename).toBe("")
    expect(result.lineCol).toBe("Ln 1, Col 1")
  })
})
