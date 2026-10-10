import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function SourceControlPanel() {
  const { activeBranch, gitChanges, setActiveTab, showToast } = useWorkbench()
  const [commitMessage, setCommitMessage] = useState("")

  function handleCommit() {
    if (!commitMessage.trim()) return
    showToast(`Committed: "${commitMessage.trim()}"`)
    setCommitMessage("")
  }

  return (
    <div className="tool-panel">
      <div className="repository-line">
        <span className="status-dot" />
        <strong>AEGISCODE</strong>
        <span>{activeBranch}</span>
      </div>
      <textarea
        aria-label="Commit message"
        className="commit-input"
        onChange={(event) => setCommitMessage(event.target.value)}
        placeholder="Message (Ctrl+Enter to commit)"
        rows={3}
        value={commitMessage}
      />
      <button
        className="primary-action"
        disabled={!commitMessage.trim()}
        onClick={handleCommit}
        type="button"
      >
        Commit
      </button>
      <div className="change-group">
        <div className="section-title">
          <Icon name="chevron" size={12} />
          <span>CHANGES</span>
          <small>{gitChanges.length}</small>
        </div>
        {gitChanges.map((change) => (
          <button
            className="change-row"
            key={change.file}
            onClick={() => setActiveTab(change.file)}
            type="button"
          >
            <span className="change-code">{change.code}</span>
            <span>{change.file}</span>
            <small>{change.directory}</small>
          </button>
        ))}
      </div>
      <div className="sync-row">
        <span>
          <Icon name="branch" size={13} /> {activeBranch}
        </span>
        <button
          onClick={() => showToast("Syncing with origin...")}
          type="button"
        >
          Sync changes
        </button>
      </div>
    </div>
  )
}
