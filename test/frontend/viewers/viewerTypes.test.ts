import { describe, it, expect } from "vitest"
import {
  getViewerTypeForFile,
  getFileExtension,
  getRawFileUrl,
  formatFileSize,
  detectCsvDelimiter,
  parseCsv,
} from "../../../src/components/layout/editor/viewers/viewerTypes"

describe("viewerTypes utility", () => {
  describe("getViewerTypeForFile", () => {
    it("classifies image extensions correctly", () => {
      expect(getViewerTypeForFile("photo.png")).toBe("image")
      expect(getViewerTypeForFile("assets/logo.svg")).toBe("image")
      expect(getViewerTypeForFile("sample.jpg")).toBe("image")
      expect(getViewerTypeForFile("hero.jpeg")).toBe("image")
      expect(getViewerTypeForFile("banner.webp")).toBe("image")
      expect(getViewerTypeForFile("icon.ico")).toBe("image")
      expect(getViewerTypeForFile("anim.gif")).toBe("image")
    })

    it("classifies markdown extensions correctly", () => {
      expect(getViewerTypeForFile("README.md")).toBe("markdown")
      expect(getViewerTypeForFile("docs/guide.markdown")).toBe("markdown")
    })

    it("classifies pdf extensions correctly", () => {
      expect(getViewerTypeForFile("manual.pdf")).toBe("pdf")
      expect(getViewerTypeForFile("docs/report.PDF")).toBe("pdf")
    })

    it("classifies csv and tsv extensions correctly", () => {
      expect(getViewerTypeForFile("data.csv")).toBe("csv")
      expect(getViewerTypeForFile("dataset.tsv")).toBe("csv")
    })

    it("falls back to code for source files and unknown extensions", () => {
      expect(getViewerTypeForFile("main.go")).toBe("code")
      expect(getViewerTypeForFile("App.tsx")).toBe("code")
      expect(getViewerTypeForFile("styles.css")).toBe("code")
      expect(getViewerTypeForFile("package.json")).toBe("code")
      expect(getViewerTypeForFile("Makefile")).toBe("code")
    })
  })

  describe("getRawFileUrl", () => {
    it("constructs proper workspace raw endpoint URLs", () => {
      expect(getRawFileUrl("src/logo.svg")).toBe(
        "/api/v1/workspace/file/raw?path=src%2Flogo.svg",
      )
      expect(getRawFileUrl("./sample.png")).toBe(
        "/api/v1/workspace/file/raw?path=sample.png",
      )
    })
  })

  describe("formatFileSize", () => {
    it("formats bytes accurately", () => {
      expect(formatFileSize(0)).toBe("0 B")
      expect(formatFileSize(512)).toBe("512 B")
      expect(formatFileSize(1024)).toBe("1.0 KB")
      expect(formatFileSize(1048576)).toBe("1.0 MB")
      expect(formatFileSize(5242880)).toBe("5.0 MB")
    })
  })

  describe("detectCsvDelimiter", () => {
    it("detects comma delimiter correctly", () => {
      const csv = "id,name,role\n1,Alice,Admin\n2,Bob,User"
      expect(detectCsvDelimiter(csv)).toBe(",")
    })

    it("detects semicolon delimiter correctly", () => {
      const csv = "id;name;department\n1;Dewi;Engineering\n2;Budi;Design"
      expect(detectCsvDelimiter(csv)).toBe(";")
    })

    it("ignores commas inside quoted strings", () => {
      const csv =
        'id;description;count\n1;"Item with, lots of, commas";42\n2;"Another, item";99'
      expect(detectCsvDelimiter(csv)).toBe(";")
    })

    it("detects tab delimiter correctly", () => {
      const tsv = "col1\tcol2\tcol3\nval1\tval2\tval3"
      expect(detectCsvDelimiter(tsv)).toBe("\t")
    })
  })

  describe("parseCsv (RFC 4180)", () => {
    it("parses simple comma-separated table", () => {
      const text = "name,score\nAlice,95\nBob,88"
      const rows = parseCsv(text, ",")
      expect(rows).toEqual([
        ["name", "score"],
        ["Alice", "95"],
        ["Bob", "88"],
      ])
    })

    it("parses semicolon-separated table", () => {
      const text = "name;city\nAgus;Jakarta\nSiti;Surabaya"
      const rows = parseCsv(text, ";")
      expect(rows).toEqual([
        ["name", "city"],
        ["Agus", "Jakarta"],
        ["Siti", "Surabaya"],
      ])
    })

    it("handles quoted cells containing delimiters", () => {
      const text =
        'id,address,status\n1,"Jl. Sudirman, No. 10",active\n2,"Gedung B, Lt. 3",pending'
      const rows = parseCsv(text, ",")
      expect(rows).toEqual([
        ["id", "address", "status"],
        ["1", "Jl. Sudirman, No. 10", "active"],
        ["2", "Gedung B, Lt. 3", "pending"],
      ])
    })

    it("handles escaped quotes inside quoted cells", () => {
      const text = 'title,quote\nBook,"She said ""Hello World"" proudly"'
      const rows = parseCsv(text, ",")
      expect(rows).toEqual([
        ["title", "quote"],
        ["Book", 'She said "Hello World" proudly'],
      ])
    })

    it("handles CRLF line endings cleanly", () => {
      const text = "a,b\r\n1,2\r\n3,4\r\n"
      const rows = parseCsv(text, ",")
      expect(rows).toEqual([
        ["a", "b"],
        ["1", "2"],
        ["3", "4"],
      ])
    })
  })
})
