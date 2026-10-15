#!/usr/bin/env node

/**
 * install-lsp-bundle.js
 * Automated checker and installer for top programming language LSPs supported by AegisCode:
 * - TypeScript / JavaScript (@vtsls/language-server, typescript-language-server)
 * - Python (pyright)
 * - Web Core: HTML, CSS, JSON (vscode-langservers-extracted)
 * - Go (gopls)
 * - Rust (rust-analyzer)
 * - C/C++ (clangd)
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { homedir } from "node:os"

const isWin = process.platform === "win32"
const home = homedir()

function findBinary(names, additionalPaths = []) {
  for (const p of additionalPaths) {
    if (existsSync(p)) return p
  }

  for (const name of names) {
    const cmd = isWin ? `where ${name}` : `which ${name}`
    try {
      const out = execSync(cmd, { stdio: "pipe" })
        .toString()
        .trim()
        .split("\n")[0]
        ?.trim()
      if (out && existsSync(out)) return out
    } catch {
      // not in PATH
    }
  }

  return null
}

const SERVERS = [
  {
    language: "TypeScript / JavaScript",
    key: "typescript",
    binaries: ["vtsls", "typescript-language-server"],
    npmPackages: [
      "@vtsls/language-server",
      "typescript-language-server",
      "typescript",
    ],
    installTip:
      "npm install -g @vtsls/language-server typescript-language-server typescript",
  },
  {
    language: "Python",
    key: "python",
    binaries: ["pyright-langserver", "pyright"],
    npmPackages: ["pyright"],
    installTip: "npm install -g pyright (or pip install pyright)",
  },
  {
    language: "Web Core (HTML/CSS/JSON)",
    key: "web",
    binaries: [
      "vscode-html-language-server",
      "vscode-css-language-server",
      "vscode-json-language-server",
    ],
    npmPackages: ["vscode-langservers-extracted"],
    installTip: "npm install -g vscode-langservers-extracted",
  },
  {
    language: "Go",
    key: "go",
    binaries: ["gopls"],
    extraPaths: [
      path.join(home, "go", "bin", isWin ? "gopls.exe" : "gopls"),
      "/usr/local/go/bin/gopls",
      "/opt/homebrew/bin/gopls",
    ],
    installTip: "go install golang.org/x/tools/gopls@latest",
  },
  {
    language: "Rust",
    key: "rust",
    binaries: ["rust-analyzer"],
    extraPaths: [
      path.join(
        home,
        ".cargo",
        "bin",
        isWin ? "rust-analyzer.exe" : "rust-analyzer",
      ),
      "/opt/homebrew/bin/rust-analyzer",
      "/usr/local/bin/rust-analyzer",
    ],
    installTip:
      "brew install rust-analyzer (or rustup component add rust-analyzer)",
  },
  {
    language: "C / C++",
    key: "cpp",
    binaries: ["clangd", "ccls"],
    extraPaths: [
      "/usr/bin/clangd",
      "/usr/local/bin/clangd",
      "/opt/homebrew/opt/llvm/bin/clangd",
      "/opt/homebrew/bin/clangd",
    ],
    installTip:
      "brew install llvm (macOS) or sudo apt-get install clangd (Linux)",
  },
  {
    language: "Bash / Shell",
    key: "bash",
    binaries: ["bash-language-server"],
    npmPackages: ["bash-language-server"],
    installTip: "npm install -g bash-language-server",
  },
  {
    language: "Makefile",
    key: "makefile",
    binaries: ["make-language-server", "autotools-language-server"],
    npmPackages: ["make-language-server"],
    installTip: "npm install -g make-language-server",
  },
  {
    language: "C# (CSharp)",
    key: "csharp",
    binaries: ["csharp-ls", "omnisharp", "OmniSharp"],
    extraPaths: [
      path.join(
        home,
        ".dotnet",
        "tools",
        isWin ? "csharp-ls.exe" : "csharp-ls",
      ),
      "/usr/local/bin/omnisharp",
      "/opt/homebrew/bin/omnisharp",
    ],
    installTip: "dotnet tool install -g csharp-ls (or brew install omnisharp)",
  },
]

function run() {
  const checkOnly = process.argv.includes("--check")
  console.log("\n=======================================================")
  console.log("   AegisCode Language Server Protocol (LSP) Bundle     ")
  console.log("=======================================================\n")

  const missingNpm = []
  const missingOthers = []

  for (const s of SERVERS) {
    const foundPath = findBinary(s.binaries, s.extraPaths || [])
    if (foundPath) {
      console.log(`[INSTALLED] ${s.language.padEnd(28)} -> ${foundPath}`)
    } else {
      console.log(
        `[MISSING]   ${s.language.padEnd(28)} -> Needs: ${s.installTip}`,
      )
      if (s.npmPackages) {
        missingNpm.push(...s.npmPackages)
      } else {
        missingOthers.push(s)
      }
    }
  }

  if (missingNpm.length === 0 && missingOthers.length === 0) {
    console.log(
      "\n All top language servers are installed and ready for AegisCode!\n",
    )
    return
  }

  if (checkOnly) {
    console.log(
      "\nRun `node scripts/install-lsp-bundle.js` without `--check` to auto-install missing npm packages.\n",
    )
    return
  }

  if (missingNpm.length > 0) {
    const packagesToInstall = [...new Set(missingNpm)].join(" ")
    console.log(
      `\nInstalling missing npm LSP packages: ${packagesToInstall}...`,
    )
    try {
      execSync(`npm install -g ${packagesToInstall}`, { stdio: "inherit" })
      console.log(" npm packages installed successfully.")
    } catch (err) {
      console.error(" Failed to install npm packages globally:", err.message)
    }
  }

  if (missingOthers.length > 0) {
    console.log("\nNext manual steps for system-level toolchains:")
    for (const m of missingOthers) {
      console.log(`- ${m.language}: ${m.installTip}`)
    }
    console.log("")
  }
}

run()
