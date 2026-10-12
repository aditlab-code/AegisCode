import { createContext, useContext, type ReactNode } from "react"
import { useWorkbenchStore, type WorkbenchStore } from "../store"
import { useWorkbenchLifecycle } from "./WorkbenchLifecycle"

export const WorkbenchContext = createContext<WorkbenchStore | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  useWorkbenchLifecycle()
  const value = useWorkbenchStore()
  return (
    <WorkbenchContext.Provider value={value}>
      {children}
    </WorkbenchContext.Provider>
  )
}

export function useWorkbench(): WorkbenchStore {
  const context = useContext(WorkbenchContext)
  if (!context) {
    return useWorkbenchStore()
  }
  return context
}

export type { WorkbenchStore as WorkbenchContextType }
