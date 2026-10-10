import { useWorkbench } from "../../../context/WorkbenchContext";

interface ChatSuggestionsProps {
  onSelectSuggestion: (text: string) => void;
}

export function ChatSuggestions({ onSelectSuggestion }: ChatSuggestionsProps) {
  const { activeTab } = useWorkbench();

  return (
    <div className="suggestions">
      <button
        onClick={() => onSelectSuggestion(`Explain the active file: ${activeTab}`)}
        type="button"
      >
        Explain this file
      </button>
      <button
        onClick={() => onSelectSuggestion("Fix the current problems in workspace")}
        type="button"
      >
        Fix 2 problems
      </button>
    </div>
  );
}
