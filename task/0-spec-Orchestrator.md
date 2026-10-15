# Task Specification & Architecture Contract: Pure .* & GitIgnore Matcher, Anti-Lock & Search Warning Banners

> **Dokumen Spesifikasi Teknis & Batasan Arsitektur**  
> Dibuat pada **Phase Analyze** oleh Master Orchestrator (Kanna) sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Sesuai instruksi mutlak user: **"Jangan ada default .venv .pytest target build log apapun itu. Pure pakai .* Dan gitIgnore"**.

---

## 1. Core Rule: Pure `.*` & `.gitignore`

1. **Pure `.*` Rule**:
   - Jika suatu direktori diawali dengan `.` (`d.IsDir() && strings.HasPrefix(name, ".")`), **langsung skip** tanpa pengecualian.
   - Tidak ada hardcode nama spesifik (`.venv`, `.pytest`, `.next`, `.codegraph`, dll.). Semua folder yang berawalan `.` otomatis ter-skip oleh aturan ini.
2. **Pure `.gitignore` Rule**:
   - Parser `.gitignore` membaca file `.gitignore` dari root workspace secara dinamis.
   - Pola-pola dalam `.gitignore` (misal `node_modules/`, `dist/`, `build/`, `*.log`) di-match terhadap relPath.
   - Tidak ada daftar hardcode folder non-dot (`target`, `build`, `venv`, `pycache`, dll.). Jika file/folder di-ignore oleh `.gitignore`, maka di-skip. Jika tidak ada di `.gitignore` dan bukan folder `.*`, maka boleh diproses.
3. **Anti-Lock Concurrency & Timeout**:
   - Backend Go menggunakan `context.Context` dari request HTTP dengan timeout (10 detik).
   - Pada setiap iterasi traversal `WalkDir`:
     `select { case <-ctx.Done(): return ctx.Err() default: }`
     Jika user mengetik query baru (client meng-abort request), traversal backend berhenti seketika.
   - Mutex `sync.RWMutex` hanya digunakan dalam fraksi mikrodetik untuk membaca/menyimpan pointer matcher, tidak pernah menahan lock selama disk traversal atau regex matching.
4. **Sidebar Search Warning & Error Banners**:
   - Warning banner: Ditampilkan jika hasil mencapai kuota 100 matches atau backend mengembalikan `isCapped`.
   - Error banner: Ditampilkan jika terjadi error pemrosesan (misal invalid regex, network timeout, connection error).

---

## 2. Verification Outcomes
- Go Backend Test Suite: 220 tests passed (`go test ./...` in 14 packages).
- Frontend Vitest Suite: 305 tests passed (29 test files).
- Production Build: `npm run build` passed with 0 errors.
- Code Format: `npm run format` checked 161 files cleanly.
