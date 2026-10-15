# Micro-Phase Execution & Verification Plan Table: Polite CPU Capping & Indexing Observability

> **Referensi Perencanaan & Delegasi Orchestrator / Sub-Agent**  
> Mengatur dekonstruksi perbaikan CPU Capping dan Indexing Telemetry ke dalam **Wave Architecture** (Linear vs Parallel) dan **Atomic Micro-Phases**. Terhubung 1:1 dengan runtime log pada [`task/0-log-phase.md`](0-log-phase.md).
> SELALU REWRITE JIKA TIDAK RELEVAN. ARTINYA DOCS INI BERLAKU HANYA SATU OBJECTIVE

---

## 1. Aturan Sinkronisasi Relasional

- **Wave Ref**: Merujuk langsung ke Wave ID (`W-1`, `W-2`, `W-3`) pada tabel arsitektur.
- **Micro-Phase ID**: Format `MP-<Wave>.<SubStep>` (contoh: `MP-1.1`, `MP-1.2`).
- **Dynamic GAP Injection**: Jika muncul GAP atau blocker saat eksekusi/validasi di `task/0-log-phase.md`, baris baru dengan format `MP-<Wave>.<SubStep>-FIX` wajib ditambahkan ke tabel di bawah ini sebelum Wave berikutnya dimulai.
- **Status Lifecycle**: `PENDING` | `IN_PROGRESS` | `BLOCKED` | `PASSED`.

---

## 2. Dependency Map & Parallel Paths (Wave Architecture)

| Wave ID | Wave Name / Scope | Execution Topology (Linear / Parallel) | Prerequisites (Blockers) | Primary Objective | Readiness Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `W-1` | Backend CPU Capping, Telemetry & Stats Endpoint | Linear | None | Terapkan batas core `NumCPU - 1` pada chunking indeks, tambahkan field `Status` pada `IndexStats`, dan ekspos `GET /api/v1/workspace/index/stats`. | `PASSED` |
| `W-2` | Frontend Workspace API Helper & Status Bar Observability | Linear | `W-1` must be `PASSED` | Tambahkan `fetchIndexStats` di `workspaceApi.ts` dan integrasikan item status indeks pada `StatusBar.tsx`. | `PASSED` |
| `W-3` | System Verification Gates & Zero Error Sign-Off | Linear | `W-2` must be `PASSED` | Memastikan build, oxfmt format, backend tests, dan frontend vitest lolos 100%. | `PASSED` |

---

## 3. Micro-Phase Execution & Field Verification Status Table

### Legend Klasifikasi ID:
- `OP` : Optimization / Resource Allocation
- `MF` : Micro Feature / Telemetry
- `UI` : User Interface & Observability
- `GATE`: Verification Gate

| Micro-Phase ID | Wave Ref | Track & Execution Nature | Target File(s) (File Isolation) | Resolved Issue / Feature ID(s) | Atomic Execution Steps | Verification Gate (Smoke Test) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `MP-1.1` | `W-1` | Backend / Workspace Index | `server/internal/workspace/index.go` | `OP-INDEX-01`, `MF-INDEX-01` | Batasi alokasi core pada `FuzzyFind` menjadi `max(1, runtime.NumCPU() - 1)`, tambahkan field `Status` (`idle`, `indexing`, `ready`) pada `IndexStats`, dan set status saat `rebuild()`. | `rtk go -C server test -v ./internal/workspace/...` | `PASSED` |
| `MP-1.2` | `W-1` | Backend / API Handlers | `server/internal/api/api.go` | `MF-INDEX-02` | Daftarkan rute `GET /api/v1/workspace/index/stats` untuk mengembalikan `IndexStats` dan sertakan fallback aman jika index bernilai nil. | `rtk go -C server test -v ./internal/api/...` | `PASSED` |
| `MP-1.3` | `W-1` | Backend / Unit Tests | `server/internal/workspace/index_test.go`, `server/internal/api/api_test.go` | `GATE-01` | Tambahkan pengujian unit untuk verifikasi alokasi CPU dan endpoint stats. | `rtk go -C server test -v ./internal/workspace/... ./internal/api/...` | `PASSED` |
| `MP-2.1` | `W-2` | Frontend / API Helper | `src/utils/workspaceApi.ts` | `MF-UI-01` | Definisikan interface `WorkspaceIndexStats` dan fungsi `fetchWorkspaceIndexStats()`. | `rtk npm run test:frontend` | `PASSED` |
| `MP-2.2` | `W-2` | Frontend / Status Bar | `src/components/layout/status-bar/StatusBar.tsx`, `IndexStatusPill.tsx` | `UI-INDEX-01` | Tampilkan status item indeks di status bar dengan SVG `Icon`, total berkas terindeks, dan tooltip informatif. | `rtk npm run test:frontend` | `PASSED` |
| `MP-3.1` | `W-3` | System / Gatekeeper | Codebase wide | `GATE-02` | Jalankan verifikasi menyeluruh: `rtk npm run format`, `rtk npm run build`, `rtk go test ./...`, dan `rtk npx vitest run`. | `rtk npm run build && rtk npm run format` | `PASSED` |