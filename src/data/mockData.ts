import type {
  FileItem,
  DiagnosticItem,
  NotificationItem,
  GitChange,
} from "../types/workbench"

export const initialFiles: FileItem[] = [
  { depth: 0, icon: "folder", label: "src", open: true },
  { depth: 1, icon: "folder", label: "components", open: true },
  { depth: 2, icon: "file", label: "Endpoint.tsx" },
  { depth: 2, icon: "file", label: "Status.tsx" },
  { depth: 1, icon: "file", label: "App.tsx", active: true },
  { depth: 1, icon: "file", label: "index.css" },
  { depth: 0, icon: "file", label: ".gitignore", muted: true },
  { depth: 0, icon: "file", label: "package.json" },
  { depth: 0, icon: "file", label: "vite.config.ts" },
]

export const initialDiagnostics: DiagnosticItem[] = [
  {
    id: "diag-1",
    title: "JSX element has no corresponding closing tag.",
    location: "Status.tsx [18, 4]",
    type: "error",
    source: "typescript",
  },
  {
    id: "diag-2",
    title: "'setState' is assigned but never used.",
    location: "App.tsx [6, 17]",
    type: "warning",
    source: "eslint",
  },
]

export const initialNotifications: NotificationItem[] = [
  {
    id: "notif-1",
    title: "Lint completed",
    detail: "TypeScript found one syntax error",
    read: false,
    time: "now",
  },
  {
    id: "notif-2",
    title: "Server ready",
    detail: "Local server is available on port 4173",
    read: false,
    time: "2m",
  },
  {
    id: "notif-3",
    title: "Git status changed",
    detail: "Working tree has two modified files",
    read: true,
    time: "5m",
  },
]

export const initialGitChanges: GitChange[] = [
  { code: "M", file: "App.tsx", directory: "src" },
  { code: "M", file: "index.css", directory: "src" },
]

export const initialTerminalLines: string[] = [
  "pnpm dev",
  "Local server ready in 312 ms",
  "➜ Local: http://localhost:4173/",
  "SSE connected · session local-01",
]
