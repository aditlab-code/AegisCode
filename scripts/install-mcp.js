#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process"

console.log("\n=======================================================")
console.log(" AegisCode · @colbymchenry/codegraph MCP Installer")
console.log("=======================================================")

// 1. Ensure @colbymchenry/codegraph is installed globally
console.log("\n[1/3] Checking @colbymchenry/codegraph CLI...")
const cgCheck = spawnSync("which", ["codegraph"], { encoding: "utf8" })
if (cgCheck.status !== 0 || !cgCheck.stdout.trim()) {
  console.log("Installing @colbymchenry/codegraph globally via npm...")
  try {
    execSync("npm install -g @colbymchenry/codegraph@latest", {
      stdio: "inherit",
    })
  } catch (err) {
    console.error("❌ Failed to install @colbymchenry/codegraph:", err.message)
    process.exit(1)
  }
} else {
  console.log(`✓ Found codegraph CLI at ${cgCheck.stdout.trim()}`)
}

// 2. Wire up all detected AI agents (Claude Code, Cursor, Antigravity, OpenCode, Gemini CLI, Codex)
// and initialize the current workspace's .codegraph/codegraph.db index
console.log(
  "\n[2/3] Wiring @colbymchenry/codegraph MCP to AI agents & indexing workspace...",
)
try {
  execSync("codegraph install --yes --init", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      CODEGRAPH_MCP_TOOLS:
        "explore,node,search,callers,callees,impact,files,status",
    },
  })
  console.log("✓ Agents wired and .codegraph/codegraph.db initialized")
} catch (err) {
  console.warn("⚠️  codegraph install note:", err.message)
}

// 3. Print MCP configuration summary
console.log("\n[3/3] @colbymchenry/codegraph MCP Configuration Reference:")
console.log("-------------------------------------------------------")
const sampleConfig = {
  mcpServers: {
    codegraph: {
      type: "stdio",
      command: "codegraph",
      args: ["serve", "--mcp"],
      alwaysLoad: true,
      env: {
        CODEGRAPH_MCP_TOOLS:
          "explore,node,search,callers,callees,impact,files,status",
      },
    },
  },
}
console.log(JSON.stringify(sampleConfig, null, 2))
console.log("\n=======================================================")
console.log("✓ @colbymchenry/codegraph MCP setup complete!")
console.log("=======================================================\n")
