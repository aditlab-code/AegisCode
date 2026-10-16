# Dynamic Feedback Hub & Runtime Log: Minimap Synchronization, Windowing & Rendering Accuracy

> **Document Type**: Runtime State Transitions & 4-Step CoT Blocker Hub (Phase 6)  
> **Status**: COMPLETED & VERIFIED  
> **Author**: Shun for Adit-sensei  
> **Reference Plan**: [`task/0-Table-Phase.md`](0-Table-Phase.md)  
> **Reference Spec**: [`task/0-spec-Orchestrator.md`](0-spec-Orchestrator.md)

---

## 1. Runtime State Overview

| Micro-Phase ID | Target File(s) | Status | Last Updated | Notes / Output |
| :--- | :--- | :--- | :--- | :--- |
| **MP-M1.1-CM-SCROLL-CALLBACK** | `src/components/layout/editor/CMEditor.tsx` | `PASSED` | 2026-10-16 | Added onScroll callback, scrollDomHandler, and native scrollToLine method |
| **MP-M2.1-CODEPANE-SCROLLER-BINDING** | `src/components/layout/editor/CodePane.tsx` | `PASSED` | 2026-10-16 | Bound CMEditor onScroll directly to scrollInfo, wired scrollToLine, passed filename |
| **MP-M3.1-MINIMAP-CACHE-AND-FALLBACK** | `src/components/layout/editor/Minimap.tsx` | `PASSED` | 2026-10-16 | Clear cache on filename change, per-line validation, instant text fallback |
| **MP-M4.1-MINIMAP-SLIDER-AND-WINDOWING** | `src/components/layout/editor/Minimap.tsx` | `PASSED` | 2026-10-16 | Fixed 1:1 proportional slider height/top and self-measuring container ResizeObserver |
| **MP-M5.1-GATES-AND-REGRESSIONS** | Full Repository | `PASSED` | 2026-10-16 | All gates passed: Vitest (322/322), Rolldown build (856ms), oxfmt, Go backend tests |

---

## 2. 4-Step CoT Execution Log

### Wave 1: CodeMirror Scroll Callback & Native `scrollToLine`
1. **Trigger & Problem**: DOM-based `querySelector(".cm-scroller")` failed with race conditions during buffer loading, leaving `scrollInfo` at 1px height.
2. **Strategy**: Expose `onScroll` prop in `CMEditorProps` and attach event handlers directly on `view.scrollDOM` and `update.geometryChanged`. Expose imperative `scrollToLine` via `EditorView.scrollIntoView`.
3. **Execution**: Modified `CMEditor.tsx` with `onScrollRef`, `emitScrollInfo`, `scrollDomHandler`, and `scrollToLine`.
4. **Verification**: Frontend tests passed with 322/322 tests.

### Wave 2: Reliable Scroll Binding in CodePane
1. **Trigger & Problem**: `CodePane` relied on fragile single-shot DOM queries and did not forward `filename` or CodeMirror handle to `Minimap`.
2. **Strategy**: Wire `onScroll={setScrollInfo}` directly into `<CMEditor>`, delegate `handleScrollToLine` to `internalEditorRef.current.scrollToLine`, and pass `filename={filename}` to `<Minimap>`.
3. **Execution**: Modified `CodePane.tsx`.
4. **Verification**: Frontend tests passed with 322/322 tests.

### Wave 3: File & Content Aware Token Cache with Instant Text Fallback
1. **Trigger & Problem**: `tokenCacheRef` was keyed solely by line number without file awareness, causing ghost tokens from previously opened files and stale lines.
2. **Strategy**: Clear cache on `filename` change, validate `{ text, tokens }` against current line text, and render raw text fallback with micro-font styling while awaiting worker tokens.
3. **Execution**: Modified `Minimap.tsx`.
4. **Verification**: Code matches immediately without ghost tokens.

### Wave 4: 1:1 Slider Positioning & Safe Windowing
1. **Trigger & Problem**: Minimap windowing collapsed to 16 lines when external clientHeight was 1, and slider formula squared clientHeight causing desync.
2. **Strategy**: Add `ResizeObserver` on minimap container to measure actual height (`effectiveContainerHeight`), calculate `sliderHeightPx` as viewport proportion of `totalMinimapHeight`, and align slider travel 1:1 with `minimapOffsetY`.
3. **Execution**: Modified `Minimap.tsx`.
4. **Verification**: Slider accurately tracks and frames visible lines across all document lengths.

### Wave 5: Verification Gates & Regression Validation
1. **Trigger & Problem**: Mandatory verification before completing task.
2. **Execution**:
   - `npm run test:frontend`: 30 files, 322 tests passed in 1.22s.
   - `npm run build`: Rolldown build succeeded in 856ms.
   - `npm run format`: 174 files checked with oxfmt.
   - `go -C server test ./...`: All server packages passed.
3. **Outcome**: Minimap is now fully synchronized, accurate, instant, and free of race conditions.