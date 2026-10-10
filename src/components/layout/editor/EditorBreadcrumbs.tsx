import { Icon } from "../../ui/Icon";
import { useWorkbench } from "../../../context/WorkbenchContext";

const languageProfiles = ["TypeScript", "JavaScript", "Python", "JSON", "C++"];

export function EditorBreadcrumbs() {
  const { activeTab, activeLanguage, setActiveLanguage } = useWorkbench();

  return (
    <div className="breadcrumbs">
      <div className="breadcrumb-path">
        <span>src</span>
        <Icon name="chevron" size={11} />
        <span>{activeTab}</span>
        <Icon name="chevron" size={11} />
        <Icon name="code" size={12} />
        <span>LocalServer</span>
      </div>
      <label className="language-profile">
        <span className="lint-ready">
          <span className="status-dot" /> Lint ready
        </span>
        <select
          aria-label="Syntax and lint language"
          onChange={(event) => setActiveLanguage(event.target.value)}
          value={activeLanguage}
        >
          {languageProfiles.map((profile) => (
            <option key={profile}>{profile}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
