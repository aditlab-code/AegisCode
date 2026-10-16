# Task Specification & Architecture Contract: Git Stash, Git Clone, and Graph Branch Context Menu

> **Dokumen Spesifikasi Teknis & Batasan Arsitektur**  
> Dibuat pada **Phase Analyze** oleh Kanna sesuai `#WORKFLOW` pada `task/0-0-Orchestrator.md`.  
> Fitur: **Git Stash**, **Git Clone**, dan **Graph Branch Right-Click Popover/Context Menu**.

---

## 1. Feature Specifications

### 1.1 Git Stash Management
- **Backend (`server/internal/git/` & `server/internal/api/`)**:
  - `StashEntry` struct: `Index int`, `Ref string` (e.g. `stash@{0}`), `Message string`, `Timestamp string`.
  - Operations:
    - `GetStashes(ctx)`: Parses `git stash list --pretty=format:%gd|%cr|%gs`.
    - `StashSave(ctx, message, includeUntracked)`: `git stash push -m <msg> [-u]`.
    - `StashPop(ctx, ref)`: `git stash pop <ref>`.
    - `StashApply(ctx, ref)`: `git stash apply <ref>`.
    - `StashDrop(ctx, ref)`: `git stash drop <ref>`.
  - REST Endpoints:
    - `GET /api/v1/git/stashes`
    - `POST /api/v1/git/stash/save`
    - `POST /api/v1/git/stash/pop`
    - `POST /api/v1/git/stash/apply`
    - `POST /api/v1/git/stash/drop`
- **Frontend (`src/store/slices/createGitSlice.ts` & `src/utils/workspaceApi.ts`)**:
  - Types: `GitStashEntry` in `src/types/workbench.ts`.
  - Store State: `gitStashes: GitStashEntry[]`, `isLoadingStashes: boolean`.
  - Store Actions: `fetchStashes()`, `stashSave(message?: string)`, `stashPop(ref?: string)`, `stashApply(ref?: string)`, `stashDrop(ref?: string)`.
- **UI (`SourceControlPanel.tsx`)**:
  - Collapsible **STASHES** accordion section with stash count badge, showing list of stashes with apply, pop, and drop buttons.
  - Action items in the header `...` menu: "Stash Changes..." & "Pop Latest Stash".
  - Dedicated prompt modal for custom stash message.

---

### 1.2 Git Clone
- **Backend**:
  - `Clone(ctx, url, targetDir)`: Runs `git clone <url> <targetDir>`.
  - REST Endpoint: `POST /api/v1/git/clone` with `{ url: string, targetPath?: string, openWorkspace?: boolean }`.
  - If `openWorkspace === true`, automatically mounts cloned repository into `workspace.Manager`, recent projects, LSP, codegraph, and MCP.
- **Frontend**:
  - Store Action: `cloneRepo(url: string, targetDir?: string, openWorkspace?: boolean)`.
  - UI triggers:
    - In `SourceControlPanel.tsx` when no folder is open or no repository exists: "Clone Repository" button alongside folder picker / init repo.
    - In `...` dropdown menu: "Clone Repository...".
    - Interactive dialog modal prompting for Git Repository URL (HTTPS/SSH) and destination directory.

---

### 1.3 Graph Branch Context Menu Refinement (Option A + Bonus)
- **Refinement Target**:
  - Replace floating coordinate-based popover (`fixed` with screen `x, y`) with a container-anchored 3-dots button (`<Icon name="more" size={12} />`) + dropdown menu.
- **Trigger & Placement**:
  - Each commit row in the graph has a subtle 3-dots button (`opacity-60 group-hover:opacity-100 hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-[var(--color-surface-hover)]`) next to the timestamp.
  - Clicking the 3-dots button opens the dropdown menu anchored directly to the commit row (`absolute right-2 top-full mt-0.5 w-48 z-40`).
  - **Bonus Integration**: Right-clicking (`onContextMenu`) on the commit row also opens the same dropdown menu for that specific commit.
  - **Container Adaptation**: Styled 1:1 like the header's 3-dots menu (`rounded-md border border-[var(--color-line)] bg-[var(--color-surface-raised)] shadow-xl py-1 z-40 text-[11px] divide-y divide-[var(--color-line)] animate-in fade-in zoom-in-95 duration-100`), ensuring it never overflows outside the Source Control panel.
- **Menu Items (6 Aksi)**:
  1. **Checkout (`checkout`)**: Checks out the selected commit (detached HEAD) or branch if available.
  2. **Create Tag... (`create tag`)**: Opens create tag dialog prefilled / targeting this commit hash (`git tag -a <name> <hash> -m <msg>`).
  3. **Cherry Pick (`cherry pick`)**: Executes `git cherry-pick <hash>` with immediate status feedback / toast notification.
  4. **Compare With... (`compare with`)**: Sets commit as base for comparison or compares with active base commit.
  5. **Copy Commit Hash (`copy commit hash`)**: Copies full SHA (and short SHA) to clipboard with toast confirmation.
  6. **Copy Commit Message (`copy commit message`)**: Copies commit subject/message to clipboard with toast confirmation.
- **Backend Cherry-Pick & Target Tag Support**:
  - `CherryPick(ctx, hash)` in `server/internal/git/git.go` & `POST /api/v1/git/cherry-pick`.
  - `CreateTag` extended to accept optional `targetCommit` parameter.

---

### 1.4 Target Commit Selector (5 Latest Commits & Manual Validated Hash)
- **Applies to**:
  1. **Create Git Tag Modal**: User can tag either the 5 latest commits (defaulting to clicked commit or HEAD) or enter a manual valid commit hash.
  2. **Compare with... Modal**: When clicking "Compare with..." from commit 3-dots or header, opens modal displaying the Base commit and prompts to pick a Target commit (either from 5 latest commits or manual hash input) before running `compareCommits(base, target)`.
- **UI & Validation Criteria**:
  - Quick Select dropdown containing up to 5 latest commits (`[shortHash] message`).
  - Toggle or custom option to enter manual commit hash.
  - Regex validation for hexadecimal hash (`/^[0-9a-fA-F]{7,40}$/`).
  - Real-time feedback with zero emojis (only semantic icon/text).

---

### 1.5 Source Control Accordion Hierarchy Alignment
- **Problem**: Previously, `STAGED CHANGES` and `CHANGES` were sub-accordions nested deeply inside a parent `Source Control` accordion alongside the Commit box, while `STASHES` and `GRAPH` were top-level peer accordions.
- **Solution / Structure**:
  1. **Primary Commit Zone**: Directly below Repo Pill, always easily accessible for writing commit messages without needing to expand/collapse an outer container. Contains Conflict Alert Banner, Commit Textarea + AI Sparkle, and Split Commit Button.
  2. **Peer Accordion Sections** (All sharing identical header styling, height, chevron, and count badge):
     - `STAGED CHANGES ({stagedChanges.length})` with header unstage-all button (`close` icon). Only displayed if `stagedChanges.length > 0`.
     - `CHANGES ({gitChanges.length})` with header discard-all (`discard` icon) and stage-all (`add` icon) buttons.
     - `STASHES ({gitStashes.length})` with header stash (`add` icon) and pop latest (`arrow-up` icon) buttons.
     - `GRAPH ({gitCommits.length})` with graph timeline list and pagination.

---

### 1.6 Explorer File Timeline Refinement (Option 1 - Full Harmony)
- **Goal**: Elevate the Timeline section at the bottom of the Explorer panel to match the interactive UX, visual clarity, and styling standards of the Source Control Graph.
- **Backend Fix**:
  - In `server/internal/git/git.go` (`GetTimeline`): Fix `CommitNode` parsing so `Hash` receives `parts[0]` (full 40-character SHA) and `ShortHash` receives `parts[1]` (7-character short SHA), matching `GetLog` behavior.
- **Frontend Header & Actions**:
  - Section title: `TIMELINE` with chevron toggle.
  - Active file badge: Truncated active filename pill when a file is open, or general repository indicator when clean.
  - Count badge: Total timeline commits count badge `{timelineCommits.length}`.
  - Action buttons in header: Dedicated `Refresh Timeline` button (`<Icon name="refresh" size={12} />`) with loading state animation.
- **Visual Timeline Track**:
  - Vertical connector line (`w-0.5 bg-[var(--color-line)]`) connecting timeline dots.
  - Distinct commit node indicators (accent-filled for HEAD/latest, outlined for historical revisions).
  - Clear typography: Monospace short SHA, relative timestamp, commit subject, and author.
- **Interactive 3-Dots Dropdown & Right-Click Context Menu**:
  - Each timeline item includes a 3-dots menu button (`<Icon name="more" size={12} />`) shown on hover/active.
  - Both clicking the 3-dots button and right-clicking (`onContextMenu`) open a contained dropdown menu (`absolute right-2 top-7 w-48 z-40 bg-[var(--color-surface-raised)] border border-[var(--color-line)] shadow-xl rounded-md py-1`):
    1. **Open Changes** (`split` icon): Diffs the commit with the active working tree.
    2. **Compare with Previous** (`split` icon): Diffs this commit against the predecessor commit in history (`timelineCommits[index + 1]`).
    3. **Copy Commit Hash** (`copy` icon): Copies full SHA to clipboard with toast confirmation.
    4. **Copy Commit Message** (`file` icon): Copies commit message to clipboard with toast confirmation.
- **Guardrails**:
  - Strictly zero unicode emoticons/emojis in TSX, CSS, Go, or labels (exclusively SVG icons from `Icon.tsx`).
  - Semantic Tailwind tokens (`bg-surface-raised`, `border-line`, `text-ink`, `text-ink-muted`, `bg-accent`).
  - Outside-click & escape listener to close active dropdown menu cleanly.

---

## 2. Invariants & Guardrails
- **No Emojis / Emoticons in Code**: Sesuai instruksi mutlak user: *Zero unicode emoji/emoticons in TSX, CSS, Go, or UI labels*. Semua indikator visual dan menu item harus menggunakan primitif UI `<Icon name="..." size={...} />` dari `src/components/ui/Icon.tsx`.
- **Tailwind Tokens**: Use semantic tokens (`bg-surface-raised`, `border-line`, `text-ink`, `text-ink-muted`, `bg-accent`, etc.).
- **Zero-Error Verification Gate**: Must pass `npm run build`, `npm run format`, and `go test ./...`.
- **Anti-Lock Concurrency**: Non-blocking mutex locking in Go backend; handle `.git/index.lock` gracefully.
