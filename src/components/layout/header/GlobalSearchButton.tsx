import { Icon } from "../../ui/Icon";
import { useWorkbench } from "../../../context/WorkbenchContext";

export function GlobalSearchButton() {
  const { setCommandPaletteOpen } = useWorkbench();

  return (
    <button
      className="command-search"
      onClick={() => setCommandPaletteOpen(true)}
      type="button"
    >
      <Icon name="search" size={14} />
      <span>Search files, commands, symbols...</span>
      <kbd>⌘ K</kbd>
    </button>
  );
}
