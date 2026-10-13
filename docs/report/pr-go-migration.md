Berikut adalah rancangan spesifikasi fase teknis untuk **Zero-Freeze Architecture via Go-First Offloading & Web Workers** (dapat dimasukkan ke `docs/internal/roadmap.md` sebagai **Sub-Phase 6.12**):


# Sub-Phase 6.12: Zero-Freeze Architecture (Go-First Offloading & Web Workers)

> **Objective**: Menjamin thread utama JavaScript/React selalu bebas dari komputasi berat (*zero blocking execution*) agar rendering editor tetap terkunci di 60 FPS dan pengetikan keyboard memiliki latensi sub-5 ms, bahkan pada berkas kode 50.000+ baris atau proyek dengan ribuan berkas.

---

### 1. Offloading Allocation Matrix (Pembagian Tugas)

Untuk menghindari kebingungan di mana suatu komputasi harus dieksekusi, arsitektur menetapkan aturan pembagian tugas yang tegas:

| Jenis Pekerjaan | Komputasi / Beban | Tempat Eksekusi | Mekanisme Komunikasi |
| --- | --- | --- | --- |
| **Input & Cursor Rendering** | Update state kursor, render CodeMirror buffer | **Thread Utama React** | Sinkron (Direct DOM) |
| **Minimap Tokenization** | Regex highlight ribuan baris teks mini | **Web Worker** (`tokenizer.worker.ts`) | `postMessage` (Transferable Buffer) |
| **Local Heuristic Linter** | AST traversal & heuristic regex linting | **Web Worker** (`linter.worker.ts`) | `postMessage` (Debounced 300 ms) |
| **CSV Tabular Parsing** | Deteksi delimiter, quote tracking, paginasi | **Backend Go** (`server/internal/workspace/csv.go`) | HTTP REST / Binary Stream |
| **Workspace Regex Search** | Scanning jutaan karakter melintasi banyak file | **Backend Go** (Multi-core Goroutines) | HTTP SSE Downlink |
| **Tree Fuzzy Filter / Sort** | Pencarian nama berkas (`Cmd+P`) di 10.000 file | **Backend Go** (`workspace/filter.go`) | HTTP Query (< 5 ms) |

---

### 2. Client-Side Web Workers Engine (`src/workers/`)

Vite secara native mendukung Web Worker via `import Worker from './worker?worker'`. Dua worker utama yang diimplementasikan:

#### A. Tokenizer Worker (`src/workers/tokenizer.worker.ts`)

* **Tugas**: Menghilangkan komputasi `tokenizeLine(lineText)` dari thread render `Minimap.tsx` dan `CodeBlockView`.
* **Alur**:
1. `Minimap.tsx` mengirimkan batch baris yang akan terlihat (`visibleLines: string[]`) ke worker.
2. Worker menjalankan tokenisasi regex di latar belakang tanpa mengganggu jalannya animasi scroll atau ketikan.
3. Worker mengembalikan struktur token ringkas (`{ color, text }[]`).
4. Menggunakan `AbortController` / message ID agar request scrolling cepat yang sudah kedaluwarsa langsung dibatalkan (*cancellation token*).



#### B. Linter Worker (`src/workers/linter.worker.ts`)

* **Tugas**: Menjalankan `validateSyntax()` dari `src/utils/linter.ts` di luar thread utama.
* **Alur**:
1. Saat pengguna mengetik di file non-LSP, teks buffer dikirim ke Linter Worker dengan debounce 300 ms.
2. Worker mengevaluasi heuristik sintaksis (kurung kurawal tidak seimbang, trailing comma ilegal di JSON, regex error).
3. Hasil `DiagnosticItem[]` dikirim kembali untuk di-dispatch ke CodeMirror lint gutter.



#### C. Type-Safe Worker RPC Bridge (`src/utils/workerBridge.ts`)

* Wrapper Promise yang bersih agar komponen React tidak perlu mengelola `addEventListener("message")` secara manual:
```ts
// Contoh pemanggilan di komponen
const tokens = await tokenizerBridge.tokenizeBatch(lines, language);

```



---

### 3. Go-First Backend Offloading

Untuk operasi yang melibatkan data besar, eksekusi dipindahkan seutuhnya ke Go yang memiliki *multi-thread pool* native:

#### A. Workspace Fuzzy Matcher untuk Quick Open (`server/internal/workspace/fuzzy.go`)

* **Alur**:
* Ketika pengguna menekan `Cmd+P` dan mengetik "csvw", penyaringan tidak dilakukan dengan `files.filter()` di React.
* Endpoint `GET /api/v1/workspace/files/find?q=csvw` memproses pencarian di Go menggunakan algoritma *Smith-Waterman* atau fuzzy matching berbasis byte yang berjalan paralel melintasi 50.000 path berkas dalam waktu **< 2 ms**, mengembalikan 20 hasil teratas saja ke UI.



#### B. Universal Server-Side CSV Pipeline

* Menghapus *fallback* parsing CSV berbasis JavaScript di `viewerTypes.ts` (`parseCsv`).
* Seluruh berkas `.csv` (baik 10 KB maupun 500 MB) diperlakukan sama: dibaca dan dipotong (*windowed*) langsung oleh engine Go RFC 4180 (`server/internal/workspace/csv.go`). Browser hanya menerima baris yang tampil di layar.

---

### 4. React 19 Main-Thread Scheduling Guardrails

Pada level React, prioritaskan pengetikan di atas segalanya:

1. **`useTransition` untuk Operasi Sekunder**:
* Perubahan tab, pergantian tema, dan filter sidebar dibungkus dengan `startTransition`:
```tsx
startTransition(() => {
  setActiveTab(newTab);
});

```


* Jika pengguna sedang mengetik cepat, React akan menunda perpindahan visual sekunder dan mendahulukan respon ketikan di editor.


2. **`requestAnimationFrame` Throttling untuk Scroll Sync**:
* Sinkronisasi scroll Markdown Preview dan Minimap selalu dijadwalkan via `requestAnimationFrame` tunggal dengan mutex flag (`rafId !== null`), mencegah penumpukan event scroll di microtask queue.



---

### 5. Milestone Execution Checklist

* [ ] **Step 1: Setup Worker Toolchain**
* Buat direktori `src/workers/`.
* Buat generic RPC wrapper `src/utils/workerBridge.ts`.


* [ ] **Step 2: Offload Minimap Tokenizer**
* Pindahkan logika `tokenizeLine` ke `src/workers/tokenizer.worker.ts`.
* Ubah `Minimap.tsx` agar mengonsumsi token asinkron dengan visual skeleton instan saat scrolling cepat.


* [ ] **Step 3: Offload Heuristic Linter**
* Pindahkan `validateSyntax` ke `src/workers/linter.worker.ts`.
* Hapus eksekusi linter sinkron dari `WorkbenchLifecycle.ts`.


* [ ] **Step 4: Go-Side Quick Open Fuzzy Indexer**
* Buat `server/internal/workspace/fuzzy.go` dan endpoint `/api/v1/workspace/files/find`.
* Hubungkan ke komponen `QuickOpenPopover` (`Cmd+P`).


* [ ] **Step 5: Deprecate Client CSV Parser**
* Alihkan seluruh pembacaan tabel di `CsvViewer.tsx` ke endpoint server-side query Go, menonaktifkan parsing teks CSV mentah di memori browser.


* [ ] **Step 6: Stress Testing & Profiling**
* Uji pengetikan 100 WPM pada berkas 20.000 baris (Performance Tab Chrome DevTools: target 0 frame drops / long-tasks > 50 ms).
* Uji scrolling cepat pada Minimap tanpa lonjakan memory heap JavaScript.