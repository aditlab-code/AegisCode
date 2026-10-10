import { Icon } from "../../ui/Icon"
import { IconButton } from "../../ui/IconButton"
import { ResizeSash } from "../../ui/ResizeSash"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { ExplorerPanel } from "./ExplorerPanel"
import { SearchPanel } from "./SearchPanel"
import { SourceControlPanel } from "./SourceControlPanel"

export function Sidebar() {
  const {
    activeActivity,
    setSidebarWidth,
    resetSidebarWidth,
    setSidebarOpen,
    chatOpen,
    chatDrawerWidth,
  } = useWorkbench()

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
        onResize={(delta) => {
          setSidebarWidth((prev) => {
            const winWidth =
              typeof window !== "undefined" ? window.innerWidth : 1280
            const currentChat = chatOpen ? chatDrawerWidth : 0
            const maxPossible = Math.min(460, winWidth - currentChat - 44 - 320)
            const next = prev + delta
            if (next < 90) {
              setSidebarOpen(false)
              return 220
            }
            return Math.max(160, Math.min(maxPossible, next))
          })
        }}
        title="Drag to resize sidebar (Double-click to reset)"
      />
    </aside>
  )
}
