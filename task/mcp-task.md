## Siapkan MCP Codegrapf
- baca @go-mcp.md dan @feature-backend.md 
- singkronisasikan knowledge berdasarkan documentasi backend dan codebase 
- Siapkan mekanisme codegraf AST dikoneksikan ke database per - workspace 
- Implementasi menggunakan extractir GO.ast, dan TypeSript/JS sesuai LSP symbol aktif


Mengirimkan raw Abstract Syntax Tree (AST) secara langsung ke AI provider adalah *anti-pattern* utama yang menyebabkan latensi tinggi, pemborosan token (*context window bloat*), dan hilangnya fokus reasoning model (*lost-in-the-middle*). Satu file 300 baris kode jika di-*dump* sebagai raw AST JSON bisa membengkak menjadi puluhan ribu token.

Agar CodeGraph MCP dapat merespons dalam hitungan milidetik dan diterima instan oleh AI provider, terapkan **5 Level Strategi Hierarkis (Progressive Disclosure)** berikut:

---

### Level 1: Semantic Condensation (AST $\to$ Graph Projection)

AI tidak membutuhkan *parser grammar nodes* (seperti `BasicLit`, `Ident`, `FieldList`), melainkan **semantiknya**. Kompresi AST dilakukan di sisi Go core sebelum menyentuh MCP:

* **Skeletonization / Header Pruning**: Simpan dan kirimkan hanya *signature* dan docstring, bukan implementasi body (`func CalculateTotal(items []Item) (float64, error) { ... }`).
* **Relational Flattening**: Ekstrak AST menjadi relasi diskrit tingkat tinggi di SQLite (`code_symbols` dan `code_edges`) saat ingestion. Saat AI query, jangan kirim tree AST—kirim tuple relasi terindeks:
```json
{ "symbol": "ProcessOrder", "calls": ["ValidateCart", "ChargeStripe"], "kind": "method" }

```


* **Token Reduction Ratio**: Reduksi ukuran payload dari AST mentah ke skeleton mencapai **90–95%**, memotong latensi TTFT (*Time To First Token*) AI secara drastis.

---

### Level 2: Progressive Disclosure (Zoom-Level Queries)

Beri AI kemampuan menavigasi kode secara bertahap (*on-demand*), mirip cara manusia menelusuri repositori:

| Level Zoom | Tool MCP | Ukuran Payload | Kegunaan AI |
| --- | --- | --- | --- |
| **L0: Outline** | `get_file_outline` | $< 150$ token | Mengetahui daftar fungsi/tipe dalam file tanpa membaca isinya. |
| **L1: Signature** | `get_symbol_definition` | $< 80$ token | Melihat parameter, return type, dan docstring satu fungsi. |
| **L2: Topology** | `find_callers` / `find_callees` | $< 120$ token | Melacak *call chain* langsung (1 hop) untuk evaluasi *blast radius*. |
| **L3: Surgical Subgraph** | `query_subgraph(depth=1..2)` | $< 400$ token | Memetakan dependensi multi-hop hanya untuk modul terkait. |
| **L4: Source Body** | `read_symbol_body` | Sesuai kode | Hanya diambil ketika AI benar-benar akan merefaktor fungsi tersebut. |

Dengan hierarki ini, AI memulai dari L0/L1 dan hanya turun ke L4 pada target fungsi yang spesifik.

---

### Level 3: Database & Transport Optimization

Memastikan latensi eksekusi di sisi server Go tetap di bawah 10 ms:

* **Surgical SQL via Indexed Lookups**:
Semua query MCP wajib bersandar pada indeks B-Tree SQLite (`idx_symbols_name`, `idx_edges_source`, `idx_edges_target`) atau FTS5 (`symbol_fts`). Hindari *full-table scan*.
* **Compact JSON Output**:
Gunakan representasi array atau string terkompresi pada payload MCP JSON-RPC, bukan nested JSON berulang.
```json
// Verbose (Boros Token)
[{"source": {"name": "A", "file": "x.go"}, "target": {"name": "B", "file": "y.go"}}]

// Compact (Efisien)
["A (x.go) -> calls -> B (y.go:42)"]

```


* **Stdio Buffer & Streaming**:
Jika menggunakan transport Stdio (MCP default), gunakan buffered I/O di Go (`bufio.Writer` dengan *immediate flush*) agar frame JSON-RPC 2.0 terkirim tanpa overhead *chunking* HTTP.

---

### Level 4: Guardrail & Budget Allocation

Mencegah MCP meledak ketika AI memanggil fungsi pada simbol global yang memiliki ribuan referensi (misal: logger atau util umum):

* **Hard Edge Limit (Pagination/Top-K)**:
Batas default `LIMIT 20` untuk `find_callers` dan `find_references`. Jika melebihi batas, kembalikan metadata ringkas:
```json
{
  "matches": [...20 items...],
  "total_count": 142,
  "truncated": true,
  "hint": "Gunakan filter file_path untuk mempersempit pencarian."
}

```


* **Max Depth Cap pada Subgraph**:
Kunci `depth` maksimal di angka `2`. Relasi graf berjarak 3 hop ke atas dalam proyek besar menghasilkan kombinatorial ledakan node ($O(b^d)$) yang dapat menghabiskan context window.

---

### Level 5: In-Memory Hot-Path Caching (LRU)

* Simpan hasil query graf untuk simbol-simbol yang sering diakses (seperti *entry points*, *core interfaces*, dan *data models*) dalam struktur LRU memory cache di proses Go backend (`sync.Map` atau `hashicorp/golang-lru`).
* Invalidate cache secara instan hanya untuk file yang terkena mutasi saat event disk-watcher mendeteksi perubahan `SHA-256`.

---

### Ringkasan Alur Eksekusi

```text
[Disk Watcher: Ctrl+S]
       │
       ▼
[Go Parser: go/ast / Tree-Sitter] (Hanya ambil ident, sig, doc, call)
       │
       ▼
[SQLite Core Cache] (code_symbols & code_edges terindeks)
       │
       ▼
[MCP Query Handler] (Terapkan Top-K limit & format Compact JSON)
       │
       ▼
[AI Context Window] (< 200 token terstruktur, surgical, instan diterima)

```

* **Debounce On-Save** mengatur **Kapan** (*Timing & Trigger*) agar sistem tidak lag.
* **Git Diff** menentukan **Apa** (*Scope & Filter*) yang sebenarnya berubah agar parser tidak memproses file yang tidak perlu.

Jika Anda hanya mengandalkan salah satunya, ada kelemahan mendasar yang muncul.

---

### Perbandingan Karakteristik

| Kebutuhan | Hanya Debounce On-Save | Hanya Git Diff | **Kombinasi (Rekomendasi)** |
| --- | --- | --- | --- |
| **Saat Developer Mengetik & Simpan 1 File** | Sangat cepat ($< 1$ ms via hash Go) | Boros process (*spawn* CLI git tiap save butuh $20\text{--}50$ ms) | **Cepat & Ringan**: On-Save memicu update langsung pada 1 file tersebut tanpa memanggil git. |
| **Saat Ganti Branch / `git pull` (Ratusan File)** | Disk watcher kebanjiran ratusan event sekaligus | Sangat cepat mengetahui daftar file yang berubah | **Efisien**: Deteksi perubahan `.git/HEAD`, lalu minta Git Diff daftar filenya saja. |
| **Deteksi Baris/Fungsi yang Berubah** | Harus parse seluruh file | Tahu persis baris ke berapa yang berubah (*hunk*) | **Surgical**: Git Diff menunjukkan rentang baris, CodeGraph memetakan simbol mana yang terdampak. |
| **File Baru / Untracked** | Langsung terdeteksi | Butuh flag `untracked` khusus | Keduanya saling mem-backup. |

---

### Arsitektur Integrasi yang Ideal

Bagi pipeline ingestion Anda menjadi 2 jalur:

```text
               ┌── Event: Editor Simpan File (Ctrl+S)
               │    └─► Debounce 300ms ─► Cek Hash File ─► Re-parse 1 File (< 5ms)
Pemicu Perubahan
               └── Event: Operasi Git (Switch Branch / Git Pull / Merge)
                    └─► Jalankan `git diff --name-only` ─► Batch Ingest File Terkait

```

#### 1. Jalur Cepat (Hot-Path): On-Save + In-Memory Hash

Untuk aktivitas coding sehari-hari:

* Jangan panggil `exec.Command("git", "diff", ...)` setiap kali developer menekan `Ctrl+S`, karena memanggil *process OS* berulang-ulang membebani CPU.
* Cukup gunakan **Debounce On-Save** + validasi hash SHA-256 langsung di memory Go. Jika hanya 1 file yang disimpan, langsung parse file tersebut dan update SQLite.

#### 2. Jalur Makro: Git Diff untuk Batch Operations

Gunakan Git Diff saat terjadi perubahan skala besar:

* Pantau file `.git/HEAD` atau `.git/index`. Jika file ini berubah (artinya developer baru saja `git checkout`, `git pull`, atau `git stash pop`):
* Eksekusi satu kali query:
```bash
git diff --name-only HEAD@{1} HEAD
# atau untuk working tree:
git status --porcelain

```


* Anda langsung mendapatkan daftar 20 atau 50 file yang berubah tanpa perlu memindai seluruh repositori (menghindari *full repo re-scan*).

---

### Nilai Tambah: Fitur *Graph-Augmented Git Diff* untuk AI

Dengan menggabungkan Git Diff dan CodeGraph, Anda bisa memberikan tool MCP yang sangat kuat untuk AI, yaitu **Analisis Dampak Perubahan (*Impact Analysis*)**:

1. **Git Diff** mendeteksi bahwa developer mengubah baris 45–60 di `auth.go`.
2. **CodeGraph** memetakan bahwa baris tersebut adalah fungsi `ValidateSession()`.
3. **MCP Tool** (`get_diff_impact`) langsung menyajikan konteks lengkap ke AI:
```json
{
  "changed_symbol": "ValidateSession",
  "file": "auth.go",
  "impacted_callers": [
    { "caller": "HandleLogin", "file": "routes.go", "line": 88 },
    { "caller": "AuthMiddleware", "file": "middleware.go", "line": 24 }
  ]
}

```

AI provider dapat langsung mengetahui fungsi lain mana saja yang berpotensi *break* akibat perubahan tersebut tanpa harus membaca seluruh isi file proyek.