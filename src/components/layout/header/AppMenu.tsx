import { useEffect, useRef, useState } from "react"
import { useWorkbenchStore, useShallow } from "../../../store"
import type { MenuGroup } from "../../../types/workbench"

const menus: MenuGroup[] = [
  {
    label: "File",
    items: [
      ["New Text File", "Ctrl+N", "new-file"],
      ["Open Folder…", "Ctrl+O", "open-folder"],
      ["Close Folder", "Ctrl+K F", "close-folder"],
      ["Save", "Ctrl+S", "save"],
    ],
  },
  {
    label: "Edit",
    items: [
      ["Undo", "Ctrl+Z", "undo"],
      ["Redo", "Ctrl+Shift+Z", "redo"],
      ["Find", "Ctrl+F", "find"],
    ],
  },
  {
    label: "View",
    items: [
      ["Command Palette…", "Ctrl+K", "commands"],
      ["Toggle Explorer", "Ctrl+B", "sidebar"],
      ["Toggle Panel", "Ctrl+J", "panel"],
    ],
  },
  {
    label: "Run",
    items: [
      ["Run Without Debugging", "Ctrl+F5", "run"],
      ["Run Active File", "F5", "run-file"],
      ["Stop", "Shift+F5", "stop"],
    ],
  },
  {
    label: "Terminal",
    items: [
      ["New Terminal", "Ctrl+Shift+`", "new-terminal"],
      ["Clear Terminal", "Ctrl+K", "clear-terminal"],
    ],
  },
]

export function AppMenu() {
  const { runAction, recentProjects, openRootFolder, clearRecentProjects } =
    useWorkbenchStore(
      useShallow((s) => ({
        runAction: s.runAction,
        recentProjects: s.recentProjects,
        openRootFolder: s.openRootFolder,
        clearRecentProjects: s.clearRecentProjects,
      })),
    )
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    if (!activeMenu) return

    function handlePointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setActiveMenu(null)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const currentMenu = activeMenu
        setActiveMenu(null)
        if (currentMenu) {
          triggerRefs.current[currentMenu]?.focus()
        }
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [activeMenu])

  function handleAction(action: string) {
    setActiveMenu(null)
    runAction(action)
  }

  return (
    <nav className="app-menus" aria-label="Application menu" ref={navRef}>
      {menus.map((menu) => (
        <div className="app-menu" key={menu.label}>
          <button
            ref={(el) => {
              triggerRefs.current[menu.label] = el
            }}
            aria-expanded={activeMenu === menu.label}
            aria-haspopup="menu"
            className={activeMenu === menu.label ? "app-menu-active" : ""}
            onClick={() =>
              setActiveMenu((active) =>
                active === menu.label ? null : menu.label,
              )
            }
            onMouseEnter={() => {
              if (activeMenu && activeMenu !== menu.label) {
                setActiveMenu(menu.label)
              }
            }}
            type="button"
          >
            {menu.label}
          </button>
          {activeMenu === menu.label && (
            <div className="menu-dropdown" role="menu">
              {menu.items.map(([label, shortcut, action]) => (
                <button
                  key={label}
                  onClick={() => handleAction(action)}
                  role="menuitem"
                  type="button"
                >
                  <span>{label}</span>
                  <kbd>{shortcut}</kbd>
                </button>
              ))}

              {menu.label === "File" && recentProjects.length > 0 && (
                <div className="border-t border-[var(--color-line)] my-1 pt-1">
                  <div className="px-3 py-1 text-[10px] font-semibold text-[var(--color-ink-muted)] uppercase tracking-wider">
                    Recent Projects
                  </div>
                  {recentProjects.map((p) => {
                    const base = p.split("/").filter(Boolean).pop() || p
                    return (
                      <button
                        className="flex items-center justify-between w-full px-3 py-1 text-xs hover:bg-[var(--color-surface-raised)] text-[var(--color-ink)] text-left"
                        key={p}
                        onClick={() => {
                          setActiveMenu(null)
                          openRootFolder(p)
                        }}
                        role="menuitem"
                        title={p}
                        type="button"
                      >
                        <span className="truncate max-w-[160px]">{base}</span>
                        <span className="text-[10px] text-[var(--color-ink-muted)] font-mono truncate max-w-[100px]">
                          {p}
                        </span>
                      </button>
                    )
                  })}
                  <button
                    className="w-full px-3 py-1 text-[10px] text-[var(--color-ink-muted)] hover:text-red-400 text-left hover:bg-[var(--color-surface-raised)] transition-colors"
                    onClick={() => {
                      setActiveMenu(null)
                      clearRecentProjects()
                    }}
                    role="menuitem"
                    type="button"
                  >
                    Clear Recent Projects
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
