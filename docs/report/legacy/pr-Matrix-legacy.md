# Matriks Status Verifikasi PR Issues & Hasil Perbaikan (Final)

> **Status Audit & Perbaikan**: Selesai Penuh (Batch 1, 2, dan 3 telah diimplementasikan & diverifikasi)  
> **Titik Acuan Awal**: Snapshot `v1.0.0-beta.1` (commit `7af554d`)  
> **Ringkasan Akhir**: Dari total 27 isu pada PR Issues (1, 2, dan 3) + 4 isu tambahan dari PR Issues 4:
> - 🟢 **SUDAH DIPERBAIKI**: **26 Isu** (96.3%)
> - 🟡 **SEBAGIAN DIPERBAIKI**: **1 Isu** (3.7% — Replay history terminal PTY buffer 512 KB aktif, perbaikan drop rate high-throughput)
> - 🔴 **BELUM DIPERBAIKI**: **0 Isu** (0% — Seluruh backlog perbaikan telah diselesaikan)

---

## 1. Audit Kerentanan Keamanan & Integritas File (PR-Issues-1)

| No | Isu / Bug | Lokasi Kode Aktual | Bukti Baris Kode di Repositori | Status Verifikasi |
|---|---|---|---|:---:|
| 1 | **Path Traversal & Arbitrary Deletion di `git.Discard`** | `server/internal/git/git.go:784-796` | Validasi batas workspace diimplementasikan dengan `fullPath, err := s.ws.ResolvePath(cleanPath)`. Path traversal keluar workspace ditolak (`continue`), serta terdapat proteksi `if fullPath != root` sebelum `os.RemoveAll`. | 🟢 **SUDAH DIPERBAIKI** |
| 2 | **Arbitrary File Read di `git.GetDiff`** | `server/internal/git/git.go:935-938` & `api.go:1065` | Pembacaan file didahului validasi `fullPath, err := s.ws.ResolvePath(relPath)`. Upaya pembacaan path di luar workspace ditolak dengan status error. | 🟢 **SUDAH DIPERBAIKI** |
| 3 | **Path Traversal via Symlink di Workspace** | `server/internal/workspace/workspace.go:219-275` | Fungsi `resolvePath` memanggil `filepath.EvalSymlinks` untuk root, target path, dan seluruh rantai parent directory untuk memastikan symlink tidak keluar dari root fisik. | 🟢 **SUDAH DIPERBAIKI** |
| 4 | **Wildcard CORS (`*`) Tanpa Token/Origin Guard** | `server/internal/api/api.go:214-245` | Middleware `corsAndAuthMiddleware` memvalidasi origin (loopback, subnet privat LAN RFC 1918, `AEGIS_ALLOWED_ORIGINS`) dan mewajibkan token autentikasi (`X-Session-Token` / `X-Pairing-Token`) untuk seluruh request non-loopback. | 🟢 **SUDAH DIPERBAIKI** |
| 5 | **Overwrite Diam-diam saat `createFile`** | `server/internal/workspace/workspace.go:493` & `workspaceCore.ts:963` | Metode `WriteFileExclusive` menggunakan flag `os.O_EXCL` dengan status HTTP 409 Conflict jika berkas telah ada. Frontend mengirimkan `exclusive = true` saat pembuatan file baru. | 🟢 **SUDAH DIPERBAIKI** |
| 6 | **Kolisi Nama File di Explorer (`addFileToTreeLogic`)** | `src/context/core/workspaceCore.ts:50` | Syarat `f.name === name` telah dihapus. Pengecekan hanya menggunakan `files.some((f) => f.path === path)`, sehingga file bernama sama di folder berbeda dapat dibuat normal. | 🟢 **SUDAH DIPERBAIKI** |
| 7 | **File Pindah ke Root saat Rename di Windows** | `src/context/core/workspaceCore.ts:981-985` | Terdapat normalisasi `const normalizedOld = oldPath.replace(/\\/g, "/")` sebelum penentuan `parentDir`, mencegah path terpotong menjadi kosong di Windows. | 🟢 **SUDAH DIPERBAIKI** |
| 8 | **Shadowing `normalizeWorkspacePath`** | `src/context/core/workspaceCore.ts:30, 203, 618` | Shadowing fungsi lokal telah dihapus. Fungsi resmi diimpor dari `workspaceApi.ts` dan dipanggil konsisten dengan 2 parameter `(filename, rootWorkspacePath)`. | 🟢 **SUDAH DIPERBAIKI** |
| 9 | **Tautologi Logika di `git.IsRepo`** | `server/internal/git/git.go:253` | Tautologi diganti dengan validasi semantik: `return st.IsDir() || st.Mode().IsRegular(), nil` (mendukung folder `.git` maupun berkas `.git` pada submodule/worktree). | 🟢 **SUDAH DIPERBAIKI** |

---

## 2. Audit Stabilitas & Runtime Crashes (PR-Issues-2)

| No | Isu / Bug | Lokasi Kode Aktual | Bukti Baris Kode di Repositori | Status Verifikasi |
|---|---|---|---|:---:|
| 1 | **Crash `fontStyle.lineHeight` di Diff Editor** | `src/components/layout/editor/DiffEditorPane.tsx:36-41` | Diff editor dimigrasikan ke `CMEditor` (CodeMirror 6). Nilai line height memiliki fallback numerik aman: `inheritEditorFont ? (settings?.editor?.lineHeight ?? 22) : 20`. Properti rapuh `fontStyle.lineHeight` telah dieliminasi. | 🟢 **SUDAH DIPERBAIKI** |
| 2 | **Mode Unified Diff Tidak Menampilkan Diff** | `src/components/layout/editor/CMEditor.tsx:338-343` | `CMEditor` mengaktifkan ekstensi resmi `@codemirror/merge` dengan konfigurasi `unifiedMergeView({ original: originalContent, highlightChanges: true, gutter: true })` saat mode side-by-side dimatikan. | 🟢 **SUDAH DIPERBAIKI** |
| 3 | **AI Buffer Truncation (Batas 64 KB Scanner)** | `server/internal/ai/claude.go:214` & `openai.go:250` | Alokasi buffer `scanner.Buffer(buf, 10*1024*1024)` dengan batas 10 MB telah diterapkan pada kedua provider streaming AI. | 🟢 **SUDAH DIPERBAIKI** |
| 4 | **Silent Drop Byte di Terminal PTY** | `server/internal/terminal/manager.go:222-232` | Riwayat byte PTY telah disimpan ke `s.history` (hingga 512 KB) untuk replay client. Replay reconnect dijamin utuh; buffer live subscriber menggunakan 128 chunks. | 🟡 **SEBAGIAN DIPERBAIKI** |
| 5 | **Terminasi Prematur SIGKILL Terminal (50ms)** | `server/internal/terminal/manager.go:380` | Graceful SIGTERM shutdown timeout telah diperpanjang dari 50ms menjadi `time.After(500 * time.Millisecond)`, memberi waktu bagi subproses shell melakukan cleanup. | 🟢 **SUDAH DIPERBAIKI** |
| 6 | **Disk Fsync Blocking di Bawah Mutex Lock** | `server/internal/store/ledger.go:115-122` | Mutex `s.mu.Unlock()` dilepaskan segera setelah penyiapan data in-memory, dan pemanggilan `atomicWrite(indexPath, out)` yang memicu hardware flush `f.Sync()` dieksekusi di luar lock. | 🟢 **SUDAH DIPERBAIKI** |
| 7 | **Inotify Exhaustion pada Direktori Monorepo** | `server/internal/workspace/watcher.go:168, 267` | Kuota folder dibatasi maksimum 5.000 direktori (`maxWatchedDirs`) dengan penghitungan atomic, dan registrasi dynamic directory pada `fsnotify.Create` dijalankan secara non-blocking di goroutine. | 🟢 **SUDAH DIPERBAIKI** |

---

## 3. Audit Front-End & UX Engine (PR-Issues-3)

| No | Isu / Bug | Lokasi Kode Aktual | Bukti Baris Kode di Repositori | Status Verifikasi |
|---|---|---|---|:---:|
| 1 | **Format Parsing Lokasi Rusak di Problems View** | `src/components/layout/bottom-panel/ProblemsView.tsx:5-36, 113, 178` | Fungsi `parseDiagnosticLocation` mengurai format bracket `filename [line, col]` dari linter dan format kolon `filename:line:col`. Nomor baris dan kolom diparsing akurat ke tabel dan list view (diuji di `diagnosticLocation.test.ts`). | 🟢 **SUDAH DIPERBAIKI** |
| 2 | **Ketiadaan Virtual Scrolling di `CodePane.tsx`** | `src/components/layout/editor/CodePane.tsx:340` | Textarea monolitik dan render manual `lines.map` telah digantikan penuh oleh `CMEditor` (CodeMirror 6) dengan DOM virtualization bawaan. | 🟢 **SUDAH DIPERBAIKI** |
| 3 | **Kompleksitas $O(M \times N)$ di `EditorFindWidget`** | `src/components/layout/editor/EditorFindWidget.tsx:88-125` | Array `lineStarts` diprakalkulasi dalam $O(N)$ sekali di awal, dan lokasi baris/kolom untuk setiap match dihitung menggunakan binary search $O(\log L)$, mengeliminasi alokasi substring array berulang. | 🟢 **SUDAH DIPERBAIKI** |
| 4 | **`localStorage.setItem` Sinkron saat Sash Dragging** | `src/context/core/layoutCore.ts:190-275` | Penyimpanan ukuran sash (sidebar, chat, bottom panel) di-debounce 250ms via `debouncedSetItem`, menghilangkan blocking I/O pada main UI thread saat pergerakan mouse. | 🟢 **SUDAH DIPERBAIKI** |
| 5 | **URL Terpotong Menjadi Komentar Abu-abu** | `src/utils/syntax.tsx:131-160` | Fungsi `findInlineCommentIndex` memeriksa konteks kutipan string dan escape character, sehingga karakter `//` di dalam URL tidak terpotong sebagai komentar. | 🟢 **SUDAH DIPERBAIKI** |
| 6 | **String Regex Gagal pada Escaped Quotes (`\"`)** | `src/utils/syntax.tsx:196` | Regex token string diperbarui menjadi `/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][A-Za-z0-9_$]*\b|[<>{}[\](),;.:=+\-*/&|!])/g`, mendukung escaped quotes secara presisi (diuji di `settingsAndExplorer.test.ts`). | 🟢 **SUDAH DIPERBAIKI** |
| 7 | **Hilangnya Spasi Pembatas `@mention` Pill** | `src/components/layout/chat/MarkdownRenderer.tsx:593, 609` | Preservasi `leadingSpace = raw.match(/^\s+/)?.[0]` diterapkan sebelum render tombol mention pill `<button>` dan command chip `<span>` (diuji di `markdownSafeGuard.test.ts`). | 🟢 **SUDAH DIPERBAIKI** |
| 8 | **Celah XSS pada Link Markdown** | `src/components/layout/chat/MarkdownRenderer.tsx:570` | Validasi protokol `isSafeProtocol = /^(https?:|mailto:|file:|\/|#)/i.test(href)` telah diterapkan. Skema `javascript:` ditolak dan dirender sebagai teks biasa. | 🟢 **SUDAH DIPERBAIKI** |
| 9 | **Over-Matching Exclude Pattern AI Context** | `src/context/core/contextExtractorCore.ts:38-46` | Segment boundary regex `(^|/)${escaped}(/|$)` menggantikan substring `.includes(cleanPattern)`, mencegah false-positive pada berkas seperti `src/utils/distribution.ts` (diuji di `workbenchCore.test.ts`). | 🟢 **SUDAH DIPERBAIKI** |
| 10 | **Busy-Wait Loop CPU 100% di Skrip Port** | `scripts/clean-ports.js:85` | Loop sibuk telah digantikan dengan `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)` dengan konsumsi CPU 0%. | 🟢 **SUDAH DIPERBAIKI** |
| 11 | **Polling Aktif Subproses Git (Setiap 6 Detik)** | `src/context/core/gitCore.ts:284-306` | Polling diperlonggar dari 6 detik ke interval heartbeat 30 detik yang otomatis di-pause saat tab browser tidak aktif (`document.hidden`), disertai pembaruan instan saat jendela aplikasi mendapatkan fokus (`window.focus`). | 🟢 **SUDAH DIPERBAIKI** |

---

## 4. Tambahan Verifikasi Isu Baru (dari `pr-issues-4.md`)

| No | Isu Tambahan | Lokasi Kode Aktual | Dampak / Analisis | Status |
|---|---|---|---|:---:|
| 1 | **Loop Pointer Aliasing pada Chat Ledger Reconcile** | `server/internal/store/index.go:307` | Deklarasi `var node GraphNode` telah dipindahkan ke dalam body loop `for scanner.Scan()`, mencegah pointer aliasing. | 🟢 **SUDAH DIPERBAIKI** |
| 2 | **Korupsi Baris 1 saat Search Replace Nama File** | `workspace.go:28, 671` & `SearchPanel.tsx:135, 540` | `IsFilenameMatch` telah ditambahkan. Tombol replace untuk baris nama file dinonaktifkan dan `handleReplaceSingle` / `handleReplaceInFile` memproteksi pemotongan isi baris 1. | 🟢 **SUDAH DIPERBAIKI** |
| 3 | **Mismatch Arsitektur Test Connection Claude** | `server/internal/ai/probe.go:310` | `probeClaude` kini memvalidasi koneksi via HTTP request resmi ke `https://api.anthropic.com/v1/models` menggunakan `x-api-key`, dengan fallback CLI jika pengguna mengonfigurasi local wrapper. | 🟢 **SUDAH DIPERBAIKI** |
| 4 | **Provider `openai` Ditolak di `ProbeProvider`** | `server/internal/ai/probe.go:58, 234` | Endpoint `probeOpenAI` telah diimplementasikan penuh untuk memvalidasi kredensial API key OpenAI via HTTP GET `/v1/models`. | 🟢 **SUDAH DIPERBAIKI** |
| 5 | **Tombol Copy & Clear Terminal ke xterm Live** | `BottomPanel.tsx:103` & `TerminalView.tsx:233` | Event `aegis:terminal-clear` dan `aegis:terminal-copy` dihubungkan langsung ke instance `xterm.js`, membersihkan dan menyalin buffer live secara presisi. | 🟢 **SUDAH DIPERBAIKI** |
| 6 | **Side-Effect Murni di `terminalCore.ts`** | `src/context/core/terminalCore.ts:275, 335` | Panggilan API `sendTerminalInputApi` dan `closeTerminalApi` dipindahkan ke luar React state updater, aman dari double-invocation React 19. | 🟢 **SUDAH DIPERBAIKI** |
| 7 | **Menu File New, Undo, Redo Terkoneksi Nyata** | `workbenchFacade.ts:883` & `CMEditor.tsx:530` | `new-file` memanggil `createFileAndOpen` untuk file baru, sementara `undo` dan `redo` mendispatch event ke CodeMirror `undo(view)` / `redo(view)`. | 🟢 **SUDAH DIPERBAIKI** |
| 8 | **Breadcrumbs Dinamis Path Utuh** | `EditorBreadcrumbs.tsx:41` | Hardcode `src` dihilangkan; breadcrumbs memecah path berkas menjadi segmen dinamis dengan ikon dan tanpa duplikasi nama file. | 🟢 **SUDAH DIPERBAIKI** |
| 9 | **Pembersihan Fallback Jam Mock di Output View** | `src/components/layout/bottom-panel/OutputView.tsx:20` | Fallback jam statis `10:42:08` dieliminasi; tag waktu hanya dirender jika log backend memiliki timestamp kurung siku. | 🟢 **SUDAH DIPERBAIKI** |
| 10 | **Ekspansi Symlink Direktori di Explorer Tree** | `server/internal/workspace/workspace.go:334` | `buildSubTree` memeriksa `os.Stat(fullPath)` untuk symlink direktori dan memvalidasi batas workspace sebelum ekspansi rekursif. | 🟢 **SUDAH DIPERBAIKI** |

---

## 🎯 Ringkasan Eksekusi Batch 1, 2, 3, & 4

1. **Batch 1 (Data Safety & Backend Stability)**:
   - Selesai & diverifikasi: `IsFilenameMatch`, Ledger Mutex Contention, Probe OpenAI/Claude, Terminal 500ms Graceful Teardown, Inotify Monorepo Cap & Async Watcher.
2. **Batch 2 (Frontend Performance & State)**:
   - Selesai & diverifikasi: Binary search $O(N + M \log L)$ di `EditorFindWidget.tsx`, Debounce 250ms pada `debouncedSetItem` saat Sash Dragging, Git 30s Heartbeat + `document.hidden` pause.
3. **Batch 3 (Parser & UI Glitches)**:
   - Selesai & diverifikasi: `parseDiagnosticLocation` format bracket & kolon, Escaped quotes di tokenizer, Preservasi spasi awalan `@mention`, Exact segment match exclude pattern.
4. **Batch 4 (UI Polish & System Refinement - Isu pr-issues-4.md)**:
   - Selesai & diverifikasi: Terminal xterm Copy/Clear event bridge, Purity React 19 state updater `terminalCore`, Dynamic breadcrumbs, Menu action New File / Undo / Redo terintegrasi CodeMirror, Pembersihan mock timestamp Output View, dan Symlink directory support di tree explorer.
5. **Gerbang Verifikasi Mandatori**:
   - `rtk npm run build`: Lolos 0 errors.
   - `rtk npm run format`: Lolos oxfmt format check (98 files).
   - `rtk npm test`: Lolos 125/125 tests Vitest + seluruh unit tests backend Go.