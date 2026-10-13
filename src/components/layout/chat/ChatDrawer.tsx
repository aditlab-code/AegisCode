import { useCallback, useRef, useState } from "react"
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
