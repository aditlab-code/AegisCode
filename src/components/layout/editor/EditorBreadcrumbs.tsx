import { Icon } from "../../ui/Icon"
import { useWorkbench } from "../../../context/WorkbenchContext"
import { isGitDiffTab, parseGitDiffTab } from "../../../utils/gitDiffTab"

interface EditorBreadcrumbsProps {
  file?: string
}

export function EditorBreadcrumbs({ file }: EditorBreadcrumbsProps) {
  const { activeTab, secondaryActiveTab, focusedPane, splitEditor } =
    useWorkbench()

  const currentFile =
    file ||
    (focusedPane === "secondary" && splitEditor
      ? secondaryActiveTab
      : activeTab)

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

  return (
    <div className="breadcrumbs">
      <div className="breadcrumb-path">
        <span>src</span>
        <Icon name="chevron" size={11} />
        <span>{currentFile}</span>
        {isComponent && (
          <>
            <Icon name="chevron" size={11} />
            <Icon name="code" size={12} />
            <span>{currentFile.replace(/\.[^/.]+$/, "")}</span>
          </>
        )}
      </div>
    </div>
  )
}
