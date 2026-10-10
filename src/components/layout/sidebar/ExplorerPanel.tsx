import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"

export function ExplorerPanel() {
  const { files, activeTab, setActiveTab } = useWorkbench()

  return (
    <>
      <div className="section-title">
        <Icon name="chevron" size={13} />
        <span>AEGISCODE</span>
      </div>
      <div className="file-tree">
        {files.map((file) => {
          const isCurrent = activeTab === file.label
          return (
            <button
              className={`file-row ${isCurrent ? "file-active" : ""} ${
                file.muted ? "text-muted" : ""
              }`}
              key={file.label}
              onClick={() => {
                if (file.icon === "file") setActiveTab(file.label)
              }}
              style={{ paddingLeft: `${10 + file.depth * 14}px` }}
              type="button"
            >
              {file.icon === "folder" ? (
                <Icon name="chevron" size={12} />
              ) : (
                <span className="tree-spacer" />
              )}
              <span
                className={file.icon === "folder" ? "folder-icon" : "file-icon"}
              >
                <Icon name={file.icon} size={14} />
              </span>
              <span>{file.label}</span>
            </button>
          )
        })}
      </div>
      <div className="collapsed-section">
        <Icon name="chevron" size={13} />
        <span>OUTLINE</span>
      </div>
      <div className="collapsed-section">
        <Icon name="chevron" size={13} />
        <span>TIMELINE</span>
      </div>
    </>
  )
}
