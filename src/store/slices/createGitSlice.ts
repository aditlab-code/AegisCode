import type {
  GitBranch,
  GitChange,
  GitCommitNode,
  GitDiffResult,
  GitCompareResult,
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
  fetchGitCompare,
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
import { makeGitDiffTab } from "../../utils/gitDiffTab"
import type { GitSlice, SliceCreator } from "../types"
import {
  stageChangeLogic,
  unstageChangeLogic,
  stageAllLogic,
  unstageAllLogic,
  commitChangesLogic,
  type GitStageResult,
  type GitCommitResult,
} from "../../context/core/gitCore"

export {
  stageChangeLogic,
  unstageChangeLogic,
  stageAllLogic,
  unstageAllLogic,
  commitChangesLogic,
  type GitStageResult,
  type GitCommitResult,
}

export const createGitSlice: SliceCreator<GitSlice> = (set, get) => {
  let isRefreshing = false
  let refreshPending = false

  const handleGitOpError = (err: unknown, prefix: string) => {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes("index.lock") || msg.includes("File exists")) {
      set({ isRepoLocked: true, gitError: msg })
      get().showToast?.(
        `${prefix}: Repository is locked by index.lock. Click 'Unlock Repository' to fix.`,
      )
    } else {
      set({ gitError: msg })
      get().showToast?.(`${prefix}: ${msg}`)
    }
  }

  return {
    isGitRepo: false,
    activeBranch: "",
    setActiveBranch: async (branch: string) => {
      return get().checkoutBranch(branch)
    },
    activeRepo: "",
    setActiveRepo: (activeRepo: string) => set({ activeRepo }),
    gitRepos: [],
    setGitRepos: (gitRepos: GitRepo[]) => set({ gitRepos }),
    gitChanges: [],
    setGitChanges: (
      updater: GitChange[] | ((prev: GitChange[]) => GitChange[]),
    ) =>
      set((state) => ({
        gitChanges:
          typeof updater === "function" ? updater(state.gitChanges) : updater,
      })),
    stagedChanges: [],
    setStagedChanges: (
      updater: GitChange[] | ((prev: GitChange[]) => GitChange[]),
    ) =>
      set((state) => ({
        stagedChanges:
          typeof updater === "function"
            ? updater(state.stagedChanges)
            : updater,
      })),
    gitCommits: [],
    setGitCommits: (gitCommits: GitCommitNode[]) => set({ gitCommits }),
    gitBranches: [],
    gitTags: [],
    gitProfile: { name: "", email: "" },
    ahead: 0,
    behind: 0,
    upstream: "",
    commitHash: "",
    isLoadingGit: false,
    gitError: null,
    isRepoLocked: false,
    isOperatingGit: false,
    gitDiffVersion: 0,
    compareBaseCommit: null,
    compareTargetCommit: null,
    compareResult: null,
    isLoadingCompare: false,

    refreshGit: async () => {
      if (isRefreshing) {
        refreshPending = true
        return
      }
      isRefreshing = true
      set({ isLoadingGit: true })

      try {
        const status = await fetchGitStatus()
        if (!status.isRepo) {
          set({
            isGitRepo: false,
            activeBranch: "",
            activeRepo: status.repoName || "",
            gitRepos: [],
            gitChanges: [],
            stagedChanges: [],
            gitCommits: [],
            gitBranches: [],
            gitTags: [],
            ahead: 0,
            behind: 0,
            upstream: "",
            commitHash: "",
            gitError: null,
            isRepoLocked: false,
          })
          return
        }

        const currentRoot = get().rootWorkspacePath || ""
        set({
          isGitRepo: true,
          isRepoLocked: false,
          activeBranch: status.branch || "main",
          activeRepo: status.repoName,
          gitChanges: status.unstaged || [],
          stagedChanges: status.staged || [],
          gitProfile: status.user || { name: "", email: "" },
          ahead: status.ahead || 0,
          behind: status.behind || 0,
          upstream: status.upstream || "",
          commitHash: status.commitHash || "",
          gitError: null,
          gitRepos: [
            {
              id: status.repoName,
              name: status.repoName,
              branch: status.branch || "main",
              path: currentRoot,
            },
          ],
        })

        const [branchesResult, logResult, tagsResult] =
          await Promise.allSettled([
            fetchGitBranches(),
            fetchGitLog(50),
            fetchGitTags(),
          ])

        const updates: Partial<GitSlice> = {}
        if (branchesResult.status === "fulfilled") {
          updates.gitBranches = branchesResult.value
        }
        if (logResult.status === "fulfilled") {
          updates.gitCommits = logResult.value
        }
        if (tagsResult.status === "fulfilled") {
          updates.gitTags = tagsResult.value
        }
        set(updates)
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const updates: Partial<GitSlice> = { gitError: errMsg }
        if (errMsg.includes("index.lock") || errMsg.includes("File exists")) {
          updates.isRepoLocked = true
        }
        set(updates)
      } finally {
        set({ isLoadingGit: false })
        isRefreshing = false
        if (refreshPending) {
          refreshPending = false
          setTimeout(() => {
            void get().refreshGit()
          }, 120)
        }
      }
    },

    unlockRepo: async () => {
      set({ isOperatingGit: true })
      try {
        const res = await unlockGitRepo()
        set({ isRepoLocked: false })
        get().showToast?.(res.message || "Repository unlocked successfully")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Unlock failed: ${msg}`)
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    initRepo: async () => {
      try {
        await initGitRepo()
        get().showToast?.("Initialized empty Git repository")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Init failed: ${msg}`)
        return false
      }
    },

    checkoutBranch: async (branch: string) => {
      try {
        await checkoutGitBranch(branch)
        get().showToast?.(`Switched to branch "${branch}"`)
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Checkout failed: ${msg}`)
        return false
      }
    },

    checkoutCommit: async (hash: string) => {
      set({ isOperatingGit: true })
      try {
        await checkoutGitBranch(hash)
        get().showToast?.(
          `Checked out commit [${hash.slice(0, 7)}] (detached HEAD)`,
        )
        await get().refreshGit()
        if (typeof get().refreshWorkspace === "function") {
          await get().refreshWorkspace()
        }
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Checkout failed: ${msg}`)
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    setCompareBaseCommit: (hash: string | null) => {
      set({ compareBaseCommit: hash })
    },

    clearCompare: () => {
      set({
        compareBaseCommit: null,
        compareTargetCommit: null,
        compareResult: null,
        isLoadingCompare: false,
      })
    },

    compareCommits: async (base: string, target: string) => {
      set({
        isLoadingCompare: true,
        compareBaseCommit: base,
        compareTargetCommit: target,
      })
      try {
        const res = await fetchGitCompare(base, target)
        set({ compareResult: res })
        get().showToast?.(
          `Compared ${base.slice(0, 7)} ↔ ${target.slice(0, 7)} (${res.totalChanges} files changed)`,
        )
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Compare failed: ${msg}`)
        set({ compareResult: null })
      } finally {
        set({ isLoadingCompare: false })
      }
    },

    createBranch: async (name: string) => {
      try {
        await createGitBranch(name, true)
        get().showToast?.(`Created branch "${name}"`)
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Create branch failed: ${msg}`)
        return false
      }
    },

    stageChange: async (file: string) => {
      set({ isOperatingGit: true })
      try {
        await stageGitFiles([file], false)
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        handleGitOpError(err, "Stage failed")
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    unstageChange: async (file: string) => {
      set({ isOperatingGit: true })
      try {
        await unstageGitFiles([file], false)
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        handleGitOpError(err, "Unstage failed")
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    stageAllChanges: async () => {
      set({ isOperatingGit: true })
      try {
        await stageGitFiles([], true)
        get().showToast?.("Staged all changes")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        handleGitOpError(err, "Stage all failed")
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    unstageAllChanges: async () => {
      set({ isOperatingGit: true })
      try {
        await unstageGitFiles([], true)
        get().showToast?.("Unstaged all changes")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        handleGitOpError(err, "Unstage all failed")
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    discardChange: async (file: string) => {
      set({ isOperatingGit: true })
      try {
        await discardGitFiles([file], false)
        get().showToast?.(`Discarded changes in ${file}`)
        await get().refreshGit()
      } catch (err: unknown) {
        handleGitOpError(err, "Discard failed")
      } finally {
        set({ isOperatingGit: false })
      }
    },

    discardAllChanges: async () => {
      set({ isOperatingGit: true })
      try {
        await discardGitFiles([], true)
        get().showToast?.("Discarded all changes")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        handleGitOpError(err, "Discard all failed")
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    commitChanges: async (msg: string) => {
      const clean = msg.trim()
      if (!clean) {
        get().showToast?.("Please enter a commit message")
        return false
      }
      set({ isOperatingGit: true })
      try {
        const node = await commitGitChanges(clean, false)
        get().showToast?.(
          `Committed [${node.shortHash || node.hash || "HEAD"}]: ${clean}`,
        )
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        handleGitOpError(err, "Commit failed")
        return false
      } finally {
        set({ isOperatingGit: false })
      }
    },

    gitPull: async () => {
      try {
        await pullGit()
        get().showToast?.("Pulled latest changes from remote")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Pull failed: ${msg}`)
        return false
      }
    },

    gitPush: async () => {
      try {
        await pushGit()
        get().showToast?.("Pushed commits to remote")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Push failed: ${msg}`)
        return false
      }
    },

    gitSync: async () => {
      try {
        await syncGit()
        get().showToast?.("Synchronized repository with remote")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Sync failed: ${msg}`)
        return false
      }
    },

    createTag: async (name: string) => {
      try {
        await createGitTag(name, "")
        get().showToast?.(`Created tag "${name}"`)
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Tag failed: ${msg}`)
        return false
      }
    },

    pushTags: async () => {
      try {
        await pushGitTags()
        get().showToast?.("Pushed tags to remote")
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Push tags failed: ${msg}`)
        return false
      }
    },

    addRemote: async (name: string, url: string) => {
      try {
        await addGitRemote(url, name)
        get().showToast?.(`Added remote "${name}": ${url}`)
        await get().refreshGit()
        return true
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Add remote failed: ${msg}`)
        return false
      }
    },

    fetchDiff: async (
      file: string,
      staged = false,
      commit = "",
      base = "",
    ): Promise<GitDiffResult | null> => {
      try {
        return await fetchGitDiff(file, staged, commit, base)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast?.(`Failed to fetch diff: ${msg}`)
        return null
      }
    },

    fetchTimeline: async (file = "", limit = 30): Promise<GitCommitNode[]> => {
      try {
        return await fetchGitTimeline(file, limit)
      } catch {
        return []
      }
    },

    openGitDiff: (file: string, staged = false, commit = "", base = "") => {
      const tabId = makeGitDiffTab(file, staged, commit, base)
      get().openFileInPane(tabId)
    },
  }
}
