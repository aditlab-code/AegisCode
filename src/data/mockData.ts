import type {
  FileItem,
  DiagnosticItem,
  NotificationItem,
  FileBuffer,
  TerminalSession,
} from "../types/workbench"

export const initialFileBuffers: Record<string, FileBuffer> = {}

export const initialFiles: FileItem[] = []

export const initialDiagnostics: DiagnosticItem[] = []

export const initialNotifications: NotificationItem[] = []

export function detectDefaultShell(): string {
  if (
    typeof navigator !== "undefined" &&
    /(win32|win64|windows|wow64)/i.test(
      navigator.userAgent || navigator.platform || "",
    )
  ) {
    return "powershell"
  }
  return "zsh"
}

const defaultShell = detectDefaultShell()

export const initialTerminalLines: string[] = [
  `Aegis Terminal Session (${defaultShell})`,
  "Local environment ready. Type commands to execute.",
]

export const initialTerminalSessions: TerminalSession[] = [
  {
    id: "session-term-1",
    name: `1: ${defaultShell}`,
    shell: defaultShell,
    lines: [
      `Aegis Terminal Session (${defaultShell})`,
      "Local environment ready. Type commands to execute.",
    ],
    running: false,
    commandHistory: [],
  },
]
