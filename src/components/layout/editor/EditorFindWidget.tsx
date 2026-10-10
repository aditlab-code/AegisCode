import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { useWorkbench } from "../../../context/WorkbenchContext"

interface EditorFindWidgetProps {
  isOpen: boolean
  onClose: () => void
  filename?: string
}

export function EditorFindWidget({
  isOpen,
  onClose,
  filename,
}: EditorFindWidgetProps) {
  const {
    activeTab,
    secondaryActiveTab,
    focusedPane,
    splitEditor,
    fileBuffers,
  } = useWorkbench()

  const [query, setQuery] = useState("")
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [matchWord, setMatchWord] = useState(false)

  if (!isOpen) return null

  const currentFile =
    filename ||
    (focusedPane === "secondary" && splitEditor
      ? secondaryActiveTab
      : activeTab)
  const content = fileBuffers[currentFile]?.content || ""

  let matchCount = 0
  if (query.trim()) {
    try {
      const pattern = matchWord ? `\\b${query}\\b` : query
      const flags = caseSensitive ? "g" : "gi"
      const regex = new RegExp(pattern, flags)
      const found = content.match(regex)
      matchCount = found ? found.length : 0
    } catch {
      matchCount = 0
    }
  }

  return (
    <div className="absolute right-4 top-12 z-20 flex items-center gap-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-1.5 shadow-lg">
      <div className="flex items-center gap-1.5 rounded bg-[var(--color-canvas)] px-2 py-1 border border-[var(--color-line)]">
        <Icon
          className="text-[var(--color-ink-soft)]"
          name="search"
          size={13}
        />
        <input
          autoFocus
          className="w-36 bg-transparent text-[11px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in editor..."
          value={query}
        />
        <button
          className={`px-1 py-0.5 text-[10px] rounded font-mono ${
            caseSensitive
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "text-[var(--color-ink-muted)]"
          }`}
          onClick={() => setCaseSensitive((v) => !v)}
          title="Match Case"
          type="button"
        >
          Aa
        </button>
        <button
          className={`px-1 py-0.5 text-[10px] rounded font-mono ${
            matchWord
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "text-[var(--color-ink-muted)]"
          }`}
          onClick={() => setMatchWord((v) => !v)}
          title="Match Whole Word"
          type="button"
        >
          \b
        </button>
      </div>
      <span className="text-[11px] text-[var(--color-ink-muted)]">
        {query
          ? `${matchCount} match${matchCount === 1 ? "" : "es"}`
          : "No results"}
      </span>
      <IconButton label="Close find widget" onClick={onClose}>
        <Icon name="close" size={12} />
      </IconButton>
    </div>
  )
}
