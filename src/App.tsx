import { useEffect, useMemo } from "react"
import { WorkbenchProvider, useWorkbench } from "./context/WorkbenchContext"
import {
  Header,
  ActivityRail,
  Sidebar,
  Editor,
  BottomPanel,
  ChatDrawer,
  StatusBar,
  CommandPalette,
  SettingsModal,
  UnsavedChangesModal,
} from "./components/layout"
import { Toast } from "./components/ui/Toast"
import { syncBrowserAiContext } from "./utils/browserAiSync"

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
    group1,
    group2,
    focusedGroup,
    splitEditor,
    activeLanguage,
    fileBuffers,
    cursorPosition,
    diagnostics,
    settings,
  } = useWorkbench()

  const sidebarPosition = settings?.workbench?.sidebarPosition ?? "left"

  const activeFile =
    splitEditor && focusedGroup === "group2"
      ? group2.activeTab
      : group1.activeTab

  useEffect(() => {
    const buffer = activeFile ? fileBuffers[activeFile] : undefined
    const fileDiags = activeFile
      ? diagnostics.filter((d) => d.location.startsWith(activeFile))
      : []

    syncBrowserAiContext({
      activeFile: activeFile || null,
      language: activeLanguage,
      workspace: "AegisCodev2",
      cursor: cursorPosition,
      isDirty: Boolean(buffer?.isDirty),
      diagnosticsCount: fileDiags.length,
    })
  }, [activeFile, activeLanguage, cursorPosition, fileBuffers, diagnostics])

  const gridClass = useMemo(
    () =>
      `${chatOpen ? "workspace-chat-open" : "workspace-chat-closed"} ${
        sidebarOpen ? "" : "workspace-sidebar-closed"
      } ${chatOpen && chatSessionsOpen ? "workspace-chat-expanded" : ""}`,
    [chatOpen, chatSessionsOpen, sidebarOpen],
  )

  return (
    <div className="app-shell">
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
          {panelOpen && <BottomPanel />}
        </div>
        {chatOpen && <ChatDrawer />}
      </main>
      <StatusBar />
      <CommandPalette />
      <SettingsModal />
      <UnsavedChangesModal />
      <Toast message={toast} onDismiss={clearToast} />
    </div>
  )
}

export default function App() {
  return (
    <WorkbenchProvider>
      <AppShell />
    </WorkbenchProvider>
  )
}
