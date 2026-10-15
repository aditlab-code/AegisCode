export interface RunCommandOptions {
  isWindows?: boolean
}

export function getTerminalRunCommand(
  filePath: string,
  options?: RunCommandOptions,
): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase()
  const isWin =
    options?.isWindows ??
    (typeof navigator !== "undefined"
      ? navigator.userAgent.toLowerCase().includes("win")
      : typeof process !== "undefined" && process.platform === "win32")

  const binPath = isWin ? ".\\aegis_bin.exe" : "/tmp/aegis_bin"
  const runBin = isWin ? ".\\aegis_bin.exe" : "/tmp/aegis_bin"

  switch (ext) {
    case "py":
    case "pyw":
      return isWin ? `python "${filePath}"` : `python3 "${filePath}"`
    case "go": {
      const normalized = filePath.replace(/\\/g, "/")
      const lastSlash = normalized.lastIndexOf("/")
      const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "."
      const goTarget = dir === "." ? "." : `./${dir.replace(/^[./]+/, "")}`
      return `go run ${goTarget}`
    }
    case "js":
    case "mjs":
    case "cjs":
      return `node "${filePath}"`
    case "ts":
    case "mts":
    case "cts":
      return `npx tsx "${filePath}"`
    case "sh":
    case "bash":
    case "zsh":
      return `bash "${filePath}"`
    case "c":
      return `clang "${filePath}" -o ${binPath} && ${runBin}`
    case "cpp":
    case "cc":
    case "cxx":
      return `clang++ "${filePath}" -o ${binPath} && ${runBin}`
    case "rs":
      return `rustc "${filePath}" -o ${binPath} && ${runBin}`
    default:
      return null
  }
}
