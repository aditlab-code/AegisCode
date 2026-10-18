#!/usr/bin/env node
import { execSync, spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { terminatePorts } from "./clean-ports.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const serverDir = path.resolve(rootDir, "server")
const distServerDir = path.resolve(rootDir, "dist-server")
const viteBin = path.resolve(rootDir, "node_modules/vite/bin/vite.js")

const isWin = process.platform === "win32"
const serverBinName = isWin ? "aegis-server.exe" : "aegis-server"
const serverBin = path.resolve(distServerDir, serverBinName)

/**
 * Detect Linux distribution flavor from /etc/os-release
 */
function getLinuxDistro() {
  if (process.platform !== "linux") return null
  try {
    const osRelease = fs.readFileSync("/etc/os-release", "utf8")
    if (/ID(_LIKE)?=.*(?:arch|cachyos|manjaro)/i.test(osRelease)) return "arch"
    if (/ID(_LIKE)?=.*(?:debian|ubuntu|mint)/i.test(osRelease)) return "debian"
    if (/ID(_LIKE)?=.*(?:fedora|rhel|centos)/i.test(osRelease)) return "fedora"
    if (/ID(_LIKE)?=.*(?:suse|opensuse)/i.test(osRelease)) return "suse"
  } catch {
    // Ignore read errors
  }
  return "generic"
}

/**
 * Provide platform-specific Go installation instructions
 */
function getGoInstallGuide() {
  const platform = process.platform
  if (platform === "darwin") {
    return [
      "macOS detected:",
      "  • Using Homebrew (recommended): brew install go",
      "  • Official installer:           https://go.dev/dl/",
    ]
  }
  if (platform === "win32") {
    return [
      "Windows detected:",
      "  • Using Winget (PowerShell):    winget install GoLang.Go",
      "  • Using Chocolatey:             choco install golang",
      "  • Official installer:           https://go.dev/dl/",
      "  • If using WSL2 (Ubuntu):       sudo apt update && sudo apt install golang-go",
    ]
  }
  if (platform === "linux") {
    const distro = getLinuxDistro()
    if (distro === "arch") {
      return [
        "Linux (Arch / CachyOS / Manjaro) detected:",
        "  • Using pacman (recommended):   sudo pacman -S go",
      ]
    }
    if (distro === "debian") {
      return [
        "Linux (Ubuntu / Debian / WSL2) detected:",
        "  • Using apt:                    sudo apt update && sudo apt install golang-go",
      ]
    }
    if (distro === "fedora") {
      return [
        "Linux (Fedora / RHEL) detected:",
        "  • Using dnf:                    sudo dnf install golang",
      ]
    }
    return [
      "Linux detected:",
      "  • Arch/CachyOS:                 sudo pacman -S go",
      "  • Ubuntu/Debian/WSL:            sudo apt update && sudo apt install golang-go",
      "  • Fedora:                       sudo dnf install golang",
      "  • Official tarball:             https://go.dev/doc/install",
    ]
  }
  return ["Download and install Go from: https://go.dev/dl/"]
}

/**
 * Validate that mandatory dependencies (node_modules and Go compiler) exist before starting.
 */
function validatePrerequisites() {
  const issues = []

  // 1. Check node_modules and Vite binary
  const nodeModulesDir = path.resolve(rootDir, "node_modules")
  if (!fs.existsSync(nodeModulesDir) || !fs.existsSync(viteBin)) {
    issues.push({
      component: "Node.js dependencies (node_modules)",
      error: "Dependencies have not been installed yet.",
      remediation: [
        "Run the following command in the project root:",
        "  npm install",
      ],
    })
  }

  // 2. Check Go compiler
  const goCheck = spawnSync("go", ["version"], {
    stdio: ["ignore", "pipe", "pipe"],
  })
  if (goCheck.status !== 0 || goCheck.error) {
    issues.push({
      component: "Go toolchain (compiler)",
      error:
        "The 'go' executable is not installed or not found in system PATH.",
      remediation: [
        "AegisCode requires Go (version 1.23 or newer) to compile and run the backend server.",
        ...getGoInstallGuide(),
      ],
    })
  }

  if (issues.length > 0) {
    console.error(`\n======================================================`)
    console.error(` ❌ AegisCode Pre-Flight Check Failed`)
    console.error(`======================================================`)
    for (const issue of issues) {
      console.error(`\n[Missing] ${issue.component}`)
      console.error(`  Reason : ${issue.error}`)
      console.error(`  Action :`)
      for (const line of issue.remediation) {
        console.error(`    ${line}`)
      }
    }
    console.error(`\nOnce resolved, please re-run: npm run dev:all\n`)
    process.exit(1)
  }
}

// Perform prerequisite validation before any server lifecycle operation
validatePrerequisites()

let shuttingDown = false
const children = []

function killChild(child, signal = "SIGTERM") {
  if (!child || child.killed || child.exitCode !== null) return
  const pid = child.pid
  if (!pid) return

  if (isWin) {
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" })
    } catch {
      // Ignore if already terminated
    }
  } else {
    try {
      // Send signal to process group first, fallback to direct PID
      try {
        process.kill(-pid, signal)
      } catch {
        process.kill(pid, signal)
      }
    } catch {
      // Ignore ESRCH
    }
  }
}

function cleanup(exitCode = 0) {
  if (shuttingDown) return
  shuttingDown = true

  console.log("\n[dev:all] Shutting down all processes cleanly...")

  for (const child of children) {
    killChild(child, "SIGTERM")
  }

  // Ensure ports 8080 and 5173 are freed
  setTimeout(() => {
    for (const child of children) {
      killChild(child, "SIGKILL")
    }
    terminatePorts([8080, 5173], false)
    process.exit(exitCode)
  }, 400)
}
;["SIGINT", "SIGTERM", "SIGHUP"].forEach((sig) => {
  process.on(sig, () => {
    cleanup(0)
  })
})

process.on("exit", () => {
  for (const child of children) {
    killChild(child, "SIGKILL")
  }
  terminatePorts([8080, 5173], false)
})

// 0. Pre-flight: Clean any orphaned processes on port 8080 or 5173
console.log(
  "[dev:all] Pre-flight: ensuring ports 8080 and 5173 are available...",
)
terminatePorts([8080, 5173], false)

// 1. Compile Go server binary directly to eliminate 'go run' intermediate processes
console.log("[dev:all] Building Go Core Server binary...")
const distSrcDir = path.resolve(rootDir, "dist")
const distDestDir = path.resolve(serverDir, "internal/web/dist")
if (
  fs.existsSync(distSrcDir) &&
  fs.existsSync(path.resolve(distSrcDir, "index.html"))
) {
  fs.cpSync(distSrcDir, distDestDir, { recursive: true, force: true })
}
try {
  execSync(`go build -o "${serverBin}" ./cmd/server`, {
    cwd: serverDir,
    stdio: "inherit",
  })
} catch (err) {
  console.error("[dev:all] Failed to build Go Core Server:", err.message)
  process.exit(1)
}

// 2. Spawn Go Core Server binary directly
const goServer = spawn(serverBin, [], {
  cwd: serverDir,
  stdio: "inherit",
  detached: !isWin,
  env: process.env,
})
children.push(goServer)

goServer.on("error", (err) => {
  console.error("[dev:all] Failed to launch Go Core Server:", err.message)
  cleanup(1)
})

goServer.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.log(`[dev:all] Go Core Server exited (${code ?? signal})`)
    cleanup(code || 0)
  }
})

// 3. Spawn Vite Frontend
const viteFrontend = spawn(process.execPath, [viteBin], {
  cwd: rootDir,
  stdio: "inherit",
  detached: !isWin,
  env: process.env,
})
children.push(viteFrontend)

viteFrontend.on("error", (err) => {
  console.error("[dev:all] Failed to launch Vite frontend:", err.message)
  cleanup(1)
})

viteFrontend.on("exit", (code, signal) => {
  if (!shuttingDown) {
    console.log(`[dev:all] Vite frontend exited (${code ?? signal})`)
    cleanup(code || 0)
  }
})
