gega### 1. Root Repository Standards (Etalase & Tata Kelola Komunitas)

* **`README.md` (Halaman Utama Repositori)**:
* *Elevator pitch* & *Hero banner* AegisCode.
* Fitur unggulan (Zero-CGO Pure-Go, Native MCP, Bundled Delve, Zero-Freeze Editor, Zero-Repo Pollution).
* Cuplikan visual (GIF/Screenshot UI, terminal, debugger, kanvas graf).
* Panduan instalasi 1 baris perintah (*One-line Quickstart*).
* Status rilis Beta & tautan ke dokumentasi lengkap.


* **`LICENSE` & `NOTICE**`:
* Lisensi resmi proyek (misal: Apache 2.0 / MIT).
* Atribusi pustaka pihak ketiga (misal: `modernc.org/sqlite`, `delve`, `cytoscape`, `codemirror`).


* **`CONTRIBUTING.md` (Panduan Kontributor)**:
* Alur setup *development environment* (Go toolchain, Node/pnpm, Wails).
* Standar build lokal (`CGO_ENABLED=0 go build ./cmd/server`).
* Konvensi branch, komit (*Conventional Commits*), dan checklist sebelum mengajukan Pull Request.


* **`CODE_OF_CONDUCT.md` (Kode Etik Komunitas)**:
* Standar perilaku komunitas (menggunakan standar *Contributor Covenant v2.1*).


* **`SECURITY.md` (Kebijakan Keamanan & Vulnerability Disclosure)**:
* Jalur pelaporan kerentanan privat (alamat email/PGP, larangan membuka *public issue* untuk bug keamanan).
* Model ancaman lokal (*Threat model* socket IPC, bind host `127.0.0.1`, dan isolasi sub-proses).


* **`CHANGELOG.md` / `RELEASE_NOTES.md` (Catatan Rilis Beta)**:
* Log perubahan terstruktur: *New Features*, *Improvements*, *Breaking Changes*, dan *Known Limitations*.


* **`ROADMAP.md` (Peta Jalan Publik)**:
* Garis besar milestone fase berikutnya (Fase GA v1.0, integrasi LSP multi-bahasa tambahan, plugin marketplace).



---

### 2. User & Developer Guide (`docs/user-guide/`)

* **`installation.md` (Panduan Instalasi Lengkap)**:
* Unduhan biner rilis per platform (macOS Apple Silicon & Intel, Linux `.tar.gz`/AppImage, Windows `.zip`/installer).
* Cara kompilasi mandiri dari *source code*.
* Verifikasi checksum SHA-256 rilis.


* **`getting-started.md` (Panduan Penggunaan Hari Pertama)**:
* Membuka *workspace* pertama kali.
* Memahami lokasi data aplikasi (`~/.aegis/aegis.db` dan `~/.aegis/graphs/`).
* Menghubungkan provider AI (kunci API Gemini, Claude, atau endpoint OpenAI-compatible).


* **`editor-and-terminal.md` (CodeMirror & Terminal Bawaan)**:
* Pintasan keyboard bawaan editor (*Keybindings*).
* Terminal PTY terintegrasi berbasis SSE (manajemen sesi, ANSI color rendering, multi-tab).
* Sinkronisasi status file kotor (*dirty buffers* & *auto-save on blur*).


* **`debugging-with-delve.md` (Panduan Debugger Delve DAP)**:
* Memasang *breakpoints* pada gutter editor.
* Menjalankan sesi debug Go tanpa konfigurasi manual (*Zero-config Delve*).
* Menggunakan *Call Stack*, *Variables View*, dan toolbar kontrol eksekusi (Step In, Step Over, Continue).


* **`ai-assistant-and-review-gates.md` (AI Chat & Git Review Gates)**:
* Menggunakan panel chat AI dengan *thought traces* dan percabangan sesi (*session branching*).
* Mekanisme *Review Gate*: Memeriksa git diff baris-per-baris sebelum perubahan dari agen AI diterapkan ke disk.


* **`visual-codegraph.md` (Navigasi Graf Kode)**:
* Membaca tata letak Hierarki (Dagre) vs Klaster (CoSE).
* Berpindah ke baris kode asal (*Jump to Source*) via klik ganda node.
* Memahami penanda visual (warna jenis simbol, fokus kursor editor, dan penyorotan alur AI).


* **`troubleshooting-and-faq.md` (Pemecahan Masalah Umum)**:
* Cara memperbaiki *database locked* atau korupsi file WAL saat *ungraceful crash*.
* Reset cache graf per-proyek tanpa menghapus riwayat chat.
* FAQ performa pada basis kode besar ($> 50.000$ baris).



---

### 3. Architecture & Internals (`docs/architecture/` & `docs/adr/`)

* **`architecture-overview.md` (Cetak Biru Arsitektur AegisCode)**:
* Pola *Hybrid Process*: Go Core Backend + Wails/Webview Frontend + PTY Manager.
* Pipeline re-indexing berbasis event *Disk Watcher* & *Fast SHA-256 Bailout*.


* **`adr/` (Architecture Decision Records — Publik)**:
* Mengorganisir ADR 0001 hingga ADR 0013 yang sudah ada di repositori ke dalam indeks baca publik yang rapi (mencakup alasan pemilihan Pure-Go SQLite, Unix Domain Sockets, Zero-Freeze Workers, Delve Bundling, dan Append-Only Chat Ledger).


* **`database-schema.md` (Spesifikasi Skema SQLite3)**:
* Kamus data tabel `app_config`, `chat_sessions`, `chat_events`, `chat_fts`.
* Kamus data relasi graf `graph_files`, `code_symbols`, `code_edges`, `symbol_fts`.
* Strategi isolasi partisi database (Global vs Project Workspace).



---

### 4. Extensibility, API & MCP Reference (`docs/developers/`)

* **`mcp-specification.md` (Model Context Protocol Reference)**:
* Spesifikasi transport JSON-RPC 2.0 (Stdio runner & HTTP/SSE).
* Katalog tools: `get_symbol_definition`, `find_callers`, `get_dependencies`, `query_subgraph`.
* Skema input/output lengkap dengan contoh payload token-hemat ($< 150$ token).


* **`local-rest-and-sse-api.md` (Referensi API Backend Lokal)**:
* Endpoint REST untuk manajemen workspace, file tree, dan status git.
* Endpoint SSE streaming untuk terminal PTY (`/api/v1/pty/stream`) dan debug events (`/api/v1/debug/events`).
* Endpoint query graf untuk panel luar (`/api/v1/graph/view`).


* **`plugin-and-extension-guide.md` (Panduan Pembuat Ekstensi)**:
* Cara membangun panel UI kustom berbasis REST/Wails bindings.
* Cara menghubungkan agen AI eksternal (Cursor, Claude Code, Ollama) ke MCP AegisCode.
* Panduan menyuntikkan parser AST bahasa pemrograman baru (*Custom Language Ingestion*).



---

### 5. Template GitHub & Otomasi Komunitas (`.github/`)

* **`.github/ISSUE_TEMPLATE/bug_report.yml`**:
Formulir pelaporan bug terstruktur (versi AegisCode, OS, output terminal, langkah reproduksi).
* **`.github/ISSUE_TEMPLATE/feature_request.yml`**:
Formulir pengajuan usulan fitur baru beserta konteks masalahnya.
* **`.github/PULL_REQUEST_TEMPLATE.md`**:
Checklist PR (lolos uji unit test Go/Vitest, tidak melanggar aturan `CGO_ENABLED=0`, pembaruan dokumentasi terkait).