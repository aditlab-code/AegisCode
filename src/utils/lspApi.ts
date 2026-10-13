const API_BASE = ""

export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: any
  insertText?: string
}

export interface LspPosition {
  line: number
  character: number
}

export interface LspRange {
  start: LspPosition
  end: LspPosition
}

export interface LspHover {
  contents: any
  range?: LspRange
}

export interface LspLocation {
  uri: string
  range: LspRange
}

export interface LspTextEdit {
  range: LspRange
  newText: string
}

export interface LanguageServerStatusInfo {
  language: string
  binaryName: string
  path: string
  status: "running" | "available" | "not_found"
  activePid?: number
  installCommand?: string
}

export async function notifyLspOpen(
  path: string,
  content: string,
  language: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/lsp/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content, language }),
    })
  } catch (err) {
    // Graceful background sync failure
  }
}

export async function notifyLspChange(
  path: string,
  content: string,
  language: string,
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/v1/lsp/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content, language }),
    })
  } catch (err) {
    // Graceful background sync failure
  }
}

export async function fetchLspCompletion(
  path: string,
  line: number,
  character: number,
  language: string,
): Promise<LspCompletionItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/lsp/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, line, character, language }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.items || []
  } catch (err) {
    return []
  }
}

export async function fetchLspHover(
  path: string,
  line: number,
  character: number,
  language: string,
): Promise<LspHover | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/lsp/hover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, line, character, language }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.hover || null
  } catch (err) {
    return null
  }
}

export async function fetchLspDefinition(
  path: string,
  line: number,
  character: number,
  language: string,
): Promise<LspLocation[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/lsp/definition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, line, character, language }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.locations || []
  } catch (err) {
    return []
  }
}

export async function fetchLspFormatting(
  path: string,
  tabSize: number,
  insertSpaces: boolean,
  language: string,
): Promise<LspTextEdit[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/lsp/formatting`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, tabSize, insertSpaces, language }),
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.edits || []
  } catch (err) {
    return []
  }
}

export async function fetchLspStatus(): Promise<LanguageServerStatusInfo[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/lsp/status`)
    if (!res.ok) return []
    const data = await res.json()
    return data.servers || []
  } catch (err) {
    return []
  }
}

export function subscribeLspDiagnostics(
  onDiagnostic: (diag: any) => void,
): () => void {
  const es = new EventSource(`${API_BASE}/api/v1/events/lsp`)

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onDiagnostic(data)
    } catch (e) {
      // Ignored
    }
  }

  return () => {
    es.close()
  }
}
