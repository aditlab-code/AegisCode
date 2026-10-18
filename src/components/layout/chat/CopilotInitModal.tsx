import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbenchStore, useShallow } from "../../../store"

export function CopilotInitModal() {
  const {
    isOpen,
    closeModal,
    initializeCopilotWorkspace,
    copilotStatus,
    showToast,
  } = useWorkbenchStore(
    useShallow((s) => ({
      isOpen: s.isCopilotInitModalOpen,
      closeModal: s.closeCopilotInitModal,
      initializeCopilotWorkspace: s.initializeCopilotWorkspace,
      copilotStatus: s.copilotStatus,
      showToast: s.showToast,
    })),
  )

  const detectedPreset =
    copilotStatus?.activePersona && copilotStatus.activePersona !== "custom"
      ? copilotStatus.activePersona
      : "kanna"

  const [selectedPreset, setSelectedPreset] = useState(detectedPreset)
  const [addToGitignore, setAddToGitignore] = useState(true)
  const [createSample, setCreateSample] = useState(false)
  const [overwriteRules, setOverwriteRules] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen) return null

  const presets = copilotStatus?.presets?.length
    ? copilotStatus.presets
    : [
        {
          id: "kanna",
          name: "Kanna (Creative & Friendly)",
          description:
            "Warm, creative anime pair-programming companion, encouraging, pragmatic, and highly communicative.",
        },
        {
          id: "architect",
          name: "Senior Architect (Formal & Structured)",
          description:
            "Formal software architect focused on clean boundaries, modularity, and strict invariants.",
        },
        {
          id: "minimalist",
          name: "Minimalist Hacker (Direct & Lean)",
          description:
            "Ultra-lean, to-the-point engineer delivering surgical code diffs with minimal fluff.",
        },
      ]

  async function handleInitialize() {
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const result = await initializeCopilotWorkspace({
        preset: selectedPreset,
        addToGitignore,
        createSample,
        overwriteRules,
      })
      if (result.success) {
        showToast("Aegis Copilot workspace initialized successfully!")
        closeModal()
      } else {
        setErrorMessage("Failed to initialize copilot workspace.")
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMessage(msg || "Failed to initialize workspace.")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="copilot-init-title"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isSubmitting) closeModal()
      }}
    >
      <div className="bg-surface border border-line rounded-xl shadow-2xl max-w-lg w-full flex flex-col overflow-hidden text-ink">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line bg-surface">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/20 text-accent">
              <Icon name="aegis" size={16} />
            </span>
            <div>
              <h2 id="copilot-init-title" className="font-semibold text-sm">
                Initialize Aegis Copilot
              </h2>
              <p className="text-xs text-ink-muted">
                Configure guidelines & autonomous task tracking for this
                workspace
              </p>
            </div>
          </div>
          <IconButton
            icon="x"
            size="sm"
            onClick={closeModal}
            disabled={isSubmitting}
            title="Close modal (Esc)"
          />
        </div>

        {/* Body Content */}
        <div className="p-5 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
          {errorMessage && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs flex items-center gap-2">
              <Icon name="alert-triangle" size={14} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Persona Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-ink uppercase tracking-wider">
              Pair-Programming Persona
            </label>
            <p className="text-[11px] text-ink-muted">
              Select the initial system instructions and operating persona
              template for{" "}
              <code className="px-1 py-0.5 rounded bg-canvas border border-line font-mono text-[10px]">
                AGENTS.md
              </code>
              .
            </p>
            <div className="grid grid-cols-1 gap-2 mt-1">
              {presets.map((preset) => {
                const isSelected = selectedPreset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPreset(preset.id)}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-accent bg-accent/10 shadow-xs"
                        : "border-line bg-surface hover:bg-surface-hover hover:border-line"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-medium ${
                          isSelected ? "text-accent font-semibold" : "text-ink"
                        }`}
                      >
                        {preset.name}
                      </span>
                      {isSelected && (
                        <Icon name="check" size={14} className="text-accent" />
                      )}
                    </div>
                    <span className="text-[11px] text-ink-muted mt-1 leading-relaxed">
                      {preset.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Options Section */}
          <div className="flex flex-col gap-3 pt-2 border-t border-line">
            <label className="text-xs font-semibold text-ink uppercase tracking-wider">
              Workspace Options
            </label>

            {/* Rewrite Rules Toggle */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteRules}
                onChange={(e) => setOverwriteRules(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-ink">
                  Update{" "}
                  <code className="font-mono text-[10px]">AGENTS.md</code> with
                  selected persona
                </span>
                <span className="text-[11px] text-ink-muted leading-tight">
                  Writes or updates the active guidelines in workspace root with
                  the selected persona template.
                </span>
              </div>
            </label>

            {/* Gitignore Toggle */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={addToGitignore}
                onChange={(e) => setAddToGitignore(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-ink">
                  Add{" "}
                  <code className="font-mono text-[10px]">.aegis/tasks/</code>{" "}
                  to .gitignore
                </span>
                <span className="text-[11px] text-ink-muted leading-tight">
                  Keeps ephemeral task execution logs and wave files out of
                  public git commits.
                </span>
              </div>
            </label>

            {/* Sample Task Toggle */}
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={createSample}
                onChange={(e) => setCreateSample(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-ink">
                  Generate Starter Verification Task
                </span>
                <span className="text-[11px] text-ink-muted leading-tight">
                  Creates an initial verification task (
                  <code className="font-mono text-[10px]">
                    001-workspace-init
                  </code>
                  ) to test wave tracking.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3 border-t border-line bg-surface">
          <button
            type="button"
            onClick={closeModal}
            disabled={isSubmitting}
            className="px-3.5 py-1.5 rounded-lg border border-line text-xs font-medium text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleInitialize}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-accent-contrast text-xs font-medium hover:opacity-90 active:scale-95 transition-all shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Icon name="loader" size={13} className="animate-spin" />
                <span>Initializing...</span>
              </>
            ) : (
              <>
                <Icon name="zap" size={13} />
                <span>Initialize Workspace</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
