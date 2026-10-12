**Ya, masih ada beberapa bugs baru yang teridentifikasi secara faktual di dalam basis kode, yang sebelumnya belum tercatat pada daftar PR issues.**

Berikut adalah temuan **Bugs Baru (Unconfirmed Issues)** hasil penelusuran mendalam terhadap modul storage, workspace search, probe AI, breadcrumbs, dan interaksi terminal:

---

### 1. [Kritis] Loop Pointer Aliasing pada Rekonsiliasi Sesi Chat

* **File**: `server/internal/store/index.go` (baris 273–295, fungsi `readFirstAndLastNodes`)
* **Masalah**:
```go
var first *GraphNode
var last *GraphNode
var node GraphNode // Dideklarasikan di luar loop

for scanner.Scan() {
    // ...
    if err := json.Unmarshal([]byte(line), &node); err != nil { continue }
    if first == nil {
        first = &node // Menyimpan pointer ke variabel 'node'
    }
    last = &node      // Menyimpan pointer ke variabel 'node' yang sama
}

```


* **Dampak**: Variabel `node` di-reuse di setiap iterasi. Saat `&node` disimpan ke `first`, iterasi berikutnya terus mengubah isi memori yang ditunjuk oleh `first`. Pada akhir loop, **`first` dan `last` menunjuk ke alamat memori yang persis sama (berisi baris terakhir)**.
* **Gejala**: Pada fungsi `ReconcileSessionsOnBoot`:
* `RootNodeID` diisi dengan ID node terakhir (bukan node root).
* `CreatedAt` diisi dengan timestamp node terakhir.
* `Title` diambil dari respon terakhir AI, bukan dari prompt pertama pengguna. Seluruh pohon riwayat chat terkorupsi saat server di-reboot.


* **Solusi**: Alokasikan struct baru di dalam loop: `node := GraphNode{}`.

---

### 2. [Kritis] Korupsi Baris Pertama File saat Pencarian Nama File

* **File**: `server/internal/workspace/workspace.go` (baris 395) & `src/components/layout/sidebar/SearchPanel.tsx` (baris 145)
* **Masalah**:
Di `workspace.go`, jika isi file tidak cocok dengan regex pencarian tetapi nama filenya cocok (`pattern.MatchString(d.Name())`), server membuat hasil palsu pada baris 1:
```go
Matches: []SearchMatch{
    { LineNumber: 1, Column: 1, LineContent: d.Name(), MatchText: d.Name() }
}

```


Di `SearchPanel.tsx`, ketika pengguna menekan tombol *"Replace Single"* pada baris tersebut:
```typescript
lines[match.lineNumber - 1] = before + replace + after

```


* **Dampak**: Frontend memotong karakter sepanjang nama file pada baris 1 file tersebut, menyuntikkan teks pengganti, dan menyimpan ke disk. **Baris pertama file pengguna terpotong dan rusak secara permanen**.

---

### 3. [Tinggi] Ketidaksesuaian Arsitektur Test Connection Claude (`probeClaude`)

* **File**: `server/internal/ai/probe.go` (baris 210) & `src/components/layout/settings/SettingsModal.tsx` (baris 107)
* **Masalah**:
* `ClaudeEngine` (`server/internal/ai/claude.go`) adalah HTTP client murni ke API Anthropic yang membutuhkan `APIKey`.
* Namun fungsi `probeClaude` di `probe.go` menguji apakah binary CLI lokal `claude --version` ada di komputer pengguna.
* `SettingsModal.tsx` juga menguji `bypassCommands.claude` alih-alih mengirimkan API Key.


* **Gejala**: Pengguna yang memasukkan Anthropic API Key valid di Settings akan selalu mendapati tombol *"Test Connection"* gagal dengan pesan:
`CLI command 'claude' not found in system PATH`.

---

### 4. [Tinggi] Provider `openai` Ditolak pada `ProbeProvider`

* **File**: `server/internal/ai/probe.go` (baris 56)
* **Masalah**:
Di `ProbeProvider`, switch-case hanya menangani:
```go
switch provider {
case "openrouter": ...
case "opencode": ...
case "claude": ...
case "antigravity": ...
default: // Melempar error "unsupported provider: openai"
}

```


* **Gejala**: Meskipun backend `engine.go` mendukung `"openai"`, endpoint pengujian koneksi menolaknya dengan error HTTP 400 *"unsupported provider: openai"*.

---

### 5. [Sedang] Tombol "Copy Terminal" & "Clear Terminal" di Header Panel Tidak Berfungsi

* **File**: `src/components/layout/bottom-panel/BottomPanel.tsx` (baris 125) & `TerminalView.tsx`
* **Masalah**:
* Tombol *"Copy terminal output"* di header membaca state `terminalLines` dari `terminalCore.ts`.
* Live terminal xterm.js di `TerminalView.tsx` menulis byte stream langsung ke canvas xterm tanpa pernah menyinkronkan barisnya ke `terminalLines`.


* **Gejala**:
* Tombol Copy selalu menyalin array kosong (atau mock data statis bawaan).
* Tombol *"Clear terminal buffer"* hanya mengosongkan state React internal dan tidak memanggil `term.clear()` di xterm.js, sehingga teks di layar terminal fisik tetap tidak terhapus.



---

### 6. [Sedang] Side-Effect Tidak Murni di Dalam React State Updater

* **File**: `src/context/core/terminalCore.ts` (baris 330)
* **Masalah**:
```typescript
setTerminalSessions((sessions) => {
  const target = sessions.find((s) => s.id === targetId)
  if (target?.isLive) {
    void sendTerminalInputApi(targetId, commandText + "\n") // Side-effect di dalam updater!
  }
  return sessions.map(...)
})

```


* **Gejala**: Di React 19 / Strict Mode, fungsi state updater dipanggil dua kali (*double invocation*) untuk mengecek kemurnian fungsi. Hal ini memicu pengiriman input terminal dua kali ke subproses PTY.

---

### 7. [Sedang] Menu Bar "File > New File", "Undo", dan "Redo" adalah Mock/Stub

* **File**: `src/context/core/workbenchFacade.ts` (baris 778, fungsi `runAction`)
* **Masalah**:
Ketika pengguna mengklik menu bar atas *File > New Text File (Ctrl+N)* atau *Edit > Undo*:
```typescript
const actionMessages = {
  "new-file": "Untitled-1 created",
  undo: "Last editor action reverted",
  redo: "Nothing to redo",
}
// ...
showToast(actionMessages[action])

```


* **Gejala**: Tidak ada file atau tab baru yang dibuat. IDE hanya memunculkan notifikasi Toast *"Untitled-1 created"*.

---

### 8. [Sedang] Breadcrumbs Menulis Hardcode `src` dan Menduplikasi Nama File

* **File**: `src/components/layout/editor/EditorBreadcrumbs.tsx` (baris 44)
* **Masalah**:
Komponen merender breadcrumb dengan hardcoded:
```tsx
<span>src</span>
<Icon name="chevron" />
<span>{currentFile}</span>

```


* **Gejala**:
* Membuka `README.md` menampilkan: `src > README.md` (padahal file berada di root).
* Membuka `server/cmd/server/main.go` menampilkan: `src > server/cmd/server/main.go`.
* Untuk file `.tsx`, jalurnya diduplikasi menjadi: `src > src/components/Button.tsx > Button`.



---

### 9. [Rendah] Hardcoded Fallback Mock Timestamp di Output View

* **File**: `src/components/layout/bottom-panel/OutputView.tsx` (baris 20)
* **Masalah**:
```typescript
const time = hasTimestamp ? line.slice(1, 9) : "10:42:08"

```


* **Gejala**: Setiap pesan log backend yang tidak diawali kurung siku timestamp akan otomatis dilabeli jam statis **`10:42:08`**.

---

### 10. [Rendah] Folder Symlink Tidak Terbaca di Explorer File Tree

* **File**: `server/internal/workspace/workspace.go` (baris 210, fungsi `buildSubTree`)
* **Masalah**: Fungsi `os.ReadDir` mengembalikan `entry.IsDir() == false` untuk symlink yang mengarah ke direktori.
* **Gejala**: Folder yang dibuat menggunakan symlink dianggap sebagai file biasa dan subdirektorinya tidak dapat di-expand di explorer.

---

### 📋 Rangkuman Tambahan Backlog

| No | Isu Baru | Level Keparahan | Komponen Terkait |
| --- | --- | --- | --- |
| **1** | Loop Pointer Aliasing pada Chat Ledger Reconcile | **Kritis (Data Corruption)** | Backend (`store/index.go`) |
| **2** | Filename Search Match merusak Baris 1 File | **Kritis (Data Corruption)** | Backend & Frontend (`workspace.go` + `SearchPanel.tsx`) |
| **3** | Mismatch Arsitektur Test Connection Claude | **Tinggi (Logic Mismatch)** | Backend & Settings (`probe.go` + `SettingsModal.tsx`) |
| **4** | Provider OpenAI ditolak di Probe Connection | **Tinggi (Missing Case)** | Backend (`probe.go`) |
| **5** | Tombol Copy & Clear Terminal tidak tersambung ke live xterm | **Sedang (Dead Control)** | Frontend (`BottomPanel.tsx`) |
| **6** | Side-effect `sendTerminalInputApi` di state updater | **Sedang (React 19 Concurrency)** | Frontend (`terminalCore.ts`) |
| **7** | Menu File New, Undo, Redo berstatus Mock/Toast | **Sedang (Feature Stub)** | Frontend (`workbenchFacade.ts`) |
| **8** | Breadcrumbs Hardcoded `src` & duplikasi path | **Rendah (Visual Glitch)** | Frontend (`EditorBreadcrumbs.tsx`) |
| **9** | Fallback jam mock statis `10:42:08` di Output View | **Rendah (Mock Leftover)** | Frontend (`OutputView.tsx`) |
| **10** | Symlink direktori tidak diekspansi di Explorer Tree | **Rendah (OS Semantics)** | Backend (`workspace.go`) |