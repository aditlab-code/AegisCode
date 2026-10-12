Berikut adalah tabel komparasi lengkap struktur *tool call* lintas provider dan implementasi penanganan (*aggregator & normalizer*) idiomatik di Go.

---

### 1. Tabel Komparasi Format Tool Call Lintas Provider

| Aspek / Karakteristik | Antigravity CLI (`agy`)

 | Claude (Anthropic API / CLI)

 | OpenCode / OpenRouter (OpenAI Spec)

 | Target Standar AegisCode (`SSE`)

 |
| --- | --- | --- | --- | --- |
| **Mekanisme Stream** | NDJSON baris per baris via `stdout` proses CLI

 | HTTP SSE (`event:` + `data: JSON`)

 | HTTP SSE (`data: JSON`) dengan potongan delta

 | `event: tool_call` via Go HTTP SSE

 |
| **Identitas Unik (ID)** | Berbasis langkah: `step_index` integer (misal: `1`, `2`)

 | String unik acak: `id: "toolu_01AbC..."` | String acak: `id: "call_abc..."` per objek di array `tool_calls` | Diseragamkan ke `tc-<id>` atau `tc-<stepIdx>`<br> |
| **Transmisi Argumen** | Objek JSON langsung tersedia di `tool_info.parameters` / `tool_args`<br> | Pecahan string parsial di `content_block_delta` (`input_json_delta`) | Pecahan string parsial bertahap di `choices[0].delta.tool_calls[i].function.arguments` | Objek map terurai (`map[string]any`) yang valid dan bersih |
| **Pelacakan Status** | Eksplisit: `step_update.state` (`ACTIVE` $\rightarrow$ `DONE`)

 | Berbasis event blok: `content_block_start` $\rightarrow$ `content_block_stop` | Implisit: terdeteksi saat `finish_reason: "tool_calls"` | `status: "running"` $\rightarrow$ `status: "success"`<br> |
| **Output / Return** | Langsung menyatu di `step_update.tool_info.output`<br> | Giliran pesan terpisah (`role: "user"`, `type: "tool_result"`) | Giliran pesan terpisah (`role: "tool"`, `tool_call_id: "..."`) | Teks output (dibatasi maks 2.500 karakter di UI)

 |
| **Variasi Kunci Path** | `AbsolutePath`, `filePath`, `path`<br> | `path`, `file_path` | `path`, `filename`, `file_path` | Dinormalisasi ke `targetFile` tunggal

 |
| **Variasi Perintah Shell** | `command`, `cmd` | `command` | `cmd`, `command` | Dinormalisasi ke `command` tunggal |

---

### 2. Definisi Kontrak & Tipe Data di Go

Simpan kontrak terpadu ini di paket internal AI (misal: `server/internal/ai/types.go`):

```go
package ai

import (
	"strings"
	"time"
)

// ToolCallEvent mewakili payload tunggal yang dipancarkan ke frontend via SSE
type ToolCallEvent struct {
	ID         string         `json:"id"`
	Name       string         `json:"name"`
	Summary    string         `json:"summary"`
	Status     string         `json:"status"` // "running" | "success" | "error"
	TargetFile string         `json:"targetFile,omitempty"`
	Args       map[string]any `json:"args"`
	Output     string         `json:"output,omitempty"`
	Timestamp  int64          `json:"timestamp"`
}

// InFlightToolState menyimpan akumulasi argumen streaming sebelum menjadi JSON valid
type InFlightToolState struct {
	Index       int
	ID          string
	Name        string
	ArgsBuilder strings.Builder
	ParsedArgs  map[string]any
	Status      string
	Output      string
}

```

---

### 3. Modul Helper: Normalisasi Kunci & Anti-Ghost Tab

Untuk mencegah bug *ghost tab* (tab kosong yang terbuka karena path tidak valid atau path bernilai sama dengan nama tool):

```go
package ai

import "strings"

// SanitizeString membersihkan spasi dan petik ganda/tunggal/backtick liar
func SanitizeString(s string) string {
	return strings.Trim(s, "\"'` \t\r\n")
}

// ExtractTargetFile mendeteksi path berkas dari berbagai variasi kunci parameter
func ExtractTargetFile(toolName string, args map[string]any) string {
	candidateKeys := []string{"AbsolutePath", "filePath", "path", "targetFile", "TargetFile", "filename"}
	for _, k := range candidateKeys {
		if raw, ok := args[k].(string); ok {
			clean := SanitizeString(raw)
			// Guard: Path tidak boleh kosong dan tidak boleh sama dengan nama tool itu sendiri
			if clean != "" && clean != toolName {
				return clean
			}
		}
	}
	return ""
}

// GenerateSummary membuat deskripsi ringkas aksi tool untuk antarmuka pengguna
func GenerateSummary(name, targetFile string, args map[string]any) string {
	if rawSummary, ok := args["toolSummary"].(string); ok && rawSummary != "" {
		return SanitizeString(rawSummary)
	}
	if rawAction, ok := args["toolAction"].(string); ok && rawAction != "" {
		return SanitizeString(rawAction)
	}

	switch name {
	case "view_file", "Read", "read_file":
		if targetFile != "" {
			return "Membaca " + targetFile
		}
		return "Membaca berkas"
	case "write_to_file", "Write", "replace_file_content", "create_file":
		if targetFile != "" {
			return "Menulis " + targetFile
		}
		return "Mengubah berkas"
	case "run_command", "bash", "execute":
		if cmd, ok := args["command"].(string); ok {
			return "Menjalankan: " + SanitizeString(cmd)
		}
		return "Menjalankan perintah terminal"
	default:
		return name
	}
}

```

---

### 4. Penanganan Khusus Tiap Provider di Go

#### A. Penanganan Antigravity CLI (`agy` NDJSON)

Antigravity mengirim data per baris. Ekstraksi langsung mengambil `step_update.tool_info`:

```go
package ai

import (
	"encoding/json"
	"fmt"
	"time"
)

type AGYStepUpdate struct {
	StepIndex int `json:"step_index"`
	ToolInfo  struct {
		Name       string         `json:"name"`
		Parameters map[string]any `json:"parameters"`
		Output     string         `json:"output"`
	} `json:"tool_info"`
	ToolArgs map[string]any `json:"tool_args"` // Fallback
	State    string         `json:"state"`     // "ACTIVE" | "DONE"
}

func HandleAntigravityLine(rawJSON []byte, emit func(ToolCallEvent)) error {
	var payload struct {
		Event      string         `json:"event"`
		StepUpdate *AGYStepUpdate `json:"step_update"`
	}
	if err := json.Unmarshal(rawJSON, &payload); err != nil {
		return err
	}

	su := payload.StepUpdate
	if su == nil || su.ToolInfo.Name == "" {
		return nil
	}

	// Gunakan tool_info.parameters, fallback ke tool_args
	args := su.ToolInfo.Parameters
	if len(args) == 0 && len(su.ToolArgs) > 0 {
		args = su.ToolArgs
	}

	// Bersihkan nilai string di dalam argumen
	for k, v := range args {
		if s, ok := v.(string); ok {
			args[k] = SanitizeString(s)
		}
	}

	status := "running"
	if su.State == "DONE" {
		status = "success"
	}

	toolID := fmt.Sprintf("tc-%d", su.StepIndex)
	targetFile := ExtractTargetFile(su.ToolInfo.Name, args)

	// Batasi output preview agar tidak membebani antarmuka
	outputPreview := su.ToolInfo.Output
	if len(outputPreview) > 2500 {
		outputPreview = outputPreview[:2500] + "\n... (output dipotong)"
	}

	event := ToolCallEvent{
		ID:         toolID,
		Name:       su.ToolInfo.Name,
		Summary:    GenerateSummary(su.ToolInfo.Name, targetFile, args),
		Status:     status,
		TargetFile: targetFile,
		Args:       args,
		Output:     outputPreview,
		Timestamp:  time.Now().Unix(),
	}

	emit(event)
	return nil
}

```

---

#### B. Penanganan OpenCode / OpenRouter (OpenAI-Compatible Delta Aggregator)

OpenAI mengirim argumen terpotong-potong per chunk token. Akumulasi string dilakukan di memori hingga utuh sebelum diparsing:

```go
package ai

import (
	"encoding/json"
	"fmt"
	"time"
)

type OpenAIToolChunk struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type OpenAIAggregator struct {
	tools map[int]*InFlightToolState
}

func NewOpenAIAggregator() *OpenAIAggregator {
	return &OpenAIAggregator{tools: make(map[int]*InFlightToolState)}
}

// IngestChunk mengakumulasikan pecahan teks argumen yang masuk
func (a *OpenAIAggregator) IngestChunk(chunks []OpenAIToolChunk, emit func(ToolCallEvent)) {
	for _, chunk := range chunks {
		tool, exists := a.tools[chunk.Index]
		if !exists {
			toolID := chunk.ID
			if toolID == "" {
				toolID = fmt.Sprintf("tc-oa-%d", chunk.Index)
			}
			tool = &InFlightToolState{
				Index:  chunk.Index,
				ID:     toolID,
				Name:   chunk.Function.Name,
				Status: "running",
			}
			a.tools[chunk.Index] = tool

			// Pancarkan sinyal awal saat tool mulai dipanggil
			emit(ToolCallEvent{
				ID:        tool.ID,
				Name:      tool.Name,
				Summary:   "Menyiapkan " + tool.Name,
				Status:    "running",
				Args:      map[string]any{},
				Timestamp: time.Now().Unix(),
			})
		}

		if chunk.Function.Name != "" && tool.Name == "" {
			tool.Name = chunk.Function.Name
		}
		if chunk.Function.Arguments != "" {
			tool.ArgsBuilder.WriteString(chunk.Function.Arguments)
		}
	}
}

// Finalize dipanggil saat stream mencapai `finish_reason: "tool_calls"` atau selesai
func (a *OpenAIAggregator) Finalize(emit func(ToolCallEvent)) {
	for _, tool := range a.tools {
		var parsedArgs map[string]any
		rawJSON := tool.ArgsBuilder.String()

		if err := json.Unmarshal([]byte(rawJSON), &parsedArgs); err != nil {
			// Jika format JSON gagal dibongkar, masukkan sebagai argumen teks mentah
			parsedArgs = map[string]any{"raw": rawJSON}
		}

		targetFile := ExtractTargetFile(tool.Name, parsedArgs)

		emit(ToolCallEvent{
			ID:         tool.ID,
			Name:       tool.Name,
			Summary:    GenerateSummary(tool.Name, targetFile, parsedArgs),
			Status:     "success",
			TargetFile: targetFile,
			Args:       parsedArgs,
			Timestamp:  time.Now().Unix(),
		})
	}
}

```

---

#### C. Penanganan Claude (Anthropic Content Blocks)

Claude menggunakan pembuka blok, delta JSON, dan penutup blok:

```go
package ai

import (
	"encoding/json"
	"strings"
	"time"
)

type ClaudeBlockHandler struct {
	currentTool *InFlightToolState
}

func (c *ClaudeBlockHandler) HandleEvent(eventType string, data []byte, emit func(ToolCallEvent)) error {
	switch eventType {
	case "content_block_start":
		var p struct {
			Index        int `json:"index"`
			ContentBlock struct {
				Type string `json:"type"` // "tool_use"
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"content_block"`
		}
		if err := json.Unmarshal(data, &p); err == nil && p.ContentBlock.Type == "tool_use" {
			c.currentTool = &InFlightToolState{
				Index:  p.Index,
				ID:     p.ContentBlock.ID,
				Name:   p.ContentBlock.Name,
				Status: "running",
			}
			emit(ToolCallEvent{
				ID:        p.ContentBlock.ID,
				Name:      p.ContentBlock.Name,
				Summary:   "Mempersiapkan " + p.ContentBlock.Name,
				Status:    "running",
				Args:      map[string]any{},
				Timestamp: time.Now().Unix(),
			})
		}

	case "content_block_delta":
		var p struct {
			Delta struct {
				Type        string `json:"type"` // "input_json_delta"
				PartialJSON string `json:"partial_json"`
			} `json:"delta"`
		}
		if err := json.Unmarshal(data, &p); err == nil && c.currentTool != nil {
			if p.Delta.Type == "input_json_delta" {
				c.currentTool.ArgsBuilder.WriteString(p.Delta.PartialJSON)
			}
		}

	case "content_block_stop":
		if c.currentTool != nil {
			var args map[string]any
			raw := strings.TrimSpace(c.currentTool.ArgsBuilder.String())
			if raw != "" {
				_ = json.Unmarshal([]byte(raw), &args)
			}

			targetFile := ExtractTargetFile(c.currentTool.Name, args)

			emit(ToolCallEvent{
				ID:         c.currentTool.ID,
				Name:       c.currentTool.Name,
				Summary:    GenerateSummary(c.currentTool.Name, targetFile, args),
				Status:     "success",
				TargetFile: targetFile,
				Args:       args,
				Timestamp:  time.Now().Unix(),
			})
			c.currentTool = nil
		}
	}
	return nil
}

```

---

### Ringkasan Alur Kerja Terpadu

```
[Antigravity NDJSON]       -> HandleAntigravityLine()    \
[OpenAI/OpenRouter Delta]  -> OpenAIAggregator            +-> [Sanitizer & Anti-Ghost Guard] -> emit(ToolCallEvent) -> Frontend SSE
[Claude Content Block]     -> ClaudeBlockHandler         /

```

Melalui pemisahan ini, setiap provider memiliki penangan isolasi tersendiri di backend Go, sementara frontend React hanya mendengarkan satu struktur data yang sudah bersih, konsisten, dan bebas dari anomali teks parsial.