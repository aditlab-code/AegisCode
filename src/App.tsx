import { useMemo } from "react";
import { WorkbenchProvider, useWorkbench } from "./context/WorkbenchContext";
import {
  Header,
  ActivityRail,
  Sidebar,
  Editor,
  BottomPanel,
  ChatDrawer,
  StatusBar,
  CommandPalette,
} from "./components/layout";
import { Toast } from "./components/ui/Toast";

function AppShell() {
  const { chatOpen, sidebarOpen, panelOpen, toast, clearToast } = useWorkbench();

  const gridClass = useMemo(
    () =>
      `${chatOpen ? "workspace-chat-open" : "workspace-chat-closed"} ${
        sidebarOpen ? "" : "workspace-sidebar-closed"
      }`,
    [chatOpen, sidebarOpen]
  );

  return (
    <div className="app-shell">
      <Header />
      <main className={`workspace ${gridClass}`}>
        <ActivityRail />
        {sidebarOpen && <Sidebar />}
        <div className={`workbench ${panelOpen ? "" : "workbench-panel-closed"}`}>
          <Editor />
          {panelOpen && <BottomPanel />}
        </div>
        {chatOpen && <ChatDrawer />}
      </main>
      <StatusBar />
      <CommandPalette />
      <Toast message={toast} onDismiss={clearToast} />
    </div>
  );
}

export default function App() {
  return (
    <WorkbenchProvider>
      <AppShell />
    </WorkbenchProvider>
  );
}
