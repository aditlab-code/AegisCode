# AegisCode Installation & Build Guide

> **Objective**: Quickstart and setup guide for running and building AegisCode locally, including frontend development, Go backend compilation, and tablet companion pairing.

---

## 1. Prerequisites & Environment Setup

Ensure the following tools are installed on your workstation:

| Requirement | Recommended Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.x` | Frontend build tooling and runtime |
| **pnpm** or **npm** | `pnpm >= 9.x` / `npm >= 10.x` | Frontend package management |
| **Go (Golang)** | `>= 1.23.x` | Core backend server compilation |
| **Delve (`dlv`)** | Latest (`go install github.com/go-delve/delve/cmd/dlv@latest`) | Bundled backend debugging runtime |
| **RTK (Rust Token Killer)** | Latest at `~/.local/bin/rtk` | Mandatory CLI token compression proxy for AI agents |

---

## 2. Frontend Development Setup

Clone the repository and launch the frontend development environment:

```bash
# 1. Clone the repository
git clone https://github.com/aditwicaksono/AegisCodev2.git
cd AegisCodev2

# 2. Install dependencies
rtk npm install

# 3. Launch Vite development server
rtk npm run dev
```

The web interface will be available at:
`http://localhost:5173`

---

## 3. Production Build & Verification

To verify that the frontend builds with zero TypeScript errors and passes code formatting:

```bash
# Compile and package production assets into dist/
rtk npm run build

# Check code formatting with oxfmt
rtk npm run format
```

All production assets are bundled cleanly into [`dist/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/dist).

---

## 4. Go Core Server Setup & Single Binary Compilation

The Go backend serves the API endpoints, terminal PTY processes, and bundles the static web assets into a single executable:

### Running in Development Mode
```bash
# Run the Go Core Server directly pointing to active workspace
cd server
go run cmd/server/main.go --workspace=.. --port=8080
```

### Compiling the Standalone Single Binary
```bash
# 1. First, build the frontend production assets
cd ..
npm run build

# 2. Build the Go binary with embedded frontend dist/
cd server
go build -ldflags="-s -w" -o ../bin/aegis cmd/server/main.go

# 3. Execute the single binary
../bin/aegis
```

The binary embeds the complete IDE web application into itself via Go's `embed.FS`. Launching `./bin/aegis` automatically starts the local HTTP server, launches the local terminal PTY runner, and opens your browser at `http://127.0.0.1:8080`.

---

## 5. Remote Tablet Companion Setup

To use an iPad or Android tablet as a companion screen on your local Wi-Fi:

1. Launch AegisCode on your primary workstation.
2. In the AegisCode header, click the **Companion Pairing** icon or run the server with LAN exposure:
   ```bash
   ./bin/aegis --bind=0.0.0.0 --port=8080
   ```
3. A pairing QR code and local network URL will be displayed:
   `http://192.168.1.xxx:8080/?mode=companion&token=xxxxxx`
4. Scan the QR code or open the link on your tablet browser.
5. Select between:
   - **Host Web Preview Tab**: View the website/service running from your workspace.
   - **Focus Code Editor Tab**: Open and edit active code buffers with touch-friendly ergonomics, instantly synchronized to your desktop IDE.

---

## 6. Troubleshooting & Common Issues

- **Port in Use**: If port 8080 or 5173 is already in use, pass `--port <new-port>` to the binary or `npm run dev -- --port <new-port>`.
- **Permissions on Unix Sockets**: Ensure the user has write permissions to `~/.aegis/`. The socket file `~/.aegis/run/agent.sock` must have permissions `0600`.
- **Missing RTK Proxy**: If `rtk` is not found, verify that `~/.local/bin` is in your `PATH` or invoke commands using the fallback `rtk proxy <command>`.
