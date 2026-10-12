### 1. Kerentanan Keamanan Kritis (Critical Security)

#### A. Arbitrary File Deletion via Path Traversal pada `git.Discard`

* **Lokasi**: `server/internal/git/git.go` (metode `Discard`) & `server/internal/api/api.go` (`handleGitDiscard`)
* **Masalah**: Input array `req.Files` dari payload POST `/api/v1/git/discard` tidak divalidasi terhadap batasan workspace root.
```go
fullPath := filepath.Join(root, cleanPath)
if _, err := s.runGit(ctx, "restore", "--", cleanPath); err != nil {
    _ = os.RemoveAll(fullPath) // Potensi penghapusan di luar root
}

```


Jika `cleanPath` berisi path traversal (seperti `../../important_dir`), `git restore` akan gagal karena berada di luar repositori Git, sehingga eksekusi masuk ke blok error dan memanggil `os.RemoveAll(fullPath)`. Hal ini memungkinkan penghapusan file atau direktori arbitrary di sistem operasi.
* **Solusi**: Validasi setiap file menggunakan `resolvePath` atau verifikasi `filepath.Rel(root, fullPath)` sebelum memproses pemulihan/penghapusan.

#### B. Arbitrary File Read pada Git Diff (`handleGitDiff` & `git.GetDiff`)

* **Lokasi**: `server/internal/api/api.go` (baris 912) & `server/internal/git/git.go` (baris 590)
* **Masalah**: Parameter query `file` pada `GET /api/v1/git/diff?file=...` dibaca langsung tanpa sanitasi:
```go
modBytes, _ := os.ReadFile(filepath.Join(root, relPath))

```


Penyerang dapat mengirimkan `file=../../../../etc/passwd` untuk membaca konten file sistem apa pun yang dapat diakses oleh user proses server.
* **Solusi**: Gunakan resolver workspace (`s.ws.resolvePath(relPath)`) untuk memastikan path tetap berada di dalam direktori workspace.

#### C. Path Traversal melalui Symlink di Workspace Resolver

* **Lokasi**: `server/internal/workspace/workspace.go` (`resolvePath`)
* **Masalah**: `resolvePath` hanya melakukan pengecekan leksikal (`filepath.Clean` dan `filepath.Rel`). Jika sebuah folder di dalam workspace berisi symlink yang mengarah ke luar root (misalnya `/workspace/etc_link -> /etc`), operasi `GetFile`, `WriteFile`, dan `DeleteFile` akan mengikuti symlink tersebut keluar dari workspace root.
* **Solusi**: Evaluasi symlink aktual menggunakan `filepath.EvalSymlinks` setelah path digabungkan, lalu pastikan hasil akhirnya tetap memiliki prefix `rootPath`.

#### D. Wildcard CORS (`*`) Tanpa Autentikasi / Origin Verification

* **Lokasi**: `server/internal/api/api.go` (`corsMiddleware`)
* **Masalah**: Middleware CORS menyetel `Access-Control-Allow-Origin: *` pada seluruh endpoint REST dan SSE lokal (`http://localhost:8080`). Karena tidak ada mekanisme token CSRF atau API key lokal, situs web berbahaya mana pun yang dibuka pengguna di peramban dapat memicu request lintas domain untuk:
* Membaca file workspace (`/api/v1/workspace/file`)
* Menjalankan perintah terminal PTY arbitrary (`/api/v1/terminal/create` + input)
* Menjalankan worker proses arbitrary (`/api/v1/workers`)
* Mematikan IDE (`/api/v1/system/shutdown`)


* **Solusi**: Batasi header CORS hanya untuk origin terpercaya (misalnya `localhost:5173` saat dev mode atau origin self-hosted), atau terapkan session token acak saat server pertama kali dijalankan.

#### E. Potensi XSS pada Markdown Link Rendering

* **Lokasi**: `src/components/layout/chat/MarkdownRenderer.tsx` (baris 507)
* **Masalah**: Sintaks link `[label](url)` langsung dirender ke tag `<a href={linkMatch[2]} ...>` tanpa memvalidasi skema protokol URL. Jika respons AI atau input chat menyertakan link dengan skema `javascript:...`, eksekusi JavaScript dapat terpicu saat pengguna mengklik link tersebut.
* **Solusi**: Validasi protokol URL agar hanya mengizinkan `http:`, `https:`, atau anchor internal.

---

### 2. Bug Logika & Integritas Data (Logic & Data Integrity)

#### A. Overwrite File Eksisting Tanpa Pengecekan pada `createFile`

* **Lokasi**: `src/context/core/workspaceCore.ts` (baris 890) & `server/internal/workspace/workspace.go` (`WriteFile`)
* **Masalah**: Saat pengguna membuat file baru di file tree, frontend langsung memanggil `saveWorkspaceFile(newPath, "// " + cleanName + "\n", isFolder)`. Di backend, `os.WriteFile` menimpa file tersebut secara langsung tanpa memeriksa apakah file sudah ada (`os.Stat` atau flag `os.O_EXCL`). Jika pengguna salah memasukkan nama file yang sudah ada (misal `App.tsx` atau `main.go`), seluruh isi file lama akan langsung terhapus dan terganti dengan satu baris komentar.
* **Solusi**: Tambahkan verifikasi keberadaan file di backend sebelum operasi pembuatan file baru, dan kembalikan error `file already exists` (HTTP 409).

#### B. Kolisi Nama File Berulang pada File Tree (`addFileToTreeLogic`)

* **Lokasi**: `src/context/core/workspaceCore.ts` (baris 46)
* **Masalah**:
```typescript
if (files.some((f) => f.path === path || f.name === name)) {
  return files
}

```


Kondisi `|| f.name === name` menyebabkan file baru ditolak jika memiliki *basename* yang sama dengan file lain di folder berbeda. Contoh: jika sudah ada `src/index.ts`, maka penambahan `lib/index.ts` atau `components/Button/index.tsx` akan diabaikan secara diam-diam dan tidak muncul di explorer tree.
* **Solusi**: Hapus perbandingan `|| f.name === name`, cukup bandingkan kesamaan path unik (`f.path === path`).

#### C. Bug Relokasi File ke Root saat Rename di Windows / Subfolder

* **Lokasi**: `src/context/core/workspaceCore.ts` (baris 920)
* **Masalah**:
```typescript
const parentDir = oldPath.includes("/")
  ? oldPath.substring(0, oldPath.lastIndexOf("/"))
  : ""
const newPath = parentDir ? `${parentDir}/${clean}` : clean

```


Pada lingkungan Windows di mana path pemisah berupa backslash (`\`), `oldPath.includes("/")` menghasilkan `false`. Akibatnya, `parentDir` kosong dan `newPath` hanya berisi nama baru file tersebut. Saat di-rename, file yang berada di dalam subfolder akan berpindah ke workspace root. Selain itu, pada sistem POSIX, `os.Rename` akan menimpa file tujuan jika nama tersebut sudah ada tanpa peringatan.
* **Solusi**: Normalisasi pemisah path ke slash (`/`) sebelum mengekstrak direktori induk, atau gunakan helper path yang konsisten untuk kedua platform.

#### D. Shadowing Fungsi `normalizeWorkspacePath` di `workspaceCore.ts`

* **Lokasi**: `src/context/core/workspaceCore.ts` (baris 33 & 180)
* **Masalah**: Fungsi `normalizeWorkspacePath` diimpor dari `workspaceApi`, tetapi dideklarasikan ulang secara lokal di baris 180 dengan hanya menerima 1 parameter (`path: string`). Deklarasi lokal ini menimpa (*shadows*) fungsi asli dari `workspaceApi`. Saat dipanggil di baris 602:
```typescript
const clean = normalizeWorkspacePath(filename, rootWorkspacePath)

```


Argumen `rootWorkspacePath` diabaikan, sehingga prefix direktori workspace tidak terhapus dan dapat menghasilkan key buffer ganda/tidak sinkron.

#### E. State Buffer Menjadi Dirty Palsu Setelah `Replace All`

* **Lokasi**: `src/components/layout/sidebar/SearchPanel.tsx` (baris 225)
* **Masalah**: Setelah backend selesai menjalankan `Replace All` dan menyimpan ke disk, frontend memperbarui buffer menggunakan `updateFileContent(path, freshContent)`. Fungsi `updateFileContent` membandingkan konten baru dengan `savedContent` lama. Karena `savedContent` belum diperbarui, buffer ditandai sebagai `isDirty: true`, sehingga editor mengira ada perubahan yang belum disimpan padahal file di disk sudah tersimpan.
* **Solusi**: Panggil pembaruan buffer khusus yang juga memperbarui `savedContent: freshContent` dan menyetel `isDirty: false`.

---

### 3. Runtime Crashes & Unhandled Exceptions

#### A. Crash Fatal pada `DiffEditorPane` jika `inheritEditorFont` Bernilai False

* **Lokasi**: `src/components/layout/editor/DiffEditorPane.tsx` (baris 53 & baris 337, 347, 375, 379, 427)
* **Masalah**:
```typescript
const fontStyle = inheritEditorFont ? { ... } : undefined

```


Di beberapa elemen JSX, kode langsung mengakses properti `style={{ lineHeight: fontStyle.lineHeight }}`. Jika pengguna menonaktifkan pengaturan `inheritEditorFont` di Settings, `fontStyle` bernilai `undefined`, yang langsung memicu:
```text
TypeError: Cannot read properties of undefined (reading 'lineHeight')

```


Hal ini merusak rendering tab editor (white screen / crash komponen).
* **Solusi**: Gunakan optional chaining atau fallback: `style={{ lineHeight: fontStyle?.lineHeight ?? "20px" }}`.

#### B. Fitur Unified View pada Diff Editor Tidak Terimplementasi

* **Lokasi**: `src/components/layout/editor/DiffEditorPane.tsx` (baris 316)
* **Masalah**: Tombol toggle split/unified view mengubah state `renderSideBySide` menjadi `false`. Namun saat bernilai `false`, komponen hanya menyembunyikan kolom kiri (Original) dan tetap menampilkan file kanan (Modified). Teks unified diff (`diffData.diff`) dengan baris `+` dan `-` tidak pernah diparsing maupun ditampilkan.

#### C. Buffer Truncation / Stream Hang pada AI Engine (`bufio.NewScanner` 64KB Limit)

* **Lokasi**:
* `server/internal/ai/claude.go` (baris 211)
* `server/internal/ai/openai.go` (baris 247)
* `server/internal/store/ledger.go` (baris 167)


* **Masalah**: Penggunaan default `bufio.NewScanner(resp.Body)` memiliki batas buffer maksimum bawaan sebesar 64 KB (`bufio.MaxScanTokenSize`). Ketika LLM mengirimkan respon tool-call besar (misal pembuatan/penulisan file kode berukuran di atas 64 KB) dalam satu event SSE, scanner akan berhenti secara tiba-tiba dengan error `token too long`. Karena error scanner tidak diperiksa, loop berhenti tanpa peringatan dan menghasilkan pesan terpotong atau proses hang.
* **Solusi**: Alokasikan buffer scanner yang memadai sebelum membaca (misalnya 10 MB seperti yang sudah diterapkan di `antigravity.go`):
```go
buf := make([]byte, 1024*1024)
scanner.Buffer(buf, 10*1024*1024)

```



#### D. Tautologi Logika pada `git.IsRepo`

* **Lokasi**: `server/internal/git/git.go` (baris 247)
* **Masalah**:
```go
return st.IsDir() || !st.IsDir(), nil

```


Ekspresi `st.IsDir() || !st.IsDir()` selalu bernilai `true` selama `.git` ada (termasuk jika berupa socket atau FIFO). Seharusnya cukup mengecek `st.IsDir()`.

---

### 4. Performa, Konkurensi & Kompatibilitas Lintas Platform

#### A. Ketiadaan Virtualisasi Rendering pada `CodePane.tsx`

* **Lokasi**: `src/components/layout/editor/CodePane.tsx` (baris 430 & 503)
* **Masalah**: Komponen me-render seluruh baris kode (`lines.map(...)`) ke dalam DOM secara langsung tanpa windowing/virtualisasi. Pada file dengan ribuan baris kode (seperti `package-lock.json` atau file data besar):
* Dihasilkan ribuan elemen DOM untuk baris dan gutter.
* Setiap kali pengguna mengetik satu karakter, fungsi `tokenizeLine` dijalankan ulang untuk seluruh baris file. Hal ini menyebabkan lag pengetikan yang berat hingga browser tab freezing.


* **Solusi**: Terapkan virtual scrolling (hanya render baris yang terlihat di viewport) atau integrasikan editor engine berbasis canvas/virtual DOM.

#### B. Desinkronisasi Visual Text Wrapping antara `<textarea>` dan Syntax Layer

* **Lokasi**: `src/components/layout/editor/CodePane.tsx`
* **Masalah**: Fitur syntax highlighting AegisCode menggunakan teknik layer ganda: `<div className="syntax-layer">` di belakang dan `<textarea className="code-textarea">` transparan di depan. Ketika opsi `wordWrap` bernilai `"on"`, pembungkusan baris pada `<textarea>` ditentukan oleh mesin peramban asli, sementara div di belakangnya mengikuti styling CSS biasa. Karakter pembungkus sering kali memiliki offset tinggi baris yang sedikit berbeda, menyebabkan posisi kursor teks dan warna sintaks melenceng secara visual pada baris-baris yang panjang.

#### C. Bug Parsing URL pada Tokenizer Komentar

* **Lokasi**: `src/utils/syntax.tsx` (baris 147)
* **Masalah**:
```typescript
const commentIdx = line.indexOf("//")
if (commentIdx !== -1) { ... }

```


Deteksi inline comment menggunakan pencarian string sederhana `line.indexOf("//")`. Jika ada URL di dalam string (seperti `const url = "[https://example.com](https://example.com)"`), karakter `//` di dalam URL akan dipotong dan sisa URL dianggap sebagai komentar berwarna abu-abu.
* **Solusi**: Parsing string literal terlebih dahulu sebelum memeriksa komentar inline `//`.

#### D. Potensi Keystroke Out-of-Order pada Terminal PTY

* **Lokasi**: `src/components/layout/bottom-panel/TerminalView.tsx` (baris 125) & `src/utils/terminalApi.ts`
* **Masalah**: Setiap input data dari xterm.js dikirim melalui request HTTP POST `fetch(`/api/v1/terminal/${sessionId}/input`)`. Karena koneksi HTTP bersifat asinkron dan tidak menggunakan antrean request sekuensial (in-flight queue), jitter jaringan dapat menyebabkan paket input kedua tiba sebelum paket pertama di server, sehingga karakter yang diketik pengguna secara cepat dapat tertukar urutannya di PTY terminal.
* **Solusi**: Gunakan protokol WebSocket untuk komunikasi dua arah terminal (input dan output), atau kelola antrean promise berantai (*serialized request chain*) untuk pengiriman input.

#### E. Kegagalan Kompilasi Server di Windows (`creack/pty`)

* **Lokasi**: `server/internal/terminal/manager.go`
* **Masalah**: `manager.go` mengimpor `[github.com/creack/pty](https://github.com/creack/pty)` tanpa tag build. Library `creack/pty` tidak mendukung Windows API (ConPTY). Saat skrip `scripts/build-binary.js` mencoba mengompilasi target Windows (`GOOS=windows`), build akan gagal.
* **Solusi**: Pisahkan dependensi `creack/pty` ke dalam file khusus Unix (`//go:build !windows`) dan gunakan implementasi ConPTY atau Windows Console API untuk target Windows.

#### F. Busy-Wait Loop CPU 100% pada `clean-ports.js`

* **Lokasi**: `scripts/clean-ports.js` (baris 73)
* **Masalah**:
```javascript
const start = Date.now()
while (Date.now() - start < 150) {
  // micro-wait
}

```


Penggunaan while loop sinkron untuk menunggu 150ms menghabiskan 100% kapasitas satu core CPU. Seharusnya diganti dengan `setTimeout` berbasis promise asinkron.

---

### Rekomendasi Prioritas Perbaikan

1. **Prioritas 1 (Keamanan & Integritas Data)**:
* Perbaiki validasi path traversal di `git.Discard` dan `git.GetDiff`.
* Tambahkan pengecekan keberadaan file (`os.Stat`) pada `workspace.CreateFolder`/`WriteFile` agar tidak menimpa file eksisting secara tidak sengaja.
* Perbaiki `addFileToTreeLogic` di `workspaceCore.ts` dengan menghapus kondisi `|| f.name === name`.
* Terapkan perlindungan origin/token pada middleware CORS.


2. **Prioritas 2 (Stabilitas Runtime)**:
* Tambahkan fallback nilai default `fontStyle` di `DiffEditorPane.tsx`.
* Naikkan ukuran buffer `bufio.NewScanner` pada provider Claude dan OpenAI (`scanner.Buffer(...)`).
* Perbaiki tokenizer komentar di `syntax.tsx` agar tidak memotong URL di dalam string literal.

3. **Prioritas 3 (Performa & Arsitektur)**:
* Migrasikan saluran I/O terminal PTY dari kombinasi SSE + HTTP POST ke WebSocket dua arah.
* Isolasi dependensi `creack/pty` dengan build tag agar build biner Windows berjalan lancar.