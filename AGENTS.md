# AGENTS.md — AegisCode Agent Operating Guidelines

This file provides direct operational guidance for AI coding agents (Antigravity, Claude Code, Cursor, Copilot) working in this repository.

> **Objective**: Lightweight Web-Based IDE + Local Cross-Platform Go Server + Remote Tablet Companion  
> **Core Architecture**: Hybrid Layered Core with Out-of-Process Worker Supervision  
> **Prime Directive**: DO NOT OVER-ENGINEER. Keep all code lean, direct, and pragmatic.

---

## 1. Chain-of-Thought (COT) Execution with RTK

All agents MUST follow a disciplined Chain-of-Thought execution cycle:
1. **Analyze**: Understand the requirements and verify facts directly from the environment.
2. **Plan**: Formulate a concise step-by-step plan against project constraints.
3. **Execute**: Implement changes cleanly and modularly.
4. **Verify**: Run verification gates (`rtk npm run build` & `rtk npm run format`) to ensure zero errors.

### Mandatory Shell Invocation Rule (`rtk`)
AegisCode enforces the use of **RTK (Rust Token Killer)** (`~/.local/bin/rtk`) to compress terminal outputs before they enter the LLM context:
- **Always Prefix Commands**: Prefix every shell invocation with `rtk`:
  - `rtk git status`, `rtk git diff`, `rtk git log -n 5`
  - `rtk npm run build`, `rtk npm run format`
  - `rtk ls -la src/components/layout/`
  - `rtk cargo test`, `rtk go test ./...`
- **Strict Compound Chaining**: In compound commands (`&&`), prefix EVERY segment:
  - *Correct*: `rtk git add . && rtk git commit -m "feat: update"`
  - *Incorrect*: `rtk git add . && git commit -m "feat: update"`
- **Fallback Modes**:
  - Re-run with proxy mode if needed: `rtk proxy <command>`
  - Bypass raw execution if necessary: `RTK_DISABLED=1 <command>`

---

## 2. Core Development Constraints

### Frontend Constraints
1. **Reuse Tailwind Tokens**: All colors must use semantic tokens from [`src/styles/tokens.css`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/styles/tokens.css) via Tailwind CSS v4 (`bg-canvas`, `bg-surface`, `text-ink`, `border-line`, `bg-accent`, etc.). Zero hardcoded hex colors allowed in TSX/CSS.
2. **Reuse UI Primitives**: Atomic UI components (`Icon`, `IconButton`, `Toast`) must be reused from [`src/components/ui/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/ui/). Do not duplicate primitives.
3. **Co-locate CSS**: Each layout module in [`src/components/layout/<name>/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/src/components/layout) owns its CSS stylesheet.
4. **Preserve Selectors**: Maintain existing class names and layout selectors 1:1.

### Backend Constraints
1. **DO NOT Catch Errors Silently**: If an error occurs, break the function immediately and report the error explicitly. Never use empty catch/error blocks.
2. **DO NOT Write Spaghetti Error Handling**: Maintain exactly one clear, linear validation and error path per function.
3. **DO NOT Add Redundant Constants / Abstractions**: Check state mutability; avoid excessive wrapper classes, DDD boilerplate, or deep hexagonal layers. Keep packages flat in `server/internal/*`.
4. **Preserve `embed.FS` Fallback Stubs**: Always keep [`server/internal/web/dist/index.html`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/server/internal/web/dist/index.html) tracked in git so clean checkouts can compile Go code and pass backend tests without requiring a prior frontend build.
5. **Fail-Safe Process & Port Teardown**: Ensure all test runners, dev servers, and desktop wrappers clean up child process groups on exit (`SIGTERM` + `SIGKILL` watchdog). Never leave orphaned background processes locking TCP ports (`8080`, `8081`, `5173`).

---

## 3. Mandatory Verification Gates

Before completing any task touching the codebase, the agent MUST run and pass:
```bash
rtk npm run build    # Must pass with 0 errors
rtk npm run format   # Code formatting check with oxfmt
```

---

## 4. Documentation References (`@docs`)

For detailed technical specifications, architecture decisions, and design references, consult the dedicated documentation in [`docs/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs):

- **Folder Hierarchy & Responsibilities**: [`docs/architecture.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/architecture.md)
- **Active UI Design & Layout Modules**: [`docs/frontend.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/frontend.md)
- **Milestones & Phasing (Phase 1–9)**: [`docs/roadmap.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/roadmap.md)
- **Backend Endpoints, DAP & Pairing**: [`docs/feature-backend.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/feature-backend.md)
- **Feature Assessment & RFC Scorecard**: [`docs/report.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/report.md)
- **Installation, Build & Tablet Setup**: [`docs/installation.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/installation.md)
- **Architecture Decision Records**: [`docs/adr/`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/adr)
- **Skills & Engineering Workflow**: [`docs/skills.md`](file:///Users/aditwicaksono/Documents/Project-AI/AegisCodev2/docs/skills.md)

---

## Agent skills

### Issue tracker

Local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context (`GLOSSARY.md` and `docs/adr/` at repo root). See `docs/agents/domain.md`.
