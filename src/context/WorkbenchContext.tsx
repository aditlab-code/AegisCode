import { createContext, type ReactNode } from "react"
import { useWorkbenchStore, type WorkbenchStore } from "../store"
import { useWorkbenchLifecycle } from "./WorkbenchLifecycle"

export const WorkbenchContext = createContext<WorkbenchStore | null>(null)

export function WorkbenchProvider({ children }: { children: ReactNode }) {
  useWorkbenchLifecycle()
  return <>{children}</>
}

export function useWorkbench(): WorkbenchStore {
  return useWorkbenchStore()
}

export type { WorkbenchStore as WorkbenchContextType }
