import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { useWorkbench } from "../../../context/WorkbenchContext";
import { ExplorerPanel } from "./ExplorerPanel";
import { SearchPanel } from "./SearchPanel";
import { SourceControlPanel } from "./SourceControlPanel";
import { SettingsPanel } from "./SettingsPanel";

export function Sidebar() {
  const { activeActivity } = useWorkbench();

  return (
    <aside className="side-panel">
      <div className="panel-title">
        <span>{activeActivity}</span>
        <IconButton label={`More ${activeActivity} actions`}>
          <Icon name="more" />
        </IconButton>
      </div>

      {activeActivity === "Explorer" && <ExplorerPanel />}
      {activeActivity === "Search" && <SearchPanel />}
      {activeActivity === "Source Control" && <SourceControlPanel />}
      {activeActivity === "Settings" && <SettingsPanel />}
    </aside>
  );
}
