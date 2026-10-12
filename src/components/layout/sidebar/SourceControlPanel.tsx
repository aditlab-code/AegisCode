import { useEffect, useRef, useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"

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
  const [graphOpen, setGraphOpen] = useState(true)

  // Context & action menus
  const [menuOpen, setMenuOpen] = useState(false)
  const [commitDropdownOpen, setCommitDropdownOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Modals / prompts
  const [showTagPrompt, setShowTagPrompt] = useState(false)
  const [tagNameInput, setTagNameInput] = useState("")
  const [tagMessageInput, setTagMessageInput] = useState("")
  const [showBranchPrompt, setShowBranchPrompt] = useState(false)
  const [branchNameInput, setBranchNameInput] = useState("")
  const [showRemotePrompt, setShowRemotePrompt] = useState(false)
  const [remoteNameInput, setRemoteNameInput] = useState("origin")
  const [remoteUrlInput, setRemoteUrlInput] = useState("")

  const isDirty = gitChanges.length > 0 || stagedChanges.length > 0

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setCommitDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleCommit(andPush = false) {
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

    const modifiedFiles = [
      ...stagedChanges.map((c) => c.file),
      ...gitChanges.map((c) => c.file),
    ]

    const prefix = modifiedFiles.some((f) => f.includes("test"))
      ? "test"
      : modifiedFiles.some((f) => f.endsWith(".md"))
        ? "docs"
        : "feat"

    const summary = `${prefix}: update ${modifiedFiles.slice(0, 2).join(", ")}${
      modifiedFiles.length > 2
        ? ` and ${modifiedFiles.length - 2} other files`
        : ""
    }`

    setCommitMessage(summary)
    showToast("Generated commit message draft")
  }

  function handleCreateTagSubmit() {
    const trimmed = tagNameInput.trim()
    if (!trimmed) {
      showToast("Tag name cannot be empty")
      return
    }
    createTag(trimmed, tagMessageInput.trim())
    setShowTagPrompt(false)
    setTagNameInput("")
    setTagMessageInput("")
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
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[var(--color-accent)] hover:opacity-90 text-white text-xs font-medium transition-all shadow-xs cursor-pointer"
          onClick={openFolderPicker}
          type="button"
        >
          <Icon name="folder" size={13} />
          <span>Open Folder</span>
        </button>
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
            onClick={openFolderPicker}
            type="button"
          >
            <Icon name="folder" size={13} />
            <span>Open Other Folder</span>
          </button>
        </div>
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

      {/* 2. CHANGES Section (Commit Input & Changes List) */}
      <div className="border-b border-[var(--color-line)]">
        <button
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-surface-hover)] text-left transition-colors cursor-pointer"
          onClick={() => setChangesSectionOpen((v) => !v)}
          type="button"
        >
          <span
            className={`chevron-arrow ${
              changesSectionOpen ? "chevron-open" : ""
            }`}
          >
            <Icon name="chevron" size={11} />
          </span>
          <span>Source Control</span>
        </button>

        {changesSectionOpen && (
          <div className="p-3 pt-1 space-y-2.5">
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
            <div className="flex w-full items-stretch rounded-md bg-[var(--color-success)] text-white shadow-xs overflow-visible relative">
              <button
                className="flex-1 flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium hover:bg-black/15 active:bg-black/25 transition-colors cursor-pointer select-none rounded-l-md truncate min-w-0"
                onClick={() => handleCommit(false)}
                title={`Commit changes on "${activeBranch}"`}
                type="button"
              >
                <Icon className="shrink-0" name="check" size={13} />
                <span className="truncate">Commit</span>
              </button>

              <div className="w-[1px] bg-white/25 self-stretch my-1 shrink-0" />

              <div className="relative flex items-stretch shrink-0">
                <button
                  aria-label="Commit Options"
                  className="flex items-center justify-center px-3 hover:bg-black/15 active:bg-black/25 transition-colors cursor-pointer rounded-r-md"
                  onClick={() => setCommitDropdownOpen((v) => !v)}
                  title="More commit options"
                  type="button"
                >
                  <Icon className="shrink-0" name="chevron-down" size={12} />
                </button>

                {commitDropdownOpen && (
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

            {/* Sub-section: STAGED CHANGES */}
            {stagedChanges.length > 0 && (
              <div className="pt-1">
                <div className="flex items-center justify-between py-1 px-1 text-[11px] font-semibold text-[var(--color-ink-soft)]">
                  <button
                    className="flex items-center gap-1.5 hover:text-[var(--color-ink)] cursor-pointer"
                    onClick={() => setStagedOpen((v) => !v)}
                    type="button"
                  >
                    <span
                      className={`chevron-arrow ${
                        stagedOpen ? "chevron-open" : ""
                      }`}
                    >
                      <Icon name="chevron" size={11} />
                    </span>
                    <span>STAGED CHANGES</span>
                    <span className="git-count-badge">
                      {stagedChanges.length}
                    </span>
                  </button>

                  <button
                    aria-label="Unstage all changes"
                    className="git-header-action action-unstage"
                    onClick={unstageAllChanges}
                    title="Unstage all changes"
                    type="button"
                  >
                    <Icon name="close" size={11} />
                  </button>
                </div>

                {stagedOpen && (
                  <div className="divide-y divide-transparent">
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

            {/* Sub-section: CHANGES */}
            <div className="pt-1">
              <div className="flex items-center justify-between py-1 px-1 text-[11px] font-semibold text-[var(--color-ink-soft)]">
                <button
                  className="flex items-center gap-1.5 hover:text-[var(--color-ink)] cursor-pointer"
                  onClick={() => setChangesOpen((v) => !v)}
                  type="button"
                >
                  <span
                    className={`chevron-arrow ${
                      changesOpen ? "chevron-open" : ""
                    }`}
                  >
                    <Icon name="chevron" size={11} />
                  </span>
                  <span>CHANGES</span>
                  <span className="git-count-badge">{gitChanges.length}</span>
                </button>

                {gitChanges.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button
                      aria-label="Discard all changes"
                      className="git-header-action hover:text-[var(--color-error)]"
                      onClick={discardAllChanges}
                      title="Discard all changes"
                      type="button"
                    >
                      <Icon name="discard" size={11} />
                    </button>
                    <button
                      aria-label="Stage all changes"
                      className="git-header-action action-stage"
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
                <div className="divide-y divide-transparent">
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
                    <div className="px-2 py-2 text-[11px] text-[var(--color-ink-muted)] italic">
                      Working tree clean
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. GRAPH Section (Visual SVG Commit Timeline & Interactive Branches) */}
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
                        className="group flex items-start gap-2 p-1.5 rounded hover:bg-[var(--color-surface-hover)] cursor-pointer transition-colors"
                        key={commit.hash}
                        onClick={() => {
                          navigator.clipboard?.writeText(commit.hash)
                          showToast(
                            `Copied commit hash [${commit.shortHash || commit.hash.slice(0, 7)}]`,
                          )
                        }}
                        onDoubleClick={() => {
                          if (commit.branch && commit.branch !== activeBranch) {
                            checkoutBranch(commit.branch)
                          }
                        }}
                        title="Double-click to checkout branch, single-click to copy hash"
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

                            <span className="text-[10px] text-[var(--color-ink-muted)] ml-auto shrink-0">
                              {commit.timestamp}
                            </span>
                          </div>

                          <p className="text-[11px] text-[var(--color-ink)] truncate font-medium mt-0.5">
                            {commit.message}
                          </p>
                        </div>
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
            <h4 className="font-semibold text-xs text-[var(--color-ink)] mb-3">
              Create Git Tag
            </h4>
            <div className="space-y-2 mb-4">
              <input
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                onChange={(e) => setTagNameInput(e.target.value)}
                placeholder="Tag name (e.g. v1.0.0)"
                value={tagNameInput}
              />
              <input
                className="w-full px-2.5 py-1.5 rounded border border-[var(--color-line)] bg-[var(--color-canvas)] text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-accent)]"
                onChange={(e) => setTagMessageInput(e.target.value)}
                placeholder="Annotation message (optional)"
                value={tagMessageInput}
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                className="px-3 py-1 rounded text-xs text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-hover)] cursor-pointer"
                onClick={() => setShowTagPrompt(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-[var(--color-accent)] text-white text-xs font-medium cursor-pointer"
                onClick={handleCreateTagSubmit}
                type="button"
              >
                Create Tag
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch Prompt Modal */}
      {showBranchPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-xl">
            <h4 className="font-semibold text-xs text-[var(--color-ink)] mb-3">
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
    </div>
  )
}
