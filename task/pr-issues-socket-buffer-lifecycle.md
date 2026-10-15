# [LEGACY] Solusi Jangka Panjang & Maintainable: Pencegahan HTTP/1.1 Socket Starvation & Siklus Buffer Workspace Kanonikal

- **Dokumen Rujukan**: [`docs/adr/0016-http1-socket-starvation-prevention-and-canonical-workspace-buffer-lifecycle.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/adr/0016-http1-socket-starvation-prevention-and-canonical-workspace-buffer-lifecycle.md)
- **Status Rencana**: Proposed / Ready for Orchestration
- **Area Arsitektur**: Network Concurrency, SSE Multiplexing, Zustand Store Normalization, Buffer Lifecycle Integrity
- **Target Sub-Sistem**:
  - `server/internal/api/` (Centralized SSE Event Hub)
  - `src/utils/apiBase.ts` (API Routing & Base Resolution)
  - `src/context/WorkbenchLifecycle.ts` (Event Hub Subscription & Lifecycle Cleanup)
  - `src/store/slices/createWorkspaceSlice.ts` (Single-Key Canonical Buffer Store & JIT Tab Loading)
  - `src/components/layout/editor/CodePane.tsx` (Buffer State Machine & Skeleton Loading)

---

## 1. Analisis Kritis Kerapuhan Solusi Taktis Saat Ini (Root-Cause Audit)

Solusi pada [ADR-0016](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/adr/0016-http1-socket-starvation-prevention-and-canonical-workspace-buffer-lifecycle.md) berhasil menyelesaikan kendala darurat (tab browser *stuck loading* dan pane editor kosong saat berpindah workspace). Namun, audit arsitektur mendalam menunjukkan bahwa solusi tersebut bersifat **mitigasi taktis (work-around)** yang belum menyelesaikan akar permasalahan teknis:

```
[Kondisi Saat Ini di Port 8080: Rawan Starvation]
Browser HTTP/1.1 Pool (kMaxSocketsPerGroup = 6 pada http://localhost:8080)
├── Socket 1: SSE Workspace  (/api/v1/events/workspace)   [PERMANEN TERBUKA]
├── Socket 2: SSE Debugger   (/api/v1/events/debug)       [PERMANEN TERBUKA]
├── Socket 3: SSE MCP Tools  (/api/v1/mcp/events)         [PERMANEN TERBUKA]
├── Socket 4: SSE LSP Diag   (/api/v1/events/lsp)         [PERMANEN TERBUKA]
├── Socket 5: SSE Logs       (/api/v1/events/logs)        [PERMANEN TERBUKA]
│   └── (Opsional: /api/v1/events/workers)
└── Socket 6: Tersisa 1 Socket untuk:
              ├── Fetch File Buffer (/api/v1/workspace/file)
              ├── Save File Buffer
              ├── Git Status & Git Diffs
              ├── Workspace Tree Refresh
              └── AI Chat Streaming (/api/v1/ai/chat) -> MEMICU STALL LENGKAP!
```

### 4 Titik Kerapuhan (Fragility Points):

1. **Ilusi Solusi Port 8080 (`API_BASE`)**:
   - Memindahkan koneksi SSE ke `http://localhost:8080` memang membebaskan port Vite (5173).
   - Namun, engine browser (Chromium, WebKit, Gecko) memberlakukan batas keras **6 TCP sockets per host origin** (`kMaxSocketsPerGroup = 6`) pada koneksi plaintext HTTP/1.1.
   - Karena browser tidak mendukung HTTP/2 *cleartext* (h2c) tanpa enkripsi TLS/HTTPS, **`http://localhost:8080` tetap beroperasi di bawah aturan 6 socket HTTP/1.1**.
   - Dengan 5 stream SSE aktif permanen, hanya **1 socket tersisa** untuk seluruh komunikasi REST. Begitu AI streaming berjalan, atau dua request REST ditembakkan bersamaan, request masuk ke status **Stalled / Pending** di DevTools.
   - Pada build **Production** (`embed.FS` disajikan dari binary Go di port 8080), seluruh aset web statis (HTML, JS, CSS) dan API berbagi port 8080 yang sama, meningkatkan risiko tab membeku saat reload.

2. **Denormalisasi State & Tabrakan Nama File pada Multi-Key Buffer Indexing**:
   - Di `createWorkspaceSlice.ts`, buffer file yang sama diduplikasi ke dalam 4 varian key:
     ```ts
     // createWorkspaceSlice.ts (baris 1075-1081)
     fileBuffers: {
       ...state.fileBuffers,
       [clean]: newBuf,
       [filename]: newBuf,
       [baseName]: newBuf,
       [rawBaseName]: newBuf,
     }
     ```
   - **Tabrakan Basename (Collision Hazard)**: Jika proyek memiliki `src/components/Button.tsx` dan `src/stories/Button.tsx`, key `"Button.tsx"` akan saling menimpa. Editor pane yang mencari berdasarkan basename akan menampilkan file yang salah.
   - **Desinkronisasi State**: Mutasi seperti `updateFileContent` hanya memperbarui satu key. Varian key lainnya menjadi usang (*stale*).
   - **Pembersihan Rawan Bocor**: Menghapus atau mengganti nama file menuntut penghapusan 4 key secara manual.

3. **Heuristik Timer 600ms (`runAfterWindowLoad`)**:
   - Menunda pembukaan SSE selama 600ms setelah window load hanya menunda saat terjadinya saturasi socket, bukan menyelesaikannya. Jika pengguna berinteraksi cepat dalam 700ms pertama, perebutan socket tetap terjadi.

4. **Unbounded Parallel Background Tab Fetching**:
   - Saat workspace dimuat, loop `for (const tab of allTabs) void get().fetchBufferSafely(tab)` mengeksekusi fetch paralel tanpa batas untuk seluruh tab latar belakang. Jika user memiliki 8 tab terbuka, 8 request berebut 1 socket yang tersisa.

---

## 2. Arsitektur Solusi Jangka Panjang (4 Pilar Strategis)

```
[Arsitektur Target: Sustainable, Resilient, Lean]

                  ┌────────────────────────────────────────────────┐
                  │                 BROWSER CLIENT                 │
                  │              (http://localhost:8080)           │
                  └──────┬──────────────────────────────────┬──────┘
                         │                                  │
     Socket 1 (Permanent)│                 Sockets 2-6 (Free for REST/AI)
                         ▼                                  ▼
            ┌────────────────────────┐         ┌────────────────────────┐
            │   UNIFIED EVENT HUB    │         │  REST / STREAMING POOL │
            │   GET /api/v1/events   │         │  (5 Concurrent Sockets)│
            └────────────┬───────────┘         └────────────┬───────────┘
                         │                                  │
        Multiplexed Envelope JSON:                          │
        { channel, event, payload }                         │
                         │                                  │
                         ▼                                  │
      ┌─────────────────────────────────────┐               │
      │       GO BACKEND: api.EventHub      │               │
      ├──────────────┬──────────────────────┤               │
      │ • Workspace  │ • DAP Debugger       │               │
      │ • LSP Diag   │ • MCP Activity       │               │
      │ • Server Log │ • Worker Supervisor  │               │
      └──────────────┴──────────────────────┘               │
                         │                                  │
                         └──────────────────────────────────┘
```

### Pilar 1: Unified Multiplexed SSE Event Hub (1 Socket untuk Semua Event)

Mengganti 5–7 endpoint SSE individual dengan **1 endpoint tunggal**: `GET /api/v1/events`.

#### 1. Kontrak Protokol Envelope
Setiap event yang dipancarkan backend dibungkus dalam format standar:
```json
event: message
data: {
  "channel": "workspace" | "debug" | "lsp" | "mcp" | "logs" | "workers",
  "type": "change" | "stopped" | "diagnostics" | "tool_invoked" | "entry",
  "payload": { ... },
  "timestamp": 1729000000000
}
```

#### 2. Implementasi Backend Go (`server/internal/api/events_hub.go`)
Backend mengelola satu broker terpusat yang aman dari *deadlock* dan efisien memori:
```go
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type HubEvent struct {
	Channel   string      `json:"channel"`
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	Timestamp int64       `json:"timestamp"`
}

type EventHub struct {
	mu          sync.RWMutex
	subscribers map[chan HubEvent]struct{}
}

func NewEventHub() *EventHub {
	return &EventHub{
		subscribers: make(map[chan HubEvent]struct{}),
	}
}

func (h *EventHub) Publish(channel, eventType string, payload interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	evt := HubEvent{
		Channel:   channel,
		Type:      eventType,
		Payload:   payload,
		Timestamp: time.Now().UnixMilli(),
	}

	for ch := range h.subscribers {
		select {
		case ch <- evt:
		default:
			// Non-blocking drop jika subscriber lambat membaca
		}
	}
}

func (s *Server) handleUnifiedEvents(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		jsonError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	ch := make(chan HubEvent, 128)
	s.eventHub.mu.Lock()
	s.eventHub.subscribers[ch] = struct{}{}
	s.eventHub.mu.Unlock()

	defer func() {
		s.eventHub.mu.Lock()
		delete(s.eventHub.subscribers, ch)
		close(ch)
		s.eventHub.mu.Unlock()
	}()

	// Ping ticker untuk menjaga keepalive koneksi
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Initial connected ping
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\"}\n\n")
	flusher.Flush()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()
		case evt, ok := <-ch:
			if !ok {
				return
			}
			data, err := json.Marshal(evt)
			if err == nil {
				fmt.Fprintf(w, "event: message\ndata: %s\n\n", string(data))
				flusher.Flush()
			}
		}
	}
}
```

#### 3. Implementasi Frontend Client (`src/services/WorkbenchEventHub.ts`)
Di frontend, buat satu singleton listener dengan dispatching berbasis listener:
```ts
import { API_BASE } from "../utils/apiBase"

export type EventHubHandler = (payload: any, type: string) => void

class WorkbenchEventHub {
  private es: EventSource | null = null
  private handlers = new Map<string, Set<EventHubHandler>>()
  private reconnectTimer: NodeJS.Timeout | null = null

  public connect(): void {
    if (this.es) return

    try {
      this.es = new EventSource(`${API_BASE}/api/v1/events`)

      this.es.addEventListener("message", (evt) => {
        try {
          const envelope = JSON.parse(evt.data)
          if (!envelope || !envelope.channel) return
          const channelHandlers = this.handlers.get(envelope.channel)
          if (channelHandlers) {
            for (const handler of channelHandlers) {
              handler(envelope.payload, envelope.type)
            }
          }
        } catch {}
      })

      this.es.onerror = () => {
        this.disconnect()
        this.reconnectTimer = setTimeout(() => this.connect(), 3000)
      }
    } catch {
      // Offline fallback
    }
  }

  public subscribe(channel: string, handler: EventHubHandler): () => void {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set())
    }
    this.handlers.get(channel)!.add(handler)

    if (!this.es) {
      this.connect()
    }

    return () => {
      const set = this.handlers.get(channel)
      if (set) {
        set.delete(handler)
        if (set.size === 0) this.handlers.delete(channel)
      }
    }
  }

  public disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.es) {
      this.es.close()
      this.es = null
    }
  }
}

export const eventHub = new WorkbenchEventHub()
```

---

### Pilar 2: Strict Canonical Path Normalization & Explicit Buffer State

Mengembalikan prinsip **Single Source of Truth** pada store:

1. **Struktur Kanonikal Tunggal**:
   - Kunci di `fileBuffers` **hanya** menggunakan format Relative POSIX Path tanpa leading slash (contoh: `src/types/document.ts`).
   - Tidak ada lagi entri duplikat seperti `[filename]`, `[baseName]`, atau `[rawBaseName]`.

2. **Normalisasi di Ingress Boundary**:
   - Semua input path dari luar (LSP, DAP, Tabs, Git) melewati `toCanonicalPath`:
   ```ts
   export function toCanonicalPath(inputPath: string, rootPath?: string): string {
     let clean = inputPath.replace(/\\/g, "/")
     if (rootPath) {
       const normRoot = rootPath.replace(/\\/g, "/").replace(/\/+$/, "")
       if (clean.startsWith(normRoot + "/")) {
         clean = clean.slice(normRoot.length + 1)
       }
     }
     return clean.replace(/^\/+/, "")
   }
   ```

3. **Explicit Buffer State Machine**:
   ```ts
   export type BufferStatus = "idle" | "loading" | "ready" | "error"

   export interface FileBuffer {
     status: BufferStatus
     content: string
     savedContent: string
     isDirty: boolean
     hasDiskConflict: boolean
     isDeletedOnDisk: boolean
     language: string
     isLargeFile?: boolean
     isBinary?: boolean
     fileSize?: number
     errorMessage?: string
   }
   ```
   - Saat file mulai di-fetch, buat buffer sementara dengan `status: "loading"`.
   - `CodePane.tsx` mendeteksi `status === "loading"` dan merender *Skeleton / Loading Spinner* sederhana daripada me-mount CodeMirror dengan teks kosong `""`.
   - Hal ini menghilangkan *race condition* pada Outline AST parser yang sebelumnya mengeluhkan *"No symbols detected"*.

---

### Pilar 3: Just-In-Time (JIT) Tab Buffer Fetching

Menghentikan pemuatan serentak semua tab latar belakang:
1. **Pemuatan Awal Prioritas Tinggi**:
   - Hanya fetch buffer untuk tab aktif di **Group 1** dan **Group 2** saat folder dibuka.
   - Tab lain di latar belakang hanya didaftarkan di array `tabs`, tanpa menembakkan HTTP request.
2. **Pemuatan On-Demand (JIT)**:
   - Ketika pengguna mengklik tab latar belakang, barulah `fetchBufferSafely` dipanggil secara on-demand.
   - Waktu pembukaan folder menjadi $< 50\text{ms}$ dan konsumsi memori browser berkurang drastis pada repo besar.

---

### Pilar 4: Workspace Epoch Guard

Mencegah respons fetch dari folder lama mengotori folder baru saat pengguna berganti folder dengan cepat:
```ts
// Di createWorkspaceSlice.ts
workspaceEpoch: 0,

openRootFolder: async (rawPath: string) => {
  const nextEpoch = get().workspaceEpoch + 1
  set({ workspaceEpoch: nextEpoch, isWorkspaceLoading: true })

  try {
    await get().autoSaveDirtyBuffers()
    await loadWorkspaceInternal(get, set, rawPath, nextEpoch)
  } catch (err) {
    // Error handling
  }
}
```
Setiap callback async memvalidasi:
```ts
if (get().workspaceEpoch !== targetEpoch) return // Discard response basi
```

---

## 3. Matriks Perbandingan: Solusi Saat Ini vs Solusi Jangka Panjang

| Parameter Arsitektur | Kondisi Pasca-ADR 0016 (Taktis) | Rekomendasi Jangka Panjang (Maintainable) |
| :--- | :--- | :--- |
| **Jumlah Koneksi SSE** | 5–7 stream paralel (`EventSource`) | **1 Multiplexed SSE Hub** (`/api/v1/events`) |
| **Sisa Socket HTTP/1.1** | 0–1 socket (rawan antrean *stalled*) | **5 socket bebas** (REST, assets, AI stream lancar) |
| **Kunci Penyimpanan Buffer** | 4 varian key per file (boros & rawan collision) | **1 Canonical Relative Path** (Single Source of Truth) |
| **Penanganan Nama File Sama** | Basename saling menimpa (*data corruption*) | **Zero Collision** (terisolasi per path folder) |
| **Buffer Loading State** | Mengisi `content: ""` saat fetch | **State Machine** (`loading` $\rightarrow$ `ready` dengan skeleton UI) |
| **Pemuatan Background Tabs** | Unbounded parallel fetch untuk semua tab | **JIT (Just-In-Time) On-Demand Fetch** saat tab diklik |
| **Penundaan Window Load** | Heuristik arbitrer `setTimeout(600ms)` | **Bersih tanpa delay arbitrer** |
| **Perilaku di Production** | Rentan membeku saat reload di port 8080 | **Aman & stabil** (hanya 1 socket SSE yang terpakai) |

---

## 4. Rencana Implementasi Bertahap (Phased Action Plan)

Sesuai panduan *Prime Directive AegisCode*, implementasi dibagi menjadi 3 tahap atomik tanpa over-engineering:

### Tahap 1: Normalisasi Store & JIT Tab Loading (Frontend Only)
1. Perbarui `createWorkspaceSlice.ts`:
   - Ganti penyimpanan multi-key `fileBuffers` menjadi hanya 1 key kanonikal `[clean]`.
   - Tambahkan status `loading` pada `FileBuffer`.
   - Ubah `loadWorkspaceInternal` agar hanya men-download buffer tab aktif Group 1 & 2.
2. Perbarui `CodePane.tsx`:
   - Hapus pencarian fallback basename berantai. Cukup baca `fileBuffers[canonicalPath]`.
   - Tampilkan skeleton jika status buffer masih `loading`.

### Tahap 2: Implementasi Unified SSE Hub (Backend & Frontend)
1. Di `server/internal/api/`:
   - Tambahkan `events_hub.go` dan daftarkan `GET /api/v1/events` pada `Routes()`.
   - Hubungkan watcher workspace, Delve DAP, LSP manager, dan log publisher ke `eventHub.Publish(...)`.
2. Di frontend:
   - Buat `src/services/WorkbenchEventHub.ts`.
   - Migrasikan listener di `src/context/WorkbenchLifecycle.ts` untuk mendengarkan `eventHub`.
   - Hapus fungsi penunda `runAfterWindowLoad`.

### Tahap 3: Verifikasi Lapangan & Dokumentasi
1. Jalankan verification gates:
   ```bash
   npm run build    # 0 error
   npm run format   # oxfmt check
   go test ./...    # di server/
   ```
2. Publikasikan **ADR-0017** sebagai penerus formal dan penyempurna dari ADR-0016.
