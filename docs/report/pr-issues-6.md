Berikut hasil audit menyeluruh pada frontend (`src/`) terkait **kestabilan, performa memori (RAM), dan optimasi rendering** sebelum melangkah ke Phase 7 berikutnya:

---

### 1. Masalah Kritis (Memory Leak & Input Stuttering)

#### A. Memory Leak di `TerminalView.tsx` (`term.dispose()` tidak dipanggil)

* **Lokasi**: `src/components/layout/bottom-panel/TerminalView.tsx` (baris 268–279).
* **Temuan**: Saat komponen unmount atau di-reinisialisasi (misal: ganti font, ubah cursor blinking, atau ganti session), fungsi cleanup me-remove event listener dan menutup SSE, tetapi **tidak memanggil `term.dispose()**`.
* **Dampak**: Objek `Terminal` dari `@xterm/xterm`, canvas render WebGL/DOM, textarea helper, dan riwayat buffer tetap menggantung di memori browser setiap kali tab terminal ditutup atau di-restart.
* **Solusi**: Tambahkan `term.dispose()` di dalam fungsi cleanup `useEffect`.

#### B. Input Latency & Transaksi CodeMirror Berulang pada Setiap Ketikan

* **Lokasi**: `src/components/layout/editor/CodePane.tsx` (baris 375–377) & `CMEditor.tsx` (baris 739–772).
* **Temuan**: Di `CodePane`, props `diagnostics` diteruskan dengan:
```tsx
diagnostics={diagnostics.filter((d) => d.location.startsWith(filename))}

```


Karena `CodePane` me-render ulang pada setiap ketikan atau pergerakan kursor, ekspresi `.filter()` ini menghasilkan **referensi array baru setiap saat**. Akibatnya, `useEffect` di `CMEditor` mendeteksi perubahan dependency dan memicu transaksi `view.dispatch(setDiagnostics(...))` pada setiap karakter yang diketik, meskipun daftar diagnostik tidak berubah sama sekali.
* **Dampak**: Penurunan frame rate (*stuttering*) saat mengetik cepat, terutama pada berkas berukuran besar.
* **Solusi**: Bungkus penyaringan diagnostik dengan `useMemo` berdasarkan isi array diagnostik dan `filename`, atau bandingkan kesamaan data sebelum melakukan `view.dispatch`.

#### C. Tabrakan Selektor DOM Antar-Pane Split (`.cm-scroller`)

* **Lokasi**: `src/components/layout/editor/CodePane.tsx` (baris 125–127 & 160–163) dan `Minimap.tsx` (baris 176–177).
* **Temuan**: Terdapat fallback pemanggilan selektor global:
```ts
const scroller = paneRef.current?.querySelector(".cm-scroller") || document.querySelector(".cm-scroller");

```


Pada layout split editor (Group 1 & Group 2), pemanggilan `document.querySelector(".cm-scroller")` akan selalu mengambil elemen milik pane pertama jika pane kedua belum ter-mount secara sempurna.
* **Dampak**: Event listener scroll atau wheel pada pane split kanan bisa salah menempel ke pane kiri.
* **Solusi**: Hapus fallback `document.querySelector` global dan pastikan seleksi selalu terikat strictly ke `paneRef.current`.

---

### 2. Masalah Skalabilitas (CPU Churn & DOM Bloating)

#### A. File Tree Tanpa Virtualisasi di `ExplorerPanel.tsx`

* **Lokasi**: `src/components/layout/sidebar/ExplorerPanel.tsx` (baris 879–980).
* **Temuan**: Seluruh berkas dan folder yang tidak ter-collapse di-render langsung ke DOM melalui `{visibleFiles.map(...)}`. Setiap baris juga me-render elemen indent guide bersarang (`Array.from({ length: file.depth }).map(...)`).
* **Dampak**: Pada proyek dengan 1.000+ berkas yang terbuka, DOM tree membengkak hingga ribuan node. Hal ini memicu layout thrashing saat melakukan scroll atau expand/collapse folder.
* **Solusi**: Terapkan virtualisasi list (windowing) agar browser hanya me-render 30–50 baris yang saat itu terlihat di viewport sidebar.

#### B. Over-Firing `store.subscribe` pada Auto-Save (`WorkbenchLifecycle.ts`)

* **Lokasi**: `src/context/WorkbenchLifecycle.ts` (baris 244–266).
* **Temuan**: Listener auto-save mendaftar ke store secara menyeluruh:
```ts
return store.subscribe((state) => { ... })

```


Setiap ada perubahan state apa pun di IDE (termasuk pergerakan kursor mouse/keyboard dan streaming token AI), callback ini dieksekusi dan menjalankan `Object.entries(state.fileBuffers).filter(...)`.
* **Dampak**: Siklus CPU terbuang untuk iterasi objek buffer berkali-kali per detik saat pengguna mengetik atau kursor bergerak.
* **Solusi**: Simpan referensi hash atau periksa apakah `state.fileBuffers` benar-benar mengalami perubahan dirty status sebelum melakukan iterasi.

#### C. Re-render Seluruh Riwayat Chat saat Tab Editor Berpindah

* **Lokasi**: `src/components/layout/chat/MarkdownRenderer.tsx` (baris 57–65 & 279–304).
* **Temuan**: `MarkdownRenderer` berlangganan ke state `activeTab` dari store. Ketika pengguna berpindah tab di editor, seluruh pesan di riwayat chat yang menggunakan `MarkdownRenderer` mengevaluasi ulang `CodeBlockView`, memecah string baris kode, dan menjalankan tokenisasi regex (`tokenizeLine`).
* **Dampak**: Terasa jeda sesaat (*freeze*) ketika berpindah tab editor jika sesi chat memiliki riwayat panjang dengan banyak blok kode.
* **Solusi**: Jangan langganan `activeTab` di level komponen render pesan markdown, atau delegasikan state target file ke tombol aksi saja tanpa memicu re-render parsing isi kode.

---

### 3. Kebersihan Arsitektur & Bundle Size

#### A. Dead Code Monolitik Warisan (`workbenchFacade.ts`)

* **Lokasi**: `src/context/core/workbenchFacade.ts` (1.403 baris).
* **Temuan**: Setelah migrasi ke modular slice Zustand (ADR 0011), fungsi `useWorkbenchFacade` sudah tidak lagi dipanggil di mana pun dalam aplikasi. Berkas ini masih mengimpor banyak modul lama (`useChatCore`, `editorCore`, `gitCore`, dll.) dan hanya menyisakan 2 tipe interface yang dibutuhkan.
* **Solusi**: Ekstrak tipe antarmuka yang tersisa ke `src/types/workbench.ts` dan hapus berkas `workbenchFacade.ts` untuk memangkas beban static analysis dan menjaga kebersihan arsitektur.

#### B. Eager Loading `@xterm/xterm` di `BottomPanel.tsx`

* **Lokasi**: `src/components/layout/bottom-panel/BottomPanel.tsx` (baris 7).
* **Temuan**: `TerminalView` diimpor secara statis di level atas, sehingga modul `@xterm/xterm` dan addon-nya langsung masuk ke dalam initial bundle IDE meskipun panel bawah dalam keadaan tertutup.
* **Solusi**: Terapkan dynamic code-splitting via `React.lazy(() => import("./TerminalView"))` dan `Suspense`, sama seperti pola yang sudah berhasil diterapkan pada `ViewerPane.tsx`.

#### C. Pelepasan Resource Dokumen di `PdfViewer.tsx`

* **Lokasi**: `src/components/layout/editor/viewers/PdfViewer.tsx` (baris 63–71).
* **Temuan**: Fungsi cleanup memanggil `loadingTask.destroy()`, tetapi objek `pdfDocRef.current` (`PDFDocumentProxy`) tidak di-destroy secara eksplisit saat berganti file atau unmount (`pdfDocRef.current?.destroy()`).
* **Solusi**: Panggil `pdfDocRef.current?.destroy()` saat cleanup untuk melepaskan alokasi memori font dan worker data pada dokumen PDF berukuran besar.

---

### Ringkasan Rekomendasi Prioritas

| Prioritas | Item | Manfaat Utama |
| --- | --- | --- |
| **P0 (Kritis)** | `term.dispose()` di `TerminalView.tsx` | Menghentikan memory leak RAM pada terminal |
| **P0 (Kritis)** | Memoize / diff check `diagnostics` di `CodePane.tsx` | Menghilangkan lag/stutter saat mengetik di editor |
| **P1 (Tinggi)** | Perbaiki selektor `.cm-scroller` (hapus global DOM fallback) | Mencegah konflik event scroll pada split pane |
| **P1 (Tinggi)** | Filter subscription auto-save di `WorkbenchLifecycle.ts` | Mengurangi overhead CPU saat kursor bergerak |
| **P2 (Sedang)** | Decouple `activeTab` dari parsing markdown chat | Menghilangkan micro-freeze saat berpindah tab file |
| **P2 (Sedang)** | Lazy load `TerminalView` di `BottomPanel.tsx` | Mempercepat initial load dan memangkas ukuran bundle awal |
| **P3 (Rendah)** | Hapus dead code `workbenchFacade.ts` & destroy `PDFDocumentProxy` | Kebersihan kode dan pencegahan kebocoran memori PDF |