#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const binDir = path.resolve(rootDir, "bin")

const pkgJson = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, "package.json"), "utf8"),
)
const appVersion = pkgJson.version || "1.0.0-beta.1"

if (process.platform !== "darwin") {
  console.log("DMG packaging is only supported natively on macOS.")
  process.exit(0)
}

const primaryBinary = path.resolve(binDir, "aegiscode")
const archBinary = path.resolve(binDir, "aegiscode-darwin-arm64")
const targetBinary = fs.existsSync(primaryBinary) ? primaryBinary : archBinary

if (!fs.existsSync(targetBinary)) {
  console.error(
    "❌ Binary aegiscode not found in bin/. Run npm run build:binary first.",
  )
  process.exit(1)
}

const stagingDir = path.resolve(rootDir, ".tmp-dmg-staging")
const appDir = path.resolve(stagingDir, "AegisCode.app")
const macosDir = path.resolve(appDir, "Contents/MacOS")
const resourcesDir = path.resolve(appDir, "Contents/Resources")
const dmgOutput = path.resolve(binDir, "AegisCode.dmg")

console.log("\n======================================================")
console.log(" Packaging AegisCode for macOS (.dmg & .app)")
console.log("======================================================")

// Clean staging & existing DMG
fs.rmSync(stagingDir, { recursive: true, force: true })
if (fs.existsSync(dmgOutput)) {
  fs.rmSync(dmgOutput, { force: true })
}

fs.mkdirSync(macosDir, { recursive: true })
fs.mkdirSync(resourcesDir, { recursive: true })

// 1. Copy Go backend to Contents/MacOS/aegiscode-server
const serverBinDest = path.resolve(macosDir, "aegiscode-server")
fs.copyFileSync(targetBinary, serverBinDest)
fs.chmodSync(serverBinDest, 0o755)

// 2. Compile native macOS Cocoa WKWebView wrapper
console.log("Compiling native macOS Cocoa WKWebView window...")
const swiftWrapperSrc = path.resolve(
  rootDir,
  "scripts/macos-wrapper/main.swift",
)
const appExecutable = path.resolve(macosDir, "AegisCode")
const swiftcResult = spawnSync(
  "swiftc",
  ["-O", swiftWrapperSrc, "-o", appExecutable],
  { stdio: "inherit" },
)

if (swiftcResult.status !== 0) {
  console.error("❌ Failed to compile Swift native webview wrapper.")
  process.exit(1)
}
fs.chmodSync(appExecutable, 0o755)

// 3. Ensure native AppIcon.icns exists and copy to Contents/Resources
const icnsSource = path.resolve(rootDir, "scripts/macos-wrapper/AppIcon.icns")
if (!fs.existsSync(icnsSource)) {
  console.log(
    "🎨 Generating native high-res AppIcon.icns from public/favicon.svg...",
  )
  const genScript = path.resolve(
    rootDir,
    "scripts/macos-wrapper/generate-icon.swift",
  )
  const svgSource = path.resolve(rootDir, "public/favicon.svg")
  const genResult = spawnSync("swift", [genScript, svgSource, icnsSource], {
    stdio: "inherit",
  })
  if (genResult.status !== 0) {
    console.warn("⚠️ Warning: Failed to generate AppIcon.icns automatically.")
  }
}

if (fs.existsSync(icnsSource)) {
  const icnsDest = path.resolve(resourcesDir, "AppIcon.icns")
  fs.copyFileSync(icnsSource, icnsDest)
  // Also copy to volume icon for mounted DMG
  fs.copyFileSync(icnsSource, path.resolve(stagingDir, ".VolumeIcon.icns"))
  console.log("✅ Attached native AppIcon.icns to macOS App bundle.")
}

// 4. Create Info.plist
const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>AegisCode</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
    <key>CFBundleIdentifier</key>
    <string>com.aditwicaksono.aegiscode</string>
    <key>CFBundleName</key>
    <string>AegisCode</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>${appVersion}</string>
    <key>LSMinimumSystemVersion</key>
    <string>12.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
`
fs.writeFileSync(path.resolve(appDir, "Contents/Info.plist"), infoPlist, "utf8")

// 5. Ad-Hoc Code Signing for Apple Silicon (ARM64) & Intel AMFI compliance
console.log(
  "🔏 Applying Ad-Hoc Code Signature (Apple Silicon / ARM64 AMFI compliant)...",
)
// Sign internal server binary first
spawnSync("codesign", ["--force", "--sign", "-", serverBinDest], {
  stdio: "ignore",
})
// Sign main executable
spawnSync("codesign", ["--force", "--sign", "-", appExecutable], {
  stdio: "ignore",
})
// Deep-sign the entire AegisCode.app bundle
const codesignResult = spawnSync(
  "codesign",
  ["--force", "--deep", "--sign", "-", appDir],
  { stdio: "inherit" },
)

if (codesignResult.status !== 0) {
  console.warn(
    "⚠️ Warning: Ad-hoc code signing failed, proceeding with unsigned bundle.",
  )
} else {
  console.log("✅ Successfully signed AegisCode.app with ad-hoc signature (-).")
  // Verify signature status
  const verifyResult = spawnSync(
    "codesign",
    ["--verify", "--deep", "--strict", appDir],
    {
      stdio: "pipe",
    },
  )
  if (verifyResult.status === 0) {
    console.log("✅ Signature verification passed (deep & strict).")
  }
}

// 6. Create Applications symlink for drag-and-drop installation
spawnSync("ln", [
  "-s",
  "/Applications",
  path.resolve(stagingDir, "Applications"),
])

// 7. Build DMG with hdiutil
console.log("📦 Creating DMG with hdiutil...")
const hdiutilResult = spawnSync(
  "hdiutil",
  [
    "create",
    "-volname",
    "AegisCode",
    "-srcfolder",
    stagingDir,
    "-ov",
    "-format",
    "UDZO",
    dmgOutput,
  ],
  { stdio: "inherit" },
)

// Clean staging
fs.rmSync(stagingDir, { recursive: true, force: true })

if (hdiutilResult.status !== 0) {
  console.error("❌ Failed to create DMG installer.")
  process.exit(1)
}

const stats = fs.statSync(dmgOutput)
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
console.log(`\n🎉 Successfully generated: bin/AegisCode.dmg (${sizeMB} MB)`)
console.log(
  "You can double-click this DMG on macOS to mount and install AegisCode!",
)
