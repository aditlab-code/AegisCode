import { useState, useEffect } from "react"
import {
  fetchFileCode,
  type WireFileCodePayload,
  type WireNodeRef,
} from "../../services/codegraphApi"
import { useCodeGraphStore } from "../../store/slices/codegraphSlice"
import { useWorkbenchStore } from "../../store"
import { Icon } from "../ui/Icon"

export function FileCodeDrawer() {
  const fileCodeTarget = useCodeGraphStore((s) => s.fileCodeTarget)
  const closeFileCode = useCodeGraphStore((s) => s.closeFileCode)
  const inspectSymbolFlow = useCodeGraphStore((s) => s.inspectSymbolFlow)

  const openFileInPane = useWorkbenchStore((s) => s.openFileInPane)

  const [data, setData] = useState<WireFileCodePayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!fileCodeTarget?.file) return
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    fetchFileCode(fileCodeTarget.file, ac.signal)
      .then((res) => {
        if (!res) {
          setError(
            `Could not load bounded file code for ${fileCodeTarget.file}`,
          )
        } else {
          setData(res)
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setError(String(err))
        }
      })
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [fileCodeTarget?.file])

  if (!fileCodeTarget) return null

  const handleOpenInEditor = () => {
    if (fileCodeTarget?.file) {
      openFileInPane(fileCodeTarget.file)
    }
  }

  return (
    <div className="w-96 border-l border-line bg-surface flex flex-col shrink-0 h-full shadow-elevation z-30">
      {/* Drawer Header */}
      <div className="p-3 border-b border-line flex items-center justify-between bg-surface-raised">
        <div className="min-w-0 pr-2">
          <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-ink truncate">
            <Icon name="code" size={14} className="text-accent shrink-0" />
            <span className="truncate">{fileCodeTarget.file}</span>
          </div>
          {fileCodeTarget.line && (
            <div className="text-[11px] text-ink-muted">
              Target Line: {fileCodeTarget.line}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleOpenInEditor}
            className="px-2 py-1 rounded bg-accent text-canvas hover:opacity-90 text-xs font-medium transition-opacity flex items-center gap-1"
            title="Open in main editor pane"
          >
            <span>Open</span>
          </button>
          <button
            onClick={closeFileCode}
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface transition-colors"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      </div>

      {/* Drawer Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex h-32 flex-col items-center justify-center text-ink-muted">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent mb-2" />
            <p className="text-xs">Loading bounded code & outline...</p>
          </div>
        ) : error || !data ? (
          <div className="text-xs text-ink-muted p-4 text-center">
            {error || "No file code metadata available."}
          </div>
        ) : (
          <>
            {/* File Statistics Card */}
            <div className="grid grid-cols-3 gap-2 bg-surface-raised p-2.5 rounded-lg border border-line text-center text-xs">
              <div>
                <div className="text-ink-muted text-[10px] uppercase font-mono">
                  Lines
                </div>
                <div className="font-semibold text-ink font-mono">
                  {data.file.totalLines || "-"}
                </div>
              </div>
              <div>
                <div className="text-ink-muted text-[10px] uppercase font-mono">
                  Symbols
                </div>
                <div className="font-semibold text-ink font-mono">
                  {data.outline?.total || 0}
                </div>
              </div>
              <div>
                <div className="text-ink-muted text-[10px] uppercase font-mono">
                  Intra-Calls
                </div>
                <div className="font-semibold text-ink font-mono">
                  {data.intraFileCalls || 0}
                </div>
              </div>
            </div>

            {/* Outline Symbols */}
            <div className="space-y-2">
              <span className="text-[11px] font-mono font-semibold text-ink-soft uppercase tracking-wider">
                File Outline ({data.outline?.items?.length || 0})
              </span>
              <div className="space-y-1">
                {data.outline?.items?.map((item: WireNodeRef) => (
                  <div
                    key={item.id}
                    className="p-2 rounded border border-line bg-canvas/40 hover:bg-surface-raised transition-colors flex items-center justify-between group"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-medium text-ink truncate">
                        {item.name}
                      </div>
                      <div className="text-[10px] text-ink-muted font-mono">
                        {item.kind} · line {item.line}
                      </div>
                    </div>

                    <button
                      onClick={() => inspectSymbolFlow(item.id, item.name)}
                      className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-soft text-accent hover:bg-accent hover:text-canvas transition-all"
                      title="Inspect symbol flow"
                    >
                      Flow
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Outgoing Calls */}
            {data.calls?.items && data.calls.items.length > 0 && (
              <div className="space-y-2">
                <span className="text-[11px] font-mono font-semibold text-ink-soft uppercase tracking-wider">
                  Calls & References ({data.calls.total})
                </span>
                <div className="space-y-1">
                  {data.calls.items.slice(0, 15).map((call, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded border border-line bg-canvas/40 text-xs font-mono flex items-center justify-between"
                    >
                      <span className="text-ink truncate">
                        {call.relation?.node?.name || "anonymous"}
                      </span>
                      <span className="text-[10px] text-ink-muted">
                        line {call.ownerLine}
                      </span>
                    </div>
                  ))}
                  {data.calls.total > 15 && (
                    <div className="text-[11px] text-ink-muted text-center pt-1">
                      + {data.calls.total - 15} more calls
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
