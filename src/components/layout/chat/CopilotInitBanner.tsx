import { Icon } from "../../ui/Icon"
import { useWorkbenchStore } from "../../../store"

export function CopilotInitBanner() {
  const isCopilotInitialized = useWorkbenchStore((s) => s.isCopilotInitialized)
  const openCopilotInitModal = useWorkbenchStore((s) => s.openCopilotInitModal)

  if (isCopilotInitialized !== false) return null

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 bg-accent/10 border-b border-accent/25 text-[11px] select-none transition-all shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex items-center justify-center w-5 h-5 rounded bg-accent/20 text-accent shrink-0">
          <Icon name="aegis" size={13} />
        </span>
        <div className="flex flex-col min-w-0">
          <span className="font-medium text-ink truncate">
            Aegis Copilot Not Initialized
          </span>
          <span className="text-[10px] text-ink-muted truncate">
            Set up workspace guidelines & autonomous task tracking
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={openCopilotInitModal}
        className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded bg-accent text-accent-contrast text-[11px] font-medium hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer"
        title="Initialize Aegis Copilot for this workspace"
      >
        <Icon name="zap" size={11} />
        <span>Set Up Copilot</span>
      </button>
    </div>
  )
}
