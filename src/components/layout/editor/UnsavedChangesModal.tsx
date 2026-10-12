import { useEffect, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"

export function UnsavedChangesModal() {
  const {
    confirmCloseFile,
    resolveConfirmCloseFile,
    confirmRevertFile,
    resolveConfirmRevert,
  } = useWorkbenchStore(
    useShallow((s) => ({
      confirmCloseFile: s.confirmCloseFile,
      resolveConfirmCloseFile: s.resolveConfirmCloseFile,
      confirmRevertFile: s.confirmRevertFile,
      resolveConfirmRevert: s.resolveConfirmRevert,
    })),
  )
  const primaryBtnRef = useRef<HTMLButtonElement>(null)

  const isOpen = Boolean(confirmCloseFile || confirmRevertFile)

  useEffect(() => {
    if (isOpen) {
      primaryBtnRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        e.stopPropagation()
        if (confirmRevertFile) {
          resolveConfirmRevert(false)
        } else if (confirmCloseFile) {
          resolveConfirmCloseFile("cancel")
        }
      } else if (e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        if (confirmRevertFile) {
          resolveConfirmRevert(true)
        } else if (confirmCloseFile) {
          resolveConfirmCloseFile("save")
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [
    isOpen,
    confirmCloseFile,
    confirmRevertFile,
    resolveConfirmCloseFile,
    resolveConfirmRevert,
  ])

  if (!isOpen) return null

  // Skenario Revert Konfirmasi
  if (confirmRevertFile) {
    const displayName = confirmRevertFile.split("/").pop() || confirmRevertFile
    return (
      <div
        aria-describedby="revert-changes-desc"
        aria-labelledby="revert-changes-title"
        aria-modal="true"
        className="unsaved-modal-backdrop"
        onClick={() => resolveConfirmRevert(false)}
        role="alertdialog"
      >
        <div
          className="unsaved-modal-dialog"
          onClick={(e) => e.stopPropagation()}
          role="document"
        >
          <div className="unsaved-modal-header">
            <span className="unsaved-modal-icon">
              <Icon name="warning" size={20} />
            </span>
            <div className="unsaved-modal-text">
              <h2 id="revert-changes-title" className="unsaved-modal-title">
                Discard unsaved changes in {displayName}?
              </h2>
              <p id="revert-changes-desc" className="unsaved-modal-desc">
                All unsaved changes will be permanently discarded. This action
                cannot be undone.
              </p>
            </div>
          </div>

          <div className="unsaved-modal-actions">
            <button
              className="unsaved-btn unsaved-btn-cancel"
              onClick={() => resolveConfirmRevert(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              ref={primaryBtnRef}
              className="unsaved-btn unsaved-btn-danger"
              onClick={() => resolveConfirmRevert(true)}
              type="button"
            >
              Discard Changes
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Skenario Close Tab Konfirmasi
  const filename = confirmCloseFile!.filename
  const displayName = filename.split("/").pop() || filename

  return (
    <div
      aria-describedby="unsaved-changes-desc"
      aria-labelledby="unsaved-changes-title"
      aria-modal="true"
      className="unsaved-modal-backdrop"
      onClick={() => resolveConfirmCloseFile("cancel")}
      role="alertdialog"
    >
      <div
        className="unsaved-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="unsaved-modal-header">
          <span className="unsaved-modal-icon">
            <Icon name="warning" size={20} />
          </span>
          <div className="unsaved-modal-text">
            <h2 id="unsaved-changes-title" className="unsaved-modal-title">
              Do you want to save the changes you made to {displayName}?
            </h2>
            <p id="unsaved-changes-desc" className="unsaved-modal-desc">
              Your changes will be lost if you don't save them.
            </p>
          </div>
        </div>

        <div className="unsaved-modal-actions">
          <button
            className="unsaved-btn unsaved-btn-cancel"
            onClick={() => resolveConfirmCloseFile("cancel")}
            type="button"
          >
            Cancel
          </button>
          <button
            className="unsaved-btn unsaved-btn-dontsave"
            onClick={() => resolveConfirmCloseFile("dont-save")}
            type="button"
          >
            Don't Save
          </button>
          <button
            ref={primaryBtnRef}
            className="unsaved-btn unsaved-btn-save"
            onClick={() => resolveConfirmCloseFile("save")}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
