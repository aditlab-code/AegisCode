# 0017. Minimum Security Baseline, Origin Hardening, Credential Isolation, and Anti-XSS Sanitization

- **Status**: Proposed / Minimum Baseline (2026-10-17)
- **Deciders**: AegisCode Architecture Core, Adit (Sensei), Shun (Antigravity Agent)
- **Related ADRs**: ADR-0001 (Hybrid Process), ADR-0003 (Core Server Runtime in Golang), ADR-0005 (Unix Sockets & IPC), ADR-0013 (Embedded Pure-Go SQLite), ADR-0016 (HTTP/1.1 Socket Starvation & Buffer Lifecycle)

---

## Context

Following an internal security audit based on [`docs/internal/security-minimal.md`](../internal/security-minimal.md), several architectural security gaps were identified across the Go backend transport layer, local persistence, and frontend DOM rendering:

1. **Origin Validation Bypass & Cross-Site WebSocket/SSE Hijacking (CSWSH)**:
   - In `corsAndAuthMiddleware` (`server/internal/api/api.go`), invalid origins are not actively rejected; the server merely skips adding CORS headers and allows execution to proceed to `next.ServeHTTP(w, r)`.
   - Because cross-origin requests from the user's browser (e.g. visiting a malicious webpage `http://evil.com` in another tab) originate from the local machine, `IsLoopbackRemote(r)` returns `true`. Consequently, pairing token checks are bypassed.
   - Terminal SSE (`/api/v1/events/terminal/:id`), logs SSE (`/api/v1/events/logs`), and workspace change streams explicitly set wildcard headers (`Access-Control-Allow-Origin: *`).
   - `origin == "null"` is unconditionally accepted, creating an attack vector via sandboxed iframes (`sandbox="allow-scripts"`).

2. **Unrestricted Network Binding (`0.0.0.0`)**:
   - The Go HTTP listener in `server/cmd/server/main.go` binds to `":8080"` by default, which binds to all network interfaces (`0.0.0.0`) rather than loopback-only (`127.0.0.1`). This exposes the local IDE server to other machines on the same local Wi-Fi or LAN subnet.

3. **Absence of Content Security Policy (CSP)**:
   - Neither the Go backend `SPAHandler` (`server/internal/web/handler.go`) nor `index.html` emit a `Content-Security-Policy` header or meta tag.
   - Clickjacking defense (`frame-ancestors 'none'`) is absent.

4. **Plaintext LLM API Key Storage in Browser `localStorage`**:
   - In `src/store/slices/createSettingsSlice.ts`, `saveStoredSettings` serializes the full `settings` object—including `settings.agent.providerKeys` (Claude, OpenAI, OpenRouter API keys)—into `window.localStorage.setItem("aegis_user_settings", ...)`.
   - Any script running in the browser context can read these high-value credentials directly in plaintext.

5. **Cross-Site Scripting (XSS) via Unsanitized Mermaid Diagram Injection**:
   - In `src/components/layout/chat/MermaidBlock.tsx`, Mermaid is initialized with `securityLevel: "loose"`, permitting HTML elements and script handlers inside diagrams.
   - The rendered SVG is injected into the DOM via `dangerouslySetInnerHTML={{ __html: svgContent }}` without running through a sanitizer such as `DOMPurify`.
   - Untrusted repository markdown files or malicious LLM outputs can trigger arbitrary script execution.

6. **Missing Handshake Verification on PTY / SSE**:
   - No short-lived cryptographic token (*ephemeral handshake token*) is generated when serving the HTML shell to prove that client-side event listeners and terminal controllers are initiated by the legitimate local app shell.

7. **Git Argument Path Traversal & Unrestricted Directory Browsing**:
   - While file CRUD endpoints correctly enforce `s.ws.ResolvePath`, Git staging endpoints (`handleGitStage`, `handleGitUnstage`, `handleGitTimeline`) and the directory explorer (`handleWorkspaceBrowse`) do not consistently enforce root workspace jail verification.
   - The terminal emulator (`xterm.js`) does not explicitly filter or disable dangerous Operating System Command (OSC) escape sequences (e.g., OSC 52 clipboard hijacking).

---

## Decision

We establish the **Minimum Security Baseline** for AegisCode, adopting a zero-trust model between the browser tabs and the local Go core server:

### 1. Saluran Komunikasi (Transport & Origin Hardening)
- **Fail-Fast Origin Gate**:
  - In `server/internal/api/api.go`, `corsAndAuthMiddleware` must actively terminate requests with `403 Forbidden` if the `Origin` header is present and does not strictly match authorized loopback origins (`http://localhost:*`, `http://127.0.0.1:*`, `http://[::1]:*`), the detected LAN pairing IP, or configured `AEGIS_ALLOWED_ORIGINS`.
  - Disallow `origin == "null"` from executing privileged REST or streaming endpoints.
  - Remove all wildcard `Access-Control-Allow-Origin: *` headers from SSE streaming handlers.
- **Exclusive Loopback Listener**:
  - In `server/cmd/server/main.go`, change the default listener binding from `":%d"` to `"127.0.0.1:%d"`.
  - External network binding (`0.0.0.0`) is permitted only when Companion Mode is explicitly enabled or when configured via `--host 0.0.0.0` / `AEGIS_HOST=0.0.0.0`.
- **Ephemeral Session Handshake Token**:
  - Generate a 32-byte cryptographic token (`crypto/rand`) at server boot / HTML shell serve time.
  - Inject this token into `index.html` via dynamic placeholder substitution or meta tag.
  - Require the frontend to send this ephemeral token in headers (`X-Session-Token`) or query params (`?token=`) for all SSE streams and terminal operations.

### 2. Frontend & PWA Security
- **Strict Content Security Policy (CSP)**:
  - Serve strict CSP headers from the Go `SPAHandler`:
    ```http
    Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* http://localhost:* ws://localhost:*; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none';
    ```
  - Prohibit `'unsafe-eval'`.
  - Prevent clickjacking via `X-Frame-Options: DENY` and `frame-ancestors 'none'`.
- **Anti-XSS Sanitization & Strict Mermaid Sandbox**:
  - Install `dompurify` and `@types/dompurify`.
  - In `src/components/layout/chat/MermaidBlock.tsx`, change `securityLevel: "loose"` to `securityLevel: "strict"`.
  - Pass all rendered Mermaid SVG strings through `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } })` before injecting into the DOM via `dangerouslySetInnerHTML`.
- **Service Worker Invariant**:
  - If a Service Worker is introduced in the future, its scope must be locked strictly to static assets (`/assets/`), and `CacheStorage` must never store API keys, terminal history, or session tokens.

### 3. File System, Terminal, & Credential Vaulting
- **Zero-Plaintext Credential Storage in Browser**:
  - Strip `providerKeys` from `saveStoredSettings` so that API keys are never stored in `localStorage`.
  - API keys reside solely in backend SQLite storage (`~/.aegis/aegis.db`), loaded on demand via `/api/v1/config` in memory.
- **SQLite Database & Directory Permissions**:
  - Ensure the storage directory `~/.aegis/` is created with restrictive POSIX permissions `0700` (`rwx------`).
  - Set SQLite database file permissions for `aegis.db` to `0600` (`rw-------`).
- **Universal Path Traversal Guards**:
  - In `server/internal/api/git_handlers.go`, validate all target file paths with `s.ws.ResolvePath(f)` before passing them to Git subcommands (`stage`, `unstage`, `timeline`).
  - Restrict `/api/v1/workspace/browse` to authenticated sessions or local loopback only.
- **Terminal OSC Escape Sequence Sanitization**:
  - In `TerminalView.tsx`, configure `xterm.js` to disable clipboard write escape sequences (OSC 52) or sanitize OSC control sequences to prevent terminal injection.

---

## Consequences

### Positive
- **Immunity to CSWSH & Tab Hijacking**: Malicious browser tabs cannot command local terminals, steal workspace files, or read private SSE events.
- **Zero API Key Leakage**: XSS or physical access to browser storage cannot exfiltrate plaintext Claude/OpenAI credentials.
- **Robust Defense-in-Depth**: Strict CSP and `DOMPurify` neutralize injected HTML/script payloads in markdown previews and diagrams.
- **LAN Protection**: Binding to `127.0.0.1` ensures that opening AegisCode on public/shared Wi-Fi networks does not expose ports to local network scanners.

### Negative / Trade-offs
- **Companion Pairing Requirement**: Connecting a companion device (e.g. tablet or smartphone) across the local network now requires explicitly launching the server with `--host 0.0.0.0` or pairing flags.
- **DOMPurify Dependency**: Introduces `dompurify` (~20KB gzipped) to the frontend bundle, which will be code-split on-demand alongside Mermaid viewers.
