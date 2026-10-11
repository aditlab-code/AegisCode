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

export const initialTerminalLines: string[] = [
  "Aegis Terminal Session (zsh)",
  "Local environment ready. Type commands to execute.",
]

export const initialTerminalSessions: TerminalSession[] = [
  {
    id: "session-term-1",
    name: "1: zsh",
    shell: "zsh",
    lines: [
      "Aegis Terminal Session (zsh)",
      "Local environment ready. Type commands to execute.",
    ],
    running: false,
    commandHistory: [],
  },
]
