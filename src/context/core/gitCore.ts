import { useCallback, useState } from "react"
import type { GitChange, GitCommitNode, GitRepo } from "../../types/workbench"
import {
  initialGitChanges,
  initialGitCommits,
  initialGitRepos,
  initialStagedChanges,
} from "../../data/mockData"

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

// Pure state transition functions for Git operations
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
  author = "Adit Wicaksono",
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
  if (staged.length === 0) {
    return {
      staged,
      commits,
      newCommit: null,
      error: "No staged changes to commit",
    }
  }

  const commitHash = Math.random().toString(16).substring(2, 9)
  const newCommit: GitCommitNode = {
    id: commitHash,
    hash: commitHash,
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

export interface UseGitCoreOptions {
  showToast: (msg: string) => void
}

export function useGitCore({ showToast }: UseGitCoreOptions) {
  const [activeBranch, setActiveBranch] = useState("main")
  const [activeRepo, setActiveRepo] = useState("aegis-code-v2")
  const [gitRepos, setGitRepos] = useState<GitRepo[]>(initialGitRepos)
  const [gitChanges, setGitChanges] = useState<GitChange[]>(initialGitChanges)
  const [stagedChanges, setStagedChanges] =
    useState<GitChange[]>(initialStagedChanges)
  const [gitCommits, setGitCommits] =
    useState<GitCommitNode[]>(initialGitCommits)

  const stageChange = useCallback(
    (file: string) => {
      setGitChanges((prevChanges) => {
        const res = stageChangeLogic(prevChanges, stagedChanges, file)
        setStagedChanges(res.staged)
        return res.changes
      })
    },
    [stagedChanges],
  )

  const unstageChange = useCallback(
    (file: string) => {
      setStagedChanges((prevStaged) => {
        const res = unstageChangeLogic(gitChanges, prevStaged, file)
        setGitChanges(res.changes)
        return res.staged
      })
    },
    [gitChanges],
  )

  const stageAllChanges = useCallback(() => {
    setGitChanges((prevChanges) => {
      const res = stageAllLogic(prevChanges, stagedChanges)
      setStagedChanges(res.staged)
      return res.changes
    })
    showToast("Staged all changes")
  }, [showToast, stagedChanges])

  const unstageAllChanges = useCallback(() => {
    setStagedChanges((prevStaged) => {
      const res = unstageAllLogic(gitChanges, prevStaged)
      setGitChanges(res.changes)
      return res.staged
    })
    showToast("Unstaged all changes")
  }, [gitChanges, showToast])

  const commitChanges = useCallback(
    (message: string) => {
      const res = commitChangesLogic(
        stagedChanges,
        gitCommits,
        activeBranch,
        message,
      )
      if (res.error) {
        showToast(res.error)
        return
      }
      if (res.newCommit) {
        setStagedChanges(res.staged)
        setGitCommits(res.commits)
        showToast(`Committed [${res.newCommit.hash}]: ${res.newCommit.message}`)
      }
    },
    [activeBranch, gitCommits, showToast, stagedChanges],
  )

  const gitPull = useCallback(() => {
    showToast(`Pulled latest changes from origin/${activeBranch}`)
  }, [activeBranch, showToast])

  const gitPush = useCallback(() => {
    showToast(`Pushed commits to origin/${activeBranch}`)
  }, [activeBranch, showToast])

  return {
    activeBranch,
    setActiveBranch,
    activeRepo,
    setActiveRepo,
    gitRepos,
    setGitRepos,
    gitChanges,
    setGitChanges,
    stagedChanges,
    setStagedChanges,
    gitCommits,
    setGitCommits,
    stageChange,
    unstageChange,
    stageAllChanges,
    unstageAllChanges,
    commitChanges,
    gitPull,
    gitPush,
  }
}
