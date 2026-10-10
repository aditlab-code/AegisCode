import type { FileItem } from "@/types/workbench"

export interface VirtualFileEntry {
  content: string
  isFolder: boolean
}

export interface SearchMatch {
  file: string
  line: number
  match: string
}

/**
 * In-Memory Virtual Workspace Engine
 * Provides a real, deterministic filesystem and workspace state engine
 * for independent logic testing without mocks and without Playwright.
 */
export class VirtualWorkspaceEngine {
  private files: Map<string, VirtualFileEntry> = new Map()
  private rootPath = "/Users/developer/project"
  private rootName = "project"

  constructor(initialFiles?: Record<string, string>) {
    // Root folder
    this.files.set(this.rootPath, { content: "", isFolder: true })

    if (initialFiles) {
      for (const [path, content] of Object.entries(initialFiles)) {
        this.writeFile(path, content, false)
      }
    }
  }

  getRoot() {
    return { rootPath: this.rootPath, rootName: this.rootName }
  }

  setRoot(path: string) {
    this.rootPath = path
    this.rootName = path.split("/").filter(Boolean).pop() || "project"
  }

  writeFile(relPath: string, content: string, isFolder = false): void {
    const clean = relPath.startsWith("/") ? relPath.slice(1) : relPath
    this.files.set(clean, { content, isFolder })
  }

  readFile(relPath: string): string {
    const clean = relPath.startsWith("/") ? relPath.slice(1) : relPath
    const entry = this.files.get(clean)
    if (!entry) {
      throw new Error(`File not found: ${relPath}`)
    }
    return entry.content
  }

  exists(relPath: string): boolean {
    const clean = relPath.startsWith("/") ? relPath.slice(1) : relPath
    return this.files.has(clean)
  }

  deleteFile(relPath: string): boolean {
    const clean = relPath.startsWith("/") ? relPath.slice(1) : relPath
    return this.files.delete(clean)
  }

  renameFile(oldPath: string, newPath: string): void {
    const cleanOld = oldPath.startsWith("/") ? oldPath.slice(1) : oldPath
    const cleanNew = newPath.startsWith("/") ? newPath.slice(1) : newPath
    const entry = this.files.get(cleanOld)
    if (!entry) {
      throw new Error(`File not found to rename: ${oldPath}`)
    }
    this.files.delete(cleanOld)
    this.files.set(cleanNew, entry)
  }

  moveFile(sourcePath: string, targetDir: string): string {
    const cleanSource = sourcePath.startsWith("/")
      ? sourcePath.slice(1)
      : sourcePath
    const filename = cleanSource.split("/").pop() || cleanSource
    const cleanTargetDir = targetDir.startsWith("/")
      ? targetDir.slice(1)
      : targetDir
    const newPath = cleanTargetDir ? `${cleanTargetDir}/${filename}` : filename

    const entry = this.files.get(cleanSource)
    if (!entry) {
      throw new Error(`Source file not found: ${sourcePath}`)
    }
    this.files.delete(cleanSource)
    this.files.set(newPath, entry)
    return newPath
  }

  getFlatTree(): FileItem[] {
    const items: FileItem[] = []
    for (const [path, entry] of this.files.entries()) {
      const parts = path.split("/").filter(Boolean)
      const name = parts[parts.length - 1] || path
      items.push({
        id: path,
        name,
        path,
        type: entry.isFolder ? "folder" : "file",
      })
    }
    return items
  }

  search(query: string): SearchMatch[] {
    const results: SearchMatch[] = []
    for (const [path, entry] of this.files.entries()) {
      if (entry.isFolder) continue
      const lines = entry.content.split("\n")
      lines.forEach((lineText, idx) => {
        if (lineText.includes(query)) {
          results.push({
            file: path,
            line: idx + 1,
            match: lineText.trim(),
          })
        }
      })
    }
    return results
  }
}
