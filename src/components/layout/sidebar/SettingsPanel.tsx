import { useState } from "react";
import { Icon } from "../../ui/Icon";

export function SettingsPanel() {
  const [settingsQuery, setSettingsQuery] = useState("");
  const [autoSave, setAutoSave] = useState(true);
  const [minimap, setMinimap] = useState(true);

  return (
    <div className="tool-panel">
      <label className="panel-input">
        <Icon name="search" size={13} />
        <input
          aria-label="Search settings"
          onChange={(event) => setSettingsQuery(event.target.value)}
          placeholder="Search settings"
          value={settingsQuery}
        />
      </label>
      <div className="settings-group">
        <span className="settings-label">EDITOR</span>
        <label className="setting-row">
          <span>
            <strong>Auto Save</strong>
            <small>Save changes automatically</small>
          </span>
          <input
            checked={autoSave}
            onChange={() => setAutoSave((v) => !v)}
            type="checkbox"
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Minimap</strong>
            <small>Show code overview</small>
          </span>
          <input
            checked={minimap}
            onChange={() => setMinimap((v) => !v)}
            type="checkbox"
          />
        </label>
        <label className="setting-row setting-select">
          <span>
            <strong>Tab Size</strong>
            <small>Spaces per indentation</small>
          </span>
          <select aria-label="Editor tab size" defaultValue="2">
            <option>2</option>
            <option>4</option>
          </select>
        </label>
      </div>
    </div>
  );
}
