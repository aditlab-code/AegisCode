import type { CursorPosition } from "../types/workbench"

export interface AegisBrowserAiContext {
  activeFile: string | null
  language: string
  workspace: string
  cursor: CursorPosition
  isDirty: boolean
  diagnosticsCount: number
  timestamp: number
}

/**
 * 3-Layer Browser AI Synchronization:
 * 1. Head & Document Title (document.title & <meta name="aegis:*">)
 * 2. Semantic DOM Attributes (data-aegis-* on workspace container)
 * 3. Runtime Global JS Context Object (window.__AEGIS_ACTIVE_CONTEXT__) & CustomEvent ('aegis:file-change')
 */
export function syncBrowserAiContext(context: {
  activeFile: string | null
  language?: string
  workspace?: string
  cursor?: CursorPosition
  isDirty?: boolean
  diagnosticsCount?: number
}) {
  if (typeof window === "undefined" || typeof document === "undefined") return

  const activeFile = context.activeFile || null
  const language = context.language || "plaintext"
  const workspace = context.workspace || "AegisCodev2"
  const cursor = context.cursor || { line: 1, col: 1 }
  const isDirty = Boolean(context.isDirty)
  const diagnosticsCount = context.diagnosticsCount || 0

  // 1. Head & Document Title Layer
  document.title = activeFile
    ? `${activeFile} — AegisCode`
    : "AegisCode — Lightweight IDE"

  function updateMeta(name: string, content: string) {
    let meta = document.querySelector(
      `meta[name="${name}"]`,
    ) as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement("meta")
      meta.name = name
      document.head.appendChild(meta)
    }
    meta.content = content
  }

  updateMeta("aegis:active-file", activeFile || "")
  updateMeta("aegis:language", language)
  updateMeta("aegis:workspace", workspace)
  updateMeta("aegis:cursor", `Ln ${cursor.line}, Col ${cursor.col}`)
  updateMeta("aegis:is-dirty", isDirty ? "true" : "false")
  updateMeta("aegis:diagnostics-count", String(diagnosticsCount))

  // 2. Semantic DOM Attributes Layer
  const targetElement =
    document.querySelector(".workspace") as HTMLElement | null ||
    document.querySelector(".app-shell") as HTMLElement | null ||
    document.body

  if (targetElement) {
    targetElement.setAttribute("data-aegis-active-file", activeFile || "")
    targetElement.setAttribute("data-aegis-language", language)
    targetElement.setAttribute("data-aegis-workspace", workspace)
    targetElement.setAttribute(
      "data-aegis-is-dirty",
      isDirty ? "true" : "false",
    )
    targetElement.setAttribute("data-aegis-cursor-line", String(cursor.line))
    targetElement.setAttribute("data-aegis-cursor-col", String(cursor.col))
    targetElement.setAttribute(
      "data-aegis-diagnostics-count",
      String(diagnosticsCount),
    )
  }

  // 3. Runtime Global JS Context Object & CustomEvent Layer
  const payload: AegisBrowserAiContext = {
    activeFile,
    language,
    workspace,
    cursor,
    isDirty,
    diagnosticsCount,
    timestamp: Date.now(),
  }
  ;(window as any).__AEGIS_ACTIVE_CONTEXT__ = payload

  window.dispatchEvent(
    new CustomEvent("aegis:file-change", {
      detail: payload,
    }),
  )
}
