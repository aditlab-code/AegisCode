#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")

// ANSI Color formatting
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const GREEN = "\x1b[32m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const CYAN = "\x1b[36m"
const GRAY = "\x1b[90m"

console.log(
  `\n${BOLD}======================================================${RESET}`,
)
console.log(`${BOLD} AegisCode Development Environment Doctor${RESET}`)
console.log(
  `${BOLD}======================================================${RESET}`,
)

/**
 * Detect host details
 */
function getPlatformInfo() {
  const platform = os.platform()
  const release = os.release()
  let details = `${platform} (${release})`

  if (platform === "linux") {
    try {
      const osRelease = fs.readFileSync("/etc/os-release", "utf8")
      const nameMatch = osRelease.match(/^PRETTY_NAME="?([^"\n]+)"?/m)
      if (nameMatch) {
        details = nameMatch[1]
      }
    } catch {
      // fallback
    }
  } else if (platform === "darwin") {
    details = `macOS ${os.release()} (${os.arch()})`
  } else if (platform === "win32") {
    details = `Windows ${os.release()} (${os.arch()})`
  }

  return details
}

/**
 * Check if a TCP port is in use
 */
function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        resolve(false)
      } else {
        resolve(true)
      }
    })
    server.once("listening", () => {
      server.close(() => resolve(true))
    })
    server.listen(port, "127.0.0.1")
  })
}

/**
 * Check Node.js version >= 20.0.0
 */
function checkNodeVersion() {
  const version = process.versions.node
  const major = parseInt(version.split(".")[0], 10)
  return {
    name: "Node.js Runtime",
    version: `v${version}`,
    ok: major >= 20,
    required: ">= 20.0.0",
    hint: "Install or upgrade Node.js via NVM (https://github.com/nvm-sh/nvm) or your system package manager.",
  }
}

/**
 * Check npm availability
 */
function checkNpmVersion() {
  try {
    const output = execSync("npm --version", {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim()
    return {
      name: "npm Package Manager",
      version: `v${output}`,
      ok: true,
      required: "Any modern npm",
      hint: "",
    }
  } catch {
    return {
      name: "npm Package Manager",
      version: "Not found",
      ok: false,
      required: "Bundled with Node.js",
      hint: "Ensure npm is in your PATH.",
    }
  }
}

/**
 * Check Go toolchain >= 1.23
 */
function checkGoVersion() {
  const res = spawnSync("go", ["version"], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  })
  if (res.status === 0 && res.stdout) {
    const match = res.stdout.match(/go(\d+\.\d+(\.\d+)?)/)
    const verStr = match ? match[1] : res.stdout.trim()
    const parts = verStr.split(".")
    const major = parseInt(parts[0], 10)
    const minor = parseInt(parts[1], 10)
    const ok = major > 1 || (major === 1 && minor >= 23)

    return {
      name: "Go Toolchain",
      version: `go${verStr}`,
      ok,
      required: ">= 1.23.0",
      hint: ok ? "" : "Upgrade Go compiler: https://go.dev/dl/",
    }
  }

  // Missing Go hints by platform
  let installCmd = "https://go.dev/dl/"
  const platform = os.platform()
  if (platform === "linux") {
    try {
      const osRelease = fs.readFileSync("/etc/os-release", "utf8")
      if (/ID(_LIKE)?=.*(?:arch|cachyos|manjaro)/i.test(osRelease)) {
        installCmd = "sudo pacman -S go"
      } else if (/ID(_LIKE)?=.*(?:debian|ubuntu|mint)/i.test(osRelease)) {
        installCmd = "sudo apt update && sudo apt install golang-go"
      } else if (/ID(_LIKE)?=.*(?:fedora|rhel)/i.test(osRelease)) {
        installCmd = "sudo dnf install golang"
      }
    } catch {
      installCmd = "sudo apt install golang-go  OR  sudo pacman -S go"
    }
  } else if (platform === "darwin") {
    installCmd = "brew install go"
  } else if (platform === "win32") {
    installCmd = "winget install GoLang.Go"
  }

  return {
    name: "Go Toolchain",
    version: "Not found",
    ok: false,
    required: ">= 1.23.0",
    hint: `Install Go: ${installCmd}`,
  }
}

/**
 * Check node_modules directory
 */
function checkNodeModules() {
  const nodeModulesPath = path.resolve(rootDir, "node_modules")
  const viteBinPath = path.resolve(nodeModulesPath, "vite/bin/vite.js")
  const ok = fs.existsSync(nodeModulesPath) && fs.existsSync(viteBinPath)
  return {
    name: "Frontend Dependencies",
    version: ok ? "Installed" : "Missing",
    ok,
    required: "node_modules/",
    hint: ok ? "" : "Run 'npm install' in the project root.",
  }
}

async function run() {
  console.log(`\nHost Platform: ${CYAN}${getPlatformInfo()}${RESET}`)
  console.log(`Project Root : ${GRAY}${rootDir}${RESET}\n`)

  const checks = [
    checkNodeVersion(),
    checkNpmVersion(),
    checkGoVersion(),
    checkNodeModules(),
  ]

  // Port checks
  const port8080Available = await checkPortAvailable(8080)
  const port5173Available = await checkPortAvailable(5173)

  checks.push({
    name: "Backend Port (8080)",
    version: port8080Available ? "Available" : "In Use",
    ok: port8080Available,
    required: "Free TCP port",
    hint: port8080Available ? "" : "Clean via: npm run clean:ports",
  })

  checks.push({
    name: "Frontend Port (5173)",
    version: port5173Available ? "Available" : "In Use",
    ok: port5173Available,
    required: "Free TCP port",
    hint: port5173Available ? "" : "Clean via: npm run clean:ports",
  })

  // Print audit table
  let allPassed = true
  console.log(
    `${BOLD}${"Component".padEnd(26)} ${"Status".padEnd(14)} ${"Current".padEnd(16)} ${"Required".padEnd(14)}${RESET}`,
  )
  console.log(`${GRAY}${"-".repeat(70)}${RESET}`)

  for (const check of checks) {
    const icon = check.ok ? `${GREEN}✓ PASS${RESET}` : `${RED}✗ FAIL${RESET}`
    const cur = check.version.padEnd(16)
    const req = check.required.padEnd(14)
    console.log(`${check.name.padEnd(26)} ${icon.padEnd(22)} ${cur} ${req}`)
    if (!check.ok) allPassed = false
  }

  console.log(`${GRAY}${"-".repeat(70)}${RESET}\n`)

  if (allPassed) {
    console.log(
      `${GREEN}${BOLD}✓ All development prerequisites are satisfied!${RESET}`,
    )
    console.log(
      `You can now run: ${CYAN}npm run dev:all${RESET} to start both backend & frontend.\n`,
    )
    process.exit(0)
  } else {
    console.log(`${YELLOW}${BOLD}⚠️  Some prerequisites need attention:${RESET}`)
    for (const check of checks) {
      if (!check.ok && check.hint) {
        console.log(`  • ${BOLD}${check.name}${RESET}: ${check.hint}`)
      }
    }
    console.log(
      `\nAfter addressing the items above, re-run: ${CYAN}npm run check:env${RESET}\n`,
    )
    process.exit(1)
  }
}

run()
