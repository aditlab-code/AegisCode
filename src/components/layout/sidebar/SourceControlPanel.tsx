import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function SourceControlPanel() {
  const {
    activeBranch,
    activeRepo,
    setActiveRepo,
    gitRepos,
    gitChanges,
    stagedChanges,
    gitCommits,
    stageChange,
    unstageChange,
    stageAllChanges,
    unstageAllChanges,
    commitChanges,
    gitPull,
    gitPush,
    openFileInPane,
    showToast,
  } = useWorkbench()

  const [commitMessage, setCommitMessage] = useState("")
  const [stagedOpen, setStagedOpen] = useState(true)
  const [changesOpen, setChangesOpen] = useState(true)
  const [graphOpen, setGraphOpen] = useState(true)

  function handleCommit() {
    if (!commitMessage.trim()) {
      showToast("Please enter a commit message")
      return
    }
    commitChanges(commitMessage)
    setCommitMessage("")
  }

  return (
    <div className="tool-panel git-panel">
      {/* Visual Checkpoint Status Notice */}
      <div className="mx-3 my-2 p-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] text-[11px]">
        <div className="flex items-center gap-1.5 font-medium text-[var(--color-ink)]">
          <Icon name="branch" size={13} />
          <span>
            {activeBranch && activeBranch !== "no git"
              ? `Git Active: ${activeBranch}`
              : "No Git Detected"}
          </span>
          <span
            className={`ml-auto w-2 h-2 rounded-full ${
              activeBranch && activeBranch !== "no git"
                ? "bg-[var(--color-success)]"
                : "bg-[var(--color-warning)]"
            }`}
          />
        </div>
        <p className="mt-1 text-[10px] text-[var(--color-ink-muted)]">
          {activeBranch && activeBranch !== "no git"
            ? "Visual checkpoint active. CLI git actions unscoped for Phase 1."
            : "No .git directory found in root workspace folder."}
        </p>
      </div>

      {/* 1. Active Repositories Controller */}
      <div className="git-repo-selector">
        <label className="git-repo-label" htmlFor="repo-select">
          <span className="git-repo-icon" title="Git Repository">
            <Icon name="git" size={14} />
          </span>
          <span className="repo-label-text">REPOSITORY</span>
        </label>
        <select
          className="git-repo-dropdown"
          id="repo-select"
          onChange={(e) => {
            setActiveRepo(e.target.value)
            showToast(`Switched active repository to ${e.target.value}`)
          }}
          value={activeRepo}
        >
          {gitRepos.length > 0 ? (
            gitRepos.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name} ({repo.branch})
              </option>
            ))
          ) : (
            <option value="none">
              {activeBranch && activeBranch !== "no git"
                ? `${activeRepo} (${activeBranch})`
                : "No repository"}
            </option>
          )}
        </select>
        <span
          className={`status-dot ${
            activeBranch && activeBranch !== "no git"
              ? "status-dot-git"
              : "opacity-40"
          }`}
          title={
            activeBranch && activeBranch !== "no git" ? "Active" : "Offline"
          }
        />
      </div>

      {/* 2. Commit Message & Action Buttons */}
      <div className="git-commit-box">
        <textarea
          aria-label="Commit message"
          className="commit-input"
          disabled
          placeholder="Commit action unscoped in Phase 1 (visual checkpoint only)"
          rows={3}
          value={commitMessage}
        />

        <button
          className="primary-action commit-btn opacity-50 cursor-not-allowed"
          disabled
          title="Commit action unscoped in Phase 1 (visual checkpoint only)"
          type="button"
        >
          <span className="commit-git-icon">
            <Icon name="git" size={13} />
          </span>
          <span>Commit (Checkpoint Only)</span>
        </button>

        {/* Git Control Toolbar: Pull, Push, Sync */}
        <div className="git-toolbar">
          <button
            className="git-tool-btn git-btn-pull opacity-50 cursor-not-allowed"
            disabled
            title="Git pull action unscoped in Phase 1"
            type="button"
          >
            <span className="git-tool-icon icon-pull">
              <Icon name="arrow-down" size={13} />
            </span>
            <span>Pull</span>
          </button>
          <button
            className="git-tool-btn git-btn-push opacity-50 cursor-not-allowed"
            disabled
            title="Git push action unscoped in Phase 1"
            type="button"
          >
            <span className="git-tool-icon icon-push">
              <Icon name="arrow-up" size={13} />
            </span>
            <span>Push</span>
          </button>
          <button
            className="git-tool-btn git-btn-sync opacity-50 cursor-not-allowed"
            disabled
            title="Git sync action unscoped in Phase 1"
            type="button"
          >
            <span className="git-tool-icon icon-sync">
              <Icon name="refresh" size={13} />
            </span>
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* 3. Subtab / Section: STAGED CHANGES */}
      <div className="git-section">
        <div className="section-title git-section-header">
          <button
            className="section-title-toggle"
            onClick={() => setStagedOpen((prev) => !prev)}
            type="button"
          >
            <span
              className={`chevron-arrow ${stagedOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={12} />
            </span>
            <span>STAGED CHANGES</span>
            <small className="git-count-badge">{stagedChanges.length}</small>
          </button>
          {stagedChanges.length > 0 && (
            <button
              className="git-header-action action-unstage"
              onClick={unstageAllChanges}
              title="Unstage all changes"
              type="button"
            >
              <Icon name="close" size={11} />
            </button>
          )}
        </div>

        {stagedOpen && (
          <div className="git-change-list">
            {stagedChanges.length > 0 ? (
              stagedChanges.map((change) => (
                <div
                  className="git-change-row"
                  key={`staged-${change.file}`}
                  onClick={() => openFileInPane(change.file)}
                >
                  <span
                    className={`change-badge change-${
                      change.status || "modified"
                    }`}
                  >
                    {change.code ||
                      (change.status === "added"
                        ? "A"
                        : change.status === "deleted"
                          ? "D"
                          : "M")}
                  </span>
                  <span className="change-filename">{change.file}</span>
                  <button
                    className="git-row-action action-unstage"
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
              ))
            ) : (
              <div className="git-empty-hint">No staged changes</div>
            )}
          </div>
        )}
      </div>

      {/* 4. Subtab / Section: CHANGES */}
      <div className="git-section">
        <div className="section-title git-section-header">
          <button
            className="section-title-toggle"
            onClick={() => setChangesOpen((prev) => !prev)}
            type="button"
          >
            <span
              className={`chevron-arrow ${changesOpen ? "chevron-open" : ""}`}
            >
              <Icon name="chevron" size={12} />
            </span>
            <span>CHANGES</span>
            <small className="git-count-badge">{gitChanges.length}</small>
          </button>
          {gitChanges.length > 0 && (
            <button
              className="git-header-action action-stage"
              onClick={stageAllChanges}
              title="Stage all changes"
              type="button"
            >
              <Icon name="add" size={12} />
            </button>
          )}
        </div>

        {changesOpen && (
          <div className="git-change-list">
            {gitChanges.length > 0 ? (
              gitChanges.map((change) => (
                <div
                  className="git-change-row"
                  key={`change-${change.file}`}
                  onClick={() => openFileInPane(change.file)}
                >
                  <span
                    className={`change-badge change-${
                      change.status || "modified"
                    }`}
                  >
                    {change.code ||
                      (change.status === "added"
                        ? "A"
                        : change.status === "deleted"
                          ? "D"
                          : "M")}
                  </span>
                  <span className="change-filename">{change.file}</span>
                  <button
                    className="git-row-action action-stage"
                    onClick={(e) => {
                      e.stopPropagation()
                      stageChange(change.file)
                    }}
                    title="Stage change"
                    type="button"
                  >
                    <Icon name="add" size={12} />
                  </button>
                </div>
              ))
            ) : (
              <div className="git-empty-hint">Working tree clean</div>
            )}
          </div>
        )}
      </div>

      {/* 5. Branch Graph (Visual SVG Commit Timeline) */}
      <div className="git-section git-graph-section">
        <button
          className="section-title section-title-clickable"
          onClick={() => setGraphOpen((prev) => !prev)}
          type="button"
        >
          <span className={`chevron-arrow ${graphOpen ? "chevron-open" : ""}`}>
            <Icon name="chevron" size={12} />
          </span>
          <span>BRANCH GRAPH</span>
          <span className="git-active-branch-pill">
            <span className="branch-icon-accent">
              <Icon name="branch" size={11} />
            </span>
            {activeBranch}
          </span>
        </button>

        {graphOpen && (
          <div className="branch-graph-container">
            {gitCommits.map((commit, index) => {
              const isFirst = index === 0
              const isLast = index === gitCommits.length - 1
              const nodeColor =
                commit.branch === "main"
                  ? "var(--color-accent)"
                  : "var(--color-cyan)"

              return (
                <div
                  className="branch-node-row"
                  key={commit.hash}
                  onClick={() => {
                    navigator.clipboard?.writeText(commit.hash)
                    showToast(`Copied commit hash [${commit.hash}]`)
                  }}
                  title={`Click to copy hash ${commit.hash}`}
                >
                  {/* Visual SVG Timeline Node */}
                  <div className="branch-svg-col">
                    <svg
                      aria-hidden="true"
                      className="branch-node-svg"
                      height="38"
                      width="18"
                    >
                      {/* Vertical line connecting top */}
                      {!isFirst && (
                        <line
                          stroke="var(--color-line-bright)"
                          strokeWidth="2"
                          x1="9"
                          x2="9"
                          y1="0"
                          y2="19"
                        />
                      )}
                      {/* Vertical line connecting bottom */}
                      {!isLast && (
                        <line
                          stroke="var(--color-line-bright)"
                          strokeWidth="2"
                          x1="9"
                          x2="9"
                          y1="19"
                          y2="38"
                        />
                      )}
                      {/* Commit Circle */}
                      <circle
                        cx="9"
                        cy="19"
                        fill="var(--color-canvas)"
                        r="5"
                        stroke={nodeColor}
                        strokeWidth="2"
                      />
                      <circle cx="9" cy="19" fill={nodeColor} r="2" />
                    </svg>
                  </div>

                  {/* Commit Information */}
                  <div className="branch-node-info">
                    <div className="branch-node-header">
                      <span className="commit-hash">{commit.hash}</span>
                      <span className="commit-branch-tag">
                        <span className="branch-icon-tag">
                          <Icon name="branch" size={9} />
                        </span>
                        {commit.branch || activeBranch}
                      </span>
                      <small className="commit-time">{commit.timestamp}</small>
                    </div>
                    <div className="commit-message" title={commit.message}>
                      {commit.message}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
