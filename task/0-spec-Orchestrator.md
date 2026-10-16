# Specification: Residual Edge Cases Remediation (DOM Async, Terminal Cleanup, Empty Buffer & Resilient Viewers)

> **Document Type**: Architecture & Component Boundary Specification (Phase 7)  
> **Targets**: 
> - `TerminalView.tsx` (Terminal cleanup & disposed async write guard)
> - `CsvViewer.tsx` (Empty buffer condition & fetch loop guard)
> - `MarkdownViewer.tsx` (Split-scroll DOM attachment timing resilience)
> - `CodePane.tsx` (Buffer error visual fallback & retry mechanism)
> **Status**: SPECIFIED & PENDING USER REVIEW  
> **Author**: Shun for Adit-sensei  

---

## 1. Problem Statements & Root Cause Analysis

### 1.1 MAL-01: Terminal Asynchronous Disposed Write & Uncleaned Timers
- **Target**: [`src/components/layout/bottom-panel/TerminalView.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/bottom-panel/TerminalView.tsx#L148-L281)
- **Root Cause**:
  1. `setTimeout(syncSize, 100)` pada baris 172 tidak disimpan dalam ref dan tidak dibatalkan pada fungsi cleanup `useEffect`. Jika tab terminal ditutup mendadak dalam <100ms, fungsi `syncSize()` memanggil `fitAddon.fit()` dan `resizeTerminalApi(...)` pada objek terminal yang sudah di-dispose (`term.dispose()`).
  2. Handler `sse.addEventListener("data", ...)` dan `exit` tidak memeriksa apakah terminal telah di-dispose sebelum memanggil `term.write()`. Paket data SSE downlink yang sudah berada di event queue browser saat unmount memicu error: `Error: Terminal is disposed`.
- **Dampak**: Unhandled runtime error di console browser dan potensi memory leak saat membuka/menutup terminal berulang kali.

### 1.2 MAL-02: CsvViewer Empty File Infinite Fetch Loop
- **Target**: [`src/components/layout/editor/viewers/CsvViewer.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor/viewers/CsvViewer.tsx#L111-L135)
- **Root Cause**:
  Pada baris 114, kondisi `if (buffer?.content)` bernilai `false` (falsy) ketika file CSV berukuran 0 byte (`content === ""`). Hal ini membuat komponen selalu masuk ke blok `else` dan mengeksekusi `fetch(getRawFileUrl(filename))` berulang kali.
- **Dampak**: Spam HTTP request ke backend Go untuk file CSV kosong, membuang bandwidth dan resource CPU.

### 1.3 MAL-03: MarkdownViewer Initial Split-Scroll Listener Timing
- **Target**: [`src/components/layout/editor/viewers/MarkdownViewer.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor/viewers/MarkdownViewer.tsx#L83-L150)
- **Root Cause**:
  Pada split mode, `useEffect` langsung mencari `.cm-scroller` via `querySelector` satu kali saat mount. Karena CodeMirror dirender secara asinkron oleh `CodePane`, elemen `.cm-scroller` seringkali belum ada di DOM saat efek dieksekusi pertama kali, sehingga listener scroll editor tidak terpasang sama sekali hingga mode ditoggle bolak-balik.
- **Dampak**: Pengguna scroll di editor teks, tetapi panel preview markdown di sebelahnya tidak bergerak sinkron pada render awal.

### 1.4 MAL-04: CodePane Error Buffer User Feedback Banner
- **Target**: [`src/components/layout/editor/CodePane.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/editor/CodePane.tsx#L208-L225)
- **Root Cause**:
  Ketika buffer gagal di-fetch dari backend (`buffer.status === "error"`), `CodePane` tidak memberikan umpan balik visual dan membiarkan kanvas editor kosong tanpa tombol retry.
- **Dampak**: Pengguna bingung apakah file sedang loading, kosong, atau gagal dibaca dari disk.

---

## 2. Invariants & Architecture Contracts

### Invariant `MAL-SPEC-01`: Disposed Terminal Guard
- `TerminalView` wajib memelihara flag `isDisposed = false` di dalam scope `useEffect`.
- Setiap operasi terhadap terminal (`term.write`, `fitAddon.fit`, `syncSize`) wajib memeriksa `if (isDisposed) return`.
- Timer inisialisasi `setTimeout(syncSize, 100)` wajib disimpan dalam variabel dan dibatalkan via `clearTimeout` saat unmount.

### Invariant `MAL-SPEC-02`: Accurate Type Check for Empty Buffers
- `CsvViewer` wajib menggunakan pemeriksaan tipe eksplisit: `if (typeof buffer?.content === "string")`.
- Jika string kosong `""`, set state `rawText` menjadi `""`, set loading `false`, dan jangan lakukan fetch HTTP ke disk/raw endpoint.

### Invariant `MAL-SPEC-03`: Resilient DOM Element Binding for Scroller
- `MarkdownViewer` wajib menggunakan polling ringan atau observer yang mencoba mengaitkan listener ke `.cm-scroller` hingga elemen tersedia atau komponen di-unmount, memastikan scroll dua arah selalu aktif tanpa perlu intervensi manual.

### Invariant `MAL-SPEC-04`: Explicit Error State UI
- `CodePane` wajib merender fallback card yang rapi saat `buffer?.status === "error"`, menampilkan pesan kegagalan dan tombol retry yang memanggil `fetchBufferSafely(filename)`.

---

## 3. Verification Criteria
1. Buka dan tutup tab terminal dengan sangat cepat (<100ms): Tidak ada error `Terminal is disposed` di console.
2. Buka file `.csv` kosong (0 byte): Network tab tidak menunjukkan loop fetch HTTP berulang ke raw endpoint.
3. Buka file `.md` dalam mode split: Scroll editor langsung menggerakkan preview markdown sejak detik pertama.
4. Simulasikan file buffer error: Muncul banner error dengan tombol Retry yang dapat memicu fetch ulang.
5. Mandatory Verification Gates: `rtk npm run build`, `rtk npm run format`, dan `rtk npx vitest run` lulus 100% tanpa error.

---

# Phase 8 Specification: Minimap Canvas Silhouette & Viewport Synchronization

> **Targets**: 
> - `src/components/layout/editor/Minimap.tsx` (Canvas silhouette rendering, viewport slider synchronization, HiDPI Retina support)
> - `src/components/layout/editor/editor.css` (Clean canvas styling, remove DOM text layout artifacts)
> **Status**: SPECIFIED & PENDING USER REVIEW  
> **Author**: Shun for Adit-sensei  

## 1. Problem Statements & Design Goals
1. **Visual Dual-Scrolling Illusion**: Konten minimap berbasis DOM me-render teks mentah yang bergeser (`translateY`) sementara slider juga meluncur ke bawah, memicu kebingungan visual (paralaks ganda).
2. **DOM Churn & Layout Glitches**: Merender puluhan hingga ratusan elemen `div` dan `span` kecil di DOM per-frame saat scrolling memperlambat render dan menghasilkan teks terpotong kasar horizontal.
3. **Design Solution (Option 1 - VS Code Real Monospace Character Canvas)**:
   - Menggambar **teks kode asli** (huruf, angka, simbol) langsung ke `<canvas>` menggunakan `ctx.fillText()` dengan font monospaced mini yang sangat tajam dan terbaca.
   - Setiap token syntax (`keyword`, `function`, `string`, `comment`, dll.) diwarnai sesuai palet warna syntax editor asli.
   - Menstabilkan slider navigasi di atas kanvas dengan sinkronisasi rasio viewport yang presisi dan drag/click direct jump.
   - Mendukung HiDPI / Retina (`window.devicePixelRatio`) agar karakter font mini tajam tanpa buram.

## 2. Invariants & Architecture Contracts
- **`MINIMAP-CANVAS-01` (Zero DOM Lines Churn)**: Minimap tidak boleh me-render elemen DOM untuk setiap baris file. Semua karakter teks kode digambar langsung di kanvas via `ctx.fillText()`.
- **`MINIMAP-CANVAS-02` (Retina Sharpness)**: Kanvas harus diskalakan berdasarkan `window.devicePixelRatio` (biasanya 2x pada layar macOS Sensei) dengan `ctx.scale(dpr, dpr)` agar teks font mini tidak buram.
- **`MINIMAP-CANVAS-03` (Proportional Viewport Tracking)**: Slider box merefleksikan rasio viewport aktif `clientHeight / scrollHeight` secara proporsional tanpa efek guncangan.
- **`MINIMAP-CANVAS-04` (Regression Safety)**: Mempertahankan fungsi ekspor `computeMinimapScaleConfig` dan props interface publik agar kompatibel 100% dengan test suites eksis.
