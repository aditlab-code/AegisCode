import { useEffect, useMemo, useRef } from "react"
import { WorkbenchProvider } from "./context/WorkbenchContext"
import { useWorkbenchStore, useShallow } from "./store"
import {
  Header,
  ActivityRail,
  Sidebar,
  Editor,
  BottomPanel,
  ChatDrawer,
  StatusBar,
  SettingsModal,
  UnsavedChangesModal,
} from "./components/layout"
import { Toast } from "./components/ui/Toast"
import { FolderBrowserModal } from "./components/layout/settings/FolderBrowserModal"
import { syncBrowserAiContext } from "./utils/browserAiSync"

function BrowserAiSyncEffect() {
  const activeFile = useWorkbenchStore((s) =>
    s.splitEditor && s.focusedGroup === "group2"
      ? s.group2.activeTab
      : s.group1.activeTab,
  )
  const activeLanguage = useWorkbenchStore((s) => s.activeLanguage)
  const rootWorkspaceName = useWorkbenchStore((s) => s.rootWorkspaceName)
  const cursorPosition = useWorkbenchStore((s) => s.cursorPosition)
  const isDirty = useWorkbenchStore((s) =>
    activeFile ? Boolean(s.fileBuffers[activeFile]?.isDirty) : false,
  )
  const diagnosticsCount = useWorkbenchStore((s) =>
    activeFile
      ? s.diagnostics.filter((d) => d.location.startsWith(activeFile)).length
      : 0,
  )

  const prevFileRef = useRef<string | null>(null)

  useEffect(() => {
    const currentFile = activeFile || null
    const isFileSwitch = prevFileRef.current !== currentFile
    prevFileRef.current = currentFile

    const doSync = () => {
      syncBrowserAiContext({
        activeFile: currentFile,
        language: activeLanguage,
        workspace: rootWorkspaceName || "AegisCode",
        cursor: cursorPosition,
        isDirty,
        diagnosticsCount,
      })
    }

    if (isFileSwitch) {
      doSync()
      return
    }

    const timer = setTimeout(doSync, 150)
    return () => clearTimeout(timer)
  }, [
    activeFile,
    activeLanguage,
    rootWorkspaceName,
    cursorPosition,
    isDirty,
    diagnosticsCount,
  ])

  return null
}

function AppShell() {
  const {
    chatOpen,
    chatSessionsOpen,
    sidebarOpen,
    panelOpen,
    panelMaximized,
    sidebarWidth,
    chatDrawerWidth,
    bottomPanelHeight,
    toast,
    clearToast,
    settings,
  } = useWorkbenchStore(
    useShallow((s) => ({
      chatOpen: s.chatOpen,
      chatSessionsOpen: s.chatSessionsOpen,
      sidebarOpen: s.sidebarOpen,
      panelOpen: s.panelOpen,
      panelMaximized: s.panelMaximized,
      sidebarWidth: s.sidebarWidth,
      chatDrawerWidth: s.chatDrawerWidth,
      bottomPanelHeight: s.bottomPanelHeight,
      toast: s.toast,
      clearToast: s.clearToast,
      settings: s.settings,
    })),
  )

  const sidebarPosition = settings?.workbench?.sidebarPosition ?? "left"

  const gridClass = useMemo(
    () =>
      `${chatOpen ? "workspace-chat-open" : "workspace-chat-closed"} ${
        sidebarOpen ? "" : "workspace-sidebar-closed"
      } ${chatOpen && chatSessionsOpen ? "workspace-chat-expanded" : ""}`,
    [chatOpen, chatSessionsOpen, sidebarOpen],
  )

  return (
    <div className="app-shell">
      <BrowserAiSyncEffect />
      <Header />
      <main
        className={`workspace ${gridClass} ${
          sidebarPosition === "right" ? "workspace-sidebar-right" : ""
        }`}
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
            "--chat-width": `${chatDrawerWidth}px`,
          } as React.CSSProperties
        }
      >
        <ActivityRail />
        {sidebarOpen && <Sidebar />}
        <div
          className={`workbench ${panelOpen ? "" : "workbench-panel-closed"} ${
            panelOpen && panelMaximized ? "workbench-panel-maximized" : ""
          }`}
          style={
            {
              "--bottom-height": `${bottomPanelHeight}px`,
            } as React.CSSProperties
          }
        >
          <Editor />
          <BottomPanel />
        </div>
        {chatOpen && <ChatDrawer />}
      </main>
      <StatusBar />
      <SettingsModal />
      <FolderBrowserModal />
      <UnsavedChangesModal />
      {toast && <Toast message={toast} onDismiss={clearToast} />}
    </div>
  )
}

export function App() {
  return (
    <WorkbenchProvider>
      <AppShell />
    </WorkbenchProvider>
  )
}
export default App
