import type {
  FileItem,
  GitBranch,
  GitCommitNode,
  GitDiffResult,
  GitRepo,
  GitStatusData,
} from "../types/workbench"

export interface WorkspaceInfo {
  rootPath: string
  name: string
}

export interface BackendFileNode {
  path: string
  name: string
  type: "file" | "folder"
  depth: number
  children?: BackendFileNode[]
}

export interface SearchMatchItem {
  lineNumber: number
  column: number
  lineContent: string
  matchText: string
}

export interface BackendSearchResult {
  filename: string
  matches: SearchMatchItem[]
}

export type GitStatusResult = GitStatusData

export interface DirectoryItem {
  name: string
  path: string
}

export interface DirectoryBrowseResult {
  currentPath: string
  parentPath: string
  homePath: string
  rootPath: string
  directories: DirectoryItem[]
}

export interface PickFolderResult {
  status: "ok" | "cancelled" | "unsupported"
  path?: string
  name?: string
  rootPath?: string
  cancelled?: boolean
  unsupported?: boolean
  error?: string
}

const API_BASE = ""

export async function fetchWorkspaceInfo(): Promise<WorkspaceInfo> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/info`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      err.error || `Failed to fetch workspace info: ${res.statusText}`,
    )
  }
  return res.json()
}

export async function openWorkspace(path: string): Promise<WorkspaceInfo> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to open workspace: ${res.statusText}`)
  }
  return res.json()
}

export async function closeWorkspace(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/close`, {
    method: "POST",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to close workspace: ${res.statusText}`)
  }
  return res.json()
}

export async function pickFolderNative(): Promise<PickFolderResult> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/pick-folder`, {
    method: "POST",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to pick folder: ${res.statusText}`)
  }
  return res.json()
}

export async function browseDirectories(
  path?: string,
  showHidden = false,
): Promise<DirectoryBrowseResult> {
  const params = new URLSearchParams()
  if (path) params.set("path", path)
  if (showHidden) params.set("showHidden", "true")

  const res = await fetch(
    `${API_BASE}/api/v1/workspace/browse?${params.toString()}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      err.error || `Failed to browse directory: ${res.statusText}`,
    )
  }
  return res.json()
}

export interface CreateFolderResult {
  status: string
  path: string
}

export async function createWorkspaceFolder(
  path: string,
): Promise<CreateFolderResult> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/folder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to create folder: ${res.statusText}`)
  }
  return res.json()
}

export function flattenBackendTree(nodes: BackendFileNode[]): FileItem[] {
  const result: FileItem[] = []

  function traverse(list: BackendFileNode[], depth: number) {
    for (const node of list) {
      const isFolder = node.type === "folder"
      const item: FileItem = {
        id: node.path,
        depth,
        icon: isFolder ? "folder" : "file",
        label: node.name,
        name: node.name,
        path: node.path,
        type: node.type,
        open: depth === 0,
        children: node.children
          ? node.children.map((c) => ({
              depth: depth + 1,
              icon: c.type === "folder" ? "folder" : "file",
              label: c.name,
              name: c.name,
              path: c.path,
              type: c.type,
            }))
          : undefined,
      }
      result.push(item)

      if (node.children && node.children.length > 0) {
        traverse(node.children, depth + 1)
      }
    }
  }

  traverse(nodes, 0)
  return result
}

export interface WorkspaceTreeResult {
  rawTree: BackendFileNode[]
  flatTree: FileItem[]
}

export async function fetchWorkspaceTree(
  depth = 8,
  showHidden = false,
): Promise<WorkspaceTreeResult> {
  const res = await fetch(
    `${API_BASE}/api/v1/workspace/tree?depth=${depth}&showHidden=${showHidden}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to fetch file tree: ${res.statusText}`)
  }
  const data = await res.json()
  const rawTree: BackendFileNode[] = data.tree || []
  return {
    rawTree,
    flatTree: flattenBackendTree(rawTree),
  }
}

export async function fetchFileContent(path: string): Promise<string> {
  const res = await fetch(
    `${API_BASE}/api/v1/workspace/file?path=${encodeURIComponent(path)}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to fetch file: ${res.statusText}`)
  }
  const data = await res.json()
  return data.content ?? ""
}

export async function saveWorkspaceFile(
  path: string,
  content: string,
  isFolder = false,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content, isFolder }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to save file: ${res.statusText}`)
  }
}

export async function deleteWorkspaceFile(path: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/workspace/file?path=${encodeURIComponent(path)}`,
    {
      method: "DELETE",
    },
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to delete file: ${res.statusText}`)
  }
}

export async function renameWorkspaceFile(
  oldPath: string,
  newPath: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ oldPath, newPath }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to rename file: ${res.statusText}`)
  }
}

export async function moveWorkspaceFile(
  sourcePath: string,
  targetDirectory: string,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourcePath, targetDirectory }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to move file: ${res.statusText}`)
  }
  const data = await res.json()
  return data.newPath
}

export async function searchWorkspace(
  query: string,
  isRegex = false,
  isMatchCase = false,
  isWholeWord = false,
): Promise<BackendSearchResult[]> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, isRegex, isMatchCase, isWholeWord }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to search: ${res.statusText}`)
  }
  const data = await res.json()
  return data.results || []
}

export interface ReplaceAllResult {
  count: number
  modifiedFiles: string[]
}

export async function replaceAllWorkspace(
  query: string,
  replacement: string,
  isRegex = false,
  isMatchCase = false,
  isWholeWord = false,
): Promise<ReplaceAllResult> {
  const res = await fetch(`${API_BASE}/api/v1/workspace/replace-all`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      replacement,
      isRegex,
      isMatchCase,
      isWholeWord,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to replace: ${res.statusText}`)
  }
  const data = await res.json()
  return {
    count: data.replacements || 0,
    modifiedFiles: data.modifiedFiles || [],
  }
}

async function parseResponseError(
  res: Response,
  fallbackPrefix: string,
): Promise<string> {
  try {
    const data = await res.json()
    if (data && typeof data.error === "string" && data.error.trim()) {
      return data.error.trim()
    }
    if (data && typeof data.message === "string" && data.message.trim()) {
      return data.message.trim()
    }
  } catch {
    try {
      const text = await res.text()
      if (text && text.trim()) {
        return text.trim()
      }
    } catch {
      // ignore
    }
  }
  const statusInfo = res.statusText
    ? ` (${res.status} ${res.statusText})`
    : ` (${res.status})`
  return `${fallbackPrefix}${statusInfo}`
}

export async function fetchGitStatus(): Promise<GitStatusResult> {
  const res = await fetch(`${API_BASE}/api/v1/git/status`)
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to fetch git status"))
  }
  return res.json()
}

export async function initGitRepo(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/init`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(
      await parseResponseError(res, "Failed to initialize git repository"),
    )
  }
}

export async function fetchGitBranches(): Promise<GitBranch[]> {
  const res = await fetch(`${API_BASE}/api/v1/git/branches`)
  if (!res.ok) {
    throw new Error(
      await parseResponseError(res, "Failed to fetch git branches"),
    )
  }
  const data = await res.json()
  return data.branches || []
}

export async function checkoutGitBranch(branch: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/branch/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ branch }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to checkout branch"))
  }
}

export async function createGitBranch(
  name: string,
  checkout = true,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/branch/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, checkout }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to create branch"))
  }
}

export async function fetchGitLog(limit = 50): Promise<GitCommitNode[]> {
  const res = await fetch(`${API_BASE}/api/v1/git/log?limit=${limit}`)
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to fetch git log"))
  }
  const data = await res.json()
  return data.commits || []
}

export async function fetchGitTimeline(
  file = "",
  limit = 30,
): Promise<GitCommitNode[]> {
  const params = new URLSearchParams()
  if (file) params.set("file", file)
  if (limit) params.set("limit", String(limit))

  const res = await fetch(
    `${API_BASE}/api/v1/git/timeline?${params.toString()}`,
  )
  if (!res.ok) {
    throw new Error(
      await parseResponseError(res, "Failed to fetch git timeline"),
    )
  }
  const data = await res.json()
  return data.commits || []
}

export async function stageGitFiles(
  files?: string[],
  all = false,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/stage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files || [], all }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to stage files"))
  }
}

export async function unstageGitFiles(
  files?: string[],
  all = false,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/unstage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files || [], all }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to unstage files"))
  }
}

export async function discardGitFiles(
  files?: string[],
  all = false,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/discard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ files: files || [], all }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to discard files"))
  }
}

export async function commitGitChanges(
  message: string,
  autoStage = false,
): Promise<GitCommitNode> {
  const res = await fetch(`${API_BASE}/api/v1/git/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, autoStage }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to commit"))
  }
  const data = await res.json()
  return data.commit || { id: "", hash: "", message, author: "" }
}

export async function pushGit(setUpstream = false): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ setUpstream }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to push"))
  }
}

export async function pullGit(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/pull`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to pull"))
  }
}

export async function syncGit(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/sync`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to sync"))
  }
}

export async function fetchGitTags(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/v1/git/tags`)
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to fetch git tags"))
  }
  const data = await res.json()
  return data.tags || []
}

export async function createGitTag(name: string, message = ""): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/tag`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, message }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to create tag"))
  }
}

export async function pushGitTags(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/tag/push`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to push tags"))
  }
}

export async function addGitRemote(
  url: string,
  name = "origin",
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/git/remote/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, url }),
  })
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to add remote"))
  }
}

export async function fetchGitDiff(
  file: string,
  staged = false,
  commit = "",
): Promise<GitDiffResult> {
  const params = new URLSearchParams()
  params.set("file", file)
  if (staged) params.set("staged", "true")
  if (commit) params.set("commit", commit)

  const res = await fetch(`${API_BASE}/api/v1/git/diff?${params.toString()}`)
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to fetch diff"))
  }
  return res.json()
}
