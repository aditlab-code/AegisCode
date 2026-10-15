# Table Phase: Pure .* & GitIgnore Matcher, Anti-Lock & Search Banners

> **Dokumen Rencana Wave & Micro-Phase**  
> Dibuat oleh Master Orchestrator (Kanna) sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Status Global: `PASSED`

---

## Detailed Micro-Phases

| Phase ID | Name / Description | Target File(s) | Dependencies | Verification Gate | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MP-P1** | Implement pure `GitIgnoreMatcher` (load `.gitignore`, check `.*` for dirs, check gitignore patterns) with NO hardcoded names | `server/internal/workspace/gitignore.go` | None | `gitignore_test.go` | `PASSED` |
| **MP-P2** | Integrate `GitIgnoreMatcher` into `Manager.Search`, `ReplaceAll`, `WorkspaceIndex`, remove hardcoded `ignoredDirNames`, add context timeout/cancellation | `server/internal/workspace/workspace.go`, `index.go`, `server/internal/api/workspace_handlers.go` | MP-P1 | `go test ./...` | `PASSED` |
| **MP-P3** | Add warning & error banner components in `SearchPanel.tsx` and response payload support in `workspaceApi.ts` | `src/utils/workspaceApi.ts`, `src/components/layout/sidebar/SearchPanel.tsx` | MP-P2 | Vitest & UI check | `PASSED` |
| **MP-P4** | Mandatory Verification Gates (`npm run build`, `npm run format`, Go tests) | Entire Repo | All Phases | 0 errors | `PASSED` |