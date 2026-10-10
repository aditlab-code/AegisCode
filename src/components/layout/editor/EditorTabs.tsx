import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { useWorkbench } from "../../../context/WorkbenchContext";

interface EditorTabsProps {
  onToggleFind: () => void;
  isFindOpen: boolean;
}

export function EditorTabs({ onToggleFind, isFindOpen }: EditorTabsProps) {
  const {
    activeTab,
    setActiveTab,
    tabs,
    closeTab,
    splitEditor,
    setSplitEditor,
    showToast,
  } = useWorkbench();

  return (
    <div className="editor-tabs">
      <div className="tab-list">
        {tabs.map((tab) => (
          <button
            className={`editor-tab ${activeTab === tab ? "editor-tab-active" : ""}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            <Icon name="code" size={14} />
            <span>{tab}</span>
            <span
              className="close-tab-trigger"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab);
              }}
              role="button"
              tabIndex={0}
            >
              <Icon name="close" size={12} />
            </span>
          </button>
        ))}
      </div>
      <div className="editor-actions">
        <IconButton
          active={isFindOpen}
          label="Find in file (Ctrl+F)"
          onClick={onToggleFind}
        >
          <Icon name="search" size={14} />
        </IconButton>
        <IconButton
          label="Run file"
          onClick={() => showToast(`Running ${activeTab}...`)}
        >
          <Icon name="play" />
        </IconButton>
        <IconButton
          active={splitEditor}
          label="Split editor"
          onClick={() => setSplitEditor((v) => !v)}
        >
          <Icon name="split" />
        </IconButton>
        <IconButton label="More editor actions">
          <Icon name="more" />
        </IconButton>
      </div>
    </div>
  );
}
