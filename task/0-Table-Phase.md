# Table Phase: Git Stash, Git Clone, and Graph Branch Popover

> **Dokumen Rencana Wave & Micro-Phase**  
> Dibuat oleh Kanna sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Status Global: `COMPLETED`

---

## Detailed Micro-Phases

| Phase ID | Name / Description | Target File(s) | Dependencies | Verification Gate | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **MP-SC1** | Backend Go Git Engine: Implement `Stash`, `Clone`, `CherryPick`, and commit-targeted `CreateTag` in `server/internal/git/git.go` | `server/internal/git/git.go`, `git_test.go` | None | `go test ./server/internal/git/...` | `PASSED` |
| **MP-SC2** | Backend Go API Handlers: Wire endpoints for stash (`/stashes`, `/stash/save`, `/stash/pop`, `/stash/apply`, `/stash/drop`), clone (`/clone`), cherry-pick (`/cherry-pick`) in `server/internal/api/` | `server/internal/api/git_handlers.go`, `api.go`, `api_test.go` | MP-SC1 | `go test ./server/internal/api/...` | `PASSED` |
| **MP-SC3** | Frontend Types & API Client: Add types in `src/types/workbench.ts` and fetch helpers in `src/utils/workspaceApi.ts` | `src/types/workbench.ts`, `src/utils/workspaceApi.ts` | MP-SC2 | TypeScript compilation | `PASSED` |
| **MP-SC4** | Frontend Store Slice: Integrate stash, clone, and cherry-pick actions into `createGitSlice.ts` | `src/store/slices/createGitSlice.ts`, `src/store/types.ts` | MP-SC3 | `npm run build` | `PASSED` |
| **MP-SC5** | Frontend UI Source Control: Add Stashes accordion & actions, Clone modal & trigger buttons, and Replace hover icon system on Commit Graph with Right-Click Popover/Context Menu (checkout, create tag, cherry pick, compare with, copy hash, copy message) | `src/components/layout/sidebar/SourceControlPanel.tsx` | MP-SC4 | UI interaction & test suite | `PASSED` |
| **MP-SC6** | Mandatory Verification Gates: Run `npm run build`, `npm run format`, and `go test ./...` | Entire Workspace | All Phases | 0 errors | `PASSED` |
| **MP-REF1** | UI Refinement (Option A + Bonus): Add 3-dots button on commit row in Graph, anchor dropdown cleanly inside Source Control container, wire right-click to same dropdown, remove fixed screen coordinates | `src/components/layout/sidebar/SourceControlPanel.tsx` | MP-SC5 | `npm run build` | `PASSED` |
| **MP-REF2** | Mandatory Verification Gates: `npm run build`, `npm run format`, Go & Vitest suites | Entire Workspace | MP-REF1 | 0 errors | `PASSED` |
| **MP-TGT1** | Source Control Accordion Hierarchy Alignment: Refactor panel so Commit Zone sits directly below repo pill, and Staged Changes, Changes, Stashes, and Graph become uniform peer accordions | `src/components/layout/sidebar/SourceControlPanel.tsx` | MP-REF2 | Visual harmony & zero regression | `PASSED` |
| **MP-TGT2** | Target Commit Selector & Compare Modal: Implement 5-latest-commits dropdown & validated manual hash input for both Tag Creation and Compare With modals | `src/components/layout/sidebar/SourceControlPanel.tsx` | MP-TGT1 | UI interaction & unit tests | `PASSED` |
| **MP-TGT3** | Mandatory Verification Gates: `npm run build`, `npm run format`, Go backend tests, and Vitest suite | Entire Workspace | MP-TGT2 | 0 errors | `PASSED` |
| **MP-ETL1** | Backend Git Timeline Hash Fix: Normalize `CommitNode.Hash` to full SHA (`parts[0]`) and `ShortHash` to `parts[1]` in `server/internal/git/git.go` | `server/internal/git/git.go`, `server/internal/git/git_test.go` | None | `go test ./...` | `PASSED` |
| **MP-ETL2** | Frontend Explorer Timeline UX (Option 1): Add header refresh button & count badge, continuous vertical track line, and 3-dots dropdown + right-click context menu (Open Changes, Compare with Previous, Copy Hash, Copy Message) | `src/components/layout/sidebar/ExplorerPanel.tsx` | MP-ETL1 | `npm run build` & unit tests | `PASSED` |
| **MP-ETL3** | Mandatory Verification Gates: Full system check with `npm run build`, `npm run format`, Go backend tests, and Vitest suite | Entire Workspace | MP-ETL2 | 0 errors | `PASSED` |