import { useState } from "react"
import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function SettingsPanel() {
  const {
    linterSettings,
    setLinterSettings,
    minimapEnabled,
    toggleMinimap,
    minimapScale,
    setMinimapScale,
  } = useWorkbench()
  const [settingsQuery, setSettingsQuery] = useState("")
  const [autoSave, setAutoSave] = useState(true)

  const query = settingsQuery.toLowerCase().trim()

  const showEditorGroup =
    !query || "editor auto save minimap scale tab size".includes(query)
  const showLinterGroup =
    !query ||
    "linter diagnostics syntax warnings ontype onsave trigger".includes(query)

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

      {showEditorGroup && (
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
              checked={minimapEnabled}
              onChange={toggleMinimap}
              type="checkbox"
            />
          </label>
          <label className="setting-row setting-select">
            <span>
              <strong>Minimap Scale</strong>
              <small>Preview text size</small>
            </span>
            <select
              aria-label="Minimap scale"
              onChange={(e) =>
                setMinimapScale(e.target.value as "small" | "medium" | "large")
              }
              value={minimapScale}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
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
      )}

      {showLinterGroup && (
        <div className="settings-group">
          <span className="settings-label">LINTER & DIAGNOSTICS</span>
          <label className="setting-row">
            <span>
              <strong>Enable Linter</strong>
              <small>Run active syntax analysis</small>
            </span>
            <input
              checked={linterSettings.enabled}
              onChange={(e) =>
                setLinterSettings((prev) => ({
                  ...prev,
                  enabled: e.target.checked,
                }))
              }
              type="checkbox"
            />
          </label>
          <label className="setting-row setting-select">
            <span>
              <strong>Lint Trigger</strong>
              <small>When diagnostics execute</small>
            </span>
            <select
              aria-label="Lint trigger mode"
              onChange={(e) =>
                setLinterSettings((prev) => ({
                  ...prev,
                  trigger: e.target.value as "onType" | "onSave",
                }))
              }
              value={linterSettings.trigger}
            >
              <option value="onType">On Type (Reaktif)</option>
              <option value="onSave">On Save (Ctrl+S)</option>
            </select>
          </label>
          <label className="setting-row">
            <span>
              <strong>Show Warnings</strong>
              <small>Display syntax warnings alongside errors</small>
            </span>
            <input
              checked={linterSettings.showWarnings}
              onChange={(e) =>
                setLinterSettings((prev) => ({
                  ...prev,
                  showWarnings: e.target.checked,
                }))
              }
              type="checkbox"
            />
          </label>
        </div>
      )}
    </div>
  )
}
