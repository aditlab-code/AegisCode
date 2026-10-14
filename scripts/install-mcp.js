#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"

console.log("\n=======================================================")
console.log(" AegisCode · @colbymchenry/codegraph MCP Installer")
console.log("=======================================================")

const homedir = os.homedir()
const aegisMcpDir = path.join(homedir, ".aegiscode", "mcp")
const localBinPath = path.join(
  aegisMcpDir,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "codegraph.cmd" : "codegraph",
)

function resolveCodegraph() {
  const globalCheck = spawnSync("which", ["codegraph"], { encoding: "utf8" })
  if (globalCheck.status === 0 && globalCheck.stdout.trim()) {
    return globalCheck.stdout.trim()
  }
  if (fs.existsSync(localBinPath)) {
    return localBinPath
  }
  return null
}

// 1. Ensure @colbymchenry/codegraph is installed
console.log("\n[1/3] Checking @colbymchenry/codegraph CLI...")
let bin = resolveCodegraph()

if (!bin) {
  console.log("Attempting to install @colbymchenry/codegraph globally...")
  try {
    execSync("npm install -g @colbymchenry/codegraph@latest", {
      stdio: "inherit",
    })
    bin = resolveCodegraph()
  } catch (err) {
    console.warn("Global install failed. Falling back to ~/.aegiscode/mcp/ ...")
    try {
      fs.mkdirSync(aegisMcpDir, { recursive: true })
      execSync(
        "npm install --prefix " +
          aegisMcpDir +
          " @colbymchenry/codegraph@latest",
        {
          stdio: "inherit",
        },
      )
      bin = resolveCodegraph()
    } catch (fallbackErr) {
      console.error(
        "❌ Failed to install @colbymchenry/codegraph:",
        fallbackErr.message,
      )
      process.exit(1)
    }
  }
}

// Verification step
console.log(`✓ Located codegraph executable at: ${bin}`)
try {
  const ver = execSync(`"${bin}" --version`, { encoding: "utf8" }).trim()
  console.log(`✓ Verified @colbymchenry/codegraph version: ${ver}`)
} catch (verErr) {
  console.error("❌ Failed to verify codegraph binary:", verErr.message)
  process.exit(1)
}

// 2. Wire up all detected AI agents (Claude Code, Cursor, Antigravity, OpenCode, Gemini CLI, Codex)
console.log(
  "\n[2/3] Wiring @colbymchenry/codegraph MCP to AI agents & initializing index...",
)
try {
  execSync(`"${bin}" install --yes --init`, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      CODEGRAPH_MCP_TOOLS:
        "explore,context,node,callers,callees,impact,affected,search,flow,status",
    },
  })
  console.log("✓ Agents wired and index initialized")
} catch (err) {
  console.warn("⚠️  codegraph install notice:", err.message)
}

// 3. Print MCP configuration summary
console.log("\n[3/3] @colbymchenry/codegraph MCP Configuration Reference:")
console.log("-------------------------------------------------------")
const sampleConfig = {
  mcpServers: {
    codegraph: {
      type: "stdio",
      command: bin,
      args: ["serve", "--mcp"],
      alwaysLoad: true,
      env: {
        CODEGRAPH_MCP_TOOLS:
          "explore,context,node,callers,callees,impact,affected,search,flow,status",
      },
    },
  },
}
console.log(JSON.stringify(sampleConfig, null, 2))
console.log("\n=======================================================")
console.log("✓ @colbymchenry/codegraph MCP setup complete!")
console.log("=======================================================\n")
