import { useContext } from "react"
import { Icon } from "../../ui/Icon"
import { WorkbenchContext } from "../../../context/WorkbenchContext"
import { isGitDiffTab, parseGitDiffTab } from "../../../utils/gitDiffTab"

interface EditorBreadcrumbsProps {
  file?: string
}

export function EditorBreadcrumbs({ file }: EditorBreadcrumbsProps) {
  const workbench = useContext(WorkbenchContext)

  const currentFile =
    file ||
    (workbench?.focusedPane === "secondary" && workbench?.splitEditor
      ? workbench?.secondaryActiveTab
      : workbench?.activeTab) ||
    ""

  const isDiff = isGitDiffTab(currentFile)
  const diffInfo = isDiff ? parseGitDiffTab(currentFile) : null

  if (isDiff && diffInfo) {
    return (
      <div className="breadcrumbs">
        <div className="breadcrumb-path">
          <span>diff</span>
          <Icon name="chevron" size={11} />
          <Icon
            className="text-[var(--color-accent)] shrink-0"
            name="git"
            size={12}
          />
          <span>{diffInfo.displayName}</span>
        </div>
      </div>
    )
  }

  const isComponent =
    currentFile.endsWith(".tsx") || currentFile.endsWith(".jsx")
  const parts = currentFile.replace(/\\/g, "/").split("/").filter(Boolean)

  if (parts.length === 0) return null

  return (
    <div className="breadcrumbs">
      <div className="breadcrumb-path">
        {parts.map((segment, idx) => {
          const isLast = idx === parts.length - 1
          return (
            <span key={`${segment}-${idx}`} className="flex items-center gap-1">
              {idx > 0 && <Icon name="chevron" size={11} />}
              {isLast && (
                <Icon
                  name={isComponent ? "code" : "file"}
                  size={12}
                  className="shrink-0"
                />
              )}
              <span
                className={isLast ? "text-ink font-medium" : "text-ink-muted"}
              >
                {segment}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
