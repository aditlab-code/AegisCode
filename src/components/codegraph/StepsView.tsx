import { useState, useEffect } from "react"
import {
  fetchSteps,
  type WireStepsPayload,
  type WireStep,
  type WireStepLink,
} from "../../services/codegraphApi"
import { useCodeGraphStore } from "../../store/slices/codegraphSlice"
import { Icon } from "../ui/Icon"

export function StepsView() {
  const selectedEntrypoint = useCodeGraphStore((s) => s.selectedEntrypoint)
  const openFileCode = useCodeGraphStore((s) => s.openFileCode)
  const inspectSymbolFlow = useCodeGraphStore((s) => s.inspectSymbolFlow)
  const setActiveView = useCodeGraphStore((s) => s.setActiveView)

  const [data, setData] = useState<WireStepsPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [depth, setDepth] = useState(8)

  const anchorId = selectedEntrypoint?.id || "main"

  useEffect(() => {
    if (!anchorId) return
    const ac = new AbortController()
    setLoading(true)
    setError(null)

    fetchSteps(anchorId, { depth, limit: 120 }, ac.signal)
      .then((res) => {
        if (!res) {
          setError(`No execution steps found from anchor '${anchorId}'.`)
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
  }, [anchorId, depth])

  if (!selectedEntrypoint) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-canvas">
        <Icon name="code" size={32} className="text-ink-muted mb-2" />
        <p className="text-sm font-medium text-ink mb-1">
          No Entrypoint Selected
        </p>
        <p className="text-xs text-ink-muted max-w-sm mb-4">
          Choose a route, binary, or hub from Entrypoints to view its execution
          steps spine tree.
        </p>
        <button
          onClick={() => setActiveView("entrypoints")}
          className="px-3 py-1.5 rounded bg-accent-soft text-accent hover:bg-accent hover:text-canvas text-xs font-medium transition-colors"
        >
          Browse Entrypoints
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-ink-muted bg-canvas">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent mb-3" />
        <p className="text-sm">
          Walking execution steps from {selectedEntrypoint.label}...
        </p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center bg-canvas">
        <Icon name="error" size={32} className="text-warning mb-2" />
        <p className="text-ink font-medium mb-1">Steps Walk Failed</p>
        <p className="text-xs text-ink-muted max-w-md mb-4">{error}</p>
        <button
          onClick={() => setActiveView("entrypoints")}
          className="px-3 py-1.5 rounded bg-surface-raised border border-line text-xs text-ink-soft hover:text-ink transition-colors"
        >
          Return to Entrypoints
        </button>
      </div>
    )
  }

  const { steps, links, anchor, project } = data

  // Map incoming links to each step
  const linksToStep = new Map<string, WireStepLink[]>()
  links.forEach((l) => {
    const list = linksToStep.get(l.to) || []
    list.push(l)
    linksToStep.set(l.to, list)
  })

  // Tier classifier helper
  const getTierBadge = (step: WireStep) => {
    const kind = step.kind
    const sub = (step.sub || "").toLowerCase()
    const label = (step.label || "").toLowerCase()

    if (
      kind === "anchor" ||
      kind === "screen" ||
      sub.includes("controller") ||
      sub.includes("handler") ||
      label.includes("route")
    ) {
      return {
        label: "Handler / Route",
        color: "bg-blue-soft text-blue border-blue/30",
      }
    }
    if (
      kind === "store" ||
      sub.includes("service") ||
      sub.includes("usecase") ||
      sub.includes("logic")
    ) {
      return {
        label: "Service / Logic",
        color: "bg-cyan/15 text-cyan border-cyan/30",
      }
    }
    if (kind === "effect") {
      const access = step.effect?.access
      if (access === "write")
        return {
          label: "DB Write",
          color: "bg-orange-soft text-orange border-orange/30",
        }
      if (access === "read")
        return {
          label: "DB Read",
          color: "bg-green-soft text-green border-green/30",
        }
      return {
        label: "Effect / IO",
        color: "bg-pink-soft text-pink border-pink/30",
      }
    }
    if (sub.includes("db") || sub.includes("store") || sub.includes("repo")) {
      return {
        label: "Repository / Store",
        color: "bg-green-soft text-green border-green/30",
      }
    }
    return {
      label: step.kind,
      color: "bg-surface-raised text-ink-soft border-line",
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas">
      {/* Anchor Header */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 bg-surface">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-ink-muted">Anchor:</span>
            <span className="text-sm font-mono font-semibold text-accent">
              {anchor.name}
            </span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-surface-raised text-ink-soft border border-line">
              {project}
            </span>
          </div>
          <span className="text-xs text-ink-muted">
            {anchor.file}:{anchor.line}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">Depth:</span>
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="rounded bg-surface-raised border border-line px-2 py-0.5 text-xs text-ink"
          >
            <option value={4}>4 Hops</option>
            <option value={6}>6 Hops</option>
            <option value={8}>8 Hops</option>
            <option value={12}>12 Hops</option>
          </select>

          <span className="text-xs text-ink-soft ml-2">
            {steps.length} steps · {links.length} hops
          </span>
        </div>
      </div>

      {/* Sequential Execution Spine */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl mx-auto w-full">
        {steps.map((step, idx) => {
          const incomingLinks = linksToStep.get(step.id) || []
          const tier = getTierBadge(step)

          return (
            <div key={step.id} className="relative flex flex-col group">
              {/* Connector line between steps */}
              {idx > 0 && (
                <div className="ml-6 mb-2 flex items-center gap-2">
                  <div className="w-0.5 h-6 bg-line-bright" />
                  {incomingLinks.length > 0 && incomingLinks[0].when && (
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-raised text-warning border border-line">
                      guard: {incomingLinks[0].when}
                    </span>
                  )}
                  {incomingLinks.length > 0 && incomingLinks[0].synthesized && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-pink-soft text-pink border border-pink/30">
                      synthesized · {incomingLinks[0].label || "dynamic"}
                    </span>
                  )}
                </div>
              )}

              {/* Step Card */}
              <div
                className={`p-3.5 rounded-lg border transition-all ${
                  step.anchor
                    ? "border-accent bg-accent/5 shadow-sm"
                    : "border-line bg-surface hover:bg-surface-hover hover:border-line-bright"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-raised border border-line text-xs font-mono font-medium text-ink-muted">
                      {idx + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-mono font-medium text-ink truncate">
                          {step.label}
                        </span>
                        <span
                          className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border ${tier.color}`}
                        >
                          {tier.label}
                        </span>
                        {step.cut && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-raised text-ink-muted border border-line">
                            cap: {step.cut}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-ink-muted mt-1 truncate">
                        {step.sub ||
                          (step.node
                            ? `${step.node.file}:${step.node.line}`
                            : "")}
                      </div>

                      {/* Effects Details */}
                      {step.effect && (
                        <div className="mt-2 text-xs font-mono text-ink-soft bg-surface-raised/80 p-2 rounded border border-line space-y-0.5">
                          <div>
                            <span className="text-ink-muted">API:</span>{" "}
                            {step.effect.api}
                          </div>
                          {step.effect.model && (
                            <div>
                              <span className="text-ink-muted">
                                Model/Table:
                              </span>{" "}
                              {step.effect.model}
                            </div>
                          )}
                          <div>
                            <span className="text-ink-muted">Category:</span>{" "}
                            {step.effect.category}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100">
                    {step.node && (
                      <>
                        <button
                          onClick={() =>
                            inspectSymbolFlow(step.node!.id, step.node!.name)
                          }
                          className="px-2 py-1 text-xs rounded bg-surface-raised hover:bg-surface-hover text-ink-soft hover:text-ink transition-colors font-medium flex items-center gap-1 border border-line"
                          title="Analyze directed flow"
                        >
                          <span>Flow</span>
                        </button>
                        <button
                          onClick={() =>
                            openFileCode(
                              step.node!.file,
                              step.node!.line,
                              step.node!.id,
                            )
                          }
                          className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface-raised transition-colors"
                          title="Open bounded source in FileCode drawer"
                        >
                          <Icon name="code" size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
