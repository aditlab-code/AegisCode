# Installation Guide

This guide covers installing and running **AegisCode** across macOS, Linux, and Windows, either via pre-built binaries or by building from source.

---

## 1. System Requirements

| Component | Minimum | Recommended |
| :--- | :--- | :--- |
| **OS** | macOS 12+ (Monterey), Ubuntu 20.04+, Windows 10 | macOS 14+ (Sonoma/Sequoia), Ubuntu 24.04, Windows 11 |
| **Architecture** | Apple Silicon (arm64), Intel/AMD (x86_64) | Apple Silicon (M1/M2/M3/M4) or modern 64-bit multi-core CPU |
| **Memory (RAM)** | 512 MB free RAM | 1 GB+ free RAM |
| **Storage** | 150 MB disk space | 500 MB disk space (includes SQLite indices) |

---

## 2. Pre-Built Binary Distribution

Pre-compiled standalone executables are located under the `bin/` directory or downloadable from GitHub Releases:

| Platform | Distribution Target | Execution Method |
| :--- | :--- | :--- |
| **macOS Apple Silicon** | `bin/AegisCode.dmg`<br>`bin/aegiscode-darwin-arm64` | Drag-and-drop `.dmg` or command line |
| **macOS Intel** | `bin/aegiscode-darwin-amd64` | Terminal execution |
| **Linux (x86_64)** | `bin/aegiscode-linux-amd64` | Terminal execution |
| **Linux (ARM64)** | `bin/aegiscode-linux-arm64` | Terminal execution |
| **Windows (x86_64)** | `bin/aegiscode-windows-amd64.exe` | PowerShell / Command Prompt |

### One-Line Launch Command
On macOS or Linux, mark the binary executable and launch with automatic browser open:

```bash
chmod +x ./bin/aegiscode-darwin-arm64
./bin/aegiscode-darwin-arm64 --open
```

On Windows PowerShell:
```powershell
.\bin\aegiscode-windows-amd64.exe --open
```

Once launched, AegisCode dynamically binds to an available loopback port and displays the active URL in your terminal (`http://127.0.0.1:<PORT>`). If `--open` is provided, your default web browser opens the active address automatically.

---

## 3. macOS Gatekeeper Authorization

Because pre-release preview binaries are distributed directly via GitHub without Apple Notarization, macOS Gatekeeper may present a security prompt stating *"AegisCode cannot be opened because the developer cannot be verified"*.

To authorize the application:

### For Native Desktop App (`.app` / `.dmg`)
1. Mount `AegisCode.dmg` and drag `AegisCode.app` into `/Applications`.
2. Open Terminal and run:
   ```bash
   xattr -cr /Applications/AegisCode.app
   ```
3. Double-click `AegisCode.app` in `/Applications` or launch from Spotlight.

### For Standalone Terminal Binary
```bash
xattr -d com.apple.quarantine ./bin/aegiscode-darwin-arm64
chmod +x ./bin/aegiscode-darwin-arm64
./bin/aegiscode-darwin-arm64 --open
```

---

## 4. Verifying Release Checksums

Every release includes a `SHA256SUMS.txt` manifest. Verify the integrity of your download before running:

```bash
# macOS
shasum -a 256 bin/aegiscode-darwin-arm64

# Linux
sha256sum bin/aegiscode-linux-amd64

# Windows (PowerShell)
Get-FileHash .\bin\aegiscode-windows-amd64.exe -Algorithm SHA256
```

Compare the output hash against the hash listed in the release notes.

---

## 5. Building from Source

If you prefer to compile AegisCode from scratch, you only need standard Go and Node.js toolchains:

### Prerequisites
- **Go 1.23+**: [https://golang.org/dl/](https://golang.org/dl/)
- **Node.js 20+ & npm**: [https://nodejs.org/](https://nodejs.org/)

### Build Steps
```bash
# 1. Clone the repository
git clone https://github.com/aditlab-code/AegisCode.git
cd AegisCode

# 2. Install dependencies & build production frontend
npm install
npm run build

# 3. Compile standalone single binary (Zero-CGO)
npm run build:binary

# 4. (Optional) Compile native macOS Cocoa wrapper into DMG
npm run package:dmg
```

The resulting executable in `./bin/` is completely standalone: it contains no runtime dependencies on Node.js, Python, or GCC.

---

## 6. Command-Line Options & Port Configuration

You can customize the runtime behavior of the standalone binary using flags or environment variables:

| Flag | Short | Description | Default |
| :--- | :--- | :--- | :--- |
| `--port <int>` | `-p` | Bind custom TCP port (overrides `AEGIS_PORT` and `PORT`) | Dynamic auto-scan |
| `--host <string>` | — | Bind address (`127.0.0.1` for loopback, `0.0.0.0` for LAN) | `127.0.0.1` |
| `--open` | `-o` | Automatically open default web browser on startup | `false` |
| `-v, --version` | `-v` | Display version information and exit | — |
| `-h, --help` | `-h` | Display command-line usage and exit | — |

### Configuring the Network Port

AegisCode adopts a Zero-Leakage policy: ports are allocated dynamically at runtime so external callers cannot predict a fixed listener port. You can configure a specific port through two methods:

1. **Via CLI Flag (Highest Precedence)**:
   ```bash
   ./bin/aegiscode-darwin-arm64 --port <PORT> --open
   # or using short flag:
   ./bin/aegiscode-darwin-arm64 -p <PORT> -o
   ```

2. **Via Environment Variable**:
   ```bash
   export AEGIS_PORT=<PORT>
   ./bin/aegiscode-darwin-arm64 --open
   ```

