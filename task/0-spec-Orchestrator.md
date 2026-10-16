# Specification: Minimap Synchronization, Windowing & Rendering Accuracy

> **Document Type**: Architecture & Component Boundary Specification (Phase 6)  
> **Target**: Minimap Component (`Minimap.tsx`), CodePane (`CodePane.tsx`), and CodeMirror Integration (`CMEditor.tsx`)  
> **Status**: SPECIFIED & PENDING EXECUTION  
> **Author**: Shun for Adit-sensei  

---

## 1. Problem Statement & Root Cause Analysis

### 1.1 "Tidak Sesuai dengan Isi Code" (Token Cache Zombie & Content Desync)
- **Root Cause**: `tokenCacheRef` di `Minimap.tsx` adalah instance `useRef<Map<number, RawSyntaxToken[]>>` yang tidak memiliki file namespace, tidak di-reset saat file berganti, dan tidak mencocokkan hash/isi baris teks.
- **Dampak**: Berpindah file menyebabkan minimap menampilkan potongan token dari file sebelumnya pada indeks baris yang sama. Mengedit kode membuat baris yang diedit tetap menampilkan token usang. Jika token belum siap, minimap hanya menampilkan skeleton bar horizontal abu-abu tanpa teks.

### 1.2 "Seperti Kepotong" (Windowing Height Collapse & Horizontal Monospace Truncation)
- **Root Cause**: `scrollInfo` di `CodePane.tsx` diinisialisasi ke `{ scrollTop: 0, scrollHeight: 1, clientHeight: 1 }`. `useEffect(..., [filename])` mencari `.cm-scroller` via `querySelector`, yang bernilai `null` saat file baru dibuka atau saat buffer masih berstatus `"loading"`.
- **Dampak**: `clientHeight` bernilai 1. Formula windowing di `Minimap.tsx` menghitung `visibleEnd = Math.ceil((0 + 1) / lineHeight) + 15 = 16`. Minimap hanya merender 16 baris dan memotong sisa file secara vertikal.

### 1.3 "Tidak Sync dengan Code" (Scroller Listener Race & Slider Mathematics Drift)
- **Root Cause 1**: Karena `.cm-scroller` bernilai `null` saat buffer loading, listener scroll tidak pernah terpasang. Scrolling di editor tidak memperbarui `scrollInfo`.
- **Root Cause 2**: Rumus `sliderHeightPx = (clientHeight / scrollHeight) * clientHeight` menggunakan kuadrat clientHeight, bukannya merefleksikan tinggi viewport pada skala minimap (`(clientHeight / scrollHeight) * totalMinimapHeight`). Kotak slider bergerak dengan kecepatan yang berbeda dari konten minimap yang sedang bergeser.
- **Root Cause 3**: Pemanggilan scroll saat minimap diklik (`handleScrollToLine`) menggunakan estimasi kasar `lineIndex * editorLineHeight - 60` yang melenceng pada file dengan word-wrap atau font sizing berbeda.

---

## 2. Invariants & Architecture Contracts

### Invariant `MINIMAP-01`: Event-Driven CodeMirror Scroll Metrics
- `CMEditor` wajib memancarkan metrik scroll langsung dari CodeMirror (`view.scrollDOM` / event `scroll` dan initial layout) melalui prop `onScroll?: (info: { scrollTop: number; scrollHeight: number; clientHeight: number }) => void`.
- `CodePane` tidak boleh bergantung pada polling atau single-shot `querySelector` yang rentan race condition saat buffer berstatus `"loading"`.

### Invariant `MINIMAP-02`: File & Content Aware Token Cache
- `Minimap` wajib menerima prop `filename: string`.
- Setiap kali `filename` berubah, `tokenCacheRef` wajib di-reset (`clear()`).
- Cache baris wajib mencocokkan string baris asli (`{ text: string, tokens: RawSyntaxToken[] }`). Jika baris diedit, entri lama dianggap usang dan di-retokenize.
- Saat token belum tersedia dari worker, `Minimap` wajib merender `lineText` asli secara langsung dengan micro-font styling yang rapi, bukan skeleton bar kosong, sehingga kode selalu terlihat 100% instan.

### Invariant `MINIMAP-03`: Precise 1:1 Viewport Slider & Offset Alignment
- Tinggi viewport slider wajib dihitung dari proporsi dokumen terhadap total tinggi minimap:
  $$\text{sliderHeightPx} = \max\left(20, \min\left(\text{containerHeight}, \frac{\text{clientHeight}}{\text{scrollHeight}} \times \text{totalMinimapHeight}\right)\right)$$
- Saat dokumen melebihi tinggi container (`totalMinimapHeight > containerHeight`), pergeseran minimap (`minimapOffsetY`) dan posisi slider (`sliderTopPx`) wajib diselaraskan secara proporsional sehingga kotak slider membingkai baris yang sedang terlihat di CodeMirror.

### Invariant `MINIMAP-04`: Safe Container Height via Self-Measurement
- `Minimap` mengukur tinggi container-nya sendiri menggunakan `ResizeObserver` atau `getBoundingClientRect()`, sehingga jika `clientHeight` dari luar sempat bernilai default (1px), tampilan minimap tidak kolaps.

### Invariant `MINIMAP-05`: Native CodeMirror `scrollToLine` via `CMEditorHandle`
- `CMEditorHandle` mengekspos fungsi imperatif `scrollToLine: (lineIndex: number, smooth?: boolean) => void` yang menggunakan `EditorView.scrollIntoView()` bawaan CodeMirror 6.
- Klik atau drag pada Minimap memanggil delegasi ini secara presisi tanpa estimasi piksel kasar.

---

## 3. Component Boundary & Data Flow

```mermaid
flowchart TD
    CM["CMEditor.tsx<br/>(EditorView.scrollDOM)"] -->|onScroll({scrollTop, scrollHeight, clientHeight})| CP["CodePane.tsx<br/>(Maintains scroll state)"]
    CP -->|filename, lines, scrollTop, scrollHeight, clientHeight| MM["Minimap.tsx<br/>(Self-resizing, content-aware)"]
    MM -->|onScrollToLine(targetLine)| CP
    CP -->|editorRef.current.scrollToLine(targetLine)| CM
```

---

## 4. Verification Criteria
1. Buka file apa saja: Minimap langsung menampilkan baris kode dari baris 1 sampai akhir file tanpa terpotong pada baris 16.
2. Ganti tab file: Minimap langsung menampilkan kode file yang baru tanpa ada sisa token/teks dari file sebelumnya.
3. Edit kode pada baris tertentu: Minimap langsung menampilkan perubahan pada baris tersebut.
4. Scroll CodeMirror: Slider box dan teks minimap bergerak mulus dan selalu sinkron membingkai baris yang sedang aktif terlihat di layar.
5. Klik baris pada minimap: CodeMirror langsung melompat ke baris yang diklik secara presisi.
6. Verification Gates: `npm run build`, `npm run format`, dan `npm run test:frontend` lulus 100% dengan 0 error.
