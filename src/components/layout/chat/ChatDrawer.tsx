import { useState } from "react"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { ChatHeader } from "./ChatHeader"
import { ChatMessageList } from "./ChatMessageList"
import { ChatComposer } from "./ChatComposer"
import { ChatSessionSidebar } from "./ChatSessionSidebar"

export function ChatDrawer() {
  const { sendChatMessage, chatSessionsOpen } = useWorkbench()
  const [inputMessage, setInputMessage] = useState("")

  function handleSend() {
    if (!inputMessage.trim()) return
    sendChatMessage(inputMessage)
    setInputMessage("")
  }

  return (
    <aside className={`chat-drawer ${chatSessionsOpen ? "expanded" : ""}`}>
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
