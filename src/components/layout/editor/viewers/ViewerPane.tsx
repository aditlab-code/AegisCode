import { Component, lazy, Suspense } from "react"
import type { ReactNode } from "react"
import type { ViewerType } from "./viewerTypes"
import { Icon } from "../../../ui/Icon"

const ImageViewer = lazy(() => import("./ImageViewer"))
const MarkdownViewer = lazy(() => import("./MarkdownViewer"))
const PdfViewer = lazy(() => import("./PdfViewer"))
const CsvViewer = lazy(() => import("./CsvViewer"))
const GraphViewer = lazy(() => import("./GraphViewer"))

interface ViewerPaneProps {
  filename: string
  groupId: "group1" | "group2"
  viewerType: ViewerType
}

interface ViewerErrorBoundaryProps {
  children: ReactNode
  filename: string
  viewerType: ViewerType
}

interface ViewerErrorBoundaryState {
  hasError: boolean
  errorMessage: string
}

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  state: ViewerErrorBoundaryState = {
    hasError: false,
    errorMessage: "",
  }

  static getDerivedStateFromError(error: unknown): ViewerErrorBoundaryState {
    const msg = error instanceof Error ? error.message : String(error)
    return { hasError: true, errorMessage: msg }
  }

  componentDidUpdate(prevProps: ViewerErrorBoundaryProps) {
    if (
      prevProps.filename !== this.props.filename ||
      prevProps.viewerType !== this.props.viewerType
    ) {
      if (this.state.hasError) {
        this.setState({ hasError: false, errorMessage: "" })
      }
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, errorMessage: "" })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-canvas text-ink p-6 text-center gap-3 select-none">
          <span className="w-10 h-10 rounded-full bg-warning/15 text-warning flex items-center justify-center">
            <Icon name="warning" size={20} />
          </span>
          <div className="max-w-md">
            <h4 className="text-sm font-semibold mb-1">
              Unable to load {this.props.viewerType} viewer
            </h4>
            <p className="text-xs text-ink-muted break-words font-mono mb-4">
              {this.state.errorMessage || "Failed to load viewer component."}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={this.handleRetry}
                className="px-3 py-1.5 rounded bg-accent text-canvas hover:bg-accent-hover transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-xs"
                type="button"
              >
                <Icon name="refresh" size={13} />
                <span>Retry Loading</span>
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
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
    <ViewerErrorBoundary filename={filename} viewerType={viewerType}>
      <Suspense fallback={<ViewerSkeleton type={viewerType} />}>
        {viewerType === "image" && <ImageViewer filename={filename} />}
        {viewerType === "markdown" && (
          <MarkdownViewer filename={filename} groupId={groupId} />
        )}
        {viewerType === "pdf" && <PdfViewer filename={filename} />}
        {viewerType === "csv" && (
          <CsvViewer filename={filename} groupId={groupId} />
        )}
        {viewerType === "graph" && (
          <GraphViewer filename={filename} groupId={groupId} />
        )}
      </Suspense>
    </ViewerErrorBoundary>
  )
}
