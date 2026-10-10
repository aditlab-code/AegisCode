import { useState } from "react";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";

interface EditorFindWidgetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EditorFindWidget({ isOpen, onClose }: EditorFindWidgetProps) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchWord, setMatchWord] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="absolute right-4 top-12 z-20 flex items-center gap-2 rounded border border-[var(--color-line)] bg-[var(--color-surface-raised)] p-1.5 shadow-lg">
      <div className="flex items-center gap-1.5 rounded bg-[var(--color-canvas)] px-2 py-1 border border-[var(--color-line)]">
        <Icon name="search" size={13} className="text-[var(--color-ink-soft)]" />
        <input
          autoFocus
          className="w-36 bg-transparent text-[11px] text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in editor..."
          value={query}
        />
        <button
          className={`px-1 py-0.5 text-[10px] rounded font-mono ${
            caseSensitive ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"
          }`}
          onClick={() => setCaseSensitive((v) => !v)}
          title="Match Case"
          type="button"
        >
          Aa
        </button>
        <button
          className={`px-1 py-0.5 text-[10px] rounded font-mono ${
            matchWord ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "text-[var(--color-ink-muted)]"
          }`}
          onClick={() => setMatchWord((v) => !v)}
          title="Match Whole Word"
          type="button"
        >
          \b
        </button>
      </div>
      <span className="text-[11px] text-[var(--color-ink-muted)]">
        {query ? "2 matches" : "No results"}
      </span>
      <IconButton label="Close find widget" onClick={onClose}>
        <Icon name="close" size={12} />
      </IconButton>
    </div>
  );
}
