Berikut adalah **Rencana Pentahapan Lengkap (*Comprehensive Phased Implementation Plan*)** untuk menghadirkan **LSP Multi-Bahasa Penuh** di AegisCode, dibangun di atas modul yang sudah ada (`server/internal/lsp/` dan CodeMirror 6 di `src/components/layout/editor/`):

---

### Arsitektur Multi-Bahasa yang Dituju

```
                                  ┌───► [gopls] (Go)
                                  │
[Frontend: CMEditor / CodeMirror] ──► [Go LSP Manager] ──► [vtsls / tsserver] (TS/JS)
  - Completion (Autocompletion)   │   (map[string]*Client)
  - Hover Tooltip (Dokumentasi)   ├───► [pyright / ruff] (Python)
  - Go-to-Definition (F12)        │
  - Diagnostics (Problems Panel)  ├───► [rust-analyzer] (Rust)
                                  │
                                  └───► [clangd] (C/C++)

```

---

### Phase 1: Multi-Language Binary Resolver & Environment Discovery (Backend Go)

**Fokus**: Memperluas `FindServerBinary` agar secara cerdas menemukan compiler server resmi di komputer pengembang.

* **Lokasi Kode**: `server/internal/lsp/manager.go:50-80`
* **Implementasi**:
1. **Pemetaan Bahasa ke Binary Resmi**:
* **TypeScript / JavaScript (`typescript`, `javascript`)**:
* Prioritas 1: `vtsls` (ultra-cepat, berbasis Rust/Node).
* Prioritas 2: `typescript-language-server` (`[]string{"--stdio"}`).
* Lokasi pencarian: `PATH`, lokal project `node_modules/.bin/`, global npm (`npm root -g`), Yarn/pnpm global, NVM path.


* **Python (`python`)**:
* Prioritas 1: `pyright-langserver` (`[]string{"--stdio"}`) atau `pyright`.
* Prioritas 2: `ruff server` atau `pylsp`.
* Lokasi pencarian: `PATH`, virtual environment aktif (`.venv/bin/`, `venv/bin/`), conda/poetry.


* **Rust (`rust`)**:
* Binary: `rust-analyzer`.
* Lokasi pencarian: `PATH`, `~/.cargo/bin/rust-analyzer`.


* **C / C++ (`c`, `cpp`)**:
* Binary: `clangd`.
* Lokasi pencarian: `PATH`, `/usr/bin/clangd`, `/opt/homebrew/bin/clangd`, `LLVM/bin`.


* **Web Core (`json`, `html`, `css`)**:
* `vscode-json-language-server`, `vscode-html-language-server`, `vscode-css-language-server`.




2. **Dukungan Custom Binary Path dari Config (`~/.aegis/config.json`)**:
* Jika pengembang menaruh binary di lokasi non-standar, server membaca `config.LspServers[lang]`.





---

### Phase 2: Inisialisasi Workspace & Negosiasi Kemampuan (*Capabilities*) (Backend Go)

**Fokus**: Memenuhi protokol inisialisasi yang dibutuhkan oleh server bahasa modern (seperti Pyright dan TypeScript) agar tidak menolak inisialisasi.

* **Lokasi Kode**: `server/internal/lsp/manager.go:100-130` & `server/internal/lsp/types.go`
* **Implementasi**:
1. **Struktur Parameter `initialize` Lengkap**:
```go
initParams := InitializeParams{
    ProcessID: os.Getpid(),
    RootURI:   rootURI,
    RootPath:  m.workspacePath,
    WorkspaceFolders: []WorkspaceFolder{
        {Name: filepath.Base(m.workspacePath), URI: rootURI},
    },
    Capabilities: ClientCapabilities{
        Workspace: WorkspaceClientCapabilities{
            WorkspaceFolders: true,
            Configuration:    true,
        },
        TextDocument: TextDocumentClientCapabilities{
            Synchronization: map[string]any{
                "dynamicRegistration": false,
                "willSave":            false,
                "didSave":             true,
            },
            Completion: map[string]any{
                "snippetSupport": true, // Mendukung snippet completion
            },
            Hover:      map[string]any{"contentFormat": []string{"markdown", "plaintext"}},
            Definition: map[string]any{"linkSupport": true},
            Formatting: map[string]any{"dynamicRegistration": false},
        },
    },
}

```


2. **Normalisasi Respons Completion**:
* Standardisasi parser agar mendukung format array `[]CompletionItem` maupun format objek `CompletionList { items: [] }`.





---

### Phase 3: Penanganan Crash & Pengawasan Siklus Hidup Proses (*Supervisor*)

**Fokus**: Menjamin kestabilan server jika salah satu language server mengalami kehabisan memori (*out of memory*) atau crash.

* **Lokasi Kode**: `server/internal/lsp/client.go` & `server/internal/supervisor/`
* **Implementasi**:
1. **Integrasi dengan Process Supervisor**:
* Bungkus eksekusi `exec.CommandContext` dengan pola supervisor AegisCode untuk isolasi memori dan auto-restart.


2. **Graceful Teardown saat Ganti Workspace**:
* Saat `SetWorkspace(newPath)` dipanggil, kirim notifikasi `shutdown` dan `exit` ke seluruh client aktif di `m.clients` sebelum membunuhnya dengan `SIGTERM`.


3. **Request Timeout Guard**:
* Berikan timeout (2–3 detik) pada pemanggilan completion/hover agar UI editor tidak terblokir jika language server sedang melakukan re-indexing besar.

---

### Phase 4: Diagnostik Kompiler Real-Time ke Problems Panel (Full-Duplex SSE)

**Fokus**: Mengalirkan error kompilasi dan peringatan (*diagnostics*) langsung ke Problems View dan editor gutter.

* **Lokasi Kode**: `server/internal/api/api.go:334` & `src/components/layout/bottom-panel/ProblemsView.tsx`
* **Implementasi**:
1. **Langganan SSE Diagnostik di Frontend**:
* Sambungkan `subscribeLspDiagnostics` di `WorkbenchContext`:
```typescript
subscribeLspDiagnostics((data) => {
  // data: { uri, diagnostics: [...] }
  updateLspDiagnostics(data.uri, data.diagnostics)
})

```




2. **Gutter Linting di CodeMirror 6**:
* Integrasikan dengan ekstensi resmi `@codemirror/lint` di `CMEditor.tsx` untuk menampilkan garis bawah merah/kuning (*squiggly lines*) dan dot peringatan di gutter baris.


3. **Eliminasi Heuristic Regex Duplikat**:
* Saat LSP aktif untuk berkas `.go`, `.ts`, atau `.py`, nonaktifkan linter regex heuristik (`linter.ts`) agar pengguna hanya melihat diagnosa resmi dari kompiler.





---

### Phase 5: Fitur Interaksi Editor Lanjutan (CodeMirror 6)

**Fokus**: Menghadirkan kapabilitas navigasi kode setara editor produksi.

* **Lokasi Kode**: `src/components/layout/editor/CMEditor.tsx` & `src/utils/lspApi.ts`
* **Implementasi**:
1. **Go-to-Definition (`F12` / `Cmd+Click`)**:
* Tangkap tombol `F12` atau klik mouse dengan modifier `Cmd`/`Ctrl`.
* Panggil `fetchLspDefinition(filename, line, col, langInfo.id)`.
* Jika lokasi berada di berkas lain: buka berkas via `openFileInPane(loc.path)` dan posisikan kursor serta scroll ke baris/kolom target.


2. **Format on Save (`Cmd+S` / `Ctrl+S`)**:
* Tambahkan endpoint `POST /api/v1/lsp/formatting`.
* Sebelum menyimpan berkas ke disk, panggil formatte LSP dan terapkan `view.dispatch({ changes: edits })`.


3. **Dokumentasi Markdown pada Hover Tooltip**:
* Parse konten markdown dari hover LSP (misalnya docstring Python atau TSDoc) menggunakan `MarkdownRenderer` agar teks tampil rapi dengan *syntax highlighting* pada blok kode contoh.





---

### Phase 6: Indikator UI, Status Bar & Panduan Instalasi Mandiri

**Fokus**: Transparansi status dan kemudahan bagi pengembang.

* **Lokasi Kode**: `src/components/layout/status-bar/StatusBar.tsx` & `src/components/layout/settings/SettingsModal.tsx`
* **Implementasi**:
1. **Indikator Bahasa di Status Bar**:
* Tampilkan status LSP di samping nama bahasa:
* `Go: gopls` 🟢
* `TypeScript: vtsls` 🟢
* `Python: Not Found` 🟡




2. **Panduan Instalasi 1-Klik / Copy-Command**:
* Jika pengguna membuka file `.py` tetapi `pyright` belum terpasang, tampilkan popover informatif:
> *"Python Language Server tidak ditemukan di sistem. Pasang dengan:*
> `npm i -g pyright` *atau* `pip install pyright`"




3. **Tab Pengaturan LSP di Settings Modal**:
* Toggle on/off per bahasa dan input manual jika pengguna ingin mengarahkan path binary kustom.

---

### Phase 7: Matriks Pengujian & Verifikasi Mutu

**Fokus**: Menjamin stabilitas dan keandalan lintas sistem operasi (Linux, macOS, Windows).

1. **Backend Go Unit Tests (`server/internal/lsp/manager_test.go`)**:
* Uji deteksi binary palsu vs asli untuk Go, TypeScript, dan Python.
* Uji konversi path berkas ke URI standar RFC (`file:///...`).
* Mock LSP server untuk memverifikasi handshake protokol JSON-RPC `Content-Length`.


2. **Frontend Vitest (`test/frontend/editor/lspIntegration.test.ts`)**:
* Uji parsing respons completion dan hover.
* Uji lompatan navigasi *Go-to-Definition* ke tab baru.


3. **Gerbang Build**:
* `npm run format` & `npm run build` bebas error.