import { useState } from "react";
import { useWorkbench } from "../../../context/WorkbenchContext";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ChatSuggestions } from "./ChatSuggestions";
import { ChatComposer } from "./ChatComposer";

export function ChatDrawer() {
  const { sendChatMessage } = useWorkbench();
  const [inputMessage, setInputMessage] = useState("");

  function handleSend() {
    if (!inputMessage.trim()) return;
    sendChatMessage(inputMessage);
    setInputMessage("");
  }

  return (
    <aside className="chat-drawer">
      <ChatHeader />
      <ChatMessageList />
      <ChatSuggestions onSelectSuggestion={(text) => setInputMessage(text)} />
      <ChatComposer
        onChange={setInputMessage}
        onSend={handleSend}
        value={inputMessage}
      />
    </aside>
  );
}
