# Task Specification & Architecture Contract: Smooth AI Typing, Mermaid Rendering & Fullscreen Preview Modal

> **Dokumen Spesifikasi Teknis & Batasan Arsitektur**  
> Dibuat pada **Phase Analyze** oleh Kanna sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Fitur: **Smooth Stream**, **Mermaid Rendering with Safe Fallback**, dan **Mermaid Global Lightbox Modal (Option 2)**.

---

## 1. Feature Specifications

### 1.1 Smooth Adaptive Stream & Lightweight Markdown
- **Throttled Micro-Batching (`useSmoothStream`)**: Menggunakan timer 30ms (~33 FPS) untuk mengalirkan teks secara stabil, memberi jeda 30ms bagi event loop browser tanpa membebani thread UI.
- **Fast-Path Code Display Saat Streaming**: Selama `isStreaming: true`, blok kode ditampilkan sebagai teks monospace *pre-wrap* ringan (zero regex `tokenizeLine`), mengeliminasi 100% CPU freeze. Syntax highlighting lengkap diaktifkan instan begitu streaming selesai.

---

### 1.2 On-Demand Lazy Mermaid Rendering with Safe Fallback
- **Universal On-Demand Code Splitting**: Library `mermaid` di-load dinamis (`import("mermaid")`).
- **Strict Streaming Boundary**: `mermaid.render()` diproteksi ketat dengan `if (unclosed || isStreaming) return;`. Mermaid tidak menyentuh DOM sama sekali selama streaming berlangsung.
- **DOM Sanitization**: Menghapus elemen residu `#dmermaid` di `document.body` jika terjadi error sintaks, mencegah tabrakan *removeChild* dengan React 19.
- **Graceful Fallback**: Jika sintaks error, otomatis menampilkan raw code dengan badge penjelas kecil.

---

### 1.3 Mermaid Global Lightbox Modal with Pan & Zoom (Option 2)
- **Zero Storage Footprint**:
  - **0 Byte Disk**: Tidak membuat file `.mmd` fisik di workspace/folder pengguna, menjaga status Git tetap bersih.
  - **0 Byte Zustand State**: Tidak mengotori `openTabs`, `fileBuffers`, atau `localStorage`.
  - **Ephemeral Lifecycle**: Menggunakan React Portal (`createPortal` ke `document.body`) yang hanya dimuat saat `isModalOpen === true` dan langsung di-unmount/garbage-collected saat ditutup.
- **Interactive Pan & Zoom Canvas**:
  - Kanvas luas fullscreen (`fixed inset-0 z-50 bg-black/75 backdrop-blur-md`) dengan grid titik halus.
  - **Pan**: Drag dengan mouse/pointer untuk menggeser diagram ke segala arah.
  - **Zoom**: Scroll wheel mouse atau tombol `+` / `-` (skala 20% hingga 500%).
  - **Fit / Reset**: Tombol reset zoom kembali ke 100% atau auto-fit.
- **Action Toolbar**:
  - Judul / tipe diagram dengan icon badge.
  - Tombol indikator persentase zoom (`100%`) dan tombol reset (`<Icon name="fit-screen" />`).
  - Tombol **Copy Code** (`<Icon name="copy" />`) untuk menyalin kode Mermaid.
  - Tombol **Download SVG** (`<Icon name="cloud" />`) untuk menyimpan diagram sebagai file `.svg` ke komputer pengguna.
  - Tombol **Close** (`<Icon name="close" />`) atau tombol keyboard `Esc` untuk menutup seketika.

---

## 2. Invariants & Boundaries

1. **Zero Global Store Bloat**: Modal hidup murni sebagai local React state di level komponen UI, tidak menambah beban ke Zustand store.
2. **Keyboard Accessibility**: Menekan tombol `Esc` harus langsung menutup modal.
3. **Mandatory Gates**: Semua perubahan harus lulus `npm run build` dan `npm run format`.
