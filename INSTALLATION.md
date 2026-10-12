# AegisCode Installation & Deployment Guide

> **Release Version**: `v1.0.0-beta.1`  
> **Target Audience**: End users, beta testers, and developers deploying AegisCode locally or pairing companion screens over LAN.

---

## 1. Platform Support & Verification Status Matrix

AegisCode provides pre-compiled standalone single binaries and a native macOS `.dmg` package. Please review the official testing verification status per operating system:

| Platform / Architecture | Package / Binary Target | Test Status | Notes |
| :--- | :--- | :--- | :--- |
| **macOS Apple Silicon (`darwin/arm64`)** | `bin/AegisCode.dmg`<br>`bin/aegiscode-darwin-arm64` | **`[Tested & Verified]`** | Fully verified and tested natively on Apple Silicon (M1/M2/M3/M4). Native Cocoa WKWebView wrapper included. |
| **macOS Intel (`darwin/amd64`)** | `bin/aegiscode-darwin-amd64` | **`[Untested / Experimental]`** | Cross-compiled Go binary. Community testing welcome. |
| **Windows x64 (`windows/amd64`)** | `bin/aegiscode-windows-amd64.exe` | **`[Untested / Experimental]`** | Cross-compiled Go standalone binary. Automatically launches standalone Microsoft Edge App mode on launch. |
| **Linux x86_64 (`linux/amd64`)** | `bin/aegiscode-linux-amd64` | **`[Untested / Experimental]`** | Cross-compiled Go standalone binary with embedded web assets and PTY runner. |
| **Linux ARM64 (`linux/arm64`)** | `bin/aegiscode-linux-arm64` | **`[Untested / Experimental]`** | Cross-compiled Go standalone binary. Ideal for Raspberry Pi 4/5 or ARM servers. |

---

## 2. macOS Apple Silicon Installation (`.dmg` — Tested & Verified)

### Step 1: Mount and Install
1. Locate the packaged installer: [`bin/AegisCode.dmg`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/bin/AegisCode.dmg).
2. Double-click `AegisCode.dmg` in Finder to mount the volume.
3. Drag the **AegisCode** app icon into the **Applications** folder shortcut.

### Step 2: macOS Gatekeeper Security Notice Bypass
Because AegisCode is distributed as an independent open-source beta release without an Apple Developer ID paid signing certificate, macOS Gatekeeper may present an alert stating:
> *"AegisCode cannot be opened because Apple cannot check it for malicious software."*

You can verify and authorize execution in one of two ways:

#### Option A: Finder Context Menu (Recommended)
1. Open Finder and navigate to `/Applications`.
2. **Right-click** (or `Control` + Click) on **AegisCode.app**.
3. Select **Open** from the context menu.
4. When prompted by macOS, click **Open** to confirm and launch. (This is only required once).

#### Option B: Terminal Command (One-Liner)
Run the following terminal command to clear the quarantine flag:
```bash
xattr -cr /Applications/AegisCode.app
```
Once executed, launch AegisCode directly from Spotlight (`Cmd + Space`), Launchpad, or `/Applications`.

---

## 3. Running Pre-Compiled Standalone Binaries

AegisCode is uniquely engineered as a zero-dependency, self-contained single executable. The Go Core Server bundles the complete React 19 IDE web client internally using Go `embed.FS`. No Node.js runtime, Python dependencies, or external web servers are required to run pre-compiled binaries.

### Running on macOS / Linux
```bash
# Make binary executable
chmod +x ./bin/aegiscode-darwin-arm64

# Launch AegisCode (opens default browser automatically at http://localhost:8080)
./bin/aegiscode-darwin-arm64 --open
```

### Running on Windows
1. Open PowerShell or Command Prompt.
2. Navigate to your binary folder:
   ```powershell
   .\bin\aegiscode-windows-amd64.exe --open
   ```
3. AegisCode automatically launches in dedicated standalone window mode via Microsoft Edge App Mode (`msedge.exe --app=http://localhost:8080`).

---

## 4. Remote Tablet Companion Setup (iPad / Android Tablets)

AegisCode supports instant, zero-latency companion screen pairing across your local network (Wi-Fi):

1. Launch the server exposed on your local network:
   ```bash
   ./bin/aegiscode-darwin-arm64 --bind=0.0.0.0 --port=8080
   ```
2. In the AegisCode top header, click the **Tablet Companion Pairing** icon.
3. A pairing modal displaying a QR code and local network URL will appear:
   ```text
   http://192.168.1.xxx:8080/?mode=companion&token=xxxxxx
   ```
4. Scan the QR code with your iPad or Android tablet camera, or open the link in any mobile browser (Safari, Chrome).
5. Switch effortlessly between:
   - **Host Web Preview Tab**: Live browser previewing dev servers running on your workstation.
   - **Tablet Code Scratchpad**: Touch-friendly, low-latency mobile code editing buffer.

---

## 5. Building From Source (Developers)

If you wish to compile AegisCode directly from source code:

### Prerequisites
- **Node.js**: `>= 20.x`
- **npm** or **pnpm**: `npm >= 10.x`
- **Go (Golang)**: `>= 1.23.x`
- **RTK (Rust Token Killer)**: Recommended CLI proxy (`~/.local/bin/rtk`)

### Step-by-Step Compilation
```bash
# 1. Clone repository
git clone https://github.com/aditwicaksono/AegisCodev2.git
cd AegisCodev2

# 2. Install frontend dependencies
npm install

# 3. Build production frontend assets
npm run build

# 4. Compile native standalone Go binary
npm run build:binary

# 5. (Optional) Cross-compile all platform binaries
npm run build:binary:all

# 6. (macOS Only) Package native DMG installer
npm run package:dmg
```

All generated output binaries and installer packages are placed into [`bin/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/bin).
