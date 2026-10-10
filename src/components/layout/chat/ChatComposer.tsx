import { useRef, useState, useCallback, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { ChatProviderSelect } from "./ChatProviderSelect"
import { ChatCommandPopover, type PopoverType } from "./ChatCommandPopover"
import { SKILL_COMMANDS } from "../../../data/chatConstants"
import { useWorkbench } from "../../../context/WorkbenchContext"

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
}

export function ChatComposer({ value, onChange, onSend }: ChatComposerProps) {
  const { files, activeTab, setActiveTab } = useWorkbench()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [popoverType, setPopoverType] = useState<PopoverType>(null)
  const [popoverQuery, setPopoverQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Calculate current matching items count for keyboard cycling
  const getItemsCount = useCallback(() => {
    if (!popoverType) return 0
    if (popoverType === "command") {
      const q = popoverQuery.toLowerCase()
      return SKILL_COMMANDS.filter(
        (s) =>
          s.command.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      ).length
    }
    if (popoverType === "mention") {
      const q = popoverQuery.toLowerCase()
      return files.filter((f) => f.label.toLowerCase().includes(q)).length
    }
    return 0
  }, [popoverType, popoverQuery, files])

  const checkTrigger = useCallback((text: string, cursorPos: number) => {
    const textBeforeCursor = text.slice(0, cursorPos)
    const match = textBeforeCursor.match(/(?:^|\s)([/@])([a-zA-Z0-9_\-./]*)$/)

    if (match) {
      const triggerChar = match[1]
      const query = match[2]
      setPopoverType(triggerChar === "/" ? "command" : "mention")
      setPopoverQuery(query)
      setSelectedIndex(0)
    } else {
      setPopoverType(null)
      setPopoverQuery("")
    }
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextVal = e.target.value
    const nextCursor = e.target.selectionStart ?? nextVal.length
    onChange(nextVal)
    checkTrigger(nextVal, nextCursor)
  }

  const handleSelectToken = useCallback(
    (insertText: string) => {
      const textarea = textareaRef.current
      const cursorPos = textarea ? textarea.selectionStart : value.length
      const textBeforeCursor = value.slice(0, cursorPos)
      const match = textBeforeCursor.match(/(?:^|\s)([/@])([a-zA-Z0-9_\-./]*)$/)

      if (match) {
        const fullMatch = match[0]
        const leadingSpace =
          fullMatch.startsWith(" ") || fullMatch.startsWith("\n") ? 1 : 0
        const triggerIndex =
          textBeforeCursor.lastIndexOf(fullMatch) + leadingSpace
        const newValue =
          value.slice(0, triggerIndex) + insertText + value.slice(cursorPos)
        onChange(newValue)

        const newCursorPos = triggerIndex + insertText.length
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
          }
        }, 0)
      } else {
        onChange(value + insertText)
      }

      setPopoverType(null)
      setPopoverQuery("")
    },
    [value, onChange],
  )

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const itemsCount = getItemsCount()

    if (popoverType && itemsCount > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % itemsCount)
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + itemsCount) % itemsCount)
        return
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault()
        // Get the active item insertText
        if (popoverType === "command") {
          const q = popoverQuery.toLowerCase()
          const matched = SKILL_COMMANDS.filter(
            (s) =>
              s.command.toLowerCase().includes(q) ||
              s.name.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q),
          )
          if (matched[selectedIndex]) {
            handleSelectToken(`${matched[selectedIndex].command} `)
            return
          }
        } else if (popoverType === "mention") {
          const q = popoverQuery.toLowerCase()
          const matched = files.filter((f) => f.label.toLowerCase().includes(q))
          if (matched[selectedIndex]) {
            const isFolder = matched[selectedIndex].icon === "folder"
            handleSelectToken(
              `@${matched[selectedIndex].label}${isFolder ? "/" : ""} `,
            )
            return
          }
        }
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setPopoverType(null)
        return
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      onSend()
      setPopoverType(null)
    }
  }

  // Close popover if user clicks outside
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setPopoverType(null)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [])

  return (
    <div className="composer-wrapper">
      {popoverType && (
        <ChatCommandPopover
          type={popoverType}
          query={popoverQuery}
          selectedIndex={selectedIndex}
          setSelectedIndex={setSelectedIndex}
          onSelect={handleSelectToken}
          onClose={() => setPopoverType(null)}
        />
      )}

      <div className="composer">
        <textarea
          ref={textareaRef}
          aria-label="Message AEGIS"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => {
            const pos =
              (e.target as HTMLTextAreaElement).selectionStart ?? value.length
            checkTrigger(value, pos)
          }}
          placeholder="Ask AEGIS, type / for skills, @ for files..."
          rows={3}
          value={value}
        />
        <div className="composer-footer">
          <div className="composer-footer-left">
            <ChatProviderSelect />
            {activeTab && (
              <button
                type="button"
                className="composer-context-pill"
                onClick={() => setActiveTab(activeTab)}
                title={`Active in context: ${activeTab}`}
              >
                <span className="status-dot" />
                <span className="composer-context-name">{activeTab}</span>
              </button>
            )}
          </div>
          <IconButton label="Send message" onClick={onSend}>
            <Icon name="send" size={15} />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
