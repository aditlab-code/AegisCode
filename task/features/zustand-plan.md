Berikut adalah **Rencana Pentahapan Lengkap Refaktorisasi State Management ke Zustand (*Zustand Migration Roadmap*)** untuk AegisCode.

Strategi ini menggunakan prinsip **"Zero-Breaking Bridge"** — seluruh 80 komponen yang saat ini memanggil `useWorkbench()` akan tetap berjalan normal tanpa error sejak hari pertama, lalu komponen berfrekuensi render tinggi dioptimasi secara bertahap menggunakan *atomic selectors*.

---

### Gambaran Arsitektur Slices di Zustand

```
                     ┌──────────────────────────────────────────────┐
                     │          useWorkbenchStore (Zustand)         │
                     │          (Root Combined Store ~1.2 KB)       │
                     └──────────────────────┬───────────────────────┘
                                            │
        ┌──────────────┬──────────────┬─────┴────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼              ▼
  [LayoutSlice]  [EditorSlice]  [WorkspaceSlice] [GitSlice]   [TerminalSlice] [ChatSlice]
   (layoutCore)   (editorCore)  (workspaceCore)  (gitCore)    (terminalCore)  (chatCore)
        │              │              │              │              │              │
        └──────────────┴──────────────┼──────────────┴──────────────┴──────────────┘
                                      │
            ┌─────────────────────────┴────────────────────────┐
            ▼                                                  ▼
[Komponen Baru / Optimal]                             [Komponen Lama (80 files)]
useWorkbenchStore(s => s.isStreaming)                 useWorkbench() (Backward Bridge)

```

---

### Phase 1: Setup Dependensi & Pembuatan Root Store Skeleton

**Target**: Menambahkan Zustand ke proyek dan menyiapkan tipe data terpusat.

1. **Instalasi / Registrasi Dependensi (`package.json`)**:
* Tambahkan `"zustand": "^5.0.0"` ke `dependencies`.


2. **Struktur Direktori Baru (`src/store/`)**:
```text
src/store/
├── index.ts                 # Root useWorkbenchStore
├── types.ts                 # Tipe gabungan WorkbenchState & Slices
└── slices/
    ├── createLayoutSlice.ts
    ├── createEditorSlice.ts
    ├── createWorkspaceSlice.ts
    ├── createGitSlice.ts
    ├── createTerminalSlice.ts
    ├── createChatSlice.ts
    └── createSettingsSlice.ts

```


3. **Definisi State Creator Root (`src/store/types.ts`)**:
* Memanfaatkan fitur TypeScript Zustand `StateCreator` agar setiap slice dapat mengakses state slice lain jika diperlukan (misalnya: `editorSlice` dapat membaca `files` dari `workspaceSlice`).



---

### Phase 2: Konversi Sub-Core Menjadi Zustand Slices

**Target**: Memindahkan logika bisnis dari `src/context/core/*Core.ts` menjadi fungsi *Slice*. Logika internal tidak berubah, hanya sintaks `useState`/`useCallback` yang diganti dengan `set`/`get`.

1. **`createLayoutSlice.ts`** (dari `layoutCore.ts` — 488 baris):
* State: `sidebarWidth`, `bottomPanelHeight`, `activeSidebarTab`, `isSidebarOpen`, `isChatOpen`.
* Actions: `setSidebarWidth`, `toggleSidebar`, `toggleBottomPanel`.


2. **`createEditorSlice.ts`** (dari `editorCore.ts` — 622 baris):
* State: `activeTab`, `secondaryActiveTab`, `tabs`, `splitEditor`, `breakpoints`, `activeDebugLine`.
* Actions: `openFile`, `closeTab`, `setActiveTab`, `toggleBreakpoint`.


3. **`createWorkspaceSlice.ts`** (dari `workspaceCore.ts` — 1.087 baris):
* State: `files`, `fileBuffers`, `rootPath`, `cursorPosition`, `diagnostics`.
* Actions: `updateFileContent`, `saveFile`, `createFile`, `deleteFile`, `syncBufferWithDisk`.


4. **`createGitSlice.ts`** (dari `gitCore.ts` — 606 baris):
* State: `gitChanges`, `stagedChanges`, `branch`, `ahead`, `behind`, `gitDiffVersion`.
* Actions: `refreshGitStatus`, `stageChange`, `unstageChange`, `commitChanges`.


5. **`createTerminalSlice.ts`** (dari `terminalCore.ts` — 365 baris):
* State: `terminalSessions`, `activeTerminalSessionId`, `terminalLines`, `terminalRunning`.
* Actions: `createTerminalSession`, `closeTerminalSession`, `sendTerminalInput`.


6. **`createChatSlice.ts`** (dari `chatCore.ts` — 695 baris):
* State: `sessions`, `activeSessionId`, `chatMessages`, `isGenerating`, `activeProvider`, `activeModel`.
* Actions: `sendChatMessage`, `stopGenerating`, `createSession`, `switchSession`.


7. **`createSettingsSlice.ts`** (dari `settingsCore.ts` — 473 baris):
* State: `settings`, `theme`, `themePalette`.
* Actions: `updateSettings`, `setTheme`, `setThemePalette`.



---

### Phase 3: Implementasi "Zero-Breaking Bridge" (Jembatan Kompatibilitas)

**Target**: Memastikan seluruh 80 komponen yang memanggil `useWorkbench()` langsung beralih ke Zustand tanpa perlu mengubah 80 file sekaligus.

1. **Kombinasikan Slices di `src/store/index.ts**`:
```typescript
import { create } from "zustand"
import type { WorkbenchStore } from "./types"
import { createLayoutSlice } from "./slices/createLayoutSlice"
import { createEditorSlice } from "./slices/createEditorSlice"
// import slice lainnya...

export const useWorkbenchStore = create<WorkbenchStore>()((set, get, store) => ({
  ...createLayoutSlice(set, get, store),
  ...createEditorSlice(set, get, store),
  ...createWorkspaceSlice(set, get, store),
  ...createGitSlice(set, get, store),
  ...createTerminalSlice(set, get, store),
  ...createChatSlice(set, get, store),
  ...createSettingsSlice(set, get, store),
}))

```


2. **Ubah `src/context/WorkbenchContext.tsx` Menjadi Jembatan Tipis**:
* Hapus pemanggilan `useWorkbenchFacade()` yang berat.
* Sambungkan `useWorkbench` langsung ke Zustand:
```typescript
// src/context/WorkbenchContext.tsx
import { useWorkbenchStore } from "../store"
import type { ReactNode } from "react"

// Provider tidak lagi menyimpan state raksasa, hanya pass-through
export function WorkbenchProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

// Seluruh 80 komponen yang memanggil useWorkbench() tetap berfungsi normal!
export function useWorkbench() {
  return useWorkbenchStore()
}

```




3. **Hasil Tahap Ini**: Aplikasi sudah berjalan di atas engine Zustand, `workbenchFacade.ts` (1.396 baris) sudah bisa dinonaktifkan, dan semua tes frontend tetap lulus 100%.

---

### Phase 4: Optimasi Komponen Kritis dengan Atomic Selectors

**Target**: Menghilangkan *re-render cascade* pada komponen yang paling sering memicu pembaruan state.

Ubah pemanggilan di komponen-komponen berikut dari `const { ... } = useWorkbench()` menjadi pemanggilan selector atomik:

1. **Chat Area (Paling Kritis — Mencegah Freeze saat Streaming AI)**:
* `ChatMessageList.tsx`:
```typescript
// SEBELUM: me-render ulang setiap kali kursor editor bergerak
const { chatMessages, isGenerating } = useWorkbench()

// SESUDAH: HANYA me-render saat pesan atau status generasi berubah
const chatMessages = useWorkbenchStore((s) => s.chatMessages)
const isGenerating = useWorkbenchStore((s) => s.isGenerating)

```




2. **Editor & Breadcrumbs (Mencegah Lag Input Pengetikan)**:
* `CMEditor.tsx`: Hanya subscribe ke buffer berkasnya sendiri (`s.fileBuffers[filename]`) dan pengaturan editor.
* `EditorBreadcrumbs.tsx`: Hanya subscribe ke `s.activeTab` dan `s.splitEditor`.


3. **Status Bar (Mencegah Re-render Seluruh IDE saat Kursor Bergerak)**:
* `StatusBar.tsx`: Pisahkan cursor reporter (`Ln X, Col Y`) agar hanya komponen koordinat kursor yang re-render saat tombol panah ditekan:
```typescript
const cursor = useWorkbenchStore((s) => s.cursorPosition)

```




4. **Terminal Area (Mencegah Freeze saat Output Deras)**:
* `TerminalView.tsx`: Hanya subscribe ke `s.terminalSessions[sessionId]`.



---

### Phase 5: Manfaatkan Vanilla Store API untuk Background Stream

**Target**: Memindahkan listener SSE latar belakang ke luar siklus hidup React.

1. **SSE Downlink Terminal & AI Streaming**:
* Panggilan yang sebelumnya memerlukan React `dispatch` atau setter kini bisa langsung memutasi store tanpa trigger re-render komponen induk:
```typescript
// Di dalam handler SSE / EventSource:
useWorkbenchStore.getState().appendChatChunk(chunk)

```




2. **File Watcher SSE (`/api/v1/events/workspace`)**:
* Event disk perubahan file langsung mengabari store via `useWorkbenchStore.getState().syncDiskChange(evt)`.



---

### Phase 6: Pembersihan Akhir (*Cleanup & Deprecation*)

**Target**: Menghapus technical debt lama secara permanen.

1. Hapus file usang:
* `src/context/core/workbenchFacade.ts` (1.396 baris dihapus).
* `src/context/core/*Core.ts` lama yang sudah digantikan oleh `slices/`.


2. Verifikasi dan audit seluruh 80 komponen:
* Ganti import `import { useWorkbench } from ...` menjadi `useWorkbenchStore` dengan selector di komponen yang tersisa.


3. Hapus `WorkbenchContext.tsx` secara permanen.

---

### Phase 7: Quality Gates & Verifikasi Regresi

**Target**: Menjamin zero-regression pada seluruh fungsionalitas IDE.

1. **Jalankan Vitest**:
* Pastikan seluruh suite pengujian frontend (`test/frontend/**/*.test.ts`) lulus 100%.


2. **Benchmarking UI Render**:
* Gunakan React Profiler: bandingkan jumlah re-render saat AI melakukan streaming respon panjang (target: re-render di luar chat drawer = 0).


3. **Build & Format Gate**:
* `npm run format` & `npm run build` lulus tanpa error type check TypeScript.