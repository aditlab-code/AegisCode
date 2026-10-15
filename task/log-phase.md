# Log Phase Orchestrator Tracking

> **Sistem Tracking Eksekusi Phase & Backlog Agent Orchestrator**  
> Digunakan oleh Master Orchestrator dan Sub-Agent untuk mencatat progress, state transition, keputusan arsitektur, dan backlog thinking secara real-time.

---

## 1. Log Eksekusi & State Transition

| Log ID | Track atau Komponen | Event Trigger | Log Level | Target Output | Summary |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **LOG-001** | `Audit/Master` | Inisiasi Verifikasi `pr-Master-Issues.md` | `INFO` | Verifikasi 36 Issue & 9 Dead Code | Melakukan inspeksi statis menyeluruh ke seluruh berkas `src/`, `server/`, dan styling `*.css`. |
| **LOG-002** | `Audit/Discovery` | Temuan Status Aktual Codebase | `AUDIT` | Klasifikasi Status & Temuan Baru | Menemukan: 6 issue sudah selesai (`LSP-02`, `DBG-01`, `EXT-01`, `EXT-02`, `BP-05`, `DC-08`), 3 sebagian (`EXT-03`, `HD-01`, `DC-09`), 27 aktif, dan 3 bug baru (`NEW-01`, `NEW-02`, `NEW-03`). |
| **LOG-003** | `Docs/Master-Issues` | Pembaruan `pr-Master-Issues.md` | `SYNC` | Dokumen Audit Terverifikasi | Memperbarui `task/pr-Master-Issues.md` dengan status lapangan per 14 Okt 2026 dan menambahkan 3 bug baru. |
| **LOG-004** | `Docs/Table-Phase` | Penandaan `Table-Phase.md` | `SYNC` | Peta Wave & Micro-Phase | Menandai kesiapan eksekusi: MP-2.1 selesai, MP-1.1 s/d MP-1.3 siap jalan paralel di Wave 1. |
| **LOG-005** | `Orchestrator/Init` | Kesiapan Orkestrasi Wave 1 | `READY` | Wave 1 Parallel Execution Plan | Menginisialisasi Wave 1 (MP-1.1 Store, MP-1.2 Lifecycle, MP-1.3 Backend Go) sebagai target eksekusi pertama. |
| **LOG-006** | `Delegation/Wave1` | Dispatch 3 Sub-Agents Paralel | `DISPATCH` | MP-1.1, MP-1.2, MP-1.3 Subagents | Memulai eksekusi serentak untuk Store Track, Lifecycle Track, dan Backend Go Track. |
| **LOG-007** | `Wave1/Complete` | Penyelesaian Wave 1 & Integrasi | `SUCCESS` | MP-1.1, MP-1.2, MP-1.3 Selesai | Seluruh track Wave 1 selesai dan diverifikasi: Go tests (60 passed), Vitest (243 passed), build (0 error), format clean. Kesiapan penuh menuju Wave 2. |
| **LOG-008** | `Server/Workspace` | Perbaikan Workspace Resolution & Layout 2-Layer | `FIX` | Auto Workspace Discovery & Direct Mount | 1. Memasang fallback otomatis WORKSPACE_ROOT di dev-all.js dan main.go agar server Go langsung membuka proyek AegisCodev2.<br>2. Merampingkan pembungkus CodeMirror 6 menjadi 2 layer bersih.<br>3. Menyelaraskan embedded web assets di internal/web/dist. |
| **LOG-009** | `Editor/PathResolution` | Perbaikan Fatal CodePane, Path Fallback & Keep-Alive | `RESOLVED` | Zero-Error Render & Code Visibility | 1. Memperbaiki ReferenceError ensureFileBuffer di CodePane.<br>2. Menambahkan resolusi cerdas path file di subfolder (src/App.tsx) agar buffer terisi.<br>3. Menghubungkan cwd terminal ke rootWorkspacePath.<br>4. Memperbaiki keep-alive proxy SSE di vite.config.ts agar browser tidak infinite reload. |
| **LOG-010** | `Network/Buffer` | Formalisasi Solusi Arsitektur ADR-0016 | `SPEC` | Dokumen Solusi & Rencana Micro-Phase | Merumuskan `task/pr-issues-socket-buffer-lifecycle.md` dan menambahkan sub-jalur `MP-1.4` ke `Table-Phase.md` serta `pr-Master-Issues.md`. |
| **LOG-011** | `Orchestrator/WavePrep` | Kesiapan Orkestrasi Wave Lanjutan | `READY` | Wave 1 Completion (MP-1.4) & Wave 2 Setup | Menyiapkan rencana eksekusi paralel untuk penutupan tuntas Wave 1 (MP-1.4) dan kick-off Wave 2. |
| **LOG-012** | `Delegation/Wave1-MP1.4` | Dispatch 3 Sub-Agents Paralel MP-1.4 | `DISPATCH` | Backend Go, Frontend Network, Store Subagents | Memulai eksekusi paralel terisolasi untuk penyatuan SSE Event Hub, client lifecycle, dan single-key canonical buffer. |
| **LOG-013** | `Wave1/FullComplete` | Wave 1 Selesai Penuh (MP-1.1 s/d MP-1.4) | `SUCCESS` | MP-1.4 Terverifikasi & Wave 1 Tuntas | 1. Backend Go `EventHub` aktif di `GET /api/v1/events` (191 tests passed).<br>2. Client `WorkbenchEventHub.ts` aktif, 600ms delay dihapus.<br>3. `fileBuffers` single-key kanonikal, JIT tab loading, dan `workspaceEpoch` guard terpasang (244 tests passed, 0 build error). |
| **LOG-014** | `Wave2/Complete` | Penyelesaian Wave 2 (MP-2.1 s/d MP-2.3) | `SUCCESS` | CM6 Langs, Linter & LSP Client Selesai | 1. Syntax C++/Rust (`@codemirror/lang-cpp`, `@codemirror/lang-rust`) aktif di `cmTheme.ts`.<br>2. Binary runner cross-platform & compiler split di `terminalRunCommand.ts`.<br>3. Multi-line parenthesis tracker di `validatePython`.<br>4. Client helpers `notifyLspDidSave`/`close`/`symbols` di `lspApi.ts`.<br>5. LSP single-socket SSE di `WorkbenchLifecycle.ts`. (244 tests passed). |
| **LOG-015** | `Wave3/Complete` | Penyelesaian Wave 3 (MP-3.1 s/d MP-3.4) | `SUCCESS` | Workbench UI Consumers Terverifikasi Penuh | 1. MP-3.1 Editor Chrome: Pinned tabs persistence & close filter, selection bridge ke chat context, breadcrumbs `{ line, col: 1 }` (6 tests passed).<br>2. MP-3.2 Sidebar Explorer & Search: Eliminasi header ganda, nested create with parentFolder, context menu New File/Folder, `isSubmittingRef` guard, flex scroll search (10 tests passed).<br>3. MP-3.3 Sidebar Git & Debug: Modal branch switch interaktif, AI commit context files, eliminasi sorotan kuning pada breakpoint biasa, expand variabel debug (7 tests passed).<br>4. MP-3.4 Bottom Panel & Chat: Output logs startup bersih, dropdown shell Windows, REPL console graceful local scope, validasi API keys 5 AI provider (9 tests passed).<br>Verifikasi terpadu: 283 Vitest tests passed, Go tests 191 passed, 0 build errors, 160 files formatted. |
| **LOG-016** | `Wave4/Complete` | Penyelesaian Wave 4 (MP-4.1 s/d MP-4.3) | `SUCCESS` | Dead Code Purged & Full Gates Passed | 1. MP-4.1: Menghapus 3 berkas core warisan (`editorCore.ts`, `settingsCore.ts`, `workspaceCore.ts` total 2.211 baris) setelah migrasi tipe & test ke Zustand.<br>2. MP-4.2: Memangkas 4 hook mati (`useChatCore`, `useGitCore`, `useTerminalCore`, `useLayoutCore` ~1.660 baris) dan ~200 baris CSS usang di `sidebar.css` (-2.8 kB bundle CSS).<br>3. MP-4.3: Full verification gate lolos 100% (283 Vitest tests, 191 Go tests, 0 build error, oxfmt clean). Seluruh Wave 1–4 Tuntas Penuh! |
| **LOG-017** | `Optimization/Init` | Inisiasi Analisis BUGS - ISSUES - OPTIMIZES | `INIT` | Framework & Relational Table Setup | Menginisialisasi fase optimasi arsitektur per `task/task-issues-optimize.md`: dispatch subagent verifikasi, pemetaan relasional Backend API, Zustand DOM, dan Buffer Lifecycle, serta penyiapan `Table-Phase-Optimized.md` dan `pr-table-relational-opt.md`. |
| **LOG-018** | `Optimization/Audit` | Penyelesaian Audit 3 Batasan Arsitektur | `SUCCESS` | `Table-Phase-Optimized.md` & `pr-table-relational-opt.md` | Verifikasi mendalam 31 temuan (10 BUG, 12 ISSUE, 9 OPTIMIZE) pada Backend API (17 temuan), Zustand Store (9 temuan), dan Buffer Lifecycle (5 temuan). Master audit table dan PR implementation map tuntas dan siap divalidasi. |

---

## 2. Backlog Thinking & Catatan Orkestrator per Wave

### **Wave 1: Core Contracts, Event Bus & Backend Go**
- **Backlog MP-1.1 (Store Track)**:
  - `CMP-02`: Di `src/store/slices/createWorkspaceSlice.ts` baris 934 (`fetchBufferSafely`), pasang guard `if (get().linterSettings.enabled && !isLspLanguage(clean))` sebelum `triggerOffloadedLint`.
  - `CMP-03`: Pastikan timer linting di `createWorkspaceSlice.ts` tidak berlomba dengan lifecycle.
  - `BP-01`: Di `createDebugSlice.ts:223`, lengkapi percabangan `runAction` untuk `"find"` (buka widget find), `"clear-terminal"`, `"stop"` (`terminateDebugging`), dan `"new-terminal"` (`createTerminalSession`).
  - `DBG-04`: Di `createDebugSlice.ts:40`, normalkan path Go non-test ke direktori package (`filepath.Dir`).
- **Backlog MP-1.2 (Lifecycle Track)**:
  - `LSP-01`: Di `src/context/WorkbenchLifecycle.ts`, pasang `useEffect` yang menjalankan `subscribeLspDiagnostics` (`/api/v1/events/lsp`) agar diagnostik compiler masuk ke `setDiagnostics`.
  - `CMP-03`: Hapus duplicate timer `#7 Reactive Auto-Linting` (:396–441).
  - `CH-01` & `NEW-03`: Di listener shortcut keyboard `WorkbenchLifecycle.ts`, saat shortcut AI ditekan, ambil teks seleksi aktif dari editor dan sematkan ke context chips.
- **Backlog MP-1.3 (Backend Go Track)**:
  - `LSP-03`: Di `server/internal/lsp/manager.go`, implementasikan `DidSave` dan `DidClose`. Di `server/internal/api/api.go`, tambahkan route `/api/v1/lsp/save` dan `/api/v1/lsp/close`.
  - `LSP-04`: Daftarkan endpoint `POST /api/v1/lsp/symbols` di `api.go` yang memanggil `m.DocumentSymbols`.
  - `DBG-02`: Di `server/internal/debug/runner.go`, tambahkan langkah pre-compile `clang++ -g -O0` sebelum adapter `lldb-dap` dijalankan.
  - `DBG-03`: Di `runner_windows.go` dan `process_windows.go`, ganti `p.Kill()` dengan `taskkill /F /T`.
  - `EXT-04`: Hubungkan worker runners ke supervisor API.
- **Backlog MP-1.4 (Network Hub & Buffer Lifecycle Track — Rujukan: `task/pr-issues-socket-buffer-lifecycle.md`)**:
  - `NET-01`: Di `server/internal/api/events_hub.go`, bangun multiplexer SSE broker `EventHub` dengan endpoint `GET /api/v1/events` untuk membebaskan 5 socket HTTP/1.1 di port 8080.
  - `NET-01`: Di `src/services/WorkbenchEventHub.ts`, buat singleton client subscription dengan automatic reconnect.
  - `BUF-01`: Di `src/store/slices/createWorkspaceSlice.ts`, hilangkan multi-key indexing dan simpan hanya satu key kanonikal POSIX relatif (`toCanonicalPath`).
  - `BUF-01`: Di `src/components/layout/editor/CodePane.tsx`, dukung buffer status `loading` dengan skeleton UI (menghilangkan *empty code flash* dan *false-alarm AST outline*).
  - `BUF-02`: Di `createWorkspaceSlice.ts`, terapkan JIT tab loading (hanya fetch tab aktif Group 1 & 2 saat buka workspace; background tabs on-demand).
  - `LFC-01`: Di `src/context/WorkbenchLifecycle.ts`, hapus penundaan 600ms `runAfterWindowLoad` dan tambahkan `workspaceEpoch` guard pada pergantian folder cepat.

---

### **Wave 2: CodeMirror 6 Engine & Languages**
- **MP-2.1 (CM6 Core)**:
  - *STATUS*: 🟢 **VERIFIED COMPLETED**. `CMEditor.tsx` sudah memiliki `setActiveDebugLineEffect` dan `setBreakpointsEffect` serta guard `isFocused`.
- **MP-2.2 (CM6 Languages)**:
  - *STATUS*: 🟢 **COMPLETED**. `@codemirror/lang-cpp` dan `@codemirror/lang-rust` terpasang di `package.json` dan diaktifkan di `src/components/layout/editor/cmTheme.ts:64–74`. Syntax highlighting penuh aktif untuk `.rs`, `.c`, `.cpp`, `.h`.
- **MP-2.3 (Linter & Runner Track)**:
  - *STATUS*: 🟢 **COMPLETED**.
  - `CMP-01`: Di `src/utils/terminalRunCommand.ts`, path biner cross-platform Windows/POSIX (`.\\aegis_bin.exe` / `/tmp/aegis_bin`), compiler `.c` dipisahkan menggunakan `clang` (bukan `clang++`), dan Go package runner menggunakan `go run .` atau `go run ./<dir>`.
  - `CMP-04`: Di `src/utils/linter.ts:364–440`, pelacak kurung `(` (`countUnquotedParens`) dan header state multi-line ditambahkan pada `validatePython` sehingga parameter multi-baris tidak lagi memicu false `SyntaxError`.
  - `LSP-03` & `LSP-04`: Helper client `notifyLspDidSave`, `notifyLspDidClose`, dan `fetchLspSymbols` ditambahkan di `src/utils/lspApi.ts`, dan `notifyLspDidSave` dipanggil di `createWorkspaceSlice.ts` saat berkas ber-LSP disimpan.
  - `LSP-01`: Migrasi listener SSE compiler diagnostics di `src/context/WorkbenchLifecycle.ts` ke unified `eventHub.subscribe("lsp", ...)` menuntaskan single-socket SSE di port 8080.

---

### **Wave 3: Workbench UI Consumers & Interactivity — 🟢 SELESAI PENUH (COMPLETED & VERIFIED)**
- **MP-3.1 (Editor Chrome & Breadcrumbs Track) — 🟢 COMPLETED**:
  - `HD-01` & `NEW-02`: Di `src/components/layout/editor/EditorBreadcrumbs.tsx`, kontrak `{ line: sym.lineStart, col: 1 }` memancarkan `aegis:editor-goto-line` sinkron dengan StatusBar dan kursor CM6.
  - `HD-02`: `pinnedTabs` dan `togglePinTab` dipindahkan ke `createEditorSlice.ts` dengan localStorage persistence; `Close Others`, `Close All`, dan `Cmd+W` memfilter tab terpin.
  - `CH-01`: Di `EditorContextMenu.tsx`, seleksi teks aktif editor diteruskan ke chat context chips dan membuka Chat Drawer (`setChatOpen(true)`).
  - Test: `test/frontend/editor/editorChromeTrack.test.tsx` (6 tests passed).
- **MP-3.2 (Sidebar Explorer & Search Track) — 🟢 COMPLETED**:
  - `SB-01`: Sembunyikan header ganda Source Control di `Sidebar.tsx`, dan hubungkan aksi `<IconButton>` ke `refreshWorkspace` & event `aegis:explorer-collapse-all`.
  - `SB-03`: `ExplorerPanel.tsx` mendukung pembuatan file/folder bersarang dengan `parentFolder` (`${cleanParent}/${name}`), serta context menu New File / New Folder pada folder.
  - `SB-04`: Ref guard `isSubmittingRef` dipasang untuk eliminasi race condition double submission antara `onBlur` dan `Enter`/`Escape`.
  - `SB-05`: `.search-results` di `sidebar.css` memiliki flex scroll container (`flex: 1; min-height: 0; overflow-y: auto;`), dan baris match pencarian di `SearchPanel.tsx` memancarkan `aegis:editor-goto-line`.
  - Test: `test/frontend/sidebar/sidebarExplorerAndSearch.test.tsx` (10 tests passed).
- **MP-3.3 (Sidebar Git & Debug Track) — 🟢 COMPLETED**:
  - `SB-06`: Modal branch prompt di `SourceControlPanel.tsx` merender daftar seluruh `gitBranches` interaktif dengan penanda current branch dan instant checkout on click.
  - `SB-07`: AI commit draft menyertakan ringkasan path file `stagedChanges` dan `gitChanges`.
  - `SB-08` & `NEW-01`: Navigasi breakpoint/frame di `DebugSidePanel.tsx` meneruskan `focusedGroup` dan memancarkan `aegis:editor-goto-line`; pemanggilan liar `setActiveDebugLine` saat klik breakpoint biasa dihapus.
  - `SB-09`: Ditambahkan toggle expand/collapse untuk nilai variabel panjang di `DebugSidePanel.tsx`.
  - Test: `test/frontend/debug/sidebarGitAndDebug.test.tsx` (7 tests passed).
- **MP-3.4 (Bottom Panel & Chat Track) — 🟢 COMPLETED**:
  - `BP-02`: State `outputLogs` di `BottomPanel.tsx` diinisialisasi bersih `{ Server: [], Linter: [], Tasks: [], Git: [] }` tanpa mock log hardcoded.
  - `BP-03`: `DebugConsoleView.tsx` `executeRepl` menangani variabel lokal secara aman dengan pesan informatif tanpa crash.
  - `BP-04`: Dropdown shell baru di `BottomPanel.tsx` menyertakan shell Windows (`pwsh`, `powershell`, `cmd`) selain shell Unix.
  - `CH-02`: `ChatComposer.tsx` `isProviderConfigured` memvalidasi API keys untuk semua provider (`claude`, `openai`, `gemini`, `openrouter`, `opencode`).
  - Test: `test/frontend/bottom-panel/bottomPanelAndChat.test.tsx` (9 tests passed).

---

### **Wave 4: Dead Code Purge & Full Verification Gate — 🟢 SELESAI PENUH (COMPLETED & VERIFIED)**
- **MP-4.1 (Purge Dead Core Files) — 🟢 COMPLETED**:
  - `DC-01`, `DC-02`, `DC-03`: Tipe `CursorCoordinates` dipindahkan ke `createWorkspaceSlice.ts`.
  - Impor pengujian di `workbenchCore.test.ts` dan `settingsAndExplorer.test.ts` dimigrasikan penuh ke Zustand store slices.
  - Tiga berkas core warisan dihapus permanen via git: `editorCore.ts` (622 baris), `settingsCore.ts` (477 baris), `workspaceCore.ts` (1.112 baris). Total terhapus: 2.211 baris.
- **MP-4.2 (Purge Dead Hooks & Legacy CSS) — 🟢 COMPLETED**:
  - `DC-04`, `DC-05`, `DC-06`, `DC-07`: Seluruh fungsi hook mati (`useChatCore`, `useGitCore`, `useTerminalCore`, `useLayoutCore`) dihapus total (~1.660 baris dead code terhapus), hanya menyisakan pure types, storage helpers, dan constants.
  - Impor layout constants dialihkan langsung ke `@/store/slices/createLayoutSlice`.
  - `DC-09`: ~200 baris aturan CSS usang (`.tool-panel`, `.panel-input`, `.search-results button`, dll) dibersihkan dari `sidebar.css`. Ukuran bundle CSS Vite berkurang 2.8 kB (`180.10 kB` -> `177.30 kB`).
- **MP-4.3 (Build Gate & Test Verification) — 🟢 COMPLETED**:
  - Frontend Vitest: 26 test files (283 unit tests) lolos 100%.
  - Backend Go: 15 packages (191 unit & integration tests) lolos 100%.
  - Formatting: 157 files checked clean with `oxfmt`.
  - Vite Build: 181 modules transformed, 0 error, build time ~663ms.

---

### **Phase Optimized: Backlog Thinking & Boundary Tracing — 🟢 AUDIT SELESAI (READY FOR VALIDATION)**
- **Hasil Audit Boundary 1 (Backend API Endpoints — 17 Temuan)**:
  - 5 Dead Endpoints (0 frontend, 0 tests): `POST /api/v1/auth/handshake` (OPT-API-01), `GET /api/v1/pairing/info` (OPT-API-02), `POST /api/v1/mcp/rpc` (OPT-API-03 duplicate), `GET/POST /api/v1/mcp/events` (OPT-API-04 dead SSE), `POST /api/v1/codegraph/init` (OPT-API-05).
  - 6 Redundant/Overlapping Routes: Dedicated SSE `/api/v1/events/workspace` (OPT-API-07), `/api/v1/events/workers` (OPT-API-08), `/api/v1/events/logs` (OPT-API-12 dipanggil langsung oleh BottomPanel), `/api/v1/events/debug` & `lsp` (OPT-API-13), duplicate route `/api/codegraph/entrypoints` (OPT-API-14), dan Colbymchenry duplicate REST adapters (OPT-API-10).
  - 2 Backend Bugs: Nil pointer dereference panic di `server/internal/git/git.go:90` saat `s.ws == nil` (OPT-API-16), dan error handling `handleWorkspaceRename` & `Move` yang membalas HTTP 500 alih-alih 400/404 (OPT-API-17).
  - 1 Dev Client Bug: `TerminalView.tsx:201` memakai relative URL tanpa `API_BASE` (OPT-API-15).
  - 3 Diagnostic/Supervisor Endpoints to Retain: `/api/v1/terminal/sessions` (OPT-API-06), `/api/v1/workers` (OPT-API-09), `/api/v1/system/shutdown` (OPT-API-11).

- **Hasil Audit Boundary 2 (Zustand DOM & Store Slices — 9 Temuan)**:
  - State Duplication: Theme di `createLayoutSlice.ts` vs `createSettingsSlice.ts` (OPT-ZUS-01); Editor options (`tabSize`, `minimapEnabled`) di `EditorSlice` vs `SettingsSlice` (OPT-ZUS-02); Linter settings di `WorkspaceSlice` vs `SettingsSlice` (OPT-ZUS-05).
  - High-Frequency 60Hz Render Loop: `CMEditor.tsx` mengirim `cursorPosition` dan `selection` ke Zustand pada setiap ketukan tuts; `CodePane.tsx` berlangganan langsung sehingga memicu re-render seluruh CodePane (OPT-ZUS-03).
  - Redundant Derived State: `getDerivedEditorState` di `createEditorSlice.ts` mengkalkulasi 5 field usang secara manual (OPT-ZUS-04).
  - Misplaced Boundaries: Toast & action runner terisolasi di `createDebugSlice.ts` (OPT-ZUS-06); `breakpoints` & `activeDebugLine` disimpan di `EditorSlice` terpisah dari DAP engine (OPT-ZUS-07); Terminal slice menyimpan turunan objek berlebih (OPT-ZUS-08); Standalone `useCodeGraphStore` belum menyatu ke `useWorkbenchStore` (OPT-ZUS-09).

- **Hasil Audit Boundary 3 (Buffer Lifecycle & Asynchronous Operations — 5 Temuan)**:
  - **CRITICAL DATA LOSS RACE CONDITION**: `markBufferSavedLogic` di `createWorkspaceSlice.ts` menetapkan `savedContent = currentBuf.content` dan `isDirty = false` setelah network save selesai. Jika user mengetik selama network I/O berjalan, ketikan baru ditandai bersih tanpa tersimpan ke disk (OPT-BUF-01).
  - **WATCHER ECHO & FALSE CONFLICT**: `saveFile` tidak menyimpan timestamp `lastSaved` / save lock. Watcher Go mendeteksi modifikasi dan memicu `fetchBufferSafely`, menyebabkan unmount/flicker CodePane dan false `hasDiskConflict` jika user sedang mengetik (OPT-BUF-02).
  - **UNNORMALIZED TAB DIRTY CHECK**: `EditorTabs.tsx:248` dan `createEditorSlice.ts:355` memeriksa `fileBuffers[tab]` mentah. Jika path tab tidak kanonikal, tab tertutup tanpa modal konfirmasi (OPT-BUF-03).
  - **INCOMPLETE AUTOSAVE SYNC**: `autoSaveDirtyBuffers` menyimpan buffer ke disk namun tidak pernah mereset `isDirty = false` (OPT-BUF-04).
  - **RAPID TAB SWITCH RACE**: `fetchBufferSafely` tidak memiliki per-file async request ID/token guard (OPT-BUF-05).

- **Dokumen Output Fase Ini**:
  - `task/Table-Phase-Optimized.md` (Master Audit Table: 31 Relational Items).
  - `task/pr-table-relational-opt.md` (Relational PR Implementation Map: MP-5.1 s/d MP-5.3).
