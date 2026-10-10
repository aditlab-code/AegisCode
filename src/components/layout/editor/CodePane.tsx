import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";
import { Minimap } from "./Minimap";

interface CodePaneProps {
  lines: ReactNode[];
  title: string;
  secondary?: boolean;
  onClose?: () => void;
}

export function CodePane({
  lines,
  title,
  secondary = false,
  onClose,
}: CodePaneProps) {
  return (
    <div className="editor-pane relative">
      {secondary && (
        <div className="split-pane-title">
          <span>
            <Icon name="code" size={13} /> {title}
          </span>
          <IconButton label="Close split editor" onClick={onClose}>
            <Icon name="close" size={13} />
          </IconButton>
        </div>
      )}
      <div
        aria-label={`${title} code editor`}
        className="code-editor"
        role="textbox"
        tabIndex={0}
      >
        <div className="code-content">
          {lines.map((line, index) => (
            <div
              className={`code-line ${!secondary && index === 8 ? "current-line" : ""}`}
              key={index}
            >
              <span className="line-number">
                {!secondary && index === 5 && (
                  <span className="diagnostic-dot diagnostic-warning" />
                )}
                {!secondary && index === 14 && (
                  <span className="diagnostic-dot diagnostic-error" />
                )}
                {index + 1}
              </span>
              <code className={!secondary && index === 14 ? "error-underline" : ""}>
                {line || "\u00a0"}
              </code>
            </div>
          ))}
        </div>
        {!secondary && <Minimap lineCount={18} />}
      </div>
    </div>
  );
}
