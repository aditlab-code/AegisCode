#!/usr/bin/env node
import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const serverDir = path.resolve(rootDir, "server")
const viteBin = path.resolve(rootDir, "node_modules/vite/bin/vite.js")

const isWin = process.platform === "win32"

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
      // Send signal to process group
      process.kill(-pid, signal)
    } catch {
      try {
        process.kill(pid, signal)
      } catch {
        // Ignore ESRCH
      }
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

  const forceKillTimer = setTimeout(() => {
    for (const child of children) {
      killChild(child, "SIGKILL")
    }
    process.exit(exitCode)
  }, 2000)

  if (forceKillTimer.unref) {
    forceKillTimer.unref()
  }

  const checkInterval = setInterval(() => {
    const alive = children.some((c) => !c.killed && c.exitCode === null)
    if (!alive) {
      clearInterval(checkInterval)
      clearTimeout(forceKillTimer)
      process.exit(exitCode)
    }
  }, 100)

  if (checkInterval.unref) {
    checkInterval.unref()
  }
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
})

// 1. Spawn Go Core Server
const goServer = spawn("go", ["run", "./cmd/server"], {
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

// 2. Spawn Vite Frontend
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
