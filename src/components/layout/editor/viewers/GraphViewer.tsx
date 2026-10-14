import { useEffect } from "react"
import { parseGraphTab } from "./viewerTypes"
import { useCodeGraphStore } from "../../../../store/slices/codegraphSlice"
import { CodeGraphShell } from "../../../codegraph/CodeGraphShell"

interface GraphViewerProps {
  filename: string
  groupId: "group1" | "group2"
}

export default function GraphViewer({ filename }: GraphViewerProps) {
  const openFileCode = useCodeGraphStore((s) => s.openFileCode)
  const setActiveView = useCodeGraphStore((s) => s.setActiveView)

  useEffect(() => {
    const parsed = parseGraphTab(filename)
    if (parsed.target) {
      openFileCode(parsed.target, 1)
    } else {
      setActiveView("entrypoints")
    }
  }, [filename, openFileCode, setActiveView])

  return (
    <div className="flex h-full w-full overflow-hidden bg-canvas">
      <CodeGraphShell />
    </div>
  )
}
