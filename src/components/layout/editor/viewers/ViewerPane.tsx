import { lazy, Suspense } from "react"
import type { ViewerType } from "./viewerTypes"

const ImageViewer = lazy(() => import("./ImageViewer"))
const MarkdownViewer = lazy(() => import("./MarkdownViewer"))
const PdfViewer = lazy(() => import("./PdfViewer"))
const CsvViewer = lazy(() => import("./CsvViewer"))

interface ViewerPaneProps {
  filename: string
  groupId: "group1" | "group2"
  viewerType: ViewerType
}

function ViewerSkeleton({ type }: { type: ViewerType }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-canvas text-ink-muted text-xs gap-2">
      <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <span>Loading {type} viewer...</span>
    </div>
  )
}

export function ViewerPane({ filename, groupId, viewerType }: ViewerPaneProps) {
  return (
    <Suspense fallback={<ViewerSkeleton type={viewerType} />}>
      {viewerType === "image" && <ImageViewer filename={filename} />}
      {viewerType === "markdown" && (
        <MarkdownViewer filename={filename} groupId={groupId} />
      )}
      {viewerType === "pdf" && <PdfViewer filename={filename} />}
      {viewerType === "csv" && (
        <CsvViewer filename={filename} groupId={groupId} />
      )}
    </Suspense>
  )
}
