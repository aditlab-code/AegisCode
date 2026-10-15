import { useState, useEffect, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  browseDirectories,
  type DirectoryBrowseResult,
} from "../../../utils/workspaceApi"

export function FolderBrowserModal() {
  const { isOpen, close, openRootFolder, rootWorkspacePath } =
    useWorkbenchStore(
      useShallow((s) => ({
        isOpen: (s as any).folderBrowserModalOpen,
        close: (s as any).closeFolderBrowserModal,
        openRootFolder: s.openRootFolder,
        rootWorkspacePath: s.rootWorkspacePath,
      })),
    )

  const [browseData, setBrowseData] = useState<DirectoryBrowseResult | null>(
    null,
  )
  const [currentPath, setCurrentPath] = useState("")
  const [manualPath, setManualPath] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const initial = rootWorkspacePath || ""
    loadPath(initial)
  }, [isOpen, rootWorkspacePath])

  async function loadPath(target?: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await browseDirectories(target, showHidden)
      setBrowseData(res)
      setCurrentPath(res.currentPath)
      setManualPath(res.currentPath)
    } catch (err: any) {
      setError(err.message || "Failed to load directory")
    } finally {
      setLoading(false)
    }
  }

  function handleSelectFolder(folderPath: string) {
    loadPath(folderPath)
  }

  function handleGoUp() {
    if (browseData?.parentPath) {
      loadPath(browseData.parentPath)
    }
  }

  function handleConfirm() {
    const chosen = (manualPath || currentPath).trim()
    if (chosen) {
      void openRootFolder(chosen)
      close?.()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-xl flex flex-col rounded-xl bg-surface border border-line shadow-2xl overflow-hidden text-ink max-h-[85vh]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-picker-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-raised shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="folder" size={16} className="text-accent" />
            <h2
              id="folder-picker-title"
              className="text-sm font-semibold text-ink"
            >
              Open Project Folder
            </h2>
          </div>
          <IconButton label="Close" onClick={close}>
            <Icon name="close" size={14} />
          </IconButton>
        </div>

        {/* Current Path Navigation Bar */}
        <div className="px-4 py-2 border-b border-line flex items-center gap-2 bg-canvas/40 text-xs shrink-0">
          <IconButton
            label="Go to parent directory"
            onClick={handleGoUp}
            disabled={
              !browseData?.parentPath || browseData.parentPath === currentPath
            }
          >
            <Icon name="chevron" size={13} className="rotate-180" />
          </IconButton>
          <IconButton
            label="Go to Home directory"
            onClick={() =>
              browseData?.homePath && loadPath(browseData.homePath)
            }
          >
            <Icon name="folder" size={13} />
          </IconButton>
          <input
            type="text"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                loadPath(manualPath)
              }
            }}
            placeholder="/path/to/folder"
            className="flex-1 bg-surface px-2.5 py-1 rounded border border-line text-xs font-mono text-ink focus:border-accent outline-none"
          />
          <button
            type="button"
            onClick={() => loadPath(manualPath)}
            className="px-2 py-1 rounded bg-surface hover:bg-surface-hover border border-line text-[11px] cursor-pointer shrink-0"
          >
            Go
          </button>
        </div>

        {/* Quick Shortcuts */}
        <div className="px-4 py-1.5 border-b border-line flex items-center gap-1.5 overflow-x-auto text-[11px] text-ink-muted shrink-0">
          <span className="font-medium mr-1 text-ink-soft">Places:</span>
          {browseData?.homePath && (
            <button
              type="button"
              onClick={() => loadPath(browseData.homePath)}
              className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-line/60 cursor-pointer whitespace-nowrap"
            >
              Home
            </button>
          )}
          {browseData?.homePath && (
            <>
              <button
                type="button"
                onClick={() => loadPath(`${browseData.homePath}/Documents`)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-line/60 cursor-pointer whitespace-nowrap"
              >
                Documents
              </button>
              <button
                type="button"
                onClick={() => loadPath(`${browseData.homePath}/Desktop`)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-line/60 cursor-pointer whitespace-nowrap"
              >
                Desktop
              </button>
              <button
                type="button"
                onClick={() => loadPath(`${browseData.homePath}/Downloads`)}
                className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover border border-line/60 cursor-pointer whitespace-nowrap"
              >
                Downloads
              </button>
            </>
          )}
          <label className="ml-auto flex items-center gap-1 text-[11px] text-ink-muted cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => {
                setShowHidden(e.target.checked)
                loadPath(currentPath)
              }}
              className="rounded"
            />
            Show hidden
          </label>
        </div>

        {/* Directory List View */}
        <div
          ref={listRef}
          className="flex-1 min-h-[220px] max-h-[380px] overflow-y-auto p-2 divide-y divide-line/30"
        >
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-xs text-ink-muted gap-2">
              <span className="animate-spin">
                <Icon name="refresh" size={16} />
              </span>
              <span>Scanning directories...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-xs text-error gap-1 px-4 text-center">
              <Icon name="warning" size={16} />
              <span>{error}</span>
            </div>
          ) : !browseData?.directories?.length ? (
            <div className="flex flex-col items-center justify-center h-40 text-xs text-ink-muted">
              <span>No subdirectories in this folder.</span>
            </div>
          ) : (
            browseData.directories.map((dir) => (
              <div
                key={dir.path}
                onDoubleClick={() => handleSelectFolder(dir.path)}
                onClick={() => setManualPath(dir.path)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors text-xs select-none ${
                  manualPath === dir.path
                    ? "bg-accent/15 text-accent font-medium border border-accent/30"
                    : "hover:bg-surface-hover text-ink"
                }`}
              >
                <Icon
                  name="folder"
                  size={15}
                  className="text-accent shrink-0"
                />
                <span className="truncate flex-1">{dir.name}</span>
                <span className="text-[10px] text-ink-muted font-mono shrink-0 opacity-60">
                  Folder
                </span>
              </div>
            ))
          )}
        </div>

        {/* Selected Path Preview & Actions */}
        <div className="px-4 py-3 border-t border-line bg-surface-raised flex items-center justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] uppercase text-ink-muted tracking-wider block">
              Selected Target:
            </span>
            <span
              className="text-xs font-mono text-ink truncate block"
              title={manualPath || currentPath}
            >
              {manualPath || currentPath || "None"}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={close}
              className="px-3 py-1.5 rounded-lg border border-line hover:bg-surface-hover text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!(manualPath || currentPath)}
              className="px-4 py-1.5 rounded-lg bg-accent text-accent-contrast hover:opacity-90 disabled:opacity-40 text-xs font-semibold shadow cursor-pointer"
            >
              Select Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
