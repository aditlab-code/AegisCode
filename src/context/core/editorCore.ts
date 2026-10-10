import { useCallback, useState } from "react"
import type {
  ActivityType,
  CursorPosition,
  EditorGroupState,
} from "../../types/workbench"

export interface TabMoveResult {
  source: EditorGroupState
  target: EditorGroupState
}

export interface BothGroupsResult {
  group1: EditorGroupState
  group2: EditorGroupState
}

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

export function useEditorCore(onFileRequested?: (filename: string) => void) {
  const [splitEditor, setSplitEditor] = useState(false)
  const [splitRatio, setSplitRatio] = useState(50)
  const [focusedGroup, setFocusedGroup] = useState<"group1" | "group2">(
    "group1",
  )

  const [group1, setGroup1] = useState<EditorGroupState>({
    id: "group1",
    name: "Group 1",
    tabs: [],
    activeTab: "",
  })

  const [group2, setGroup2] = useState<EditorGroupState>({
    id: "group2",
    name: "Group 2",
    tabs: [],
    activeTab: "",
  })

  const [activeActivity, setActiveActivity] = useState<ActivityType>("Explorer")
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    line: 1,
    col: 1,
  })

  const [minimapEnabled, setMinimapEnabledState] = useState<boolean>(
    loadStoredMinimapEnabled,
  )

  const setMinimapEnabled = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setMinimapEnabledState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        try {
          window.localStorage.setItem("aegis_minimap_enabled", String(next))
        } catch {}
        return next
      })
    },
    [],
  )

  const toggleMinimap = useCallback(() => {
    setMinimapEnabled((v) => !v)
  }, [setMinimapEnabled])

  // Computed views
  const currentFocusedFile =
    focusedGroup === "group2" && splitEditor
      ? group2.activeTab
      : group1.activeTab
  const activeTab = currentFocusedFile
  const secondaryActiveTab = group2.activeTab
  const tabs = Array.from(new Set([...group1.tabs, ...group2.tabs]))
  const focusedPane = focusedGroup === "group2" ? "secondary" : "primary"

  const setFocusedPane = useCallback((pane: "primary" | "secondary") => {
    setFocusedGroup(pane === "secondary" ? "group2" : "group1")
  }, [])

  const openFileInGroup = useCallback(
    (filename: string, group?: "group1" | "group2") => {
      if (!filename) return
      const targetGroup = group || focusedGroup

      if (onFileRequested) {
        onFileRequested(filename)
      }

      if (targetGroup === "group2") {
        setGroup2((prev) => openTabInGroupLogic(prev, filename))
        setSplitEditor(true)
        setFocusedGroup("group2")
      } else {
        setGroup1((prev) => openTabInGroupLogic(prev, filename))
        setFocusedGroup("group1")
      }
    },
    [focusedGroup, onFileRequested],
  )

  const setActiveTabInGroup = useCallback(
    (group: "group1" | "group2", filename: string) => {
      if (group === "group2") {
        setGroup2((prev) => setActiveTabInGroupLogic(prev, filename))
        setFocusedGroup("group2")
      } else {
        setGroup1((prev) => setActiveTabInGroupLogic(prev, filename))
        setFocusedGroup("group1")
      }
    },
    [],
  )

  const setSecondaryActiveTab = useCallback(
    (tab: string) => {
      setActiveTabInGroup("group2", tab)
    },
    [setActiveTabInGroup],
  )

  const closeTabInGroup = useCallback(
    (group: "group1" | "group2", filename: string) => {
      if (group === "group2") {
        setGroup2((prev) => {
          const next = closeTabInGroupLogic(prev, filename)
          if (next.tabs.length === 0) {
            setSplitEditor(false)
            setFocusedGroup("group1")
          }
          return next
        })
      } else {
        setGroup1((prev) => closeTabInGroupLogic(prev, filename))
      }
    },
    [],
  )

  const moveTabBetweenGroups = useCallback(
    (
      sourceGroup: "group1" | "group2",
      targetGroup: "group1" | "group2",
      filename: string,
      targetIndex?: number,
    ) => {
      if (sourceGroup === targetGroup) return

      if (sourceGroup === "group1" && targetGroup === "group2") {
        setGroup1((prevG1) => {
          const res = moveTabBetweenGroupsLogic(
            prevG1,
            group2,
            filename,
            targetIndex,
          )
          setGroup2(res.target)
          setSplitEditor(true)
          setFocusedGroup("group2")
          return res.source
        })
      } else if (sourceGroup === "group2" && targetGroup === "group1") {
        setGroup2((prevG2) => {
          const res = moveTabBetweenGroupsLogic(
            prevG2,
            group1,
            filename,
            targetIndex,
          )
          setGroup1(res.target)
          if (res.source.tabs.length === 0) {
            setSplitEditor(false)
            setFocusedGroup("group1")
          }
          return res.source
        })
      }
    },
    [group1, group2],
  )

  const reorderTabsInGroup = useCallback(
    (group: "group1" | "group2", sourceIndex: number, targetIndex: number) => {
      const setter = group === "group1" ? setGroup1 : setGroup2
      setter((prev) => reorderTabsInGroupLogic(prev, sourceIndex, targetIndex))
    },
    [],
  )

  const toggleSplitEditor = useCallback(() => {
    setSplitEditor((prev) => {
      if (prev) {
        setFocusedGroup("group1")
        return false
      }
      setGroup2((prevG2) => {
        if (prevG2.tabs.length > 0) return prevG2
        const candidate = group1.activeTab || group1.tabs[0] || ""
        if (!candidate) return prevG2
        return {
          ...prevG2,
          tabs: [candidate],
          activeTab: candidate,
        }
      })
      setFocusedGroup("group2")
      return true
    })
  }, [group1])

  const closeSplitEditor = useCallback(() => {
    setSplitEditor(false)
    setFocusedGroup("group1")
  }, [])

  const openFileInPane = useCallback(
    (filename: string, pane?: "primary" | "secondary") => {
      openFileInGroup(filename, pane === "secondary" ? "group2" : "group1")
    },
    [openFileInGroup],
  )

  const setActiveTab = useCallback(
    (tab: string) => {
      openFileInGroup(tab, focusedGroup)
    },
    [focusedGroup, openFileInGroup],
  )

  const closeTab = useCallback(
    (tabToClose: string) => {
      closeTabInGroup(focusedGroup, tabToClose)
    },
    [closeTabInGroup, focusedGroup],
  )

  const renameTabsInBothGroups = useCallback(
    (oldName: string, newName: string) => {
      setGroup1((g1) => {
        const g1Next = renameTabInAllGroupsLogic(
          g1,
          { id: "group2", name: "", tabs: [], activeTab: "" },
          oldName,
          newName,
        ).group1
        return g1Next
      })
      setGroup2((g2) => {
        const g2Next = renameTabInAllGroupsLogic(
          { id: "group1", name: "", tabs: [], activeTab: "" },
          g2,
          oldName,
          newName,
        ).group2
        return g2Next
      })
    },
    [],
  )

  const closeTabInBothGroups = useCallback(
    (filename: string) => {
      closeTabInGroup("group1", filename)
      closeTabInGroup("group2", filename)
    },
    [closeTabInGroup],
  )

  const resetAllGroups = useCallback(() => {
    setGroup1({ id: "group1", name: "Group 1", tabs: [], activeTab: "" })
    setGroup2({ id: "group2", name: "Group 2", tabs: [], activeTab: "" })
    setSplitEditor(false)
    setFocusedGroup("group1")
  }, [])

  return {
    splitEditor,
    setSplitEditor,
    toggleSplitEditor,
    closeSplitEditor,
    splitRatio,
    setSplitRatio,
    group1,
    group2,
    focusedGroup,
    setFocusedGroup,
    openFileInGroup,
    closeTabInGroup,
    setActiveTabInGroup,
    moveTabBetweenGroups,
    reorderTabsInGroup,
    focusedPane,
    setFocusedPane,
    secondaryActiveTab,
    setSecondaryActiveTab,
    openFileInPane,
    activeActivity,
    setActiveActivity,
    activeTab,
    setActiveTab,
    tabs,
    closeTab,
    minimapEnabled,
    setMinimapEnabled,
    toggleMinimap,
    cursorPosition,
    setCursorPosition,
    currentFocusedFile,
    renameTabsInBothGroups,
    closeTabInBothGroups,
    resetAllGroups,
  }
}
