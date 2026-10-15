# Micro-Phase Execution & Verification Plan Table: Status Bar Git Branch Popover Layout & Design Overhaul

> **Referensi Perencanaan & Delegasi Master Orchestrator (Kanna)**  
> Mengatur dekonstruksi perbaikan layout dan desain visual elemen Git branch popover di status bar.  
> Terhubung 1:1 dengan runtime log pada [`task/0-log-phase.md`](0-log-phase.md) dan kontrak spesifikasi pada [`task/0-spec-Orchestrator.md`](0-spec-Orchestrator.md).

---

## 1. Aturan Sinkronisasi Relasional

- **Wave Ref**: Merujuk langsung ke Wave ID (`W-1`).
- **Micro-Phase ID**: Format `MP-<Wave>.<SubStep>` (contoh: `MP-1.1`, `MP-1.2`).
- **Status Lifecycle**: `PENDING` | `IN_PROGRESS` | `BLOCKED` | `PASSED`.

---

## 2. Dependency Map & Parallel Paths (Wave Architecture)

| Wave ID | Wave Name / Scope | Execution Topology (Linear / Parallel) | Prerequisites (Blockers) | Primary Objective | Readiness Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `W-1` | Branch Popover Semantic Layout & CSS Design | Linear | Phase Analyze approved | Berikan kelas semantik pada `BranchPopover.tsx`, implementasikan styling CSS lengkap di `status-bar.css`, dan jalankan validation gates. | `PASSED` |

---

## 3. Micro-Phase Execution & Field Verification Status Table

### Legend Klasifikasi ID:
- `TSX` : React Component Semantic Refactoring
- `CSS` : CSS Styling & Design Tokens
- `GATE`: Verification Gate

| Micro-Phase ID | Wave Ref | Track & Execution Nature | Target File(s) (File Isolation) | Resolved Scope | Atomic Execution Steps | Verification Gate (Smoke Test) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `MP-1.1` | `W-1` | Frontend / TSX & CSS | `src/components/layout/status-bar/BranchPopover.tsx`, `src/components/layout/status-bar/status-bar.css` | `BRANCH-POPOVER-DESIGN` | 1. Di `BranchPopover.tsx`, ganti inline utilities dengan kelas semantik (`.branch-list`, `.branch-item`, `.branch-badge-current`, `.branch-filter-container`, dll.).<br/>2. Di `status-bar.css`, tambahkan CSS lengkap untuk `.branch-list`, `.branch-item`, hover/active states, badge, filter input, dan form pembuatan branch baru. | `rtk npm run build` | `PASSED` |
| `MP-1.2` | `W-1` | System / Gatekeeper | Codebase wide | `GATE-ALL` | Jalankan verifikasi menyeluruh: `rtk npm run build` (0 error), `rtk npm run format` (oxfmt clean), dan `rtk npm run test:frontend` (304 tests passed). | `0 build errors & clean formatting` | `PASSED` |