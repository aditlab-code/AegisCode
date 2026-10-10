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

export const initialFileBuffers: Record<string, FileBuffer> = {
  "App.tsx": {
    language: "TypeScript",
    isDirty: false,
    content: `import { useMemo, useState } from 'react';

type ServerState = 'idle' | 'running' | 'error';

export default function LocalServer() {
  const [state, setState] = useState<ServerState>('running');
  const port = 4173;

  const endpoint = useMemo(() => {
    return \`http://localhost:\${port}\`;
  }, [port]);

  return (
    <main className="server-shell">
      <Status value={state} />
      <Endpoint url={endpoint} />
    </main>
  );
}`,
  },
  "Status.tsx": {
    language: "TypeScript",
    isDirty: false,
    content: `interface StatusProps {
  value: string;
}

export function Status({ value }: StatusProps) {
  return (
    <div className="status-badge">
      <span className="status-dot" />
      <span>{value}</span>
    </div>
  );
}`,
  },
  "Endpoint.tsx": {
    language: "TypeScript",
    isDirty: false,
    content: `interface EndpointProps {
  url: string;
}

export function Endpoint({ url }: EndpointProps) {
  return (
    <a className="endpoint-link" href={url} target="_blank" rel="noreferrer">
      {url}
    </a>
  );
}`,
  },
  "index.css": {
    language: "CSS",
    isDirty: false,
    content: `@import 'tailwindcss';

:root {
  --color-canvas: #090d16;
  --color-surface: #101726;
  --color-line: #1c2638;
  --color-ink: #f0f4fc;
}`,
  },
  "package.json": {
    language: "JSON",
    isDirty: false,
    content: `{
  "name": "aegiscode",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}`,
  },
  "vite.config.ts": {
    language: "TypeScript",
    isDirty: false,
    content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
  },
});`,
  },
  ".gitignore": {
    language: "Plain Text",
    isDirty: false,
    content: `node_modules
dist
.DS_Store`,
  },
  ".env": {
    language: "Plain Text",
    isDirty: false,
    content: `PORT=4173
AEGIS_DEBUG=true
AEGIS_MODE=local`,
  },
  "SKILL.md": {
    language: "Markdown",
    isDirty: false,
    content: `# Agent Skills Specification

This repository contains OpenCode and Aegis agent skills.
- spec-driven-development
- test-driven-development
- debugging-and-error-recovery
`,
  },
}

export const initialFiles: FileItem[] = [
  { depth: 0, icon: "folder", label: ".agents", open: false, muted: true },
  { depth: 1, icon: "file", label: "SKILL.md", muted: true },
  { depth: 0, icon: "folder", label: "src", open: true },
  { depth: 1, icon: "folder", label: "components", open: true },
  { depth: 2, icon: "file", label: "Endpoint.tsx" },
  { depth: 2, icon: "file", label: "Status.tsx" },
  { depth: 1, icon: "file", label: "App.tsx", active: true },
  { depth: 1, icon: "file", label: "index.css" },
  { depth: 0, icon: "file", label: ".env", muted: true },
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

export const initialStagedChanges: GitChange[] = [
  {
    code: "M",
    file: "Sidebar.tsx",
    directory: "src/components/layout/sidebar",
  },
]

export const initialGitRepos: GitRepo[] = [
  {
    id: "repo-1",
    name: "aegiscode (root)",
    branch: "main",
    path: "/Users/aditwicaksono/Documents/Project-AI/AegisCodev2",
  },
  {
    id: "repo-2",
    name: "aegis-runner",
    branch: "dev",
    path: "/Users/aditwicaksono/Documents/Project-AI/aegis-runner",
  },
]

export const initialGitCommits: GitCommitNode[] = [
  {
    id: "commit-1",
    hash: "7f4b89a",
    message: "feat: add bottom panel drag and drop",
    author: "Adit",
    time: "10m ago",
    branch: "main",
    isHead: true,
  },
  {
    id: "commit-2",
    hash: "3c2d1e0",
    message: "refactor: flexbox bottom panel layout",
    author: "Adit",
    time: "32m ago",
    branch: "main",
  },
  {
    id: "commit-3",
    hash: "a98c7b6",
    message: "feat: VS Code window groups split editor",
    author: "Adit",
    time: "2h ago",
    branch: "feature/sidebar",
  },
  {
    id: "commit-4",
    hash: "1e5f8a2",
    message: "chore: init aegis codebase architecture",
    author: "Adit",
    time: "1d ago",
    branch: "main",
  },
]

export const initialTerminalLines: string[] = [
  "pnpm dev",
  "Local server ready in 312 ms",
  "➜ Local: http://localhost:4173/",
  "SSE connected · session local-01",
]

export const initialTerminalSessions: TerminalSession[] = [
  {
    id: "session-term-1",
    name: "1: zsh",
    shell: "zsh",
    lines: [
      "pnpm dev",
      "Local server ready in 312 ms",
      "➜ Local: http://localhost:4173/",
      "SSE connected · session local-01",
    ],
    running: true,
    commandHistory: ["pnpm dev"],
  },
]
