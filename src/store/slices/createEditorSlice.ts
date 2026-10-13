import type {
  ActivityType,
  EditorGroupState,
  EditorSelectionRange,
  FindWidgetState,
  MinimapScale,
} from "../../types/workbench"
import type { CursorCoordinates } from "../../context/core/workspaceCore"
import type { ConfirmCloseState } from "../../context/core/workbenchFacade"
import { setBreakpoints } from "../../utils/debugApi"
import type { EditorSlice, SliceCreator } from "../types"

export interface TabMoveResult {
  source: EditorGroupState
  target: EditorGroupState
}

export interface BothGroupsResult {
  group1: EditorGroupState
  group2: EditorGroupState
}

export type ActiveDebugLine = {
  file: string
  line: number
} | null

// Pure state transition functions for editor groups and tabs
export function openTabInGroupLogic(
  group: EditorGroupState,
  filename: string,
): EditorGroupState {
  if (!filename) return group
  const hasTab = group.tabs.includes(filename)
  return {
    ...group,
    tabs: hasTab ? group.tabs : [...group.tabs, filename],
    activeTab: filename,
  }
}

export function closeTabInGroupLogic(
  group: EditorGroupState,
  filename: string,
): EditorGroupState {
  const nextTabs = group.tabs.filter((t) => t !== filename)
  if (nextTabs.length === 0) {
    return {
      ...group,
      tabs: [],
      activeTab: "",
    }
  }
  const nextActive =
    group.activeTab === filename ? nextTabs[0] || "" : group.activeTab
  return {
    ...group,
    tabs: nextTabs,
    activeTab: nextActive,
  }
}

export function setActiveTabInGroupLogic(
  group: EditorGroupState,
  filename: string,
): EditorGroupState {
  return {
    ...group,
    activeTab: filename,
  }
}

export function moveTabBetweenGroupsLogic(
  source: EditorGroupState,
  target: EditorGroupState,
  filename: string,
  targetIndex?: number,
): TabMoveResult {
  // Remove from source
  const srcFiltered = source.tabs.filter((t) => t !== filename)
  const nextSrc: EditorGroupState = {
    ...source,
    tabs: srcFiltered,
    activeTab:
      source.activeTab === filename ? srcFiltered[0] || "" : source.activeTab,
  }

  // Add to target
  const newTabs = [...target.tabs]
  if (
    typeof targetIndex === "number" &&
    targetIndex >= 0 &&
    targetIndex <= newTabs.length
  ) {
    newTabs.splice(targetIndex, 0, filename)
  } else if (!newTabs.includes(filename)) {
    newTabs.push(filename)
  }

  const nextTarget: EditorGroupState = {
    ...target,
    tabs: newTabs,
    activeTab: filename,
  }

  return { source: nextSrc, target: nextTarget }
}

export function reorderTabsInGroupLogic(
  group: EditorGroupState,
  sourceIndex: number,
  targetIndex: number,
): EditorGroupState {
  if (
    sourceIndex < 0 ||
    sourceIndex >= group.tabs.length ||
    targetIndex < 0 ||
    targetIndex >= group.tabs.length ||
    sourceIndex === targetIndex
  ) {
    return group
  }
  const newTabs = [...group.tabs]
  const [moved] = newTabs.splice(sourceIndex, 1)
  newTabs.splice(targetIndex, 0, moved)
  return {
    ...group,
    tabs: newTabs,
  }
}

export function renameTabInAllGroupsLogic(
  group1: EditorGroupState,
  group2: EditorGroupState,
  oldName: string,
  newName: string,
): BothGroupsResult {
  const g1Next: EditorGroupState = {
    ...group1,
    tabs: group1.tabs.map((t) => (t === oldName ? newName : t)),
    activeTab: group1.activeTab === oldName ? newName : group1.activeTab,
  }
  const g2Next: EditorGroupState = {
    ...group2,
    tabs: group2.tabs.map((t) => (t === oldName ? newName : t)),
    activeTab: group2.activeTab === oldName ? newName : group2.activeTab,
  }
  return { group1: g1Next, group2: g2Next }
}

export function removeTabFromAllGroupsLogic(
  group1: EditorGroupState,
  group2: EditorGroupState,
  filename: string,
): BothGroupsResult {
  return {
    group1: closeTabInGroupLogic(group1, filename),
    group2: closeTabInGroupLogic(group2, filename),
  }
}

export function loadStoredMinimapEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    const stored = window.localStorage.getItem("aegis_minimap_enabled")
    if (stored !== null) return stored === "true"
  } catch {}
  return true
}

export function loadStoredMinimapScale(): MinimapScale {
  if (typeof window === "undefined") return "medium"
  try {
    const stored = window.localStorage.getItem("aegis_minimap_scale")
    if (stored === "small" || stored === "medium" || stored === "large") {
      return stored
    }
  } catch {}
  return "medium"
}

export function loadStoredTabSize(): number {
  if (typeof window === "undefined") return 2
  try {
    const stored = window.localStorage.getItem("aegis_tab_size")
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (parsed === 2 || parsed === 4) return parsed
    }
  } catch {}
  return 2
}

function getDerivedEditorState(
  group1: EditorGroupState,
  group2: EditorGroupState,
  focusedGroup: "group1" | "group2",
  splitEditor: boolean,
) {
  const currentFocusedFile =
    focusedGroup === "group2" && splitEditor
      ? group2.activeTab
      : group1.activeTab
  return {
    currentFocusedFile: currentFocusedFile || null,
    activeTab: currentFocusedFile || "",
    secondaryActiveTab: group2.activeTab || "",
    tabs: Array.from(new Set([...group1.tabs, ...group2.tabs])),
    focusedPane: (focusedGroup === "group2"
      ? "secondary"
      : "primary") as "primary" | "secondary",
  }
}

const initialGroup1: EditorGroupState = {
  id: "group1",
  name: "Group 1",
  tabs: [],
  activeTab: "",
}

const initialGroup2: EditorGroupState = {
  id: "group2",
  name: "Group 2",
  tabs: [],
  activeTab: "",
}

export const createEditorSlice: SliceCreator<EditorSlice> = (set, get) => ({
  splitEditor: false,
  setSplitEditor: (split) => {
    const next = typeof split === "function" ? split(get().splitEditor) : split
    const focusedGroup =
      !next && get().focusedGroup === "group2" ? "group1" : get().focusedGroup
    set({
      splitEditor: next,
      focusedGroup,
      ...getDerivedEditorState(get().group1, get().group2, focusedGroup, next),
    })
  },
  toggleSplitEditor: () => {
    const curr = get().splitEditor
    if (curr) {
      get().setSplitEditor(false)
      get().setFocusedGroup("group1")
    } else {
      let g2 = get().group2
      if (g2.tabs.length === 0) {
        const candidate = get().group1.activeTab || get().group1.tabs[0] || ""
        if (candidate) {
          g2 = {
            ...g2,
            tabs: [candidate],
            activeTab: candidate,
          }
        }
      }
      set({
        splitEditor: true,
        focusedGroup: "group2",
        group2: g2,
        ...getDerivedEditorState(get().group1, g2, "group2", true),
      })
    }
  },
  closeSplitEditor: () => {
    get().setSplitEditor(false)
    get().setFocusedGroup("group1")
  },
  splitRatio: 50,
  setSplitRatio: (ratio) => set({ splitRatio: ratio }),

  group1: initialGroup1,
  group2: initialGroup2,
  focusedGroup: "group1",
  setFocusedGroup: (g) => {
    set({
      focusedGroup: g,
      ...getDerivedEditorState(
        get().group1,
        get().group2,
        g,
        get().splitEditor,
      ),
    })
  },

  openFileInGroup: (filename: string, group?: "group1" | "group2") => {
    if (!filename) return
    const targetGroup = group || get().focusedGroup

    // Cross-slice buffer loading
    if (typeof get().ensureFileBuffer === "function") {
      void get().ensureFileBuffer(filename)
    }

    if (targetGroup === "group2") {
      const nextG2 = openTabInGroupLogic(get().group2, filename)
      set({
        group2: nextG2,
        splitEditor: true,
        focusedGroup: "group2",
        ...getDerivedEditorState(get().group1, nextG2, "group2", true),
      })
    } else {
      const nextG1 = openTabInGroupLogic(get().group1, filename)
      set({
        group1: nextG1,
        focusedGroup: "group1",
        ...getDerivedEditorState(
          nextG1,
          get().group2,
          "group1",
          get().splitEditor,
        ),
      })
    }
  },

  closeTabInGroup: (group: "group1" | "group2", filename: string) => {
    const buf = get().fileBuffers?.[filename]
    if (buf?.isDirty) {
      set({ confirmCloseFile: { group, filename } })
      return
    }
    get().forceCloseTabInGroup(group, filename)
  },

  forceCloseTabInGroup: (group: "group1" | "group2", filename: string) => {
    if (group === "group2") {
      const nextG2 = closeTabInGroupLogic(get().group2, filename)
      const shouldCloseSplit = nextG2.tabs.length === 0
      const nextSplit = shouldCloseSplit ? false : get().splitEditor
      const nextFocused = shouldCloseSplit ? "group1" : get().focusedGroup
      set({
        group2: nextG2,
        splitEditor: nextSplit,
        focusedGroup: nextFocused,
        ...getDerivedEditorState(get().group1, nextG2, nextFocused, nextSplit),
      })
    } else {
      const nextG1 = closeTabInGroupLogic(get().group1, filename)
      set({
        group1: nextG1,
        ...getDerivedEditorState(
          nextG1,
          get().group2,
          get().focusedGroup,
          get().splitEditor,
        ),
      })
    }
  },

  setActiveTabInGroup: (group: "group1" | "group2", filename: string) => {
    if (group === "group2") {
      const nextG2 = setActiveTabInGroupLogic(get().group2, filename)
      set({
        group2: nextG2,
        focusedGroup: "group2",
        ...getDerivedEditorState(
          get().group1,
          nextG2,
          "group2",
          get().splitEditor,
        ),
      })
    } else {
      const nextG1 = setActiveTabInGroupLogic(get().group1, filename)
      set({
        group1: nextG1,
        focusedGroup: "group1",
        ...getDerivedEditorState(
          nextG1,
          get().group2,
          "group1",
          get().splitEditor,
        ),
      })
    }
  },

  moveTabBetweenGroups: (
    arg1: string,
    arg2: "group1" | "group2",
    arg3?: "group1" | "group2" | string,
    arg4?: number,
  ) => {
    let sourceGroup: "group1" | "group2"
    let targetGroup: "group1" | "group2"
    let filename: string
    let targetIndex: number | undefined

    if (arg1 === "group1" || arg1 === "group2") {
      sourceGroup = arg1
      targetGroup = (arg2 as "group1" | "group2")
      filename = arg3 as string || ""
      targetIndex = arg4
    } else {
      filename = arg1
      sourceGroup = arg2
      targetGroup = arg3 as "group1" | "group2" || "group1"
      targetIndex = arg4
    }

    if (sourceGroup === targetGroup || !filename) return

    if (sourceGroup === "group1" && targetGroup === "group2") {
      const res = moveTabBetweenGroupsLogic(
        get().group1,
        get().group2,
        filename,
        targetIndex,
      )
      set({
        group1: res.source,
        group2: res.target,
        splitEditor: true,
        focusedGroup: "group2",
        ...getDerivedEditorState(res.source, res.target, "group2", true),
      })
    } else if (sourceGroup === "group2" && targetGroup === "group1") {
      const res = moveTabBetweenGroupsLogic(
        get().group2,
        get().group1,
        filename,
        targetIndex,
      )
      const shouldCloseSplit = res.source.tabs.length === 0
      const nextSplit = shouldCloseSplit ? false : get().splitEditor
      const nextFocused = shouldCloseSplit ? "group1" : get().focusedGroup
      set({
        group2: res.source,
        group1: res.target,
        splitEditor: nextSplit,
        focusedGroup: nextFocused,
        ...getDerivedEditorState(
          res.target,
          res.source,
          nextFocused,
          nextSplit,
        ),
      })
    }
  },

  reorderTabsInGroup: (
    group: "group1" | "group2",
    sourceIndex: number,
    targetIndex: number,
  ) => {
    if (group === "group1") {
      const nextG1 = reorderTabsInGroupLogic(
        get().group1,
        sourceIndex,
        targetIndex,
      )
      set({
        group1: nextG1,
        ...getDerivedEditorState(
          nextG1,
          get().group2,
          get().focusedGroup,
          get().splitEditor,
        ),
      })
    } else {
      const nextG2 = reorderTabsInGroupLogic(
        get().group2,
        sourceIndex,
        targetIndex,
      )
      set({
        group2: nextG2,
        ...getDerivedEditorState(
          get().group1,
          nextG2,
          get().focusedGroup,
          get().splitEditor,
        ),
      })
    }
  },

  focusedPane: "primary",
  setFocusedPane: (p: "primary" | "secondary") => {
    get().setFocusedGroup(p === "secondary" ? "group2" : "group1")
  },

  secondaryActiveTab: "",
  setSecondaryActiveTab: (tab: string) => {
    get().setActiveTabInGroup("group2", tab)
  },

  openFileInPane: (filename: string) => {
    get().openFileInGroup(filename, get().focusedGroup)
  },

  activeActivity: "Explorer",
  setActiveActivity: (a: ActivityType) => set({ activeActivity: a }),

  activeTab: "",
  setActiveTab: (t: string) => {
    get().openFileInGroup(t, get().focusedGroup)
  },

  tabs: [],
  closeTab: (tabToClose?: string) => {
    const target = tabToClose || get().activeTab
    if (!target) return
    get().closeTabInGroup(get().focusedGroup, target)
  },
  closeAllTabs: (targetGroup?: "group1" | "group2") => {
    const groupsToCheck: ("group1" | "group2")[] = targetGroup
      ? [targetGroup]
      : get().splitEditor
        ? ["group1", "group2"]
        : ["group1"]

    // Check for dirty tabs in targeted groups first
    for (const grp of groupsToCheck) {
      const gState = grp === "group1" ? get().group1 : get().group2
      for (const tab of gState.tabs) {
        if (get().fileBuffers?.[tab]?.isDirty) {
          set({ confirmCloseFile: { group: grp, filename: tab } })
          return
        }
      }
    }

    // No dirty tabs, clear tabs
    if (!targetGroup) {
      const g1Empty: EditorGroupState = {
        ...get().group1,
        tabs: [],
        activeTab: "",
      }
      const g2Empty: EditorGroupState = {
        ...get().group2,
        tabs: [],
        activeTab: "",
      }
      set({
        group1: g1Empty,
        group2: g2Empty,
        splitEditor: false,
        focusedGroup: "group1",
        ...getDerivedEditorState(g1Empty, g2Empty, "group1", false),
      })
    } else if (targetGroup === "group1") {
      const g1Empty: EditorGroupState = {
        ...get().group1,
        tabs: [],
        activeTab: "",
      }
      set({
        group1: g1Empty,
        ...getDerivedEditorState(
          g1Empty,
          get().group2,
          get().focusedGroup,
          get().splitEditor,
        ),
      })
    } else {
      const g2Empty: EditorGroupState = {
        ...get().group2,
        tabs: [],
        activeTab: "",
      }
      set({
        group2: g2Empty,
        splitEditor: false,
        focusedGroup: "group1",
        ...getDerivedEditorState(get().group1, g2Empty, "group1", false),
      })
    }
  },

  minimapEnabled: loadStoredMinimapEnabled(),
  setMinimapEnabled: (val) => {
    const next = typeof val === "function" ? val(get().minimapEnabled) : val
    try {
      window.localStorage?.setItem("aegis_minimap_enabled", String(next))
    } catch {}
    set({ minimapEnabled: next })
  },
  toggleMinimap: () => {
    get().setMinimapEnabled((v) => !v)
  },

  minimapScale: loadStoredMinimapScale(),
  setMinimapScale: (scale: MinimapScale) => {
    try {
      window.localStorage?.setItem("aegis_minimap_scale", scale)
    } catch {}
    set({ minimapScale: scale })
  },

  findStateGroup1: { isOpen: false, isReplaceOpen: false },
  findStateGroup2: { isOpen: false, isReplaceOpen: false },
  setFindStateGroup1: (s) =>
    set((state) => ({
      findStateGroup1: typeof s === "function" ? s(state.findStateGroup1) : s,
    })),
  setFindStateGroup2: (s) =>
    set((state) => ({
      findStateGroup2: typeof s === "function" ? s(state.findStateGroup2) : s,
    })),
  openFind: (group?: "group1" | "group2", replace = false) => {
    const target = group || get().focusedGroup
    if (target === "group1") {
      set({ findStateGroup1: { isOpen: true, isReplaceOpen: replace } })
    } else {
      set({ findStateGroup2: { isOpen: true, isReplaceOpen: replace } })
    }
  },
  closeFind: (group?: "group1" | "group2") => {
    const target = group || get().focusedGroup
    if (target === "group1") {
      set((state) => ({
        findStateGroup1: { ...state.findStateGroup1, isOpen: false },
      }))
    } else {
      set((state) => ({
        findStateGroup2: { ...state.findStateGroup2, isOpen: false },
      }))
    }
  },
  toggleFind: (group?: "group1" | "group2", replace = false) => {
    const target = group || get().focusedGroup
    if (target === "group1") {
      set((state) => ({
        findStateGroup1: {
          isOpen:
            !state.findStateGroup1.isOpen ||
            (replace && !state.findStateGroup1.isReplaceOpen),
          isReplaceOpen: replace ? true : state.findStateGroup1.isReplaceOpen,
        },
      }))
    } else {
      set((state) => ({
        findStateGroup2: {
          isOpen:
            !state.findStateGroup2.isOpen ||
            (replace && !state.findStateGroup2.isReplaceOpen),
          isReplaceOpen: replace ? true : state.findStateGroup2.isReplaceOpen,
        },
      }))
    }
  },

  cursorPosition: { line: 1, col: 1 },
  setCursorPosition: (pos: CursorCoordinates) => set({ cursorPosition: pos }),

  selection: { startLine: 1, endLine: 1, selectedText: "" },
  setSelection: (sel: EditorSelectionRange) => set({ selection: sel }),

  currentFocusedFile: null,

  renameTabsInBothGroups: (oldPath: string, newPath: string) => {
    const res = renameTabInAllGroupsLogic(
      get().group1,
      get().group2,
      oldPath,
      newPath,
    )
    set({
      group1: res.group1,
      group2: res.group2,
      ...getDerivedEditorState(
        res.group1,
        res.group2,
        get().focusedGroup,
        get().splitEditor,
      ),
    })
  },

  closeTabInBothGroups: (filename: string) => {
    get().forceCloseTabInGroup("group1", filename)
    get().forceCloseTabInGroup("group2", filename)
  },

  resetAllGroups: () => {
    const g1: EditorGroupState = {
      id: "group1",
      name: "Group 1",
      tabs: [],
      activeTab: "",
    }
    const g2: EditorGroupState = {
      id: "group2",
      name: "Group 2",
      tabs: [],
      activeTab: "",
    }
    set({
      group1: g1,
      group2: g2,
      splitEditor: false,
      focusedGroup: "group1",
      ...getDerivedEditorState(g1, g2, "group1", false),
    })
  },

  tabSize: loadStoredTabSize(),
  setTabSize: (size: number) => {
    try {
      window.localStorage?.setItem("aegis_tab_size", String(size))
    } catch {}
    set({ tabSize: size })
  },
  toggleTabSize: () => {
    const next = get().tabSize === 2 ? 4 : 2
    get().setTabSize(next)
  },

  encoding: "UTF-8",
  setEncoding: (enc: string) => set({ encoding: enc }),

  breakpoints: {},
  setBreakpointsMap: (updater) =>
    set((state) => ({
      breakpoints:
        typeof updater === "function" ? updater(state.breakpoints) : updater,
    })),
  toggleBreakpoint: async (file: string, line: number) => {
    if (!file || line <= 0) return
    const prev = get().breakpoints
    const existing = prev[file] || []
    const next = existing.includes(line)
      ? existing.filter((l) => l !== line)
      : [...existing, line].sort((a, b) => a - b)

    set({
      breakpoints: {
        ...prev,
        [file]: next,
      },
    })

    if (get().debugState?.active) {
      try {
        await setBreakpoints(file, next)
      } catch (err: unknown) {
        console.error("Failed to sync breakpoint:", err)
      }
    }
  },
  clearBreakpoints: (file?: string) => {
    set((state) => {
      if (!file) return { breakpoints: {} }
      const next = { ...state.breakpoints }
      delete next[file]
      return { breakpoints: next }
    })
  },

  activeDebugLine: null,
  setActiveDebugLine: (line: ActiveDebugLine) => set({ activeDebugLine: line }),

  confirmCloseFile: null,
  setConfirmCloseFile: (state: ConfirmCloseState | null) =>
    set({ confirmCloseFile: state }),
  resolveConfirmCloseFile: async (action: "save" | "dont-save" | "cancel") => {
    const confirmCloseFile = get().confirmCloseFile
    if (!confirmCloseFile) return
    const { group, filename } = confirmCloseFile
    if (action === "save") {
      if (typeof get().saveFile === "function") {
        await get().saveFile(filename)
      }
      get().forceCloseTabInGroup(group, filename)
      set({ confirmCloseFile: null })
    } else if (action === "dont-save") {
      if (typeof get().revertBufferContent === "function") {
        get().revertBufferContent(filename)
      }
      get().forceCloseTabInGroup(group, filename)
      set({ confirmCloseFile: null })
    } else if (action === "cancel") {
      set({ confirmCloseFile: null })
    }
  },

  confirmRevertFile: null,
  setConfirmRevertFile: (file: string | null) =>
    set({ confirmRevertFile: file }),
  requestRevertFile: (filenameToRevert?: string) => {
    const target =
      filenameToRevert ||
      (get().focusedGroup === "group2"
        ? get().group2.activeTab
        : get().group1.activeTab)
    if (!target) return
    const buf = get().fileBuffers?.[target]
    if (buf?.isDirty) {
      set({ confirmRevertFile: target })
    }
  },
  resolveConfirmRevert: (confirm: boolean) => {
    const file = get().confirmRevertFile
    if (!file) return
    if (confirm) {
      if (typeof get().revertBufferContent === "function") {
        get().revertBufferContent(file)
      }
    }
    set({ confirmRevertFile: null })
  },
  revertFile: (filename: string) => {
    if (typeof get().revertBufferContent === "function") {
      get().revertBufferContent(filename)
    }
  },
})
