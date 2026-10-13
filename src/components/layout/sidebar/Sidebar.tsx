import { useCallback, useRef } from "react"
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
import { DebugView } from "../bottom-panel/DebugView"

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

  // Tracks live width during drag — no React state → zero re-renders during mousemove
  const dragWidthRef = useRef<number>(sidebarWidth)

  const handleSashResizeStart = useCallback(() => {
    dragWidthRef.current = useWorkbenchStore.getState().sidebarWidth
  }, [])

  // Mutate CSS var directly on .workspace DOM node (bypass React/Zustand during drag)
  const handleSashResize = useCallback(
    (delta: number) => {
      dragWidthRef.current += delta
      const workspace = document.querySelector<HTMLElement>(".workspace")
      if (!workspace) return
      if (dragWidthRef.current < COLLAPSE_SIDEBAR_THRESHOLD) {
        return // will collapse on mouseup
      }
      const winWidth = window.innerWidth
      const currentChat = chatOpen ? chatDrawerWidth : 0
      const maxPossible = Math.min(
        MAX_SIDEBAR_WIDTH,
        winWidth - currentChat - 44 - 320,
      )
      const clamped = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(maxPossible, dragWidthRef.current),
      )
      dragWidthRef.current = clamped
      workspace.style.setProperty("--sidebar-width", `${clamped}px`)
    },
    [chatOpen, chatDrawerWidth],
  )

  // On mouseup: single Zustand commit → one React reconciliation
  const handleSashResizeEnd = useCallback(() => {
    const w = dragWidthRef.current
    if (w < COLLAPSE_SIDEBAR_THRESHOLD) {
      const workspace = document.querySelector<HTMLElement>(".workspace")
      workspace?.style.setProperty(
        "--sidebar-width",
        `${DEFAULT_SIDEBAR_WIDTH}px`,
      )
      dragWidthRef.current = DEFAULT_SIDEBAR_WIDTH
      setSidebarOpen(false)
      setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)
    } else {
      setSidebarWidth(w)
    }
  }, [setSidebarOpen, setSidebarWidth])

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
      {activeActivity === "Debug" && <DebugView />}

      <ResizeSash
        className="sash-sidebar"
        direction="vertical"
        onDoubleClick={resetSidebarWidth}
        onResizeStart={handleSashResizeStart}
        onResize={handleSashResize}
        onResizeEnd={handleSashResizeEnd}
        title="Drag to resize sidebar (Double-click to reset)"
      />
    </aside>
  )
}
