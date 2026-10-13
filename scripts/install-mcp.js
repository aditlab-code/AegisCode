#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const serverDir = path.resolve(rootDir, "server")

console.log("\n=======================================================")
console.log(" AegisCode Universal MCP Installer")
console.log("=======================================================")

// 1. Determine target installation directory
const homeDir = os.homedir()
const isWin = process.platform === "win32"
const binDir = path.join(homeDir, ".local", "bin")

if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true })
}

const binName = isWin ? "aegiscode.exe" : "aegiscode"
const targetBin = path.join(binDir, binName)

// 2. Compile standalone Go binary
console.log("\n[1/3] Compiling AegisCode Core CLI binary...")
try {
  execSync(`go build -o "${targetBin}" ./cmd/server`, {
    cwd: serverDir,
    stdio: "inherit",
    env: process.env,
  })
  if (!isWin) {
    fs.chmodSync(targetBin, 0o755)
  }
  console.log(`✓ Successfully compiled and installed to ${targetBin}`)
} catch (err) {
  console.error("❌ Failed to compile Go binary:", err.message)
  process.exit(1)
}

// 3. Configure Antigravity MCP if 'agy' is installed
console.log("\n[2/3] Configuring Antigravity / Gemini CLI...")
const agyCheck = spawnSync("which", ["agy"], { encoding: "utf8" })
if (agyCheck.status === 0 && agyCheck.stdout.trim()) {
  try {
    // Remove dead/bloated graphify or agent-lsp if present
    spawnSync("agy", ["mcp", "remove", "graphify"], { stdio: "ignore" })
    spawnSync("agy", ["mcp", "remove", "agent-lsp"], { stdio: "ignore" })

    // Clean old ~/.gemini/antigravity-cli/mcp/graphify directory
    const agyMcpGraphify = path.join(
      homeDir,
      ".gemini",
      "antigravity-cli",
      "mcp",
      "graphify",
    )
    if (fs.existsSync(agyMcpGraphify)) {
      fs.rmSync(agyMcpGraphify, { recursive: true, force: true })
    }

    // Register clean portable stdio command
    execSync("agy mcp add codegraph aegiscode mcp", { stdio: "inherit" })
    console.log("✓ Antigravity CLI registered: codegraph -> aegiscode mcp")
  } catch (err) {
    console.warn("⚠️  Antigravity CLI configuration note:", err.message)
  }
} else {
  console.log(
    "ℹ Antigravity CLI ('agy') not found in PATH; skipping agy registration.",
  )
}

// 4. Output configuration instructions for other MCP clients
console.log("\n[3/3] Client Configuration Reference:")
console.log("-------------------------------------------------------")
console.log("AegisCode MCP can be integrated into any MCP client using:\n")

const sampleConfig = {
  mcpServers: {
    codegraph: {
      command: "aegiscode",
      args: ["mcp"],
    },
  },
}

console.log(
  "• Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json):",
)
console.log(JSON.stringify(sampleConfig, null, 2))
console.log("\n• Cursor (.cursor/mcp.json or Settings > MCP):")
console.log(JSON.stringify(sampleConfig, null, 2))
console.log("\n• Direct terminal invocation:")
console.log("  $ aegiscode mcp [--workspace <path>]\n")
console.log("=======================================================")
console.log("✓ AegisCode MCP installation complete!")
console.log("=======================================================\n")
