# BAGIAN 1: ROADMAP MILESTONE STABILISASI

```
[Milestone 1: Data Safety & Anti-Crash] ➔ [Milestone 2: AI Pipeline & Stream] ➔ [Milestone 3: UI & Performa] ➔ [Milestone 4: Release Packaging]

```

### Milestone 1: Data Safety & Zero-Crash (Paling Kritis)

*Fokus: Memastikan software tidak merusak/menghapus file pengguna dalam kondisi apa pun.*

1. Pasang proteksi `os.Stat` sebelum `createFile` (tolak dengan HTTP 409 jika file sudah ada).
2. Perbaiki sanitasi boundary path pada `git.Discard` dan `git.GetDiff` (cegah *path traversal* keluar workspace).
3. Hapus `f.name === name` di `addFileToTreeLogic` (izinkan file beda folder bernama sama).
4. Tambahkan fallback opsional `fontStyle?.lineHeight` pada `DiffEditorPane.tsx`.

### Milestone 2: AI Pipeline & Streaming Reliability

*Fokus: Alur LLM, tool-calling, dan review gate berjalan tanpa truncation atau ghosting.*

1. Alokasikan buffer 10 MB (`scanner.Buffer`) pada reader SSE Claude dan OpenAI (`ai/claude.go` & `ai/openai.go`).
2. Perbaiki parsing regex delimiter komentar di `syntax.tsx` agar tidak memotong URL `"https://..."`.
3. Validasi skema URL markdown link agar menolak protokol selain `http/https` (cegah XSS).
4. Normalisasi `block.targetPath` pada tombol *Apply All* di `ChatMessageList.tsx`.

### Milestone 3: UI Responsiveness & Input Latency

*Fokus: Menghilangkan lag pengetikan dan frame dropping saat multitasking.*

1. Pindahkan penyimpanan `localStorage.setItem` pada resize sash ke callback `onResizeEnd`.
2. Optimasi pencarian di `EditorFindWidget.tsx` dengan tabel baris tunggal (ganti loop `split("\n")`).
3. Ganti polling aktif Git interval 6 detik menjadi sinkronisasi berbasis event file (`WorkspaceChangeEvent`).
4. Perbaiki format parsing lokasi di `ProblemsView.tsx` agar membaca `[line, col]` dengan benar.

### Milestone 4: Cross-Platform & Build Readiness

*Fokus: Kelancaran build dan distribusi.*

1. Berikan build tag khusus Unix pada `creack/pty` agar target biner Windows dapat dikompilasi.
2. Ganti busy-wait loop `while` sinkron di `scripts/clean-ports.js` dengan penundaan asinkron.
3. Uji native wrapper macOS (`.dmg`) dan standalone binary di Linux/macOS.

---

# BAGIAN 2: TABEL KELAYAKAN MANUAL QA (TEST MATRIX)

Gunakan tabel pengujian manual berikut sebagai checklist verifikasi:

### Kategori A: Workspace & Integritas File

| ID | Skenario Uji | Langkah Pengujian | Kriteria Lulus (PASS) | Status |
| --- | --- | --- | --- | --- |
| **A-01** | Cegah Penimpaan File Eksisting | Klik *New File*, ketik nama file yang sudah ada (misal `README.md`), tekan Enter. | Muncul error/toast *"File already exists"*; konten lama `README.md` **TIDAK terhapus**. | [ ] Lulus |
| **A-02** | File Bernama Sama di Beda Folder | Buat file `src/index.ts`, lalu buat file `test/index.ts`. Buka explorer tree. | **Kedua file muncul** di foldernya masing-masing; tidak ada yang hilang diam-diam. | [ ] Lulus |
| **A-03** | Rename File di Subdirektori | Buat `src/components/Header.tsx`, rename menjadi `Navbar.tsx`. | Path tetap di `src/components/Navbar.tsx` (tidak berpindah ke folder root). | [ ] Lulus |
| **A-04** | Keamanan Hapus File Root | Coba panggil API delete dengan path `.` atau root folder. | Server menolak permintaan; direktori root workspace tidak terhapus. | [ ] Lulus |
| **A-05** | Deteksi Perubahan Eksternal | Buka file `App.tsx` di editor, lalu edit isi file tersebut via terminal/aplikasi lain. | Jika tab bersih: reload otomatis. Jika dirty: muncul badge konflik tanpa menimpa ketikan. | [ ] Lulus |

---

### Kategori B: Git & Version Control

| ID | Skenario Uji | Langkah Pengujian | Kriteria Lulus (PASS) | Status |
| --- | --- | --- | --- | --- |
| **B-01** | Keamanan Git Discard (Anti-Traversal) | Buat file modifikasi di luar repo, kirim payload discard dengan path `../../file`. | Server menolak dengan error *escapes root*; file di luar repo **aman/tidak terhapus**. | [ ] Lulus |
| **B-02** | Keamanan Git Diff | Panggil `GET /api/v1/git/diff?file=../../../../etc/hosts`. | Server mengembalikan HTTP 400/404; file sistem operasi tidak terbaca. | [ ] Lulus |
| **B-03** | Diff Editor Font Setting Toggle | Buka tab Diff, masuk ke *Settings*, matikan opsi *Inherit Editor Font*. | Tampilan diff tetap render normal; **TIDAK terjadi white-screen crash**. | [ ] Lulus |
| **B-04** | Staging & Commit Flow | Buat file baru, klik *Stage (+)*, isi pesan commit, klik *Commit*. | File masuk ke riwayat commit graph; status unstaged bersih kembali. | [ ] Lulus |

---

### Kategori B: Editor & Syntax Engine

| ID | Skenario Uji | Langkah Pengujian | Kriteria Lulus (PASS) | Status |
| --- | --- | --- | --- | --- |
| **C-01** | Highlighting String dengan URL | Ketik kode: `const api = "[https://api.github.com/v1](https://api.github.com/v1)"` di editor. | Teks URL tetap diwarnai sebagai **string hijau**; tidak terpotong menjadi komentar abu-abu. | [ ] Lulus |
| **C-02** | String dengan Escaped Quotes | Ketik kode: `const s = "Hello \"world\" text"`. | Seluruh kalimat dirender utuh sebagai satu string; kata `world` tidak pecah. | [ ] Lulus |
| **C-03** | File dengan Kurung di String (Linter) | Ketik kode JS: `const label = "Item (1) {new}";`. Buka Problems Panel. | **Tidak ada error palsu** *"Unclosed delimiter"* atau *"Mismatched delimiter"*. | [ ] Lulus |
| **C-04** | Pencarian Kata Frekuensi Tinggi | Buka file >1.000 baris, tekan `Ctrl+F`, ketik huruf `e` atau kata umum lainnya. | Hasil pencarian muncul instan; browser **tidak mengalami freeze/lag**. | [ ] Lulus |
| **C-05** | Navigasi Problems Panel | Buka Problems Panel, klik salah satu baris problem. | Kolom Location menampilkan nomor baris asli; klik baris melompat ke baris yang sesuai di editor. | [ ] Lulus |

---

### Kategori D: AI Assistant & Tool Execution

| ID | Skenario Uji | Langkah Pengujian | Kriteria Lulus (PASS) | Status |
| --- | --- | --- | --- | --- |
| **D-01** | Tool-Call Kode Skala Besar (>64 KB) | Minta AI: *"Buatkan mock data JSON 2.000 baris"* menggunakan model Claude/OpenAI. | Stream berjalan lancar hingga selesai; **tidak terhenti tiba-tiba** di tengah jalan. | [ ] Lulus |
| **D-02** | Keamanan Link Markdown | Minta/ketik link markdown berformat `[Klik](javascript:alert(1))`. | Klik link tidak mengeksekusi skrip JavaScript di browser. | [ ] Lulus |
| **D-03** | Review Gate Code Application | AI mengusulkan kode dengan format `ts:src/calc.ts`. Klik *Apply All*. | Kode diaplikasikan dan otomatis membuka tab Git Diff untuk peninjauan pengguna. | [ ] Lulus |
| **D-04** | Spasi pada Inline Mention | Ketik chat: `Periksa @src/App.tsx untuk fungsi ini`. | Tombol pill `@src/App.tsx` memiliki spasi pemisah normal dari kata *"Periksa"*. | [ ] Lulus |

---

### Kategori E: Terminal PTY & Runtime

| ID | Skenario Uji | Langkah Pengujian | Kriteria Lulus (PASS) | Status |
| --- | --- | --- | --- | --- |
| **E-01** | Output Terminal Skala Cepat | Buka terminal, jalankan perintah output deras: `ls -laR` atau `cat large_file`. | Seluruh teks tampil bersih; warna ANSI **tidak rusak** dan terminal tidak freeze. | [ ] Lulus |
| **E-02** | Ketikan Cepat Terminal | Ketik perintah panjang dengan cepat (misal `git status --short`). | Karakter masuk sesuai urutan ketikan; tidak ada huruf yang tertukar letaknya. | [ ] Lulus |
| **E-03** | Penutupan Tab Terminal | Jalankan proses yang berjalan lama (misal `top` atau `ping`), lalu tutup tab terminal. | Subproses OS berhenti dengan bersih; tidak ada proses *zombie/orphan* yang tertinggal di background. | [ ] Lulus |

---

### Kategori F: UI Layout & Performa

| ID | Skenario Uji | Langkah Pengujian | Kriteria Lulus (PASS) | Status |
| --- | --- | --- | --- | --- |
| **F-01** | Kehalusan Penyeretan Panel (Resize) | Seret batas sash sidebar dan bottom panel secara cepat bolak-balik. | Animasi pergeseran berjalan mulus (60 FPS); tidak ada *stutter* patah-patah. | [ ] Lulus |
| **F-02** | Persistensi Layout Pasca-Reload | Ubah ukuran sidebar menjadi 350px, lalu refresh browser (`F5`). | Lebar sidebar tetap berada di posisi 350px setelah halaman termuat ulang. | [ ] Lulus |
| **F-03** | Multi-Tab Editor Unsaved Dialog | Edit file tanpa disimpan (`dirty`), lalu klik tombol silang (`X`) pada tab. | Muncul modal konfirmasi *"Do you want to save changes?"* dengan opsi Save/Don't Save/Cancel. | [ ] Lulus |

---

### Cara Menggunakan Checklist Ini:
**Target Minimum Indie IDE**: Semua tes di **Kategori A (Integritas File)** dan **Kategori B-01/B-02/B-03 (Keamanan & Crash)** harus bernilai **PASS (Lulus)**.