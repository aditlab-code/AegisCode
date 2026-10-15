import type { GitChange, GitCommitNode } from "../../types/workbench"

export interface GitStageResult {
  changes: GitChange[]
  staged: GitChange[]
}

export interface GitCommitResult {
  staged: GitChange[]
  commits: GitCommitNode[]
  newCommit: GitCommitNode | null
  error?: string
}

export function stageChangeLogic(
  changes: GitChange[],
  staged: GitChange[],
  file: string,
): GitStageResult {
  const target = changes.find((c) => c.file === file)
  if (!target) return { changes, staged }

  const nextStaged = staged.some((s) => s.file === file)
    ? staged
    : [...staged, target]
  const nextChanges = changes.filter((c) => c.file !== file)

  return { changes: nextChanges, staged: nextStaged }
}

export function unstageChangeLogic(
  changes: GitChange[],
  staged: GitChange[],
  file: string,
): GitStageResult {
  const target = staged.find((s) => s.file === file)
  if (!target) return { changes, staged }

  const nextChanges = changes.some((c) => c.file === file)
    ? changes
    : [...changes, target]
  const nextStaged = staged.filter((s) => s.file !== file)

  return { changes: nextChanges, staged: nextStaged }
}

export function stageAllLogic(
  changes: GitChange[],
  staged: GitChange[],
): GitStageResult {
  return {
    changes: [],
    staged: [...staged, ...changes],
  }
}

export function unstageAllLogic(
  changes: GitChange[],
  staged: GitChange[],
): GitStageResult {
  return {
    changes: [...changes, ...staged],
    staged: [],
  }
}

export function commitChangesLogic(
  staged: GitChange[],
  commits: GitCommitNode[],
  branch: string,
  message: string,
  author = "Git User",
): GitCommitResult {
  const cleanMsg = message.trim()
  if (!cleanMsg) {
    return {
      staged,
      commits,
      newCommit: null,
      error: "Please enter a commit message",
    }
  }

  const commitHash = "c" + Date.now().toString(16).slice(-6)
  const newCommit: GitCommitNode = {
    id: commitHash,
    hash: commitHash,
    shortHash: commitHash,
    message: cleanMsg,
    author,
    timestamp: "Just now",
    branch,
  }

  return {
    staged: [],
    commits: [newCommit, ...commits],
    newCommit,
  }
}
