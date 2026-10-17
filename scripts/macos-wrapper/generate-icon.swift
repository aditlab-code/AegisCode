import Cocoa

let arguments = CommandLine.arguments
let svgPath = arguments.count > 1 ? arguments[1] : "public/favicon.svg"
let outputIcnsPath = arguments.count > 2 ? arguments[2] : "scripts/macos-wrapper/AppIcon.icns"

guard let data = FileManager.default.contents(atPath: svgPath),
      let svgImage = NSImage(data: data) else {
    fputs("❌ Error: Failed to load SVG from \(svgPath)\n", stderr)
    exit(1)
}

let fileManager = FileManager.default
let tempDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("AppIcon-\(UUID().uuidString).iconset")

do {
    try fileManager.createDirectory(at: tempDir, withIntermediateDirectories: true, attributes: nil)
} catch {
    fputs("❌ Error: Failed to create temp iconset directory: \(error)\n", stderr)
    exit(1)
}

defer {
    try? fileManager.removeItem(at: tempDir)
}

let iconSizes: [(name: String, size: Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]

for item in iconSizes {
    let dim = item.size
    guard let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: dim,
        pixelsHigh: dim,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fputs("❌ Error: Failed to create bitmap rep for \(item.name)\n", stderr)
        exit(1)
    }

    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: rep)
    NSGraphicsContext.current = context

    let rect = NSRect(x: 0, y: 0, width: dim, height: dim)
    svgImage.draw(in: rect)

    NSGraphicsContext.restoreGraphicsState()

    guard let pngData = rep.representation(using: .png, properties: [:]) else {
        fputs("❌ Error: Failed to get PNG data for \(item.name)\n", stderr)
        exit(1)
    }

    let filePath = tempDir.appendingPathComponent(item.name)
    do {
        try pngData.write(to: filePath)
    } catch {
        fputs("❌ Error: Failed to write PNG \(item.name): \(error)\n", stderr)
        exit(1)
    }
}

// Run iconutil to convert .iconset to .icns
let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", tempDir.path, "-o", outputIcnsPath]

do {
    try process.run()
    process.waitUntilExit()
    if process.terminationStatus != 0 {
        fputs("❌ Error: iconutil exited with code \(process.terminationStatus)\n", stderr)
        exit(1)
    }
    print("✅ Successfully generated native macOS icon: \(outputIcnsPath)")
} catch {
    fputs("❌ Error running iconutil: \(error)\n", stderr)
    exit(1)
}
