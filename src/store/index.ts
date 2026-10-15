import { create } from "zustand"
import type { WorkbenchStore } from "./types"
import { createLayoutSlice } from "./slices/createLayoutSlice"
import { createSettingsSlice } from "./slices/createSettingsSlice"
import { createEditorSlice } from "./slices/createEditorSlice"
import { createWorkspaceSlice } from "./slices/createWorkspaceSlice"
import { createGitSlice } from "./slices/createGitSlice"
import { createTerminalSlice } from "./slices/createTerminalSlice"
import { createChatSlice } from "./slices/createChatSlice"
import { createDebugSlice } from "./slices/createDebugSlice"

export const useWorkbenchStore = create<WorkbenchStore>()(
  (set, get, store) => ({
    ...createLayoutSlice(set, get, store),
    ...createSettingsSlice(set, get, store),
    ...createEditorSlice(set, get, store),
    ...createWorkspaceSlice(set, get, store),
    ...createGitSlice(set, get, store),
    ...createTerminalSlice(set, get, store),
    ...createChatSlice(set, get, store),
    ...createDebugSlice(set, get, store),
  }),
)

declare global {
  interface Window {
    useWorkbenchStore?: typeof useWorkbenchStore
  }
}

if (typeof window !== "undefined") {
  window.useWorkbenchStore = useWorkbenchStore
}

export * from "./types"
export { useShallow } from "zustand/react/shallow"
