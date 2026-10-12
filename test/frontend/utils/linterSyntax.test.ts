import { describe, it, expect } from "vitest"
import { validateSyntax } from "@/utils/linter"

describe("validateSyntax JS/TS delimiter and token handling", () => {
  it("does not report false errors for brackets inside string literals", () => {
    const code = `
      const msg = "Missing bracket {";
      const another = 'Unclosed [ in string';
      const template = \`Template ( with unclosed paren\`;
    `
    const diags = validateSyntax("test.ts", code)
    const errors = diags.filter((d) => d.type === "error")
    expect(errors).toHaveLength(0)
  })

  it("does not report false errors for brackets inside regex literals", () => {
    const code = `
      const rx1 = /\\(/;
      const rx2 = /[\\]{]/;
      const rx3 = /([a-z]+)/g;
    `
    const diags = validateSyntax("test.ts", code)
    const errors = diags.filter((d) => d.type === "error")
    expect(errors).toHaveLength(0)
  })

  it("does not report false errors for brackets inside single-line and multi-line comments", () => {
    const code = `
      // Single line comment with unclosed {
      /* Multi-line comment
         with mismatched } and [
      */
      function safe() {
        return true;
      }
    `
    const diags = validateSyntax("test.ts", code)
    const errors = diags.filter((d) => d.type === "error")
    expect(errors).toHaveLength(0)
  })

  it("correctly balances delimiters inside template literal interpolations", () => {
    const code = `
      const greeting = \`Hello \${(1 + 2) * 3} and \${{ a: 1 }.a}\`;
    `
    const diags = validateSyntax("test.ts", code)
    const errors = diags.filter((d) => d.type === "error")
    expect(errors).toHaveLength(0)
  })

  it("correctly detects real syntax errors for unclosed and mismatched delimiters", () => {
    const unclosed = `
      function broken() {
        if (true) {
          console.error("oops");
      }
    `
    const unclosedDiags = validateSyntax("test.ts", unclosed)
    expect(
      unclosedDiags.some((d) => d.title.includes("Unclosed delimiter")),
    ).toBe(true)

    const mismatched = `
      const arr = [1, 2, 3);
    `
    const mismatchedDiags = validateSyntax("test.ts", mismatched)
    expect(
      mismatchedDiags.some((d) =>
        d.title.includes("Mismatched closing delimiter"),
      ),
    ).toBe(true)
  })
})
