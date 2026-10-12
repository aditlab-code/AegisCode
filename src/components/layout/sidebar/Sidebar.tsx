import { useRef } from "react"
import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { ResizeSash } from "../../ui/ResizeSash"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  DEFAULT_SIDEBAR_WIDTH,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  COLLAPSE_SIDEBAR_THRESHOLD,
} from "../../../context/core/layoutCore"
import { ExplorerPanel } from "./ExplorerPanel"
import { SearchPanel } from "./SearchPanel"
import { SourceControlPanel } from "./SourceControlPanel"

export function Sidebar() {
  const {
    activeActivity,
    sidebarWidth,
    setSidebarWidth,
    resetSidebarWidth,
    setSidebarOpen,
    chatOpen,
    chatDrawerWidth,
  } = useWorkbenchStore(
    useShallow((s) => ({
      activeActivity: s.activeActivity,
      sidebarWidth: s.sidebarWidth,
      setSidebarWidth: s.setSidebarWidth,
      resetSidebarWidth: s.resetSidebarWidth,
      setSidebarOpen: s.setSidebarOpen,
      chatOpen: s.chatOpen,
      chatDrawerWidth: s.chatDrawerWidth,
    })),
  )

  const dragWidthRef = useRef<number>(sidebarWidth)

  return (
    <aside className="side-panel">
      <div className="panel-title">
        <span>{activeActivity}</span>
        <IconButton label={`More ${activeActivity} actions`}>
          <Icon name="more" />
        </IconButton>
      </div>

      {activeActivity === "Explorer" && <ExplorerPanel />}
      {activeActivity === "Search" && <SearchPanel />}
      {activeActivity === "Source Control" && <SourceControlPanel />}

      <ResizeSash
        className="sash-sidebar"
        direction="vertical"
        onDoubleClick={resetSidebarWidth}
        onResizeStart={() => {
          dragWidthRef.current = sidebarWidth
        }}
        onResize={(delta) => {
          dragWidthRef.current += delta
          if (dragWidthRef.current < COLLAPSE_SIDEBAR_THRESHOLD) {
            setSidebarOpen(false)
            setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
            return
          }
          const winWidth =
            typeof window !== "undefined" ? window.innerWidth : 1280
          const currentChat = chatOpen ? chatDrawerWidth : 0
          const maxPossible = Math.min(
            MAX_SIDEBAR_WIDTH,
            winWidth - currentChat - 44 - 320,
          )
          const clamped = Math.max(
            MIN_SIDEBAR_WIDTH,
            Math.min(maxPossible, dragWidthRef.current),
          )
          setSidebarWidth(clamped)
        }}
        title="Drag to resize sidebar (Double-click to reset)"
      />
    </aside>
  )
}
