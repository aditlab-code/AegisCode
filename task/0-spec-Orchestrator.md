# Task Specification & Architecture Contract: Polite CPU Core Capping & Workspace Indexing Telemetry

> **Dokumen Spesifikasi Teknis & Batasan Arsitektur**  
> Dibuat pada **Phase Analyze** oleh Master Orchestrator sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Berisi kontrak batas sistem, batasan konkurensi CPU, dan transparansi status indexing AegisCode.

---

## 1. Executive Summary & Problem Statement

- **Task Name**: Polite CPU Allocation (`NumCPU - 1`), Smart Cache Validation, and Indexing Observability
- **Target Boundaries**:
  - **Backend Workspace Index Engine** (`server/internal/workspace/index.go`, `server/internal/workspace/index_test.go`)
  - **Workspace API & Telemetry Contract** (`server/internal/api/api.go`)
  - **Frontend Status Bar Telemetry** (`src/components/layout/status-bar/StatusBar.tsx`, `src/utils/workspaceApi.ts`)
- **Primary Goal**:
  1. Mencegah *CPU starvation* dan *fan noise storm* ekstrem saat pertama kali membuka repositori besar dengan mengalokasikan maksimal `NumCPU - 1` core (menyisakan minimal 1 core penuh untuk OS dan thread interaktif).
  2. Memastikan pemindaian inkremental berbasis `mtime` + `size` bekerja secara instan tanpa re-parse redundan.
  3. Memberikan transparansi visual di antarmuka (Status Bar) sehingga pengguna mengetahui kapan proses pengindeksan berjalan dan berapa jumlah berkas yang telah dipetakan.
- **Risk Level**: Low (Hanya menyentuh alokasi worker pool Go dan telemetry status bar tanpa mengubah format data storage).

---

## 2. Invariants & Architectural Boundaries

1. **CPU Allocation Invariant**:
   - Jumlah goroutine paralel untuk pemrosesan teks atau chunking indeks **TIDAK BOLEH** melebihi `runtime.NumCPU() - 1` (kecuali pada mesin 1 core, gunakan fallback 1 core).
   - Menjamin 1 core CPU selalu tersedia untuk OS window manager, terminal PTY, dan rendering CodeMirror 60 FPS.
2. **Stateless / In-Memory Safety**:
   - `WorkspaceIndex` tetap thread-safe menggunakan `sync.RWMutex`.
   - Pembacaan metrik tidak boleh memblokir operasi penulisan file aktif.
3. **Frontend Token & Primitive Compliance**:
   - Indikator status bar menggunakan semantic Tailwind tokens (`text-ink-muted`, `bg-surface`, `border-line`).
   - Gunakan SVG `Icon` primitive dari `src/components/ui/Icon.tsx`.

---

## 3. Detailed Specifications & Implementation Plan

### A. Core Allocation Capping (`server/internal/workspace/index.go`)
- Perbarui alokasi worker di `FuzzyFind`:
  ```go
  numCPU := runtime.NumCPU() - 1
  if numCPU < 1 {
      numCPU = 1
  }
  ```
- Tambahkan status siklus hidup indeks: `Status` (`idle`, `indexing`, `ready`) pada `IndexStats`.

### B. Indexing Telemetry Endpoint (`server/internal/api/api.go`)
- Tambahkan endpoint `GET /api/v1/workspace/index/stats` atau sertakan dalam `GET /api/v1/workspace/info` yang mengembalikan `IndexStats` (status, totalFiles, indexDurationMs).

### C. Status Bar Observability (`src/components/layout/status-bar/StatusBar.tsx`)
- Tampilkan indikator status indeks yang halus (misal `⚡ {totalFiles} files` atau `⚡ Indexing...` saat sedang memindai).
- Tooltip informatif saat hover yang menampilkan durasi indexing dan status cache.

---

## 4. Verification & Quality Gates

- `rtk go test ./internal/workspace/...` (Must pass with 0 errors)
- `rtk npm run test:frontend` (All Vitest suites pass)
- `rtk npm run build` (0 warnings/errors)
- `rtk npm run format` (oxfmt formatting clean)
