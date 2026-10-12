Berikut adalah **rencana pentahapan implementasi (*Implementation Phases*)** untuk menambahkan **Git Conflict Resolution Editor** pada AegisCode, dirancang secara presisi berdasarkan arsitektur dan struktur kode saat ini:

---

### Arsitektur Alur Resolusi Konflik

```
[Git CLI (Status 'u')] ➔ [Go Server API] ➔ [gitCore State] ➔ [Source Control Panel]
                                                                     │
                                    ┌────────────────────────────────┴────────────────────────┐
                                    ▼                                                         ▼
                      [Inline CodeLens di CMEditor]                         [Dedicated Conflict Editor]
                      (Deteksi <<<<<<<, =======, >>>>>>>)                   (3-Way / Side-by-Side MergeView)

```

---

### Phase 1: Backend Go Engine & Deteksi Unmerged Entry

**Target**: Membaca status konflik Git dari `--porcelain=v2` dan menyediakan endpoint ekstraksi konten 3 versi (*Base*, *Ours*, *Theirs*).

1. **Update `RepoStatus` Struct (`server/internal/git/git.go:34-45`)**:
* Tambahkan field `Conflicted []GitChange` pada `RepoStatus`:
```go
type RepoStatus struct {
    // ...
    Staged     []GitChange `json:"staged"`
    Unstaged   []GitChange `json:"unstaged"`
    Conflicted []GitChange `json:"conflicted"` // Berkas dengan konflik belum terselesaikan
}

```




2. **Parser Baris `u ` di `GetStatus` (`server/internal/git/git.go:365-460`)**:
* Saat ini parser hanya mengenali baris `1 ` (modified), `2 ` (renamed), dan `? ` (untracked).
* Tambahkan penanganan baris berawalan `u ` (*unmerged entries*):
```go
// Unmerged entry: u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
if strings.HasPrefix(line, "u ") {
    parts := strings.SplitN(line, " ", 11)
    if len(parts) >= 11 {
        filePath := parts[10]
        status.Conflicted = append(status.Conflicted, GitChange{
            Code:   parts[1], // e.g. "UU", "AA", "UD", "DU"
            File:   filePath,
            Status: "conflict",
        })
    }
    continue
}

```




3. **Endpoint Konten Konflik 3-Stage (`server/internal/api/api.go` & `git.go`)**:
* Tambahkan endpoint `GET /api/v1/git/conflict/content?file=<relPath>`:
* Baca **Ours (Current)**: `git show :2:<file>`
* Baca **Theirs (Incoming)**: `git show :3:<file>`
* Baca **Base (Ancestor)**: `git show :1:<file>`
* Baca **Working Tree**: `os.ReadFile(fullPath)` (berisi marker `<<<<<<<`)


* Tambahkan endpoint `POST /api/v1/git/conflict/resolve`:
* Menerima payload `{ file: string, resolvedContent: string }`.
* Tulis konten bersih ke disk, lalu jalankan `git add -- <file>` untuk menandai resolusi selesai.





---

### Phase 2: Frontend State Management & Type Registry

**Target**: Memperluas state Git di React agar mengenali daftar berkas yang berkonflik.

1. **Perbarui Tipe Data (`src/types/workbench.ts:320-330`)**:
```typescript
export interface RepoStatus {
  // ...
  staged: GitChange[]
  unstaged: GitChange[]
  conflicted: GitChange[] // Baru
}

```


2. **Perbarui State Git (`src/context/core/gitCore.ts:140-200`)**:
* Tambahkan state `const [conflictedChanges, setConflictedChanges] = useState<GitChange[]>([])`.
* Update `refreshGitStatus`:
```typescript
setConflictedChanges(status.conflicted || [])

```


* Tambahkan fungsi aksi `resolveGitConflict(file: string, content: string)`:
* Menyimpan konten bersih via `saveWorkspaceFile`.
* Memanggil `stageGitChange(file)` untuk menandai *conflict resolved*.




3. **Tab Descriptor Baru (`src/utils/gitDiffTab.ts`)**:
* Tambahkan helper tab:
* `makeGitConflictTab(file: string): string` -> `git-conflict:${file}`
* `isGitConflictTab(tab?: string): boolean`





---

### Phase 3: Integrasi UI di Source Control Panel

**Target**: Menampilkan section **"Merge Conflicts"** dengan aksen peringatan di panel Source Control.

1. **Modifikasi `src/components/layout/sidebar/SourceControlPanel.tsx**`:
* Letakkan section **Merge Conflicts** di paling atas (sebelum *Staged Changes*):
```tsx
{conflictedChanges.length > 0 && (
  <div className="conflict-section border-b border-line pb-2 mb-2">
    <div className="section-header text-[var(--color-warning)] font-medium flex items-center justify-between">
      <span className="flex items-center gap-1.5">
        <Icon name="alert" size={13} />
        <span>Merge Conflicts ({conflictedChanges.length})</span>
      </span>
    </div>
    <div className="conflict-list">
      {conflictedChanges.map((change) => (
        <div key={change.file} className="conflict-item flex items-center justify-between">
          <button onClick={() => openConflictEditor(change.file)} className="truncate text-left">
            {change.file}
          </button>
          <span className="badge badge-warning">Conflicted</span>
        </div>
      ))}
    </div>
  </div>
)}

```




2. **Indikator Badge di File Explorer (`src/utils/explorerGitStatus.ts`)**:
* Tambahkan badge `!` atau `C` berwarna merah/oranye untuk berkas dalam `conflictedChanges`.



---

### Phase 4: CodeMirror 6 Inline CodeLens Extension

**Target**: Memberikan tombol aksi interaktif tepat di atas penanda konflik di dalam editor (`CMEditor.tsx`).

1. **Buat Extension `src/components/layout/editor/cm-extensions/conflictMarkers.ts**`:
* Buat CodeMirror 6 `ViewPlugin` yang memindai regex penanda konflik:
```text
<<<<<<< HEAD (Current Change)
[Baris Konten A]
=======
[Baris Konten B]
>>>>>>> branch-name (Incoming Change)

```


* Pasang CodeLens widget di atas baris `<<<<<<<`:
* Tombol: **Accept Current** | **Accept Incoming** | **Accept Both**


* **Logika Eksekusi Penggantian (*Replacement Dispatch*)**:
```typescript
function acceptCurrent(view: EditorView, from: number, to: number, currentText: string) {
  view.dispatch({
    changes: { from, to, insert: currentText }
  })
}

```




2. **Pewarnaan Sintaks Khusus Blok Konflik**:
* Gunakan `Decoration.mark` dengan Tailwind semantic tokens:
* Blok *Current*: Latar hijau lembut (`bg-[var(--color-success)]/10`).
* Blok *Incoming*: Latar biru lembut (`bg-[var(--color-accent)]/10`).
* Garis pembatas `=======`: Border pemisah yang jelas.





---

### Phase 5: Dedicated 3-Way / Split Conflict View

**Target**: Antarmuka visual resolusi konflik untuk berkas kompleks yang membutuhkan perbandingan komprehensif.

1. **Buat Komponen `src/components/layout/editor/ConflictEditorPane.tsx**`:
* Memanfaatkan `@codemirror/merge` (`MergeView`) yang sudah terpasang di codebase:
* **Pane Kiri (Read-Only)**: *Ours / Current Change* (`:2:file`)
* **Pane Kanan (Read-Only)**: *Theirs / Incoming Change* (`:3:file`)
* **Pane Tengah / Bawah (Live Editable Buffer)**: Hasil resolusi aktif (*Working Copy*).




2. **Floating Action Bar di Bagian Atas Pane**:
* **Conflict Counter**: Menampilkan indikator `X of Y conflicts remaining`.
* **Navigasi Cepat**: Tombol `Previous Conflict` dan `Next Conflict`.
* **Tombol Finalisasi**:
* `Complete Merge & Stage`: Tombol ini memverifikasi bahwa tidak ada lagi string `<<<<<<<` di dokumen, menyimpan berkas, dan memicu `stageChange(file)`.





---

### Phase 6: Verifikasi Kualitas & Automated Tests

**Target**: Menjamin keandalan alur resolusi tanpa regresi.

1. **Backend Unit Tests (`server/internal/git/git_test.go`)**:
* Inisialisasi repo sementara, buat dua branch yang mengubah baris yang sama, picu `git merge` berkonflik.
* Verifikasi bahwa `GetStatus` mendeteksi berkas dengan status `conflict` dan masuk ke `status.Conflicted`.


2. **Frontend Unit Tests (`test/frontend/editor/conflictMarkers.test.ts`)**:
* Uji parser penanda konflik: pastikan klik pada *Accept Current*, *Accept Incoming*, dan *Accept Both* menghasilkan teks yang bersih tanpa sisa penanda `<<<<<<<` atau `>>>>>>>`.


3. **Gerbang Verifikasi Mandatori**:
* Jalankan `npm run format`, `npm test`, dan verifikasi build TypeScript lolos tanpa error.