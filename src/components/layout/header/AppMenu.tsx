import { useState } from "react";
import { useWorkbench } from "../../../context/WorkbenchContext";
import type { MenuGroup } from "../../../types/workbench";

const menus: MenuGroup[] = [
  {
    label: "File",
    items: [
      ["New Text File", "Ctrl+N", "new-file"],
      ["Open Folder…", "Ctrl+O", "open-folder"],
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
];

export function AppMenu() {
  const { runAction } = useWorkbench();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  function handleAction(action: string) {
    setActiveMenu(null);
    runAction(action);
  }

  return (
    <nav className="app-menus" aria-label="Application menu">
      {menus.map((menu) => (
        <div className="app-menu" key={menu.label}>
          <button
            className={activeMenu === menu.label ? "app-menu-active" : ""}
            onClick={() =>
              setActiveMenu((active) => (active === menu.label ? null : menu.label))
            }
            type="button"
          >
            {menu.label}
          </button>
          {activeMenu === menu.label && (
            <div className="menu-dropdown">
              {menu.items.map(([label, shortcut, action]) => (
                <button
                  key={label}
                  onClick={() => handleAction(action)}
                  type="button"
                >
                  <span>{label}</span>
                  <kbd>{shortcut}</kbd>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
