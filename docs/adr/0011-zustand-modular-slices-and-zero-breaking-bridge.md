# 0011. Zustand Modular Slice Architecture and Zero-Breaking Bridge

We decided to transition AegisCode's state management from a monolithic React Context hook (`useWorkbenchFacade` at 1,404 lines) to a domain-sliced Zustand store (`useWorkbenchStore`) backed by atomic selectors, `useShallow`, and vanilla background stream integration.

### Context & Problem
Under the previous React Context architecture, any high-frequency state update—such as typing in the editor, cursor movement (`cursorPosition`), token chunks during AI chat streaming, or PTY terminal output downlinks—triggered a full-tree re-render cascade across all ~38 UI components consuming `useWorkbench()`. This caused UI latency, potential input stutter, and layout thrashing.

### Decision & Architecture
1. **Domain-Driven Modular Slices**: Rather than maintaining a single monolithic store, state and actions are strictly partitioned into isolated domain slice files under `src/store/slices/`:
   - `createLayoutSlice.ts`: Layout geometry, split panels, bottom panel tabs, command palette, and UI theme.
   - `createEditorSlice.ts`: Editor groups, active tabs, split pane states, find widget, cursor, and breakpoints.
   - `createWorkspaceSlice.ts`: File tree hierarchy, in-memory file buffers, dirty state, diagnostics, and notifications.
   - `createGitSlice.ts`: Git status, staged/unstaged changes, branches, commit graph, and diff tabs.
   - `createTerminalSlice.ts`: Multi-session PTY terminal management, lines buffer, and command dispatch.
   - `createChatSlice.ts`: Multi-session AI chats, message history, streaming tokens, and prompt context extraction.
   - `createSettingsSlice.ts`: Application configuration (editor, files, appearance, linter, companion, agent).
   - `createDebugSlice.ts`: DAP debugger session state, Delve/debugpy workflows, breakpoints synchronization, and runner.
   Each slice implements `SliceCreator<T>` (`StateCreator<WorkbenchStore, [], [], T>`), allowing cross-slice state inspection via `get()` without circular dependencies.

2. **Root Assembly & Zero-Breaking Bridge**:
   All slices are composed into a unified root store `useWorkbenchStore` via `create<WorkbenchStore>()(...)`. To preserve zero regressions and eliminate simultaneous refactoring across 38 files, `useWorkbench()` is retained as a compatibility bridge returning `useWorkbenchStore()`. `WorkbenchProvider` acts as a lifecycle host for non-rendering side effects (window resize observer, global keyboard shortcuts, DAP SSE listener, and auto-save timers).

3. **Atomic Selectors & `useShallow`**:
   High-frequency components are migrated to atomic selectors. When subscribing to multiple state fields simultaneously, components MUST use `useShallow` from `zustand/react/shallow` (e.g., `useWorkbenchStore(useShallow(s => ({ activeTab: s.activeTab, isDirty: s.isDirty })))`) to guarantee re-renders only occur when shallow equality fails.

4. **Vanilla Store API for Background Streams**:
   High-throughput background streams (SSE AI token streaming, PTY terminal output, and disk file change events) mutate state directly via `useWorkbenchStore.getState()` without going through React dispatch cycles.

5. **Pure Logic Function Preservation**:
   All pure transition functions (e.g., `openTabInGroupLogic`, `stageChangeLogic`, `addFileToTreeLogic`, `reorderBottomTabsLogic`) remain preserved and exported 1:1, guaranteeing 100% test compatibility across all existing Vitest test suites.
