Berdasarkan audit antarmuka (UI), hierarki tata letak (*layout*), konsistensi komponen, serta alur pengalaman pengguna (*UX*) di seluruh codebase frontend (`src/`), berikut adalah temuan inkonsistensi dan fitur esensial yang masih absen:

---

### 1. Fitur Wajib IDE yang Masih Absen (High Impact UX)

#### A. Quick Open File (`Cmd+P` / `Ctrl+P`) dengan Fuzzy Search

* **Kondisi Saat Ini**: Menekan `Cmd+P` atau `Cmd+K` saat ini membuka **Command Palette** yang hanya berisi ~10 perintah global (seperti *Open Folder*, *Toggle Theme*, *Open Settings*). Pengembang **tidak bisa mencari berkas proyek berdasarkan nama**.
* **Masalah**: Untuk membuka berkas tertentu di proyek besar, pengembang terpaksa mencari dan mengklik manual di Explorer tree atau melakukan grep text di panel Search (`Ctrl+Shift+F`).
* **Solusi Standar IDE**:
* `Cmd+P`: Khusus untuk **Quick Open File** (fuzzy matching nama berkas proyek dari daftar `files[]`).
* `Cmd+Shift+P`: Untuk **Command Palette** (daftar perintah IDE diawali tanda `>`).



#### B. Context Menu (Klik Kanan) pada Editor Kode

* **Kondisi Saat Ini**: Event `onContextMenu` hanya ada pada tab editor (`EditorTabs.tsx`) dan baris berkas (`ExplorerPanel.tsx`). Saat klik kanan di dalam editor kode (`CodePane.tsx` / `CMEditor.tsx`), yang muncul adalah menu bawaan browser default (Back, Forward, Inspect Element).
* **Fitur Esensial yang Hilang**:
* *Go to Definition* (F12) / *Peek Definition*
* *Format Document* (Shift+Alt+F)
* *Rename Symbol* (F2)
* *Cut / Copy / Paste*
* *Toggle Breakpoint* (F9)
* *Ask AEGIS AI* (mengirim potongan kode terpilih langsung ke AI Drawer).



#### C. Navigasi Cepat: "Go to Line" (`Ctrl+G`) & "Quick Tab Switcher" (`Ctrl+Tab`)

* **Kondisi Saat Ini**: Tidak ada shortcut untuk melompat langsung ke nomor baris tertentu (`:baris:kolom`) tanpa scrolling manual.
* **Solusi**: Tambahkan input mini popover `Go to Line` (`Ctrl+G` / `Cmd+G`) yang memanggil `view.dispatch({ selection: ... })`.
* Selain itu, tambahkan pergantian tab cepat berbasis riwayat (*MRU - Most Recently Used*) saat menekan `Ctrl+Tab`.

#### D. Shortcut Keyboard untuk AI Drawer (`Cmd+L` / `Ctrl+L`)

* **Kondisi Saat Ini**: Sidebar memiliki `Ctrl+B`, Bottom Panel memiliki `Ctrl+J`, tetapi AI Drawer hanya bisa dibuka lewat klik tombol icon di header.
* **Solusi**: Terapkan standar industri (Cursor / Windsurf): menekan `Cmd+L` / `Ctrl+L` langsung membuka AI Drawer dan otomatis memasukkan seleksi kode aktif ke dalam chip konteks prompt.

---

### 2. Inkonsistensi Tata Letak & Posisi UI

#### A. Floating `DebugToolbar` Menutupi Tab Editor & Breadcrumbs

* **Lokasi**: `src/components/layout/editor/DebugToolbar.tsx` (baris 35).
* **Kondisi**: Toolbar debug diposisikan `absolute top-3 left-1/2 -translate-x-1/2 z-40`.
* **Masalah**: Posisi mengambang tepat di tengah atas ini **menutupi tab editor aktif** (`EditorTabs`) dan baris path berkas (`EditorBreadcrumbs`) ketika breakpoint berhenti. Pengembang terhalang saat ingin berganti tab atau melihat nama berkas yang sedang di-debug.
* **Rekomendasi**:
1. Integrasikan tombol navigasi debug (Play, Step Over, Step Into, Stop) langsung ke dalam baris **Header Actions** di kanan atas saat debugging aktif, atau
2. Berikan *drag handle* agar toolbar mengambang bisa dipindahkan posisinya secara bebas oleh pengguna.



#### B. "Run & Debug" Absen dari Primary Activity Rail

* **Lokasi**: `src/components/layout/activity-rail/ActivityRail.tsx` (baris 6–11).
* **Kondisi**: Activity Rail hanya memiliki 3 tombol: *Explorer*, *Search*, dan *Source Control*.
* **Masalah**: Meskipun AegisCode memiliki engine debugger DAP Delve (`dlv`) yang lengkap (Phase 6.5), tampilannya hanya berupa tab horizontal di `BottomPanel`. Struktur data seperti *Variables Tree*, *Watch Expressions*, dan *Call Stack* sangat sulit dibaca di panel horizontal bawah karena membutuhkan ruang vertikal yang panjang.
* **Rekomendasi**: Tambahkan icon `debug` ke Activity Rail untuk membuka panel sidebar vertikal khusus Debug.

#### C. Floating Card Gap vs Wasted Screen Real-Estate

* **Lokasi**: `src/styles/shell.css` (baris 15–16 & 90–93).
* **Kondisi**: `.workspace` menggunakan `gap: 7px; padding: 8px 8px 5px;` dan `.workbench` memiliki `border-radius: 11px;`.
* **Masalah**:
* Tampilan *floating card* dengan sudut membulat memang terlihat estetis, tetapi membuang ~25–30px ruang kerja vertikal dan horizontal pada layar laptop kecil (13 inci).
* Batas sudut melengkung 11px berpotensi memotong nomor baris di pojok kiri atas dan scrollbar terminal di pojok kanan bawah.
* *Resize sash* selebar 6px yang diletakkan di dalam celah grid 7px membuat kursor resize mudah lepas (*flicker*) ke celah kosong background.


* **Rekomendasi**: Sediakan opsi tema layout di Settings: **"Floating Card"** (default) vs **"Full Bleed / Edge-to-Edge"** (gaya VS Code tanpa margin luar dan sudut siku-siku untuk efisiensi ruang layar maksimal).

---

### 3. Inkonsistensi Komponen & Stacking Context (`z-index`)

#### A. Kekacauan Skala `z-index` (*Stacking Wars*)

* **Temuan**: Nilai `z-index` tersebar secara acak di berbagai CSS:
* `.resize-overlay-active`: `z-index: 999999`
* Popover editor / context menu: `z-index: 99999` & `10000`
* Context menu sidebar: `z-index: 9999`
* Menu header: `z-index: 1000`
* Floating popover chat: `z-index: 100`
* Command Palette: `z-index: 60`
* Settings Modal: `z-index: 50`
* Header Bar: `z-index: 50`


* **Dampak**: `CommandPalette` (`z-index: 60`) dan `SettingsModal` (`z-index: 50`) berisiko tertembus atau tertutup oleh popover editor atau tooltip yang bernilai ribuan.
* **Solusi**: Standarisasikan tingkat elevasi `z-index` ke dalam token `tokens.css`:
```css
--z-dock: 10;        /* Header, Status Bar, Activity Rail */
--z-dropdown: 50;    /* Menu dropdown */
--z-popover: 100;    /* Tooltips, context menu */
--z-modal: 500;      /* Settings Modal, Command Palette */
--z-toast: 1000;     /* Toast notifications */
--z-drag-shield: 9999; /* Resize overlay */

```



#### B. Breadcrumb Bersifat Pasif (Non-Interactive)

* **Lokasi**: `src/components/layout/editor/EditorBreadcrumbs.tsx`.
* **Kondisi**: Breadcrumb saat ini hanya berupa teks statis yang dipisah tanda chevron (`/`).
* **Saran UX**: Pada IDE modern, mengklik salah satu segmen folder di breadcrumb akan memunculkan popover dropdown berisi daftar berkas di dalam folder tersebut, sehingga pengembang bisa berpindah berkas tanpa membuka sidebar Explorer.

#### C. Kelengkapan Menu Tab Context

* **Lokasi**: `src/components/layout/editor/EditorTabs.tsx` (baris 452–500).
* **Kondisi**: Klik kanan pada tab hanya memiliki opsi: *Close*, *Close Others*, *Close to the Right*.
* **Saran UX**: Tambahkan aksi yang sering digunakan:
* *Copy Relative Path* / *Copy Path*
* *Reveal in Explorer* (langsung menyorot berkas tersebut di pohon file sidebar)
* *Pin Tab* (agar tab penting tidak tertutup saat membuka berkas baru).



---

### Matriks Rangkuman Rekomendasi UX

| Kategori | Fitur / Isu | Tindakan Rekomendasi |
| --- | --- | --- |
| **Navigasi (Kritis)** | Quick Open (`Cmd+P`) | Pisahkan pencarian berkas dari Command Palette |
| **Editor (Kritis)** | Klik kanan di editor | Buat custom Editor Context Menu (F12, Format, Rename) |
| **Layout (Tinggi)** | Debug Toolbar menutupi tab | Pindahkan ke Header Actions atau buat dockable |
| **Layout (Tinggi)** | Run & Debug di Activity Rail | Tambahkan tab Debug khusus di sidebar vertikal |
| **Aksesibilitas (Sedang)** | Shortcut AI Drawer | Tambahkan `Cmd+L` / `Ctrl+L` dengan selection context |
| **Visual (Sedang)** | Standarisasi `z-index` | Satukan skala modal, popover, dan dropdown |
| **Ergonomi (Rendah)** | Breadcrumb & Tab actions | Buat breadcrumb interaktif + opsi *Reveal in Explorer* |