import { useRef, useState, useCallback, useEffect } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { ChatProviderSelect } from "./ChatProviderSelect"
import {
  ChatCommandPopover,
  type PopoverType,
  type PopoverItem,
} from "./ChatCommandPopover"
import { SKILL_COMMANDS } from "../../../data/chatConstants"
import { useWorkbenchStore, useShallow } from "../../../store"

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
}

export function ChatComposer({ value, onChange, onSend }: ChatComposerProps) {
  const {
    files,
    contextItems,
    dismissContextItem,
    toggleContextItemMode,
    addMentionContext,
    activeProvider,
    settings,
    setSettingsModalOpen,
    showToast,
    isGenerating,
    stopGenerating,
    skills,
  } = useWorkbenchStore(
    useShallow((s) => ({
      files: s.files,
      contextItems: s.contextItems,
      dismissContextItem: s.dismissContextItem,
      toggleContextItemMode: s.toggleContextItemMode,
      addMentionContext: s.addMentionContext,
      activeProvider: s.activeProvider,
      settings: s.settings,
      setSettingsModalOpen: s.setSettingsModalOpen,
      showToast: s.showToast,
      isGenerating: s.isGenerating,
      stopGenerating: s.stopGenerating,
      skills: s.skills,
    })),
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeSkills = skills && skills.length > 0 ? skills : SKILL_COMMANDS

  const isProviderConfigured = useCallback(() => {
    if (!settings?.agent) return true
    if (activeProvider === "openrouter") {
      return Boolean(settings.agent.providerKeys?.openrouter?.trim())
    }
    if (activeProvider === "opencode") {
      return Boolean(settings.agent.providerKeys?.opencode?.trim())
    }
    return true
  }, [activeProvider, settings])

  const configured = isProviderConfigured()

  function handleSendWithCheck() {
    if (isGenerating) return
    if (!configured) {
      showToast(
        `Kredensial untuk ${activeProvider} belum diatur. Mengalihkan ke Settings...`,
      )
      setSettingsModalOpen(true)
      return
    }
    onSend()
  }

  const [popoverType, setPopoverType] = useState<PopoverType>(null)
  const [popoverQuery, setPopoverQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Calculate current matching items count for keyboard cycling
  const getItemsCount = useCallback(() => {
    if (!popoverType) return 0
    if (popoverType === "command") {
      const q = popoverQuery.toLowerCase()
      return activeSkills.filter(
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
  }, [popoverType, popoverQuery, files, activeSkills])

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
    (insertText: string, popoverItem?: PopoverItem) => {
      const textarea = textareaRef.current
      const cursorPos = textarea ? textarea.selectionStart : value.length
      const textBeforeCursor = value.slice(0, cursorPos)
      const match = textBeforeCursor.match(/(?:^|\s)([/@])([a-zA-Z0-9_\-./]*)$/)

      if (
        popoverItem &&
        !popoverItem.isFolder &&
        popoverType === "mention" &&
        addMentionContext
      ) {
        addMentionContext(popoverItem.path || popoverItem.id)
      }

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
    [value, onChange, popoverType, addMentionContext],
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
          const matched = activeSkills.filter(
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
            const item = matched[selectedIndex]
            const isFolder = item.icon === "folder"
            handleSelectToken(`@${item.label}${isFolder ? "/" : ""} `, {
              id: item.label,
              label: `@${item.label}`,
              detail: isFolder ? "Folder" : "File",
              icon: isFolder ? "folder" : "file",
              insertText: `@${item.label} `,
              path: item.path || item.label,
              isFolder,
            })
            return
          }
        }
      }
      if (event.key === "Escape") {
        event.preventDefault()
        if (popoverType) {
          setPopoverType(null)
        } else if (isGenerating) {
          stopGenerating()
        }
        return
      }
    }

    if (event.key === "Escape" && isGenerating) {
      event.preventDefault()
      stopGenerating()
      return
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!isGenerating) {
        handleSendWithCheck()
      }
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
        {contextItems && contextItems.length > 0 && (
          <div
            className="composer-context-chips"
            role="region"
            aria-label="Attached context chips"
          >
            {contextItems.map((item) => {
              const basename = item.path.split("/").pop() || item.path
              return (
                <div key={item.id} className="composer-context-chip">
                  <button
                    type="button"
                    className="composer-chip-toggle cursor-pointer"
                    onClick={() => toggleContextItemMode(item.id)}
                    title={`Click to switch context mode (Reference -> Snippet -> Full): ${item.path}`}
                  >
                    <Icon name="file" size={11} className="text-muted" />
                    <span className="composer-chip-filename">{basename}</span>
                    {item.lineRange ? (
                      <span className="composer-chip-range">
                        ({item.lineRange})
                      </span>
                    ) : item.mode === "reference" ? (
                      <span className="composer-chip-range font-medium text-accent">
                        (Ref)
                      </span>
                    ) : item.mode === "snippet" ? (
                      <span className="composer-chip-range font-medium text-accent">
                        (Snippet)
                      </span>
                    ) : item.mode === "selection" ? (
                      <span className="composer-chip-range">(Selection)</span>
                    ) : (
                      <span className="composer-chip-range">(Full)</span>
                    )}
                  </button>
                  <span
                    className="composer-chip-tokens"
                    title={`${item.charCount} characters`}
                  >
                    ~{item.estimatedTokens} tokens
                  </span>
                  {item.isTruncated && (
                    <span
                      className="composer-chip-truncated flex items-center gap-1"
                      title="File exceeded 50,000 characters and was truncated to protect token limits"
                    >
                      <Icon name="warning" size={10} />
                      <span>Truncated</span>
                    </span>
                  )}
                  <button
                    type="button"
                    className="composer-chip-dismiss"
                    onClick={() => dismissContextItem(item.id)}
                    title="Dismiss context"
                    aria-label={`Dismiss context ${basename}`}
                  >
                    <Icon name="close" size={10} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

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
            {!configured && (
              <button
                type="button"
                className="composer-setup-warning flex items-center gap-1"
                onClick={() => setSettingsModalOpen(true)}
                title="Click to configure credentials in Settings"
              >
                <Icon name="warning" size={11} />
                <span>Setup needed</span>
              </button>
            )}
            {contextItems && contextItems.length > 0 && (
              <span
                className="composer-context-summary"
                title={`${contextItems.length} context item(s) attached`}
              >
                <span className="status-dot" />
                <span>
                  {contextItems.length} context
                  {contextItems.length > 1 ? "s" : ""}
                </span>
              </span>
            )}
          </div>
          {isGenerating ? (
            <button
              type="button"
              className="composer-stop-btn"
              onClick={stopGenerating}
              title="Stop generating"
            >
              <span className="stop-square-icon" />
              <span>Stop</span>
            </button>
          ) : (
            <IconButton label="Send message" onClick={handleSendWithCheck}>
              <Icon name="send" size={15} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  )
}
