# Architecture Specification & Contract: Aegis Copilot Workspace Initialization (Combo 1 & 3)

> **Document Type**: Architecture & Engineering Specification  
> **Status**: DRAFT FOR REVIEW (Phase Analyze)  
> **Author**: Kanna (AI Assistant Interface) for Adit  
> **Target Subsystem**: `server/internal/agent`, `server/internal/api`, `src/utils/agentApi.ts`, `src/components/layout/chat`  
> **Core Principle**: Non-intrusive by default, interactive onboarding on chat discovery, contextual trigger on autonomous slash-commands (/plan, /goal), zero over-engineering.

---

## 1. Executive Summary & Problem Formulation

Saat ini, AegisCode mengasumsikan folder `.aegis/tasks/` dan berkas aturan `AGENTS.md` sudah tersedia di dalam workspace. Jika pengguna membuka workspace baru, repositori yang baru di-clone, atau folder kosong:
1. **Tidak Ada Scaffolding Otomatis**: Folder `.aegis/` tidak ada, sehingga pemanggilan API `/api/v1/agent/tasks` mengembalikan daftar kosong dan `ChatWaveStepper` tidak dapat menampilkan progress wave.
2. **Ketiadaan Panduan di UI**: Pengguna tidak mengetahui mengapa autonomous workflow (Spec ➔ Plan ➔ Waves ➔ Log) tidak berjalan atau bagaimana cara mengaktifkannya.
3. **Risiko Polusi Repositori**: Jika sistem langsung membuat folder `.aegis/` tanpa konfirmasi, repository git pengguna akan langsung kotor dengan berkas untracked.

### Solusi Terpilih: Kombinasi Opsi 1 (Interactive Onboarding Banner) & Opsi 3 (Contextual Command Scaffolding)
- **Chat Onboarding Banner**: Ketika chat dibuka pada workspace yang belum diinisialisasi, muncul banner bersahabat di bagian atas chat dengan tombol `[⚡ Initialize Copilot]`.
- **Contextual Command Scaffolding**: Jika user mengabaikan banner dan langsung mengetik perintah autonomous (seperti `/plan`, `/goal`, atau klik "New Task"), Copilot mendeteksi ketiadaan `.aegis/` dan memunculkan modal inisialisasi kontekstual sebelum mengeksekusi task.
- **Explicit Scaffolding Engine**: Menghasilkan struktur rapi:
  ```text
  .aegis/
  ├── AGENTS.md        (Persona default: Kanna / Architect / Minimalist)
  ├── config.json      (Setelan preferensi Copilot lokal)
  └── tasks/           (Direktori task waves)
  ```
  Serta menawarkan opsi satu-klik untuk menambahkan `.aegis/` ke `.gitignore`.

---

## 2. Backend Architecture & API Contract

### 2.1 Workspace Status Detection
- **Endpoint**: `GET /api/v1/agent/workspace-status`
- **Response**:
```json
{
  "isInitialized": false,
  "hasAegisDir": false,
  "hasTasksDir": false,
  "hasAgentsMd": false,
  "rulesPath": "",
  "activePersona": "kanna",
  "taskCount": 0
}
```

### 2.2 Workspace Initialization API
- **Endpoint**: `POST /api/v1/agent/init-workspace`
- **Request Payload**:
```json
{
  "preset": "kanna",
  "addToGitignore": true,
  "createSampleTask": false
}
```
- **Handler Actions**:
  1. Validasi keberadaan root workspace aktif (`s.ws.GetRoot()`).
  2. Buat folder `<root>/.aegis/` dan `<root>/.aegis/tasks/` dengan izin `0755`.
  3. Buat `<root>/.aegis/AGENTS.md` (atau `<root>/AGENTS.md` jika dipilih) menggunakan template preset pilihan.
  4. Tulis `<root>/.aegis/config.json` dengan konfigurasi dasar workspace.
  5. Jika `addToGitignore` bernilai `true`, periksa apakah file `.gitignore` ada di root; jika ada, tambahkan `.aegis/` (jika belum ada) secara idempotent.
  6. Siarkan event via EventHub topic `"copilot"`: `eventType: "workspace_initialized"`.
- **Response**:
```json
{
  "success": true,
  "aegisPath": "/path/to/workspace/.aegis",
  "agentsPath": "/path/to/workspace/.aegis/AGENTS.md",
  "gitignored": true
}
```

---

## 3. Frontend Architecture & State Management

### 3.1 Store & Lifecycle Integration (`createChatSlice.ts` / `agentApi.ts`)
1. **API Client (`src/utils/agentApi.ts`)**:
   - `fetchWorkspaceStatus(): Promise<WorkspaceCopilotStatus>`
   - `initWorkspaceCopilot(options: InitWorkspaceOptions): Promise<InitWorkspaceResponse>`
2. **State Slice**:
   - `isCopilotInitialized: boolean | null`
   - `checkCopilotStatus: () => Promise<void>`
   - `isInitModalOpen: boolean`
   - `setInitModalOpen: (open: boolean) => void`
3. **Event Hub Listener**:
   - Langsung me-refresh status ketika menerima event `"workspace_initialized"`.

### 3.2 UI Component Breakdown
1. **`CopilotInitBanner.tsx`**:
   - Tampil di header atau tepat di atas `ChatMessageList` ketika `isCopilotInitialized === false`.
   - Menampilkan icon Aegis, teks ringkas `"Workspace not configured for Aegis Copilot"`, dan tombol aksen `"Set Up Copilot"`.
2. **`CopilotInitModal.tsx`**:
   - Modal dialog anggun dengan token semantic Tailwind v4:
     - Pilihan Persona Preset (Kanna - Creative & Friendly, Senior Architect - Formal, Minimalist Hacker).
     - Checkbox: `Add .aegis/ to .gitignore`.
     - Tombol konfirmasi: `Initialize Workspace`.
3. **Contextual Command Interceptor**:
   - Di dalam `ChatComposer.tsx`, ketika user mengirim `/plan` atau `/goal` sementara workspace belum diinisialisasi:
     - Tangkap sebelum submit, tahan prompt, buka `CopilotInitModal`.
     - Setelah inisialisasi selesai, lanjutkan proses pembuatan task tanpa mengharuskan user mengetik ulang.

---

## 4. Invariants & Verification Gates

1. **Semantic Design Tokens**: Tidak ada warna hex mentah (gunakan `bg-surface`, `border-line`, `text-ink`, `bg-accent`, dll.).
2. **Preserve Existing Rules**: Jika sudah ada `AGENTS.md` di root workspace, sistem tidak boleh menimpa file tersebut kecuali diizinkan secara eksplisit.
3. **Fail-Fast Backend**: Validasi path traversal pada workspace root, error ditangani secara linear dan lugas.
4. **100% English UI Labels & Code**: All UI strings, banner copy, modal labels, buttons, tooltips, error messages, and code comments must strictly use professional, polished English.
5. **Mandatory Gates**:
   - `npm run build` (0 error)
   - `npm run format` (oxfmt)
   - `rtk go test ./...` (semua backend tests pass)
   - `rtk npm run test:frontend` (semua frontend tests pass)
