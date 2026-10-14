import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore } from "../../../store"
import type { IconName } from "../../../types/workbench"

interface EditorContextMenuProps {
  x: number
  y: number
  filename: string
  line: number
  selectedText?: string
  onClose: () => void
}

export function EditorContextMenu({
  x,
  y,
  filename,
  line,
  selectedText = "",
  onClose,
}: EditorContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent)

  const toggleBreakpoint = useWorkbenchStore((s) => s.toggleBreakpoint)
  const setChatOpen = useWorkbenchStore((s) => s.setChatOpen)
  const showToast = useWorkbenchStore((s) => s.showToast)

  // Keep menu within viewport bounds
  const adjustedX = Math.max(8, Math.min(x, window.innerWidth - 230))
  const adjustedY = Math.max(8, Math.min(y, window.innerHeight - 280))

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose()
      }
    }
    function handleScroll() {
      onClose()
    }

    window.addEventListener("mousedown", handlePointerDown)
    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("scroll", handleScroll, true)
    return () => {
      window.removeEventListener("mousedown", handlePointerDown)
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("scroll", handleScroll, true)
    }
  }, [onClose])

  function handleDefinition() {
    onClose()
    window.dispatchEvent(new CustomEvent("aegis:editor-definition"))
  }

  function handleFormat() {
    onClose()
    window.dispatchEvent(new CustomEvent("aegis:editor-format"))
  }

  function handleToggleBreakpoint() {
    onClose()
    if (filename && line > 0) {
      void toggleBreakpoint(filename, line)
    }
  }

  async function handleCopy() {
    onClose()
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText)
        showToast("Copied to clipboard")
      } catch {
        document.execCommand("copy")
      }
    }
  }

  async function handleCut() {
    onClose()
    if (selectedText) {
      try {
        await navigator.clipboard.writeText(selectedText)
        document.execCommand("cut")
      } catch {
        document.execCommand("cut")
      }
    }
  }

  function handleAskAi() {
    onClose()
    window.dispatchEvent(new CustomEvent("aegis:inline-ai-prompt"))
  }

  return createPortal(
    <div
      className="editor-context-menu"
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
    >
      <button
        className="context-menu-item"
        onClick={handleDefinition}
        type="button"
      >
        <Icon name="symbol" size={13} />
        <span>Go to Definition</span>
        <kbd className="context-menu-shortcut">F12</kbd>
      </button>

      <button
        className="context-menu-item"
        onClick={handleFormat}
        type="button"
      >
        <Icon name="edit" size={13} />
        <span>Format Document</span>
        <kbd className="context-menu-shortcut">
          {isMac ? "⇧⌥F" : "Shift+Alt+F"}
        </kbd>
      </button>

      <button
        className="context-menu-item"
        onClick={handleToggleBreakpoint}
        type="button"
      >
        <Icon name="debug" size={13} />
        <span>Toggle Breakpoint</span>
        <kbd className="context-menu-shortcut">F9</kbd>
      </button>

      <div className="context-menu-separator" />

      <button
        className="context-menu-item"
        disabled={!selectedText}
        onClick={handleCut}
        type="button"
      >
        <Icon name="edit" size={13} />
        <span>Cut</span>
        <kbd className="context-menu-shortcut">{isMac ? "⌘X" : "Ctrl+X"}</kbd>
      </button>

      <button
        className="context-menu-item"
        disabled={!selectedText}
        onClick={handleCopy}
        type="button"
      >
        <Icon name="copy" size={13} />
        <span>Copy</span>
        <kbd className="context-menu-shortcut">{isMac ? "⌘C" : "Ctrl+C"}</kbd>
      </button>

      <div className="context-menu-separator" />

      <button
        className="context-menu-item text-accent"
        onClick={handleAskAi}
        type="button"
      >
        <Icon name="sparkle" size={13} />
        <span className="font-medium">Ask AEGIS AI</span>
        <kbd className="context-menu-shortcut">{isMac ? "⌘L" : "Ctrl+L"}</kbd>
      </button>
    </div>,
    document.body,
  )
}
