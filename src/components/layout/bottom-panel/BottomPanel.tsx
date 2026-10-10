import { useState } from "react";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { useWorkbench } from "../../../context/WorkbenchContext";
import { TerminalView } from "./TerminalView";
import { ProblemsView } from "./ProblemsView";
import { OutputView } from "./OutputView";

export function BottomPanel() {
  const {
    diagnostics,
    terminalLines,
    terminalRunning,
    setTerminalRunning,
    showToast,
  } = useWorkbench();

  const [activeTab, setActiveTab] = useState<"Problems" | "Output" | "Terminal">("Terminal");

  function handleCopy() {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(terminalLines.join("\n"));
      showToast("Terminal output copied to clipboard");
    }
  }

  return (
    <section className="bottom-panel">
      <div className="bottom-panel-header">
        <div className="bottom-tabs">
          {(["Problems", "Output", "Terminal"] as const).map((name) => (
            <button
              className={activeTab === name ? "bottom-tab-active" : ""}
              key={name}
              onClick={() => setActiveTab(name)}
              type="button"
            >
              {name}
              {name === "Problems" && (
                <span className="count-badge">{diagnostics.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="panel-controls">
          <span className={terminalRunning ? "session-running" : "session-stopped"}>
            <span className="status-dot" />{" "}
            {terminalRunning ? "SSE connected" : "terminated"}
          </span>
          <span>zsh</span>
          <IconButton label="Copy terminal output" onClick={handleCopy}>
            <Icon name="copy" size={14} />
          </IconButton>
          <IconButton
            label={terminalRunning ? "Terminate terminal" : "Restart terminal"}
            onClick={() => setTerminalRunning((v) => !v)}
          >
            <Icon name={terminalRunning ? "close" : "play"} size={14} />
          </IconButton>
        </div>
      </div>

      <div className="terminal-output">
        {activeTab === "Terminal" && <TerminalView />}
        {activeTab === "Problems" && <ProblemsView />}
        {activeTab === "Output" && <OutputView />}
      </div>
    </section>
  );
}
