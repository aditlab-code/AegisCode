import type {
  FileItem,
  DiagnosticItem,
  NotificationItem,
  GitChange,
  FileBuffer,
  TerminalSession,
  GitCommitNode,
  GitRepo,
} from "../types/workbench"

export const initialFileBuffers: Record<string, FileBuffer> = {}

export const initialFiles: FileItem[] = []

export const initialDiagnostics: DiagnosticItem[] = []

export const initialNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "AegisCode Ready",
    detail: "Phase 6 Go Core Server connected",
    read: false,
    time: "now",
  },
]

export const initialGitChanges: GitChange[] = []

export const initialStagedChanges: GitChange[] = []

export const initialGitRepos: GitRepo[] = []

export const initialGitCommits: GitCommitNode[] = []

export const initialTerminalLines: string[] = [
  "Terminal & Runner unscoped for Phase 1",
]

export const initialTerminalSessions: TerminalSession[] = [
  {
    id: "session-term-1",
    name: "1: zsh (unscoped)",
    shell: "zsh",
    lines: ["Terminal & Runner unscoped for Phase 1"],
    running: false,
    commandHistory: [],
  },
]
