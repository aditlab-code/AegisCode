#!/usr/bin/env node
import { execSync, spawn } from "node:child_process"
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
