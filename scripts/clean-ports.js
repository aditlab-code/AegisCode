#!/usr/bin/env node
import { execSync, spawn } from "node:child_process"

const isWin = process.platform === "win32"
const TARGET_PORTS = [8080, 8081, 5173]

/**
 * Finds all process IDs listening on a specific TCP port.
 */
export function getPidsForPort(port) {
  try {
    if (isWin) {
      const output = execSync(`netstat -ano -p tcp | findstr :${port}`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      })
      const pids = new Set()
      const lines = output.trim().split("\n")
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        const state = parts[3]
        const pid = parts[4]
        if (state === "LISTENING" && pid && pid !== "0") {
          pids.add(Number.parseInt(pid, 10))
        }
      }
      return Array.from(pids)
    }

    const output = execSync(`lsof -ti tcp:${port}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return output
      .trim()
      .split("\n")
      .map((p) => Number.parseInt(p.trim(), 10))
      .filter((p) => !Number.isNaN(p) && p > 0)
  } catch {
    return []
  }
}

/**
 * Terminates processes listening on specified ports using SIGTERM then SIGKILL.
 */
export function terminatePorts(ports = TARGET_PORTS, verbose = true) {
  const killedPids = new Set()

  for (const port of ports) {
    const pids = getPidsForPort(port)
    for (const pid of pids) {
      if (pid === process.pid || killedPids.has(pid)) continue
      killedPids.add(pid)

      if (verbose) {
        console.log(
          `[clean-ports] Terminating process on port ${port} (PID ${pid})...`,
        )
      }

      if (isWin) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" })
        } catch {
          // ignore if already exited
        }
      } else {
        try {
          // Attempt SIGTERM to process group first, fallback to PID
          try {
            process.kill(-pid, "SIGTERM")
          } catch {
            process.kill(pid, "SIGTERM")
          }
        } catch {
          // ignore
        }
      }
    }
  }

  if (killedPids.size > 0 && !isWin) {
    // Brief non-blocking grace period before SIGKILL watchdog (0% CPU)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150)

    for (const pid of killedPids) {
      try {
        process.kill(pid, 0) // check if still alive
        try {
          process.kill(-pid, "SIGKILL")
        } catch {
          process.kill(pid, "SIGKILL")
        }
      } catch {
        // process already exited
      }
    }
  }

  if (verbose && killedPids.size > 0) {
    console.log(
      `[clean-ports] Cleaned up ${killedPids.size} orphaned process(es). Ports are now free.`,
    )
  }
}

// When run directly from CLI
if (
  process.argv[1]?.endsWith("clean-ports.js") ||
  process.argv[1]?.endsWith("stop.js")
) {
  console.log("[clean-ports] Scanning for orphaned AegisCode processes...")
  terminatePorts(TARGET_PORTS, true)
  console.log("[clean-ports] Done.")
}
