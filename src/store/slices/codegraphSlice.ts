import { create } from "zustand"

export type CodeGraphView = "entrypoints" | "steps" | "map" | "flow" | "screens"

export interface BreadcrumbItem {
  id: string
  name: string
  kind: string
  file: string
  view: CodeGraphView
}

export interface CodeGraphFilters {
  hideTests: boolean
  hideGenerated: boolean
  tierFilter: string[]
  maxDepth: number
}

export interface CodeGraphIndexStatus {
  state: "unindexed" | "indexing" | "ready" | "stale" | "error"
  progress?: number
  message?: string
  nodeCount?: number
  edgeCount?: number
  filesCount?: number
}

export interface FileCodeTarget {
  file: string
  line?: number
  symbolId?: string
}

export interface SelectedEntrypoint {
  id: string
  label: string
}

export interface SelectedSymbol {
  id: string
  name: string
}

export interface FlowQueryState {
  from?: string
  to?: string
  symbols?: string[]
}

export interface CodeGraphState {
  activeView: CodeGraphView
  selectedEntrypoint: SelectedEntrypoint | null
  selectedSymbol: SelectedSymbol | null
  flowQuery: FlowQueryState | null
  fileCodeTarget: FileCodeTarget | null
  breadcrumbs: BreadcrumbItem[]
  filters: CodeGraphFilters
  indexStatus: CodeGraphIndexStatus

  // Actions
  setActiveView: (view: CodeGraphView) => void
  openEntrypointSteps: (id: string, label: string) => void
  inspectSymbolFlow: (id: string, name: string) => void
  setFlowQuery: (query: FlowQueryState | null) => void
  openFileCode: (file: string, line?: number, symbolId?: string) => void
  closeFileCode: () => void
  pushBreadcrumb: (item: BreadcrumbItem) => void
  popBreadcrumb: () => void
  setFilters: (filters: Partial<CodeGraphFilters>) => void
  setIndexStatus: (status: Partial<CodeGraphIndexStatus>) => void
  resetView: () => void
}

export const useCodeGraphStore = create<CodeGraphState>((set, get) => ({
  activeView: "entrypoints",
  selectedEntrypoint: null,
  selectedSymbol: null,
  flowQuery: null,
  fileCodeTarget: null,
  breadcrumbs: [],
  filters: {
    hideTests: true,
    hideGenerated: true,
    tierFilter: [],
    maxDepth: 6,
  },
  indexStatus: {
    state: "ready",
  },

  setActiveView: (view) => set({ activeView: view }),

  openEntrypointSteps: (id, label) => {
    const current = get()
    const crumbs = [...current.breadcrumbs]
    crumbs.push({
      id,
      name: label,
      kind: "entrypoint",
      file: "",
      view: "steps",
    })
    set({
      activeView: "steps",
      selectedEntrypoint: { id, label },
      breadcrumbs: crumbs,
    })
  },

  inspectSymbolFlow: (id, name) => {
    const current = get()
    const crumbs = [...current.breadcrumbs]
    crumbs.push({
      id,
      name,
      kind: "symbol",
      file: "",
      view: "flow",
    })
    set({
      activeView: "flow",
      selectedSymbol: { id, name },
      flowQuery: { from: name, to: "" },
      breadcrumbs: crumbs,
    })
  },

  setFlowQuery: (query) => set({ flowQuery: query }),

  openFileCode: (file, line, symbolId) =>
    set({
      fileCodeTarget: { file, line, symbolId },
    }),

  closeFileCode: () => set({ fileCodeTarget: null }),

  pushBreadcrumb: (item) =>
    set((state) => ({
      breadcrumbs: [...state.breadcrumbs, item],
    })),

  popBreadcrumb: () =>
    set((state) => {
      if (state.breadcrumbs.length === 0) return state
      const next = state.breadcrumbs.slice(0, -1)
      const last = next[next.length - 1]
      return {
        breadcrumbs: next,
        activeView: last ? last.view : "entrypoints",
      }
    }),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
    })),

  setIndexStatus: (status) =>
    set((state) => ({
      indexStatus: { ...state.indexStatus, ...status },
    })),

  resetView: () =>
    set({
      activeView: "entrypoints",
      selectedEntrypoint: null,
      selectedSymbol: null,
      flowQuery: null,
      fileCodeTarget: null,
      breadcrumbs: [],
    }),
}))
