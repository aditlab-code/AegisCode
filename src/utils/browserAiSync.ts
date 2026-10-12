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

const metaCache = new Map<string, HTMLMetaElement>()

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

  // 1. Head & Document Title Layer (only mutate if changed)
  const nextTitle = activeFile
    ? `${activeFile} — AegisCode`
    : "AegisCode — Lightweight IDE"
  if (document.title !== nextTitle) {
    document.title = nextTitle
  }

  function updateMeta(name: string, content: string) {
    let meta = metaCache.get(name)
    if (!meta || !meta.isConnected) {
      meta = (document.querySelector(
        `meta[name="${name}"]`,
      ) as HTMLMetaElement | null)
      if (!meta) {
        meta = document.createElement("meta")
        meta.name = name
        document.head.appendChild(meta)
      }
      metaCache.set(name, meta)
    }
    if (meta.content !== content) {
      meta.content = content
    }
  }

  updateMeta("aegis:active-file", activeFile || "")
  updateMeta("aegis:language", language)
  updateMeta("aegis:workspace", workspace)
  updateMeta("aegis:cursor", `Ln ${cursor.line}, Col ${cursor.col}`)
  updateMeta("aegis:is-dirty", isDirty ? "true" : "false")
  updateMeta("aegis:diagnostics-count", String(diagnosticsCount))

  // 2. Semantic DOM Attributes Layer (only mutate if attribute changed)
  const targetElement =
    document.querySelector(".workspace") as HTMLElement | null ||
    document.querySelector(".app-shell") as HTMLElement | null ||
    document.body

  if (targetElement) {
    const setIfDiff = (attr: string, val: string) => {
      if (targetElement.getAttribute(attr) !== val) {
        targetElement.setAttribute(attr, val)
      }
    }
    setIfDiff("data-aegis-active-file", activeFile || "")
    setIfDiff("data-aegis-language", language)
    setIfDiff("data-aegis-workspace", workspace)
    setIfDiff("data-aegis-is-dirty", isDirty ? "true" : "false")
    setIfDiff("data-aegis-cursor-line", String(cursor.line))
    setIfDiff("data-aegis-cursor-col", String(cursor.col))
    setIfDiff("data-aegis-diagnostics-count", String(diagnosticsCount))
  }

  // 3. Runtime Global JS Context Object & CustomEvent Layer
  const prevPayload = (window as any)
    .__AEGIS_ACTIVE_CONTEXT__ as AegisBrowserAiContext | undefined
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

  // Only dispatch 'aegis:file-change' if activeFile, language, or isDirty actually changed
  const fileChanged =
    !prevPayload ||
    prevPayload.activeFile !== activeFile ||
    prevPayload.language !== language ||
    prevPayload.isDirty !== isDirty

  if (fileChanged) {
    window.dispatchEvent(
      new CustomEvent("aegis:file-change", {
        detail: payload,
      }),
    )
  }
}
