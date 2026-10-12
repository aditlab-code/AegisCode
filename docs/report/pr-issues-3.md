Berikut adalah **Laporan Audit Khusus Front-End IDE AegisCode** (React 19 + TypeScript + Tailwind CSS v4).

Laporan ini dikelompokkan ke dalam 5 kategori:

1. **Crash Fatal & Unhandled Exceptions**
2. **Integritas Data, State Management & Logika File**
3. **Kemacetan Kinerja (*Performance Bottlenecks*) & Input Lag**
4. **Bug Syntax Highlighting, Parser & Linter**
5. **Celah Keamanan & Validasi Input UI**

---

## 1. Crash Fatal & Unhandled Exceptions

### 1.1. Crash Runtime pada Diff Editor saat `inheritEditorFont` Dinonaktifkan

* **File**: `src/components/layout/editor/DiffEditorPane.tsx` (baris 53 & baris 337, 347, 375, 379, 427)
* **Penyebab**:
```typescript
const fontStyle = inheritEditorFont
  ? {
      fontFamily: "var(--editor-font-family, monospace)",
      fontSize: "var(--editor-font-size, 11px)",
      lineHeight: "var(--editor-line-height, 20px)",
    }
  : undefined

```


Di dalam JSX, terdapat beberapa baris yang langsung mengakses `style={{ lineHeight: fontStyle.lineHeight }}`.
* **Gejala**: Ketika pengguna mematikan pengaturan *"Inherit Editor Font"* di Settings (`inheritEditorFont: false`), `fontStyle` bernilai `undefined`. Komponen langsung melempar exception:
```text
TypeError: Cannot read properties of undefined (reading 'lineHeight')

```


Hal ini menyebabkan tab editor diff mengalami *white-screen crash*.
* **Solusi**: Gunakan fallback aman:
```typescript
style={{ lineHeight: fontStyle?.lineHeight ?? "20px" }}

```



---

### 1.2. Mode "Unified View" pada Diff Editor Tidak Terimplementasi

* **File**: `src/components/layout/editor/DiffEditorPane.tsx` (baris 248 & 316)
* **Penyebab**:
Tombol toggle *Side-by-Side / Unified View* mengubah state `renderSideBySide` menjadi `false`. Namun di blok rendering, komponen hanya membungkus kolom kiri (Original) dengan `renderSideBySide && (...)`, sementara kolom kanan (Modified) tetap dirender biasa. Komponen **tidak pernah mem-parsing atau menampilkan payload `diffData.diff**` yang berisi baris `+` dan `-`.
* **Gejala**: Saat pengguna beralih ke mode Unified, tampilan hanya menyembunyikan panel kiri dan membiarkan file kanan terbuka sebagai editor biasa tanpa indikator diff.

---

### 1.3. Format Parsing Lokasi Rusak Total pada `ProblemsView.tsx`

* **File**: `src/components/layout/bottom-panel/ProblemsView.tsx` (baris 80)
* **Penyebab**:
```typescript
const locationParts = diag.location.split(":")
const filename = locationParts[0] || diag.location
const lineCol =
  locationParts.length > 1
    ? `Ln ${locationParts[1]}, Col ${locationParts[2] || 1}`
    : "Ln 1, Col 1"

```


Linter di `src/utils/linter.ts` memformat lokasi menggunakan tanda kurung siku: `${filename} [${line}, ${col}]` (bukan titik dua `:`).
* **Gejala**:
* `diag.location.split(":")` hanya menghasilkan 1 elemen array (`locationParts.length === 1`).
* Kolom **File** pada tabel menampilkan string kotor: `src/App.tsx [12, 5]`.
* Kolom **Location** selalu *fallback* menjadi **`Ln 1, Col 1`** untuk seluruh error dan warning di workspace.
* Tombol *"Ask AI"* mengirim prompt yang salah (`...at Ln 1, Col 1:...`).


* **Solusi**: Gunakan regex match yang konsisten dengan `navigateToDiagnostic`:
```typescript
const match = diag.location.match(/^([^[\s]+)\s*\[(\d+),\s*(\d+)\]/)
const filename = match ? match[1] : diag.location
const lineCol = match ? `Ln ${match[2]}, Col ${match[3]}` : "Ln 1, Col 1"

```



---

## 2. Integritas Data, State Management & Logika File

### 2.1. Penolakan Penambahan File Baru Bernama Sama di Beda Folder (`addFileToTreeLogic`)

* **File**: `src/context/core/workspaceCore.ts` (baris 46)
* **Penyebab**:
```typescript
if (files.some((f) => f.path === path || f.name === name)) {
  return files
}

```


* **Gejala**: Pengecekan `|| f.name === name` menggunakan *basename* file tanpa path direktori. Jika workspace sudah memiliki `src/index.ts`, maka file baru `lib/index.ts`, `tests/index.ts`, atau `components/Button/index.tsx` akan **ditolak secara diam-diam** dan tidak muncul di explorer tree.
* **Solusi**: Cukup validasi keunikan path lengkap:
```typescript
if (files.some((f) => f.path === path)) return files

```



---

### 2.2. File di Subdirektori Berpindah ke Root saat Di-Rename di Windows

* **File**: `src/context/core/workspaceCore.ts` (baris 920) & `ExplorerPanel.tsx` (baris 388)
* **Penyebab**:
```typescript
const parentDir = oldPath.includes("/")
  ? oldPath.substring(0, oldPath.lastIndexOf("/"))
  : ""
const newPath = parentDir ? `${parentDir}/${clean}` : clean

```


Di sistem Windows, path file sering menggunakan pemisah backslash (`\`). Pengecekan `oldPath.includes("/")` menghasilkan `false`, sehingga `parentDir` kosong.
* **Gejala**: Ketika file seperti `src\components\Button.tsx` di-rename menjadi `Btn.tsx`, `newPath` hanya menjadi `Btn.tsx`. File tersebut **pindah dari subfolder ke root workspace**.
* **Solusi**: Normalisasi pemisah path terlebih dahulu:
```typescript
const normalizedOld = oldPath.replace(/\\/g, "/")
const lastSlash = normalizedOld.lastIndexOf("/")
const parentDir = lastSlash !== -1 ? normalizedOld.substring(0, lastSlash) : ""

```



---

### 2.3. Shadowing Fungsi `normalizeWorkspacePath`

* **File**: `src/context/core/workspaceCore.ts` (baris 33 & 180)
* **Penyebab**:
Fungsi `normalizeWorkspacePath` diimpor dari `workspaceApi` (dengan 2 argumen: `(path, rootWorkspacePath)`). Namun, di baris 180 dideklarasikan fungsi lokal dengan nama yang sama persis tetapi hanya menerima 1 argumen (`(path: string)`).
* **Gejala**: Pada baris 602 (`normalizeWorkspacePath(filename, rootWorkspacePath)`), JavaScript memanggil fungsi lokal yang mengabaikan argumen kedua. Akibatnya, path absolut dari dialog sistem tidak dipangkas prefix workspace root-nya, menghasilkan key buffer ganda/tidak sinkron di `fileBuffers`.

---

### 2.4. Kehilangan Perubahan Pesan Chat saat Tab Ditutup (*Unsaved Chat Data Loss*)

* **File**: `src/context/core/chatCore.ts` (baris 406)
* **Penyebab**:
Penyimpanan sesi chat ke backend menggunakan debounce 3 detik:
```typescript
useEffect(() => {
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  saveTimerRef.current = setTimeout(() => {
    saveBackendChatSession(activeSession).catch(() => {})
  }, 3000)
}, [activeSession])

```


* **Gejala**: Jika pengguna mengirim prompt atau menerima respon AI lalu me-refresh halaman atau menutup browser dalam rentang waktu < 3 detik, timer dibatalkan pada saat *unmount*. Pesan terbaru **hilang dan tidak tersimpan di disk**.
* **Solusi**: Tambahkan listener `beforeunload` untuk melakukan *immediate flush* menggunakan `navigator.sendBeacon` atau pemanggilan simpan sinkron sebelum jendela ditutup.

---

### 2.5. Over-Matching pada Exclude Pattern Context Extractor

* **File**: `src/context/core/contextExtractorCore.ts` (baris 44)
* **Penyebab**:
```typescript
const cleanPattern = pattern
  .replace(/\\/g, "")
  .replace(/\*\*/g, "")
  .replace(/^\/|\/$/g, "")
if (cleanPattern && normalized.includes(cleanPattern)) {
  return true
}

```


* **Gejala**: Pola default seperti `**/dist/**` dibersihkan menjadi substring `"dist"`. Pengecekan `normalized.includes("dist")` menyebabkan file valid seperti `src/distribution.ts`, `distributeHelper.ts`, atau `digital.ts` **salah dieksklusi** dari context AI.

---

## 3. Kemacetan Kinerja (*Performance Bottlenecks*) & Input Lag

### 3.1. Ketiadaan Virtual Scrolling pada `CodePane.tsx`

* **File**: `src/components/layout/editor/CodePane.tsx` (baris 430 & 503)
* **Masalah**: Seluruh baris kode dirender ke DOM via `lines.map(...)`.
* **Dampak**:
* Pada file berukuran 2.000–5.000 baris, React me-render 4.000–10.000 elemen DOM secara bersamaan.
* Setiap kali pengguna mengetik satu huruf, fungsi `tokenizeLine` dipanggil ulang ribuan kali pada main thread.
* Menimbulkan *typing stutter* (latensi pengetikan > 150ms) dan konsumsi memori browser membengkak.



---

### 3.2. Kompleksitas $O(M \times N)$ Ekstrem pada `EditorFindWidget.tsx`

* **File**: `src/components/layout/editor/EditorFindWidget.tsx` (baris 90–105)
* **Penyebab**:
```typescript
while ((match = regex.exec(content)) !== null) {
  const textBefore = content.substring(0, index)
  const linesBefore = textBefore.split("\n") // Dilakukan di setiap match!
  const line = linesBefore.length
  const col = linesBefore[linesBefore.length - 1].length + 1
  // ...
}

```


* **Dampak**: Jika pencarian menghasilkan 1.000 kecocokan pada file teks 1 MB, kode ini memotong dan men-split string 1 MB sebanyak 1.000 kali berturut-turut pada setiap ketukan keyboard di kotak pencarian. Ini langsung membekukan (*freeze*) browser tab selama 2–5 detik.
* **Solusi**: Hitung indeks offset baris satu kali di awal (*line-offset table*), lalu gunakan *binary search* untuk menentukan nomor baris dan kolom.

---

### 3.3. Blocking I/O Disk (`localStorage.setItem`) pada Setiap Pixel Sash Drag

* **File**: `src/context/core/layoutCore.ts` (baris 186, 215, 238)
* **Penyebab**: Pemanggilan `window.localStorage.setItem` dilakukan langsung di dalam callback resize yang dipanggil di setiap event `mousemove`.
* **Dampak**: Menyeret batas panel memicu puluhan operasi blocking disk per detik, menyebabkan *jank* dan *dropped frames* parah saat mengubah ukuran sidebar atau panel bawah.
* **Solusi**: Pindahkan penyimpanan ke `localStorage` hanya pada callback `onResizeEnd` (saat mouse dilepas).

---

### 3.4. Mutasi DOM Berlebihan pada `syncBrowserAiContext`

* **File**: `src/App.tsx` (baris 45) & `src/utils/browserAiSync.ts`
* **Penyebab**: `useEffect` di `App.tsx` bergantung pada `[cursorPosition, fileBuffers]`. Pada setiap pergerakan kursor atau ketukan tombol, fungsi ini menjalankan kueri DOM (`document.querySelector`) dan memutasi 6 tag `<meta>` di `<head>` serta 7 atribut `data-aegis-*` pada root container, ditambah pengiriman `CustomEvent`.
* **Dampak**: Main-thread *churn* yang tidak perlu selama proses pengetikan biasa.

---

## 4. Bug Syntax Highlighting, Parser & Linter

### 4.1. URL di Dalam String Terpotong Menjadi Komentar Abu-abu

* **File**: `src/utils/syntax.tsx` (baris 147)
* **Penyebab**:
```typescript
const commentIdx = line.indexOf("//")
if (commentIdx !== -1) {
  const codePart = line.slice(0, commentIdx)
  const commentPart = line.slice(commentIdx)
  return [
    ...tokenizeLine(codePart, todoOptions),
    <span className="text-muted" key={`inline-comment-${commentIdx}`}>
      {renderCommentWithTodo(commentPart, "inline-comment", todoOptions)}
    </span>,
  ]
}

```


* **Gejala**: Kode seperti `const apiUrl = "[https://api.example.com/v1](https://api.example.com/v1)"` memiliki karakter `//` di dalam URL. Syntax highlighter langsung memotong string tersebut: `https:` dianggap string terbuka, dan `//[api.example.com/v1](https://api.example.com/v1)"` diwarnai sebagai komentar abu-abu.
* **Solusi**: Parse string literal terlebih dahulu sebelum mencari token komentar `//`.

---

### 4.2. Regex Tokenizer String Gagal Membaca *Escaped Quotes*

* **File**: `src/utils/syntax.tsx` (baris 159)
* **Penyebab**: Regex string menggunakan `(".*?"|'.*?'|`.*?`)` non-greedy.
* **Gejala**: Jika terdapat string yang mengandung tanda petik yang di-escape (misal `const s = "Hello \"world\""`), regex berhenti pada tanda petik pertama sebelum kata `world`, memecah string menjadi token terpisah dan merusak pewarnaan baris tersebut.
* **Solusi**: Gunakan regex yang menghandle escape: `("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\.|[^`\\])*`)`.

---

### 4.3. Hilangnya Spasi Pembatas Sebelum `@mention` Pill

* **File**: `src/components/layout/chat/MarkdownRenderer.tsx` (baris 494)
* **Penyebab**:
Regex inline mention mencocokkan `(?:^|\s)@[a-zA-Z0-9_\-./]+`.
Jika teks berupa `"Check @src/App.tsx for details"`, `match[0]` bernilai `" @src/App.tsx"`.
Kode kemudian melakukan `raw.trim().startsWith("@")` dan merender tombol mention **tanpa mengembalikan karakter spasi sebelumnya**.
* **Gejala**: Teks rendered menjadi `"Check<button>@src/App.tsx</button>for details"` tanpa spasi, sehingga tombol pill menempel erat dengan kata sebelumnya.

---

## 5. Celah Keamanan & Validasi Input UI

### 5.1. XSS Execution Vector pada Markdown Link (`javascript:...`)

* **File**: `src/components/layout/chat/MarkdownRenderer.tsx` (baris 507)
* **Penyebab**:
```typescript
const linkMatch = raw.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
if (linkMatch) {
  nodes.push(
    <a href={linkMatch[2]} target="_blank" rel="noopener noreferrer">
      {linkMatch[1]}
    </a>
  )
}

```


* **Dampak Keamanan**: Tidak ada validasi skema protokol pada `linkMatch[2]`. Jika LLM menghasilkan respons berisi link `[Click to debug](javascript:fetch(...))`, mengklik link tersebut akan mengeksekusi payload JavaScript di dalam konteks web workbench.
* **Solusi**: Validasi protokol URL agar hanya mengizinkan `http:` dan `https:`:
```typescript
const url = linkMatch[2].trim()
const isSafe = /^https?:\/\//i.test(url)
const safeHref = isSafe ? url : "#"

```



---

### 5.2. Potensi Keystroke Out-of-Order pada Terminal PTY

* **File**: `src/components/layout/bottom-panel/TerminalView.tsx` (baris 125) & `src/utils/terminalApi.ts`
* **Penyebab**:
Setiap buffer ketikan dikirim menggunakan `fetch("/api/v1/terminal/:id/input", { method: "POST" })` secara independen tanpa antrean promise terurut (*in-flight serialization*).
* **Dampak**: Pada latensi jaringan yang fluktuatif atau saat pengguna mengetik cepat, paket POST kedua bisa sampai di backend lebih dulu daripada paket pertama, menyebabkan karakter input tertukar urutannya di sesi terminal.
* **Solusi**: Gunakan antrean berantai (*promise queue*) atau alihkan input terminal ke WebSocket.

---

## Ringkasan Matriks Perbaikan Front-End

| Komponen | Isu / Bug | Tingkat Keparahan | Solusi Utama |
| --- | --- | --- | --- |
| **`DiffEditorPane.tsx`** | Crash `fontStyle.lineHeight` saat font inheritance nonaktif | **Kritis (Crash)** | Gunakan optional chaining `fontStyle?.lineHeight ?? "20px"` |
| **`ProblemsView.tsx`** | Lokasi error selalu `Ln 1, Col 1` karena split `":"` | **Tinggi (Cacat Logika)** | Ganti split `":"` dengan regex match `\[(\d+),\s*(\d+)\]` |
| **`workspaceCore.ts`** | File beda folder bernama sama ditolak di explorer tree | **Tinggi (Integritas Data)** | Hapus ` |
| **`EditorFindWidget.tsx`** | Browser freeze saat mencari kata yang banyak kecocokan | **Tinggi (Performa)** | Ganti loop `split("\n")` per match dengan index tabel baris |
| **`CodePane.tsx`** | Render seluruh baris DOM tanpa virtual scrolling | **Tinggi (Performa)** | Terapkan windowing/virtual scroll pada gutter & syntax layer |
| **`layoutCore.ts`** | `localStorage.setItem` sinkron pada setiap pergeseran mouse | **Sedang (Performa/Jank)** | Pindahkan simpan `localStorage` ke `onResizeEnd` |
| **`syntax.tsx`** | URL `https://...` dipotong menjadi komentar abu-abu | **Sedang (Cacat Visual)** | Parse token string literal sebelum token komentar `//` |
| **`MarkdownRenderer.tsx`** | Eksekusi `javascript:` URL via markdown link | **Tinggi (Keamanan)** | Filter href agar hanya mengizinkan `http://` dan `https://` |