# Security Policy & Vulnerability Disclosure 🛡️

Security is a foundational priority for **AegisCode**. Because AegisCode manages local file operations, terminal sessions, debugging interfaces, and AI tool execution on developer machines, we maintain rigorous isolation and security controls.

---

## 1. Supported Versions

We provide active security updates for the following versions:

| Version | Supported | Status |
| :--- | :---: | :--- |
| `1.0.0-beta.x` | :white_check_mark: | Active Community Preview |
| `< 1.0.0-beta` | :x: | Deprecated |

---

## 2. Threat Model & Security Architecture (Community Baseline)

AegisCode Community Edition implements a lightweight, developer-friendly defense-in-depth model designed to safeguard developer host workstations without intrusive lockouts or excessive resource overhead:

### Strict Loopback & Socket Isolation
* **Exclusive Loopback Binding**: The embedded Go HTTP and WebSocket servers bind exclusively to `127.0.0.1` (IPv4) and `::1` (IPv6). External network interfaces are never opened, keeping your workbench invisible to other devices on local Wi-Fi / LAN networks.
* **Unix Domain Sockets / Local IPC**: Inter-process communication between supervisor agents and workers utilizes private local sockets (`~/.aegis/ipc/`) with filesystem permission bits restricted to the active OS user (`0700`).

### Cross-Site Protection & Origin Verification (Anti-CSWSH)
* **Fail-Fast Origin Filter**: Backend Go strictly verifies the `Origin` header on WebSocket and REST handshakes. Untrusted third-party origins and sandboxed `null` iframe origins are immediately rejected with HTTP `403 Forbidden`.
* **Zero Wildcard CORS**: Cross-origin requests never receive wildcard `*` headers.

### Workspace Confinement & Symlink Traversal Guards
* All file system APIs enforce strict workspace root boundary checks.
* Physical symlink evaluation (`filepath.EvalSymlinks`) ensures malicious repository symlinks cannot traverse (`../`) or escape into sensitive host directories (e.g. `~/.ssh` or `/etc/passwd`).

### Content Security Policy & Safe Viewer Rendering
* **Strict CSP**: HTTP headers disallow dynamic `eval()` execution and third-party script injection (`script-src 'self'`).
* **DOM Sanitization**: Markdown previews and AI chat responses are purified via `DOMPurify` before rendering to prevent stored XSS attacks.
* **Terminal Escape Sequence Filtering**: xterm.js PTY buffers filter out dangerous Operating System Command (OSC) escape sequences (e.g. clipboard theft).

### Local Secret Protection & Tolerant Auth
* AI provider API keys (OpenAI, Anthropic, Gemini) are stored locally in an AES-256-GCM encrypted SQLite vault (`~/.aegis/` with `0600` file permissions) rather than exposed in browser `localStorage`.
* Master Passphrase authentication uses a progressive soft cooldown (30 seconds) on failed attempts without destructive panic shutdowns or unrecoverable quarantine states.

---

## 3. Reporting a Vulnerability

> [!IMPORTANT]
> **DO NOT** report security vulnerabilities through public GitHub issues, discussions, or pull requests.

If you discover a security vulnerability in AegisCode, please report it privately through **GitHub Security Advisories**:

1. Navigate to the [AegisCode Security Advisories](https://github.com/aditlab-code/AegisCode/security/advisories) page.
2. Click **"Report a vulnerability"**.
3. Provide a detailed summary, including:
   - Affected version or commit hash.
   - Host operating system and architecture.
   - Step-by-step reproduction instructions or a minimal Proof of Concept (PoC).
   - Any potential impact on developer machine isolation or sensitive token exposure.

### Response Timeline
* **Initial Acknowledgement**: Within 48 hours of report submission.
* **Triage & Assessment**: Within 5 business days, including confirmation of severity.
* **Remediation & Patch**: A fix will be developed in a private security fork, verified, and released alongside a coordinated public disclosure.
