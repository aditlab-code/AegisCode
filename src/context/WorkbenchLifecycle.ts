import { useEffect, useRef } from "react"
import { useWorkbenchStore } from "../store"
import { connectDebugSSE } from "../utils/debugApi"
import { normalizeWorkspacePath } from "../utils/workspaceApi"
import { isLspLanguage, validateSyntax } from "../utils/linter"

export function useWorkbenchLifecycle() {
  const store = useWorkbenchStore

  // 1. Server connection health check
  useEffect(() => {
    store.getState().checkServerConnection()
    const timer = setInterval(() => {
      store.getState().checkServerConnection()
    }, 20000)
    return () => clearInterval(timer)
  }, [store])

  // 2. DAP Debugger SSE listener
  useEffect(() => {
    if (typeof window === "undefined") return
    const disconnect = connectDebugSSE(
      (event) => {
        const s = store.getState()
        if (event.state) {
          s.debugState = event.state
          useWorkbenchStore.setState({
            debugState: event.state,
            isDebugging:
              event.state.active ||
              event.state.status === "running" ||
              event.state.status === "stopped",
          })
          if (event.state.currentFile && event.state.currentLine) {
            const clean = normalizeWorkspacePath(
              event.state.currentFile,
              s.rootWorkspacePath,
            )
            const targetFile = clean || event.state.currentFile
            s.setActiveDebugLine({
              file: targetFile,
              line: event.state.currentLine,
            })
            s.openFileInPane(targetFile)
          } else if (event.state.status === "running") {
            s.setActiveDebugLine(null)
          }
        } else if (event.type === "debug:stopped") {
          if (event.currentFile && event.currentLine) {
            const clean = normalizeWorkspacePath(
              event.currentFile,
              s.rootWorkspacePath,
            )
            const targetFile = clean || event.currentFile
            s.setActiveDebugLine({
              file: targetFile,
              line: event.currentLine,
            })
            s.openFileInPane(targetFile)
          }
        } else if (event.type === "debug:continued") {
          s.setActiveDebugLine(null)
        } else if (event.type === "debug:terminated") {
          s.setActiveDebugLine(null)
          useWorkbenchStore.setState({
            debugState: { active: false, status: "terminated" },
            isDebugging: false,
          })
        }
      },
      () => {},
    )
    return () => {
      disconnect()
    }
  }, [store])

  // 3. Desktop responsive viewport observer
  useEffect(() => {
    if (typeof window === "undefined") return

    function handleResize() {
      const winWidth = window.innerWidth
      const s = store.getState()
      if (winWidth < 980) {
        if (s.chatOpen) s.setChatOpen(false)
        if (s.sidebarOpen && winWidth < 768) s.setSidebarOpen(false)
      } else if (winWidth < 1200) {
        const currentSidebar = s.sidebarOpen ? s.sidebarWidth : 0
        const currentChat = s.chatOpen ? s.chatDrawerWidth : 0
        const availableForEditor = winWidth - 44 - currentSidebar - currentChat
        if (availableForEditor < 320 && s.chatOpen) {
          if (s.chatSessionsOpen) {
            s.setChatSessionsOpen(false)
            s.setChatDrawerWidth(340)
          } else {
            const maxChatPossible = winWidth - 44 - currentSidebar - 320
            if (maxChatPossible < 300) {
              s.setChatOpen(false)
            } else {
              s.setChatDrawerWidth(Math.floor(maxChatPossible))
            }
          }
        }
      }
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [store])

  // 4. Auto-save: afterDelay
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    return store.subscribe((state) => {
      const { autoSave, autoSaveDelay } = state.settings.files
      if (autoSave !== "afterDelay") return

      const dirtyFiles = Object.entries(state.fileBuffers)
        .filter(([_, buf]) => buf.isDirty)
        .map(([filename]) => filename)

      if (dirtyFiles.length === 0) return

      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }

      autoSaveTimerRef.current = setTimeout(
        async () => {
          for (const file of dirtyFiles) {
            await store.getState().saveFile(file)
          }
        },
        Math.max(300, autoSaveDelay || 1000),
      )
    })
  }, [store])

  // 5. Auto-save: onFocusChange
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleWindowBlur = () => {
      const state = store.getState()
      if (state.settings.files.autoSave !== "onFocusChange") return

      const dirtyFiles = Object.entries(state.fileBuffers)
        .filter(([_, buf]) => buf.isDirty)
        .map(([filename]) => filename)

      for (const file of dirtyFiles) {
        void state.saveFile(file)
      }
    }

    window.addEventListener("blur", handleWindowBlur)
    return () => window.removeEventListener("blur", handleWindowBlur)
  }, [store])

  // 6. Reactive Auto-Linting on focused file change
  useEffect(() => {
    let lintTimer: NodeJS.Timeout | null = null
    return store.subscribe((state, prevState) => {
      if (
        state.currentFocusedFile === prevState.currentFocusedFile &&
        state.fileBuffers[state.currentFocusedFile || ""]?.content ===
          prevState.fileBuffers[prevState.currentFocusedFile || ""]?.content
      ) {
        return
      }

      const file = state.currentFocusedFile
      if (!file || !state.linterSettings.enabled) return
      if (state.linterSettings.trigger !== "onType" || isLspLanguage(file))
        return

      if (lintTimer) clearTimeout(lintTimer)
      lintTimer = setTimeout(() => {
        const buffer = store.getState().fileBuffers[file]
        if (!buffer) return
        const diags = validateSyntax(
          file,
          buffer.content,
          store.getState().linterSettings.showWarnings,
        )
        store
          .getState()
          .setDiagnostics((prev) => [
            ...prev.filter((d) => !d.location.startsWith(file)),
            ...diags,
          ])
      }, 300)
    })
  }, [store])

  // 7. Global Keyboard Shortcuts
  useEffect(() => {
    if (typeof window === "undefined") return

    function handleKeyDown(event: KeyboardEvent) {
      const s = store.getState()

      if (event.key === "F5") {
        event.preventDefault()
        if (event.ctrlKey || event.metaKey) {
          void s.runFileInTerminal()
        } else if (event.shiftKey) {
          if (s.isDebugging) {
            void s.terminateDebugging()
          }
        } else {
          if (
            !s.isDebugging ||
            s.debugState.status === "idle" ||
            s.debugState.status === "terminated"
          ) {
            void s.startDebugging()
          } else if (s.debugState.status === "stopped") {
            void s.stepDebugging("continue")
          }
        }
        return
      }
      if (event.key === "F10") {
        if (s.isDebugging && s.debugState.status === "stopped") {
          event.preventDefault()
          void s.stepDebugging("stepOver")
          return
        }
      }
      if (event.key === "F11") {
        if (s.isDebugging && s.debugState.status === "stopped") {
          event.preventDefault()
          if (event.shiftKey) {
            void s.stepDebugging("stepOut")
          } else {
            void s.stepDebugging("stepIn")
          }
          return
        }
      }
      if (event.key === "F9") {
        if (s.activeTab && s.cursorPosition.line > 0) {
          event.preventDefault()
          void s.toggleBreakpoint(s.activeTab, s.cursorPosition.line)
          return
        }
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key.toLowerCase() === "k" || event.key.toLowerCase() === "p")
      ) {
        event.preventDefault()
        s.setCommandPaletteOpen((prev) => !prev)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        s.toggleSidebar()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault()
        s.togglePanel()
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void s.saveFile()
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        s.toggleSettingsModal()
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault()
        s.setSidebarOpen(true)
        s.setActiveActivity("Search")
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault()
        s.openFind(s.focusedGroup, false)
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "h"
      ) {
        event.preventDefault()
        s.openFind(s.focusedGroup, true)
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "w") {
        event.preventDefault()
        const currentGroup = s.focusedGroup === "group2" ? s.group2 : s.group1
        if (currentGroup.activeTab) {
          s.closeTabInGroup(currentGroup.id, currentGroup.activeTab)
        }
        return
      }
      if (event.key === "Escape") {
        if (s.confirmRevertFile) {
          s.setConfirmRevertFile(null)
          return
        }
        if (s.confirmCloseFile) {
          s.setConfirmCloseFile(null)
          return
        }
        s.setCommandPaletteOpen(false)
        s.setSettingsModalOpen(false)
        s.closeFind()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [store])
}
