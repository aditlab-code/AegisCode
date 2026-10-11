import { useRef, useState } from "react"
import { ResizeSash } from "../../ui/ResizeSash"
import { useWorkbench } from "../../../context/WorkbenchContext"
import {
  DEFAULT_CHAT_WIDTH,
  MIN_CHAT_WIDTH,
  MAX_CHAT_WIDTH,
  COLLAPSE_CHAT_THRESHOLD,
  DEFAULT_CHAT_EXPANDED_WIDTH,
  MIN_CHAT_EXPANDED_WIDTH,
  COLLAPSE_CHAT_EXPANDED_THRESHOLD,
} from "../../../context/core/layoutCore"
import { ChatHeader } from "./ChatHeader"
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
  } = useWorkbench()
  const [inputMessage, setInputMessage] = useState("")
  const dragWidthRef = useRef<number>(chatDrawerWidth)

  function handleSend() {
    if (!inputMessage.trim()) return
    sendChatMessage(inputMessage)
    setInputMessage("")
  }

  const minWidth = chatSessionsOpen ? MIN_CHAT_EXPANDED_WIDTH : MIN_CHAT_WIDTH
  const collapseThreshold = chatSessionsOpen
    ? COLLAPSE_CHAT_EXPANDED_THRESHOLD
    : COLLAPSE_CHAT_THRESHOLD
  const defaultWidth = chatSessionsOpen
    ? DEFAULT_CHAT_EXPANDED_WIDTH
    : DEFAULT_CHAT_WIDTH

  return (
    <aside className={`chat-drawer ${chatSessionsOpen ? "expanded" : ""}`}>
      <ResizeSash
        className="sash-chat"
        direction="vertical"
        onDoubleClick={resetChatDrawerWidth}
        onResizeStart={() => {
          dragWidthRef.current = chatDrawerWidth
        }}
        onResize={(delta) => {
          // Dragging leftwards (negative delta) expands drawer width
          dragWidthRef.current -= delta
          if (dragWidthRef.current < collapseThreshold) {
            setChatOpen(false)
            setChatDrawerWidth(defaultWidth)
            return
          }
          const winWidth =
            typeof window !== "undefined" ? window.innerWidth : 1280
          const currentSidebar = sidebarOpen ? sidebarWidth : 0
          const maxPossible = Math.min(
            MAX_CHAT_WIDTH,
            winWidth - currentSidebar - 44 - 320,
          )
          const clamped = Math.max(
            minWidth,
            Math.min(maxPossible, dragWidthRef.current),
          )
          setChatDrawerWidth(clamped)
        }}
        title="Drag to resize chat drawer (Double-click to reset)"
      />
      {chatSessionsOpen && <ChatSessionSidebar />}
      <div className="chat-main-pane">
        <ChatHeader />
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
