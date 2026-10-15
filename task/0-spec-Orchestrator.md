# Task Specification & Architecture Contract: Status Bar Git Branch Popover Layout & Design Overhaul

> **Dokumen Spesifikasi Teknis & Batasan Arsitektur**  
> Dibuat pada **Phase Analyze** oleh Master Orchestrator (Kanna) sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Menangani perbaikan layout dan desain visual elemen branch list di `div.status-popover.branch-popover` (`div.max-h-48.overflow-y-auto.py-1`).

---

## 1. Executive Summary & Problem Statement

- **Target Component:** `src/components/layout/status-bar/BranchPopover.tsx` & `src/components/layout/status-bar/status-bar.css`
- **Symptom:** Di status bar, popover Git Switch Branch (`div.status-popover.branch-popover`) pada bagian daftar branch (`div.max-h-48.overflow-y-auto.py-1`) memiliki tampilan dan layout yang rusak / unstyled. Tombol item branch tidak memiliki tinggi yang konsisten, alignment icon dan badge tidak rapi, dan styling input filter serta form pembuatan branch baru masih mengandalkan utility inline yang tidak kohesif.
- **Root Cause:**
  1. Di [`src/components/layout/status-bar/status-bar.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/status-bar/status-bar.css#L133-L150), styling popover menggunakan selektor anak langsung:
     ```css
     .status-popover > button:not(.status-popover-header button) { ... }
     .branch-popover > button { ... }
     ```
     Namun di [`BranchPopover.tsx`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout/status-bar/BranchPopover.tsx#L73-L91), daftar tombol branch dibungkus di dalam `<div className="max-h-48 overflow-y-auto py-1">`. Karena bukan anak langsung (`>`), CSS rules tersebut **tidak pernah terpanggil / tidak berlaku** pada tombol item branch.
  2. Item branch tidak memiliki class name semantik (`.branch-list`, `.branch-item`), sehingga tampil sebagai button HTML mentah tanpa flex alignment, hover states yang halus, atau font hierarchy.
  3. Badge status branch (`current`, `remote`) hanya berupa tag `<small>` tanpa styling badge yang selaras dengan theme tokens AegisCode.
  4. Input filter search dan form "Create new branch" masih menggunakan inline Tailwind classes mentah tanpa kelas semantik co-located di `status-bar.css`.

---

## 2. Invariants & Architectural Boundaries

1. **Co-located CSS (Frontend Constraint #3)**:
   - Seluruh styling visual status bar branch popover didefinisikan secara rapi di `src/components/layout/status-bar/status-bar.css`.
2. **Reuse Tailwind Tokens (Frontend Constraint #1)**:
   - Memanfaatkan semantic tokens (`var(--color-canvas)`, `var(--color-surface)`, `var(--color-line)`, `var(--color-accent)`, `var(--color-ink)`, dll.). Zero hardcoded hex colors.
3. **Preserve Selectors & Functionality (Frontend Constraint #4)**:
   - Mempertahankan fungsionalitas checkout branch (`checkoutBranch(b.name)`), filter search, pembuatan branch baru (`createBranch`), dan metadata ahead/behind.
4. **Prime Directive**:
   - Layout rapi, responsif, dan ergonomis ala VS Code / modern IDE.

---

## 3. Remediation Technical Plan

### A. Modifikasi `src/components/layout/status-bar/BranchPopover.tsx`
1. Berikan class semantik pada kontainer daftar branch: `<div className="branch-list">` (menggantikan utility inline `max-h-48 overflow-y-auto py-1`).
2. Berikan class `.branch-item` pada tombol branch dan gunakan badge semantik:
   ```tsx
   <button
     className={`branch-item ${activeBranch === b.name ? "popover-row-active" : ""}`}
     key={b.name}
     onClick={() => { ... }}
     type="button"
   >
     <Icon name="branch" size={13} />
     <span className="truncate flex-1">{b.name}</span>
     {activeBranch === b.name && <span className="branch-badge-current">current</span>}
     {b.isRemote && <span className="branch-badge-remote">remote</span>}
   </button>
   ```
3. Sematkan class semantik pada filter container (`.branch-filter-container`, `.branch-filter-input`) dan create branch section (`.branch-create-section`, `.branch-create-trigger`, `.branch-create-form`, `.branch-create-input`, `.branch-create-submit`).

### B. Modifikasi `src/components/layout/status-bar/status-bar.css`
1. Definisikan `.branch-popover`: lebarkan sedikit (`width: 340px`) agar nama branch panjang tidak terpotong.
2. Definisikan `.branch-filter-container` dan `.branch-filter-input` dengan focus ring aksen.
3. Definisikan `.branch-list` (`max-height: 200px; overflow-y: auto; padding: 4px; display: flex; flex-direction: column; gap: 2px;`).
4. Definisikan `.branch-item`:
   - `height: 28px; padding: 0 8px; display: flex; align-items: center; gap: 8px; border-radius: 4px;`
   - Hover state lembut (`background: var(--color-surface-hover)`)
   - Active state (`.popover-row-active`) dengan background `var(--color-accent-soft)` dan teks/icon `var(--color-accent)`.
5. Definisikan `.branch-badge-current` dan `.branch-badge-remote` dengan warna aksen dan border yang estetik.
6. Definisikan `.branch-create-section` dan kontrol form pembuatan branch baru.
7. Rapikan `.branch-meta` dengan background kanvas kontras dan tipografi informasi ahead/behind yang presisi.

---

## 4. Quality & Verification Gates

Eksekusi wajib mematuhi gerbang validasi berikut:
1. `rtk npm run build` (0 error Vite build)
2. `rtk npm run format` (oxfmt clean)
3. `rtk npm run test:frontend` (304 unit tests lolos)
