import { useEffect, useMemo, useRef, useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { pickFolderNative } from "../../../utils/workspaceApi"
import type { GitCommitNode } from "../../../types/workbench"

export function SourceControlPanel() {
  const {
    isGitRepo,
    activeBranch,
    activeRepo,
    gitChanges,
    stagedChanges,
    gitCommits,
    gitBranches,
    gitTags,
    gitStashes,
    isLoadingStashes,
    gitProfile,
    ahead,
    behind,
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
    refreshGit,
    openGitDiff,
    rootWorkspacePath,
    rootWorkspaceName,
    openFolderPicker,
    showToast,
    settings,
    isRepoLocked,
    isOperatingGit,
    unlockRepo,
    isLoadingGit,
    checkoutCommit,
    cherryPickCommit,
    cloneRepo,
    fetchStashes,
    stashSave,
    stashPop,
    stashApply,
    stashDrop,
    compareBaseCommit,
    compareTargetCommit,
    compareResult,
    isLoadingCompare,
    setCompareBaseCommit,
    compareCommits,
    clearCompare,
  } = useWorkbenchStore(
    useShallow((s) => ({
      isGitRepo: s.isGitRepo,
      activeBranch: s.activeBranch,
      activeRepo: s.activeRepo,
      gitChanges: s.gitChanges,
      stagedChanges: s.stagedChanges,
      gitCommits: s.gitCommits,
      gitBranches: s.gitBranches,
      gitTags: s.gitTags,
      gitStashes: s.gitStashes,
      isLoadingStashes: s.isLoadingStashes,
      gitProfile: s.gitProfile,
      ahead: s.ahead,
      behind: s.behind,
      initRepo: s.initRepo,
      checkoutBranch: s.checkoutBranch,
      createBranch: s.createBranch,
      stageChange: s.stageChange,
      unstageChange: s.unstageChange,
      stageAllChanges: s.stageAllChanges,
      unstageAllChanges: s.unstageAllChanges,
      discardChange: s.discardChange,
      discardAllChanges: s.discardAllChanges,
      commitChanges: s.commitChanges,
      gitPull: s.gitPull,
      gitPush: s.gitPush,
      gitSync: s.gitSync,
      createTag: s.createTag,
      pushTags: s.pushTags,
      addRemote: s.addRemote,
      refreshGit: s.refreshGit,
      openGitDiff: s.openGitDiff,
      rootWorkspacePath: s.rootWorkspacePath,
      rootWorkspaceName: s.rootWorkspaceName,
      openFolderPicker: s.openFolderPicker,
      showToast: s.showToast,
      settings: s.settings,
      isRepoLocked: s.isRepoLocked,
      isOperatingGit: s.isOperatingGit,
      unlockRepo: s.unlockRepo,
      isLoadingGit: s.isLoadingGit,
      checkoutCommit: s.checkoutCommit,
      cherryPickCommit: s.cherryPickCommit,
      cloneRepo: s.cloneRepo,
      fetchStashes: s.fetchStashes,
      stashSave: s.stashSave,
      stashPop: s.stashPop,
      stashApply: s.stashApply,
      stashDrop: s.stashDrop,
      compareBaseCommit: s.compareBaseCommit,
      compareTargetCommit: s.compareTargetCommit,
      compareResult: s.compareResult,
      isLoadingCompare: s.isLoadingCompare,
      setCompareBaseCommit: s.setCompareBaseCommit,
      compareCommits: s.compareCommits,
      clearCompare: s.clearCompare,
    })),
  )

  const maxVisibleChanges =
    settings?.features?.sourceControl?.maxVisibleChanges ?? 50
  const graphPageSize = settings?.features?.sourceControl?.graphPageSize ?? 25

  const [showAllStaged, setShowAllStaged] = useState(false)
  const [showAllChanges, setShowAllChanges] = useState(false)
  const [visibleCommitCount, setVisibleCommitCount] = useState(graphPageSize)

  const [commitMessage, setCommitMessage] = useState("")
  const [repositoriesOpen, setRepositoriesOpen] = useState(true)
  const [changesSectionOpen, setChangesSectionOpen] = useState(true)
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [stashesOpen, setStashesOpen] = useState(true)
  const [graphOpen, setGraphOpen] = useState(true)

  // Context & action menus
  const [menuOpen, setMenuOpen] = useState(false)
  const [commitDropdownOpen, setCommitDropdownOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  // Modals / prompts
  // Modals / prompts
  const [showTagPrompt, setShowTagPrompt] = useState(false)
  const [tagNameInput, setTagNameInput] = useState("")
  const [tagMessageInput, setTagMessageInput] = useState("")
  const [tagTargetCommit, setTagTargetCommit] = useState("")
  const [tagTargetMode, setTagTargetMode] = useState<"recent" | "custom">(
    "recent",
  )
  const [tagCustomHashInput, setTagCustomHashInput] = useState("")

  const [showComparePrompt, setShowComparePrompt] = useState(false)
  const [compareBaseHash, setCompareBaseHash] = useState("")
  const [compareTargetMode, setCompareTargetMode] =
    useState<"recent" | "custom">("recent")
  const [compareTargetHash, setCompareTargetHash] = useState("")
  const [compareCustomHashInput, setCompareCustomHashInput] = useState("")

  function isValidGitHash(hash: string): boolean {
    return /^[0-9a-fA-F]{7,40}$/.test(hash.trim())
  }

  const [showBranchPrompt, setShowBranchPrompt] = useState(false)
  const [branchNameInput, setBranchNameInput] = useState("")
  const [showRemotePrompt, setShowRemotePrompt] = useState(false)
  const [remoteNameInput, setRemoteNameInput] = useState("origin")
  const [remoteUrlInput, setRemoteUrlInput] = useState("")

  const [showStashPrompt, setShowStashPrompt] = useState(false)
  const [stashMessageInput, setStashMessageInput] = useState("")
  const [stashUntrackedInput, setStashUntrackedInput] = useState(true)

  const [showClonePrompt, setShowClonePrompt] = useState(false)
  const [cloneUrlInput, setCloneUrlInput] = useState("")
  const [cloneTargetInput, setCloneTargetInput] = useState("")
  const [cloneOpenWorkspace, setCloneOpenWorkspace] = useState(true)

  const [activeCommitMenu, setActiveCommitMenu] =
    useState<GitCommitNode | null>(null)

  const conflictedFiles = useMemo(() => {
    const list = new Set<string>()
    for (const c of [...stagedChanges, ...gitChanges]) {
      if (c.code === "U") {
        list.add(c.file)
      }
    }
    return Array.from(list)
  }, [stagedChanges, gitChanges])

  const hasConflicts = conflictedFiles.length > 0
  const isDirty = gitChanges.length > 0 || stagedChanges.length > 0

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setCommitDropdownOpen(false)
      }
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setActiveCommitMenu(null)
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false)
        setCommitDropdownOpen(false)
        setActiveCommitMenu(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  function handleCommit(andPush = false) {
    if (hasConflicts) {
      showToast(
        `Cannot commit: Unresolved merge conflicts in ${conflictedFiles.join(", ")}`,
      )
      return
    }

    const cleanMsg =
      commitMessage.trim() || (gitCommits.length === 0 ? "Initial commit" : "")
    if (!cleanMsg) {
      showToast("Please enter a commit message")
      return
    }

    // If no staged changes, auto-stage all (VS Code standard parity)
    const shouldAutoStage = stagedChanges.length === 0 && gitChanges.length > 0
    commitChanges(cleanMsg, shouldAutoStage)
    setCommitMessage("")
    setCommitDropdownOpen(false)

    if (andPush) {
      setTimeout(() => {
        gitPush()
      }, 500)
    }
  }

  function handleGenerateAiCommit() {
    if (!isDirty) {
      showToast("No changes detected to summarize")
      return
    }

    const stagedFiles = stagedChanges.map((c) => c.file)
    const unstagedFiles = gitChanges.map((c) => c.file)
    const allFiles = Array.from(new Set([...stagedFiles, ...unstagedFiles]))

    const prefix = allFiles.some((f) => f.includes("test"))
      ? "test"
      : allFiles.some((f) => f.endsWith(".md") || f.includes("docs/"))
        ? "docs"
        : allFiles.some((f) => f.includes("fix") || f.includes("bug"))
          ? "fix"
          : "feat"

    const summary = `${prefix}: update ${allFiles.slice(0, 2).join(", ")}${
      allFiles.length > 2 ? ` and ${allFiles.length - 2} other files` : ""
    }`

    const contextSections: string[] = []
    if (stagedFiles.length > 0) {
      contextSections.push(
        `Staged files:\n${stagedFiles.map((f) => `- ${f}`).join("\n")}`,
      )
    }
    if (unstagedFiles.length > 0) {
      contextSections.push(
        `Unstaged files:\n${unstagedFiles.map((f) => `- ${f}`).join("\n")}`,
      )
    }

    const fullMessage =
      contextSections.length > 0
        ? `${summary}\n\n${contextSections.join("\n\n")}`
        : summary

    setCommitMessage(fullMessage)
    showToast("Generated commit message draft")
  }

  function handleCreateTagSubmit() {
    const trimmed = tagNameInput.trim()
    if (!trimmed) {
      showToast("Tag name cannot be empty")
      return
    }
    const finalTarget =
      tagTargetMode === "custom"
        ? tagCustomHashInput.trim()
        : tagTargetCommit.trim()

    if (
      tagTargetMode === "custom" &&
      finalTarget &&
      !isValidGitHash(finalTarget)
    ) {
      showToast("Invalid commit hash: Must be 7-40 hex characters")
      return
    }

    createTag(trimmed, tagMessageInput.trim(), finalTarget)
    setShowTagPrompt(false)
    setTagNameInput("")
    setTagMessageInput("")
    setTagTargetCommit("")
    setTagCustomHashInput("")
    setTagTargetMode("recent")
  }

  function handleCompareSubmit() {
    const base = compareBaseHash.trim()
    const target =
      compareTargetMode === "custom"
        ? compareCustomHashInput.trim()
        : compareTargetHash.trim()

    if (!base) {
      showToast("Base commit is required for comparison")
      return
    }
    if (!target) {
      showToast("Target commit is required for comparison")
      return
    }
    if (compareTargetMode === "custom" && !isValidGitHash(target)) {
      showToast("Invalid target commit hash: Must be 7-40 hex characters")
      return
    }
    if (base === target) {
      showToast("Base and target commits cannot be the same")
      return
    }

    void compareCommits(base, target)
    setShowComparePrompt(false)
    setCompareBaseHash("")
    setCompareTargetHash("")
    setCompareCustomHashInput("")
    setCompareTargetMode("recent")
  }

  async function handleStashSubmit() {
    await stashSave(stashMessageInput.trim(), stashUntrackedInput)
    setShowStashPrompt(false)
    setStashMessageInput("")
  }

  async function handleCloneSubmit() {
    const url = cloneUrlInput.trim()
    if (!url) {
      showToast("Repository URL cannot be empty")
      return
    }
    await cloneRepo(url, cloneTargetInput.trim(), cloneOpenWorkspace)
    setShowClonePrompt(false)
    setCloneUrlInput("")
    setCloneTargetInput("")
  }

  function handleCommitContextMenu(e: React.MouseEvent, commit: GitCommitNode) {
    e.preventDefault()
    e.stopPropagation()
    setActiveCommitMenu(commit)
  }

  function handleCreateBranchSubmit() {
    const trimmed = branchNameInput.trim()
    if (!trimmed) {
      showToast("Branch name cannot be empty")
      return
    }
    createBranch(trimmed, true)
    setShowBranchPrompt(false)
    setBranchNameInput("")
  }

  function handleCreateRemoteSubmit() {
    const url = remoteUrlInput.trim()
    if (!url) {
      showToast("Remote URL cannot be empty")
      return
    }
    addRemote(url, remoteNameInput.trim() || "origin")
    setShowRemotePrompt(false)
    setRemoteNameInput("origin")
    setRemoteUrlInput("")
  }

  const renderCloneModal = () =>
    showClonePrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl text-left">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-xs text-[var(--color-ink)] flex items-center gap-1.5">
              <Icon name="cloud" size={14} />
              <span>Clone Repository</span>
            </h4>
            <button
              className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              onClick={() => setShowClonePrompt(false)}
              title="Close"
              type="button"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
          <div className="space-y-3 mb-4">
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-ink-muted)] mb-1 uppercase tracking-wider">
                Repository URL
              </label>
              <input
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                onChange={(e) => setCloneUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCloneSubmit()
                }}
                placeholder="https://github.com/org/repo.git"
                value={cloneUrlInput}
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-[var(--color-ink-muted)] mb-1 uppercase tracking-wider">
                Destination Folder (Optional)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  className="flex-1 px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                  onChange={(e) => setCloneTargetInput(e.target.value)}
                  placeholder="Leave empty for auto or browse..."
                  value={cloneTargetInput}
                />
                <button
                  className="px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] text-xs text-[var(--color-ink)] cursor-pointer shrink-0"
                  onClick={async () => {
                    const res = await pickFolderNative()
                    if (res?.status === "ok" && res.path) {
                      setCloneTargetInput(res.path)
                    }
                  }}
                  title="Browse folder"
                  type="button"
                >
                  Browse
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={cloneOpenWorkspace}
                onChange={(e) => setCloneOpenWorkspace(e.target.checked)}
                className="rounded border-[var(--color-line)] text-[var(--color-accent)]"
              />
              <span>Open workspace after clone</span>
            </label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              className="px-3 py-1 rounded text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
              onClick={() => setShowClonePrompt(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer"
              onClick={handleCloneSubmit}
              disabled={isOperatingGit}
              type="button"
            >
              {isOperatingGit ? "Cloning..." : "Clone"}
            </button>
          </div>
        </div>
      </div>
    )

  // 0a. If no folder is open in workspace
  if (!rootWorkspacePath) {
    return (
      <div className="tool-panel git-panel p-4 flex flex-col items-center justify-center text-center h-full">
        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-raised)] border border-[var(--color-line)] flex items-center justify-center text-[var(--color-ink-muted)] mb-3">
          <Icon name="folder" size={24} />
        </div>
        <h3 className="font-semibold text-xs text-[var(--color-ink)] mb-1">
          No Folder Open
        </h3>
        <p className="text-[11px] text-[var(--color-ink-muted)] max-w-[220px] mb-4">
          You have not yet opened a folder. Open a folder to initialize a Git
          repository or track changes.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-[210px]">
          <button
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium transition-all shadow-xs cursor-pointer"
            onClick={openFolderPicker}
            type="button"
          >
            <Icon name="folder" size={13} />
            <span>Open Folder</span>
          </button>
          <button
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] text-xs text-[var(--color-ink-soft)] transition-all cursor-pointer"
            onClick={() => setShowClonePrompt(true)}
            type="button"
          >
            <Icon name="cloud" size={13} />
            <span>Clone Repository</span>
          </button>
        </div>
        {renderCloneModal()}
      </div>
    )
  }

  // 0b. If folder is open but not a Git repo (Zero fake fallback)
  if (!isGitRepo) {
    return (
      <div className="tool-panel git-panel p-4 flex flex-col items-center justify-center text-center h-full">
        <div className="w-12 h-12 rounded-full bg-[var(--color-surface-raised)] border border-[var(--color-line)] flex items-center justify-center text-[var(--color-ink-muted)] mb-3">
          <Icon name="git" size={24} />
        </div>
        <h3 className="font-semibold text-xs text-[var(--color-ink)] mb-1">
          Initialize Repository
        </h3>
        <p className="text-[11px] text-[var(--color-ink-muted)] max-w-[240px] mb-4">
          The folder &quot;{rootWorkspaceName}&quot; doesn&apos;t have a Git
          repository. You can initialize a repository to enable source control
          powered by Git.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-[210px]">
          <button
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium transition-all shadow-xs cursor-pointer"
            onClick={initRepo}
            type="button"
          >
            <Icon name="plus" size={13} />
            <span>Initialize Repository</span>
          </button>
          <button
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] text-xs text-[var(--color-ink-soft)] transition-all cursor-pointer"
            onClick={() => setShowClonePrompt(true)}
            type="button"
          >
            <Icon name="cloud" size={13} />
            <span>Clone Repository</span>
          </button>
          <button
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] hover:bg-[var(--color-surface-hover)] text-xs text-[var(--color-ink-soft)] transition-all cursor-pointer"
            onClick={openFolderPicker}
            type="button"
          >
            <Icon name="folder" size={13} />
            <span>Open Other Folder</span>
          </button>
        </div>
        {renderCloneModal()}
      </div>
    )
  }

  return (
    <div className="tool-panel git-panel flex flex-col h-full overflow-y-auto select-none">
      {/* Header with Title and '...' Action Menu */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-line)] bg-[var(--color-surface)] sticky top-0 z-20">
        <span className="font-bold text-[11px] text-[var(--color-ink)] tracking-wider uppercase">
          SOURCE CONTROL
        </span>

        <div className="flex items-center gap-1 relative" ref={menuRef}>
          <button
            aria-label="Refresh Git Status"
            className="p-1 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            onClick={refreshGit}
            title="Refresh Git Status"
            type="button"
          >
            <Icon name="refresh" size={13} />
          </button>

          <button
            aria-label="More Actions"
            className="p-1 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
            onClick={() => setMenuOpen((v) => !v)}
            title="More Actions"
            type="button"
          >
            <Icon name="more" size={14} />
          </button>

          {/* VS Code Parity '...' Dropdown Menu */}
          {menuOpen && (
            <div className="absolute right-0 top-7 w-48 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-xl py-1 z-50 text-[11px] divide-y divide-[var(--color-line)] animate-in fade-in zoom-in-95 duration-100">
              <div className="py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    gitPull()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="arrow-down" size={13} />
                  <span>Pull</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    gitPush()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="arrow-up" size={13} />
                  <span>Push</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    gitSync()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="refresh" size={13} />
                  <span>Fetch & Sync</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    stageAllChanges()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="add" size={13} />
                  <span>Stage All Changes</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    unstageAllChanges()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="close" size={13} />
                  <span>Unstage All Changes</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-error-soft)] text-[var(--color-error)] text-left cursor-pointer"
                  onClick={() => {
                    discardAllChanges()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="discard" size={13} />
                  <span>Discard All Changes</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    unlockRepo()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="check" size={13} />
                  <span>Unlock Repository</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    setShowBranchPrompt(true)
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="branch" size={13} />
                  <span>Create Branch...</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    setShowTagPrompt(true)
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="tag" size={13} />
                  <span>Create Tag...</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    pushTags()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="arrow-up" size={13} />
                  <span>Push All Tags</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    setShowRemotePrompt(true)
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="cloud" size={13} />
                  <span>Add Remote...</span>
                </button>
              </div>

              <div className="py-1">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    setShowStashPrompt(true)
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="stash" size={13} />
                  <span>Stash Changes...</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    void stashPop()
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="arrow-up" size={13} />
                  <span>Pop Latest Stash</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                  onClick={() => {
                    setShowClonePrompt(true)
                    setMenuOpen(false)
                  }}
                  type="button"
                >
                  <Icon name="cloud" size={13} />
                  <span>Clone Repository...</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Repository Locked Warning Banner */}
      {isRepoLocked && (
        <div className="mx-3 my-2 p-2.5 rounded-md border border-[var(--color-error)] bg-[var(--color-surface-raised)] flex flex-col gap-1.5 shadow-xs">
          <div className="flex items-center gap-1.5 text-[var(--color-error)] font-medium text-[11px]">
            <Icon name="warning" size={13} />
            <span>Repository Locked (.git/index.lock)</span>
          </div>
          <p className="text-[10px] text-[var(--color-ink-muted)] leading-relaxed">
            A background process or interrupted Git operation left a lock file
            in the repository.
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              className="px-2.5 py-1 rounded bg-[var(--color-accent)] hover:opacity-90 text-white text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1"
              onClick={unlockRepo}
              disabled={isOperatingGit}
              type="button"
            >
              <Icon name="check" size={11} />
              <span>
                {isOperatingGit ? "Unlocking..." : "Unlock Repository"}
              </span>
            </button>
            <button
              className="px-2 py-1 rounded hover:bg-[var(--color-surface-hover)] text-[var(--color-ink-muted)] text-[11px] transition-all cursor-pointer"
              onClick={refreshGit}
              type="button"
            >
              <span>Retry</span>
            </button>
          </div>
        </div>
      )}

      {/* 1. REPOSITORIES Section (Matches VS Code Reference Screenshot) */}
      <div className="border-b border-[var(--color-line)]">
        <button
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] text-left transition-colors cursor-pointer"
          onClick={() => setRepositoriesOpen((v) => !v)}
          type="button"
        >
          <span
            className={`chevron-arrow ${
              repositoriesOpen ? "chevron-open" : ""
            }`}
          >
            <Icon name="chevron" size={11} />
          </span>
          <span>Repositories</span>
        </button>

        {repositoriesOpen && (
          <div className="px-2 pb-2">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] text-xs text-[var(--color-ink)]">
              <span className="text-[var(--color-orange)] shrink-0">
                <Icon name="folder" size={14} />
              </span>
              <span className="font-semibold truncate">{activeRepo}</span>

              {/* Branch Pill with dirty indicator */}
              <button
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-surface)] border border-[var(--color-line)] text-[10px] text-[var(--color-ink-soft)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors cursor-pointer ml-auto max-w-[110px] min-w-0"
                onClick={() => setShowBranchPrompt(true)}
                title={`Branch: ${activeBranch} (Click to switch or create branch)`}
                type="button"
              >
                <Icon className="shrink-0" name="branch" size={11} />
                <span className="font-mono truncate">
                  {activeBranch}
                  {isDirty ? "*" : ""}
                </span>
              </button>

              {/* Sync Button */}
              <button
                aria-label={`Sync repository (${behind} behind, ${ahead} ahead)`}
                className="p-1 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer shrink-0"
                onClick={gitSync}
                title={`Sync (${behind}↓ ${ahead}↑)`}
                type="button"
              >
                <Icon name="cloud" size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Primary Commit Action Zone */}
      <div className="p-3 border-b border-[var(--color-line)] space-y-2.5 bg-[var(--color-surface)]">
        {/* Conflict Alert Banner */}
        {hasConflicts && (
          <div
            aria-label="Unresolved merge conflicts"
            className="p-2.5 rounded bg-[var(--color-warning-soft)] border border-[var(--color-warning)]/40 text-[var(--color-warning)] text-xs flex items-start gap-2 select-none"
          >
            <Icon
              className="shrink-0 mt-0.5 text-[var(--color-warning)]"
              name="warning"
              size={14}
            />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[var(--color-ink)]">
                Unresolved Merge Conflicts
              </div>
              <div className="text-[11px] text-[var(--color-ink-muted)] mt-0.5 leading-relaxed">
                Resolve conflict markers (
                <code className="text-[var(--color-warning)] font-mono">
                  &lt;&lt;&lt;&lt;&lt;&lt;&lt; HEAD
                </code>
                ,{" "}
                <code className="text-[var(--color-warning)] font-mono">
                  =======
                </code>
                ,{" "}
                <code className="text-[var(--color-warning)] font-mono">
                  &gt;&gt;&gt;&gt;&gt;&gt;&gt;
                </code>
                ) in{" "}
                <span className="font-mono text-[var(--color-warning)] font-medium">
                  {conflictedFiles.join(", ")}
                </span>{" "}
                before committing.
              </div>
            </div>
          </div>
        )}

        {/* Commit Message Box with Sparkle AI Icon */}
        <div className="relative">
          <textarea
            aria-label="Commit message"
            className="w-full p-2 pr-7 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-[11px] text-[var(--color-ink)] placeholder-[var(--color-ink-muted)] outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] resize-none transition-all leading-normal"
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault()
                handleCommit(false)
              }
            }}
            placeholder="Message (⌘Enter to commit)"
            rows={3}
            title={`Commit changes on "${activeBranch}"`}
            value={commitMessage}
          />
          <button
            aria-label="Generate Commit Message with AI"
            className="absolute right-2 top-2 p-1 text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
            onClick={handleGenerateAiCommit}
            title="Generate AI Commit Message"
            type="button"
          >
            <Icon name="sparkle" size={13} />
          </button>
        </div>

        {/* Split Commit Button (✓ Commit + dropdown) */}
        <div
          className={`flex w-full items-stretch rounded-md text-white shadow-xs overflow-visible relative ${
            hasConflicts
              ? "bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-[var(--color-ink-muted)]"
              : "bg-[var(--color-success)]"
          }`}
        >
          <button
            className={`flex-1 flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium rounded-l-md truncate min-w-0 select-none ${
              hasConflicts
                ? "cursor-not-allowed opacity-60 text-[var(--color-ink-muted)]"
                : "hover:bg-black/15 active:bg-black/25 transition-colors cursor-pointer"
            }`}
            disabled={hasConflicts || isOperatingGit}
            onClick={() => handleCommit(false)}
            title={
              hasConflicts
                ? `Cannot commit: Unresolved merge conflicts in ${conflictedFiles.join(", ")}`
                : `Commit changes on "${activeBranch}"`
            }
            type="button"
          >
            <Icon
              className="shrink-0"
              name={hasConflicts ? "warning" : "check"}
              size={13}
            />
            <span className="truncate">Commit</span>
          </button>

          <div
            className={`w-[1px] self-stretch my-1 shrink-0 ${
              hasConflicts ? "bg-[var(--color-line)]" : "bg-white/25"
            }`}
          />

          <div className="relative flex items-stretch shrink-0">
            <button
              aria-label="Commit Options"
              className={`flex items-center justify-center px-3 rounded-r-md ${
                hasConflicts
                  ? "cursor-not-allowed opacity-60 text-[var(--color-ink-muted)]"
                  : "hover:bg-black/15 active:bg-black/25 transition-colors cursor-pointer"
              }`}
              disabled={hasConflicts || isOperatingGit}
              onClick={() => {
                if (!hasConflicts) {
                  setCommitDropdownOpen((v) => !v)
                }
              }}
              title={
                hasConflicts
                  ? `Cannot commit: Unresolved merge conflicts in ${conflictedFiles.join(", ")}`
                  : "More commit options"
              }
              type="button"
            >
              <Icon className="shrink-0" name="chevron-down" size={12} />
            </button>

            {commitDropdownOpen && !hasConflicts && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-xl py-1 z-50 text-[11px] animate-in fade-in zoom-in-95 duration-100">
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] cursor-pointer"
                  onClick={() => {
                    handleCommit(false)
                    setCommitDropdownOpen(false)
                  }}
                  type="button"
                >
                  <Icon
                    className="text-[var(--color-success)] shrink-0"
                    name="check"
                    size={12}
                  />
                  <span>Commit</span>
                </button>
                <button
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] cursor-pointer"
                  onClick={() => {
                    handleCommit(true)
                    setCommitDropdownOpen(false)
                  }}
                  type="button"
                >
                  <Icon
                    className="text-[var(--color-accent)] shrink-0"
                    name="arrow-up"
                    size={12}
                  />
                  <span>Commit & Push</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. STAGED CHANGES Section */}
      {stagedChanges.length > 0 && (
        <div className="border-b border-[var(--color-line)]">
          <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors">
            <button
              className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer text-left"
              onClick={() => setStagedOpen((v) => !v)}
              type="button"
            >
              <span
                className={`chevron-arrow ${stagedOpen ? "chevron-open" : ""}`}
              >
                <Icon name="chevron" size={11} />
              </span>
              <span>STAGED CHANGES</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-[var(--color-ink-muted)]">
                {stagedChanges.length}
              </span>
            </button>

            <div className="flex items-center gap-1">
              <button
                aria-label="Unstage all changes"
                className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                onClick={unstageAllChanges}
                title="Unstage all changes"
                type="button"
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          </div>

          {stagedOpen && (
            <div className="px-1 py-1 divide-y divide-transparent">
              {(showAllStaged
                ? stagedChanges
                : stagedChanges.slice(0, maxVisibleChanges)
              ).map((change) => (
                <div
                  className="group flex items-center gap-2 px-2 py-1 rounded text-[11px] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] cursor-pointer min-w-0"
                  key={`staged-${change.file}`}
                  onClick={() => openGitDiff(change.file, true)}
                  title={change.file}
                >
                  <span
                    className={`change-badge change-${
                      change.status || "modified"
                    } shrink-0`}
                  >
                    {change.code}
                  </span>
                  <span className="truncate flex-1 font-mono text-[11px] min-w-0">
                    {change.file}
                  </span>

                  <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                    <button
                      aria-label={`Unstage ${change.file}`}
                      className="p-1 hover:text-[var(--color-error)] cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation()
                        unstageChange(change.file)
                      }}
                      title="Unstage change"
                      type="button"
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </div>
                </div>
              ))}

              {stagedChanges.length > maxVisibleChanges && (
                <button
                  className="w-full text-center py-1 text-[10px] text-accent hover:underline cursor-pointer"
                  onClick={() => setShowAllStaged((v) => !v)}
                  type="button"
                >
                  {showAllStaged
                    ? "Show Less"
                    : `Showing ${maxVisibleChanges} of ${stagedChanges.length} (Show All)`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 4. CHANGES Section */}
      <div className="border-b border-[var(--color-line)]">
        <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors">
          <button
            className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer text-left"
            onClick={() => setChangesOpen((v) => !v)}
            type="button"
          >
            <span
              className={`chevron-arrow ${changesOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={11} />
            </span>
            <span>CHANGES</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-[var(--color-ink-muted)]">
              {gitChanges.length}
            </span>
          </button>

          {gitChanges.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                aria-label="Discard all changes"
                className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-error)] cursor-pointer"
                onClick={discardAllChanges}
                title="Discard all changes"
                type="button"
              >
                <Icon name="discard" size={11} />
              </button>
              <button
                aria-label="Stage all changes"
                className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-success)] cursor-pointer"
                onClick={stageAllChanges}
                title="Stage all changes"
                type="button"
              >
                <Icon name="add" size={12} />
              </button>
            </div>
          )}
        </div>

        {changesOpen && (
          <div className="px-1 py-1 divide-y divide-transparent">
            {gitChanges.length > 0 ? (
              <>
                {(showAllChanges
                  ? gitChanges
                  : gitChanges.slice(0, maxVisibleChanges)
                ).map((change) => (
                  <div
                    className="group flex items-center gap-2 px-2 py-1 rounded text-[11px] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] cursor-pointer min-w-0"
                    key={`change-${change.file}`}
                    onClick={() => openGitDiff(change.file, false)}
                    title={change.file}
                  >
                    <span
                      className={`change-badge change-${
                        change.status || "modified"
                      } shrink-0`}
                    >
                      {change.code}
                    </span>
                    <span className="truncate flex-1 font-mono text-[11px] min-w-0">
                      {change.file}
                    </span>

                    <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                      <button
                        aria-label={`Discard ${change.file}`}
                        className="p-1 hover:text-[var(--color-error)] cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          discardChange(change.file)
                        }}
                        title="Discard change"
                        type="button"
                      >
                        <Icon name="discard" size={11} />
                      </button>
                      <button
                        aria-label={`Stage ${change.file}`}
                        className="p-1 hover:text-[var(--color-success)] cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          stageChange(change.file)
                        }}
                        title="Stage change"
                        type="button"
                      >
                        <Icon name="add" size={11} />
                      </button>
                    </div>
                  </div>
                ))}

                {gitChanges.length > maxVisibleChanges && (
                  <button
                    className="w-full text-center py-1 text-[10px] text-accent hover:underline cursor-pointer"
                    onClick={() => setShowAllChanges((v) => !v)}
                    type="button"
                  >
                    {showAllChanges
                      ? "Show Less"
                      : `Showing ${maxVisibleChanges} of ${gitChanges.length} (Show All)`}
                  </button>
                )}
              </>
            ) : (
              <div className="px-3 py-2 text-[11px] text-[var(--color-ink-muted)] italic">
                Working tree clean
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. STASHES Section */}
      <div className="border-b border-[var(--color-line)]">
        <div className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-surface-hover)] transition-colors">
          <button
            className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer text-left"
            onClick={() => setStashesOpen((v) => !v)}
            type="button"
          >
            <span
              className={`chevron-arrow ${stashesOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={11} />
            </span>
            <span>STASHES</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-[var(--color-ink-muted)]">
              {gitStashes.length}
            </span>
          </button>

          <div className="flex items-center gap-1">
            <button
              aria-label="Stash Changes"
              className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
              onClick={() => setShowStashPrompt(true)}
              title="Stash Changes..."
              type="button"
            >
              <Icon name="add" size={12} />
            </button>
            {gitStashes.length > 0 && (
              <button
                aria-label="Pop Latest Stash"
                className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                onClick={() => stashPop()}
                title="Pop Latest Stash"
                type="button"
              >
                <Icon name="arrow-up" size={12} />
              </button>
            )}
          </div>
        </div>

        {stashesOpen && (
          <div className="px-2 pb-2">
            {gitStashes.length === 0 ? (
              <div className="px-3 py-2 text-[10px] text-[var(--color-ink-muted)] text-center">
                No stashes saved
              </div>
            ) : (
              <div className="space-y-1">
                {gitStashes.map((stash) => (
                  <div
                    key={stash.ref}
                    className="group flex items-center justify-between gap-2 p-1.5 rounded hover:bg-[var(--color-surface-hover)] text-xs transition-colors"
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-[var(--color-accent)] shrink-0">
                        <Icon name="stash" size={13} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-semibold text-[var(--color-ink)]">
                            {stash.ref}
                          </span>
                          {stash.timestamp && (
                            <span className="text-[9px] text-[var(--color-ink-muted)] truncate">
                              {stash.timestamp}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--color-ink-soft)] truncate">
                          {stash.message || "WIP stash"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] cursor-pointer"
                        onClick={() => stashApply(stash.ref)}
                        title={`Apply ${stash.ref}`}
                        type="button"
                      >
                        <Icon name="check" size={11} />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-accent)] cursor-pointer"
                        onClick={() => stashPop(stash.ref)}
                        title={`Pop ${stash.ref}`}
                        type="button"
                      >
                        <Icon name="arrow-up" size={11} />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-[var(--color-surface-raised)] text-[var(--color-ink-muted)] hover:text-[var(--color-error)] cursor-pointer"
                        onClick={() => stashDrop(stash.ref)}
                        title={`Drop ${stash.ref}`}
                        type="button"
                      >
                        <Icon name="trash" size={11} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. GRAPH Section (Visual SVG Commit Timeline & Interactive Branches) */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-line)] bg-[var(--color-surface)]">
          <button
            className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
            onClick={() => setGraphOpen((v) => !v)}
            type="button"
          >
            <span
              className={`chevron-arrow ${graphOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={11} />
            </span>
            <span>GRAPH</span>
          </button>

          <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-ink-muted)]">
            <span
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)] border border-[var(--color-line)] cursor-pointer hover:border-[var(--color-accent)]"
              onClick={() => setShowBranchPrompt(true)}
              title="Branches count"
            >
              <Icon name="branch" size={10} />
              <span>{gitBranches.length || 1}</span>
            </span>
            {gitTags.length > 0 && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--color-surface-raised)] border border-[var(--color-line)] cursor-pointer hover:border-[var(--color-accent)]"
                onClick={() => setShowTagPrompt(true)}
                title="Tags count"
              >
                <Icon name="tag" size={10} />
                <span>{gitTags.length}</span>
              </span>
            )}
          </div>
        </div>

        {graphOpen && (
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {/* Active Commit Comparison Box */}
            {(compareBaseCommit || compareResult) && (
              <div className="mb-2 p-2 rounded bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-[10px] text-[var(--color-ink)]">
                    <Icon name="split" size={12} />
                    <span>COMPARE COMMITS</span>
                  </div>
                  <button
                    className="text-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                    onClick={clearCompare}
                    title="Clear comparison"
                    type="button"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>

                <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--color-ink-soft)] mb-1.5">
                  <span className="px-1.5 py-0.5 rounded bg-[var(--color-canvas)] border border-[var(--color-line)]">
                    {compareBaseCommit?.slice(0, 7) || "None"}
                  </span>
                  <span>↔</span>
                  <span className="px-1.5 py-0.5 rounded bg-[var(--color-canvas)] border border-[var(--color-line)]">
                    {compareResult?.targetCommit?.slice(0, 7) ||
                      "Select target..."}
                  </span>
                </div>

                {isLoadingCompare ? (
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-ink-muted)] py-1">
                    <span className="animate-spin">
                      <Icon name="refresh" size={11} />
                    </span>
                    <span>Comparing commits...</span>
                  </div>
                ) : compareResult ? (
                  <div className="space-y-1 mt-1 border-t border-[var(--color-line)] pt-1.5 max-h-40 overflow-y-auto">
                    <div className="text-[10px] text-[var(--color-ink-muted)] mb-1">
                      {compareResult.totalChanges} changed file
                      {compareResult.totalChanges !== 1 ? "s" : ""}:
                    </div>
                    {compareResult.files.map((cf) => (
                      <div
                        className="flex items-center gap-1.5 px-1.5 py-0.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer text-[11px]"
                        key={cf.file}
                        onClick={() =>
                          openGitDiff(
                            cf.file,
                            false,
                            compareResult.targetCommit,
                            compareResult.baseCommit,
                          )
                        }
                        title={`View diff for ${cf.file}`}
                      >
                        <span
                          className={`w-3.5 h-3.5 flex items-center justify-center rounded text-[9px] font-bold ${
                            cf.status === "A"
                              ? "text-[var(--color-success)] bg-[var(--color-success-soft)]"
                              : cf.status === "D"
                                ? "text-[var(--color-error)] bg-[var(--color-error-soft)]"
                                : "text-[var(--color-accent)] bg-[var(--color-surface)]"
                          }`}
                        >
                          {cf.status}
                        </span>
                        <span className="truncate flex-1 font-mono text-[10px] text-[var(--color-ink)]">
                          {cf.file}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--color-ink-muted)]">
                    Select a second commit below to view differences.
                  </p>
                )}
              </div>
            )}

            {gitCommits.length > 0 ? (
              <div className="space-y-0.5">
                {gitCommits
                  .slice(0, visibleCommitCount)
                  .map((commit, index) => {
                    const isHead = commit.isHead || index === 0
                    const isLast = index === gitCommits.length - 1
                    const isCurrentBranch =
                      commit.branch === activeBranch || isHead

                    return (
                      <div
                        className={`group flex items-start gap-2 p-1.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors relative ${
                          activeCommitMenu?.hash === commit.hash
                            ? "bg-[var(--color-surface-hover)] z-30"
                            : "z-0"
                        }`}
                        key={commit.hash}
                        onClick={() => {
                          navigator.clipboard?.writeText(commit.hash)
                          showToast(
                            `Copied commit hash [${commit.shortHash || commit.hash.slice(0, 7)}]`,
                          )
                        }}
                        onContextMenu={(e) =>
                          handleCommitContextMenu(e, commit)
                        }
                        onDoubleClick={() => {
                          if (commit.branch && commit.branch !== activeBranch) {
                            checkoutBranch(commit.branch)
                          }
                        }}
                        title="Click ... or right-click for options, double-click to switch branch"
                      >
                        {/* Visual SVG Timeline Line + Dot */}
                        <div className="shrink-0 w-4.5 pt-0.5 flex flex-col items-center">
                          <svg
                            aria-hidden="true"
                            className="w-4.5 h-6"
                            viewBox="0 0 18 24"
                          >
                            {!isHead && (
                              <line
                                stroke="var(--color-line-bright)"
                                strokeWidth="2"
                                x1="9"
                                x2="9"
                                y1="0"
                                y2="12"
                              />
                            )}
                            {!isLast && (
                              <line
                                stroke="var(--color-line-bright)"
                                strokeWidth="2"
                                x1="9"
                                x2="9"
                                y1="12"
                                y2="24"
                              />
                            )}
                            <circle
                              cx="9"
                              cy="12"
                              fill={
                                isHead
                                  ? "var(--color-canvas)"
                                  : "var(--color-surface)"
                              }
                              r={isHead ? "5.5" : "4.5"}
                              stroke={
                                isCurrentBranch
                                  ? "var(--color-accent)"
                                  : "var(--color-cyan)"
                              }
                              strokeWidth="2"
                            />
                            {isHead && (
                              <circle
                                cx="9"
                                cy="12"
                                fill="var(--color-accent)"
                                r="2.5"
                              />
                            )}
                          </svg>
                        </div>

                        {/* Commit details */}
                        <div className="flex-1 min-w-0 leading-tight">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">
                              {commit.shortHash || commit.hash.slice(0, 7)}
                            </span>

                            {/* Branch pill badge (Click to switch branch) */}
                            {commit.branch && (
                              <button
                                className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-semibold cursor-pointer transition-transform hover:scale-105 ${
                                  commit.branch === activeBranch
                                    ? "bg-[var(--color-accent)] text-white"
                                    : "bg-[var(--color-surface-raised)] border border-[var(--color-line)] text-[var(--color-ink-soft)]"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (commit.branch !== activeBranch) {
                                    checkoutBranch(commit.branch)
                                  }
                                }}
                                title={`Checkout branch ${commit.branch}`}
                                type="button"
                              >
                                <Icon name="branch" size={9} />
                                <span>{commit.branch}</span>
                              </button>
                            )}

                            {/* Tag badge(s) */}
                            {commit.tags &&
                              commit.tags.map((tag) => (
                                <span
                                  className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-[var(--color-success-soft)] text-[var(--color-success)] text-[9px] font-semibold"
                                  key={tag}
                                >
                                  <Icon name="tag" size={9} />
                                  <span>{tag}</span>
                                </span>
                              ))}

                            {compareBaseCommit === commit.hash && (
                              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-semibold bg-[var(--color-accent)] text-white">
                                Base
                              </span>
                            )}

                            <div className="ml-auto flex items-center gap-1 shrink-0">
                              <span className="text-[10px] text-[var(--color-ink-muted)]">
                                {commit.timestamp}
                              </span>
                              <button
                                aria-label="Commit Actions"
                                className={`p-0.5 rounded text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] transition-opacity cursor-pointer ${
                                  activeCommitMenu?.hash === commit.hash
                                    ? "opacity-100 text-[var(--color-ink)] bg-[var(--color-surface-hover)]"
                                    : "opacity-60 group-hover:opacity-100"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setActiveCommitMenu((curr) =>
                                    curr?.hash === commit.hash ? null : commit,
                                  )
                                }}
                                title="Commit Actions"
                                type="button"
                              >
                                <Icon name="more" size={12} />
                              </button>
                            </div>
                          </div>

                          <p className="text-[11px] text-[var(--color-ink)] truncate font-medium mt-0.5">
                            {commit.message}
                          </p>
                        </div>

                        {/* Commit Action Dropdown (Contained within Source Control Panel) */}
                        {activeCommitMenu?.hash === commit.hash && (
                          <div
                            ref={contextMenuRef}
                            className="absolute right-2 top-7 w-48 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-xl py-1 z-50 text-[11px] divide-y divide-[var(--color-line)] animate-in fade-in zoom-in-95 duration-100 text-[var(--color-ink)]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-3 py-1 text-[10px] text-[var(--color-ink-muted)] bg-[var(--color-surface)]/50">
                              <span className="font-mono font-bold text-[var(--color-ink)] mr-1.5">
                                {commit.shortHash || commit.hash.slice(0, 7)}
                              </span>
                              <span className="block truncate max-w-[170px]">
                                {commit.message}
                              </span>
                            </div>

                            <div className="py-1">
                              {/* 1. Checkout */}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                                onClick={() => {
                                  const hash = commit.hash
                                  setActiveCommitMenu(null)
                                  void checkoutCommit(hash)
                                }}
                                type="button"
                              >
                                <Icon name="branch" size={13} />
                                <span>Checkout</span>
                              </button>

                              {/* 2. Create Tag */}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                                onClick={() => {
                                  const hash = commit.hash
                                  setActiveCommitMenu(null)
                                  setTagTargetCommit(hash)
                                  setTagTargetMode("recent")
                                  setTagCustomHashInput("")
                                  setShowTagPrompt(true)
                                }}
                                type="button"
                              >
                                <Icon name="tag" size={13} />
                                <span>Create Tag...</span>
                              </button>

                              {/* 3. Cherry Pick */}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                                onClick={() => {
                                  const hash = commit.hash
                                  setActiveCommitMenu(null)
                                  void cherryPickCommit(hash)
                                }}
                                type="button"
                              >
                                <Icon name="cherry-pick" size={13} />
                                <span>Cherry Pick</span>
                              </button>

                              {/* 4. Compare With */}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                                onClick={() => {
                                  const hash = commit.hash
                                  setActiveCommitMenu(null)
                                  setCompareBaseHash(hash)
                                  const other = gitCommits.find(
                                    (c) => c.hash !== hash,
                                  )
                                  setCompareTargetHash(other ? other.hash : "")
                                  setCompareTargetMode("recent")
                                  setCompareCustomHashInput("")
                                  setShowComparePrompt(true)
                                }}
                                type="button"
                              >
                                <Icon name="split" size={13} />
                                <span>Compare with...</span>
                              </button>
                            </div>

                            <div className="py-1">
                              {/* 5. Copy Commit Hash */}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                                onClick={() => {
                                  const hash = commit.hash
                                  setActiveCommitMenu(null)
                                  void navigator.clipboard?.writeText(hash)
                                  showToast(
                                    `Copied commit hash [${hash.slice(0, 7)}]`,
                                  )
                                }}
                                type="button"
                              >
                                <Icon name="copy" size={13} />
                                <span>Copy Commit Hash</span>
                              </button>

                              {/* 6. Copy Commit Message */}
                              <button
                                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--color-surface-hover)] text-[var(--color-ink)] text-left cursor-pointer"
                                onClick={() => {
                                  const msg = commit.message
                                  setActiveCommitMenu(null)
                                  void navigator.clipboard?.writeText(msg)
                                  showToast("Copied commit message")
                                }}
                                type="button"
                              >
                                <Icon name="edit" size={13} />
                                <span>Copy Commit Message</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}

                {gitCommits.length > visibleCommitCount && (
                  <button
                    className="w-full text-center py-1.5 mt-2 text-[10px] text-accent hover:bg-surface-hover rounded border border-line cursor-pointer"
                    onClick={() =>
                      setVisibleCommitCount((c) => c + graphPageSize)
                    }
                    type="button"
                  >
                    Load More Commits (
                    {Math.min(visibleCommitCount, gitCommits.length)} of{" "}
                    {gitCommits.length})
                  </button>
                )}
              </div>
            ) : (
              <div className="px-3 py-4 text-center text-xs text-[var(--color-ink-muted)]">
                No commits in repository history yet.
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Git Profile Footer (Non-hardcoded from git config) */}
      <div className="px-3 py-2 border-t border-[var(--color-line)] bg-[var(--color-surface)] text-[10px] text-[var(--color-ink-muted)] flex items-center justify-between">
        <div className="flex items-center gap-1.5 truncate">
          <span className="w-2 h-2 rounded-full bg-[var(--color-success)]" />
          <span className="font-medium text-[var(--color-ink-soft)] truncate">
            {gitProfile.name || "Git User"}
          </span>
          {gitProfile.email && (
            <span className="truncate opacity-75">
              &lt;{gitProfile.email}&gt;
            </span>
          )}
        </div>
        <span className="shrink-0 text-[9px] uppercase tracking-wider font-semibold opacity-60">
          CLI SYNC
        </span>
      </div>

      {/* Tag Prompt Modal */}
      {showTagPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-xs text-[var(--color-ink)] flex items-center gap-1.5">
                <Icon name="tag" size={14} />
                <span>Create Git Tag</span>
              </h4>
              <button
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                onClick={() => {
                  setShowTagPrompt(false)
                  setTagTargetCommit("")
                  setTagCustomHashInput("")
                  setTagTargetMode("recent")
                }}
                title="Close"
                type="button"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] font-semibold text-[var(--color-ink-muted)] mb-1 uppercase tracking-wider">
                  Tag Name
                </label>
                <input
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                  onChange={(e) => setTagNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTagSubmit()
                  }}
                  placeholder="e.g. v1.0.0"
                  value={tagNameInput}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-[var(--color-ink-muted)] mb-1 uppercase tracking-wider">
                  Annotation Message (Optional)
                </label>
                <input
                  className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                  onChange={(e) => setTagMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateTagSubmit()
                  }}
                  placeholder="e.g. Release version 1.0.0"
                  value={tagMessageInput}
                />
              </div>

              {/* Target Commit Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                    Target Commit
                  </label>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      className={`cursor-pointer hover:underline ${
                        tagTargetMode === "recent"
                          ? "text-[var(--color-accent)] font-semibold"
                          : "text-[var(--color-ink-muted)]"
                      }`}
                      onClick={() => setTagTargetMode("recent")}
                      type="button"
                    >
                      Recent (5)
                    </button>
                    <span className="text-[var(--color-ink-muted)]">|</span>
                    <button
                      className={`cursor-pointer hover:underline ${
                        tagTargetMode === "custom"
                          ? "text-[var(--color-accent)] font-semibold"
                          : "text-[var(--color-ink-muted)]"
                      }`}
                      onClick={() => setTagTargetMode("custom")}
                      type="button"
                    >
                      Manual Hash
                    </button>
                  </div>
                </div>

                {tagTargetMode === "recent" ? (
                  <select
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] cursor-pointer"
                    onChange={(e) => setTagTargetCommit(e.target.value)}
                    value={tagTargetCommit || (gitCommits[0]?.hash ?? "")}
                  >
                    {gitCommits.slice(0, 5).map((c, i) => (
                      <option key={c.hash} value={c.hash}>
                        [{c.shortHash || c.hash.slice(0, 7)}]
                        {i === 0 ? " (HEAD)" : ""}: {c.message.slice(0, 28)}
                        {c.message.length > 28 ? "..." : ""}
                      </option>
                    ))}
                    {gitCommits.length === 0 && (
                      <option value="">HEAD (Current HEAD)</option>
                    )}
                  </select>
                ) : (
                  <div>
                    <input
                      className={`w-full px-2.5 py-1.5 rounded border bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none font-mono ${
                        tagCustomHashInput &&
                        !isValidGitHash(tagCustomHashInput)
                          ? "border-[var(--color-error)]"
                          : "border-[var(--color-line)] focus:border-[var(--color-accent)]"
                      }`}
                      onChange={(e) => setTagCustomHashInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateTagSubmit()
                      }}
                      placeholder="Enter commit SHA (7-40 hex chars)..."
                      value={tagCustomHashInput}
                    />
                    <div className="mt-1 text-[10px]">
                      {tagCustomHashInput ? (
                        isValidGitHash(tagCustomHashInput) ? (
                          <span className="text-[var(--color-success)] flex items-center gap-1">
                            <Icon name="check" size={10} />
                            <span>Valid commit hash format</span>
                          </span>
                        ) : (
                          <span className="text-[var(--color-error)] flex items-center gap-1">
                            <Icon name="warning" size={10} />
                            <span>Must be 7-40 hexadecimal characters</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[var(--color-ink-muted)]">
                          Leave empty for HEAD or enter specific SHA
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1 rounded text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                onClick={() => {
                  setShowTagPrompt(false)
                  setTagTargetCommit("")
                  setTagCustomHashInput("")
                  setTagTargetMode("recent")
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={
                  tagTargetMode === "custom" &&
                  Boolean(tagCustomHashInput) &&
                  !isValidGitHash(tagCustomHashInput)
                }
                onClick={handleCreateTagSubmit}
                type="button"
              >
                Create Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compare Commits Modal */}
      {showComparePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-xs text-[var(--color-ink)] flex items-center gap-1.5">
                <Icon name="split" size={14} />
                <span>Compare Commits</span>
              </h4>
              <button
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                onClick={() => {
                  setShowComparePrompt(false)
                  setCompareBaseHash("")
                  setCompareTargetHash("")
                  setCompareCustomHashInput("")
                  setCompareTargetMode("recent")
                }}
                title="Close"
                type="button"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              {/* Base Commit Display */}
              <div>
                <label className="block text-[10px] font-semibold text-[var(--color-ink-muted)] mb-1 uppercase tracking-wider">
                  Base Commit
                </label>
                <div className="px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] flex items-center gap-2">
                  <span className="font-mono font-bold text-[var(--color-accent)] shrink-0">
                    {compareBaseHash.slice(0, 7)}
                  </span>
                  <span className="truncate text-[11px] text-[var(--color-ink-muted)]">
                    {gitCommits.find((c) => c.hash === compareBaseHash)
                      ?.message || compareBaseHash}
                  </span>
                </div>
              </div>

              {/* Target Commit Selector */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                    Compare With (Target)
                  </label>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      className={`cursor-pointer hover:underline ${
                        compareTargetMode === "recent"
                          ? "text-[var(--color-accent)] font-semibold"
                          : "text-[var(--color-ink-muted)]"
                      }`}
                      onClick={() => setCompareTargetMode("recent")}
                      type="button"
                    >
                      Recent (5)
                    </button>
                    <span className="text-[var(--color-ink-muted)]">|</span>
                    <button
                      className={`cursor-pointer hover:underline ${
                        compareTargetMode === "custom"
                          ? "text-[var(--color-accent)] font-semibold"
                          : "text-[var(--color-ink-muted)]"
                      }`}
                      onClick={() => setCompareTargetMode("custom")}
                      type="button"
                    >
                      Manual Hash
                    </button>
                  </div>
                </div>

                {compareTargetMode === "recent" ? (
                  <select
                    className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] cursor-pointer"
                    onChange={(e) => setCompareTargetHash(e.target.value)}
                    value={compareTargetHash}
                  >
                    {gitCommits
                      .filter((c) => c.hash !== compareBaseHash)
                      .slice(0, 5)
                      .map((c, i) => (
                        <option key={c.hash} value={c.hash}>
                          [{c.shortHash || c.hash.slice(0, 7)}]
                          {i === 0 ? " (HEAD)" : ""}: {c.message.slice(0, 28)}
                          {c.message.length > 28 ? "..." : ""}
                        </option>
                      ))}
                    {gitCommits.filter((c) => c.hash !== compareBaseHash)
                      .length === 0 && (
                      <option disabled value="">
                        No other commits in history
                      </option>
                    )}
                  </select>
                ) : (
                  <div>
                    <input
                      className={`w-full px-2.5 py-1.5 rounded border bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none font-mono ${
                        compareCustomHashInput &&
                        !isValidGitHash(compareCustomHashInput)
                          ? "border-[var(--color-error)]"
                          : "border-[var(--color-line)] focus:border-[var(--color-accent)]"
                      }`}
                      onChange={(e) =>
                        setCompareCustomHashInput(e.target.value)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCompareSubmit()
                      }}
                      placeholder="Enter target commit SHA (7-40 hex chars)..."
                      value={compareCustomHashInput}
                    />
                    <div className="mt-1 text-[10px]">
                      {compareCustomHashInput ? (
                        isValidGitHash(compareCustomHashInput) ? (
                          compareCustomHashInput.trim() === compareBaseHash ? (
                            <span className="text-[var(--color-warning)] flex items-center gap-1">
                              <Icon name="warning" size={10} />
                              <span>Cannot compare commit with itself</span>
                            </span>
                          ) : (
                            <span className="text-[var(--color-success)] flex items-center gap-1">
                              <Icon name="check" size={10} />
                              <span>Valid commit hash format</span>
                            </span>
                          )
                        ) : (
                          <span className="text-[var(--color-error)] flex items-center gap-1">
                            <Icon name="warning" size={10} />
                            <span>Must be 7-40 hexadecimal characters</span>
                          </span>
                        )
                      ) : (
                        <span className="text-[var(--color-ink-muted)]">
                          Enter specific commit SHA to compare against base
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1 rounded text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                onClick={() => {
                  setShowComparePrompt(false)
                  setCompareBaseHash("")
                  setCompareTargetHash("")
                  setCompareCustomHashInput("")
                  setCompareTargetMode("recent")
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={
                  isLoadingCompare ||
                  (compareTargetMode === "recent"
                    ? !compareTargetHash
                    : !compareCustomHashInput ||
                      !isValidGitHash(compareCustomHashInput) ||
                      compareCustomHashInput.trim() === compareBaseHash)
                }
                onClick={handleCompareSubmit}
                type="button"
              >
                {isLoadingCompare ? "Comparing..." : "Compare"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Prompt Modal */}
      {showBranchPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-xs text-[var(--color-ink)]">
                Git Branches
              </h4>
              <button
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                onClick={() => setShowBranchPrompt(false)}
                title="Close"
                type="button"
              >
                <Icon name="close" size={13} />
              </button>
            </div>

            {/* Existing Branches List */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-ink-muted)]">
                  Switch Branch ({gitBranches.length})
                </span>
                {activeBranch && (
                  <span className="text-[10px] text-[var(--color-ink-muted)]">
                    Current:{" "}
                    <span className="font-semibold text-[var(--color-accent)]">
                      {activeBranch}
                    </span>
                  </span>
                )}
              </div>
              <div className="max-h-40 overflow-y-auto space-y-0.5 border border-[var(--color-line)] rounded-md p-1 bg-[var(--color-canvas)]">
                {gitBranches.length === 0 ? (
                  <div className="text-[11px] text-[var(--color-ink-muted)] p-2 text-center">
                    No branches found
                  </div>
                ) : (
                  gitBranches.map((branch) => {
                    const isActive = branch === activeBranch
                    return (
                      <button
                        key={branch}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left transition-colors ${
                          isActive
                            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-medium cursor-default"
                            : "text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                        }`}
                        disabled={isActive}
                        onClick={() => {
                          if (!isActive) {
                            void checkoutBranch(branch)
                            setShowBranchPrompt(false)
                          }
                        }}
                        title={
                          isActive
                            ? "Current branch"
                            : `Switch to branch "${branch}"`
                        }
                        type="button"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Icon
                            className={
                              isActive
                                ? "text-[var(--color-accent)]"
                                : "text-[var(--color-ink-muted)]"
                            }
                            name="branch"
                            size={12}
                          />
                          <span className="truncate">{branch}</span>
                        </div>
                        {isActive ? (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-accent)] shrink-0">
                            <Icon name="check" size={11} />
                            current
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] shrink-0">
                            Switch
                          </span>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="my-3 border-t border-[var(--color-line)]" />

            {/* Create New Branch */}
            <h4 className="font-semibold text-xs text-[var(--color-ink)] mb-2">
              Create New Branch
            </h4>
            <input
              className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)] mb-4"
              onChange={(e) => setBranchNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateBranchSubmit()
              }}
              placeholder="Branch name (e.g. feature/my-branch)"
              value={branchNameInput}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1 rounded text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                onClick={() => setShowBranchPrompt(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer"
                onClick={handleCreateBranchSubmit}
                type="button"
              >
                Create & Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Remote Prompt Modal */}
      {showRemotePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
            <h4 className="font-semibold text-xs text-[var(--color-ink)] mb-3">
              Add Remote Repository
            </h4>
            <div className="space-y-2 mb-4">
              <input
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                onChange={(e) => setRemoteNameInput(e.target.value)}
                placeholder="Remote name (default: origin)"
                value={remoteNameInput}
              />
              <input
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                onChange={(e) => setRemoteUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateRemoteSubmit()
                }}
                placeholder="Remote URL (e.g. https://github.com/user/repo.git)"
                value={remoteUrlInput}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1 rounded text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                onClick={() => setShowRemotePrompt(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer"
                onClick={handleCreateRemoteSubmit}
                type="button"
              >
                Add Remote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stash Prompt Modal */}
      {showStashPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold text-xs text-[var(--color-ink)] flex items-center gap-1.5">
                <Icon name="stash" size={14} />
                <span>Stash Changes</span>
              </h4>
              <button
                className="text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] cursor-pointer"
                onClick={() => setShowStashPrompt(false)}
                title="Close"
                type="button"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
            <div className="space-y-3 mb-4">
              <input
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                onChange={(e) => setStashMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleStashSubmit()
                }}
                placeholder="Stash message (optional)..."
                value={stashMessageInput}
              />
              <label className="flex items-center gap-2 text-xs text-[var(--color-ink-soft)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={stashUntrackedInput}
                  onChange={(e) => setStashUntrackedInput(e.target.checked)}
                  className="rounded border-[var(--color-line)] text-[var(--color-accent)]"
                />
                <span>Include untracked files</span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1 rounded text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                onClick={() => setShowStashPrompt(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer"
                onClick={handleStashSubmit}
                disabled={isOperatingGit}
                type="button"
              >
                {isOperatingGit ? "Stashing..." : "Stash"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone Repository Modal */}
      {renderCloneModal()}
    </div>
  )
}
