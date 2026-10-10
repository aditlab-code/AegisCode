import { Icon } from "../../ui/Icon";
import { IconButton } from "../../ui/IconButton";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
}

export function ChatComposer({ value, onChange, onSend }: ChatComposerProps) {
  return (
    <div className="composer">
      <textarea
        aria-label="Message AEGIS"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        placeholder="Ask AEGIS about your code..."
        rows={3}
        value={value}
      />
      <div className="composer-footer">
        <span>Local context</span>
        <IconButton label="Send message" onClick={onSend}>
          <Icon name="send" size={15} />
        </IconButton>
      </div>
    </div>
  );
}
