import type { SliceCreator, DebugSlice } from "../types"
import type { DebugState } from "../../types/workbench"
import {
  startDebugSession,
  stepDebug,
  terminateDebugSession,
} from "../../utils/debugApi"
import { getTerminalRunCommand } from "../../utils/terminalRunCommand"

export { getTerminalRunCommand }

let toastTimer: ReturnType<typeof setTimeout> | null = null

export const createDebugSlice: SliceCreator<DebugSlice> = (set, get) => ({
  debugState: {
    active: false,
    status: "idle",
  },
  isDebugging: false,

  startDebugging: async (program?: string) => {
    const state = get()
    let target = program
    if (!target) {
      if (
        state.activeTab?.endsWith(".go") ||
        state.activeTab?.endsWith(".py") ||
        state.activeTab?.endsWith(".cpp") ||
        state.activeTab?.endsWith(".c")
      ) {
        target = state.activeTab
      } else {
        target = state.rootWorkspacePath || "."
      }
    }

    if (target && state.fileBuffers?.[target]?.isDirty) {
      await state.saveFile(target)
    }

    try {
      const lang = target.endsWith(".py")
        ? "python"
        : target.endsWith(".cpp") || target.endsWith(".c")
          ? "cpp"
          : target.endsWith(".go")
            ? "go"
            : undefined

      const res = await startDebugSession(
        target,
        undefined,
        undefined,
        get().rootWorkspacePath || undefined,
        get().breakpoints,
        lang,
      )
      if (res.status === "error") {
        if (res.code === "delve_not_found" || res.code === "dlv_not_found") {
          get().showToast(
            "Delve (dlv) not found. Run 'go install github.com/go-delve/delve/cmd/dlv@latest'",
          )
        } else if (res.code === "debugpy_not_found") {
          get().showToast(
            "debugpy not found. Run 'pip install debugpy' to enable Python debugging.",
          )
        } else {
          get().showToast(`Failed to start debugger: ${res.error}`)
        }
        return false
      }

      get().setPanelOpen(true)
      get().setActiveBottomTab("Debug")
      const newState: DebugState = res.state || {
        active: true,
        status: "running",
      }
      set({
        debugState: newState,
        isDebugging:
          newState.active ||
          newState.status === "running" ||
          newState.status === "stopped",
      })
      get().showToast("Debug session started")
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      get().showToast(`Debug start error: ${msg}`)
      return false
    }
  },

  stepDebugging: async (
    action: "continue" | "stepOver" | "stepIn" | "stepOut" | "pause",
  ) => {
    try {
      await stepDebug(action)
      if (action !== "pause") {
        const cur = get().debugState
        const newState: DebugState = { ...cur, status: "running" }
        set({
          debugState: newState,
          isDebugging:
            newState.active ||
            newState.status === "running" ||
            newState.status === "stopped",
        })
        get().setActiveDebugLine(null)
      }
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      get().showToast(`Step debug failed: ${msg}`)
      return false
    }
  },

  terminateDebugging: async () => {
    try {
      await terminateDebugSession()
      set({
        debugState: { active: false, status: "terminated" },
        isDebugging: false,
      })
      get().setActiveDebugLine(null)
      get().showToast("Debug session terminated")
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      get().showToast(`Terminate failed: ${msg}`)
      return false
    }
  },

  runFileInTerminal: async (file?: string) => {
    const target = file || get().activeTab
    if (!target) {
      get().showToast("No active file to run")
      return false
    }

    const cmd = getTerminalRunCommand(target)
    if (!cmd) {
      get().showToast(`No terminal runner configured for file: ${target}`)
      return false
    }

    if (get().fileBuffers?.[target]?.isDirty) {
      await get().saveFile(target)
    }

    get().setPanelOpen(true)
    get().setActiveBottomTab("Terminal")
    get().sendTerminalCommand(cmd)
    get().showToast(`Running in Terminal: ${cmd}`)
    return true
  },

  toast: "",

  showToast: (message: string) => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toast: message })
    if (typeof window !== "undefined") {
      toastTimer = setTimeout(() => {
        set({ toast: "" })
        toastTimer = null
      }, 2200)
    }
    get().addNotification(message)
  },

  clearToast: () => {
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }
    set({ toast: "" })
  },

  serverConnected: true,

  checkServerConnection: async () => {
    try {
      const res = await fetch("/api/v1/workspace/info", { method: "GET" })
      const connected = res.ok
      set({ serverConnected: connected })
      return connected
    } catch {
      set({ serverConnected: false })
      return false
    }
  },

  runAction: (action: string) => {
    const actionMessages: Record<string, string> = {
      "clear-terminal": "Terminal output cleared",
      find: `Find widget opened for ${get().activeTab}`,
      "new-file": "Untitled-1 created",
      "open-folder": "Folder picker ready",
      redo: "Nothing to redo",
      run: "Run session queued without debugging",
      "run-file": `Running ${get().activeTab}`,
      stop: "Active run session stopped",
      undo: "Last editor action reverted",
    }

    if (action === "commands") {
      get().setCommandPaletteOpen(true)
    } else if (action === "new-file") {
      const files = get().files || []
      let counter = 1
      while (
        files.some(
          (f) =>
            f.path === `Untitled-${counter}.txt` ||
            f.name === `Untitled-${counter}.txt`,
        )
      ) {
        counter++
      }
      const untitledName = `Untitled-${counter}.txt`
      void get().createFile(untitledName)
      get().showToast(`Created ${untitledName}`)
    } else if (action === "undo") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aegis:editor-undo"))
      }
    } else if (action === "redo") {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("aegis:editor-redo"))
      }
    } else if (action === "open-folder") {
      void get().openFolderPicker()
    } else if (action === "close-folder") {
      void get().closeRootFolder()
    } else if (action === "sidebar") {
      get().toggleSidebar()
    } else if (action === "panel" || action === "new-terminal") {
      get().togglePanel()
    } else if (action === "save") {
      void get().saveFile()
    } else if (action === "debug") {
      void get().startDebugging()
    } else if (
      action === "run-terminal" ||
      action === "run-file" ||
      action === "run"
    ) {
      void get().runFileInTerminal()
    } else {
      get().showToast(actionMessages[action] ?? "Command completed")
    }
  },
})
