#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import zlib from "node:zlib"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const serverDir = path.resolve(rootDir, "server")
const distSrcDir = path.resolve(rootDir, "dist")
const distDestDir = path.resolve(serverDir, "internal/web/dist")
const binOutputDir = path.resolve(rootDir, "bin")

// Read package.json version
const pkgJson = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, "package.json"), "utf8"),
)
const version = `v${pkgJson.version || "1.0.0"}`

const args = process.argv.slice(2)
const buildAll = args.includes("--all")
const skipFrontend = args.includes("--skip-frontend")

console.log(`\n======================================================`)
console.log(` AegisCode Standalone Binary Builder (${version})`)
console.log(`======================================================`)

// Step 1: Build Frontend via Vite
if (!skipFrontend) {
  console.log(`\n[1/3] Building production frontend with Vite...`)
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm"
  const buildResult = spawnSync(npmCmd, ["run", "build"], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  })

  if (buildResult.status !== 0) {
    console.error(
      `❌ Frontend build failed with exit code ${buildResult.status}`,
    )
    process.exit(1)
  }
} else {
  console.log(`\n[1/3] Skipping frontend build (--skip-frontend)`)
}

// Verify dist exists
if (
  !fs.existsSync(distSrcDir) ||
  !fs.existsSync(path.resolve(distSrcDir, "index.html"))
) {
  console.error(`❌ dist/ directory is missing or does not contain index.html!`)
  process.exit(1)
}

function formatSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// Step 2: Synchronize dist to server/internal/web/dist with pre-compression
console.log(`\n[2/3] Embedding web assets into server/internal/web/dist...`)

// Clean stale assets folder to prevent ghost chunks from past builds from accumulating
const destAssetsDir = path.resolve(distDestDir, "assets")
if (fs.existsSync(destAssetsDir)) {
  fs.rmSync(destAssetsDir, { recursive: true, force: true })
}
fs.mkdirSync(distDestDir, { recursive: true })

// Copy fresh build
fs.cpSync(distSrcDir, distDestDir, { recursive: true, force: true })

// Compress assets to .gz and remove raw uncompressed versions for high-ratio text files
const COMPRESSIBLE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".css",
  ".svg",
  ".json",
  ".wasm",
  ".map",
  ".txt",
  ".html",
])

function compressDirectory(dir) {
  let originalBytes = 0
  let compressedBytes = 0
  let count = 0

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.resolve(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (COMPRESSIBLE_EXTENSIONS.has(ext)) {
          const raw = fs.readFileSync(fullPath)
          const gzipped = zlib.gzipSync(raw, { level: 9 })
          originalBytes += raw.length
          compressedBytes += gzipped.length
          count++

          // Write <file>.gz
          fs.writeFileSync(`${fullPath}.gz`, gzipped)

          // For assets/ directory (where the big chunks live), delete the raw uncompressed file
          // so Go's //go:embed only packs the .gz file into the binary.
          // Keep root index.html uncompressed as a fallback stub for clean checkout safety.
          if (entry.name !== "index.html") {
            fs.unlinkSync(fullPath)
          }
        }
      }
    }
  }

  walk(dir)
  return { count, originalBytes, compressedBytes }
}

const compressionStats = compressDirectory(distDestDir)
const savedRatio =
  compressionStats.originalBytes > 0
    ? (
        (1 -
          compressionStats.compressedBytes / compressionStats.originalBytes) *
        100
      ).toFixed(1)
    : "0.0"

console.log(
  `✓ Embedded assets synchronized & pre-compressed (${compressionStats.count} files): ${formatSize(
    compressionStats.originalBytes,
  )} -> ${formatSize(compressionStats.compressedBytes)} (${savedRatio}% savings)`,
)

// Step 3: Compile Standalone Go Binary
console.log(`\n[3/3] Compiling Go standalone executable(s)...`)
fs.mkdirSync(binOutputDir, { recursive: true })

const matrix = [
  { os: "darwin", arch: "arm64", ext: "" },
  { os: "darwin", arch: "amd64", ext: "" },
  { os: "linux", arch: "amd64", ext: "" },
  { os: "linux", arch: "arm64", ext: "" },
  { os: "windows", arch: "amd64", ext: ".exe" },
]

function compileTarget(targetOS, targetArch, outputFile) {
  const isWindows = targetOS === "windows"
  const env = {
    ...process.env,
    GOOS: targetOS,
    GOARCH: targetArch,
    CGO_ENABLED: "0",
  }

  const ldflags = `-s -w -X main.Version=${version}`
  const goArgs = [
    "build",
    "-trimpath",
    `-ldflags=${ldflags}`,
    "-o",
    outputFile,
    "./cmd/server",
  ]

  const targetLabel = `${targetOS}/${targetArch}`
  process.stdout.write(
    `  • Building ${targetLabel.padEnd(16)} -> ${path.relative(rootDir, outputFile)}... `,
  )

  const startTime = Date.now()
  const result = spawnSync("go", goArgs, {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  })

  if (result.status !== 0) {
    process.stdout.write(`FAILED\n`)
    console.error(`\nCompilation error for ${targetLabel}:`)
    console.error(result.stderr.toString())
    return false
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2)
  const stats = fs.statSync(outputFile)
  process.stdout.write(`DONE (${formatSize(stats.size)}, ${duration}s)\n`)
  return true
}

let allSuccess = true

if (buildAll) {
  console.log(`Cross-compilation matrix enabled (${matrix.length} targets):`)
  for (const item of matrix) {
    const filename = `aegiscode-${item.os}-${item.arch}${item.ext}`
    const outPath = path.resolve(binOutputDir, filename)
    const success = compileTarget(item.os, item.arch, outPath)
    if (!success) allSuccess = false
  }
} else {
  // Current host platform
  const hostOS = process.platform === "win32" ? "windows" : process.platform
  const hostArch = process.arch === "x64" ? "amd64" : process.arch
  const ext = hostOS === "windows" ? ".exe" : ""
  const outPath = path.resolve(binOutputDir, `aegiscode${ext}`)

  console.log(`Targeting host platform (${hostOS}/${hostArch}):`)
  const success = compileTarget(hostOS, hostArch, outPath)
  if (!success) allSuccess = false
}

if (!allSuccess) {
  console.error(`\n❌ One or more build targets failed.`)
  process.exit(1)
}

console.log(
  `\n🎉 Build completed successfully! Standalone binaries are in ./bin/`,
)
if (!buildAll) {
  const binaryPath = path.resolve(
    binOutputDir,
    process.platform === "win32" ? "aegiscode.exe" : "aegiscode",
  )
  console.log(`Run: ${path.relative(rootDir, binaryPath)}`)
}
