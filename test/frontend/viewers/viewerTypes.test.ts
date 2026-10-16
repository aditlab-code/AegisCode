import { describe, it, expect, vi } from "vitest"
import {
  getViewerTypeForFile,
  getFileExtension,
  getRawFileUrl,
  formatFileSize,
  detectCsvDelimiter,
  parseCsv,
  isGraphTab,
  isSettingsTab,
  parseGraphTab,
} from "../../../src/components/layout/editor/viewers/viewerTypes"
import { queryWorkspaceCsv } from "../../../src/utils/workspaceApi"

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

    it("classifies codegraph and .graph files as graph viewer", () => {
      expect(getViewerTypeForFile("CodeGraph")).toBe("graph")
      expect(getViewerTypeForFile("codegraph:workspace")).toBe("graph")
      expect(getViewerTypeForFile("codegraph:auth/session.go")).toBe("graph")
      expect(getViewerTypeForFile("project.graph")).toBe("graph")
    })

    it("falls back to code for source files and unknown extensions", () => {
      expect(getViewerTypeForFile("main.go")).toBe("code")
      expect(getViewerTypeForFile("App.tsx")).toBe("code")
      expect(getViewerTypeForFile("styles.css")).toBe("code")
      expect(getViewerTypeForFile("package.json")).toBe("code")
      expect(getViewerTypeForFile("Makefile")).toBe("code")
    })
  })

  describe("isGraphTab and parseGraphTab", () => {
    it("identifies graph tabs accurately", () => {
      expect(isGraphTab("CodeGraph")).toBe(true)
      expect(isGraphTab("codegraph:workspace")).toBe(true)
      expect(isGraphTab("codegraph:main.go")).toBe(true)
      expect(isGraphTab("schema.graph")).toBe(true)
      expect(isGraphTab("main.go")).toBe(false)
      expect(isGraphTab("App.tsx")).toBe(false)
    })

    it("parses graph tab targets and display names", () => {
      expect(parseGraphTab("CodeGraph")).toEqual({
        displayName: "CodeGraph (Workspace)",
        target: "",
        isWorkspace: true,
      })
      expect(parseGraphTab("codegraph:workspace")).toEqual({
        displayName: "CodeGraph (Workspace)",
        target: "",
        isWorkspace: true,
      })
      expect(parseGraphTab("codegraph:auth/session.go")).toEqual({
        displayName: "CodeGraph (session.go)",
        target: "auth/session.go",
        isWorkspace: false,
      })
    })
  })

  describe("isSettingsTab", () => {
    it("identifies settings tabs accurately", () => {
      expect(isSettingsTab("Settings")).toBe(true)
      expect(isSettingsTab("aegis://settings")).toBe(true)
      expect(isSettingsTab("settings:ai")).toBe(true)
      expect(isSettingsTab("main.go")).toBe(false)
      expect(isSettingsTab("SettingsModal.tsx")).toBe(false)
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

    it("detects semicolon delimiter even with decimal commas", () => {
      const csv =
        "id;product;price;rating\n1;Monitor;199,99;4,5\n2;Keyboard;49,50;4,8\n3;Mouse;25,00;4,2"
      expect(detectCsvDelimiter(csv)).toBe(";")
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

    it("parses wide table with 100+ columns accurately", () => {
      const colCount = 120
      const header = Array.from(
        { length: colCount },
        (_, i) => `Col_${i + 1}`,
      ).join(",")
      const row1 = Array.from(
        { length: colCount },
        (_, i) => `Val_${i + 1}`,
      ).join(",")
      const row2 = Array.from(
        { length: colCount },
        (_, i) => `Data_${i + 1}`,
      ).join(",")
      const csv = `${header}\n${row1}\n${row2}`
      const rows = parseCsv(csv, ",")
      expect(rows).toHaveLength(3)
      expect(rows[0]).toHaveLength(colCount)
      expect(rows[1]).toHaveLength(colCount)
      expect(rows[0][0]).toBe("Col_1")
      expect(rows[0][colCount - 1]).toBe(`Col_${colCount}`)
    })

    it("parses tall table with 150+ rows accurately", () => {
      const rowCount = 150
      const lines = ["id,val"]
      for (let i = 1; i <= rowCount; i++) {
        lines.push(`${i},test_${i}`)
      }
      const rows = parseCsv(lines.join("\n"), ",")
      expect(rows).toHaveLength(rowCount + 1)
      expect(rows[1][0]).toBe("1")
      expect(rows[rowCount][0]).toBe(String(rowCount))
    })
  })

  describe("queryWorkspaceCsv API client", () => {
    it("constructs proper query URL with pagination and windowing params", async () => {
      const mockResponse = {
        headers: ["id", "name"],
        rows: [["1", "Alice"]],
        totalRows: 100,
        totalCols: 2,
        page: 2,
        pageSize: 10,
        totalPages: 10,
        colOffset: 0,
        colLimit: 25,
        delimiter: ",",
        isServerSide: true,
        queryTimeMs: 0.5,
      }
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response)

      const result = await queryWorkspaceCsv("dataset.csv", {
        page: 2,
        pageSize: 10,
        colOffset: 0,
        colLimit: 25,
        search: "Alice",
      })

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "/api/v1/workspace/csv/query?path=dataset.csv&page=2&pageSize=10&colOffset=0&colLimit=25&search=Alice",
        ),
      )
      expect(result.totalRows).toBe(100)
      expect(result.isServerSide).toBe(true)
      expect(result.rows[0][1]).toBe("Alice")

      fetchSpy.mockRestore()
    })
  })

  describe("Markdown viewer layout verification", () => {
    it("verifies viewer classification and file paths for markdown", () => {
      expect(getViewerTypeForFile("README.md")).toBe("markdown")
      expect(getViewerTypeForFile("CHANGELOG.markdown")).toBe("markdown")
    })
  })
})
