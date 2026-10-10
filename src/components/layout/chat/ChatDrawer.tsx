import { useState } from "react"
import { ResizeSash } from "../../ui/ResizeSash"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { ChatHeader } from "./ChatHeader"
import { ChatMessageList } from "./ChatMessageList"
import { ChatComposer } from "./ChatComposer"
import { ChatSessionSidebar } from "./ChatSessionSidebar"

export function ChatDrawer() {
  const {
    sendChatMessage,
    chatSessionsOpen,
    setChatDrawerWidth,
    resetChatDrawerWidth,
    setChatOpen,
    sidebarOpen,
    sidebarWidth,
  } = useWorkbench()
  const [inputMessage, setInputMessage] = useState("")

  function handleSend() {
    if (!inputMessage.trim()) return
    sendChatMessage(inputMessage)
    setInputMessage("")
  }

  return (
    <aside className={`chat-drawer ${chatSessionsOpen ? "expanded" : ""}`}>
      <ResizeSash
        className="sash-chat"
        direction="vertical"
        onDoubleClick={resetChatDrawerWidth}
        onResize={(delta) => {
          setChatDrawerWidth((prev) => {
            const winWidth =
              typeof window !== "undefined" ? window.innerWidth : 1280
            const currentSidebar = sidebarOpen ? sidebarWidth : 0
            const maxPossible = Math.min(
              600,
              winWidth - currentSidebar - 44 - 320,
            )
            // Dragging leftwards (negative delta) expands drawer width
            const next = prev - delta
            if (next < 90) {
              setChatOpen(false)
              return 300
            }
            return Math.max(260, Math.min(maxPossible, next))
          })
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
