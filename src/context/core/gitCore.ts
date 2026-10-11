import { useCallback, useEffect, useRef, useState } from "react"
import type {
  GitBranch,
  GitChange,
  GitCommitNode,
  GitDiffResult,
  GitRepo,
  GitUser,
} from "../../types/workbench"
import {
  addGitRemote,
  checkoutGitBranch,
  commitGitChanges,
  createGitBranch,
  createGitTag,
  discardGitFiles,
  fetchGitBranches,
  fetchGitDiff,
  fetchGitLog,
  fetchGitStatus,
  fetchGitTags,
  fetchGitTimeline,
  initGitRepo,
  pullGit,
  pushGit,
  pushGitTags,
  stageGitFiles,
  syncGit,
  unlockGitRepo,
  unstageGitFiles,
} from "../../utils/workspaceApi"

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

export interface UseGitCoreOptions {
  showToast: (msg: string) => void
  rootWorkspacePath?: string
}

export function useGitCore({
  showToast,
  rootWorkspacePath,
}: UseGitCoreOptions) {
  const [isGitRepo, setIsGitRepo] = useState(false)
  const [activeBranch, setActiveBranchState] = useState("")
  const [activeRepo, setActiveRepo] = useState("")
  const [gitRepos, setGitRepos] = useState<GitRepo[]>([])
  const [gitChanges, setGitChanges] = useState<GitChange[]>([])
  const [stagedChanges, setStagedChanges] = useState<GitChange[]>([])
  const [gitCommits, setGitCommits] = useState<GitCommitNode[]>([])
  const [gitBranches, setGitBranches] = useState<GitBranch[]>([])
  const [gitTags, setGitTags] = useState<string[]>([])
  const [gitProfile, setGitProfile] = useState<GitUser>({ name: "", email: "" })
  const [ahead, setAhead] = useState(0)
  const [behind, setBehind] = useState(0)
  const [upstream, setUpstream] = useState("")
  const [commitHash, setCommitHash] = useState("")
  const [isLoadingGit, setIsLoadingGit] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [isRepoLocked, setIsRepoLocked] = useState(false)
  const [isOperatingGit, setIsOperatingGit] = useState(false)

  const isRefreshingRef = useRef(false)
  const refreshPendingRef = useRef(false)

  const refreshGit = useCallback(async () => {
    if (isRefreshingRef.current) {
      refreshPendingRef.current = true
      return
    }
    isRefreshingRef.current = true
    setIsLoadingGit(true)

    try {
      const status = await fetchGitStatus()
      if (!status.isRepo) {
        setIsGitRepo(false)
        setActiveBranchState("")
        setActiveRepo(status.repoName || "")
        setGitRepos([])
        setGitChanges([])
        setStagedChanges([])
        setGitCommits([])
        setGitBranches([])
        setGitTags([])
        setAhead(0)
        setBehind(0)
        setUpstream("")
        setCommitHash("")
        setGitError(null)
        setIsRepoLocked(false)
        return
      }

      setIsGitRepo(true)
      setIsRepoLocked(false)
      setActiveBranchState(status.branch || "main")
      setActiveRepo(status.repoName)
      setGitChanges(status.unstaged || [])
      setStagedChanges(status.staged || [])
      setGitProfile(status.user || { name: "", email: "" })
      setAhead(status.ahead || 0)
      setBehind(status.behind || 0)
      setUpstream(status.upstream || "")
      setCommitHash(status.commitHash || "")
      setGitError(null)

      setGitRepos([
        {
          id: status.repoName,
          name: status.repoName,
          branch: status.branch || "main",
          path: rootWorkspacePath || "",
        },
      ])

      // Concurrently fetch branches, log, and tags
      const [branchesResult, logResult, tagsResult] = await Promise.allSettled([
        fetchGitBranches(),
        fetchGitLog(50),
        fetchGitTags(),
      ])

      if (branchesResult.status === "fulfilled") {
        setGitBranches(branchesResult.value)
      }
      if (logResult.status === "fulfilled") {
        setGitCommits(logResult.value)
      }
      if (tagsResult.status === "fulfilled") {
        setGitTags(tagsResult.value)
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err)
      if (errMsg.includes("index.lock") || errMsg.includes("File exists")) {
        setIsRepoLocked(true)
      }
      setGitError(errMsg)
    } finally {
      setIsLoadingGit(false)
      isRefreshingRef.current = false
      if (refreshPendingRef.current) {
        refreshPendingRef.current = false
        setTimeout(() => {
          refreshGit()
        }, 120)
      }
    }
  }, [rootWorkspacePath])

  const handleGitOpError = useCallback(
    (err: unknown, prefix: string) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("index.lock") || msg.includes("File exists")) {
        setIsRepoLocked(true)
        showToast(
          `${prefix}: Repository is locked by index.lock. Click 'Unlock Repository' to fix.`,
        )
      } else {
        showToast(`${prefix}: ${msg}`)
      }
      setGitError(msg)
    },
    [showToast],
  )

  const unlockRepo = useCallback(async () => {
    setIsOperatingGit(true)
    try {
      const res = await unlockGitRepo()
      setIsRepoLocked(false)
      showToast(res.message || "Repository unlocked successfully")
      await refreshGit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Unlock failed: ${msg}`)
    } finally {
      setIsOperatingGit(false)
    }
  }, [refreshGit, showToast])

  // Initial and reactive refresh
  useEffect(() => {
    refreshGit()
  }, [refreshGit, rootWorkspacePath])

  // Periodic background check every 6s
  useEffect(() => {
    const timer = setInterval(() => {
      refreshGit()
    }, 6000)
    return () => clearInterval(timer)
  }, [refreshGit])

  const initRepo = useCallback(async () => {
    try {
      await initGitRepo()
      showToast("Initialized empty Git repository")
      await refreshGit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Init failed: ${msg}`)
    }
  }, [refreshGit, showToast])

  const checkoutBranch = useCallback(
    async (branch: string) => {
      try {
        await checkoutGitBranch(branch)
        showToast(`Switched to branch "${branch}"`)
        await refreshGit()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        showToast(`Checkout failed: ${msg}`)
      }
    },
    [refreshGit, showToast],
  )

  const createBranch = useCallback(
    async (name: string, checkout = true) => {
      try {
        await createGitBranch(name, checkout)
        showToast(`Created branch "${name}"`)
        await refreshGit()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        showToast(`Create branch failed: ${msg}`)
      }
    },
    [refreshGit, showToast],
  )

  const stageChange = useCallback(
    async (file: string) => {
      setIsOperatingGit(true)
      try {
        await stageGitFiles([file], false)
        await refreshGit()
      } catch (err: unknown) {
        handleGitOpError(err, "Stage failed")
      } finally {
        setIsOperatingGit(false)
      }
    },
    [handleGitOpError, refreshGit],
  )

  const unstageChange = useCallback(
    async (file: string) => {
      setIsOperatingGit(true)
      try {
        await unstageGitFiles([file], false)
        await refreshGit()
      } catch (err: unknown) {
        handleGitOpError(err, "Unstage failed")
      } finally {
        setIsOperatingGit(false)
      }
    },
    [handleGitOpError, refreshGit],
  )

  const stageAllChanges = useCallback(async () => {
    setIsOperatingGit(true)
    try {
      await stageGitFiles([], true)
      showToast("Staged all changes")
      await refreshGit()
    } catch (err: unknown) {
      handleGitOpError(err, "Stage all failed")
    } finally {
      setIsOperatingGit(false)
    }
  }, [handleGitOpError, refreshGit, showToast])

  const unstageAllChanges = useCallback(async () => {
    setIsOperatingGit(true)
    try {
      await unstageGitFiles([], true)
      showToast("Unstaged all changes")
      await refreshGit()
    } catch (err: unknown) {
      handleGitOpError(err, "Unstage all failed")
    } finally {
      setIsOperatingGit(false)
    }
  }, [handleGitOpError, refreshGit, showToast])

  const discardChange = useCallback(
    async (file: string) => {
      setIsOperatingGit(true)
      try {
        await discardGitFiles([file], false)
        showToast(`Discarded changes in ${file}`)
        await refreshGit()
      } catch (err: unknown) {
        handleGitOpError(err, "Discard failed")
      } finally {
        setIsOperatingGit(false)
      }
    },
    [handleGitOpError, refreshGit, showToast],
  )

  const discardAllChanges = useCallback(async () => {
    setIsOperatingGit(true)
    try {
      await discardGitFiles([], true)
      showToast("Discarded all changes")
      await refreshGit()
    } catch (err: unknown) {
      handleGitOpError(err, "Discard all failed")
    } finally {
      setIsOperatingGit(false)
    }
  }, [handleGitOpError, refreshGit, showToast])

  const commitChanges = useCallback(
    async (message: string, autoStage = false) => {
      const clean = message.trim()
      if (!clean) {
        showToast("Please enter a commit message")
        return
      }

      setIsOperatingGit(true)
      try {
        const node = await commitGitChanges(clean, autoStage)
        showToast(
          `Committed [${node.shortHash || node.hash || "HEAD"}]: ${clean}`,
        )
        await refreshGit()
      } catch (err: unknown) {
        handleGitOpError(err, "Commit failed")
      } finally {
        setIsOperatingGit(false)
      }
    },
    [handleGitOpError, refreshGit, showToast],
  )

  const gitPush = useCallback(
    async (setUpstream = false) => {
      try {
        await pushGit(setUpstream)
        showToast("Pushed commits to remote")
        await refreshGit()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        showToast(`Push failed: ${msg}`)
      }
    },
    [refreshGit, showToast],
  )

  const gitPull = useCallback(async () => {
    try {
      await pullGit()
      showToast("Pulled latest changes from remote")
      await refreshGit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Pull failed: ${msg}`)
    }
  }, [refreshGit, showToast])

  const gitSync = useCallback(async () => {
    try {
      await syncGit()
      showToast("Synchronized repository with remote")
      await refreshGit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Sync failed: ${msg}`)
    }
  }, [refreshGit, showToast])

  const createTag = useCallback(
    async (name: string, message = "") => {
      try {
        await createGitTag(name, message)
        showToast(`Created tag "${name}"`)
        await refreshGit()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        showToast(`Tag failed: ${msg}`)
      }
    },
    [refreshGit, showToast],
  )

  const pushTags = useCallback(async () => {
    try {
      await pushGitTags()
      showToast("Pushed tags to remote")
      await refreshGit()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      showToast(`Push tags failed: ${msg}`)
    }
  }, [refreshGit, showToast])

  const addRemote = useCallback(
    async (url: string, name = "origin") => {
      try {
        await addGitRemote(url, name)
        showToast(`Added remote "${name}": ${url}`)
        await refreshGit()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        showToast(`Add remote failed: ${msg}`)
      }
    },
    [refreshGit, showToast],
  )

  const fetchDiff = useCallback(
    async (
      file: string,
      staged = false,
      commit = "",
    ): Promise<GitDiffResult | null> => {
      try {
        return await fetchGitDiff(file, staged, commit)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        showToast(`Failed to fetch diff: ${msg}`)
        return null
      }
    },
    [showToast],
  )

  const fetchTimeline = useCallback(
    async (file = "", limit = 30): Promise<GitCommitNode[]> => {
      try {
        return await fetchGitTimeline(file, limit)
      } catch {
        return []
      }
    },
    [],
  )

  return {
    isGitRepo,
    activeBranch,
    setActiveBranch: checkoutBranch,
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
    gitBranches,
    gitTags,
    gitProfile,
    ahead,
    behind,
    upstream,
    commitHash,
    isLoadingGit,
    gitError,
    isRepoLocked,
    isOperatingGit,
    refreshGit,
    unlockRepo,
    initRepo,
    checkoutBranch,
    createBranch,
    stageChange,
    unstageChange,
    stageAllChanges,
    unstageAllChanges,
    discardChange,
    discardAllChanges,
    commitChanges,
    gitPull,
    gitPush,
    gitSync,
    createTag,
    pushTags,
    addRemote,
    fetchDiff,
    fetchTimeline,
  }
}
