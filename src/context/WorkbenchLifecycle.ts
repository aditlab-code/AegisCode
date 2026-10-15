import { useEffect, useRef } from "react"
import { useWorkbenchStore } from "../store"
import { extractCodeGraphTraceTargets } from "../utils/codegraphApi"
import {
  fetchWorkspaceTree,
  normalizeWorkspacePath,
} from "../utils/workspaceApi"
import { eventHub } from "../services/WorkbenchEventHub"
import type {
  WorkspaceChangeEvent,
  DiagnosticItem,
  StreamDebugEvent,
} from "../types/workbench"

export function useWorkbenchLifecycle() {
  const store = useWorkbenchStore

  // 1. Server connection health check
  useEffect(() => {
    store
      .getState()
      .checkServerConnection()
      .catch((err) => console.warn("Initial server check error:", err))

    const timer = setInterval(() => {
      store
        .getState()
        .checkServerConnection()
        .catch((err) => console.warn("Periodic server check error:", err))
    }, 20000)
    return () => clearInterval(timer)
  }, [store])

  // 1b. Auto-mount workspace on startup
  useEffect(() => {
    const s = store.getState()
    if (!s.rootWorkspacePath) {
      void s.refreshWorkspace()
    }
  }, [store])

  // 2. DAP Debugger SSE listener via centralized eventHub
  useEffect(() => {
    const unsub = eventHub.subscribe(
      "debug",
      (event: StreamDebugEvent, type: string) => {
        if (!event) return
        const s = store.getState()
        const eventType = event.type || type

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
        }
        if (
          eventType === "debug:output" ||
          eventType === "output" ||
          event.output
        ) {
          const cat =
            event.category === "stderr"
              ? "stderr"
              : event.category === "stdout"
                ? "stdout"
                : "info"
          s.addDebugConsoleLog(cat, event.output || "")
        } else if (eventType === "debug:stopped" || eventType === "stopped") {
          const stopDetail = event.state?.stopReason
            ? ` (${event.state.stopReason})`
            : ""
          const location = event.currentFile
            ? ` at ${event.currentFile.split("/").pop()}:${event.currentLine || ""}`
            : ""
          s.addDebugConsoleLog("info", `Paused${location}${stopDetail}`)
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
        } else if (
          eventType === "debug:continued" ||
          eventType === "continued"
        ) {
          s.setActiveDebugLine(null)
          s.addDebugConsoleLog("info", "Resumed execution")
        } else if (
          eventType === "debug:terminated" ||
          eventType === "terminated"
        ) {
          s.setActiveDebugLine(null)
          s.addDebugConsoleLog("info", "Debug session terminated")
          useWorkbenchStore.setState({
            debugState: { active: false, status: "terminated" },
            isDebugging: false,
          })
        }
      },
    )

    return () => {
      unsub()
    }
  }, [store])

  // 2b. Global MCP Tool Invocation SSE Listener via centralized eventHub
  useEffect(() => {
    const unsub = eventHub.subscribe("mcp", (payload: any) => {
      try {
        const data = typeof payload === "string" ? JSON.parse(payload) : payload
        if (!data) return
        const s = store.getState()
        const parsed = extractCodeGraphTraceTargets(
          String(data.tool || "codegraph_explore"),
          data.args || { query: data.symbol || "" },
          data.symbol ? String(data.symbol) : undefined,
        )
        if (parsed.symbols.length > 0) {
          s.triggerAiTrace({
            symbols: parsed.symbols,
            symbolName: parsed.primarySymbol,
            rawQuery: parsed.rawQuery,
            filePath: parsed.filePath,
            toolName: parsed.cleanToolName,
            provider: data.provider || s.activeProvider,
            model: data.model || s.activeModel,
            status: data.status === "completed" ? "completed" : "running",
          })
        }
      } catch {
        // Ignore malformed SSE payload
      }
    })

    const handleTraceEvent = (e: Event) => {
      const custom = e as CustomEvent
      if (!custom.detail) return
      const s = store.getState()
      const d = custom.detail
      if (d.status === "done" || d.status === "completed") {
        if (s.aiTrace && s.aiTrace.status === "running") {
          s.triggerAiTrace({ ...s.aiTrace, status: "completed" })
        }
        return
      }
      if (d.symbols || d.symbolName) {
        s.triggerAiTrace({
          symbols: d.symbols || (d.symbolName ? [d.symbolName] : []),
          symbolName: d.symbolName || (d.symbols ? d.symbols[0] : ""),
          rawQuery: d.rawQuery || d.symbolName || "",
          filePath: d.filePath,
          toolName: d.toolName || "codegraph_explore",
          provider: d.provider || s.activeProvider,
          model: d.model || s.activeModel,
          status: d.status || "running",
        })
      }
    }
    window.addEventListener("aegis:ai-trace-path", handleTraceEvent)

    return () => {
      unsub()
      window.removeEventListener("aegis:ai-trace-path", handleTraceEvent)
    }
  }, [store])

  // 3. Real-time Workspace Disk Watcher via centralized eventHub
  useEffect(() => {
    let hasConnectedOnce = false

    const unsub = eventHub.subscribe(
      "workspace",
      (payload: any, type: string) => {
        try {
          if (type === "connected" || payload?.status === "connected") {
            if (hasConnectedOnce) {
              void store.getState().refreshWorkspace()
            }
            hasConnectedOnce = true
            return
          }

          const evt = (
            typeof payload === "string" ? JSON.parse(payload) : payload
          ) as WorkspaceChangeEvent
          if (!evt) return
          const { created = [], modified = [], deleted = [] } = evt

          // 1. Refresh explorer tree if files were created or deleted
          if (created.length > 0 || deleted.length > 0) {
            fetchWorkspaceTree()
              .then((treeData) => store.getState().setFiles(treeData.flatTree))
              .catch((err) => console.warn("Tree refresh error:", err))
          }

          // 2. Synchronize open buffers
          const activeBuffers = store.getState().fileBuffers
          const filesToReload = [...created, ...modified]

          for (const file of filesToReload) {
            const buf = activeBuffers[file]
            if (buf) {
              if (!buf.isDirty) {
                void store.getState().fetchBufferSafely(file)
              } else {
                store.getState().setFileBuffers((prev) => {
                  const current = prev[file]
                  if (!current) return prev
                  return {
                    ...prev,
                    [file]: {
                      ...current,
                      hasDiskConflict: true,
                    },
                  }
                })
                store.getState().showToast(`File changed on disk: ${file}`)
              }
            }
          }

          if (deleted.length > 0) {
            for (const file of deleted) {
              const buf = activeBuffers[file]
              if (buf) {
                store.getState().setFileBuffers((prev) => {
                  const current = prev[file]
                  if (!current) return prev
                  return {
                    ...prev,
                    [file]: {
                      ...current,
                      isDeletedOnDisk: true,
                    },
                  }
                })
                store.getState().showToast(`File deleted on disk: ${file}`)
              }
            }
          }

          // 3. Trigger git refresh
          if (created.length > 0 || modified.length > 0 || deleted.length > 0) {
            void store.getState().refreshGit()
          }
        } catch (err) {
          console.error("Failed to parse workspace change event:", err)
        }
      },
    )

    return () => {
      unsub()
    }
  }, [store])

  // 4. Desktop responsive viewport observer
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

  // 5. Auto-save: afterDelay
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  useEffect(() => {
    let prevFileBuffers = store.getState().fileBuffers
    return store.subscribe((state) => {
      const { autoSave, autoSaveDelay } = state.settings.files
      if (autoSave !== "afterDelay") return

      // Short-circuit: skip iteration if fileBuffers reference hasn't changed
      if (state.fileBuffers === prevFileBuffers) return
      prevFileBuffers = state.fileBuffers

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

  // 6. Auto-save: onFocusChange
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

  // 7. Compiler LSP Diagnostics SSE via centralized eventHub
  useEffect(() => {
    const unsub = eventHub.subscribe("lsp", (payload: any) => {
      try {
        const evt = typeof payload === "string" ? JSON.parse(payload) : payload
        if (!evt || !evt.uri || !Array.isArray(evt.diagnostics)) return
        let relPath = evt.uri
        if (relPath.startsWith("file://")) {
          relPath = relPath.slice(7)
        }
        const rootPath = store.getState().rootWorkspacePath
        relPath = normalizeWorkspacePath(relPath, rootPath)

        const lspDiags: DiagnosticItem[] = evt.diagnostics.map(
          (d: any, idx: number) => ({
            id: `lsp-${relPath}-${d.range?.start?.line ?? 0}-${idx}`,
            title: d.message || "Compiler issue",
            location: `${relPath}:${(d.range?.start?.line ?? 0) + 1}${
              d.range?.start?.character !== undefined
                ? `:${d.range.start.character + 1}`
                : ""
            }`,
            type: d.severity === 1 ? "error" as const : "warning" as const,
            source: d.source || "lsp",
          }),
        )

        store
          .getState()
          .setDiagnostics((prev) => [
            ...prev.filter((item) => !item.location.startsWith(relPath)),
            ...lspDiags,
          ])
      } catch (err) {
        console.warn("Failed to process LSP diagnostics event:", err)
      }
    })
    return () => {
      unsub()
    }
  }, [store])

  // 8. Global Keyboard Shortcuts
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

      if (event.key === "F12") {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent("aegis:editor-definition"))
        return
      }

      // Command Palette (Cmd+Shift+P / Ctrl+Shift+P / F1)
      if (
        event.key === "F1" ||
        ((event.metaKey || event.ctrlKey) &&
          event.shiftKey &&
          event.key.toLowerCase() === "p")
      ) {
        event.preventDefault()
        s.setCommandPaletteQuery(">")
        s.setCommandPaletteOpen(true)
        return
      }

      // Quick Open / Go to File (Cmd+P / Ctrl+P, or Cmd+K)
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        (event.key.toLowerCase() === "p" || event.key.toLowerCase() === "k")
      ) {
        event.preventDefault()
        s.setCommandPaletteQuery("")
        s.setCommandPaletteOpen((prev) =>
          s.commandPaletteQuery === "" ? !prev : true,
        )
        return
      }

      // Go to Line (Ctrl+G on macOS & Win/Linux)
      if (
        event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault()
        s.setCommandPaletteQuery(":")
        s.setCommandPaletteOpen(true)
        return
      }

      // Open Visual CodeGraph (Cmd+G on macOS or Alt+G on Win/Linux)
      if (
        ((event.metaKey && !event.ctrlKey) || event.altKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "g"
      ) {
        event.preventDefault()
        s.openFileInPane("codegraph:workspace")
        return
      }

      // Inline AI Code Action Prompt (Cmd+L / Ctrl+L or Cmd+I / Ctrl+I)
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        (event.key.toLowerCase() === "l" || event.key.toLowerCase() === "i")
      ) {
        event.preventDefault()
        const activeTab = s.activeTab || s.currentFocusedFile
        const selection = s.selection
        if (typeof s.syncContextItems === "function") {
          s.syncContextItems()
        }
        window.dispatchEvent(
          new CustomEvent("aegis:inline-ai-prompt", {
            detail: {
              file: activeTab,
              selection,
            },
          }),
        )
        return
      }

      // Toggle Terminal / New Terminal (Ctrl+` and Ctrl+Shift+`)
      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === "`" || event.key === "~" || event.code === "Backquote")
      ) {
        event.preventDefault()
        if (event.shiftKey) {
          s.setPanelOpen(true)
          s.setActiveBottomTab("Terminal")
          s.createTerminalSession()
        } else {
          if (s.panelOpen && s.activeBottomTab === "Terminal") {
            s.setPanelOpen(false)
          } else {
            s.setPanelOpen(true)
            s.setActiveBottomTab("Terminal")
          }
        }
        return
      }

      // AI Chat with Selection (Cmd+Shift+L / Ctrl+Shift+L)
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "l"
      ) {
        event.preventDefault()
        s.setChatOpen(true)
        if (typeof s.syncContextItems === "function") {
          s.syncContextItems()
        }
        window.dispatchEvent(new CustomEvent("aegis:focus-chat-input"))
        return
      }

      // Quick Tab Switcher (Ctrl+Tab & Ctrl+Shift+Tab)
      if (event.ctrlKey && !event.metaKey && event.key === "Tab") {
        event.preventDefault()
        const currentGroup = s.focusedGroup === "group2" ? s.group2 : s.group1
        if (currentGroup.tabs.length > 1) {
          const currentIndex = currentGroup.tabs.indexOf(currentGroup.activeTab)
          const nextIndex = event.shiftKey
            ? (currentIndex - 1 + currentGroup.tabs.length) %
              currentGroup.tabs.length
            : (currentIndex + 1) % currentGroup.tabs.length
          const nextTab = currentGroup.tabs[nextIndex]
          if (nextTab) {
            s.openFileInPane(nextTab)
          }
        }
        return
      }

      // Format Document (Shift+Alt+F / Shift+Option+F)
      if (event.shiftKey && event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault()
        window.dispatchEvent(new CustomEvent("aegis:editor-format"))
        return
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
        event.key.toLowerCase() === "d"
      ) {
        event.preventDefault()
        s.setSidebarOpen(true)
        s.setActiveActivity("Debug")
        return
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
        if (
          currentGroup.activeTab &&
          !s.pinnedTabs?.has(currentGroup.activeTab)
        ) {
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
