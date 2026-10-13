# Rencana Perbaikan PR Issues #6 — Stabilitas, Memori & Performa

Perbaikan menyeluruh terhadap 7 isu yang ditemukan dalam audit frontend sebelum Phase 7. Isu-isu ini mencakup memory leak, input stuttering, konflik DOM selector, CPU overhead, re-render berlebihan, lazy loading, dan dead code.

---

## User Review Required

> [!IMPORTANT]
> **P3 — Dead Code `workbenchFacade.ts`**: File ini masih mengekspor `ConfirmCloseState` (dipakai `createEditorSlice.ts`, `store/types.ts`) dan `getTerminalRunCommand` (dipakai `createDebugSlice.ts`). Penghapusan file penuh memerlukan migrasi dua export ini ke lokasi baru. Rencana: pindahkan ke `src/types/workbench.ts` dan `src/utils/terminalRunCommand.ts`.
>
> File `useWorkbenchFacade()` sendiri (1.403 baris) sudah tidak dipakai, tapi kedua export non-hook di atas masih aktif. Konfirmasi apakah Anda setuju pendekatan migrasi ini.

> [!WARNING]
> **Lazy Loading TerminalView**: Perubahan ini akan membuat `TerminalView` dimuat secara async. Jika panel bawah dibuka pertama kali, akan ada jeda singkat tampilan `<Suspense>` fallback (misal: skeleton/spinner). Pastikan UX ini dapat diterima.

---

## Open Questions

> [!IMPORTANT]
> Apakah virtualisasi file tree (`ExplorerPanel.tsx`) — item P2 dengan kompleksitas tinggi — perlu dimasukkan ke PR ini, atau dijadikan PR terpisah? Berdasarkan prioritas di laporan (`P2 Sedang`), saya merekomendasikan **tidak** dimasukkan ke PR ini untuk menjaga scope tetap lean.

---

## Proposed Changes

### P0 — Memory Leak Terminal

#### [MODIFY] `TerminalView.tsx`
**Lokasi**: `src/components/layout/bottom-panel/TerminalView.tsx` baris 268–279

Tambahkan `term.dispose()` di dalam fungsi cleanup `useEffect` sebelum menutup SSE:

```diff
  return () => {
    window.removeEventListener("aegis:terminal-clear", handleClearEvent)
    window.removeEventListener("aegis:terminal-copy", handleCopyEvent)
    resizeObserver.disconnect()
    onDataDisposable.dispose()
+   term.dispose()
    if (sse) {
      sse.close()
    }
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current)
    }
  }
```

---

### P0 — Input Stutter: Memoize Diagnostics Filter

#### [MODIFY] `CodePane.tsx`
**Lokasi**: `src/components/layout/editor/CodePane.tsx` baris 375–377

Tambahkan `useMemo` untuk menstabilkan referensi array `filteredDiagnostics`:

```diff
+ const filteredDiagnostics = useMemo(
+   () => diagnostics.filter((d) => d.location.startsWith(filename)),
+   [diagnostics, filename],
+ )

  // ... di JSX:
  <CMEditor
    ...
-   diagnostics={diagnostics.filter((d) => d.location.startsWith(filename))}
+   diagnostics={filteredDiagnostics}
    ...
  />
```

> [!NOTE]
> `useMemo` di sini sudah optimal karena `diagnostics` dari `useShallow` hanya berubah ketika array-nya berganti referensi di store (yaitu saat linter/LSP mengirim hasil baru), bukan pada setiap ketikan.

---

### P1 — Perbaiki Selektor `.cm-scroller` (Hapus Global DOM Fallback)

#### [MODIFY] `CodePane.tsx`
**Lokasi**: baris 124–127 & 160–163

Hapus fallback `document.querySelector(".cm-scroller")` di dua tempat:

```diff
  useEffect(() => {
-   const scroller =
-     paneRef.current?.querySelector(".cm-scroller") ||
-     document.querySelector(".cm-scroller")
+   const scroller = paneRef.current?.querySelector(".cm-scroller")
    if (!scroller) return
    // ...
  }, [filename])

  const handleScrollToLine = useCallback(
    (lineIndex: number, smooth: boolean = true) => {
-     const scroller =
-       paneRef.current?.querySelector(".cm-scroller") ||
-       document.querySelector(".cm-scroller")
+     const scroller = paneRef.current?.querySelector(".cm-scroller")
      // ...
    },
    [editorLineHeight],
  )
```

#### [MODIFY] `Minimap.tsx`
**Lokasi**: `src/components/layout/editor/Minimap.tsx` baris 174–177

```diff
  function handleWheel(e: WheelEvent<HTMLDivElement>) {
-   const scroller =
-     containerRef.current?.parentElement?.querySelector(".cm-scroller") ||
-     document.querySelector(".cm-scroller")
+   const scroller =
+     containerRef.current?.parentElement?.querySelector(".cm-scroller")
    if (scroller) {
      scroller.scrollTop += e.deltaY
    }
  }
```

---

### P1 — Filter Subscription Auto-Save (`WorkbenchLifecycle.ts`)

#### [MODIFY] `WorkbenchLifecycle.ts`
**Lokasi**: `src/context/WorkbenchLifecycle.ts` baris 243–267

Tambahkan pemeriksaan referensi `fileBuffers` sebelum iterasi mahal `Object.entries(...)`:

```diff
  useEffect(() => {
+   let prevFileBuffers = store.getState().fileBuffers
    return store.subscribe((state) => {
      const { autoSave, autoSaveDelay } = state.settings.files
      if (autoSave !== "afterDelay") return

+     // Short-circuit: skip iterasi jika fileBuffers belum berubah
+     if (state.fileBuffers === prevFileBuffers) return
+     prevFileBuffers = state.fileBuffers

      const dirtyFiles = Object.entries(state.fileBuffers)
        .filter(([_, buf]) => buf.isDirty)
        .map(([filename]) => filename)

      if (dirtyFiles.length === 0) return
      // ... sisa logika tidak berubah
    })
  }, [store])
```

> [!NOTE]
> Zustand menggunakan immutable updates. Jika tidak ada perubahan pada `fileBuffers`, referensinya tetap sama (`===`). Pengecekan ini memotong 99% invokasi callback yang tidak relevan (pergerakan kursor, AI token stream, dll.).

---

### P2 — Decouple `activeTab` dari Parsing Markdown Chat

#### [MODIFY] `MarkdownRenderer.tsx`
**Lokasi**: `src/components/layout/chat/MarkdownRenderer.tsx` baris 57–65 & 96

Pindahkan `activeTab` ke komponen `CodeBlockView` via hook lokal agar `MarkdownRenderer` tidak ikut re-render saat tab editor berganti:

```diff
  export const MarkdownRenderer = memo(function MarkdownRenderer(...) {
-   const { openFileInPane, activeTab, applyCodeWithReview, showToast } =
+   const { openFileInPane, applyCodeWithReview, showToast } =
      useWorkbenchStore(
        useShallow((s) => ({
          openFileInPane: s.openFileInPane,
-         activeTab: s.activeTab,
          applyCodeWithReview: s.applyCodeWithReview,
          showToast: s.showToast,
        })),
      )

    // Di JSX, hapus prop activeTab dari CodeBlockView:
    <CodeBlockView
      ...
-     activeTab={activeTab}
      onApply={(target, code) => { ... }}
      ...
    />
  })

  // Di dalam CodeBlockView, baca activeTab sendiri dari store:
  function CodeBlockView({ lang, targetPath, code, ... }: CodeBlockViewProps) {
+   const activeTab = useWorkbenchStore((s) => s.activeTab)
    // ... sisa logika tidak berubah
  }
```

> [!NOTE]
> `MarkdownRenderer` di-memo, sehingga ia hanya re-render jika props-nya berubah. Dengan memindahkan `activeTab` ke `CodeBlockView`, hanya tombol Apply yang re-render saat tab berganti — bukan seluruh parsing markdown dan tokenisasi kode.

---

### P2 — Lazy Load `TerminalView` di `BottomPanel.tsx`

#### [MODIFY] `BottomPanel.tsx`
**Lokasi**: `src/components/layout/bottom-panel/BottomPanel.tsx` baris 1–14

```diff
- import { TerminalView } from "./TerminalView"
+ import { lazy, Suspense } from "react"
+
+ const TerminalView = lazy(() =>
+   import("./TerminalView").then((m) => ({ default: m.TerminalView })),
+ )

  // Di JSX, bungkus dengan Suspense:
- <TerminalView ... />
+ <Suspense fallback={<div className="flex-1 bg-canvas" />}>
+   <TerminalView ... />
+ </Suspense>
```

---

### P3 — Migrasi & Hapus Dead Code `workbenchFacade.ts`

#### [NEW] `src/utils/terminalRunCommand.ts`
Pindahkan fungsi `getTerminalRunCommand` dari `workbenchFacade.ts`:

```ts
export function getTerminalRunCommand(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "py":
    case "pyw":
      return `python3 "${filePath}"`
    case "go":
      return `go run "${filePath}"`
    case "js":
    case "mjs":
    case "cjs":
      return `node "${filePath}"`
    case "ts":
    case "mts":
    case "cts":
      return `npx tsx "${filePath}"`
    case "sh":
    case "bash":
    case "zsh":
      return `bash "${filePath}"`
    case "cpp":
    case "cc":
    case "cxx":
    case "c":
      return `clang++ "${filePath}" -o /tmp/aegis_bin && /tmp/aegis_bin`
    case "rs":
      return `rustc "${filePath}" -o /tmp/aegis_bin && /tmp/aegis_bin`
    default:
      return null
  }
}
```

#### [MODIFY] `src/types/workbench.ts`
Tambahkan interface `ConfirmCloseState` di akhir file:

```ts
export interface ConfirmCloseState {
  group: "group1" | "group2"
  filename: string
}
```

#### [MODIFY] `src/store/slices/createDebugSlice.ts`
Update import:
```diff
- import { getTerminalRunCommand } from "../../context/core/workbenchFacade"
+ import { getTerminalRunCommand } from "../../utils/terminalRunCommand"
```

#### [MODIFY] `src/store/slices/createEditorSlice.ts`
Update import:
```diff
- import type { ConfirmCloseState } from "../../context/core/workbenchFacade"
+ import type { ConfirmCloseState } from "../../types/workbench"
```

#### [MODIFY] `src/store/types.ts`
Update import:
```diff
- import type { ConfirmCloseState } from "../context/core/workbenchFacade"
+ import type { ConfirmCloseState } from "../types/workbench"
```

#### [DELETE] `src/context/core/workbenchFacade.ts`
Hapus file (1.404 baris) setelah semua import dimigrasikan.

---

### P3 — Destroy `PDFDocumentProxy` di `PdfViewer.tsx`

#### [MODIFY] `PdfViewer.tsx`
**Lokasi**: `src/components/layout/editor/viewers/PdfViewer.tsx` baris 63–70

```diff
  return () => {
    isCancelled = true
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel()
      renderTaskRef.current = null
    }
+   if (pdfDocRef.current) {
+     void pdfDocRef.current.destroy()
+     pdfDocRef.current = null
+   }
    loadingTask.destroy()
  }
```

---

## Ringkasan File yang Berubah

| File | Operasi | Alasan |
|------|---------|--------|
| `bottom-panel/TerminalView.tsx` | MODIFY | Tambah `term.dispose()` di cleanup |
| `editor/CodePane.tsx` | MODIFY | Memoize diagnostics filter + hapus global DOM fallback (2 lokasi) |
| `editor/Minimap.tsx` | MODIFY | Hapus global DOM fallback `.cm-scroller` |
| `context/WorkbenchLifecycle.ts` | MODIFY | Guard referensi `fileBuffers` sebelum iterasi |
| `chat/MarkdownRenderer.tsx` | MODIFY | Pindah `activeTab` ke `CodeBlockView` lokal |
| `bottom-panel/BottomPanel.tsx` | MODIFY | Lazy load `TerminalView` |
| `utils/terminalRunCommand.ts` | NEW | Migrasi fungsi dari `workbenchFacade.ts` |
| `types/workbench.ts` | MODIFY | Tambah `ConfirmCloseState` interface |
| `store/slices/createDebugSlice.ts` | MODIFY | Update import |
| `store/slices/createEditorSlice.ts` | MODIFY | Update import |
| `store/types.ts` | MODIFY | Update import |
| `context/core/workbenchFacade.ts` | DELETE | Dead code 1.404 baris |
| `editor/viewers/PdfViewer.tsx` | MODIFY | Destroy `pdfDocRef` saat cleanup |

---

## Verification Plan

### Automated Tests
```bash
rtk npm run build    # Harus 0 error
rtk npm run format   # Format check via oxfmt
```

### Manual Verification

| Prioritas | Item | Cara Verifikasi |
|-----------|------|----------------|
| P0 | `term.dispose()` | Buka terminal → ketik beberapa perintah → tutup tab terminal → DevTools Memory → heap snapshot, pastikan tidak ada `Terminal` object menggantung |
| P0 | Diagnostics memoize | Buka file TypeScript besar → ketik cepat → DevTools Profiler, pastikan tidak ada `setDiagnostics` dispatch berulang per karakter |
| P1 | `.cm-scroller` selector | Buka split editor (2 pane) → scroll pada pane kanan → pastikan minimap dan pane kiri tidak ikut bergerak |
| P1 | Auto-save CPU | DevTools Performance → rekam 5 detik sambil mengetik → tidak ada banyak `subscribe` callback di flame chart |
| P2 | Markdown re-render | Buka chat dengan banyak code block → pindah tab editor → tidak ada freeze di DevTools |
| P2 | Lazy load TerminalView | Network tab → load IDE dengan panel bawah tertutup → `TerminalView` chunk tidak di-load saat startup |
| P3 | PDF destroy | Buka PDF besar → ganti ke file lain → Memory tab, tidak ada `PDFDocumentProxy` menggantung |
| P3 | Build clean | `rtk npm run build` lulus dengan 0 TypeScript error setelah `workbenchFacade.ts` dihapus |
