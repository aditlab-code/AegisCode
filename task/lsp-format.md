Berdasarkan penelusuran arsitektur basis kode AegisCode, sistem telah dirancang dengan arsitektur **Hybrid LSP Client**: Backend Go bertindak sebagai *process supervisor* & jembatan JSON-RPC 2.0, sementara frontend React + CodeMirror 6 menangani *editor extensions* (IntelliSense, Hover, Go-to-Definition, Formatting, dan Diagnostics).

Berikut adalah rancangan dan implementasi lengkap integrasi **LSP Client untuk 10 Bahasa** yang ada di dalam kode:

---

### 1. Pemetaan 10 Bahasa & Server LSP (`server/internal/lsp/manager.go` & `cmTheme.ts`)

| No | Bahasa | Ekstensi Berkas | LSP Language ID | Kandidat Binary LSP (Lokal / OS) | Skrip / Perintah Instalasi |
| --- | --- | --- | --- | --- | --- |
| **1** | **TypeScript** | `.ts`, `.tsx` | `typescript`, `typescriptreact` | `vtsls`, `typescript-language-server` | `npm i -g @vtsls/language-server typescript` |
| **2** | **JavaScript** | `.js`, `.jsx` | `javascript`, `javascriptreact` | `typescript-language-server`, `vtsls` | `npm i -g typescript-language-server` |
| **3** | **Python** | `.py` | `python` | `pyright-langserver`, `pyright`, `ruff`, `pylsp` | `npm i -g pyright` atau `pip install pyright` |
| **4** | **Go** | `.go` | `go` | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| **5** | **Rust** | `.rs` | `rust` | `rust-analyzer` | `rustup component add rust-analyzer` |
| **6** | **C** | `.c`, `.h` | `c` | `clangd` | `brew install llvm` / `apt install clangd` |
| **7** | **C++** | `.cpp`, `.cc`, `.hpp` | `cpp` | `clangd` | `brew install llvm` / `apt install clangd` |
| **8** | **HTML** | `.html`, `.htm` | `html` | `vscode-html-language-server` | `npm i -g vscode-langservers-extracted` |
| **9** | **CSS** | `.css` | `css` | `vscode-css-language-server` | `npm i -g vscode-langservers-extracted` |
| **10** | **JSON** | `.json` | `json` | `vscode-json-language-server` | `npm i -g vscode-langservers-extracted` |

*(Catatan: Markdown `.md` turut didukung untuk preview dokumen terintegrasi).*

---

### 2. Arsitektur Alur Komunikasi LSP (End-to-End)

```
┌─────────────────────────────────────────────────────────────┐
│                       FRONTEND UI                           │
│  CMEditor.tsx (CodeMirror 6) ◄──► LspStatusPopover.tsx       │
│  [Autocomplete] [Hover Tooltip] [Go-to-Def] [Format on Save]│
└──────────────────────────────▲──────────────────────────────┘
                               │ HTTP REST & SSE
┌──────────────────────────────▼──────────────────────────────┐
│                    src/utils/lspApi.ts                      │
│   notifyLspOpen() / fetchLspCompletion() / subscribeEvents()│
└──────────────────────────────▲──────────────────────────────┘
                               │ /api/v1/lsp/* & /api/v1/events/lsp
┌──────────────────────────────▼──────────────────────────────┐
│                   BACKEND CORE (Go Server)                  │
│  server/internal/api/api.go ──► server/internal/lsp/manager │
│                                 │ (Auto-detect & Lifecycle) │
│                                 ▼                           │
│                  server/internal/lsp/client.go              │
│                  (JSON-RPC 2.0 Framing: Content-Length)     │
└──────────────────────────────▲──────────────────────────────┘
                               │ stdin / stdout (stdio)
┌──────────────────────────────▼──────────────────────────────┐
│                   OUT-OF-PROCESS SERVERS                    │
│   [gopls] [pyright] [vtsls] [rust-analyzer] [clangd] dll.   │
└─────────────────────────────────────────────────────────────┘

```

---

### 3. Implementasi Komponen Utama

#### A. Gateway API Frontend (`src/utils/lspApi.ts`)

Mengabstraksi panggilan HTTP dan *Server-Sent Events* (SSE) ke backend:

```typescript
const API_BASE = "http://localhost:8080"

export interface LspCompletionItem {
  label: string
  kind?: number
  detail?: string
  documentation?: any
  insertText?: string
}

export interface LspPosition { line: number; character: number }
export interface LspRange { start: LspPosition; end: LspPosition }
export interface LspHover { contents: any; range?: LspRange }
export interface LspLocation { uri: string; range: LspRange }
export interface LspTextEdit { range: LspRange; newText: string }

// 1. Notifikasi Dokumen
export async function notifyLspOpen(path: string, content: string, language: string) {
  await fetch(`${API_BASE}/api/v1/lsp/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, language }),
  })
}

export async function notifyLspChange(path: string, content: string, language: string) {
  await fetch(`${API_BASE}/api/v1/lsp/change`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, language }),
  })
}

// 2. Fitur Interaktif Editor
export async function fetchLspCompletion(path: string, line: number, character: number, language: string): Promise<LspCompletionItem[]> {
  const res = await fetch(`${API_BASE}/api/v1/lsp/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, line, character, language }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.items || []
}

export async function fetchLspHover(path: string, line: number, character: number, language: string): Promise<LspHover | null> {
  const res = await fetch(`${API_BASE}/api/v1/lsp/hover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, line, character, language }),
  })
  if (!res.ok) return null
  const data = await res.json()
  return data.hover || null
}

export async function fetchLspDefinition(path: string, line: number, character: number, language: string): Promise<LspLocation[]> {
  const res = await fetch(`${API_BASE}/api/v1/lsp/definition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, line, character, language }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.locations || []
}

export async function fetchLspFormatting(path: string, tabSize: number, insertSpaces: boolean, language: string): Promise<LspTextEdit[]> {
  const res = await fetch(`${API_BASE}/api/v1/lsp/formatting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, tabSize, insertSpaces, language }),
  })
  if (!res.ok) return []
  const data = await res.json()
  return data.edits || []
}

// 3. Real-time Diagnostics via SSE
export function subscribeLspDiagnostics(onDiagnostic: (diag: any) => void): () => void {
  const es = new EventSource(`${API_BASE}/api/v1/events/lsp`)
  es.onmessage = (event) => {
    try { onDiagnostic(JSON.parse(event.data)) } catch {}
  }
  return () => es.close()
}

```

---

#### B. Integrasi CodeMirror 6 (`src/components/layout/editor/CMEditor.tsx`)

Ekstensi yang mengaktifkan kemampuan IDE di dalam buffer editor:

1. **IntelliSense Autocompletion**:

```typescript
const lspCompletionSource = useCallback(
  async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/\w*/)
    if (!word && !context.explicit) return null

    const line = context.state.doc.lineAt(context.pos)
    const lineNum = line.number - 1 // LSP berindeks 0
    const charNum = context.pos - line.from

    const items = await fetchLspCompletion(filename, lineNum, charNum, langInfo.id)
    if (!items || items.length === 0) return null

    return {
      from: word ? word.from : context.pos,
      options: items.map((item) => ({
        label: item.label,
        type: item.kind ? "keyword" : "text",
        detail: item.detail,
        info: typeof item.documentation === "string" ? item.documentation : undefined,
        apply: item.insertText || item.label,
      })),
    }
  },
  [filename, langInfo.id],
)

```

2. **Hover Documentation Tooltip**:

```typescript
const lspHoverExtension = useCallback(() => {
  return hoverTooltip(async (view, pos) => {
    const line = view.state.doc.lineAt(pos)
    const lineNum = line.number - 1
    const charNum = pos - line.from

    const hoverData = await fetchLspHover(filename, lineNum, charNum, langInfo.id)
    if (!hoverData?.contents) return null

    let contentText = ""
    if (typeof hoverData.contents === "string") {
      contentText = hoverData.contents
    } else if (Array.isArray(hoverData.contents)) {
      contentText = hoverData.contents.map((c) => (typeof c === "string" ? c : c.value)).join("\n\n")
    } else if (hoverData.contents.value) {
      contentText = hoverData.contents.value
    }
    if (!contentText.trim()) return null

    return {
      pos,
      above: true,
      create() {
        const dom = document.createElement("div")
        dom.className = "cm-lsp-hover-tooltip p-2 bg-surface-raised border border-line rounded text-xs text-ink max-w-md shadow-md"
        dom.textContent = contentText
        return { dom }
      },
    }
  })
}, [filename, langInfo.id])

```

3. **Navigasi Go-to-Definition (`F12` / `Cmd+Click`)**:

```typescript
const handleGoToDefinition = useCallback(
  async (view: EditorView, targetPos?: number) => {
    const pos = targetPos ?? view.state.selection.main.head
    const line = view.state.doc.lineAt(pos)
    const lineNum = line.number - 1
    const charNum = pos - line.from

    const locs = await fetchLspDefinition(filename, lineNum, charNum, langInfo.id)
    if (!locs || locs.length === 0) return

    const loc = locs[0]
    let targetPath = loc.uri.replace(/^file:\/\//, "")
    const targetLine = (loc.range?.start?.line ?? 0) + 1
    const targetCol = (loc.range?.start?.character ?? 0) + 1

    const isCurrentFile = targetPath === filename || targetPath.endsWith("/" + filename)

    if (isCurrentFile) {
      const lineObj = view.state.doc.line(targetLine)
      const newPos = Math.min(lineObj.from + Math.max(0, targetCol - 1), lineObj.to)
      view.dispatch({ selection: { anchor: newPos }, scrollIntoView: true })
      view.focus()
    } else if (onNavigateDefinition) {
      // Buka tab berkas baru lintas file
      onNavigateDefinition(targetPath, targetLine, targetCol)
    }
  },
  [filename, langInfo.id, onNavigateDefinition],
)

```

4. **Debounced Sync & Cleanup**:
Setiap pengetikan memicu debounce 300 ms (`notifyLspChange`) untuk efisiensi transfer data ke *language server*.

---

### 4. Manajemen Status & Instalasi Otomatis

* **UI Status Bar Popover (`LspStatusPopover.tsx`)**:
Menampilkan status real-time untuk ke-10 bahasa (`RUNNING` dengan PID aktif, `READY`, atau `NOT FOUND`), dilengkapi tombol salin perintah instalasi biner compiler yang belum terpasang.
* **Bundle Check Script (`scripts/install-lsp-bundle.js`)**:
Pengembang dapat memverifikasi atau menginstal seluruh dependensi server LSP dengan satu perintah:
```bash
# Memeriksa kesiapan biner 10 bahasa
node scripts/install-lsp-bundle.js --check

# Menginstal otomatis server berbasis NPM
npm run lsp:bundle

```