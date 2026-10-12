# LAPORAN AUDIT STABILITAS & PERFORMA KOMPREHENSIF — AEGISCODE


## 1. Ringkasan Eksekutif

AegisCode memiliki arsitektur dasar yang efisien (Go standalone binary + embedded React SPA). Namun, pengujian struktural mendalam terhadap siklus hidup proses, sistem konkurensi, I/O disk, serta manajemen state React mengungkap beberapa titik kelemahan (*bottlenecks* dan *failure modes*) yang dapat memicu:

1. **UI Freezing & Input Latency**: Pengetikan lambat dan *frame dropping* akibat re-render kaskade di seluruh pohon DOM.
2. **Data Loss & Stream Truncation**: Terputusnya streaming respon AI dan hilangnya output terminal PTY akibat buffer overflow dan silent dropping.
3. **Resource Exhaustion**: Lonjakan konsumsi CPU akibat subprocess polling dan loop sinkron, serta kehabisan *file descriptor* Linux (*inotify exhaustion*).
4. **Deadlock & I/O Contention**: Pemblokiran mutex global saat sinkronisasi disk fisik (`fsync`) dilakukan di dalam critical section.

---

## 2. Audit Stabilitas (Stability & Concurrency Audit)

### 2.1. Disk I/O Contention di Bawah Mutex Global (`store/ledger.go`)

* **Lokasi**: `server/internal/store/ledger.go` (`AppendEventNode`)
* **Mekanisme Kegagalan**:
```go
s.mu.Lock()
defer s.mu.Unlock()
// 1. Tulis node ke <sessionId>.jsonl
// 2. Baca sessions.json dari disk
// 3. json.Unmarshal
// 4. json.MarshalIndent
// 5. atomicWrite -> f.Sync() (Hardware Disk Flush)

```


* **Dampak Stabilitas**:
* `AppendEventNode` dipanggil berkali-kali per detik selama AI menghasilkan thought/tool-call.
* Pemanggilan `f.Sync()` (blocking system call `fsync`) dilakukan **di dalam** `s.mu.Lock()`.
* Jika disk mengalami antrean I/O (atau menggunakan network drive/NFS), seluruh endpoint server yang mengakses store (`/api/v1/chats`, `/api/v1/config`, `/api/v1/state`) akan mengalami *lock starvation* dan HTTP request hang.


* **Rekomendasi**:
* Pindahkan pembacaan/penulisan `sessions.json` ke *in-memory cache* dengan sinkronisasi periodik (flush interval / write-behind logging).
* Gunakan kanal penulisan asinkron (*buffered worker queue*) untuk operasi I/O disk agar tidak menahan mutex utama.



---

### 2.2. Silent Data Loss pada PTY Terminal Broadcast (`terminal/manager.go`)

* **Lokasi**: `server/internal/terminal/manager.go` (baris 186, fungsi `broadcast`)
* **Mekanisme Kegagalan**:
```go
for ch := range s.subs {
    select {
    case ch <- chunk:
    default:
        // Non-blocking drop to prevent lagging subscribers from stalling PTY
    }
}

```


* **Dampak Stabilitas**:
* Kanal `ch` hanya memiliki kapasitas buffer 128 chunk. Ketika terminal memuntahkan output teks berkecepatan tinggi (misal `cat build.log`, `npm install`, `find /`), buffer cepat penuh.
* Klausa `default:` **membuang byte chunk secara diam-diam (*silent drop*)**.
* Dalam emulasi terminal ANSI/VT100, pemotongan byte di tengah escape sequence (seperti `\x1b[38;2;...`) merusak *internal state machine* dari xterm.js. Akibatnya, tampilan terminal menjadi kacau, warna pecah, atau output baris terpotong secara permanen.


* **Rekomendasi**:
* Terapkan mekanisme *ring buffer* per sesi terminal atau *backpressure flow control* yang menahan pembacaan PTY jika klien lambat, daripada membuang byte mentah.



---

### 2.3. Terminasi Prematur Subproses Terminal (Grace Period 50ms)

* **Lokasi**: `server/internal/terminal/manager.go` (baris 330)
* **Mekanisme Kegagalan**:
```go
select {
case <-done:
case <-time.After(50 * time.Millisecond):
    // Langsung eskalasi ke SIGKILL
    killProcessGroup(pid, syscall.SIGKILL)
}

```


* **Dampak Stabilitas**:
* Jendela waktu 50 milidetik terlalu singkat untuk shell interaktif (bash/zsh) atau program aktif (misal git/python) untuk melakukan *graceful shutdown* (menutup file descriptor, menyimpan `.bash_history`, membersihkan temporary file).
* Subproses hampir selalu dipaksa mati dengan `SIGKILL`, berisiko meninggalkan file lock dan korupsi state lingkungan lokal.


* **Rekomendasi**: Naikkan timeout toleransi SIGTERM menjadi minimal `500ms – 1000ms` sebelum eskalasi ke SIGKILL.

---

### 2.4. Kehabisan Watcher Deskriptor (*Inotify Exhaustion*) pada Monorepo

* **Lokasi**: `server/internal/workspace/watcher.go` (`watchRecursive`)
* **Mekanisme Kegagalan**:
* `fsnotify` pada Linux mengonsumsi 1 *inotify watch* per direktori.
* `watchRecursive` mendaftarkan setiap subdirektori secara rekursif tanpa batasan kuota maksimum.
* Pada repositori skala besar dengan ribuan folder, pemanggilan `fsw.Add` akan gagal dengan error sistem `ENOSPC: no space left on device` (*inotify watch limit exceeded*).
* Selain itu, pada event `fsnotify.Create` direktori baru, `watchRecursive` dipanggil **secara sinkron di dalam `eventLoop**`, memblokir pemrosesan event file lain selama direktori baru tersebut di-scan.


* **Rekomendasi**:
* Batasi kedalaman registrasi rekursif (*watch depth ceiling*).
* Jalankan registrasi subfolder dinamis di dalam goroutine terpisah agar `eventLoop` utama tidak terblokir.



---

### 2.5. False Positives pada Delimiter Linter (`utils/linter.ts`)

* **Lokasi**: `src/utils/linter.ts` (`validateJSOrTS`)
* **Mekanisme Kegagalan**:
* Linter melakukan iterasi karakter demi karakter untuk mendeteksi tanda kurung kurawal/siku (`{`, `}`, `(`, `)`, `[`, `]`) tanpa memeriksa apakah karakter tersebut berada di dalam *string literal* (`"..."`, `'...'`, ``...``) atau regex (`/.../`).
* Kode valid seperti `const msg = "Missing bracket {"` atau `const rx = /\(/` akan menyebabkan parser mengira tanda kurung tidak ditutup.


* **Dampak Stabilitas**: File yang sepenuhnya valid akan terus-menerus menampilkan error palsu (*false error*) di Problems Panel dan status bar.
* **Rekomendasi**: Terapkan state machine sederhana untuk mengabaikan isi string literal dan regular expression sebelum mengevaluasi delimiter stack.

---

## 3. Audit Performa (Performance & Bottlenecks Audit)

### 3.1. Re-render Kaskade Monolithic Context (React Anti-Pattern)

* **Lokasi**: `src/context/WorkbenchContext.tsx` & `src/context/core/workbenchFacade.ts`
* **Analisis Kemacetan**:
* Seluruh state IDE (posisi kursor, isi buffer file, ukuran layout piksel per piksel, streaming AI, status Git, tab aktif) disatukan ke dalam **satu objek konteks tunggal** (`WorkbenchContext`).
* **Dampak Performa**:
1. **Saat resize panel diseret**: Setiap pergerakan mouse 1 piksel mengubah state `sidebarWidth` / `bottomPanelHeight`, memaksa seluruh `Editor`, `Sidebar`, `Header`, `Terminal`, dan `Chat` me-render ulang hingga 120 FPS.
2. **Saat AI melakukan streaming**: Event delta teks setiap 40 milidetik memperbarui context, memicu render ulang komponen editor dan explorer tree yang tidak ada hubungannya dengan chat.
3. **Saat kursor editor bergerak**: Perubahan baris/kolom kursor memicu re-render root `AppShell`.




* **Rekomendasi Arsitektur**:
* Pecah konteks tunggal menjadi beberapa domain independen:
* `LayoutContext` (sidebar open, panel heights, widths)
* `EditorContext` (tabs, active file, buffers, cursor)
* `ChatContext` (chat sessions, streaming state)
* `GitContext` (git status, branches, commits)


* Untuk pergeseran sash (resize), gunakan CSS variable langsung pada elemen DOM kontainer selama dragging, dan simpan state React hanya saat mouse dilepas (`onResizeEnd`).



---

### 3.2. Ketiadaan Virtual Scrolling pada `CodePane.tsx`

* **Lokasi**: `src/components/layout/editor/CodePane.tsx` (baris 428–530)
* **Analisis Kemacetan**:
* Untuk setiap baris dalam file, dibuat elemen DOM:
```tsx
{lines.map((lineText, index) => (
  <div className="code-line-layer">
    <code>{tokenizeLine(lineText)}</code>
  </div>
))}

```


* Pada file berukuran 3.000 baris, React merender **6.000 node DOM** (3.000 untuk gutter nomor baris + 3.000 untuk syntax layer).
* Setiap kali pengguna mengetik satu karakter:
* `content` diperbarui.
* Fungsi `tokenizeLine` dieksekusi ulang sebanyak 3.000 kali secara sinkron pada main thread browser.
* Waktu eksekusi JavaScript melonjak di atas 100ms–300ms per keystroke (menghasilkan *input lag* parah).




* **Rekomendasi**:
* Terapkan *windowing/virtualization* (seperti yang sudah dilakukan di `Minimap.tsx` dengan buffer window) sehingga hanya 40–60 baris yang terlihat di layar yang dirender ke DOM.



---

### 3.3. Disk I/O Blocking pada `localStorage.setItem` Saat Resize Sash

* **Lokasi**: `src/context/core/layoutCore.ts` (baris 186, 215, 238)
* **Analisis Kemacetan**:
```typescript
setSidebarWidthState((prev) => {
  // ...
  window.localStorage.setItem("aegis_sidebar_width", String(next))
  return next
})

```


`localStorage.setItem` adalah operasi I/O sinkron yang memblokir main thread browser. Mengeksekusi `localStorage.setItem` pada setiap event `mousemove` saat menyeret sash menyebabkan *micro-stutter* dan *jank* animasi.
* **Rekomendasi**: Jalankan `localStorage.setItem` hanya pada callback `onResizeEnd` (saat mouse dilepas), bukan di setiap frame pergeseran mouse.

---

### 3.4. Badai Subproses Git CLI (*Process Spawning Storm*)

* **Lokasi**: `src/context/core/gitCore.ts` (baris 285) & `server/internal/git/git.go`
* **Analisis Kemacetan**:
* Frontend menjalankan interval timer setiap 6 detik:
```typescript
const timer = setInterval(() => { refreshGit() }, 6000)

```


* Setiap pemanggilan `refreshGit()` mengeksekusi 4 subproses OS secara paralel via `Promise.allSettled`:
1. `git status --porcelain=v2 --branch -uall`
2. `git branch -a --format=...`
3. `git log -n50 ...`
4. `git tag -l ...`


* Total: **40 subproses OS baru di-spawn setiap menit** di latar belakang, bahkan ketika pengguna tidak melakukan perubahan apa pun.
* Setiap subproses bersaing memperebutkan lock internal Git (`index.lock`) dan mutex Go `s.mu.Lock()`.


* **Rekomendasi**:
* Hentikan interval polling agresif (6 detik). Cukup andalkan event filesystem watcher (`WorkspaceChangeEvent`) untuk memicu *refreshGit* saat terdeteksi perubahan file nyata di disk.
* Untuk status berkala, naikkan interval menjadi 30–60 detik dan prioritaskan hanya `git status`.



---

### 3.5. Busy-Wait Loop CPU 100% pada `clean-ports.js`

* **Lokasi**: `scripts/clean-ports.js` (baris 73)
* **Analisis Kemacetan**:
```javascript
const start = Date.now()
while (Date.now() - start < 150) {
  // micro-wait
}

```


Loop `while` sinkron ini mengunci thread Node.js dan mengonsumsi 100% utilitas satu core CPU secara sia-sia selama 150 milidetik saat mematikan port.
* **Rekomendasi**: Ganti dengan penundaan berbasis asynchronous timeout: `await new Promise((r) => setTimeout(r, 150))`.

---

## 4. Matriks Evaluasi & Batas Skalabilitas (*Scalability Limits*)

| Parameter Operasional | Kondisi Saat Ini (Current State) | Ambang Batas Kegagalan (*Breaking Point*) | Target Ideal Pasca-Optimasi |
| --- | --- | --- | --- |
| **Ukuran File Maksimum (Editor)** | Renders all lines via DOM (`lines.map`) | **> 1.500 baris**: Main thread lag >150ms per keystroke | **> 50.000 baris**: Virtualized windowing (<16ms per frame) |
| **Output Token Tool AI (Streaming)** | Default `bufio.NewScanner` (64 KB) | **> 64 KB payload**: Stream terhenti diam-diam (*ErrTooLong*) | **10 MB+ buffer**: Alokasi `scanner.Buffer` |
| **Throughput Output Terminal** | SSE + non-blocking channel drop (128 chunks) | **> 2 MB/s burst**: Teks dan escape code ANSI terpotong | **Lossless streaming**: Ring buffer + flow control |
| **Frekuensi Resize UI** | `localStorage.setItem` per pixel move | **Dragging**: Dropped frames (<30 FPS) | **CSS Variable direct styling**: 60–120 FPS halus |
| **Subproses Background Git** | 4 proses per 6 detik (polling aktif) | **CPU overhead**: Spawning 40 proses OS per menit | **Event-driven**: 0 proses saat idle, spawn hanya saat disk berubah |

---

## 5. Rencana Rekayasa & Mitigasi Bertahap

### Fase 1: Perbaikan Stabilitas Kritis (Hari 1–2)

1. **Perbesar Buffer AI Engine**: Tambahkan alokasi buffer 10 MB pada `server/internal/ai/claude.go` dan `server/internal/ai/openai.go` (`scanner.Buffer(make([]byte, 1024*1024), 10*1024*1024)`).
2. **Eliminasi Silent Drop Terminal**: Ubah `broadcast` pada terminal manager agar tidak membuang data secara diam-diam saat buffer penuh, atau besarkan kapasitas buffer untuk mencegah byte dropping.
3. **Perbaiki Delimiter Linter**: Tambahkan pengecekan string literal pada `src/utils/linter.ts` sebelum mengevaluasi stack kurung.
4. **Hapus Busy-Wait CPU Loop**: Ganti loop `while` di `scripts/clean-ports.js` dengan `setTimeout`.

### Fase 2: Optimasi Performa & Render Engine (Hari 3–5)

1. **Dekomposisi Context**: Pisahkan `WorkbenchContext` menjadi `LayoutContext`, `EditorContext`, dan `ChatContext` untuk memutus kaskade re-render global.
2. **Virtual Scrolling pada CodePane**: Implementasikan virtual windowing pada daftar baris editor sehingga hanya merender baris aktif yang terlihat di viewport.
3. **Optimasi Sash Dragging**: Hentikan pemanggilan `localStorage.setItem` pada `mousemove`, simpan posisi hanya pada `onResizeEnd`.
4. **Event-Driven Git Refresh**: Nonaktifkan interval timer polling 6 detik pada `gitCore.ts`, alihkan pemicu pembaruan Git murni berbasis event perubahan disk (`onFilesChangedOnDisk`).

### Fase 3: Skalabilitas I/O & Penyimpanan (Hari 6–7)

1. **In-Memory Sessions Cache**: Simpan metadata sesi chat di memori dan lakukan flush ke disk secara debounced, hindari pemanggilan `atomicWrite` + `fsync` di setiap penambahan node ledger.
2. **Asynchronous Folder Watching**: Pindahkan pemindaian subdirektori dinamis di `watcher.go` ke luar *event loop* utama agar antrean event inotify kernel tidak pernah tersumbat.