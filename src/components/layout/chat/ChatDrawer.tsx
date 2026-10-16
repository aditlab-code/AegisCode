import { useCallback, useRef, useState } from "react"
import { Icon } from "../../ui/Icon"
import { ResizeSash } from "../../ui/ResizeSash"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  DEFAULT_CHAT_WIDTH,
  MIN_CHAT_WIDTH,
  MAX_CHAT_WIDTH,
  COLLAPSE_CHAT_THRESHOLD,
  DEFAULT_CHAT_EXPANDED_WIDTH,
  MIN_CHAT_EXPANDED_WIDTH,
  COLLAPSE_CHAT_EXPANDED_THRESHOLD,
} from "../../../store/slices/createLayoutSlice"
import { ChatHeader } from "./ChatHeader"
import { ChatWaveStepper } from "./ChatWaveStepper"
import { ChatMessageList } from "./ChatMessageList"
import { ChatComposer } from "./ChatComposer"
import { ChatSessionSidebar } from "./ChatSessionSidebar"

export function ChatDrawer() {
  const {
    sendChatMessage,
    chatSessionsOpen,
    chatDrawerWidth,
    setChatDrawerWidth,
    resetChatDrawerWidth,
    setChatOpen,
    sidebarOpen,
    sidebarWidth,
    aiTrace,
    splitEditor,
    toggleSplitEditor,
    openFileInGroup,
  } = useWorkbenchStore(
    useShallow((s) => ({
      sendChatMessage: s.sendChatMessage,
      chatSessionsOpen: s.chatSessionsOpen,
      chatDrawerWidth: s.chatDrawerWidth,
      setChatDrawerWidth: s.setChatDrawerWidth,
      resetChatDrawerWidth: s.resetChatDrawerWidth,
      setChatOpen: s.setChatOpen,
      sidebarOpen: s.sidebarOpen,
      sidebarWidth: s.sidebarWidth,
      aiTrace: s.aiTrace,
      splitEditor: s.splitEditor,
      toggleSplitEditor: s.toggleSplitEditor,
      openFileInGroup: s.openFileInGroup,
    })),
  )
  const [inputMessage, setInputMessage] = useState("")

  // Tracks live width during drag — no React state → zero re-renders during mousemove
  const dragWidthRef = useRef<number>(chatDrawerWidth)

  const minWidth = chatSessionsOpen ? MIN_CHAT_EXPANDED_WIDTH : MIN_CHAT_WIDTH
  const collapseThreshold = chatSessionsOpen
    ? COLLAPSE_CHAT_EXPANDED_THRESHOLD
    : COLLAPSE_CHAT_THRESHOLD
  const defaultWidth = chatSessionsOpen
    ? DEFAULT_CHAT_EXPANDED_WIDTH
    : DEFAULT_CHAT_WIDTH

  function handleSend() {
    if (!inputMessage.trim()) return
    sendChatMessage(inputMessage)
    setInputMessage("")
  }

  const handleSashResizeStart = useCallback(() => {
    dragWidthRef.current = useWorkbenchStore.getState().chatDrawerWidth
  }, [])

  // Mutate CSS var directly on .workspace DOM node (bypass React/Zustand during drag)
  const handleSashResize = useCallback(
    (delta: number) => {
      // Dragging leftwards (negative delta) expands drawer width
      dragWidthRef.current -= delta
      const workspace = document.querySelector<HTMLElement>(".workspace")
      if (!workspace) return
      if (dragWidthRef.current < collapseThreshold) {
        return // will collapse on mouseup
      }
      const winWidth = window.innerWidth
      const currentSidebar = sidebarOpen ? sidebarWidth : 0
      const maxPossible = Math.min(
        MAX_CHAT_WIDTH,
        winWidth - currentSidebar - 44 - 320,
      )
      const clamped = Math.max(
        minWidth,
        Math.min(maxPossible, dragWidthRef.current),
      )
      dragWidthRef.current = clamped
      workspace.style.setProperty("--chat-width", `${clamped}px`)
    },
    [collapseThreshold, minWidth, sidebarOpen, sidebarWidth],
  )

  // On mouseup: single Zustand commit → one React reconciliation
  const handleSashResizeEnd = useCallback(() => {
    const w = dragWidthRef.current
    if (w < collapseThreshold) {
      const workspace = document.querySelector<HTMLElement>(".workspace")
      workspace?.style.setProperty("--chat-width", `${defaultWidth}px`)
      dragWidthRef.current = defaultWidth
      setChatOpen(false)
      setChatDrawerWidth(defaultWidth)
    } else {
      setChatDrawerWidth(w)
    }
  }, [collapseThreshold, defaultWidth, setChatOpen, setChatDrawerWidth])

  return (
    <aside className={`chat-drawer ${chatSessionsOpen ? "expanded" : ""}`}>
      <ResizeSash
        className="sash-chat"
        direction="vertical"
        onDoubleClick={resetChatDrawerWidth}
        onResizeStart={handleSashResizeStart}
        onResize={handleSashResize}
        onResizeEnd={handleSashResizeEnd}
        title="Drag to resize chat drawer (Double-click to reset)"
      />
      {chatSessionsOpen && <ChatSessionSidebar />}
      <div className="chat-main-pane">
        <ChatHeader />
        <ChatWaveStepper />
        {aiTrace && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-accent/10 border-b border-accent/30 text-[11px] select-none">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  aiTrace.status === "completed"
                    ? "bg-emerald-500"
                    : aiTrace.status === "error"
                      ? "bg-red-500"
                      : "bg-pink-500 animate-ping"
                }`}
              />
              <span className="font-mono uppercase text-[9px] px-1 py-0.2 rounded bg-surface border border-line text-accent shrink-0">
                {aiTrace.provider}
              </span>
              <span className="text-ink-muted font-mono text-[10px] shrink-0">
                {aiTrace.toolName}:
              </span>
              <strong
                className="font-mono text-ink truncate"
                title={aiTrace.symbols.join(", ")}
              >
                {aiTrace.symbols.join(", ")}
              </strong>
            </div>
            <button
              className="shrink-0 px-2 py-0.5 rounded bg-accent text-accent-contrast text-[10px] font-medium hover:opacity-90 cursor-pointer flex items-center gap-1"
              onClick={() => {
                if (!splitEditor) toggleSplitEditor()
                openFileInGroup("codegraph:workspace", "group2")
              }}
              title="Open CodeGraph in Split Dock (group2)"
              type="button"
            >
              <Icon name="zap" size={10} />
              <span>Inspect in Graph</span>
            </button>
          </div>
        )}
        <ChatMessageList />
        <ChatComposer
          onChange={setInputMessage}
          onSend={handleSend}
          value={inputMessage}
        />
      </div>
    </aside>
  )
}
