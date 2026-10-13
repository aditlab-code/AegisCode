export function getTerminalRunCommand(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "py":
    case "pyw":
      return `python3 "${filePath}"`
    case "go":
      return `go run "${filePath}"`
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
    case "cpp":
    case "cc":
    case "cxx":
    case "c":
      return `clang++ "${filePath}" -o /tmp/aegis_bin && /tmp/aegis_bin`
    case "rs":
      return `rustc "${filePath}" -o /tmp/aegis_bin && /tmp/aegis_bin`
    default:
      return null
  }
}
