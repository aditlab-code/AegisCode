import { useEffect, useState } from "react"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { SKILL_COMMANDS } from "../../../data/chatConstants"
import { Icon } from "../../ui/Icon"

export type PopoverType = "command" | "mention" | null

interface PopoverItem {
  id: string
  label: string
  detail: string
  icon: "code" | "file" | "folder"
  insertText: string
}

interface ChatCommandPopoverProps {
  type: PopoverType
  query: string
  onSelect: (insertText: string) => void
  onClose: () => void
  selectedIndex: number
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>
}

export function ChatCommandPopover({
  type,
  query,
  onSelect,
  selectedIndex,
  setSelectedIndex,
}: ChatCommandPopoverProps) {
  const { files, skills } = useWorkbench()
  const activeSkills = skills && skills.length > 0 ? skills : SKILL_COMMANDS

  const items: PopoverItem[] = []

  if (type === "command") {
    const q = query.toLowerCase()
    activeSkills
      .filter(
        (s) =>
          s.command.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
      .forEach((s) => {
        items.push({
          id: s.command,
          label: s.command,
          detail: `${s.name} · ${s.description}`,
          icon: "code",
          insertText: `${s.command} `,
        })
      })
  } else if (type === "mention") {
    const q = query.toLowerCase()
    files
      .filter((f) => f.label.toLowerCase().includes(q))
      .forEach((f) => {
        const isFolder = f.icon === "folder"
        const token = `@${f.label}${isFolder ? "/" : ""}`
        items.push({
          id: f.label,
          label: token,
          detail: isFolder ? "Folder context" : "File context",
          icon: isFolder ? "folder" : "file",
          insertText: `${token} `,
        })
      })
  }

  useEffect(() => {
    setSelectedIndex(0)
  }, [items.length, setSelectedIndex])

  if (!type || items.length === 0) {
    return null
  }

  return (
    <div className="command-popover" role="listbox">
      <div className="command-popover-header">
        <span>
          {type === "command" ? "Agent Skills (/)" : "Files & Folders (@)"}
        </span>
        <span className="command-popover-count">{items.length} items</span>
      </div>

      <div className="command-popover-list">
        {items.map((item, idx) => {
          const isSelected = idx === selectedIndex
          return (
            <div
              key={item.id}
              className={`command-popover-item ${isSelected ? "selected" : ""}`}
              onClick={() => onSelect(item.insertText)}
              onMouseEnter={() => setSelectedIndex(idx)}
              role="option"
              aria-selected={isSelected}
            >
              <span className={`command-item-icon ${item.icon}`}>
                <Icon name={item.icon} size={13} />
              </span>
              <div className="command-item-text">
                <span className="command-item-label">{item.label}</span>
                <span className="command-item-detail">{item.detail}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
