import { useState } from "react";
import { useWorkbench } from "../../../context/WorkbenchContext";
import { EditorTabs } from "./EditorTabs";
import { EditorBreadcrumbs } from "./EditorBreadcrumbs";
import { CodePane } from "./CodePane";
import { EditorFindWidget } from "./EditorFindWidget";

const primaryCodeLines = [
  <><span className="syntax-pink">import</span> {"{"} <span className="syntax-blue">useMemo</span>, <span className="syntax-blue">useState</span> {"}"} <span className="syntax-pink">from</span> <span className="syntax-green">'react'</span>;</>,
  "",
  <><span className="syntax-pink">type</span> <span className="syntax-blue">ServerState</span> = <span className="syntax-green">'idle'</span> | <span className="syntax-green">'running'</span> | <span className="syntax-green">'error'</span>;</>,
  "",
  <><span className="syntax-pink">export default function</span> <span className="syntax-yellow">LocalServer</span>() {"{"}</>,
  <>&nbsp;&nbsp;<span className="syntax-pink">const</span> [state, setState] = <span className="syntax-blue">useState</span>&lt;<span className="syntax-blue">ServerState</span>&gt;(<span className="syntax-green">'running'</span>);</>,
  <>&nbsp;&nbsp;<span className="syntax-pink">const</span> port = <span className="syntax-orange">4173</span>;</>,
  "",
  <>&nbsp;&nbsp;<span className="syntax-pink">const</span> endpoint = <span className="syntax-blue">useMemo</span>(() ={">"} {"{"}</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;<span className="syntax-pink">return</span> <span className="syntax-green">`http://localhost:${"{"}port{"}"}`</span>;</>,
  <>&nbsp;&nbsp;{"}"}, [port]);</>,
  "",
  <>&nbsp;&nbsp;<span className="syntax-pink">return</span> (</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span className="syntax-blue">main</span> className=<span className="syntax-green">"server-shell"</span>&gt;</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span className="syntax-blue">Status</span> value={"{"}state{"}"} /&gt;</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&lt;<span className="syntax-blue">Endpoint</span> url={"{"}endpoint{"}"} /&gt;</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;&lt;/<span className="syntax-blue">main</span>&gt;</>,
  <>&nbsp;&nbsp;);</>,
  <>{"}"}</>,
];

const secondaryCodeLines = [
  <><span className="syntax-blue">{"{"}</span></>,
  <>&nbsp;&nbsp;<span className="syntax-green">"server"</span>: {"{"}</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;<span className="syntax-green">"port"</span>: <span className="syntax-orange">4173</span>,</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;<span className="syntax-green">"host"</span>: <span className="syntax-green">"localhost"</span>,</>,
  <>&nbsp;&nbsp;&nbsp;&nbsp;<span className="syntax-green">"sse"</span>: <span className="syntax-pink">true</span></>,
  <>&nbsp;&nbsp;{"}"}</>,
  <>{"}"}</>,
];

export function Editor() {
  const { activeTab, splitEditor, setSplitEditor } = useWorkbench();
  const [findOpen, setFindOpen] = useState(false);

  return (
    <section className="editor relative">
      <EditorTabs
        isFindOpen={findOpen}
        onToggleFind={() => setFindOpen((v) => !v)}
      />
      <EditorBreadcrumbs />
      <EditorFindWidget
        isOpen={findOpen}
        onClose={() => setFindOpen(false)}
      />
      <div className={`editor-panes ${splitEditor ? "editor-panes-split" : ""}`}>
        <CodePane
          lines={primaryCodeLines}
          title={activeTab}
        />
        {splitEditor && (
          <CodePane
            lines={secondaryCodeLines}
            onClose={() => setSplitEditor(false)}
            secondary
            title="server.config.json"
          />
        )}
      </div>
    </section>
  );
}
