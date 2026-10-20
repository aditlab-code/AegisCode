import { API_BASE, getSessionToken } from "../utils/apiBase"

export type LatexEngine = "auto" | "xelatex" | "pdflatex" | "lualatex" | "tectonic"

export interface LatexToolchainStatus {
  latexmk: boolean
  xelatex: boolean
  pdflatex: boolean
  lualatex: boolean
  tectonic: boolean
  synctex: boolean
  texlab: boolean
  default: string
}

export interface LatexCompileResult {
  success: boolean
  pdfPath?: string
  rootFile: string
  engineUsed: string
  durationMs: number
  output: string
  errors?: string[]
}

export interface SyncTarget {
  page: number
  x: number
  y: number
  width: number
  height: number
  pdfFile?: string
}

export interface SourcePosition {
  file: string
  line: number
  column: number
}

function getAuthHeaders(): HeadersInit {
  const token = getSessionToken()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  return headers
}

/**
 * Checks installed LaTeX compilers, SyncTeX, and LSP on host.
 */
export async function getLatexStatus(): Promise<LatexToolchainStatus> {
  const res = await fetch(`${API_BASE}/api/v1/latex/status`, {
    headers: getAuthHeaders(),
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch LaTeX status: ${res.statusText}`)
  }
  return res.json()
}

/**
 * Triggers compilation of a LaTeX document (auto-resolves root file if modular).
 */
export async function compileLatex(
  file: string,
  engine: LatexEngine = "auto",
): Promise<LatexCompileResult> {
  const res = await fetch(`${API_BASE}/api/v1/latex/compile`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ file, engine }),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(errorText || `Compilation request failed (${res.status})`)
  }
  return res.json()
}

/**
 * Maps source file and line to PDF coordinates (Forward Search).
 */
export async function forwardSyncLatex(
  file: string,
  line: number,
  column = 1,
  pdfFile = "",
): Promise<SyncTarget> {
  const res = await fetch(`${API_BASE}/api/v1/latex/synctex/forward`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ file, line, column, pdfFile }),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(errorText || `Forward sync failed (${res.status})`)
  }
  return res.json()
}

/**
 * Maps PDF page and coordinate point to source TeX file and line (Inverse Search).
 */
export async function inverseSyncLatex(
  pdfFile: string,
  page: number,
  x: number,
  y: number,
): Promise<SourcePosition> {
  const res = await fetch(`${API_BASE}/api/v1/latex/synctex/inverse`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify({ pdfFile, page, x, y }),
  })
  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(errorText || `Inverse sync failed (${res.status})`)
  }
  return res.json()
}
