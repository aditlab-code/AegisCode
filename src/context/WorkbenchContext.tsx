import { createContext, useContext, type ReactNode } from "react"
import type { WorkbenchContextType } from "../types/workbench"
import { useWorkbenchFacade } from "./core/workbenchFacade"

const WorkbenchContext = createContext<WorkbenchContextType | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  const value = useWorkbenchFacade()
  return (
    <WorkbenchContext.Provider value={value}>
      {children}
    </WorkbenchContext.Provider>
  )
}

export function useWorkbench(): WorkbenchContextType {
  const context = useContext(WorkbenchContext)
  if (!context) {
    throw new Error("useWorkbench must be used within a WorkbenchProvider")
  }
  return context
}

export type { WorkbenchContextType }
