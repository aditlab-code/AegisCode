import { useEffect, useMemo, useState, type ReactNode } from "react";

type IconName =
  | "aegis"
  | "bell"
  | "branch"
  | "chevron"
  | "close"
  | "code"
  | "copy"
  | "error"
  | "explorer"
  | "file"
  | "folder"
  | "git"
  | "layout"
  | "more"
  | "panel"
  | "play"
  | "search"
  | "send"
  | "settings"
  | "split"
  | "terminal"
  | "warning";

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    aegis: (
      <>
        <path d="M12 2.8 4.5 6v5.4c0 4.8 3.1 8.8 7.5 10.2 4.4-1.4 7.5-5.4 7.5-10.2V6L12 2.8Z" />
        <path d="m9 13.5 3-6 3 6M10.3 11h3.4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" />
        <path d="M10 21h4" />
      </>
    ),
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="6" r="2" />
        <path d="M6 7v10M8 17c5 0 8-3 8-8V8" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    code: <path d="m8 9-3 3 3 3m8-6 3 3-3 3m-3-8-2 10" />,
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="1.5" />
        <path d="M16 8V5H5v11h3" />
      </>
    ),
    error: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m9 9 6 6m0-6-6 6" />
      </>
    ),
    explorer: (
      <>
        <path d="M5 3h9l5 5v13H5z" />
        <path d="M14 3v5h5M9 13h6M9 17h5" />
      </>
    ),
    file: (
      <>
        <path d="M6 2.8h8l4 4V21H6z" />
        <path d="M14 3v4h4" />
      </>
    ),
    folder: <path d="M3 6h7l2 2h9v11H3z" />,
    git: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="12" r="2" />
        <path d="M6 7v10m2-6c4 0 6 1 8 1" />
      </>
    ),
    layout: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M8 4v16m9-16v16" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    panel: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M3 14h18" />
      </>
    ),
    play: <path d="m9 6 9 6-9 6z" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    send: <path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    split: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="1" />
        <path d="M12 4v16" />
      </>
    ),
    terminal: <path d="m5 7 5 5-5 5m8 0h6" />,
    warning: (
      <>
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v5m0 3h.01" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6">
        {paths[name]}
      </g>
    </svg>
  );
}

function IconButton({
  active,
  children,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button ${active ? "icon-button-active" : ""}`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

const codeLines = [
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

const files = [
  { depth: 0, icon: "folder" as const, label: "src", open: true },
  { depth: 1, icon: "folder" as const, label: "components", open: true },
  { depth: 2, icon: "file" as const, label: "Endpoint.tsx" },
  { depth: 2, icon: "file" as const, label: "Status.tsx" },
  { depth: 1, icon: "file" as const, label: "App.tsx", active: true },
  { depth: 1, icon: "file" as const, label: "index.css" },
  { depth: 0, icon: "file" as const, label: ".gitignore", muted: true },
  { depth: 0, icon: "file" as const, label: "package.json" },
  { depth: 0, icon: "file" as const, label: "vite.config.ts" },
];

function ActivityRail({
  active,
  setActive,
}: {
  active: string;
  setActive: (value: string) => void;
}) {
  const activities = [
    ["explorer", "Explorer"],
    ["search", "Search"],
    ["git", "Source Control"],
  ] as const;

  return (
    <aside className="activity-rail">
      <div className="activity-list">
        {activities.map(([icon, label]) => (
          <IconButton
            active={active === label}
            key={label}
            label={label}
            onClick={() => setActive(label)}
          >
            <Icon name={icon} size={21} />
          </IconButton>
        ))}
      </div>
      <IconButton label="Settings" onClick={() => setActive("Settings")}>
        <Icon name="settings" size={21} />
      </IconButton>
    </aside>
  );
}

function Explorer({ active }: { active: string }) {
  const [search, setSearch] = useState("");
  const [replace, setReplace] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [settingsQuery, setSettingsQuery] = useState("");
  const [autoSave, setAutoSave] = useState(true);
  const [minimap, setMinimap] = useState(true);

  return (
    <aside className="side-panel">
      <div className="panel-title">
        <span>{active}</span>
        <IconButton label={`More ${active} actions`}>
          <Icon name="more" />
        </IconButton>
      </div>

      {active === "Explorer" && (
        <>
          <div className="section-title">
            <Icon name="chevron" size={13} />
            <span>AEGISCODE</span>
          </div>
          <div className="file-tree">
            {files.map((file) => (
              <button
                className={`file-row ${file.active ? "file-active" : ""} ${file.muted ? "text-muted" : ""}`}
                key={file.label}
                style={{ paddingLeft: `${10 + file.depth * 14}px` }}
                type="button"
              >
                {file.icon === "folder" ? (
                  <Icon name="chevron" size={12} />
                ) : (
                  <span className="tree-spacer" />
                )}
                <span className={file.icon === "folder" ? "folder-icon" : "file-icon"}>
                  <Icon name={file.icon} size={14} />
                </span>
                <span>{file.label}</span>
              </button>
            ))}
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
      )}

      {active === "Search" && (
        <div className="tool-panel">
          <label className="panel-input">
            <Icon name="search" size={13} />
            <input
              aria-label="Search repository"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search"
              value={search}
            />
            <span className="regex-mark">.*</span>
          </label>
          <label className="panel-input">
            <Icon name="chevron" size={12} />
            <input
              aria-label="Replace repository matches"
              onChange={(event) => setReplace(event.target.value)}
              placeholder="Replace"
              value={replace}
            />
          </label>
          <div className="panel-options">
            <span>files to include</span>
            <span>src/**</span>
          </div>
          {search ? (
            <div className="search-results">
              <div className="result-summary">2 results in 1 file</div>
              <button type="button"><Icon name="chevron" size={11} /><Icon name="file" size={13} /><span>App.tsx</span><small>2</small></button>
              <p><span>383</span> text: “{search}”</p>
              <p><span>416</span> setMessage(“{search}”)</p>
            </div>
          ) : (
            <p className="panel-hint">Search across the active repository. Regular expressions are supported.</p>
          )}
        </div>
      )}

      {active === "Source Control" && (
        <div className="tool-panel">
          <div className="repository-line">
            <span className="status-dot" />
            <strong>AEGISCODE</strong>
            <span>main</span>
          </div>
          <textarea
            aria-label="Commit message"
            className="commit-input"
            onChange={(event) => setCommitMessage(event.target.value)}
            placeholder="Message (Ctrl+Enter to commit)"
            rows={3}
            value={commitMessage}
          />
          <button className="primary-action" disabled={!commitMessage.trim()} type="button">Commit</button>
          <div className="change-group">
            <div className="section-title"><Icon name="chevron" size={12} /><span>CHANGES</span><small>2</small></div>
            <button className="change-row" type="button"><span className="change-code">M</span><span>App.tsx</span><small>src</small></button>
            <button className="change-row" type="button"><span className="change-code">M</span><span>index.css</span><small>src</small></button>
          </div>
          <div className="sync-row">
            <span><Icon name="branch" size={13} /> main</span>
            <button type="button">Sync changes</button>
          </div>
        </div>
      )}

      {active === "Settings" && (
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
              <span><strong>Auto Save</strong><small>Save changes automatically</small></span>
              <input checked={autoSave} onChange={() => setAutoSave((value) => !value)} type="checkbox" />
            </label>
            <label className="setting-row">
              <span><strong>Minimap</strong><small>Show code overview</small></span>
              <input checked={minimap} onChange={() => setMinimap((value) => !value)} type="checkbox" />
            </label>
            <label className="setting-row setting-select">
              <span><strong>Tab Size</strong><small>Spaces per indentation</small></span>
              <select aria-label="Editor tab size" defaultValue="2"><option>2</option><option>4</option></select>
            </label>
          </div>
        </div>
      )}
    </aside>
  );
}

function Editor() {
  const [activeTab, setActiveTab] = useState("App.tsx");
  const [language, setLanguage] = useState("TypeScript");
  const [split, setSplit] = useState(false);
  const tabs = ["App.tsx", "Status.tsx"];
  const languageProfiles = ["TypeScript", "JavaScript", "Python", "JSON", "C++"];

  function CodePane({ secondary = false }: { secondary?: boolean }) {
    return (
      <div className="editor-pane">
        {secondary && (
          <div className="split-pane-title">
            <span><Icon name="code" size={13} /> server.config.json</span>
            <IconButton label="Close split editor" onClick={() => setSplit(false)}><Icon name="close" size={13} /></IconButton>
          </div>
        )}
        <div className="code-editor" role="textbox" aria-label={secondary ? "server.config.json code editor" : `${activeTab} code editor`} tabIndex={0}>
          <div className="code-content">
            {(secondary ? [
              <><span className="syntax-blue">{"{"}</span></>,
              <>&nbsp;&nbsp;<span className="syntax-green">"server"</span>: {"{"}</>,
              <>&nbsp;&nbsp;&nbsp;&nbsp;<span className="syntax-green">"port"</span>: <span className="syntax-orange">4173</span>,</>,
              <>&nbsp;&nbsp;&nbsp;&nbsp;<span className="syntax-green">"host"</span>: <span className="syntax-green">"localhost"</span>,</>,
              <>&nbsp;&nbsp;&nbsp;&nbsp;<span className="syntax-green">"sse"</span>: <span className="syntax-pink">true</span></>,
              <>&nbsp;&nbsp;{"}"}</>,
              <>{"}"}</>,
            ] : codeLines).map((line, index) => (
              <div className={`code-line ${!secondary && index === 8 ? "current-line" : ""}`} key={index}>
                <span className="line-number">
                  {!secondary && index === 5 && <span className="diagnostic-dot diagnostic-warning" />}
                  {!secondary && index === 14 && <span className="diagnostic-dot diagnostic-error" />}
                  {index + 1}
                </span>
                <code className={!secondary && index === 14 ? "error-underline" : ""}>{line || "\u00a0"}</code>
              </div>
            ))}
          </div>
          {!secondary && (
            <div className="minimap" aria-hidden="true">
              {Array.from({ length: 18 }, (_, index) => (
                <span key={index} style={{ width: `${26 + ((index * 17) % 48)}%` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <section className="editor">
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
              <Icon name="close" size={12} />
            </button>
          ))}
        </div>
        <div className="editor-actions">
          <IconButton label="Run file"><Icon name="play" /></IconButton>
          <IconButton active={split} label="Split editor" onClick={() => setSplit((value) => !value)}><Icon name="split" /></IconButton>
          <IconButton label="More editor actions"><Icon name="more" /></IconButton>
        </div>
      </div>
      <div className="breadcrumbs">
        <div className="breadcrumb-path">
          <span>src</span><Icon name="chevron" size={11} /><span>{activeTab}</span><Icon name="chevron" size={11} /><Icon name="code" size={12} /><span>LocalServer</span>
        </div>
        <label className="language-profile">
          <span className="lint-ready"><span className="status-dot" /> Lint ready</span>
          <select aria-label="Syntax and lint language" onChange={(event) => setLanguage(event.target.value)} value={language}>
            {languageProfiles.map((profile) => <option key={profile}>{profile}</option>)}
          </select>
        </label>
      </div>
      <div className={`editor-panes ${split ? "editor-panes-split" : ""}`}>
        <CodePane />
        {split && <CodePane secondary />}
      </div>
    </section>
  );
}

function BottomPanel() {
  const [tab, setTab] = useState("Terminal");
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(true);
  const [terminalLines, setTerminalLines] = useState([
    "pnpm dev",
    "Local server ready in 312 ms",
    "➜ Local: http://localhost:4173/",
    "SSE connected · session local-01",
  ]);

  function runCommand() {
    const value = command.trim();
    if (!value) return;

    if (value === "clear") {
      setTerminalLines([]);
    } else if (value === "lint") {
      setTerminalLines((lines) => [...lines, `$ ${value}`, "Lint complete · 1 error, 1 warning · 42 ms"]);
    } else if (value.startsWith("echo ")) {
      setTerminalLines((lines) => [...lines, `$ ${value}`, value.slice(5)]);
    } else {
      setTerminalLines((lines) => [...lines, `$ ${value}`, `command queued locally: ${value}`]);
    }
    setCommand("");
  }

  function copyTerminal() {
    if (navigator.clipboard) void navigator.clipboard.writeText(terminalLines.join("\n"));
  }

  return (
    <section className="bottom-panel">
      <div className="bottom-panel-header">
        <div className="bottom-tabs">
          {["Problems", "Output", "Terminal"].map((name) => (
            <button className={tab === name ? "bottom-tab-active" : ""} key={name} onClick={() => setTab(name)} type="button">
              {name}
              {name === "Problems" && <span className="count-badge">2</span>}
            </button>
          ))}
        </div>
        <div className="panel-controls">
          <span className={running ? "session-running" : "session-stopped"}><span className="status-dot" /> {running ? "SSE connected" : "terminated"}</span>
          <span>zsh</span>
          <IconButton label="Copy terminal output" onClick={copyTerminal}><Icon name="copy" size={14} /></IconButton>
          <IconButton label={running ? "Terminate terminal" : "Restart terminal"} onClick={() => setRunning((value) => !value)}>
            <Icon name={running ? "close" : "play"} size={14} />
          </IconButton>
        </div>
      </div>
      <div className="terminal-output">
        {tab === "Terminal" ? (
          <div className="terminal-session">
            <div className="terminal-history">
              <p><span className="terminal-prompt">aegis</span> <span className="text-muted">~/projects/aegiscode</span> <span className="syntax-blue">main</span></p>
              {terminalLines.map((line, index) => (
                <p className={line.includes("SSE") ? "terminal-event" : line.startsWith("➜") ? "terminal-ok" : ""} key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
            <label className="terminal-command">
              <span className="terminal-prompt">aegis</span>
              <span className="text-muted">$</span>
              <input
                aria-label="Terminal command"
                disabled={!running}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") runCommand();
                  if (event.key === "c" && event.ctrlKey) setRunning(false);
                }}
                placeholder={running ? "Type a command…" : "Terminal terminated"}
                value={command}
              />
              {running && <span className="cursor-block" />}
            </label>
          </div>
        ) : tab === "Problems" ? (
          <div className="problems-list">
            <button type="button">
              <Icon name="error" size={14} />
              <span><strong>JSX element has no corresponding closing tag.</strong><small>typescript · Status.tsx [18, 4]</small></span>
            </button>
            <button type="button">
              <Icon name="warning" size={14} />
              <span><strong>'setState' is assigned but never used.</strong><small>eslint · App.tsx [6, 17]</small></span>
            </button>
          </div>
        ) : (
          <div className="lint-output">
            <p><span className="event-time">10:42:08</span> Starting incremental lint across 5 language profiles</p>
            <p><span className="event-time">10:42:08</span> TypeScript · ESLint adapter ready</p>
            <p><span className="event-time">10:42:08</span> JavaScript · ESLint adapter ready</p>
            <p><span className="event-time">10:42:08</span> Python · Ruff adapter ready</p>
            <p><span className="event-time">10:42:08</span> JSON · parser ready</p>
            <p><span className="event-time">10:42:08</span> C++ · clang-tidy adapter ready</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ChatDrawer({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([
    { role: "agent", text: "I'm connected to your local workspace. What should we build next?" },
  ]);

  function sendMessage() {
    if (!message.trim()) return;
    setMessages((current) => [...current, { role: "user", text: message.trim() }]);
    setMessage("");
  }

  return (
    <aside className="chat-drawer">
      <div className="chat-header">
        <div className="chat-heading">
          <span className="agent-mark"><Icon name="aegis" size={17} /></span>
          <div><strong>AEGIS</strong><span>Workspace agent</span></div>
        </div>
        <IconButton label="Close AEGIS chat" onClick={onClose}><Icon name="close" /></IconButton>
      </div>
      <div className="chat-context">
        <span className="status-dot" />
        <span>App.tsx</span>
        <span className="text-muted">in context</span>
      </div>
      <div className="messages">
        <div className="agent-intro">
          <Icon name="aegis" size={22} />
          <p>Build with your codebase, not around it.</p>
        </div>
        {messages.map((item, index) => (
          <div className={`message message-${item.role}`} key={index}>{item.text}</div>
        ))}
      </div>
      <div className="suggestions">
        <button type="button" onClick={() => setMessage("Explain the active file")}>Explain this file</button>
        <button type="button" onClick={() => setMessage("Fix the current problems")}>Fix 2 problems</button>
      </div>
      <div className="composer">
        <textarea
          aria-label="Message AEGIS"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Ask AEGIS about your code..."
          rows={3}
          value={message}
        />
        <div className="composer-footer">
          <span>Local context</span>
          <IconButton label="Send message" onClick={sendMessage}><Icon name="send" size={15} /></IconButton>
        </div>
      </div>
    </aside>
  );
}

function Header({
  chatOpen,
  onAction,
  openCommands,
  panelOpen,
  sidebarOpen,
  toggleChat,
  togglePanel,
  toggleSidebar,
}: {
  chatOpen: boolean;
  onAction: (action: string) => void;
  openCommands: () => void;
  panelOpen: boolean;
  sidebarOpen: boolean;
  toggleChat: () => void;
  togglePanel: () => void;
  toggleSidebar: () => void;
}) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const menus = [
    { label: "File", items: [["New Text File", "Ctrl+N", "new-file"], ["Open Folder…", "Ctrl+O", "open-folder"], ["Save", "Ctrl+S", "save"]] },
    { label: "Edit", items: [["Undo", "Ctrl+Z", "undo"], ["Redo", "Ctrl+Shift+Z", "redo"], ["Find", "Ctrl+F", "find"]] },
    { label: "View", items: [["Command Palette…", "Ctrl+K", "commands"], ["Toggle Explorer", "Ctrl+B", "sidebar"], ["Toggle Panel", "Ctrl+J", "panel"]] },
    { label: "Run", items: [["Run Without Debugging", "Ctrl+F5", "run"], ["Run Active File", "F5", "run-file"], ["Stop", "Shift+F5", "stop"]] },
    { label: "Terminal", items: [["New Terminal", "Ctrl+Shift+`", "new-terminal"], ["Clear Terminal", "Ctrl+K", "clear-terminal"]] },
  ];

  function runMenuAction(action: string) {
    setActiveMenu(null);
    if (action === "commands") openCommands();
    else if (action === "sidebar") toggleSidebar();
    else if (action === "panel" || action === "new-terminal") togglePanel();
    else onAction(action);
  }

  return (
    <header className="header">
      <div className="brand-zone">
        <div className="traffic-lights" aria-label="Window controls">
          <span className="traffic-close" />
          <span className="traffic-minimize" />
          <span className="traffic-expand" />
        </div>
        <div className="brand">
          <span className="brand-mark"><Icon name="aegis" size={19} /></span>
          <span>AEGIS<span className="brand-code">CODE</span></span>
        </div>
        <nav className="app-menus" aria-label="Application menu">
          {menus.map((menu) => (
            <div className="app-menu" key={menu.label}>
              <button
                className={activeMenu === menu.label ? "app-menu-active" : ""}
                onClick={() => setActiveMenu((active) => active === menu.label ? null : menu.label)}
                type="button"
              >
                {menu.label}
              </button>
              {activeMenu === menu.label && (
                <div className="menu-dropdown">
                  {menu.items.map(([label, shortcut, action]) => (
                    <button key={label} onClick={() => runMenuAction(action)} type="button">
                      <span>{label}</span>
                      <kbd>{shortcut}</kbd>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>
      <button className="command-search" onClick={openCommands} type="button">
        <Icon name="search" size={14} />
        <span>Search files, commands, symbols...</span>
        <kbd>⌘ K</kbd>
      </button>
      <div className="header-actions">
        <IconButton active={panelOpen} label="Toggle bottom panel" onClick={togglePanel}><Icon name="panel" /></IconButton>
        <IconButton active={sidebarOpen} label="Toggle primary sidebar" onClick={toggleSidebar}><Icon name="layout" /></IconButton>
        <IconButton active={chatOpen} label="Toggle AEGIS chat" onClick={toggleChat}><Icon name="aegis" /></IconButton>
      </div>
    </header>
  );
}

function CommandPalette({
  close,
  selectActivity,
}: {
  close: () => void;
  selectActivity: (activity: string) => void;
}) {
  const [query, setQuery] = useState("");
  const commands = [
    { activity: "Explorer", detail: "Navigate repository files", label: "View: Show Explorer" },
    { activity: "Search", detail: "Search and replace across files", label: "Search: Find in Files" },
    { activity: "Source Control", detail: "Review pending changes", label: "Git: Open Source Control" },
    { activity: "Settings", detail: "Configure the workbench", label: "Preferences: Open Settings" },
  ];
  const results = commands.filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="palette-backdrop" onMouseDown={close} role="presentation">
      <div className="command-palette" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-label="Command palette">
        <label className="palette-input">
          <Icon name="chevron" size={15} />
          <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder="Type a command or search..." value={query} />
          <kbd>Esc</kbd>
        </label>
        <div className="command-results">
          <span className="command-section">COMMANDS</span>
          {results.map((command, index) => (
            <button
              className={index === 0 ? "command-active" : ""}
              key={command.label}
              onClick={() => {
                selectActivity(command.activity);
                close();
              }}
              type="button"
            >
              <Icon name={command.activity === "Explorer" ? "explorer" : command.activity === "Search" ? "search" : command.activity === "Source Control" ? "git" : "settings"} size={15} />
              <span><strong>{command.label}</strong><small>{command.detail}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBar() {
  const [activePanel, setActivePanel] = useState<"branch" | "notifications" | "problems" | null>(null);
  const [branch, setBranch] = useState("main");
  const [notifications, setNotifications] = useState([
    { detail: "TypeScript found one syntax error", read: false, time: "now", title: "Lint completed" },
    { detail: "Local server is available on port 4173", read: false, time: "2m", title: "Server ready" },
    { detail: "Working tree has two modified files", read: true, time: "5m", title: "Git status changed" },
  ]);
  const unread = notifications.filter((notification) => !notification.read).length;

  function togglePanel(panel: "branch" | "notifications" | "problems") {
    setActivePanel((active) => active === panel ? null : panel);
  }

  return (
    <footer className="status-bar">
      <div className="status-group">
        <button className={activePanel === "branch" ? "status-button-active" : ""} onClick={() => togglePanel("branch")} type="button">
          <Icon name="branch" size={13} /> {branch}*
        </button>
        <button className={activePanel === "problems" ? "status-button-active" : ""} onClick={() => togglePanel("problems")} type="button">
          <Icon name="error" size={13} /> 1
          <Icon name="warning" size={13} /> 1
        </button>
      </div>
      <div className="status-group">
        <span className="status-item">Ln 9, Col 24</span>
        <span className="status-item">Spaces: 2</span>
        <span className="status-item">UTF-8</span>
        <span className="status-item">TypeScript React</span>
        <span className="status-item"><span className="status-dot" /> Local</span>
        <button
          aria-label={`${unread} unread notifications`}
          className={activePanel === "notifications" ? "status-button-active notification-button" : "notification-button"}
          onClick={() => togglePanel("notifications")}
          type="button"
        >
          <Icon name="bell" size={13} />
          {unread > 0 && <span className="notification-count">{unread}</span>}
        </button>
      </div>

      {activePanel === "branch" && (
        <div className="status-popover branch-popover">
          <div className="status-popover-header">
            <span>ACTIVE BRANCH</span>
            <strong>{branch}</strong>
          </div>
          {["main", "feature/editor-split", "develop"].map((name) => (
            <button
              className={branch === name ? "popover-row-active" : ""}
              key={name}
              onClick={() => {
                setBranch(name);
                setActivePanel(null);
              }}
              type="button"
            >
              <Icon name="branch" size={14} />
              <span>{name}</span>
              {branch === name && <small>current</small>}
            </button>
          ))}
          <div className="branch-meta">2 modified files · 0 ahead · 0 behind</div>
        </div>
      )}

      {activePanel === "problems" && (
        <div className="status-popover problem-popover">
          <div className="status-popover-header">
            <span>PROBLEMS</span>
            <strong>2 total</strong>
          </div>
          <button type="button">
            <Icon name="error" size={14} />
            <span><strong>Missing closing JSX tag</strong><small>Status.tsx · line 18, column 4</small></span>
          </button>
          <button type="button">
            <Icon name="warning" size={14} />
            <span><strong>Unused state setter</strong><small>App.tsx · line 6, column 17</small></span>
          </button>
          <div className="problem-summary"><span className="syntax-pink">1 error</span><span className="syntax-orange">1 warning</span><span>TypeScript</span></div>
        </div>
      )}

      {activePanel === "notifications" && (
        <div className="status-popover notification-popover">
          <div className="status-popover-header">
            <span>NOTIFICATIONS</span>
            <button onClick={() => setNotifications((items) => items.map((item) => ({ ...item, read: true })))} type="button">Mark all read</button>
          </div>
          {notifications.map((notification, index) => (
            <button
              className={!notification.read ? "notification-unread" : ""}
              key={`${notification.title}-${notification.time}`}
              onClick={() => setNotifications((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, read: true } : item))}
              type="button"
            >
              <span className="notification-state" />
              <span><strong>{notification.title}</strong><small>{notification.detail}</small></span>
              <time>{notification.time}</time>
            </button>
          ))}
          <div className="notification-footer">Local workspace events only</div>
        </div>
      )}
    </footer>
  );
}

export default function App() {
  const [activity, setActivity] = useState("Explorer");
  const [chatOpen, setChatOpen] = useState(true);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toast, setToast] = useState("");
  const gridClass = useMemo(
    () => `${chatOpen ? "workspace-chat-open" : "workspace-chat-closed"} ${sidebarOpen ? "" : "workspace-sidebar-closed"}`,
    [chatOpen, sidebarOpen],
  );

  function showAction(action: string) {
    const messages: Record<string, string> = {
      "clear-terminal": "Terminal output cleared",
      "find": "Find widget opened for App.tsx",
      "new-file": "Untitled-1 created",
      "open-folder": "Folder picker ready",
      "redo": "Nothing to redo",
      "run": "Run session queued without debugging",
      "run-file": "Running App.tsx",
      "save": "App.tsx saved",
      "stop": "Active run session stopped",
      "undo": "Last editor action reverted",
    };
    setToast(messages[action] ?? "Command completed");
    window.setTimeout(() => setToast(""), 2200);
  }

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandsOpen(true);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault();
        setPanelOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setToast("App.tsx saved");
        window.setTimeout(() => setToast(""), 2200);
      }
      if (event.key === "Escape") setCommandsOpen(false);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <div className="app-shell">
      <Header
        chatOpen={chatOpen}
        onAction={showAction}
        openCommands={() => setCommandsOpen(true)}
        panelOpen={panelOpen}
        sidebarOpen={sidebarOpen}
        toggleChat={() => setChatOpen((open) => !open)}
        togglePanel={() => setPanelOpen((open) => !open)}
        toggleSidebar={() => setSidebarOpen((open) => !open)}
      />
      <main className={`workspace ${gridClass}`}>
        <ActivityRail active={activity} setActive={setActivity} />
        {sidebarOpen && <Explorer active={activity} />}
        <div className={`workbench ${panelOpen ? "" : "workbench-panel-closed"}`}>
          <Editor />
          {panelOpen && <BottomPanel />}
        </div>
        {chatOpen && <ChatDrawer onClose={() => setChatOpen(false)} />}
      </main>
      <StatusBar />
      {commandsOpen && <CommandPalette close={() => setCommandsOpen(false)} selectActivity={setActivity} />}
      {toast && (
        <div className="action-toast" role="status">
          <span className="status-dot" />
          <span>{toast}</span>
          <IconButton label="Dismiss notification" onClick={() => setToast("")}><Icon name="close" size={13} /></IconButton>
        </div>
      )}
    </div>
  );
}
