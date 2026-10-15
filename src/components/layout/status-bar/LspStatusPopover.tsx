import { useState, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  fetchLspStatus,
  type LanguageServerStatusInfo,
} from "../../../utils/lspApi"

interface LspStatusPopoverProps {
  onClose?: () => void
}

function getCanonicalLspKey(lang: string): string {
  const l = lang.trim().toLowerCase()
  if (l === "c++" || l === "cpp") return "cpp"
  if (l === "c") return "c"
  if (l === "c#" || l === "csharp" || l === "cs" || l === "csx") return "csharp"
  if (
    l === "bash" ||
    l === "sh" ||
    l === "zsh" ||
    l === "shell" ||
    l === "shellscript"
  )
    return "bash"
  if (l === "makefile" || l === "make" || l === "mk") return "makefile"
  if (l.startsWith("typescript") || l === "ts" || l === "tsx")
    return "typescript"
  if (l.startsWith("javascript") || l === "js" || l === "jsx")
    return "javascript"
  if (l === "python" || l === "py") return "python"
  if (l === "golang" || l === "go") return "go"
  if (l === "rust" || l === "rs") return "rust"
  if (l === "html" || l === "htm") return "html"
  if (l === "css") return "css"
  if (l === "json") return "json"
  return l
}

export function LspStatusPopover({ onClose }: LspStatusPopoverProps) {
  const { activeLanguage, setSettingsModalOpen, openSettingsModal, showToast } =
    useWorkbenchStore(
      useShallow((s) => ({
        activeLanguage: s.activeLanguage,
        setSettingsModalOpen: s.setSettingsModalOpen,
        openSettingsModal: s.openSettingsModal,
        showToast: s.showToast,
      })),
    )
  const [servers, setServers] = useState<LanguageServerStatusInfo[]>([])
  const [loading, setLoading] = useState(true)

  async function loadStatus() {
    setLoading(true)
    const list = await fetchLspStatus()
    setServers(list)
    setLoading(false)
  }

  useEffect(() => {
    loadStatus()
  }, [])

  function handleCopyInstall(cmd?: string) {
    if (!cmd) return
    void navigator.clipboard.writeText(cmd)
    showToast(`Copied install command: ${cmd}`)
  }

  function handleOpenSettings() {
    if (openSettingsModal) {
      openSettingsModal("LSP")
    } else {
      setSettingsModalOpen(true)
    }
    onClose?.()
  }

  return (
    <div className="status-popover lsp-popover flex flex-col max-h-[440px] text-xs">
      <div className="status-popover-header flex items-center justify-between px-3 py-2 border-b border-line">
        <span className="font-semibold text-ink-muted text-[10px] tracking-wider uppercase">
          LANGUAGE SERVERS (LSP)
        </span>
        <button
          className="text-ink-muted hover:text-ink cursor-pointer text-[10px]"
          onClick={loadStatus}
          title="Refresh server status"
          type="button"
        >
          <Icon name="refresh" size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {loading ? (
          <div className="text-center py-6 text-ink-muted text-xs">
            Scanning language servers...
          </div>
        ) : servers.length === 0 ? (
          <div className="text-center py-6 text-ink-muted text-xs">
            No language servers registered.
          </div>
        ) : (
          servers.map((s) => {
            const isCurrent =
              getCanonicalLspKey(activeLanguage) ===
              getCanonicalLspKey(s.language)

            return (
              <div
                key={s.language}
                className={`p-2 rounded border flex flex-col gap-1.5 transition-colors ${
                  isCurrent
                    ? "bg-surface-raised border-accent/40"
                    : "bg-surface border-line"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        s.status === "running"
                          ? "bg-green-500 shadow-sm shadow-green-500/50"
                          : s.status === "available"
                            ? "bg-blue-400"
                            : "bg-amber-400"
                      }`}
                    />
                    <span className="font-medium text-ink capitalize">
                      {s.language}
                    </span>
                    {isCurrent && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-accent/20 text-accent font-semibold">
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded uppercase font-semibold ${
                      s.status === "running"
                        ? "bg-green-500/15 text-green-400"
                        : s.status === "available"
                          ? "bg-blue-500/15 text-blue-400"
                          : "bg-amber-500/15 text-amber-400"
                    }`}
                  >
                    {s.status === "running"
                      ? `PID ${s.activePid || "RUNNING"}`
                      : s.status === "available"
                        ? "READY"
                        : "NOT FOUND"}
                  </span>
                </div>

                <div className="text-[11px] text-ink-muted font-mono flex items-center justify-between">
                  <span>Binary: {s.binaryName || s.language}</span>
                  {s.path && s.path !== "active" && (
                    <span
                      className="text-[10px] truncate max-w-[160px]"
                      title={s.path}
                    >
                      {s.path}
                    </span>
                  )}
                </div>

                {s.status === "not_found" && s.installCommand && (
                  <div className="mt-1 pt-1.5 border-t border-line/60 flex items-center justify-between gap-2">
                    <span
                      className="text-[10px] font-mono text-ink-muted truncate"
                      title={s.installCommand}
                    >
                      {s.installCommand}
                    </span>
                    <button
                      className="px-2 py-0.5 rounded bg-surface-raised hover:bg-surface-hover border border-line text-ink text-[10px] flex items-center gap-1 cursor-pointer shrink-0"
                      onClick={() => handleCopyInstall(s.installCommand)}
                      title="Copy install command to clipboard"
                      type="button"
                    >
                      <Icon name="copy" size={11} /> Copy
                    </button>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      <div className="p-2 border-t border-line bg-surface flex items-center justify-between">
        <span className="text-[10px] text-ink-muted">
          Need custom binary paths?
        </span>
        <button
          className="text-[11px] text-accent hover:underline cursor-pointer font-medium"
          onClick={handleOpenSettings}
          type="button"
        >
          LSP Settings →
        </button>
      </div>
    </div>
  )
}
