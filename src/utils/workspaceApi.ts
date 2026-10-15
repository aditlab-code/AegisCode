import type {
  FileItem,
  GitBranch,
  GitCommitNode,
  GitDiffResult,
  GitCompareResult,
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
  isFilenameMatch?: boolean
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

import { API_BASE } from "./apiBase"

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

export function compareFileTreeItems(a: FileItem, b: FileItem): number {
  const pathA = (a.path || a.name || a.label)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
  const pathB = (b.path || b.name || b.label)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
  const minLen = Math.min(pathA.length, pathB.length)

  for (let i = 0; i < minLen; i++) {
    if (pathA[i] !== pathB[i]) {
      const aIsFolder =
        i < pathA.length - 1 || a.type === "folder" || a.icon === "folder"
      const bIsFolder =
        i < pathB.length - 1 || b.type === "folder" || b.icon === "folder"
      if (aIsFolder !== bIsFolder) {
        return aIsFolder ? -1 : 1
      }
      return pathA[i].localeCompare(pathB[i], undefined, {
        sensitivity: "base",
        numeric: true,
      })
    }
  }

  return pathA.length - pathB.length
}

export function sortFileTree(files: FileItem[]): FileItem[] {
  return [...files].sort(compareFileTreeItems)
}

export function flattenBackendTree(nodes: BackendFileNode[]): FileItem[] {
  const result: FileItem[] = []

  function traverse(list: BackendFileNode[], depth: number) {
    const sorted = [...list].sort((a, b) => {
      const aDir = a.type === "folder"
      const bDir = b.type === "folder"
      if (aDir !== bDir) return aDir ? -1 : 1
      return a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
        numeric: true,
      })
    })

    for (const node of sorted) {
      const isFolder = node.type === "folder"
      const item: FileItem = {
        id: node.path,
        depth,
        icon: isFolder ? "folder" : "file",
        label: node.name,
        name: node.name,
        path: node.path,
        type: node.type,
        open: false,
        children: node.children
          ? node.children.map((c) => ({
              depth: depth + 1,
              icon: c.type === "folder" ? "folder" : "file",
              label: c.name,
              name: c.name,
              path: c.path,
              type: c.type,
              open: false,
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

export function cleanFilePath(path: string): string {
  if (!path) return ""
  let clean = path.trim()
  while (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'")) ||
    (clean.startsWith("`") && clean.endsWith("`")) ||
    (clean.startsWith('\\"') && clean.endsWith('\\"'))
  ) {
    if (clean.startsWith('\\"') && clean.endsWith('\\"')) {
      clean = clean.slice(2, -2).trim()
    } else {
      clean = clean.slice(1, -1).trim()
    }
  }
  return clean.replace(/\\/g, "/")
}

export function normalizeWorkspacePath(
  path: string,
  rootWorkspacePath?: string,
): string {
  if (!path) return ""
  const trimmed = path.trim()

  if (rootWorkspacePath) {
    const clean = cleanFilePath(trimmed)
    const rootClean = cleanFilePath(rootWorkspacePath).replace(/^\/+|\/+$/g, "")
    const pathClean = clean.replace(/^\/+/, "")
    if (pathClean.startsWith(rootClean + "/")) {
      return pathClean.slice(rootClean.length + 1)
    } else if (pathClean === rootClean) {
      return ""
    }
    return clean.replace(/^\/+/, "")
  }

  return trimmed.replace(/[/\\]+$/, "")
}

export function validateWorkspaceRelativePath(path: string): void {
  const trimmed = cleanFilePath(path)
  if (!trimmed) {
    throw new Error("Workspace file path cannot be empty")
  }
  const segments = trimmed.split("/")
  let depth = 0
  for (const seg of segments) {
    if (seg === "..") {
      depth--
      if (depth < 0) {
        throw new Error(`Path '${path}' escapes workspace root directory`)
      }
    } else if (seg && seg !== ".") {
      depth++
    }
  }
}

export interface FileDetailResponse {
  content: string
  isLarge?: boolean
  isBinary?: boolean
  size?: number
}

export async function fetchFileDetailed(
  path: string,
): Promise<FileDetailResponse> {
  const cleanPath = cleanFilePath(path)
  validateWorkspaceRelativePath(cleanPath)
  const res = await fetch(
    `${API_BASE}/api/v1/workspace/file?path=${encodeURIComponent(cleanPath)}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to fetch file: ${res.statusText}`)
  }
  const data = await res.json()
  return {
    content: data.content ?? "",
    isLarge: data.isLarge,
    isBinary: data.isBinary,
    size: data.size,
  }
}

export async function fetchFileContent(path: string): Promise<string> {
  const detail = await fetchFileDetailed(path)
  return detail.content
}

export interface CsvQueryOptions {
  page?: number
  pageSize?: number
  colOffset?: number
  colLimit?: number
  search?: string
}

export interface CsvQueryResponse {
  headers: string[]
  allHeaders?: string[]
  rows: string[][]
  totalRows: number
  totalCols: number
  page: number
  pageSize: number
  totalPages: number
  colOffset: number
  colLimit: number
  delimiter: string
  search?: string
  matchCount?: number
  isServerSide: boolean
  queryTimeMs: number
}

export async function queryWorkspaceCsv(
  path: string,
  options: CsvQueryOptions = {},
): Promise<CsvQueryResponse> {
  const cleanPath = cleanFilePath(path)
  validateWorkspaceRelativePath(cleanPath)
  const params = new URLSearchParams()
  params.set("path", cleanPath)
  if (options.page) params.set("page", String(options.page))
  if (options.pageSize) params.set("pageSize", String(options.pageSize))
  if (options.colOffset !== undefined)
    params.set("colOffset", String(options.colOffset))
  if (options.colLimit !== undefined)
    params.set("colLimit", String(options.colLimit))
  if (options.search) params.set("search", options.search)

  const res = await fetch(
    `${API_BASE}/api/v1/workspace/csv/query?${params.toString()}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to query CSV: ${res.statusText}`)
  }
  return res.json()
}

export async function saveWorkspaceFile(
  path: string,
  content: string,
  isFolder = false,
  exclusive = false,
): Promise<void> {
  const cleanPath = cleanFilePath(path)
  validateWorkspaceRelativePath(cleanPath)
  const res = await fetch(`${API_BASE}/api/v1/workspace/file`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: cleanPath, content, isFolder, exclusive }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Failed to save file: ${res.statusText}`)
  }
}

export async function deleteWorkspaceFile(path: string): Promise<void> {
  validateWorkspaceRelativePath(path)
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
  validateWorkspaceRelativePath(oldPath)
  validateWorkspaceRelativePath(newPath)
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

export interface GitUnlockResult {
  unlocked: boolean
  removed: string[]
  message?: string
}

export async function unlockGitRepo(): Promise<GitUnlockResult> {
  const res = await fetch(`${API_BASE}/api/v1/git/unlock`, {
    method: "POST",
  })
  if (!res.ok) {
    throw new Error(
      await parseResponseError(res, "Failed to unlock git repository"),
    )
  }
  return res.json()
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
  base = "",
): Promise<GitDiffResult> {
  const params = new URLSearchParams()
  params.set("file", file)
  if (staged) params.set("staged", "true")
  if (commit) params.set("commit", commit)
  if (base) params.set("base", base)

  const res = await fetch(`${API_BASE}/api/v1/git/diff?${params.toString()}`)
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to fetch diff"))
  }
  return res.json()
}

export async function fetchGitCompare(
  base: string,
  target: string,
): Promise<GitCompareResult> {
  const params = new URLSearchParams()
  params.set("base", base)
  params.set("target", target)

  const res = await fetch(`${API_BASE}/api/v1/git/compare?${params.toString()}`)
  if (!res.ok) {
    throw new Error(await parseResponseError(res, "Failed to compare commits"))
  }
  return res.json()
}

export interface FuzzyFindMatch {
  path: string
  score: number
  positions?: number[]
}

export interface FilesFindResult {
  query: string
  matches: FuzzyFindMatch[]
  total: number
  durationMs: number
}

export async function findWorkspaceFiles(
  query: string,
  limit = 20,
): Promise<FilesFindResult> {
  const params = new URLSearchParams()
  if (query) params.set("q", query)
  params.set("limit", String(limit))

  const res = await fetch(
    `${API_BASE}/api/v1/workspace/files/find?${params.toString()}`,
  )
  if (!res.ok) {
    throw new Error(
      await parseResponseError(res, "Failed to search workspace files"),
    )
  }
  return res.json()
}
