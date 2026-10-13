# Spesifikasi Arsitektur & Rencana Implementasi: Graph MCP UI (SQLite3 + Cytoscape.js)

> **Dokumen Target**: AegisCode IDE — Sub-Fase 2 (Visual CodeGraph & UI Engine)  
> **Status**: Draf Perencanaan Teknis  
> **Kompatibilitas**: Pure-Go SQLite (`modernc.org/sqlite`), Wails v2/v3 Desktop IPC, Cytoscape.js

---

## 1. Ikhtisar Arsitektur (High-Level Architecture)

Graph MCP UI adalah antarmuka visual graf kode interaktif di dalam AegisCode yang memetakan ketergantungan fungsi, method, dan interface secara langsung dari basis data **SQLite3 lokal** (`~/.aegis/graphs/<workspace_hash>.db`). 

Arsitektur ini **tidak menggunakan file perantara JSON statis**, melainkan mengeksekusi query relasional SQLite3 murni dari Go, lalu menyalurkan struct data ke frontend melalui Wails IPC bindings untuk dirender pada HTML5 Canvas menggunakan Cytoscape.js.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          AegisCode Desktop                             │
├─────────────────────────────────────┬──────────────────────────────────┤
│           FRONTEND (UI)             │          BACKEND (Go Core)       │
│                                     │                                  │
│  ┌───────────────────────────────┐  │  ┌────────────────────────────┐  │
│  │  GraphViewPanel.tsx           │  │  │  codegraph.UIService       │  │
│  │  ├─ GraphToolbar (Filter)     │  │  │  ├─ GetNeighborhood()      │  │
│  │  ├─ Cytoscape Canvas (Dagre)  │  │  │  ├─ GetCallHierarchy()     │  │
│  │  └─ NodeInspector (Detail)    │  │  │  └─ SearchSymbols()        │  │
│  └───────────────▲───────────────┘  │  └─────────────▲──────────────┘  │
│                  │                  │                │                 │
│         Wails IPC Bindings          │         Recursive CTE / SQL      │
│     (Go Struct ➔ TS Interface)     │                │                 │
│                  │                  │  ┌─────────────▼──────────────┐  │
│                  └──────────────────┼──┤  Project SQLite3 Database  │  │
│                                     │  │  - code_symbols            │  │
│                                     │  │  - code_edges              │  │
│                                     │  │  - symbol_fts              │  │
│                                     │  └────────────────────────────┘  │
└─────────────────────────────────────┴──────────────────────────────────┘
```

---

## 2. Lapisan Database: SQL Query Patterns (SQLite3)

Query graf dioptimalkan untuk meminimalkan latensi ($< 5\text{ ms}$) menggunakan **Recursive Common Table Expressions (CTE)** berbatas kedalaman (*depth-capped*) dan indeks B-Tree yang sudah dibuat pada Fase 1.

### 2.1. Query Subgraf Bertingkat (Recursive Neighborhood)
Query ini mengambil node pusat dan seluruh tetangganya hingga kedalaman $N$ (maksimal 2 hop):

```sql
WITH RECURSIVE traverse(symbol_id, current_depth) AS (
    -- Anchor: Simbol Pusat
    SELECT id, 0 FROM code_symbols WHERE id = :root_id
    UNION
    -- Recursive Step: Hubungkan Source dan Target
    SELECT 
        CASE 
            WHEN e.source_symbol_id = t.symbol_id THEN e.target_symbol_id 
            ELSE e.source_symbol_id 
        END,
        t.current_depth + 1
    FROM code_edges e
    JOIN traverse t ON (e.source_symbol_id = t.symbol_id OR e.target_symbol_id = t.symbol_id)
    WHERE t.current_depth < :max_depth
)
SELECT DISTINCT 
    s.id, s.name, s.kind, s.signature, s.doc_comment,
    s.line_start, s.line_end, f.path AS file_path
FROM traverse tr
JOIN code_symbols s ON s.id = tr.symbol_id
JOIN graph_files f ON f.id = s.file_id
LIMIT :node_limit;
```

### 2.2. Query Edges Penghubung
Setelah kumpulan node diperoleh, ambil seluruh edge yang menghubungkan node-node tersebut:

```sql
SELECT 
    e.id, e.source_symbol_id, e.target_symbol_id, e.relation, e.line_number
FROM code_edges e
WHERE e.source_symbol_id IN (SELECT symbol_id FROM traverse)
  AND e.target_symbol_id IN (SELECT symbol_id FROM traverse);
```

### 2.3. Query Hierarki Pemanggil (Call Tree / Callers Only)
Untuk visualisasi pohon panggilan satu arah (*upstream*):

```sql
SELECT 
    s_caller.id AS caller_id,
    s_caller.name AS caller_name,
    s_caller.kind AS caller_kind,
    f.path AS file_path,
    e.line_number
FROM code_edges e
JOIN code_symbols s_caller ON s_caller.id = e.source_symbol_id
JOIN graph_files f ON f.id = s_caller.file_id
WHERE e.target_symbol_id = :target_id 
  AND e.relation = 'calls'
LIMIT 50;
```

---

## 3. Lapisan Backend Go: Layanan UI & Wails Bindings

Backend Go mengekspos struct yang siap dikonsumsi langsung oleh TypeScript tanpa serialisasi manual.

### 3.1. Struktur Data (`server/internal/codegraph/ui_types.go`)

```go
package codegraph

type UIGraphNode struct {
    ID        int64  `json:"id"`
    Name      string `json:"name"`
    Kind      string `json:"kind"`      // "function", "method", "interface", "class"
    Signature string `json:"signature"` // misal: "func ValidateSession(ctx context.Context) error"
    FilePath  string `json:"filePath"`
    LineStart int    `json:"lineStart"`
    LineEnd   int    `json:"lineEnd"`
    Doc       string `json:"doc,omitempty"`
    IsActive  bool   `json:"isActive"`  // true jika simbol ini yang sedang dibuka di tab editor aktif
}

type UIGraphEdge struct {
    ID       int64  `json:"id"`
    SourceID int64  `json:"sourceId"`
    TargetID int64  `json:"targetId"`
    Relation string `json:"relation"` // "calls", "implements", "references"
    Line     int    `json:"line"`
}

type UIGraphPayload struct {
    RootID    int64         `json:"rootId"`
    Nodes     []UIGraphNode `json:"nodes"`
    Edges     []UIGraphEdge `json:"edges"`
    Truncated bool          `json:"truncated"`
}
```

### 3.2. Service Layer (`server/internal/codegraph/ui_service.go`)

```go
package codegraph

import (
    "context"
    "database/sql"
)

type UIService struct {
    db *sql.DB
}

func NewUIService(db *sql.DB) *UIService {
    return &UIService{db: db}
}

// GetSymbolNeighborhood mengeksekusi CTE berbatas kedalaman
func (s *UIService) GetSymbolNeighborhood(ctx context.Context, symbolID int64, depth int) (*UIGraphPayload, error) {
    if depth < 1 { depth = 1 }
    if depth > 2 { depth = 2 } // Guardrail: Max 2 hop

    payload := &UIGraphPayload{
        RootID: symbolID,
        Nodes:  make([]UIGraphNode, 0, 32),
        Edges:  make([]UIGraphEdge, 0, 48),
    }

    // 1. Eksekusi CTE Nodes
    // 2. Eksekusi Edges
    // 3. Bind ke struct dan return
    return payload, nil
}

// GetActiveFileGraph memuat simbol dalam file aktif untuk inisialisasi cepat
func (s *UIService) GetActiveFileGraph(ctx context.Context, filePath string) (*UIGraphPayload, error) {
    // Ambil semua simbol di file tersebut beserta relasi langsungnya
    return nil, nil
}
```

---

## 4. Lapisan Frontend: Cytoscape.js & Komponen UI

### 4.1. Pemilihan Library & Plugin
* **Core Engine**: `cytoscape` (v3.x) — Render HTML5 Canvas berkecepatan tinggi.
* **Layout Hierarkis**: `cytoscape-dagre` — Menata relasi pohon pemanggilan (*call hierarchy*) dari atas ke bawah.
* **Layout Jaringan**: `cytoscape-fcose` — Menata graf klaster berbasis gaya pegas (*force-directed*). COSE
* **Navigasi**: `cytoscape-navigator` (Minimap kecil di pojok bawah).

### 4.2. Struktur Modul Frontend (`frontend/src/features/codegraph/`)

```text
frontend/src/features/codegraph/
├── components/
│   ├── GraphViewContainer.tsx    # Tab panel utama di samping editor
│   ├── GraphCanvas.tsx           # Wrapper canvas Cytoscape.js
│   ├── GraphToolbar.tsx          # Filter kind, depth selector, layout toggle
│   ├── NodeInspector.tsx         # Panel samping info simbol, docstring, & navigasi baris
│   └── GraphMinimap.tsx          # Minimap viewport
├── hooks/
│   ├── useGraphData.ts           # State management & pemanggil Wails backend
│   └── useEditorSync.ts          # Sinkronisasi event kursor koding & AI highlight
├── styles/
│   └── graphTheme.ts             # Palette styling node & edge (dark mode IDE)
└── types/
    └── codegraph.ts              # TypeScript interfaces hasil generate Wails
```

> DILETAKKAN DI Bottom Panel 'MCP' dengan pop over MCP Codegraff Aktif maka ada kolom untuk membuka modal Grafik Codegraf
* Catatan Untuk popover Style dan Layoutnya Mirip dengan LSP ingat REUSE

### 4.3. Tema Visual & Styling Node (Cytoscape Stylesheet)

Node dibedakan berdasarkan warna aksen tipe simbol (*kind*):

| Kind | Warna Node | Bentuk | Keterangan |
| :--- | :--- | :--- | :--- |
| **Function / Method** | `#3B82F6` (Blue) | Round Rectangle | Fungsi logika eksekusi |
| **Interface** | `#10B981` (Emerald) | Diamond / Hexagon | Kontrak abstraksi |
| **Class / Struct / Type** | `#8B5CF6` (Purple) | Ellipse | Struktur data |
| **Active Target** | `#F59E0B` (Amber Glow) | Border 3px Solid | Simbol yang sedang dibuka kursor |
| **AI Discussed** | `#EC4899` (Pink Pulse) | Animated Glow | Simbol yang sedang dibahas agen AI |

---

## 5. Model Interaktivitas IDE & Sinkronisasi Dua Arah

### 5.1. Editor $\to$ Graph View (*Follow Cursor*)
Saat developer menavigasi kursor di editor kode:
1. Editor mendeteksi simbol pada posisi baris kursor.
2. Mengirim event ke hook `useEditorSync`:
   ```ts
   window.dispatchEvent(new CustomEvent('aegis:focus-symbol', { detail: { symbolId: 101 } }));
   ```
3. Canvas Cytoscape otomatis melakukan transisi animasi kamera:
   ```ts
   cy.animate({
     center: { eles: `#sym_101` },
     zoom: 1.2,
     duration: 300,
   });
   ```

### 5.2. Graph View $\to$ Editor (*Jump to Source*)
Saat developer melakukan klik ganda (*double-click*) pada node di kanvas graf:
1. Tangkap event tap Cytoscape:
   ```ts
   cy.on('dbltap', 'node', (event) => {
     const nodeData = event.target.data();
     window.aegisEditor.openFileAtLine(nodeData.filePath, nodeData.lineStart);
   });
   ```
2. Editor langsung membuka tab file dan mengarahkan kursor ke baris deklarasi simbol.

### 5.3. AI Chat $\to$ Graph View (*Visual Anchor*)
Saat AI di panel chat menggunakan tool MCP (`find_callers` atau `get_symbol_definition`):
1. Payload MCP mengembalikan daftar `symbol_id`.
2. Frontend chat memancarkan event `aegis:ai-trace-path`.
3. Graph View menyorot node dan edge terkait dengan warna aksen khusus selama beberapa detik, memberikan feedback visual langsung kepada developer rute logika yang sedang diperiksa oleh AI.

---

## 6. Strategi Performa & Batasan Memori

1. **Batas Node Per Tampilan (*Node Cap*)**:
   * Default maksimal 50 node per visualisasi. Jika melebihi batas, UI menampilkan badge: *"Menampilkan 50 dari 180 relasi. Persempit filter atau klik node untuk ekspansi lokal."*
2. **Ekspansi Bertahap (*Lazy Neighborhood Expansion*)**:
   * Tiap node memiliki tombol mini `+` yang memanggil `GetSymbolNeighborhood(node.id, 1)` secara on-demand untuk menambahkan tetangga baru tanpa merender ulang seluruh kanvas.
3. **Pembersihan Memori (*Lifecycle Cleanup*)**:
   * Ketika tab Graph View disembunyikan atau ditutup, hancurkan instance Cytoscape (`cy.destroy()`) agar memori canvas HTML5 dibebaskan dari RAM.

---

## 7. Rencana Eksekusi Bertahap (Milestone Checklist)

- [ ] **Milestone 2.1: SQLite Query & Go UI Service**
  - Implementasikan query recursive CTE berbatas kedalaman di `server/internal/codegraph/ui_service.go`.
  - Daftarkan method Wails bindings: `GetSymbolNeighborhood`, `GetActiveFileGraph`, `SearchSymbols`.
  - Unit test: Pastikan eksekusi query subgraf $< 10\text{ ms}$ pada database dengan 10.000+ simbol.

- [ ] **Milestone 2.2: Setup Modul Cytoscape.js di Frontend**
  - Pasang dependensi: `cytoscape`, `cytoscape-dagre`, `@types/cytoscape`.
  - Buat komponen `GraphCanvas.tsx` dengan konfigurasi layout Dagre dan dark theme.
  - Verifikasi render awal menggunakan data tiruan (*mock payload*).

- [ ] **Milestone 2.3: Integrasi Data Wails Backend ke Canvas**
  - Sambungkan hook `useGraphData` ke method Go `GetSymbolNeighborhood`.
  - Implementasikan status loading, error fallback, dan indikator limit data (*truncated badge*).

- [ ] **Milestone 2.4: Interaktivitas Editor & Node Inspector**
  - Buat panel `NodeInspector.tsx` untuk menampilkan signature, docstring, dan daftar caller/callee.
  - Pasang event `dbltap` untuk melompat ke file dan nomor baris di editor.
  - Pasang event listener untuk memusatkan kamera saat kursor editor berpindah.

- [ ] **Milestone 2.5: AI Trace Highlight & Polish**
  - Hubungkan stream event MCP Chat ke kanvas graf untuk efek visual anchor.
  - Tambahkan kontrol toolbar (zoom in/out, fit view, filter jenis simbol, toggle layout hierarki vs gaya pegas).
