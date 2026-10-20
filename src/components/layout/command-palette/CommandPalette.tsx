import { useState, useMemo, useEffect, useRef } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbenchStore, useShallow } from "../../../store"
import {
  findWorkspaceFiles,
  type FuzzyFindMatch,
} from "../../../utils/workspaceApi"
import type { IconName } from "../../../types/workbench"

interface CommandPaletteItem {
  id: string
  label: string
  detail: string
  icon: IconName
  action: () => void
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    commandPaletteQuery,
    setCommandPaletteQuery,
    setActiveActivity,
    setSidebarOpen,
    openSettingsTab,
    theme,
    toggleTheme,
    showToast,
    openFolderPicker,
    openRootFolder,
    closeRootFolder,
    rootWorkspacePath,
    recentProjects,
    openFind,
    runFileInTerminal,
    startDebugging,
    files,
    tabs,
    openFileInPane,
    setCursorPosition,
    serverConnected,
    setActiveBottomTab,
    setPanelOpen,
  } = useWorkbenchStore(
    useShallow((s) => ({
      commandPaletteOpen: s.commandPaletteOpen,
      setCommandPaletteOpen: s.setCommandPaletteOpen,
      commandPaletteQuery: s.commandPaletteQuery,
      setCommandPaletteQuery: s.setCommandPaletteQuery,
      setActiveActivity: s.setActiveActivity,
      setSidebarOpen: s.setSidebarOpen,
      openSettingsTab: s.openSettingsTab,
      theme: s.theme,
      toggleTheme: s.toggleTheme,
      showToast: s.showToast,
      openFolderPicker: s.openFolderPicker,
      openRootFolder: s.openRootFolder,
      closeRootFolder: s.closeRootFolder,
      rootWorkspacePath: s.rootWorkspacePath,
      recentProjects: s.recentProjects,
      openFind: s.openFind,
      runFileInTerminal: s.runFileInTerminal,
      startDebugging: s.startDebugging,
      files: s.files,
      tabs: s.tabs,
      openFileInPane: s.openFileInPane,
      setCursorPosition: s.setCursorPosition,
      serverConnected: s.serverConnected,
      setActiveBottomTab: s.setActiveBottomTab,
      setPanelOpen: s.setPanelOpen,
    })),
  )

  const allCommands = useMemo<CommandPaletteItem[]>(() => {
    const list: CommandPaletteItem[] = [
      {
        id: "open-folder",
        label: "File: Open Folder...",
        detail: "Open project folder in native file manager",
        icon: "folder",
        action: () => {
          openFolderPicker()
        },
      },
      ...(rootWorkspacePath
        ? [
            {
              id: "close-folder",
              label: "File: Close Folder",
              detail: "Close the currently open workspace",
              icon: "close" as IconName,
              action: () => {
                closeRootFolder()
              },
            },
          ]
        : []),
      {
        id: "view-explorer",
        label: "View: Show Explorer",
        detail: "Navigate repository files",
        icon: "explorer",
        action: () => {
          setActiveActivity("Explorer")
          setSidebarOpen(true)
        },
      },
      {
        id: "view-debug",
        label: "View: Show Run & Debug",
        detail: "Manage breakpoints, variables, and call stack (Ctrl+Shift+D)",
        icon: "debug",
        action: () => {
          setActiveActivity("Debug")
          setSidebarOpen(true)
        },
      },
      {
        id: "view-debug-console",
        label: "View: Show Debug Console",
        detail: "Interactive REPL and DAP output logging",
        icon: "debug",
        action: () => {
          setActiveBottomTab("Debug Console")
          setPanelOpen(true)
        },
      },
      {
        id: "view-codegraph",
        label: "View: Open CodeGraph (Workspace)",
        detail: "Interactive AST & dependency architecture visualization",
        icon: "zap",
        action: () => {
          openFileInPane("codegraph:workspace")
        },
      },
      {
        id: "view-mcp",
        label: "View: Open MCP Inspector",
        detail: "Inspect Model Context Protocol tools and CodeGraph status",
        icon: "zap",
        action: () => {
          openFileInPane("codegraph:workspace")
          setActiveCodeGraphView("mcp")
        },
      },
      {
        id: "search-files",
        label: "Search: Find in Files",
        detail: "Search and replace across files (Ctrl+Shift+F)",
        icon: "search",
        action: () => {
          setActiveActivity("Search")
          setSidebarOpen(true)
        },
      },
      {
        id: "find-file",
        label: "Editor: Find in Current File",
        detail: "Find text within active editor (Ctrl+F)",
        icon: "search",
        action: () => {
          openFind(undefined, false)
        },
      },
      {
        id: "replace-file",
        label: "Editor: Replace in Current File",
        detail: "Find and replace within active editor (Ctrl+H)",
        icon: "edit",
        action: () => {
          openFind(undefined, true)
        },
      },
      {
        id: "format-document",
        label: "Format Document",
        detail: "Format active document using LSP (Shift+Alt+F)",
        icon: "edit",
        action: () => {
          window.dispatchEvent(new CustomEvent("aegis:editor-format"))
        },
      },
      {
        id: "git-scm",
        label: "Git: Open Source Control",
        detail: "Review pending changes",
        icon: "git",
        action: () => {
          setActiveActivity("Source Control")
          setSidebarOpen(true)
        },
      },
      {
        id: "pref-settings",
        label: "Preferences: Open Settings",
        detail: "Configure the workbench",
        icon: "settings",
        action: () => openSettingsTab(),
      },
      {
        id: "toggle-theme",
        label: "Preferences: Toggle Color Theme",
        detail: "Switch between Dark and Light mode",
        icon: theme === "dark" ? "sun" : "moon",
        action: () => {
          toggleTheme()
          showToast(
            theme === "dark"
              ? "Switched to Light Theme"
              : "Switched to Dark Theme",
          )
        },
      },
      {
        id: "run-terminal",
        label: "Run: Run File in Terminal",
        detail: "Execute active file in integrated terminal",
        icon: "play",
        action: () => {
          void runFileInTerminal()
        },
      },
      {
        id: "debug-start",
        label: "Debug: Start Debugging",
        detail: "Start DAP debug session on active file (F5)",
        icon: "debug",
        action: () => {
          void startDebugging()
        },
      },
    ]

    recentProjects.forEach((p) => {
      const base = p.split("/").filter(Boolean).pop() || p
      list.push({
        id: `recent-${p}`,
        label: `File: Open Recent: ${base}`,
        detail: p,
        icon: "folder",
        action: () => {
          openRootFolder(p)
        },
      })
    })

    return list
  }, [
    openFolderPicker,
    closeRootFolder,
    openRootFolder,
    rootWorkspacePath,
    recentProjects,
    runFileInTerminal,
    startDebugging,
    openFileInPane,
    setActiveActivity,
    setActiveBottomTab,
    setPanelOpen,
    openSettingsTab,
    setSidebarOpen,
    showToast,
    theme,
    toggleTheme,
  ])

  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const [backendMatches, setBackendMatches] = useState<FuzzyFindMatch[]>([])

  const mode = useMemo<"command" | "goto-line" | "file">(() => {
    if (commandPaletteQuery.startsWith(">")) return "command"
    if (commandPaletteQuery.startsWith(":")) return "goto-line"
    return "file"
  }, [commandPaletteQuery])

  useEffect(() => {
    if (mode !== "file" || !commandPaletteQuery.trim() || !serverConnected) {
      setBackendMatches([])
      return
    }

    const controller = new AbortController()
    const q = commandPaletteQuery.trim()

    const timer = setTimeout(() => {
      findWorkspaceFiles(q, 25, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted && res?.matches) {
            setBackendMatches(res.matches)
          }
        })
        .catch((err) => {
          if (err?.name === "AbortError" || controller.signal.aborted) {
            return
          }
          setBackendMatches([])
        })
    }, 200)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [mode, commandPaletteQuery, serverConnected])

  const results = useMemo<CommandPaletteItem[]>(() => {
    if (mode === "command") {
      const q = commandPaletteQuery.slice(1).trim().toLowerCase()
      if (!q) return allCommands
      return allCommands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.detail.toLowerCase().includes(q),
      )
    }

    if (mode === "goto-line") {
      const lineStr = commandPaletteQuery.slice(1).trim()
      const lineNum = parseInt(lineStr, 10)
      if (!lineStr || isNaN(lineNum) || lineNum <= 0) {
        return [
          {
            id: "goto-line-prompt",
            label: "Go to Line",
            detail: "Type a line number to navigate to",
            icon: "symbol",
            action: () => {},
          },
        ]
      }
      return [
        {
          id: `goto-line-${lineNum}`,
          label: `Go to Line: ${lineNum}`,
          detail: `Jump active editor cursor to line ${lineNum}`,
          icon: "symbol",
          action: () => {
            window.dispatchEvent(
              new CustomEvent("aegis:editor-goto-line", {
                detail: { line: lineNum, col: 1 },
              }),
            )
            setCursorPosition({ line: lineNum, col: 1 })
          },
        },
      ]
    }

    // mode === "file" (Quick Open)
    const q = commandPaletteQuery.trim().toLowerCase()

    // 1. Prioritize backend fast fuzzy matches from Go WorkspaceIndex
    if (backendMatches.length > 0 && q) {
      return backendMatches.map((m) => {
        const name = m.path.split("/").pop() || m.path
        return {
          id: `backend-file-${m.path}`,
          label: name,
          detail: m.path,
          icon: "file",
          action: () => {
            openFileInPane(m.path)
          },
        }
      })
    }

    const seen = new Set<string>()
    const candidates: CommandPaletteItem[] = []

    // 2. Prioritize open tabs
    for (const tabPath of tabs) {
      if (!seen.has(tabPath)) {
        seen.add(tabPath)
        const name = tabPath.split("/").pop() || tabPath
        candidates.push({
          id: `file-tab-${tabPath}`,
          label: name,
          detail: tabPath,
          icon: "file",
          action: () => {
            openFileInPane(tabPath)
          },
        })
      }
    }

    // 3. Add files from workspace tree (local fallback)
    for (const f of files) {
      if (
        (f.icon === "file" || f.type === "file" || (!f.children && f.path)) &&
        !seen.has(f.path)
      ) {
        seen.add(f.path)
        const name = f.name || f.label || f.path.split("/").pop() || f.path
        candidates.push({
          id: `file-${f.path}`,
          label: name,
          detail: f.path,
          icon: "file",
          action: () => {
            openFileInPane(f.path)
          },
        })
      }
    }

    if (!q) {
      return candidates.slice(0, 30)
    }

    return candidates
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.detail.toLowerCase().includes(q),
      )
      .slice(0, 40)
  }, [
    mode,
    commandPaletteQuery,
    backendMatches,
    allCommands,
    tabs,
    files,
    openFileInPane,
    setCursorPosition,
  ])

  useEffect(() => {
    setSelectedIndex(0)
  }, [commandPaletteQuery, commandPaletteOpen])

  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector(
      ".command-active",
    ) as HTMLElement | null
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  function handleSelect(cmd: CommandPaletteItem) {
    cmd.action()
    setCommandPaletteOpen(false)
    setCommandPaletteQuery("")
  }

  function handleClose() {
    setCommandPaletteOpen(false)
    setCommandPaletteQuery("")
  }

  useEffect(() => {
    if (!commandPaletteOpen) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        handleClose()
        return
      }
      if (e.key === "ArrowDown") {
        e.preventDefault()
        if (results.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % results.length)
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        if (results.length > 0) {
          setSelectedIndex(
            (prev) => (prev - 1 + results.length) % results.length,
          )
        }
      } else if (e.key === "Enter") {
        e.preventDefault()
        const target = results[selectedIndex] || results[0]
        if (target) {
          handleSelect(target)
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [commandPaletteOpen, results, selectedIndex])

  if (!commandPaletteOpen) return null

  return (
    <div
      aria-label="Command palette"
      className="command-palette-dropdown"
      role="region"
    >
      <div className="command-results" ref={listRef}>
        <span className="command-section">
          {mode === "command"
            ? "COMMANDS"
            : mode === "goto-line"
              ? "GO TO LINE"
              : "FILES"}
        </span>
        {results.length === 0 ? (
          <div className="px-3 py-4 text-xs text-center text-ink-muted">
            {mode === "command"
              ? "No matching commands"
              : mode === "goto-line"
                ? "Enter a line number"
                : "No matching files"}
          </div>
        ) : (
          results.map((cmd, index) => {
            return (
              <button
                className={index === selectedIndex ? "command-active" : ""}
                key={cmd.id}
                onClick={() => handleSelect(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
                type="button"
              >
                <Icon name={cmd.icon} size={15} />
                <span>
                  <strong>{cmd.label}</strong>
                  <small>{cmd.detail}</small>
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
