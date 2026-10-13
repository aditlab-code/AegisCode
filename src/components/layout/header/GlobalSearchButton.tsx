import { useRef, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import { CommandPalette } from "../command-palette/CommandPalette"

export function GlobalSearchButton() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    commandPaletteQuery,
    setCommandPaletteQuery,
    rootWorkspaceName,
  } = useWorkbenchStore(
    useShallow((s) => ({
      commandPaletteOpen: s.commandPaletteOpen,
      setCommandPaletteOpen: s.setCommandPaletteOpen,
      commandPaletteQuery: s.commandPaletteQuery,
      setCommandPaletteQuery: s.setCommandPaletteQuery,
      rootWorkspaceName: s.rootWorkspaceName,
    })),
  )

  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!commandPaletteOpen) return

    function handlePointerDown(e: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setCommandPaletteOpen(false)
        setCommandPaletteQuery("")
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [commandPaletteOpen, setCommandPaletteOpen, setCommandPaletteQuery])

  function handleClose() {
    setCommandPaletteOpen(false)
    setCommandPaletteQuery("")
  }

  return (
    <div className="header-search-container" ref={containerRef}>
      {commandPaletteOpen ? (
        <div className="command-search command-search-active">
          <Icon name="search" size={14} />
          <input
            autoFocus
            className="command-search-input"
            onChange={(event) => setCommandPaletteQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault()
                handleClose()
              }
            }}
            placeholder={
              commandPaletteQuery.startsWith(">")
                ? "Type a command..."
                : commandPaletteQuery.startsWith(":")
                  ? "Type a line number to navigate to..."
                  : "Search files by name (type > for commands, : for line)..."
            }
            value={commandPaletteQuery}
          />
          <kbd
            className="cursor-pointer hover:text-ink"
            onClick={handleClose}
            title="Close (Esc)"
          >
            Esc
          </kbd>
        </div>
      ) : (
        <button
          aria-expanded={false}
          aria-haspopup="dialog"
          className="command-search"
          onClick={() => {
            setCommandPaletteQuery("")
            setCommandPaletteOpen(true)
          }}
          title={
            rootWorkspaceName
              ? `Active Workspace: ${rootWorkspaceName}`
              : undefined
          }
          type="button"
        >
          <Icon name="search" size={14} />
          <span className="truncate">
            {rootWorkspaceName ? (
              <>
                <strong className="font-semibold text-ink mr-1">
                  {rootWorkspaceName}
                </strong>
                <span className="text-ink-muted">— Search...</span>
              </>
            ) : (
              "Search files, commands (>), symbols..."
            )}
          </span>
          <kbd>{isMac ? "⌘ P" : "Ctrl P"}</kbd>
        </button>
      )}

      {commandPaletteOpen && <CommandPalette />}
    </div>
  )
}
