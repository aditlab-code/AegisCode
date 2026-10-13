# Security Policy & Vulnerability Disclosure

Security is a foundational priority for **AegisCode**. Because AegisCode manages local file operations, terminal sessions, debugging interfaces, and AI tool execution on developer machines, we maintain rigorous isolation and security controls.

---

## 1. Supported Versions

We provide active security patches and updates for the following versions:

| Version | Supported | Status |
| :--- | :---: | :--- |
| `1.0.0-beta.x` | :white_check_mark: | Active Preview / Beta |
| `< 1.0.0-beta` | :x: | Deprecated |

---

## 2. Threat Model & Security Architecture

AegisCode implements defense-in-depth architectural guarantees designed to safeguard developer host environments:

### Localhost & Socket Isolation
* **Strict Loopback Binding**: The embedded Go HTTP and WebSocket servers bind exclusively to `127.0.0.1` (localhost). External network interfaces are never opened unless the user explicitly enables companion broadcast mode.
* **Unix Domain Sockets / Local IPC**: Inter-process communication between supervisor agents and workers utilizes private local sockets (`~/.aegis/ipc/`) with filesystem permission bits restricted to the active OS user (`0700`).

### Workspace Confinement & Path Traversal Guards
* All file system APIs (`createFile`, `deleteFile`, `saveFile`, `git.Discard`, `git.GetDiff`) enforce strict workspace root boundary checks. Any attempt to access, traverse (`../`), or overwrite files outside the active workspace directory is rejected with HTTP `403 Forbidden` / `400 Bad Request`.

### Subprocess Supervision & Port Teardown
* Background processes (PTY shells, Delve debugger instances, MCP tool runners) are supervised with process-group boundaries (`setpgid`). When AegisCode shuts down or crashes, all child process trees receive `SIGTERM` followed by a fail-safe `SIGKILL` watchdog to ensure no orphaned processes or open ports linger.

### Zero-CGO Portable Isolation
* AegisCode standardizes on pure-Go database engines (`modernc.org/sqlite`). This eliminates memory safety vulnerabilities common in C-based dependencies (e.g., buffer overflows or unsafe pointer misuse from unvetted C bindings).

---

## 3. Reporting a Vulnerability

> [!IMPORTANT]
> **DO NOT** report security vulnerabilities through public GitHub issues, discussions, or pull requests.

If you believe you have discovered a security vulnerability in AegisCode, please report it privately through **GitHub Security Advisories**:

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
